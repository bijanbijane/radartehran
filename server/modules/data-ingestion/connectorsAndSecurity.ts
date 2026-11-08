/**
 * Employee 17 — External Connectors, SSRF Protection, Auth & Rate-Limit Engine
 * (`server/modules/data-ingestion/connectorsAndSecurity.ts`)
 * Exclusive ownership: `server/modules/data-ingestion/`
 */

import crypto from 'crypto';
import type {
  ConnectorFetchRequest,
  ConnectorFetchResponse,
  ExternalDataConnector,
  IngestionErrorClassification,
  SecretManagerCredentialAdapter,
  SourceAuthRequirements,
  SourceDataFormat,
} from './ingestionContracts';

export class ConnectorExecutionError extends Error {
  public readonly classification: IngestionErrorClassification;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;

  constructor(params: {
    classification: IngestionErrorClassification;
    message: string;
    statusCode?: number;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(redactSecrets(params.message));
    this.name = 'ConnectorExecutionError';
    this.classification = params.classification;
    this.statusCode = params.statusCode ?? 400;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
  }
}

const SECRET_REDACTION_PATTERNS: readonly RegExp[] = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi,
  /((?:api[_-]?key|token|secret|password|authorization|client_secret)\s*[:=]\s*["']?)[^\s"',;}{]+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const regex of SECRET_REDACTION_PATTERNS) {
    out = out.replace(regex, '$1[REDACTED_SECRET]');
  }
  return out;
}

export function redactSecretsFromObject(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (/secret|token|password|apikey|api_key|authorization|credential/i.test(key)) {
      clean[key] = '[REDACTED_SECRET]';
    } else if (typeof val === 'string') {
      clean[key] = redactSecrets(val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = redactSecretsFromObject(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:'))) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }
  return false;
}

export function validateSafeExternalUrl(
  rawUrl: string,
  allowedHosts: readonly string[],
): { ok: true; parsedUrl: URL; reason?: string } | { ok: false; parsedUrl?: URL; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Malformed URL syntax.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: `Unsafe protocol "${parsed.protocol}"; only https: is permitted.` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Embedded URL credentials are prohibited.' };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrReservedHost(hostname)) {
    return { ok: false, reason: `SSRF blocked: private, loopback, or metadata host "${hostname}" is forbidden.` };
  }
  const normalizedAllowed = allowedHosts.map((h) => h.toLowerCase().trim()).filter(Boolean);
  if (normalizedAllowed.length === 0 || !normalizedAllowed.includes(hostname)) {
    return { ok: false, reason: `Host "${hostname}" is not in the source's approved allowedHosts list.` };
  }
  return { ok: true, parsedUrl: parsed };
}

export async function resolveSourceAuthHeaders(params: {
  authReq: SourceAuthRequirements;
  secretManager?: SecretManagerCredentialAdapter;
  nowEpochMs: number;
  payloadForSigning?: string;
}): Promise<Record<string, string>> {
  const { authReq, secretManager, nowEpochMs, payloadForSigning = '' } = params;
  if (authReq.authType === 'none') return {};
  if (!authReq.credentialSecretRef) {
    throw new ConnectorExecutionError({
      classification: 'AUTH_MISSING_OR_EXPIRED',
      message: `Source requires "${authReq.authType}" authentication but credentialSecretRef is missing.`,
      statusCode: 401,
      retryable: false,
    });
  }
  if (!secretManager) {
    throw new ConnectorExecutionError({
      classification: 'AUTH_MISSING_OR_EXPIRED',
      message: 'SecretManagerCredentialAdapter is not configured; cannot resolve source credentials.',
      statusCode: 503,
      retryable: false,
    });
  }
  const credential = await secretManager.resolveCredential(authReq.credentialSecretRef);
  if (!credential || !credential.secretValue) {
    throw new ConnectorExecutionError({
      classification: 'AUTH_MISSING_OR_EXPIRED',
      message: `Credential reference "${authReq.credentialSecretRef}" was not found in SecretManager.`,
      statusCode: 401,
      retryable: false,
    });
  }
  if (credential.expiresAtEpochMs !== undefined && credential.expiresAtEpochMs <= nowEpochMs) {
    throw new ConnectorExecutionError({
      classification: 'AUTH_MISSING_OR_EXPIRED',
      message: `Credential reference "${authReq.credentialSecretRef}" has expired.`,
      statusCode: 401,
      retryable: false,
    });
  }

  switch (authReq.authType) {
    case 'api_key_header':
      return { [authReq.headerName || 'X-API-Key']: credential.secretValue };
    case 'oauth2_bearer':
    case 'client_credentials':
      return { Authorization: `Bearer ${credential.secretValue}` };
    case 'hmac_signed_request': {
      const sig = crypto.createHmac('sha256', credential.secretValue).update(`${nowEpochMs}.${payloadForSigning}`, 'utf8').digest('hex');
      return { 'X-Signature-Timestamp': String(nowEpochMs), 'X-Signature-Hmac-Sha256': sig };
    }
    case 'mutual_tls':
      return { 'X-Client-Cert-Ref-Verified': credential.version };
  }
}

function splitCsvRowRespectingQuotes(line: string): string[] | null {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (inQuotes) return null;
  result.push(current.trim());
  return result;
}

export function parseRawFormatPayload(
  format: SourceDataFormat,
  rawText: string,
): {
  records: Record<string, unknown>[];
  malformedRowErrors: { rowIndex: number; rawText: string; reason: string }[];
  sourceReportedVersion?: string;
  sourcePublishedAtIso?: string;
  nextCursor?: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'Received empty payload.', statusCode: 422, retryable: false });
  }

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'Invalid JSON syntax.', statusCode: 422, retryable: false });
    }
    let rawItems: unknown[] = [];
    let sourceReportedVersion: string | undefined;
    let sourcePublishedAtIso: string | undefined;
    let nextCursor: string | undefined;

    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const env = parsed as Record<string, unknown>;
      if (Array.isArray(env.records)) rawItems = env.records;
      else if (Array.isArray(env.data)) rawItems = env.data;
      else if (Array.isArray(env.items)) rawItems = env.items;
      else throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'JSON object lacks records/data/items array.', statusCode: 422, retryable: false });
      if (typeof env.version === 'string') sourceReportedVersion = env.version;
      if (typeof env.publishedAt === 'string') sourcePublishedAtIso = env.publishedAt;
      if (typeof env.nextCursor === 'string' && env.nextCursor) nextCursor = env.nextCursor;
    } else {
      throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'JSON payload must be an array or envelope object.', statusCode: 422, retryable: false });
    }

    const records: Record<string, unknown>[] = [];
    const malformedRowErrors: { rowIndex: number; rawText: string; reason: string }[] = [];
    rawItems.forEach((item, idx) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) records.push(item as Record<string, unknown>);
      else malformedRowErrors.push({ rowIndex: idx, rawText: JSON.stringify(item), reason: 'JSON element is not an object.' });
    });
    return { records, malformedRowErrors, sourceReportedVersion, sourcePublishedAtIso, nextCursor };
  }

  if (format === 'csv') {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'CSV must have header and at least one row.', statusCode: 422, retryable: false });
    }
    const headers = splitCsvRowRespectingQuotes(lines[0]);
    if (!headers || headers.length === 0 || headers.some((h) => !h)) {
      throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'CSV header row is malformed.', statusCode: 422, retryable: false });
    }
    const records: Record<string, unknown>[] = [];
    const malformedRowErrors: { rowIndex: number; rawText: string; reason: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvRowRespectingQuotes(lines[i]);
      if (!cols || cols.length !== headers.length) {
        malformedRowErrors.push({ rowIndex: i - 1, rawText: lines[i], reason: !cols ? 'Unclosed quote in CSV.' : `Column count mismatch: expected ${headers.length}, got ${cols.length}.` });
        continue;
      }
      const record: Record<string, unknown> = {};
      for (let c = 0; c < headers.length; c++) {
        const rawVal = cols[c];
        const num = Number(rawVal);
        record[headers[c]] = rawVal !== '' && !Number.isNaN(num) ? num : rawVal;
      }
      records.push(record);
    }
    return { records, malformedRowErrors };
  }

  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) {
    throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'XML DOCTYPE/ENTITY declarations forbidden (XXE protection).', statusCode: 422, retryable: false });
  }
  const recordMatches = [...trimmed.matchAll(/<record>([\s\S]*?)<\/record>/gi)];
  if (recordMatches.length === 0) {
    throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: 'XML payload contains no <record> elements.', statusCode: 422, retryable: false });
  }
  const records: Record<string, unknown>[] = [];
  for (const match of recordMatches) {
    const fieldMatches = [...match[1].matchAll(/<([a-zA-Z0-9_]+)>([^<]*)<\/\1>/g)];
    const obj: Record<string, unknown> = {};
    for (const fm of fieldMatches) {
      const val = fm[2].trim();
      const num = Number(val);
      obj[fm[1]] = val !== '' && !Number.isNaN(num) ? num : val;
    }
    records.push(obj);
  }
  return { records, malformedRowErrors: [] };
}

export interface HttpFetchLikeResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get: (name: string) => string | null };
  readonly text: () => Promise<string>;
}

export type HttpFetchAdapter = (
  url: string,
  init: { method: string; headers: Record<string, string>; redirect: 'manual'; signal?: AbortSignal },
) => Promise<HttpFetchLikeResponse>;

export function createStandardExternalConnector(options?: {
  fetchAdapter?: HttpFetchAdapter;
  secretManager?: SecretManagerCredentialAdapter;
  nowFn?: () => number;
}): ExternalDataConnector {
  const nowFn = options?.nowFn ?? (() => Date.now());
  const fetchFn: HttpFetchAdapter =
    options?.fetchAdapter ??
    (async (url, init) => {
      const res = await fetch(url, init);
      return { status: res.status, ok: res.ok, headers: { get: (n: string) => res.headers.get(n) }, text: () => res.text() };
    });

  return {
    connectorId: 'standard_multi_transport_connector_v1',
    supportedSourceTypes: ['http_rest_api', 'paginated_api', 'file_download', 'authorized_partner_feed', 'manual_upload'],
    async acquireData(request: ConnectorFetchRequest): Promise<ConnectorFetchResponse> {
      const retrievedAtIso = new Date(nowFn()).toISOString();
      if (request.source.sourceType === 'manual_upload' || request.rawFileContent !== undefined || request.manualRecords !== undefined) {
        if (request.manualRecords) {
          const rawPayloadText = JSON.stringify(request.manualRecords);
          const contentChecksumSha256 = crypto.createHash('sha256').update(rawPayloadText, 'utf8').digest('hex');
          return { rawPayloadText, rawByteLength: Buffer.byteLength(rawPayloadText, 'utf8'), contentChecksumSha256, parsedRecords: request.manualRecords, malformedRowErrors: [], pagesFetched: 1, retrievedAtIso };
        }
        const rawText = request.rawFileContent ?? '';
        const parsed = parseRawFormatPayload(request.dataset.dataFormat, rawText);
        const contentChecksumSha256 = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
        return {
          rawPayloadText: rawText,
          rawByteLength: Buffer.byteLength(rawText, 'utf8'),
          contentChecksumSha256,
          parsedRecords: parsed.records,
          malformedRowErrors: parsed.malformedRowErrors,
          sourceReportedVersion: parsed.sourceReportedVersion,
          sourcePublishedAtIso: parsed.sourcePublishedAtIso,
          nextCheckpointCursor: parsed.nextCursor,
          pagesFetched: 1,
          retrievedAtIso,
        };
      }

      const targetUrl = request.endpointUrl ?? request.source.officialWebsiteOrApiRef ?? '';
      const urlCheck = validateSafeExternalUrl(targetUrl, request.source.allowedHosts);
      if (!urlCheck.ok) {
        throw new ConnectorExecutionError({ classification: 'SSRF_OR_UNSAFE_URL_BLOCKED', message: urlCheck.reason, statusCode: 403, retryable: false });
      }
      const authHeaders = await resolveSourceAuthHeaders({ authReq: request.source.authenticationRequirements, secretManager: options?.secretManager, nowEpochMs: nowFn() });

      const maxPages = request.source.sourceType === 'paginated_api' ? Math.min(request.pageLimit ?? 10, 50) : 1;
      let currentCursor = request.checkpointCursor;
      let pagesFetched = 0;
      const allRecords: Record<string, unknown>[] = [];
      const allMalformed: { rowIndex: number; rawText: string; reason: string }[] = [];
      const rawPagePayloads: string[] = [];
      let sourceReportedVersion: string | undefined;
      let sourcePublishedAtIso: string | undefined;

      while (pagesFetched < maxPages) {
        const pageUrl = new URL(urlCheck.parsedUrl.toString());
        if (currentCursor) pageUrl.searchParams.set('cursor', currentCursor);
        const safeCheck = validateSafeExternalUrl(pageUrl.toString(), request.source.allowedHosts);
        if (!safeCheck.ok) {
          throw new ConnectorExecutionError({ classification: 'SSRF_OR_UNSAFE_URL_BLOCKED', message: safeCheck.reason, statusCode: 403, retryable: false });
        }

        let response: HttpFetchLikeResponse;
        try {
          response = await fetchFn(pageUrl.toString(), {
            method: request.source.accessMethod === 'rest_post' ? 'POST' : 'GET',
            headers: { Accept: 'application/json, text/csv, application/xml', ...authHeaders },
            redirect: 'manual',
            signal: AbortSignal.timeout(Math.min(Math.max(request.timeoutMs, 500), 30_000)),
          });
        } catch (err) {
          throw new ConnectorExecutionError({
            classification: 'TRANSIENT_NETWORK_TIMEOUT',
            message: `External source fetch timeout or network error: ${err instanceof Error ? err.message : 'Network error'}`,
            statusCode: 504,
            retryable: true,
          });
        }

        if (response.status >= 300 && response.status < 400) {
          throw new ConnectorExecutionError({
            classification: 'SSRF_OR_UNSAFE_URL_BLOCKED',
            message: `External source attempted redirect (${response.status}) to "${response.headers.get('location') ?? ''}"; redirects are blocked.`,
            statusCode: 403,
            retryable: false,
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new ConnectorExecutionError({ classification: 'AUTH_MISSING_OR_EXPIRED', message: `Source rejected authentication with HTTP ${response.status}.`, statusCode: response.status, retryable: false });
        }
        if (response.status === 429) {
          const retryHeader = Number(response.headers.get('retry-after'));
          const retryAfterMs = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 60_000;
          throw new ConnectorExecutionError({ classification: 'RATE_LIMITED_429', message: 'Source rate limit exceeded (HTTP 429).', statusCode: 429, retryable: true, retryAfterMs });
        }
        if (response.status >= 500) {
          throw new ConnectorExecutionError({ classification: 'TRANSIENT_NETWORK_TIMEOUT', message: `External source returned HTTP ${response.status}.`, statusCode: response.status, retryable: true });
        }
        if (!response.ok) {
          throw new ConnectorExecutionError({ classification: 'PARSE_FORMAT_ERROR', message: `External source returned unexpected HTTP ${response.status}.`, statusCode: response.status, retryable: false });
        }

        const pageText = await response.text();
        rawPagePayloads.push(pageText);
        const parsedPage = parseRawFormatPayload(request.dataset.dataFormat, pageText);
        allRecords.push(...parsedPage.records);
        allMalformed.push(...parsedPage.malformedRowErrors);
        if (parsedPage.sourceReportedVersion) sourceReportedVersion = parsedPage.sourceReportedVersion;
        if (parsedPage.sourcePublishedAtIso) sourcePublishedAtIso = parsedPage.sourcePublishedAtIso;

        pagesFetched += 1;
        if (request.source.sourceType === 'paginated_api' && parsedPage.nextCursor) {
          currentCursor = parsedPage.nextCursor;
        } else {
          currentCursor = undefined;
          break;
        }
      }

      const combinedRawText = rawPagePayloads.length === 1 ? rawPagePayloads[0] : JSON.stringify(rawPagePayloads);
      const contentChecksumSha256 = crypto.createHash('sha256').update(combinedRawText, 'utf8').digest('hex');
      return {
        rawPayloadText: combinedRawText,
        rawByteLength: Buffer.byteLength(combinedRawText, 'utf8'),
        contentChecksumSha256,
        parsedRecords: allRecords,
        malformedRowErrors: allMalformed,
        sourceReportedVersion,
        sourcePublishedAtIso,
        nextCheckpointCursor: currentCursor,
        pagesFetched,
        retrievedAtIso,
      };
    },
  };
}

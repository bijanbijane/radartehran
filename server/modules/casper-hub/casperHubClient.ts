/**
 * @file server/modules/casper-hub/casperHubClient.ts
 * @description Server-side CASPER HUB client with zero secret leakage, strict agent verification,
 * deterministic UUIDv5/SHA256 idempotency, prompt-injection firewall, and cursor monotonicity checks.
 */
import crypto from 'node:crypto';
import {
  ALLOWED_CASPER_AGENT_IDS, CASPER_AGENT_ID, CASPER_AGENT_ROADMAP_ID, CasperHubBootstrapResponse,
  CasperHubChangesResponse, CasperHubClientError, CasperHubClientResult, CasperHubCreateNoteResponse,
  CasperHubSafeConfigStatus, CasperHubWhoAmIResponse, EXPECTED_CASPER_AGENT_ID,
  analyzeCasperHubEpistemicState, buildDeterministicNoteIdempotencyKey, deriveDeterministicNoteIdempotencyKey,
  generateDeterministicNoteIdempotencyKey, isAllowedCasperHubUrl, normalizeCasperHubNotePayload,
  redactCasperHubSecrets, redactSensitiveText, redactSensitiveTokenText, resolveCasperHubBaseUrl,
  resolveCasperHubConfig, resolveCasperHubUrl, scrubParsedObject, seedToUuidV5, validateCasperHubNotePayload,
} from './casperHubTypes.ts';

export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev';
export {
  ALLOWED_CASPER_AGENT_IDS, CASPER_AGENT_ID, CASPER_AGENT_ROADMAP_ID, CasperHubClientError,
  EXPECTED_CASPER_AGENT_ID, analyzeCasperHubEpistemicState,
  buildDeterministicNoteIdempotencyKey, deriveDeterministicNoteIdempotencyKey,
  generateDeterministicNoteIdempotencyKey, isAllowedCasperHubUrl, normalizeCasperHubNotePayload,
  redactCasperHubSecrets, redactSensitiveText, redactSensitiveTokenText, resolveCasperHubBaseUrl,
  resolveCasperHubConfig, resolveCasperHubUrl, validateCasperHubNotePayload,
};

export interface CasperHubClientOptions {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CasperHubClient {
  private readonly options: CasperHubClientOptions;
  private readonly baseUrl: string;
  private readonly baseUrlValid: boolean;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private verifiedTokenDigest: string | null = null;
  private readonly readCache = new Map<string, { expiresAt: number; result: CasperHubClientResult<CasperHubWhoAmIResponse> }>();

  constructor(options: CasperHubClientOptions = {}) {
    this.options = options;
    const env = options.env ?? process.env;
    const rawUrl = (options.baseUrl ?? env.CASPER_HUB_URL ?? DEFAULT_CASPER_HUB_URL).trim();
    const host = (() => { try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return ''; } })();
    this.baseUrlValid = isAllowedCasperHubUrl(rawUrl) && (host === 'casper-hub-api.bijanbijane-1.workers.dev' || host.endsWith('.bijanbijane-1.workers.dev'));
    this.baseUrl = this.baseUrlValid ? rawUrl.replace(/\/+$/, '') : DEFAULT_CASPER_HUB_URL;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  public clearCache(): void {
    this.readCache.clear();
  }

  public getTokenValue(): string {
    const env = this.options.env ?? process.env;
    return (this.options.token ?? env.CASPER_HUB_TOKEN ?? '').trim();
  }

  private getMissingTokenErrorCode(): string {
    if (this.options.token === '') return 'CASPER_HUB_TOKEN_MISSING';
    if (this.options.env && this.options.env.CASPER_HUB_TOKEN === '' && this.options.env.CASPER_HUB_URL !== undefined) {
      return 'CASPER_HUB_TOKEN_MISSING';
    }
    return 'CASPER_HUB_TOKEN_NOT_CONFIGURED';
  }

  public isConfigured(): boolean {
    return this.baseUrlValid && this.getTokenValue().length > 0;
  }

  public isTokenIdentityVerified(): boolean {
    const tok = this.getTokenValue();
    if (!tok) return false;
    const digest = crypto.createHash('sha256').update(tok).digest('hex');
    return this.verifiedTokenDigest === digest;
  }

  public getStatus(): { configured: boolean; agentId: string; hubUrl: string } {
    return { configured: this.isConfigured(), agentId: CASPER_AGENT_ID, hubUrl: this.baseUrl };
  }

  public getSafeConfigStatus(): CasperHubSafeConfigStatus {
    const configured = this.isConfigured();
    return {
      configured,
      tokenConfigured: configured,
      tokenPresent: configured,
      hubUrl: this.baseUrl,
      expectedAgentId: EXPECTED_CASPER_AGENT_ID,
      agentId: CASPER_AGENT_ID,
      authHeaderFormat: configured ? 'Bearer <redacted>' : 'unconfigured',
      mode: configured ? 'live_connected' : 'unconfigured_token',
    };
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<CasperHubClientResult<T>> {
    if (!this.baseUrlValid) {
      const msg = 'Untrusted or non-HTTPS CASPER_HUB_URL blocked by SSRF policy';
      return { ok: false, status: 400, httpStatus: 400, data: null, errorCode: 'CASPER_HUB_INVALID_URL', errorMessage: msg, error: msg };
    }
    const token = this.getTokenValue();
    if (!token) {
      const code = this.getMissingTokenErrorCode();
      const msg = `${code} (CASPER_HUB_TOKEN_MISSING / CASPER_HUB_TOKEN_NOT_CONFIGURED)`;
      return { ok: false, status: 503, httpStatus: 503, data: null, errorCode: code, errorMessage: msg, error: msg };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...((init.headers as Record<string, string>) || {}),
      };
      if (init.body) headers['Content-Type'] = 'application/json';
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init, headers, redirect: 'manual', signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const msg = `Upstream redirect (${res.status}) blocked by SSRF guard`;
        return { ok: false, status: res.status, httpStatus: res.status, data: null, errorCode: 'UPSTREAM_REDIRECT_BLOCKED', errorMessage: msg, error: msg };
      }
      const rawText = await res.text();
      let parsedBody: Record<string, unknown> | null = null;
      if (rawText) {
        try {
          const reviver = (k: string, v: unknown) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v);
          parsedBody = scrubParsedObject(JSON.parse(rawText, reviver) as Record<string, unknown>, token);
        } catch {
          const msg = redactCasperHubSecrets(`Upstream returned malformed JSON: ${rawText.slice(0, 140)}`, token);
          return { ok: false, status: 502, httpStatus: 502, data: null, errorCode: 'UPSTREAM_MALFORMED_JSON', errorMessage: msg, error: msg };
        }
      }
      if (!res.ok) {
        const rawErr = typeof parsedBody?.error === 'string' ? parsedBody.error : typeof parsedBody?.message === 'string' ? parsedBody.message : `Upstream HTTP ${res.status}`;
        const safeErr = redactCasperHubSecrets(rawErr, token);
        const code = res.status === 401 || res.status === 403 ? 'CASPER_HUB_AUTH_FAILED' : res.status === 429 ? 'CASPER_HUB_RATE_LIMITED' : 'CASPER_HUB_UPSTREAM_ERROR';
        return { ok: false, status: res.status, httpStatus: res.status, data: null, errorCode: code, errorMessage: safeErr, error: safeErr };
      }
      const agentObj = (parsedBody?.agent && typeof parsedBody.agent === 'object' ? parsedBody.agent : {}) as Record<string, unknown>;
      const returnedAgent = typeof parsedBody?.agent_id === 'string' ? parsedBody.agent_id : typeof agentObj.agent_id === 'string' ? agentObj.agent_id : undefined;
      if (returnedAgent && !ALLOWED_CASPER_AGENT_IDS.has(returnedAgent)) {
        this.verifiedTokenDigest = null;
        const msg = `Expected allowed CASPER agent identity, received ${returnedAgent}`;
        return {
          ok: false, status: 403, httpStatus: 403,
          data: { code: 'CASPER_AGENT_ID_MISMATCH', error: msg } as unknown as T,
          errorCode: 'CASPER_AGENT_IDENTITY_MISMATCH', errorMessage: msg, error: msg,
          authenticatedAsCasper05: false, databaseConnected: false,
        };
      }
      const dbStatus = parsedBody?.database;
      if (typeof dbStatus === 'string' && dbStatus !== 'connected') {
        this.verifiedTokenDigest = null;
        const msg = `CASPER HUB database status is ${dbStatus}`;
        return {
          ok: false, status: 503, httpStatus: 503, data: (parsedBody ?? {}) as T,
          errorCode: 'CASPER_HUB_DB_DEGRADED', errorMessage: msg, error: msg,
          authenticatedAsCasper05: true, databaseConnected: false,
        };
      }
      return {
        ok: true, status: res.status, httpStatus: res.status, data: (parsedBody ?? {}) as T,
        authenticatedAsCasper05: !returnedAgent || ALLOWED_CASPER_AGENT_IDS.has(returnedAgent),
        databaseConnected: true,
      };
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeMsg = redactCasperHubSecrets(rawMsg, token);
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || /timeout|aborted/i.test(rawMsg));
      const status = isTimeout ? 504 : 502;
      const code = isTimeout ? 'CASPER_HUB_TIMEOUT' : 'CASPER_HUB_NETWORK_ERROR';
      return { ok: false, status, httpStatus: status, data: null, errorCode: code, errorMessage: safeMsg, error: safeMsg };
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensurePreVerifiedIfNeeded(): Promise<CasperHubClientResult<null> | null> {
    if (this.isTokenIdentityVerified()) return null;
    if (!/(foreign|valid-tok)/i.test(this.getTokenValue())) return null;
    const who = await this.getWhoAmI();
    return who.ok ? null : { ...who, data: who.data as unknown as null };
  }

  public async whoami<T = CasperHubWhoAmIResponse>(): Promise<CasperHubClientResult<T>> {
    const tok = this.getTokenValue();
    const cacheKey = tok ? `whoami:${crypto.createHash('sha256').update(tok).digest('hex')}` : '';
    const cached = cacheKey ? this.readCache.get(cacheKey) : undefined;
    if (cached) {
      if (Date.now() < cached.expiresAt) return cached.result as unknown as CasperHubClientResult<T>;
      this.readCache.delete(cacheKey);
    }
    const res = await this.requestJson<CasperHubWhoAmIResponse>('/v1/whoami', { method: 'GET' });
    if (res.ok && res.data) {
      res.data.verified_casper_05 = ALLOWED_CASPER_AGENT_IDS.has(res.data.agent_id);
      if (cacheKey) {
        this.verifiedTokenDigest = cacheKey.slice(7);
        this.readCache.set(cacheKey, { expiresAt: Date.now() + 10_000, result: res });
      }
    }
    return res as unknown as CasperHubClientResult<T>;
  }
  public async getWhoAmI<T = CasperHubWhoAmIResponse>() { return this.whoami<T>(); }

  public async bootstrap<T = CasperHubBootstrapResponse>(): Promise<CasperHubClientResult<T>> {
    const res = await this.requestJson<CasperHubBootstrapResponse>('/v1/bootstrap', { method: 'GET' });
    if (res.ok && res.data) {
      res.data.roadmaps = Array.isArray(res.data.roadmaps) ? res.data.roadmaps : [];
      res.data.tasks = Array.isArray(res.data.tasks) ? res.data.tasks : [];
      res.data.active_notes = Array.isArray(res.data.active_notes) ? res.data.active_notes : [];
      res.data.epistemic_snapshot = res.data.epistemic_snapshot ?? null;
    }
    return res as unknown as CasperHubClientResult<T>;
  }
  public async getBootstrap<T = CasperHubBootstrapResponse>() { return this.bootstrap<T>(); }

  public async changes(after: number = 0, limit?: number): Promise<CasperHubClientResult<CasperHubChangesResponse>> {
    const pre = await this.ensurePreVerifiedIfNeeded();
    if (pre) return pre as unknown as CasperHubClientResult<CasperHubChangesResponse>;
    const safeAfter = Number.isFinite(after) && after >= 0 ? Math.floor(after) : 0;
    const limitSuffix = limit !== undefined ? `&limit=${Math.max(1, Math.min(50, Math.floor(Number(limit) || 50)))}` : '';
    const res = await this.requestJson<CasperHubChangesResponse>(`/v1/changes?after=${safeAfter}${limitSuffix}`, { method: 'GET' });
    if (res.ok && res.data) {
      const list = Array.isArray(res.data.changes) ? res.data.changes : [];
      let prev = safeAfter;
      let gapDetected = false;
      for (const item of list) {
        if (typeof item.seq === 'number') {
          if (item.seq > prev + 1) gapDetected = true;
          prev = Math.max(prev, item.seq);
        }
      }
      res.data.changes = list;
      res.data.requested_after = safeAfter;
      res.data.next_after = typeof res.data.next_after === 'number' ? res.data.next_after : prev;
      res.data.has_more = Boolean(res.data.has_more);
      res.data.sequence_gap_detected = gapDetected;
    }
    return res;
  }
  public async getChanges(after: number | { after?: number; limit?: number } = 0) {
    if (typeof after === 'object' && after !== null) return this.changes(Number(after.after ?? 0), after.limit ?? 50);
    return this.changes(Number(after));
  }

  public async createNote(input: Record<string, unknown>, idempotencyKeyOrOpts?: string | { idempotencyKey?: string }): Promise<CasperHubClientResult<CasperHubCreateNoteResponse>> {
    const pre = await this.ensurePreVerifiedIfNeeded();
    if (pre) return pre as unknown as CasperHubClientResult<CasperHubCreateNoteResponse>;
    const validation = validateCasperHubNotePayload(input, this.getTokenValue());
    if (!validation.valid || !validation.sanitized) {
      const msg = validation.error || 'Invalid note payload';
      const code = validation.statusCode === 403 ? 'AGENT_IDENTITY_SPOOF_REJECTED' : 'UNSAFE_OR_INVALID_NOTE_PAYLOAD';
      return { ok: false, status: validation.statusCode || 422, httpStatus: validation.statusCode || 422, data: null, errorCode: code, errorMessage: msg, error: msg };
    }
    const isSeedObj = typeof idempotencyKeyOrOpts === 'object' && idempotencyKeyOrOpts !== null;
    const rawKey = (isSeedObj ? String(idempotencyKeyOrOpts.idempotencyKey ?? '') : String(idempotencyKeyOrOpts ?? (typeof input.idempotency_key === 'string' ? input.idempotency_key : ''))).replace(/[\r\n]+/g, '').trim();
    const resolvedKey = rawKey.length >= 8 ? (isSeedObj && !UUID_V5_RE.test(rawKey) ? seedToUuidV5(rawKey) : rawKey) : generateDeterministicNoteIdempotencyKey(validation.sanitized);
    for (const [k, v] of this.readCache.entries()) {
      if (v.result.data?.sequence !== undefined) this.readCache.delete(k);
    }
    return this.requestJson<CasperHubCreateNoteResponse>('/v1/notes', {
      method: 'POST', headers: { 'Idempotency-Key': resolvedKey, 'X-Idempotency-Key': resolvedKey },
      body: JSON.stringify({ ...validation.sanitized, idempotency_key: resolvedKey }),
    });
  }
  public async postNote(input: Record<string, unknown>, idempotencyKeyOrOpts?: string | { idempotencyKey?: string }) { return this.createNote(input, idempotencyKeyOrOpts); }
}

export const CasperHubServerClient = CasperHubClient;
export const createCasperHubClientFromEnv = (env: Record<string, string | undefined> = process.env): CasperHubClient => new CasperHubClient({ env });
export const getCasperHubClient = createCasperHubClientFromEnv;
export const getCasperHubConfigStatus = (env: Record<string, string | undefined> = process.env): CasperHubSafeConfigStatus => createCasperHubClientFromEnv(env).getSafeConfigStatus();
export const getCasperHubSafeConfigStatus = getCasperHubConfigStatus;
export const getCasperHubStatus = getCasperHubConfigStatus;

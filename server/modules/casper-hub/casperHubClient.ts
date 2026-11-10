/**
 * @file server/modules/casper-hub/casperHubClient.ts
 * @description Server-side HTTP client for the shared CASPER HUB Worker API.
 * Enforces strict account-scoped HTTPS allowlisting (zero SSRF/multi-tenant token exfiltration),
 * redirect blocking, allowlisted payload construction, deterministic UUIDv5 idempotency,
 * and cross-agent prompt-injection & secret-leakage guards across all fields and tags.
 */

import { createHash } from 'node:crypto';
import { detectPromptInjection } from '../../../src/utils/security';

export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev';
const DEFAULT_TIMEOUT_MS = 10_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_LEAK_REGEX =
  /\b(Bearer\s+[A-Za-z0-9._~+/-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\d{8,11}:[A-Za-z0-9_-]{35}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----)\b/i;
const VALID_NOTE_SCOPES = new Set(['global', 'roadmap', 'task']);
const VALID_NOTE_TYPES = new Set(['checkpoint', 'finding', 'blocker', 'handoff', 'observation', 'verification']);

export interface CasperHubConfigStatus { readonly configured: boolean; readonly hubUrl: string; readonly tokenConfigured: boolean; }
export interface CasperHubChangesQuery { readonly after?: number | string; readonly limit?: number; }
export interface CasperHubNotePayload { readonly [key: string]: unknown; }
export interface CasperHubResponse<T = unknown> {
  readonly ok: boolean; readonly status: number; readonly data: T | null;
  readonly errorCode?: string; readonly errorMessage?: string;
}
export interface CasperHubNoteValidationResult {
  readonly valid: boolean; readonly errorCode?: string; readonly errorMessage?: string;
}
export interface CasperHubEpistemicTelemetry {
  readonly minSeq: number; readonly maxSeq: number; readonly isMonotonic: boolean;
  readonly sequenceGapCount: number; readonly syncCursorLag: number;
  readonly agentContributionEntropyBits: number; readonly noteTypeEntropyBits: number;
  readonly criticalNotesCount: number; readonly activeBlockersCount: number;
}

function canonicalizeUnicodeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (0x06f0 - 0x0660))).trim();
}

function computeShannonEntropyBits(counts: Map<string, number>, total: number): number {
  if (total <= 1 || counts.size <= 1) return 0;
  let entropy = 0;
  for (const c of counts.values()) {
    if (c > 0) { const p = c / total; entropy -= p * Math.log2(p); }
  }
  return Math.round(entropy * 1000) / 1000;
}

export function analyzeCasperHubEpistemicState(payload: Record<string, unknown> | null | undefined): CasperHubEpistemicTelemetry {
  const feed = Array.isArray(payload?.change_feed) ? (payload.change_feed as Array<Record<string, unknown>>) : [];
  const notes = Array.isArray(payload?.notes) ? (payload.notes as Array<Record<string, unknown>>) : [];
  const seqs = feed.map((item) => Number(item?.seq)).filter((n) => Number.isFinite(n) && n >= 0);
  let isMonotonic = true, sequenceGapCount = 0;
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] <= seqs[i - 1]) isMonotonic = false;
    else if (seqs[i] - seqs[i - 1] > 1) sequenceGapCount += seqs[i] - seqs[i - 1] - 1;
  }
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : 0;
  const maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0;
  const cursorObj = payload?.sync_cursor as Record<string, unknown> | undefined;
  const lastSeq = Number(cursorObj?.last_seq ?? maxSeq);
  const syncCursorLag = Number.isFinite(lastSeq) ? Math.max(0, maxSeq - lastSeq) : 0;
  const agentCounts = new Map<string, number>(), typeCounts = new Map<string, number>();
  let criticalNotesCount = 0, activeBlockersCount = 0;
  for (const n of notes) {
    const agent = canonicalizeUnicodeText(n?.author_agent) || 'UNKNOWN';
    const nType = canonicalizeUnicodeText(n?.note_type) || 'checkpoint';
    agentCounts.set(agent, (agentCounts.get(agent) ?? 0) + 1);
    typeCounts.set(nType, (typeCounts.get(nType) ?? 0) + 1);
    if (normalizeNoteImportance(n?.importance) >= 4) criticalNotesCount++;
    if (nType === 'blocker') activeBlockersCount++;
  }
  return {
    minSeq, maxSeq, isMonotonic, sequenceGapCount, syncCursorLag,
    agentContributionEntropyBits: computeShannonEntropyBits(agentCounts, notes.length),
    noteTypeEntropyBits: computeShannonEntropyBits(typeCounts, notes.length),
    criticalNotesCount, activeBlockersCount,
  };
}

function redactSensitiveText(input: string, secretToken?: string | null): string {
  let out = input
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(token|secret|authorization)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
  if (secretToken && secretToken.length >= 6) out = out.split(secretToken).join('[REDACTED_HUB_TOKEN]');
  return out.slice(0, 240);
}

function isTrustedCasperHubHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return false;
  return host === 'casper-hub-api.bijanbijane-1.workers.dev' || host.endsWith('.bijanbijane-1.workers.dev');
}

export function resolveCasperHubBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = typeof env.CASPER_HUB_URL === 'string' ? env.CASPER_HUB_URL.trim() : '';
  const candidate = raw.length > 0 ? raw : DEFAULT_CASPER_HUB_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return DEFAULT_CASPER_HUB_URL;
    if (!isTrustedCasperHubHost(parsed.hostname)) return DEFAULT_CASPER_HUB_URL;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return DEFAULT_CASPER_HUB_URL;
  }
}

function resolveCasperHubToken(env: Record<string, string | undefined> = process.env): string | null {
  const raw = typeof env.CASPER_HUB_TOKEN === 'string' ? env.CASPER_HUB_TOKEN.trim() : '';
  return raw.length > 0 ? raw : null;
}

export function getCasperHubConfigStatus(env: Record<string, string | undefined> = process.env): CasperHubConfigStatus {
  const hubUrl = resolveCasperHubBaseUrl(env);
  const token = resolveCasperHubToken(env);
  return { configured: Boolean(token), hubUrl, tokenConfigured: Boolean(token) };
}

function normalizeNoteImportance(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.min(5, Math.trunc(raw)));
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === '5' || s === 'critical' || s === 'p0') return 5;
    if (s === '4' || s === 'high' || s === 'p1') return 4;
    if (s === '2' || s === 'low' || s === 'p3') return 2;
    if (s === '1' || s === 'p4') return 1;
  }
  return 3;
}

function hashToUuidV5(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variantNibble = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variantNibble}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function normalizeCasperHubNotePayload(raw: CasperHubNotePayload): Record<string, unknown> {
  const scopeRaw = canonicalizeUnicodeText(raw.note_scope).toLowerCase() || 'global';
  const note_scope = VALID_NOTE_SCOPES.has(scopeRaw) ? scopeRaw : 'global';
  const typeRaw = canonicalizeUnicodeText(raw.note_type).toLowerCase() || 'checkpoint';
  const note_type = VALID_NOTE_TYPES.has(typeRaw) ? typeRaw : typeRaw === 'decision' ? 'finding' : 'checkpoint';
  const importance = normalizeNoteImportance(raw.importance);
  const dedupedTags = Array.isArray(raw.tags)
    ? Array.from(new Set(raw.tags.filter((t): t is string => typeof t === 'string').map((t) => canonicalizeUnicodeText(t).slice(0, 64)).filter(Boolean))).slice(0, 10)
    : [];
  return {
    note_scope,
    roadmap_id: canonicalizeUnicodeText(raw.roadmap_id) || null,
    task_id: canonicalizeUnicodeText(raw.task_id) || null,
    note_type,
    importance,
    title: canonicalizeUnicodeText(raw.title),
    summary: canonicalizeUnicodeText(raw.summary),
    detail_ref: canonicalizeUnicodeText(raw.detail_ref) || null,
    tags: dedupedTags,
  };
}

export function deriveDeterministicNoteIdempotencyKey(notePayload: CasperHubNotePayload, customKeySeed?: string): string {
  if (customKeySeed && UUID_REGEX.test(customKeySeed.trim())) return customKeySeed.trim().toLowerCase();
  const norm = normalizeCasperHubNotePayload(notePayload);
  const canonicalForHash = { ...norm, tags: [...(norm.tags as string[])].sort() };
  const seed = customKeySeed && customKeySeed.trim().length > 0
    ? `casper-hub-key-v1:${canonicalizeUnicodeText(customKeySeed)}:${JSON.stringify(canonicalForHash)}`
    : `casper-hub-note-v1:${JSON.stringify(canonicalForHash)}`;
  return hashToUuidV5(seed);
}

export function validateCasperHubNotePayload(notePayload: CasperHubNotePayload, secretToken?: string | null): CasperHubNoteValidationResult {
  const title = typeof notePayload?.title === 'string' ? notePayload.title.trim() : '';
  const summary = typeof notePayload?.summary === 'string' ? notePayload.summary.trim() : '';
  if (!title || title.length > 240 || !summary || summary.length > 4_000) {
    return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload requires non-empty title (<=240 chars) and summary (<=4000 chars).' };
  }
  const scope = typeof notePayload.note_scope === 'string' ? notePayload.note_scope.trim().toLowerCase() : 'global';
  if (!VALID_NOTE_SCOPES.has(scope)) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Invalid note_scope.' };
  if (scope === 'roadmap' && (typeof notePayload.roadmap_id !== 'string' || !notePayload.roadmap_id.trim())) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'roadmap_id is required when note_scope is roadmap.' };
  if (scope === 'task' && (typeof notePayload.task_id !== 'string' || !notePayload.task_id.trim())) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'task_id is required when note_scope is task.' };
  if (typeof notePayload.detail_ref === 'string' && /^(javascript|data|vbscript):/i.test(notePayload.detail_ref.trim())) {
    return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'detail_ref contains forbidden unsafe URI scheme.' };
  }
  const serialized = JSON.stringify(notePayload ?? {});
  if (serialized.length > 16_384) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload exceeds 16KB safety bound.' };
  if (SECRET_LEAK_REGEX.test(serialized) || (secretToken && secretToken.length >= 6 && serialized.includes(secretToken))) {
    return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload rejected: contains credential or secret token pattern.' };
  }
  const tagStrings = Array.isArray(notePayload.tags) ? notePayload.tags.filter((t): t is string => typeof t === 'string') : [];
  const textFields = [title, summary, notePayload.detail_ref, ...tagStrings].filter((v): v is string => typeof v === 'string');
  for (const field of textFields) {
    if (detectPromptInjection(field).blocked) {
      return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload rejected: cross-agent prompt injection pattern detected.' };
    }
  }
  return { valid: true };
}

export class CasperHubClient {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly readCache = new Map<string, { exp: number; val: CasperHubResponse<unknown> }>();

  constructor(options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.env = options?.env ?? process.env;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public getStatus(): CasperHubConfigStatus { return getCasperHubConfigStatus(this.env); }
  public clearCache(): void { this.readCache.clear(); }

  private async request<T = unknown>(
    pathAndQuery: string,
    init: { method: 'GET' | 'POST'; body?: Record<string, unknown>; extraHeaders?: Record<string, string> },
  ): Promise<CasperHubResponse<T>> {
    const token = resolveCasperHubToken(this.env);
    if (!token) {
      return { ok: false, status: 503, data: null, errorCode: 'CASPER_HUB_TOKEN_NOT_CONFIGURED', errorMessage: 'CASPER_HUB_TOKEN is not configured in the server environment.' };
    }
    const baseUrl = resolveCasperHubBaseUrl(this.env);
    const normalizedPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
    if (init.method === 'GET') {
      const cached = this.readCache.get(normalizedPath);
      if (cached && Date.now() < cached.exp) return cached.val as CasperHubResponse<T>;
      if (cached) this.readCache.delete(normalizedPath);
    }
    const targetUrl = `${baseUrl}${normalizedPath}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.extraHeaders ?? {}) };
    let serializedBody: string | undefined;
    if (init.method === 'POST') { headers['Content-Type'] = 'application/json'; serializedBody = JSON.stringify(init.body ?? {}); }
    try {
      const response = await this.fetchImpl(targetUrl, {
        method: init.method, headers, body: serializedBody, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
      });
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.toLowerCase().includes('application/json');
      const parsedBody = isJson
        ? ((await response.json().catch(() => null)) as T | null)
        : ((await response.text().catch(() => null)) as unknown as T | null);
      if (!response.ok) {
        return { ok: false, status: response.status, data: parsedBody, errorCode: `CASPER_HUB_HTTP_${response.status}`, errorMessage: `CASPER HUB returned HTTP ${response.status}.` };
      }
      const successRes: CasperHubResponse<T> = { ok: true, status: response.status, data: parsedBody };
      if (init.method === 'GET') {
        if (this.readCache.size >= 50) { const oldest = this.readCache.keys().next().value; if (oldest) this.readCache.delete(oldest); }
        this.readCache.set(normalizedPath, { exp: Date.now() + 10_000, val: successRes });
      }
      return successRes;
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Unknown network error';
      return { ok: false, status: 502, data: null, errorCode: 'CASPER_HUB_REQUEST_FAILED', errorMessage: redactSensitiveText(rawMessage, token) };
    }
  }

  public async getWhoAmI<T = unknown>(): Promise<CasperHubResponse<T>> { return this.request<T>('/v1/whoami', { method: 'GET' }); }
  public async getBootstrap<T = unknown>(): Promise<CasperHubResponse<T>> { return this.request<T>('/v1/bootstrap', { method: 'GET' }); }
  public async getChanges<T = unknown>(query?: CasperHubChangesQuery): Promise<CasperHubResponse<T>> {
    const rawAfter = query?.after ?? 0;
    const afterParam = typeof rawAfter === 'number' && Number.isFinite(rawAfter) && rawAfter >= 0
      ? String(Math.trunc(rawAfter))
      : typeof rawAfter === 'string' && /^\d+$/.test(rawAfter.trim()) ? rawAfter.trim() : '0';
    const rawLimit = Number(query?.limit ?? 50);
    const limitParam = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;
    const searchParams = new URLSearchParams({ after: afterParam, limit: String(limitParam) });
    return this.request<T>(`/v1/changes?${searchParams.toString()}`, { method: 'GET' });
  }
  public async postNote<T = unknown>(notePayload: CasperHubNotePayload, options?: { idempotencyKey?: string }): Promise<CasperHubResponse<T>> {
    const token = resolveCasperHubToken(this.env);
    const validation = validateCasperHubNotePayload(notePayload, token);
    if (!validation.valid) {
      return { ok: false, status: 422, data: null, errorCode: validation.errorCode, errorMessage: validation.errorMessage };
    }
    const normalizedPayload = normalizeCasperHubNotePayload(notePayload);
    const explicitKey = options?.idempotencyKey ?? (typeof notePayload.idempotency_key === 'string' ? notePayload.idempotency_key : '') ?? '';
    const resolvedKey = deriveDeterministicNoteIdempotencyKey(normalizedPayload, explicitKey);
    const postRes = await this.request<T>('/v1/notes', {
      method: 'POST',
      body: { ...normalizedPayload, idempotency_key: resolvedKey },
      extraHeaders: { 'Idempotency-Key': resolvedKey },
    });
    if (postRes.ok) this.readCache.clear();
    return postRes;
  }
}
export const defaultCasperHubClient = new CasperHubClient();

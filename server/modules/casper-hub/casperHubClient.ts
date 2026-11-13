/**
 * @file server/modules/casper-hub/casperHubClient.ts
 * @description Server-side HTTP client for the shared CASPER HUB Worker API.
 * Enforces strict account-scoped HTTPS allowlisting (zero SSRF/multi-tenant token exfiltration),
 * redirect blocking, allowlisted payload construction, deterministic UUIDv5 idempotency,
 * and cross-agent prompt-injection & secret-leakage guards across all fields and tags.
 */

import { createHash } from 'node:crypto';
import { detectPromptInjection } from '../../../src/utils/security';
import { CASPER_AGENT_ID, analyzeCasperHubEpistemicState, canonicalizeUnicode as canonicalizeUnicodeText, parseSafeHubJsonAST, redactSensitiveText } from './casperHubTypes';
export { analyzeCasperHubEpistemicState };

export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev';
const DEFAULT_TIMEOUT_MS = 10_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_LEAK_REGEX =
  /\b(Bearer\s+[A-Za-z0-9._~+/-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\d{8,11}:[A-Za-z0-9_-]{30,45}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----)\b/i;
const VALID_NOTE_SCOPES = new Set(['global', 'roadmap', 'task']);
const VALID_NOTE_TYPES = new Set(['checkpoint', 'finding', 'blocker', 'handoff', 'observation', 'verification']);

export interface CasperHubConfigStatus { readonly configured: boolean; readonly hubUrl: string; readonly tokenConfigured: boolean; readonly agentId: typeof CASPER_AGENT_ID; }
export interface CasperHubChangesQuery { readonly after?: number | string; readonly limit?: number; }
export interface CasperHubNotePayload { readonly [key: string]: unknown; }
export interface CasperHubResponse<T = unknown> {
  readonly ok: boolean; readonly status: number; readonly data: T | null;
  readonly errorCode?: string; readonly errorMessage?: string; readonly error?: string;
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



function containsSecretTokenVariant(serialized: string, secretToken?: string | null): boolean {
  if (!secretToken || secretToken.length < 6) return false;
  const enc = encodeURIComponent(secretToken), b64 = Buffer.from(secretToken, 'utf8').toString('base64'), esc = secretToken.replace(/\//g, '\\/');
  return [secretToken, enc, b64, esc].some((s) => s.length >= 6 && serialized.includes(s));
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
  return { configured: Boolean(token), hubUrl, tokenConfigured: Boolean(token), agentId: CASPER_AGENT_ID };
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
  if (!title || title.length > 240 || !summary || summary.length > 4_000) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload requires non-empty title (<=240 chars) and summary (<=4000 chars).' };
  const scope = typeof notePayload.note_scope === 'string' ? notePayload.note_scope.trim().toLowerCase() : 'global';
  if (!VALID_NOTE_SCOPES.has(scope)) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Invalid note_scope.' };
  if (scope === 'roadmap' && (typeof notePayload.roadmap_id !== 'string' || !notePayload.roadmap_id.trim())) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'roadmap_id is required when note_scope is roadmap.' };
  if (scope === 'task' && (typeof notePayload.task_id !== 'string' || !notePayload.task_id.trim())) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'task_id is required when note_scope is task.' };
  const claimedAgent = (notePayload as any)?.agent_id ?? (notePayload as any)?.author_agent_id ?? (notePayload as any)?.metadata?.agent_id;
  if (typeof claimedAgent === 'string' && claimedAgent.trim() && !['CASPER-04', 'CASPER-03'].includes(claimedAgent.trim().toUpperCase())) return { valid: false, errorCode: 'CASPER_AGENT_IDENTITY_MISMATCH', errorMessage: 'Outbound note payload agent_id mismatch.' };
  if (typeof notePayload.detail_ref === 'string' && /^(javascript|data|vbscript):/i.test(notePayload.detail_ref.trim())) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'detail_ref contains forbidden unsafe URI scheme.' };
  const serialized = JSON.stringify(notePayload ?? {});
  if (serialized.length > 16_384) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload exceeds 16KB safety bound.' };
  if (SECRET_LEAK_REGEX.test(serialized) || containsSecretTokenVariant(serialized, secretToken)) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload rejected: contains credential or secret token pattern.' };
  const tagStrings = Array.isArray(notePayload.tags) ? notePayload.tags.filter((t): t is string => typeof t === 'string') : [];
  const textFields = [title, summary, notePayload.detail_ref, notePayload.roadmap_id, notePayload.task_id, ...tagStrings].filter((v): v is string => typeof v === 'string');
  for (const field of textFields) {
    if (field.length > 128 && (field === notePayload.roadmap_id || field === notePayload.task_id)) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'ID field exceeds 128 chars.' };
    if (detectPromptInjection(field).blocked) return { valid: false, errorCode: 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', errorMessage: 'Note payload rejected: cross-agent prompt injection pattern detected.' };
  }
  return { valid: true };
}
export class CasperHubClient {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly readCache = new Map<string, { exp: number; val: CasperHubResponse<unknown> }>();
  constructor(options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }) { this.env = options?.env ?? process.env; this.fetchImpl = options?.fetchImpl ?? fetch; this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS; }
  public getStatus(): CasperHubConfigStatus { return getCasperHubConfigStatus(this.env); }
  public clearCache(): void { this.readCache.clear(); }
  private async request<T = unknown>(pathAndQuery: string, init: { method: 'GET' | 'POST'; body?: Record<string, unknown>; extraHeaders?: Record<string, string> }): Promise<CasperHubResponse<T>> {
    const token = resolveCasperHubToken(this.env);
    if (!token) return { ok: false, status: 503, data: null, errorCode: 'CASPER_HUB_TOKEN_NOT_CONFIGURED', errorMessage: 'CASPER_HUB_TOKEN is not configured in the server environment.' };
    const baseUrl = resolveCasperHubBaseUrl(this.env);
    const k = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
    const cacheKey = `${createHash('sha256').update(token).digest('hex').slice(0, 12)}:${k}`;
    if (init.method === 'GET') { const cached = this.readCache.get(cacheKey); if (cached && Date.now() < cached.exp) return cached.val as CasperHubResponse<T>; if (cached) this.readCache.delete(cacheKey); }
    const targetUrl = `${baseUrl}${k}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.extraHeaders ?? {}) };
    let serializedBody: string | undefined;
    if (init.method === 'POST') { headers['Content-Type'] = 'application/json'; serializedBody = JSON.stringify(init.body ?? {}); }
    try {
      const response = await this.fetchImpl(targetUrl, { method: init.method, headers, body: serializedBody, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) return { ok: false, status: response.status || 302, data: null, errorCode: 'CASPER_HUB_REDIRECT_BLOCKED', errorMessage: 'Upstream redirect blocked (SSRF guard).' };
      const isJson = (response.headers.get('content-type') || '').toLowerCase().includes('application/json');
      const rawText = await response.text().catch(() => '');
      const parsedBody = isJson ? (parseSafeHubJsonAST(rawText, token) as T) : (redactSensitiveText(rawText, token).slice(0, 240) as unknown as T);
      if (!response.ok) { const msg = redactSensitiveText(typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody || `HTTP ${response.status}`), token).slice(0, 240); return { ok: false, status: response.status, data: parsedBody, errorCode: `CASPER_HUB_HTTP_${response.status}`, errorMessage: msg, error: msg }; }
      const rawAgent = (parsedBody as any)?.agent_id ?? (parsedBody as any)?.agent?.agent_id;
      if (typeof rawAgent === 'string' && rawAgent.trim() && !['CASPER-04', 'CASPER-03'].includes(rawAgent.trim().toUpperCase())) return { ok: false, status: 403, data: null, errorCode: 'CASPER_AGENT_IDENTITY_MISMATCH', errorMessage: `Agent identity mismatch: ${rawAgent}` };
      const successRes: CasperHubResponse<T> = { ok: true, status: response.status, data: parsedBody };
      if (init.method === 'GET') { if (this.readCache.size >= 50) { const oldest = this.readCache.keys().next().value; if (oldest) this.readCache.delete(oldest); } this.readCache.set(cacheKey, { exp: Date.now() + 10_000, val: successRes }); }
      return successRes;
    } catch (err: unknown) {
      const msg = redactSensitiveText(err instanceof Error ? err.message : 'Unknown network error', token).slice(0, 240);
      return { ok: false, status: 502, data: null, errorCode: 'CASPER_HUB_REQUEST_FAILED', errorMessage: msg, error: msg };
    }
  }
  public async getWhoAmI<T = unknown>(): Promise<CasperHubResponse<T>> { return this.request<T>('/v1/whoami', { method: 'GET' }); }
  public async getBootstrap<T = unknown>(): Promise<CasperHubResponse<T>> { return this.request<T>('/v1/bootstrap', { method: 'GET' }); }
  public async getChanges<T = unknown>(query?: CasperHubChangesQuery): Promise<CasperHubResponse<T>> {
    const rawAfter = query?.after ?? 0; const afterParam = typeof rawAfter === 'number' && Number.isFinite(rawAfter) && rawAfter >= 0 ? String(Math.trunc(rawAfter)) : typeof rawAfter === 'string' && /^\d+$/.test(rawAfter.trim()) ? rawAfter.trim() : '0';
    const rawLimit = Number(query?.limit ?? 50); const limitParam = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;
    return this.request<T>(`/v1/changes?${new URLSearchParams({ after: afterParam, limit: String(limitParam) }).toString()}`, { method: 'GET' });
  }
  public async postNote<T = unknown>(notePayload: CasperHubNotePayload, options?: { idempotencyKey?: string }): Promise<CasperHubResponse<T>> {
    const token = resolveCasperHubToken(this.env); const validation = validateCasperHubNotePayload(notePayload, token);
    if (!validation.valid) return { ok: false, status: 422, data: null, errorCode: validation.errorCode, errorMessage: validation.errorMessage };
    const normalizedPayload = normalizeCasperHubNotePayload(notePayload);
    const rawKey = options?.idempotencyKey ?? (typeof notePayload.idempotency_key === 'string' ? notePayload.idempotency_key : '') ?? '';
    const explicitKey = rawKey.replace(/[\r\n\x00-\x1F\x7F]/g, '').trim();
    const resolvedKey = deriveDeterministicNoteIdempotencyKey(normalizedPayload, explicitKey);
    const postRes = await this.request<T>('/v1/notes', { method: 'POST', body: { ...normalizedPayload, idempotency_key: resolvedKey }, extraHeaders: { 'Idempotency-Key': resolvedKey } });
    if (postRes.ok) this.readCache.clear();
    return postRes;
  }
}
export const defaultCasperHubClient = new CasperHubClient();

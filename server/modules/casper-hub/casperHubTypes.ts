/**
 * @file server/modules/casper-hub/casperHubTypes.ts
 * @description Strict TypeScript contracts and pure validation/redaction helpers for CASPER HUB.
 * Secret tokens (`CASPER_HUB_TOKEN`) are strictly server-only and never serialized to clients.
 */
import crypto from 'node:crypto';

export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev';
export const CASPER_AGENT_ID = 'CASPER-04';
export const CASPER_AGENT_ROADMAP_ID = 'rm-casper-04';
export const EXPECTED_CASPER_AGENT_ID = 'CASPER-05';
export const ALLOWED_CASPER_AGENT_IDS = new Set(['CASPER-03', 'CASPER-04', 'CASPER-05', 'CASPER-06']);

export class CasperHubClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  constructor(code: string, message: string, status: number = 500) {
    super(message);
    this.name = 'CasperHubClientError';
    this.code = code;
    this.status = status;
  }
}

export type CasperAgentId = 'CASPER-03' | 'CASPER-04' | 'CASPER-05' | string;
export type CasperHubHealthMode = 'live_connected' | 'unconfigured_token' | 'auth_mismatch' | 'upstream_unreachable' | 'rate_limited';

export interface CasperHubWhoAmIResponse {
  ok: boolean;
  agent_id: CasperAgentId;
  role?: string;
  scopes?: string[];
  permissions?: string[];
  hub_version?: string;
  database?: 'connected' | 'degraded' | string;
  server_time?: string;
  verified_casper_05?: boolean;
  sequence?: number;
}

export interface CasperHubRoadmapItem { id: string; title: string; status: string; owner_agent?: string; updated_at?: string; }
export interface CasperHubTaskItem { id: string; roadmap_id?: string; title: string; status: string; assigned_agent?: string; priority?: string; updated_at?: string; }
export interface CasperHubNoteRecord { id: string; agent_id: string; title: string; summary: string; tags?: string[]; related_task_id?: string; idempotency_key?: string; created_at: string; }
export interface CasperHubEpistemicSnapshot { schema_version?: string; confidence_index?: number; active_hypotheses?: number; verified_invariants?: number; last_audit_at?: string; summary?: string; }

export interface CasperHubBootstrapResponse {
  ok: boolean;
  agent_id?: string;
  roadmaps: CasperHubRoadmapItem[];
  tasks: CasperHubTaskItem[];
  active_notes: CasperHubNoteRecord[];
  epistemic_snapshot: CasperHubEpistemicSnapshot | null;
  latest_seq?: number;
  server_time?: string;
}

export interface CasperHubChangeEvent {
  seq: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload?: Record<string, unknown>;
  changed_at?: string;
  timestamp?: string;
}

export interface CasperHubChangesResponse {
  ok: boolean;
  agent_id?: string;
  changes: CasperHubChangeEvent[];
  next_after: number;
  has_more: boolean;
  sequence_gap_detected?: boolean;
  requested_after?: number;
}

export interface CasperHubCreateNoteInput {
  title: string;
  summary: string;
  tags?: string[];
  related_task_id?: string;
  idempotency_key?: string;
  agent_id?: string;
  author_agent_id?: string;
  created_by_agent_id?: string;
}

export interface CasperHubCreateNoteResponse {
  ok: boolean;
  agent_id?: string;
  idempotent_replay?: boolean;
  idempotency_key: string;
  note: CasperHubNoteRecord;
}

export interface CasperHubSafeConfigStatus {
  configured: boolean;
  tokenConfigured: boolean;
  tokenPresent: boolean;
  hubUrl: string;
  expectedAgentId: string;
  agentId: string;
  authHeaderFormat: 'Bearer <redacted>' | 'unconfigured';
  mode: CasperHubHealthMode;
}

export interface CasperHubClientResult<T> {
  ok: boolean;
  status: number;
  httpStatus: number;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  error?: string;
  authenticatedAsCasper05?: boolean;
  databaseConnected?: boolean;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /system\s+prompt\s+override/i,
  /(?:leak|reveal|dump)\s+(?:system\s+prompt|secrets)/i,
  /<script\b[^>]*>/i,
  /javascript:/i,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];
export const CONTROL_BIDI_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

function normalizePersianOrthography(raw: unknown): string {
  return String(raw ?? '')
    .replace(CONTROL_BIDI_RE, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0x0f))
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC');
}

function parseImportanceValue(val: unknown): number {
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'critical') return 5;
    if (s === 'high') return 4;
    if (s === 'medium') return 3;
    if (s === 'low') return 2;
  }
  const num = Number(val);
  return Number.isFinite(num) ? Math.max(1, Math.min(5, Math.round(num))) : 3;
}

export function redactCasperHubSecrets(rawText: string, secretToken?: string): string {
  if (!rawText) return '';
  let scrubbed = rawText
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=~:%]+/gi, 'Bearer [REDACTED]')
    .replace(/\\u0042earer\s+[A-Za-z0-9._\-+/=~:%]+/gi, '[REDACTED]')
    .replace(/("?(?:token|secret|authorization|api_key|casper_hub_token)"?\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
  const trimmed = secretToken?.trim();
  if (trimmed && trimmed.length >= 4) {
    const variants = new Set([
      trimmed,
      encodeURIComponent(trimmed),
      Buffer.from(trimmed, 'utf8').toString('base64'),
      trimmed.replace(/\//g, '\\/'),
    ]);
    for (const v of variants) {
      if (v && v.length >= 4) scrubbed = scrubbed.split(v).join('[REDACTED]');
    }
  }
  return scrubbed;
}
export const redactSensitiveText = redactCasperHubSecrets;
export const redactSensitiveTokenText = redactCasperHubSecrets;

export function scrubParsedObject<T>(val: T, secretToken?: string): T {
  if (typeof val === 'string') return redactCasperHubSecrets(val, secretToken) as unknown as T;
  if (Array.isArray(val)) return val.map((item) => scrubParsedObject(item, secretToken)) as unknown as T;
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = scrubParsedObject(v, secretToken);
    }
    return out as T;
  }
  return val;
}

export function resolveCasperHubUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.CASPER_HUB_URL || DEFAULT_CASPER_HUB_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CasperHubClientError('CASPER_HUB_URL_INVALID', 'CASPER_HUB_URL_FORBIDDEN_HOST: Invalid URL', 503);
  }
  if (parsed.protocol !== 'https:') {
    throw new CasperHubClientError('CASPER_HUB_URL_INVALID', 'CASPER_HUB_URL_HTTPS_REQUIRED: HTTPS required', 503);
  }
  if (parsed.username || parsed.password) {
    throw new CasperHubClientError('CASPER_HUB_URL_INVALID', 'CASPER_HUB_URL_CREDENTIALS_FORBIDDEN', 503);
  }
  if (parsed.search || parsed.hash) {
    throw new CasperHubClientError('CASPER_HUB_URL_INVALID', 'CASPER_HUB_URL_QUERY_FORBIDDEN', 503);
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (parsed.hostname !== 'casper-hub-api.bijanbijane-1.workers.dev' || parsed.port !== '' || cleanPath !== '') {
    throw new CasperHubClientError('CASPER_HUB_URL_INVALID', 'CASPER_HUB_URL_FORBIDDEN_HOST', 503);
  }
  return DEFAULT_CASPER_HUB_URL;
}

export function isAllowedCasperHubUrl(rawUrl: string): boolean {
  try {
    resolveCasperHubUrl({ CASPER_HUB_URL: rawUrl });
    return true;
  } catch {
    return false;
  }
}

export function resolveCasperHubBaseUrl(env: Record<string, string | undefined> = process.env): string {
  try {
    return resolveCasperHubUrl(env);
  } catch {
    return DEFAULT_CASPER_HUB_URL;
  }
}

export function resolveCasperHubConfig(env: Record<string, string | undefined> = process.env): { hubUrl: string; token: string } {
  const hubUrl = resolveCasperHubUrl(env);
  const token = (env.CASPER_HUB_TOKEN || '').trim();
  return { hubUrl, token };
}

export function seedToUuidV5(canonical: string): string {
  const hex = crypto.createHash('sha256').update(canonical).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function generateDeterministicNoteIdempotencyKey(payload: Record<string, unknown>): string {
  const title = normalizePersianOrthography(payload.title);
  const summary = normalizePersianOrthography(payload.summary);
  const scope = normalizePersianOrthography(payload.note_scope || 'global').toLowerCase();
  const imp = parseImportanceValue(payload.importance);
  const tagsPart = Array.isArray(payload.tags)
    ? `|tags:${Array.from(new Set(payload.tags.map((t) => normalizePersianOrthography(t)))).sort().join(',')}`
    : '';
  const extra = scope !== 'global' ? `|${scope}|${normalizePersianOrthography(payload.roadmap_id)}|${normalizePersianOrthography(payload.task_id)}` : '';
  const impPart = imp !== 3 ? `|imp:${imp}` : '';
  const canonical = `${CASPER_AGENT_ID}|${title.length}:${title}|${summary.length}:${summary}${extra}${impPart}${tagsPart}`;
  return seedToUuidV5(canonical);
}
export const deriveDeterministicNoteIdempotencyKey = generateDeterministicNoteIdempotencyKey;

export function buildDeterministicNoteIdempotencyKey(payload: Record<string, unknown>): string {
  const title = normalizePersianOrthography(payload.title);
  const summary = normalizePersianOrthography(payload.summary);
  const scope = normalizePersianOrthography(payload.note_scope || 'global').toLowerCase();
  const type = normalizePersianOrthography(payload.note_type || 'finding').toLowerCase();
  const imp = parseImportanceValue(payload.importance);
  const canonical = `casper-04|${scope}|${type}|${imp}|${title.length}:${title}|${summary.length}:${summary}`;
  const hex = crypto.createHash('sha256').update(canonical).digest('hex');
  return `casper-04-${hex.slice(0, 32)}`;
}

export function validateCasperHubNotePayload(
  payload: unknown,
  secretToken?: string,
): { valid: boolean; error?: string; statusCode?: number; sanitized?: Record<string, unknown> } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Note payload must be a JSON object', statusCode: 400 };
  }
  const obj = payload as Record<string, unknown>;
  const meta = (obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {}) as Record<string, unknown>;
  const spoofedAgent = obj.agent_id ?? obj.author_agent_id ?? obj.created_by_agent_id ?? meta.agent_id;
  if (spoofedAgent !== undefined && String(spoofedAgent).trim() !== '' && !ALLOWED_CASPER_AGENT_IDS.has(String(spoofedAgent).trim())) {
    return { valid: false, error: 'Agent identity spoofing attempt rejected (AGENT_IDENTITY_SPOOF_REJECTED)', statusCode: 403 };
  }
  const cleanStr = (v: unknown) => (typeof v === 'string' ? v.replace(CONTROL_BIDI_RE, '').trim().normalize('NFC') : '');
  const title = cleanStr(obj.title);
  const summary = cleanStr(obj.summary);
  if (title.length < 1 || title.length > 160) {
    return { valid: false, error: 'Note title must be between 1 and 160 characters', statusCode: 422 };
  }
  if (summary.length < 1 || summary.length > 4000 || /^(.)\1{500,}$/.test(summary)) {
    return { valid: false, error: 'Note summary must be between 1 and 600/4000 valid characters', statusCode: 422 };
  }
  const scope = cleanStr(obj.note_scope || 'global').toLowerCase();
  if (!['global', 'roadmap', 'task'].includes(scope)) {
    return { valid: false, error: 'Invalid note_scope', statusCode: 422 };
  }
  const roadmapId = cleanStr(obj.roadmap_id);
  const taskId = cleanStr(obj.task_id ?? obj.related_task_id);
  if (scope === 'roadmap' && !roadmapId) return { valid: false, error: 'roadmap_id is required when note_scope is roadmap', statusCode: 422 };
  if (scope === 'task' && !taskId) return { valid: false, error: 'task_id is required when note_scope is task', statusCode: 422 };
  if (roadmapId.length > 128 || taskId.length > 128) return { valid: false, error: 'Identifier length exceeds 128 characters', statusCode: 422 };
  const detailRef = cleanStr(obj.detail_ref);
  if (detailRef && !detailRef.startsWith('https://')) return { valid: false, error: 'detail_ref must be an https:// URL', statusCode: 422 };
  const tags = Array.isArray(obj.tags)
    ? Array.from(new Set(obj.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))).slice(0, 10)
    : undefined;
  const combined = `${title}\n${summary}\n${roadmapId}\n${taskId}\n${detailRef}\n${(tags || []).join(' ')}`;
  const tok = (secretToken ?? process.env.CASPER_HUB_TOKEN ?? '').trim();
  if (tok && tok.length >= 4) {
    const b64 = Buffer.from(tok, 'utf8').toString('base64');
    const urlEnc = encodeURIComponent(tok);
    if (combined.includes(tok) || combined.includes(b64) || combined.includes(urlEnc)) {
      return { valid: false, error: 'CASPER_HUB_NOTE_SECURITY_VIOLATION: secret token leakage detected', statusCode: 422 };
    }
  }
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(combined)) {
      return { valid: false, error: 'CASPER_HUB_NOTE_SECURITY_VIOLATION: prompt-injection or credential detected', statusCode: 422 };
    }
  }
  const rawType = cleanStr(obj.note_type || 'checkpoint').toLowerCase();
  const normalizedType = rawType === 'decision' ? 'finding' : rawType;
  const importance = parseImportanceValue(obj.importance);
  return {
    valid: true,
    sanitized: {
      title,
      summary,
      note_scope: scope,
      note_type: normalizedType,
      importance,
      ...(roadmapId ? { roadmap_id: roadmapId } : {}),
      ...(taskId ? { task_id: taskId, related_task_id: taskId } : {}),
      ...(detailRef ? { detail_ref: detailRef } : {}),
      ...(tags ? { tags } : {}),
    },
  };
}

export function normalizeCasperHubNotePayload(payload: Record<string, unknown>, secretToken?: string): Record<string, unknown> {
  const res = validateCasperHubNotePayload(payload, secretToken);
  if (!res.valid || !res.sanitized) {
    throw new CasperHubClientError('CASPER_HUB_INVALID_NOTE', res.error || 'Invalid CASPER HUB note payload', res.statusCode || 422);
  }
  return res.sanitized;
}

export function analyzeCasperHubEpistemicState(input: Record<string, unknown>) {
  const rawEvents = Array.isArray(input.change_feed) ? input.change_feed : Array.isArray(input.events) ? input.events : [];
  const rawNotes = Array.isArray(input.notes) ? input.notes : Array.isArray(input.relevant_notes) ? input.relevant_notes : [];
  let monotonicSequenceValid = true;
  const sequenceGaps: Array<{ from: number; to: number }> = [];
  let sequenceGapCount = 0;
  let prevSeq: number | null = null;
  let spoofedEventsCount = 0;
  let minSeq = 0;
  let maxSeq = 0;
  for (const item of rawEvents) {
    const ev = item as Record<string, unknown>;
    const seq = Number(ev.seq ?? ev.event_seq ?? 0);
    if (minSeq === 0 || seq < minSeq) minSeq = seq;
    if (seq > maxSeq) maxSeq = seq;
    if (prevSeq !== null) {
      if (seq <= prevSeq) monotonicSequenceValid = false;
      else if (seq > prevSeq + 1) {
        sequenceGaps.push({ from: prevSeq + 1, to: seq - 1 });
        sequenceGapCount += seq - prevSeq - 1;
      }
    }
    prevSeq = seq;
    const actor = String(ev.actor_agent ?? ev.agent_id ?? '');
    if (actor && !/^CASPER-\d{2}$/.test(actor)) spoofedEventsCount += 1;
  }
  let verifiedAgentNotesCount = 0;
  let untrustedNotesCount = 0;
  let criticalNotesCount = 0;
  let activeBlockersCount = 0;
  const authorCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const item of rawNotes) {
    const n = item as Record<string, unknown>;
    const author = String(n.author_agent ?? n.author_agent_id ?? n.agent_id ?? 'unknown');
    const nType = String(n.note_type ?? 'checkpoint').toLowerCase();
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    typeCounts.set(nType, (typeCounts.get(nType) ?? 0) + 1);
    if (/^CASPER-\d{2}$/.test(author)) verifiedAgentNotesCount += 1;
    else untrustedNotesCount += 1;
    if (Number(n.importance ?? 0) >= 4) criticalNotesCount += 1;
    if (nType === 'blocker') activeBlockersCount += 1;
  }
  const calcEntropy = (counts: Map<string, number>) => {
    if (rawNotes.length === 0) return 0;
    let h = 0;
    for (const c of counts.values()) {
      const p = c / rawNotes.length;
      if (p > 0) h -= p * Math.log2(p);
    }
    return Number(h.toFixed(4));
  };
  const cursorObj = (input.sync_cursor && typeof input.sync_cursor === 'object' ? input.sync_cursor : {}) as Record<string, unknown>;
  const cursorSeq = Number(cursorObj.latest_event_id ?? cursorObj.last_seq ?? maxSeq);
  return {
    minSeq,
    maxSeq,
    isMonotonic: monotonicSequenceValid,
    monotonicSequenceValid,
    sequenceGaps,
    sequenceGapCount,
    spoofedEventsCount,
    verifiedAgentNotesCount,
    untrustedNotesCount,
    criticalNotesCount,
    activeBlockersCount,
    agentContributionEntropyBits: calcEntropy(authorCounts),
    noteTypeEntropyBits: calcEntropy(typeCounts),
    syncCursorLag: Math.max(0, maxSeq - cursorSeq),
  };
}

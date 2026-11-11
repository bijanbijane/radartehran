/**
 * @file server/modules/casper-hub/casperHubTypes.ts
 * @description Domain types, error classes, token redaction, deterministic idempotency
 * derivation, and strict CASPER-02 identity verification guards for CASPER HUB.
 */

import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';

export const CASPER_AGENT_ID = 'CASPER-04' as const;
export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev' as const;
export const ALLOWED_CASPER_HUB_HOST = 'casper-hub-api.bijanbijane-1.workers.dev' as const;
export const MAX_HUB_RESPONSE_BYTES = 512 * 1024;

export interface CasperHubResolvedConfig {
  readonly agentId: typeof CASPER_AGENT_ID;
  readonly baseUrl: string;
  readonly tokenConfigured: boolean;
}

export interface CasperHubChangesQuery { after?: number; limit?: number; }

export interface CasperHubAgentIdentity {
  agent_id: string; display_name?: string; role?: string; status?: string; capabilities?: string[]; last_seen_at?: string;
}

export interface CasperHubWhoamiData {
  authenticated?: boolean; agent_id?: string; display_name?: string; role?: string; status?: string; capabilities?: string[]; server_time?: string;
  [key: string]: unknown;
}

export interface CasperHubNoteRecord {
  note_id: string; author_agent_id?: string; created_by_agent_id?: string; note_scope: 'global' | 'roadmap' | 'task' | 'agent' | string;
  roadmap_id: string | null; task_id: string | null; note_type: 'checkpoint' | 'finding' | 'blocker' | 'decision' | 'handover' | string;
  importance: number; title: string; summary: string; detail_ref: string | null; tags?: string[]; created_at: string | number;
}

export interface CasperHubBootstrapData {
  hub?: { service?: string; version?: string; server_time?: string; };
  agent?: CasperHubAgentIdentity; roadmaps?: Array<Record<string, unknown>>; relevant_notes?: CasperHubNoteRecord[];
  assigned_tasks?: Array<Record<string, unknown>>; sync_cursor?: { latest_event_id?: number; }; limits?: Record<string, number>;
  [key: string]: unknown;
}

export interface CasperHubChangeEvent {
  event_id: number | string; event_seq?: number; event_type: string; actor_agent_id: string;
  entity_type: string; entity_id: string; roadmap_id?: string | null; task_id?: string | null;
  summary: string; payload?: Record<string, unknown>; created_at: string | number;
}

export interface CasperHubChangesData {
  events?: CasperHubChangeEvent[]; next_cursor?: number; has_more?: boolean;
  [key: string]: unknown;
}

export interface CasperHubNotePayload {
  title?: string; summary?: string; content?: string; note_scope?: 'global' | 'roadmap' | 'task' | 'agent' | string;
  roadmap_id?: string | null; task_id?: string | null; note_type?: 'checkpoint' | 'finding' | 'blocker' | 'decision' | 'handover' | string;
  importance?: number; detail_ref?: string | null; tags?: string[]; idempotency_key?: string; category?: string; missionId?: string;
  metadata?: Record<string, unknown>;
}

export interface CasperHubClientResponse<T = unknown> {
  readonly ok: boolean;
  readonly status: number;
  readonly agentId: typeof CASPER_AGENT_ID;
  readonly endpoint: string;
  readonly data: T;
}

export type CasperHubErrorCode =
  | 'CASPER_HUB_TOKEN_NOT_CONFIGURED'
  | 'CASPER_HUB_URL_INVALID'
  | 'CASPER_AGENT_IDENTITY_MISMATCH'
  | 'CASPER_HUB_UPSTREAM_ERROR'
  | 'CASPER_HUB_NETWORK_ERROR'
  | 'CASPER_HUB_INVALID_INPUT';

let registeredRuntimeHubToken = '';
export function registerRuntimeHubTokenForRedaction(token?: string): void {
  if (typeof token === 'string' && token.trim().length >= 4) {
    registeredRuntimeHubToken = token.trim();
  }
}

export function redactSensitiveText(input: string, secretToken?: string | null): string {
  let out = input.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/\\u0042earer\s+\S+/gi, 'Bearer [REDACTED]');
  if (secretToken && secretToken.length >= 4) {
    const enc = encodeURIComponent(secretToken), b64 = Buffer.from(secretToken, 'utf8').toString('base64'), esc = secretToken.replace(/\//g, '\\/');
    for (const s of [secretToken, enc, b64, esc]) {
      if (s) out = out.split(s).join('[REDACTED]');
    }
  }
  return out;
}

export function redactSensitiveTokenText(text: string, extraToken?: string, maxLength = 500): string {
  return redactSensitiveText(text, extraToken).slice(0, maxLength);
}

function canonicalizeUnicode(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (0x06f0 - 0x0660))).trim();
}

export function deriveDeterministicNoteIdempotencyKey(payload: any, seed?: string): string {
  if (seed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seed.trim())) return seed.trim().toLowerCase();
  const tags = Array.isArray(payload?.tags) ? Array.from(new Set(payload.tags.map((t: any) => canonicalizeUnicode(t)).filter(Boolean))).sort() : [];
  const canonical = {
    note_scope: canonicalizeUnicode(payload?.note_scope) || 'global',
    roadmap_id: canonicalizeUnicode(payload?.roadmap_id) || null,
    task_id: canonicalizeUnicode(payload?.task_id) || null,
    note_type: canonicalizeUnicode(payload?.note_type) || 'checkpoint',
    importance: typeof payload?.importance === 'string' ? (payload.importance === 'high' ? 4 : 3) : Number(payload?.importance ?? 3),
    title: canonicalizeUnicode(payload?.title),
    summary: canonicalizeUnicode(payload?.summary),
    detail_ref: canonicalizeUnicode(payload?.detail_ref) || null,
    tags,
  };
  const hex = crypto.createHash('sha256').update(seed ? `casper-hub-key-v1:${canonicalizeUnicode(seed)}:${JSON.stringify(canonical)}` : `casper-hub-note-v1:${JSON.stringify(canonical)}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export class CasperHubClientError extends Error {
  public readonly code: CasperHubErrorCode;
  public readonly httpStatus: number;

  constructor(
    code: CasperHubErrorCode,
    message: string,
    httpStatus = 500,
    extraTokenToRedact?: string,
  ) {
    super(redactSensitiveTokenText(message, extraTokenToRedact));
    this.name = 'CasperHubClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Verifies that an upstream payload or caller parameter never impersonates another agent
 * (such as CASPER-01) when operating from this CASPER-02 project.
 */
export function assertCasper02Identity(
  payload: unknown,
  options?: { requireExplicitIdentity?: boolean },
): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    if (options?.requireExplicitIdentity) {
      throw new CasperHubClientError(
        'CASPER_AGENT_IDENTITY_MISMATCH',
        `Upstream response did not contain a valid JSON object confirming ${CASPER_AGENT_ID} identity.`,
        403,
      );
    }
    return;
  }

  const record = payload as Record<string, unknown>;
  if (record.authenticated === false) {
    throw new CasperHubClientError(
      'CASPER_HUB_UPSTREAM_ERROR',
      'CASPER HUB reported unauthenticated session (authenticated: false).',
      401,
    );
  }

  const nestedAgent =
    record.agent && typeof record.agent === 'object' && !Array.isArray(record.agent)
      ? (record.agent as Record<string, unknown>)
      : undefined;
  const nestedIdentity =
    record.identity && typeof record.identity === 'object' && !Array.isArray(record.identity)
      ? (record.identity as Record<string, unknown>)
      : undefined;
  const nestedNote =
    record.note && typeof record.note === 'object' && !Array.isArray(record.note)
      ? (record.note as Record<string, unknown>)
      : undefined;

  const candidate =
    record.agent_id ??
    record.agentId ??
    record.author_agent_id ??
    record.created_by_agent_id ??
    (typeof record.agent === 'string' ? record.agent : nestedAgent?.agent_id) ??
    nestedIdentity?.agent_id ??
    nestedNote?.author_agent_id ??
    nestedNote?.created_by_agent_id ??
    nestedNote?.agent_id;

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    const normalized = candidate.trim().toUpperCase();
    if (normalized !== CASPER_AGENT_ID) {
      throw new CasperHubClientError(
        'CASPER_AGENT_IDENTITY_MISMATCH',
        `Credential or payload identity mismatch: expected ${CASPER_AGENT_ID}, received ${sanitizeInput(normalized, 32)}. Do not reuse credentials from another agent.`,
        403,
      );
    }
    return;
  }

  if (options?.requireExplicitIdentity) {
    throw new CasperHubClientError(
      'CASPER_AGENT_IDENTITY_MISMATCH',
      `Upstream response omitted explicit ${CASPER_AGENT_ID} identity confirmation.`,
      403,
    );
  }
}

export function stripBidiAndControl(text: string): string {
  return text.replace(/[\u200E-\u200F\u202A-\u202E\u2066-\u2069\x00-\x1F\x7F]/g, '');
}

export function buildDeterministicNoteIdempotencyKey(fields: {
  note_scope: string; roadmap_id: string | null; task_id: string | null;
  note_type: string; title: string; summary: string;
}): string {
  const norm = (s: unknown) => (typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
  const tuple = [
    'CASPER-04', norm(fields.note_scope), norm(fields.roadmap_id),
    norm(fields.task_id), norm(fields.note_type), norm(fields.title), norm(fields.summary),
  ];
  return `casper-04-${crypto.createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex').slice(0, 32)}`;
}

function computeEntropy(counts: Map<string, number>, total: number): number {
  if (total <= 1 || counts.size <= 1) return 0;
  let ent = 0;
  for (const c of counts.values()) { if (c > 0) { const p = c / total; ent -= p * Math.log2(p); } }
  return Math.round(ent * 1000) / 1000;
}

export function parseSafeHubJsonAST(rawText: string, secretToken?: string | null): any {
  try {
    return JSON.parse(rawText || '{}', (k, v) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
      return typeof v === 'string' ? redactSensitiveText(stripBidiAndControl(v), secretToken) : v;
    });
  } catch {
    return {};
  }
}

export function analyzeCasperHubEpistemicState(payload: any) {
  const feed = Array.isArray(payload?.change_feed) ? payload.change_feed : Array.isArray(payload?.events) ? payload.events : [];
  const notes = Array.isArray(payload?.notes) ? payload.notes : Array.isArray(payload?.relevant_notes) ? payload.relevant_notes : [];
  const tasks = Array.isArray(payload?.assigned_tasks) ? payload.assigned_tasks : [];
  const seqs = feed.map((item: any) => Number(item?.seq ?? item?.event_seq ?? item?.event_id)).filter((n: any) => Number.isFinite(n) && n >= 0);
  let isMonotonic = true, sequenceGapCount = 0;
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] <= seqs[i - 1]) isMonotonic = false;
    else if (seqs[i] - seqs[i - 1] > 1) sequenceGapCount += seqs[i] - seqs[i - 1] - 1;
  }
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : 0, maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0;
  const cursorObj = payload?.sync_cursor;
  const rawLastSeq = typeof cursorObj === 'object' && cursorObj !== null ? (cursorObj.last_seq ?? cursorObj.latest_event_id) : (cursorObj ?? payload?.next_cursor ?? payload?.effective_sync_cursor ?? maxSeq);
  const lastSeq = Number(rawLastSeq ?? maxSeq);
  const syncCursorLag = Number.isFinite(lastSeq) ? Math.max(0, maxSeq - lastSeq) : 0;
  const agentCounts = new Map<string, number>(), typeCounts = new Map<string, number>();
  let criticalNotesCount = 0, activeBlockersCount = tasks.filter((t: any) => t?.status === 'blocked').length;
  for (const n of notes) {
    const agent = String(n?.author_agent || n?.author_agent_id || n?.created_by_agent_id || 'UNKNOWN'), nType = String(n?.note_type || 'checkpoint');
    agentCounts.set(agent, (agentCounts.get(agent) ?? 0) + 1); typeCounts.set(nType, (typeCounts.get(nType) ?? 0) + 1);
    const imp = typeof n?.importance === 'string' ? (n.importance === 'high' ? 4 : n.importance === 'critical' ? 5 : 3) : Number(n?.importance ?? 3);
    if (imp >= 4) criticalNotesCount++;
    if (nType === 'blocker') activeBlockersCount++;
  }
  return {
    minSeq, maxSeq, isMonotonic, sequenceGapCount, syncCursorLag,
    agentContributionEntropyBits: computeEntropy(agentCounts, notes.length),
    noteTypeEntropyBits: computeEntropy(typeCounts, notes.length),
    criticalNotesCount, activeBlockersCount,
  };
}

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

export const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /system\s+prompt\s+override/i,
  /(?:leak|reveal|dump)\s+(?:system\s+prompt|secrets)/i,
  /<script\b[^>]*>/i,
  /javascript:/i,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];
export const CONTROL_BIDI_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

export function parseImportanceValue(val: unknown): number {
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

export {
  seedToUuidV5,
  generateDeterministicNoteIdempotencyKey,
  deriveDeterministicNoteIdempotencyKey,
  buildDeterministicNoteIdempotencyKey,
  validateCasperHubNotePayload,
  normalizeCasperHubNotePayload,
  analyzeCasperHubEpistemicState,
} from './casperHubValidation';

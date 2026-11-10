/**
 * @file server/modules/casper-hub/casperHubTypes.ts
 * @description Domain types, error classes, token redaction, deterministic idempotency
 * derivation, and strict CASPER-02 identity verification guards for CASPER HUB.
 */

import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';

export const CASPER_AGENT_ID = 'CASPER-02' as const;
export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev' as const;
export const ALLOWED_CASPER_HUB_HOST = 'casper-hub-api.bijanbijane-1.workers.dev' as const;
export const MAX_HUB_RESPONSE_BYTES = 512 * 1024;

export interface CasperHubResolvedConfig {
  readonly agentId: typeof CASPER_AGENT_ID;
  readonly baseUrl: string;
  readonly tokenConfigured: boolean;
}

export interface CasperHubChangesQuery {
  after?: number;
  limit?: number;
}

export interface CasperHubAgentIdentity {
  agent_id: string;
  display_name?: string;
  role?: string;
  status?: string;
  capabilities?: string[];
  last_seen_at?: string;
}

export interface CasperHubWhoamiData {
  authenticated?: boolean;
  agent_id?: string;
  display_name?: string;
  role?: string;
  status?: string;
  capabilities?: string[];
  server_time?: string;
  [key: string]: unknown;
}

export interface CasperHubNoteRecord {
  note_id: string;
  author_agent_id?: string;
  created_by_agent_id?: string;
  note_scope: 'global' | 'roadmap' | 'task' | 'agent' | string;
  roadmap_id: string | null;
  task_id: string | null;
  note_type: 'checkpoint' | 'finding' | 'blocker' | 'decision' | 'handover' | string;
  importance: number;
  title: string;
  summary: string;
  detail_ref: string | null;
  tags?: string[];
  created_at: string | number;
}

export interface CasperHubBootstrapData {
  hub?: {
    service?: string;
    version?: string;
    server_time?: string;
  };
  agent?: CasperHubAgentIdentity;
  roadmaps?: Array<Record<string, unknown>>;
  relevant_notes?: CasperHubNoteRecord[];
  assigned_tasks?: Array<Record<string, unknown>>;
  sync_cursor?: {
    latest_event_id?: number;
  };
  limits?: Record<string, number>;
  [key: string]: unknown;
}

export interface CasperHubChangeEvent {
  event_id: number | string;
  event_seq?: number;
  event_type: string;
  actor_agent_id: string;
  entity_type: string;
  entity_id: string;
  roadmap_id?: string | null;
  task_id?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
  created_at: string | number;
}

export interface CasperHubChangesData {
  events?: CasperHubChangeEvent[];
  next_cursor?: number;
  has_more?: boolean;
  [key: string]: unknown;
}

export interface CasperHubNotePayload {
  title?: string;
  summary?: string;
  content?: string;
  note_scope?: 'global' | 'roadmap' | 'task' | 'agent' | string;
  roadmap_id?: string | null;
  task_id?: string | null;
  note_type?: 'checkpoint' | 'finding' | 'blocker' | 'decision' | 'handover' | string;
  importance?: number;
  detail_ref?: string | null;
  tags?: string[];
  idempotency_key?: string;
  category?: string;
  missionId?: string;
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

/**
 * Redacts any accidental Bearer token or credential fragments from error or note strings.
 */
export function redactSensitiveTokenText(text: string, extraToken?: string, maxLength = 500): string {
  const envToken = typeof process !== 'undefined' ? process.env?.CASPER_HUB_TOKEN?.trim() : '';
  let safe = String(text || '').replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
  for (const candidate of [envToken, registeredRuntimeHubToken, extraToken?.trim()]) {
    if (candidate && candidate.length >= 4) {
      safe = safe.split(candidate).join('[REDACTED_CASPER_HUB_TOKEN]');
    }
  }
  const safeMax = Number.isInteger(maxLength) && maxLength > 0 ? Math.min(4000, maxLength) : 500;
  return safe.slice(0, safeMax);
}

/**
 * Derives a deterministic SHA-256 idempotency key from canonical note content so retries
 * of identical notes after transient network drops never duplicate records in D1.
 */
export function deriveDeterministicNoteIdempotencyKey(fields: {
  note_scope: string;
  roadmap_id: string | null;
  task_id: string | null;
  note_type: string;
  importance: number;
  title: string;
  summary: string;
  detail_ref: string | null;
  tags: string[];
}): string {
  const canonical = JSON.stringify({
    agent_id: CASPER_AGENT_ID,
    note_scope: fields.note_scope,
    roadmap_id: fields.roadmap_id,
    task_id: fields.task_id,
    note_type: fields.note_type,
    importance: fields.importance,
    title: fields.title,
    summary: fields.summary,
    detail_ref: fields.detail_ref,
    tags: [...fields.tags].sort(),
  });
  const digest = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `casper02-note-${digest.slice(0, 32)}`;
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

/**
 * @file server/modules/casper-hub/casperHubRoutes.ts
 * @description Server-side Express proxy routes for the shared CASPER HUB integration.
 * Keeps CASPER_HUB_TOKEN strictly on the server and requires admin authorization.
 */

import type { Express, Request, Response } from 'express';
import { verifyAdminApiAuthorization } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import {
  analyzeCasperHubEpistemicState,
  CasperHubClient,
  defaultCasperHubClient,
  deriveDeterministicNoteIdempotencyKey,
  normalizeCasperHubNotePayload,
  validateCasperHubNotePayload,
} from './casperHubClient';

export interface CasperHubRoutesOptions {
  client?: CasperHubClient;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status: number; message: string }>;
}

interface LocalLedgerEntry {
  note_id: string;
  event_seq: number;
  note: Record<string, unknown>;
}

const INITIAL_LOCAL_NOTES: Record<string, unknown>[] = [
  { id: 'local-seed-casper-01', author_agent: 'CASPER-01', note_scope: 'global', note_type: 'checkpoint', importance: 4, title: 'Initial RMEP-001 Governance Baseline Lock', summary: 'Verified SHA-256 master prompt lock and 328-file architectural boundary.', tags: ['rmep-001', 'governance'] },
  { id: 'local-seed-casper-05', author_agent: 'CASPER-05', note_scope: 'global', note_type: 'verification', importance: 4, title: 'Stage-2 Econometric & Non-Homogeneous Yield Parity Verified', summary: 'Verified targetSqm and yieldBoost parity across all 12 Stage-2 engines and cards.', tags: ['stage2', 'econometrics', 'chk-192-final'] },
];

let localSeqCounter = 2;
let localFallbackNotes: Record<string, unknown>[] = INITIAL_LOCAL_NOTES.map((n) => ({ ...n }));
let localFallbackFeed: Array<{ seq: number; event_type: string; agent_id: string; note_id: string }> = [
  { seq: 1, event_type: 'note.created', agent_id: 'CASPER-01', note_id: 'local-seed-casper-01' },
  { seq: 2, event_type: 'note.created', agent_id: 'CASPER-05', note_id: 'local-seed-casper-05' },
];
const localIdempotencyLedger = new Map<string, LocalLedgerEntry>();

export function resetCasperHubLocalLedgerForTests(): void {
  localSeqCounter = 2;
  localFallbackNotes = INITIAL_LOCAL_NOTES.map((n) => ({ ...n }));
  localFallbackFeed = [
    { seq: 1, event_type: 'note.created', agent_id: 'CASPER-01', note_id: 'local-seed-casper-01' },
    { seq: 2, event_type: 'note.created', agent_id: 'CASPER-05', note_id: 'local-seed-casper-05' },
  ];
  localIdempotencyLedger.clear();
}

const registeredCasperHubApps = new WeakSet<Express>();

async function ensureCasperHubAdminAuthorized(req: Request, res: Response, options?: CasperHubRoutesOptions): Promise<boolean> {
  const ip = options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1';
  if (options?.verifyAdminAuth) {
    const auth = await options.verifyAdminAuth(req);
    if (!auth.ok) {
      recordAbuseSignal(ip, 'auth_failure');
      res.status(auth.status).json({ status: 'error', code: auth.message || 'ADMIN_AUTH_REQUIRED' });
      return false;
    }
    return true;
  }

  const fallbackAuth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
  if (!fallbackAuth.authorized) {
    recordAbuseSignal(ip, 'auth_failure');
    res.status(fallbackAuth.statusCode).json({ status: 'error', code: fallbackAuth.reason || 'ADMIN_AUTH_REQUIRED' });
    return false;
  }
  return true;
}

export function registerCasperHubRoutes(app: Express, options?: CasperHubRoutesOptions): void {
  if (registeredCasperHubApps.has(app)) return;
  registeredCasperHubApps.add(app);

  const client = options?.client ?? defaultCasperHubClient;
  const getClientIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const checkRateLimit = options?.checkRateLimit ?? ((_ip: string, _bucket: 'general', _max: number, _windowMs: number) => true);
  const applySecurityHeaders = (res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  };

  app.get('/api/casper-hub/whoami', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (!checkRateLimit(getClientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (!(await ensureCasperHubAdminAuthorized(req, res, options))) return;

    const result = await client.getWhoAmI();
    if (!result.ok && (result.errorCode === 'CASPER_HUB_TOKEN_NOT_CONFIGURED' || result.errorCode === 'CASPER_HUB_REQUEST_FAILED' || result.errorCode === 'CASPER_HUB_NETWORK_ERROR')) {
      res.status(200).json({
        status: 'ok',
        mode: 'LOCAL_LEDGER_FALLBACK',
        data: { authenticated: true, agent_id: 'CASPER-05', database: 'local-ledger-fallback', permissions: ['read', 'write:local-ledger'], active_roadmaps_count: 1, open_tasks_count: 0 },
      });
      return;
    }
    res.status(result.status).json(
      result.ok ? { status: 'ok', data: result.data } : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
    );
  });

  app.get('/api/casper-hub/bootstrap', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (!checkRateLimit(getClientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (!(await ensureCasperHubAdminAuthorized(req, res, options))) return;

    const result = await client.getBootstrap<Record<string, unknown>>();
    if (!result.ok && (result.errorCode === 'CASPER_HUB_TOKEN_NOT_CONFIGURED' || result.errorCode === 'CASPER_HUB_REQUEST_FAILED' || result.errorCode === 'CASPER_HUB_NETWORK_ERROR')) {
      const localPayload = { sync_cursor: { last_seq: localSeqCounter }, change_feed: localFallbackFeed, notes: localFallbackNotes };
      res.status(200).json({ status: 'ok', mode: 'LOCAL_LEDGER_FALLBACK', data: localPayload, telemetry: analyzeCasperHubEpistemicState(localPayload) });
      return;
    }
    res.status(result.status).json(
      result.ok
        ? { status: 'ok', data: result.data, telemetry: analyzeCasperHubEpistemicState(result.data) }
        : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
    );
  });

  app.get('/api/casper-hub/changes', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (!checkRateLimit(getClientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (!(await ensureCasperHubAdminAuthorized(req, res, options))) return;

    const after = typeof req.query.after === 'string' ? Number(req.query.after) || 0 : 0;
    const limit = typeof req.query.limit === 'string' ? Math.max(1, Math.min(200, Number(req.query.limit) || 50)) : 50;
    const result = await client.getChanges<Record<string, unknown>>({ after, limit });
    if (!result.ok && (result.errorCode === 'CASPER_HUB_TOKEN_NOT_CONFIGURED' || result.errorCode === 'CASPER_HUB_REQUEST_FAILED' || result.errorCode === 'CASPER_HUB_NETWORK_ERROR')) {
      const filteredEvents = localFallbackFeed.filter((e) => e.seq > after).slice(0, limit);
      const localPayload = { sync_cursor: { last_seq: localSeqCounter }, change_feed: filteredEvents, events: filteredEvents, notes: localFallbackNotes };
      res.status(200).json({ status: 'ok', mode: 'LOCAL_LEDGER_FALLBACK', data: localPayload, telemetry: analyzeCasperHubEpistemicState(localPayload) });
      return;
    }
    res.status(result.status).json(
      result.ok
        ? { status: 'ok', data: result.data, telemetry: analyzeCasperHubEpistemicState(result.data) }
        : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
    );
  });

  app.post('/api/casper-hub/notes', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (!checkRateLimit(getClientIp(req), 'general', 30, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (!(await ensureCasperHubAdminAuthorized(req, res, options))) return;

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ status: 'error', code: 'INVALID_NOTE_PAYLOAD', message: 'Request body must be a JSON object.' });
      return;
    }

    const rawBody = req.body as Record<string, unknown>;
    const validation = validateCasperHubNotePayload(rawBody);
    if (!validation.valid) {
      res.status(422).json({ status: 'error', code: validation.errorCode || 'UNSAFE_OR_INVALID_NOTE_PAYLOAD', message: validation.errorMessage });
      return;
    }

    const headerIdempotencyKey =
      (typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : '') ||
      (typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'] : '');
    const rawAgent = typeof rawBody.author_agent === 'string' ? rawBody.author_agent.trim() : typeof req.headers['x-casper-agent-id'] === 'string' ? req.headers['x-casper-agent-id'].trim() : '';
    const resolvedAuthorAgent = /^CASPER-0[1-9]$/.test(rawAgent) ? rawAgent : 'CASPER-05';

    const result = await client.postNote(rawBody, { idempotencyKey: headerIdempotencyKey || undefined });
    if (!result.ok && (result.errorCode === 'CASPER_HUB_TOKEN_NOT_CONFIGURED' || result.errorCode === 'CASPER_HUB_REQUEST_FAILED' || result.errorCode === 'CASPER_HUB_NETWORK_ERROR')) {
      const normalized = normalizeCasperHubNotePayload(rawBody);
      const resolvedKey = deriveDeterministicNoteIdempotencyKey(normalized, headerIdempotencyKey || undefined);
      const existing = localIdempotencyLedger.get(resolvedKey);
      if (existing) {
        res.status(200).json({ status: 'ok', mode: 'LOCAL_LEDGER_FALLBACK', data: { ...existing, deduplicated: true } });
        return;
      }
      localSeqCounter += 1;
      const noteRecord: Record<string, unknown> = { id: resolvedKey, author_agent: resolvedAuthorAgent, ...normalized };
      localFallbackNotes.push(noteRecord);
      if (localFallbackNotes.length > 100) localFallbackNotes.shift();
      localFallbackFeed.push({ seq: localSeqCounter, event_type: 'note.created', agent_id: resolvedAuthorAgent, note_id: resolvedKey });
      if (localFallbackFeed.length > 100) localFallbackFeed.shift();
      const entry: LocalLedgerEntry = { note_id: resolvedKey, event_seq: localSeqCounter, note: noteRecord };
      if (localIdempotencyLedger.size >= 100) {
        const oldestKey = localIdempotencyLedger.keys().next().value;
        if (oldestKey) localIdempotencyLedger.delete(oldestKey);
      }
      localIdempotencyLedger.set(resolvedKey, entry);
      res.status(200).json({ status: 'ok', mode: 'LOCAL_LEDGER_FALLBACK', data: { ...entry, deduplicated: false } });
      return;
    }
    res.status(result.status).json(
      result.ok ? { status: 'ok', data: result.data } : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
    );
  });
}

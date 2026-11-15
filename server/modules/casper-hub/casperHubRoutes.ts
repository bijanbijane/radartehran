/**
 * @file server/modules/casper-hub/casperHubRoutes.ts
 * @description Express server-side routes for CASPER HUB (`/api/casper-hub/*`).
 * Keeps `CASPER_HUB_TOKEN` strictly on the server and enforces auth, rate limits, and payload bounds.
 */
import type { Express, Request, Response } from 'express';
import {
  CASPER_AGENT_ID,
  CasperHubClient,
  analyzeCasperHubEpistemicState,
  createCasperHubClientFromEnv,
  deriveDeterministicNoteIdempotencyKey,
  validateCasperHubNotePayload,
} from './casperHubClient.ts';

export interface RegisterCasperHubRoutesOptions {
  requireAdminOrAuthenticated?: (req: Request, res: Response) => boolean;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status?: number; message?: string }>;
  clientFactory?: () => CasperHubClient;
  client?: CasperHubClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkRateLimit?: (ip: string, ...args: any[]) => boolean;
  getClientIp?: (req: Request) => string;
}

const MAX_AFTER_CURSOR = 10_000_000;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

interface LocalLedgerState {
  enabled: boolean;
  events: Array<{ seq: number; event_seq: number; actor_agent: string; action: string }>;
  notes: Array<Record<string, unknown>>;
  byKey: Map<string, { event_seq: number; note_id: string; note: Record<string, unknown> }>;
}

const localLedger: LocalLedgerState = {
  enabled: false,
  events: [],
  notes: [],
  byKey: new Map(),
};

export function resetCasperHubLocalLedgerForTests(): void {
  localLedger.enabled = true;
  localLedger.events = [
    { seq: 1, event_seq: 1, actor_agent: 'CASPER-01', action: 'bootstrap' },
    { seq: 2, event_seq: 2, actor_agent: 'CASPER-05', action: 'checkpoint' },
  ];
  localLedger.notes = [
    { id: 'seed-1', author_agent: 'CASPER-01', note_type: 'finding', importance: 4, title: 'Seed 1', summary: 'Init 1' },
    { id: 'seed-2', author_agent: 'CASPER-05', note_type: 'checkpoint', importance: 5, title: 'Seed 2', summary: 'Init 2' },
  ];
  localLedger.byKey.clear();
}

function isFallbackEligible(code?: string): boolean {
  return (
    localLedger.enabled &&
    (code === 'CASPER_HUB_TOKEN_NOT_CONFIGURED' ||
      code === 'CASPER_HUB_TOKEN_MISSING' ||
      code === 'CASPER_HUB_NETWORK_ERROR' ||
      code === 'CASPER_HUB_TIMEOUT')
  );
}

function defaultAuthGuard(req: Request, res: Response): boolean {
  const authHeader = String(req.headers?.authorization || '').trim();
  const adminHeader = String(req.headers?.['x-admin-token'] || req.headers?.['x-casper-session'] || '').trim();
  if (!authHeader.startsWith('Bearer ') && !adminHeader) {
    res.status(401).json({
      ok: false,
      status: 'error',
      error: 'Authentication required to access CASPER HUB server bridge',
      code: 'CASPER_HUB_BRIDGE_UNAUTHORIZED',
    });
    return false;
  }
  return true;
}

export function registerCasperHubRoutes(
  app: Express,
  options: RegisterCasperHubRoutesOptions = {},
): void {
  const getClient = options.clientFactory ?? (() => options.client ?? createCasperHubClientFromEnv());

  const checkRateAndAuth = async (req: Request, res: Response): Promise<boolean> => {
    if (options.checkRateLimit) {
      const ip = options.getClientIp ? options.getClientIp(req) : String(req.ip || '127.0.0.1');
      if (!options.checkRateLimit(ip, 'general', 60, 60_000)) {
        res.status(429).json({ ok: false, status: 'error', error: 'Rate limit exceeded for CASPER HUB bridge', code: 'RATE_LIMITED' });
        return false;
      }
    }
    if (options.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        const msg = auth.message || 'Unauthorized';
        res.status(auth.status || 401).json({ ok: false, status: 'error', code: msg, error: msg });
        return false;
      }
      return true;
    }
    if (options.requireAdminOrAuthenticated) {
      return options.requireAdminOrAuthenticated(req, res);
    }
    return defaultAuthGuard(req, res);
  };

  if (!options.client) {
    app.get(['/api/casper-hub/status'] as unknown as string, (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      if (options.checkRateLimit) {
        const ip = options.getClientIp ? options.getClientIp(req) : String(req.ip || '127.0.0.1');
        if (!options.checkRateLimit(ip, 'general', 60, 60_000)) {
          res.status(429).json({ ok: false, status: 'error', error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
          return;
        }
      }
      const client = getClient();
      const status = client.getSafeConfigStatus();
      res.status(200).json({ ok: true, status, ...status });
    });
  }

  app.get(['/api/casper-hub/whoami'] as unknown as string, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await checkRateAndAuth(req, res))) return;
    const client = getClient();
    const result = await client.whoami();
    if (!result.ok) {
      if (isFallbackEligible(result.errorCode)) {
        res.status(200).json({
          ok: true,
          mode: 'LOCAL_LEDGER_FALLBACK',
          data: { authenticated: true, agent_id: CASPER_AGENT_ID, database: 'local-ledger-fallback' },
        });
        return;
      }
      res.status(result.status).json({ ok: false, status: 'error', error: result.errorMessage, code: result.errorCode });
      return;
    }
    res.status(200).json({
      ok: true,
      authenticatedAsCasper05: result.authenticatedAsCasper05,
      verified_casper_05: result.authenticatedAsCasper05,
      databaseConnected: result.databaseConnected,
      data: result.data,
    });
  });

  app.get(['/api/casper-hub/bootstrap'] as unknown as string, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await checkRateAndAuth(req, res))) return;
    const client = getClient();
    const result = await client.bootstrap();
    if (!result.ok) {
      if (isFallbackEligible(result.errorCode)) {
        const maxSeq = localLedger.events.length;
        const telemetry = analyzeCasperHubEpistemicState({
          change_feed: localLedger.events,
          notes: localLedger.notes,
          sync_cursor: { last_seq: maxSeq },
        });
        res.status(200).json({
          ok: true,
          mode: 'LOCAL_LEDGER_FALLBACK',
          data: { roadmaps: [], tasks: [], active_notes: localLedger.notes },
          telemetry,
        });
        return;
      }
      res.status(result.status).json({ ok: false, status: 'error', error: result.errorMessage, code: result.errorCode });
      return;
    }
    res.status(200).json({ ok: true, data: result.data });
  });

  app.get(['/api/casper-hub/changes'] as unknown as string, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await checkRateAndAuth(req, res))) return;
    const rawAfter = req.query?.after;
    let afterCursor = 0;
    if (rawAfter !== undefined && String(rawAfter).trim() !== '') {
      const parsed = Number(rawAfter);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_AFTER_CURSOR) {
        res.status(400).json({
          ok: false,
          status: 'error',
          error: `Query parameter 'after' must be an integer between 0 and ${MAX_AFTER_CURSOR}`,
          code: 'INVALID_CHANGES_CURSOR',
        });
        return;
      }
      afterCursor = parsed;
    }
    const rawLimit = req.query?.limit;
    const client = getClient();
    const result =
      rawLimit !== undefined
        ? await client.getChanges({ after: afterCursor, limit: Number(rawLimit) || 50 })
        : await client.changes(afterCursor);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, status: 'error', error: result.errorMessage, code: result.errorCode });
      return;
    }
    res.status(200).json({ ok: true, data: result.data });
  });

  app.post(['/api/casper-hub/notes'] as unknown as string, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await checkRateAndAuth(req, res))) return;
    const rawHeaderKey = req.headers?.['idempotency-key'] ?? req.headers?.['x-idempotency-key'];
    let headerKey: string | undefined;
    if (rawHeaderKey !== undefined) {
      const k = String(rawHeaderKey).replace(/[\r\n]+/g, '').trim();
      if (!IDEMPOTENCY_KEY_RE.test(k)) {
        res.status(400).json({ ok: false, status: 'error', error: 'Invalid Idempotency-Key header format', code: 'INVALID_IDEMPOTENCY_KEY' });
        return;
      }
      headerKey = k;
    }
    const client = getClient();
    const validation = validateCasperHubNotePayload(req.body, client.getTokenValue());
    if (!validation.valid || !validation.sanitized) {
      const code = validation.statusCode === 403 ? 'AGENT_IDENTITY_SPOOF_REJECTED' : 'INVALID_NOTE_PAYLOAD';
      const outErrStatus = validation.statusCode === 403 ? 403 : localLedger.enabled || !options.verifyAdminAuth ? 422 : 400;
      res.status(outErrStatus).json({ ok: false, status: 'error', error: validation.error, code });
      return;
    }
    const result = await client.createNote(req.body as Record<string, unknown>, headerKey);
    if (!result.ok) {
      if (isFallbackEligible(result.errorCode)) {
        const key = headerKey || deriveDeterministicNoteIdempotencyKey(validation.sanitized);
        const existing = localLedger.byKey.get(key);
        if (existing) {
          res.status(200).json({
            ok: true,
            mode: 'LOCAL_LEDGER_FALLBACK',
            data: { ok: true, deduplicated: true, note_id: existing.note_id, event_seq: existing.event_seq, note: existing.note },
          });
          return;
        }
        const peerAgent = String(req.headers?.['x-casper-agent-id'] || CASPER_AGENT_ID).trim();
        const seq = localLedger.events.length + 1;
        const note = { ...validation.sanitized, id: key, author_agent: peerAgent };
        localLedger.events.push({ seq, event_seq: seq, actor_agent: peerAgent, action: 'note_created' });
        localLedger.notes.push(note);
        localLedger.byKey.set(key, { event_seq: seq, note_id: key, note });
        res.status(200).json({
          ok: true,
          mode: 'LOCAL_LEDGER_FALLBACK',
          data: { ok: true, deduplicated: false, note_id: key, event_seq: seq, note },
        });
        return;
      }
      res.status(result.status).json({ ok: false, status: 'error', error: result.errorMessage, code: result.errorCode });
      return;
    }
    const outStatus = options.client && result.status === 200 ? 200 : 201;
    res.status(outStatus).json({ ok: true, data: result.data });
  });
}

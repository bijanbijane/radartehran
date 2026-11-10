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
} from './casperHubClient';

export interface CasperHubRoutesOptions {
  client?: CasperHubClient;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status: number; message: string }>;
}

const registeredCasperHubApps = new WeakSet<Express>();

async function ensureCasperHubAdminAuthorized(
  req: Request,
  res: Response,
  options?: CasperHubRoutesOptions,
): Promise<boolean> {
  const ip = options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1';
  if (options?.verifyAdminAuth) {
    const auth = await options.verifyAdminAuth(req);
    if (!auth.ok) {
      recordAbuseSignal(ip, 'auth_failure');
      res.status(auth.status).json({
        status: 'error',
        code: auth.message || 'ADMIN_AUTH_REQUIRED',
      });
      return false;
    }
    return true;
  }

  const fallbackAuth = await verifyAdminApiAuthorization(
    req.headers as Record<string, string | string[] | undefined>,
  );
  if (!fallbackAuth.authorized) {
    recordAbuseSignal(ip, 'auth_failure');
    res.status(fallbackAuth.statusCode).json({
      status: 'error',
      code: fallbackAuth.reason || 'ADMIN_AUTH_REQUIRED',
    });
    return false;
  }
  return true;
}

export function registerCasperHubRoutes(app: Express, options?: CasperHubRoutesOptions): void {
  if (registeredCasperHubApps.has(app)) return;
  registeredCasperHubApps.add(app);

  const client = options?.client ?? defaultCasperHubClient;
  const getClientIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const checkRateLimit =
    options?.checkRateLimit ??
    ((_ip: string, _bucket: 'general', _max: number, _windowMs: number) => true);
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
    res.status(result.status).json(
      result.ok
        ? { status: 'ok', data: result.data }
        : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
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
    res.status(result.status).json(
      result.ok
        ? {
            status: 'ok',
            data: result.data,
            telemetry: analyzeCasperHubEpistemicState(result.data),
          }
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

    const after = typeof req.query.after === 'string' ? req.query.after : 0;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const result = await client.getChanges<Record<string, unknown>>({ after, limit });
    res.status(result.status).json(
      result.ok
        ? {
            status: 'ok',
            data: result.data,
            telemetry: analyzeCasperHubEpistemicState(result.data),
          }
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
      res.status(400).json({
        status: 'error',
        code: 'INVALID_NOTE_PAYLOAD',
        message: 'Request body must be a JSON object.',
      });
      return;
    }

    const headerIdempotencyKey =
      (typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : '') ||
      (typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'] : '');

    const result = await client.postNote(req.body as Record<string, unknown>, {
      idempotencyKey: headerIdempotencyKey || undefined,
    });
    res.status(result.status).json(
      result.ok
        ? { status: 'ok', data: result.data }
        : { status: 'error', code: result.errorCode, message: result.errorMessage, data: result.data },
    );
  });
}

/**
 * @file worker/routes/researchRoutes.ts
 * @description Authenticated Worker HTTP routes for RESEARCH_DB behavioral event ingestion,
 * k-anonymity-enforced aggregation queries, and retention purge execution.
 */
import { authenticateWorkerRouteCompat } from '../auth/routeAuthCompat';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { requireResearchDb } from '../db/bindingResolver';
import { RESEARCH_EVENT_POLICIES, type AllowedResearchEventType } from '../research/researchEventContract';
import {
  AggregationWindowPolicyError,
  computeKAnonymousResearchAggregation,
  ingestResearchEventsBatch,
  purgeExpiredResearchData,
  resolveKAnonymityMinCohort,
} from '../research/researchService';
import type { WorkerRequestContext } from '../types';

export async function handleResearchWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { method, pathname, env, request, url } = ctx;
  if (!pathname.startsWith('/api/v1/research/')) return null;

  // 1. POST /api/v1/research/events — authenticated user with server-side consent verification
  if (method === 'POST' && pathname === '/api/v1/research/events') {
    const auth = await authenticateWorkerRouteCompat(ctx, { requireAppCheck: false });
    if (!auth.authenticated || !auth.uid) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 401 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'UNAUTHORIZED',
      });
    }

    const parsed = await readValidatedJsonBody(request, 128 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, {
        status: 'error',
        code: parsed.code,
        message: parsed.messageFa,
      });
    }

    const rawEvents = Array.isArray(parsed.body.events)
      ? parsed.body.events
      : parsed.body.event
        ? [parsed.body.event]
        : null;

    const result = await ingestResearchEventsBatch({
      env,
      uid: auth.uid,
      clientIp: ctx.clientIp,
      rawEvents,
    });

    if (result.ok === false) {
      const extraHeaders = result.retryAfterSeconds
        ? { 'Retry-After': String(result.retryAfterSeconds) }
        : undefined;
      return jsonWorkerResponse(
        ctx,
        result.statusCode,
        { status: 'error', code: result.code, message: result.messageFa },
        { extraHeaders },
      );
    }

    return jsonWorkerResponse(ctx, 202, {
      status: 'ok',
      batchId: result.batchId,
      receiptId: result.receiptId,
      acceptedCount: result.acceptedCount,
      deduplicatedCount: result.deduplicatedCount,
      rejectedCount: result.rejectedCount,
      rejections: result.rejections,
    });
  }

  // 2. GET /api/v1/research/aggregates — admin-gated k-anonymity aggregation
  if (method === 'GET' && pathname === '/api/v1/research/aggregates') {
    const auth = await authenticateWorkerRouteCompat(ctx, { requireAppCheck: true });
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 403 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'ADMIN_FORBIDDEN',
      });
    }

    const researchDbRes = requireResearchDb(env);
    if (researchDbRes.ok === false) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: researchDbRes.code, message: researchDbRes.messageFa });
    }

    const eventType = String(url.searchParams.get('eventType') || '').trim() as AllowedResearchEventType;
    if (!RESEARCH_EVENT_POLICIES[eventType]) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'UNKNOWN_RESEARCH_EVENT_TYPE' });
    }
    const cityId = String(url.searchParams.get('cityId') || 'tehran').trim().toLowerCase();
    const hoodParam = url.searchParams.get('hoodId');
    const hoodId = hoodParam ? Number(hoodParam) : null;
    if (hoodId !== null && (!Number.isInteger(hoodId) || hoodId < 1)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_RESEARCH_HOOD_ID' });
    }

    const now = new Date();
    const utcTodayMidnightMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const defaultStart = new Date(utcTodayMidnightMs - 30 * 24 * 60 * 60 * 1000).toISOString();
    const defaultEnd = new Date(utcTodayMidnightMs + 24 * 60 * 60 * 1000).toISOString();
    const windowStartIso = url.searchParams.get('windowStartIso') || defaultStart;
    const windowEndIso = url.searchParams.get('windowEndIso') || defaultEnd;
    if (Number.isNaN(Date.parse(windowStartIso)) || Number.isNaN(Date.parse(windowEndIso))) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_AGGREGATION_WINDOW' });
    }

    try {
      const aggregation = await computeKAnonymousResearchAggregation({
        researchDb: researchDbRes.db,
        eventType,
        cityId,
        hoodId,
        windowStartIso,
        windowEndIso,
        minCohortSize: resolveKAnonymityMinCohort(env),
      });

      return jsonWorkerResponse(ctx, 200, { status: 'ok', aggregation });
    } catch (err) {
      if (err instanceof AggregationWindowPolicyError) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  // 3. POST /api/v1/research/retention/purge — admin-gated expiration cleanup
  if (method === 'POST' && pathname === '/api/v1/research/retention/purge') {
    const auth = await authenticateWorkerRouteCompat(ctx, { requireAppCheck: true });
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 403 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'ADMIN_FORBIDDEN',
      });
    }

    const researchDbRes = requireResearchDb(env);
    if (researchDbRes.ok === false) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: researchDbRes.code, message: researchDbRes.messageFa });
    }

    const purgeReport = await purgeExpiredResearchData({ researchDb: researchDbRes.db });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', purgeReport });
  }

  return null;
}

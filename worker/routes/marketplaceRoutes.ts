import { authenticateWorkerSession } from '../auth/sessionAuth';
import { jsonWorkerResponse } from '../contextAndSecurity';
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireUserDb } from '../db/bindingResolver';
import { getMarketStateFromD1 } from '../marketplace/d1MarketplaceRepository';
import type { WorkerRequestContext } from '../types';

const SUPPORTED_CITY_IDS = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

function parseHoodIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').slice(0, 100);
  const ids = parts.map((part) => Number(part.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > 9999)) return undefined;
  return Array.from(new Set(ids));
}

export async function handleMarketplaceWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (ctx.method !== 'GET' || ctx.pathname !== '/api/v1/market/state') return null;

  const userDbResult = requireUserDb(ctx.env);
  if (userDbResult.ok === false) {
    return jsonWorkerResponse(ctx, userDbResult.statusCode, {
      status: 'error',
      code: userDbResult.code,
      message: userDbResult.messageFa,
    });
  }

  const cityId = String(ctx.url.searchParams.get('cityId') || 'tehran').trim().toLowerCase();
  if (!SUPPORTED_CITY_IDS.has(cityId)) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CITY_ID' });
  }
  const hoodIds = parseHoodIds(ctx.url.searchParams.get('hoodIds'));
  if (ctx.url.searchParams.has('hoodIds') && !hoodIds) {
    return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_HOOD_IDS' });
  }

  const rateLimit = await evaluateTieredWorkerRateLimit({
    tier: 'strong_durable',
    action: 'public_read',
    subjectKey: ctx.clientIp,
    maxRequests: 90,
    windowSeconds: 60,
    db: userDbResult.db,
  });
  if (!rateLimit.allowed) {
    return jsonWorkerResponse(ctx, 429, {
      status: 'error',
      code: 'MARKET_STATE_RATE_LIMITED',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const principal = await authenticateWorkerSession(ctx);
  const authenticatedUid = principal.authenticated ? principal.uid || undefined : undefined;
  const includeAdminRecords = Boolean(principal.authenticated && principal.isAdmin);
  const state = await getMarketStateFromD1(userDbResult.db, {
    cityId,
    hoodIds,
    uid: authenticatedUid,
    includeAdminRecords,
  });

  return jsonWorkerResponse(ctx, 200, {
    status: 'ok',
    cityId,
    authenticated: Boolean(principal.authenticated),
    isAdmin: includeAdminRecords,
    ...state,
  }, { cacheControl: 'private, no-store' });
}

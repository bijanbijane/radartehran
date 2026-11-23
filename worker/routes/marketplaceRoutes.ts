import { authenticateWorkerSession } from '../auth/sessionAuth';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireUserDb } from '../db/bindingResolver';
import { getMarketStateFromD1 } from '../marketplace/d1MarketplaceRepository';
import type { D1Database, WorkerRequestContext } from '../types';

const SUPPORTED_CITY_IDS = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

function parseHoodIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').slice(0, 100);
  const ids = parts.map((part) => Number(part.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > 9999)) return undefined;
  return Array.from(new Set(ids));
}

function safeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function validMutationOrigin(ctx: WorkerRequestContext): boolean {
  const origin = ctx.request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(ctx.env.APP_URL || 'https://radartehran.ir').origin;
  } catch {
    return false;
  }
}

async function requireAuthenticatedMutation(ctx: WorkerRequestContext) {
  if (!validMutationOrigin(ctx)) {
    return { response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'UNTRUSTED_MUTATION_ORIGIN' }), db: null, uid: null };
  }
  const userDbResult = requireUserDb(ctx.env);
  if (!userDbResult.ok) {
    return {
      response: jsonWorkerResponse(ctx, userDbResult.statusCode, {
        status: 'error', code: userDbResult.code, message: userDbResult.messageFa,
      }),
      db: null,
      uid: null,
    };
  }
  const principal = await authenticateWorkerSession(ctx, true);
  if (!principal.authenticated || !principal.uid) {
    return {
      response: jsonWorkerResponse(ctx, principal.statusCode === 200 ? 401 : principal.statusCode, {
        status: 'error', code: principal.reasonCode || 'UNAUTHENTICATED',
      }),
      db: null,
      uid: null,
    };
  }
  if (!principal.emailVerified && !principal.phoneNumber) {
    return { response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'VERIFIED_IDENTITY_REQUIRED' }), db: null, uid: null };
  }
  const writeBlock = await userDbResult.db.prepare(
    'SELECT block_reason FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL LIMIT 1',
  ).bind(principal.uid).first<{ block_reason: string }>();
  if (writeBlock) {
    return { response: jsonWorkerResponse(ctx, 423, { status: 'error', code: 'ACCOUNT_WRITE_BLOCKED', reason: writeBlock.block_reason }), db: null, uid: null };
  }
  return { response: null, db: userDbResult.db, uid: principal.uid };
}

async function enforceMutationLimit(
  ctx: WorkerRequestContext,
  db: D1Database,
  uid: string,
  action: 'buyer_lead' | 'account_auth',
  maxRequests: number,
): Promise<Response | null> {
  const result = await evaluateTieredWorkerRateLimit({
    tier: 'strong_durable',
    action,
    subjectKey: uid,
    maxRequests,
    windowSeconds: 60 * 60,
    db,
  });
  if (result.allowed) return null;
  return jsonWorkerResponse(ctx, 429, {
    status: 'error',
    code: 'MARKET_MUTATION_RATE_LIMITED',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

export async function handleMarketplaceWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (ctx.method === 'GET' && ctx.pathname === '/api/v1/market/state') {
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

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/market/votes') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response) return auth.response;
    const body = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const air = boundedNumber(body.body.air, 1, 10);
    const power = boundedNumber(body.body.powerWater, 1, 10);
    const internet = boundedNumber(body.body.internet, 1, 10);
    const metro = boundedNumber(body.body.metro, 1, 10);
    const security = boundedNumber(body.body.security, 1, 10);
    const flat = boundedNumber(body.body.flatTerrain, 1, 10);
    const comment = safeText(body.body.comment, 1000);
    const profile = await auth.db!.prepare('SELECT display_name FROM user_profiles WHERE uid = ?1 LIMIT 1').bind(auth.uid).first<{ display_name: string | null }>();
    const displayName = safeText(profile?.display_name, 100) || 'کاربر';
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || air === null || power === null
      || internet === null || metro === null || security === null || flat === null) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_VOTE_PAYLOAD' });
    }
    const rateLimited = await enforceMutationLimit(ctx, auth.db!, auth.uid!, 'buyer_lead', 20);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const voteId = crypto.randomUUID();
    const savedVote = await auth.db!.prepare(
      `INSERT INTO neighborhood_votes (
        vote_id, owner_uid, city_id, hood_id, air_score, power_score, internet_score,
        metro_score, security_score, flat_score, comment, user_display_name, created_at_iso, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
      ON CONFLICT(owner_uid, city_id, hood_id) DO UPDATE SET
        air_score = excluded.air_score, power_score = excluded.power_score,
        internet_score = excluded.internet_score, metro_score = excluded.metro_score,
        security_score = excluded.security_score, flat_score = excluded.flat_score,
        comment = excluded.comment, user_display_name = excluded.user_display_name,
        updated_at_iso = excluded.updated_at_iso
      RETURNING vote_id`,
    ).bind(voteId, auth.uid, cityId, hoodId, air, power, internet, metro, security, flat, comment, displayName, now)
      .first<{ vote_id: string }>();
    if (!savedVote?.vote_id) return jsonWorkerResponse(ctx, 500, { status: 'error', code: 'VOTE_PERSISTENCE_FAILED' });
    const persistedVote = await auth.db!.prepare(
      'SELECT vote_id FROM neighborhood_votes WHERE owner_uid = ?1 AND city_id = ?2 AND hood_id = ?3 LIMIT 1',
    ).bind(auth.uid, cityId, hoodId).first<{ vote_id: string }>();
    return jsonWorkerResponse(ctx, 201, {
      status: 'ok', durable: true,
      vote: { id: String(persistedVote?.vote_id || voteId), cityId, hoodId, air, powerWater: power, internet, metro, security, flatTerrain: flat, comment, userDisplayName: displayName, updatedAtIso: now },
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/market/preferences') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response) return auth.response;
    const body = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const mode = body.body.mode === 'buy' ? 'buy' : body.body.mode === 'rent' ? 'rent' : null;
    const deposit = boundedNumber(body.body.deposit, 0, 100000);
    const monthlyRent = boundedNumber(body.body.monthlyRent, 0, 1000);
    const buyTotalBudget = boundedNumber(body.body.buyTotalBudget, 500, 1000000);
    const targetSqm = boundedNumber(body.body.targetSqm, 20, 1000);
    const workHubId = safeText(body.body.workHubId || 'none', 40);
    const rawFavorites = Array.isArray(body.body.favoriteHoodIds) ? body.body.favoriteHoodIds : [];
    const favorites = Array.from(new Set(rawFavorites.map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 999))).slice(0, 25);
    if (!SUPPORTED_CITY_IDS.has(cityId) || !mode || deposit === null || monthlyRent === null
      || buyTotalBudget === null || targetSqm === null || rawFavorites.length > 100) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_PREFERENCES_PAYLOAD' });
    }
    const rateLimited = await enforceMutationLimit(ctx, auth.db!, auth.uid!, 'account_auth', 30);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const statements = [
      auth.db!.prepare(
        `INSERT INTO user_preferences (uid, mode, deposit, monthly_rent, buy_total_budget, target_sqm, work_hub_id, updated_at_iso)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(uid) DO UPDATE SET mode = excluded.mode, deposit = excluded.deposit,
           monthly_rent = excluded.monthly_rent, buy_total_budget = excluded.buy_total_budget,
           target_sqm = excluded.target_sqm, work_hub_id = excluded.work_hub_id, updated_at_iso = excluded.updated_at_iso`,
      ).bind(auth.uid, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, now),
      auth.db!.prepare('DELETE FROM user_favorites WHERE uid = ?1 AND city_id = ?2').bind(auth.uid, cityId),
      ...favorites.map((hoodId) => auth.db!.prepare(
        'INSERT OR IGNORE INTO user_favorites (uid, city_id, hood_id, created_at_iso) VALUES (?1, ?2, ?3, ?4)',
      ).bind(auth.uid, cityId, hoodId, now)),
    ];
    await auth.db!.batch(statements);
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, updatedAtIso: now }, { cacheControl: 'private, no-store' });
  }

  return null;
}

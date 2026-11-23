import { authenticateWorkerSession, sha256Hex } from '../auth/sessionAuth';
import { normalizePhone } from './authRoutes';
import { persistIdempotentMutation } from '../marketplace/d1MarketplaceMutations';
import { encryptMarketPhone, hashMarketPhone } from '../marketplace/marketPiiCrypto';
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
    return { response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'UNTRUSTED_MUTATION_ORIGIN' }), db: null, uid: null, isAdmin: false };
  }
  const userDbResult = requireUserDb(ctx.env);
  if (!userDbResult.ok) {
    return {
      response: jsonWorkerResponse(ctx, userDbResult.statusCode, {
        status: 'error', code: userDbResult.code, message: userDbResult.messageFa,
      }),
      db: null,
      uid: null,
      isAdmin: false,
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
      isAdmin: false,
    };
  }
  if (!principal.emailVerified && !principal.phoneNumber) {
    return { response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'VERIFIED_IDENTITY_REQUIRED' }), db: null, uid: null, isAdmin: false };
  }
  const writeBlock = await userDbResult.db.prepare(
    'SELECT block_reason FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL LIMIT 1',
  ).bind(principal.uid).first<{ block_reason: string }>();
  if (writeBlock) {
    return { response: jsonWorkerResponse(ctx, 423, { status: 'error', code: 'ACCOUNT_WRITE_BLOCKED', reason: writeBlock.block_reason }), db: null, uid: null, isAdmin: false };
  }
  return { response: null, db: userDbResult.db, uid: principal.uid, isAdmin: principal.isAdmin };
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

function readIdempotencyKey(ctx: WorkerRequestContext): string {
  const value = (ctx.request.headers.get('idempotency-key') || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : '';
}

function idempotencyFailure(ctx: WorkerRequestContext, result: 'conflict' | 'not_committed'): Response {
  return result === 'conflict'
    ? jsonWorkerResponse(ctx, 409, { status: 'error', code: 'IDEMPOTENCY_KEY_REUSED_OR_CONFLICT' })
    : jsonWorkerResponse(ctx, 503, { status: 'error', code: 'MARKET_MUTATION_NOT_COMMITTED' });
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
    }, ctx.env);

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      cityId,
      authenticated: Boolean(principal.authenticated),
      isAdmin: includeAdminRecords,
      ...state,
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/market/bargains') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response) return auth.response;
    const body = await readValidatedJsonBody(ctx.request, 12 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const title = safeText(body.body.title, 160);
    const listingType = body.body.type === 'خرید' ? 'خرید' : body.body.type === 'اجاره' ? 'اجاره' : null;
    const sqm = boundedNumber(body.body.sqm, 25, 1000);
    const priceMillions = boundedNumber(body.body.priceMillions, 0.01, 100000000);
    const priceText = safeText(body.body.priceText, 160);
    const discountPercent = boundedNumber(body.body.discountPercent, 10, 60);
    const buyerProfitText = safeText(body.body.buyerProfitText, 160);
    const street = safeText(body.body.street, 120);
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId) || !title || !listingType ||
        sqm === null || !Number.isInteger(sqm) || priceMillions === null || !priceText || discountPercent === null || !street) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_PAYLOAD' });
    }
    const mediaObjectIds = Array.isArray(body.body.mediaObjectIds) ? body.body.mediaObjectIds : [];
    if (mediaObjectIds.length > 0 || body.body.imageUrl || body.body.imageUrls || body.body.videoUrl || body.body.media ||
        body.body.objectStorageKeys || body.body.objectStorageObjectIds) {
      return jsonWorkerResponse(ctx, 503, {
        status: 'error',
        code: 'MEDIA_STORAGE_NOT_AVAILABLE',
        message: 'Binary media uploads are disabled until an approved storage provider is configured. R2 remains deferred.',
      });
    }
    const key = readIdempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const rateLimited = await enforceMutationLimit(ctx, auth.db!, auth.uid!, 'buyer_lead', 12);
    if (rateLimited) return rateLimited;
    const status = auth.isAdmin ? 'approved' : 'pending';
    const now = new Date().toISOString();
    const normalized = { cityId, hoodId, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street, status };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `brg_${(await sha256Hex(`${auth.uid}:bargain.create:${key}`)).slice(0, 32)}`;
    const mutation = await persistIdempotentMutation({
      db: auth.db!,
      uid: auth.uid!,
      operationName: 'bargain.create',
      idempotencyKey: key,
      requestHash,
      resourceId,
      createdAtIso: now,
      resourceStatements: [
        auth.db!.prepare(
          `INSERT INTO bargains (
            bargain_id, owner_uid, city_id, hood_id, title, listing_type, sqm, price_millions,
            price_text, discount_percent, buyer_profit_text, street, media_metadata_json,
            status, created_at_iso, updated_at_iso, approved_at_iso
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '[]', ?13, ?14, ?14,
                 CASE WHEN ?13 = 'approved' THEN ?14 ELSE NULL END
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?2 AND operation_name = 'bargain.create' AND idempotency_key = ?15 AND request_hash = ?16
          )
          ON CONFLICT(bargain_id) DO NOTHING`,
        ).bind(resourceId, auth.uid, cityId, hoodId, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street, status, now, key, requestHash),
        auth.db!.prepare(
          `INSERT INTO bargain_projections (
            bargain_id, city_id, hood_id, hood_name, title, sqm, price_millions,
            discount_percent, lifecycle_state, updated_at_iso, owner_uid
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?11 AND operation_name = 'bargain.create' AND idempotency_key = ?12 AND request_hash = ?13
          )
          ON CONFLICT(bargain_id) DO UPDATE SET
            title = excluded.title, sqm = excluded.sqm, price_millions = excluded.price_millions,
            discount_percent = excluded.discount_percent, lifecycle_state = excluded.lifecycle_state,
            updated_at_iso = excluded.updated_at_iso, owner_uid = excluded.owner_uid`,
        ).bind(resourceId, cityId, hoodId, safeText(body.body.hoodName, 120) || `محله ${hoodId}`, title, sqm, priceMillions, discountPercent, status, now, auth.uid, key, requestHash),
      ],
    });
    if (mutation.status === 'conflict' || mutation.status === 'not_committed') return idempotencyFailure(ctx, mutation.status);
    const record = await auth.db!.prepare(
      'SELECT bargain_id, status FROM bargains WHERE bargain_id = ?1 AND owner_uid = ?2 LIMIT 1',
    ).bind(mutation.resourceId, auth.uid).first<{ bargain_id: string; status: string }>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BARGAIN_RECORD_NOT_FOUND_AFTER_COMMIT' });
    return jsonWorkerResponse(ctx, mutation.status === 'replayed' ? 200 : 201, {
      status: 'ok', durable: true, bargainId: record.bargain_id, listingStatus: record.status,
      idempotentReplay: mutation.status === 'replayed',
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/market/sponsor-requests') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response) return auth.response;
    const body = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const hoodName = safeText(body.body.hoodName, 120);
    const agencyName = safeText(body.body.agencyName, 120);
    const phone = normalizePhone(body.body.phone);
    const specialty = safeText(body.body.specialty, 120);
    const experienceYears = boundedNumber(body.body.experienceYears, 0, 80);
    const monthlyTariff = boundedNumber(body.body.monthlyTariffMillion, 0, 100000);
    const planMonths = Number(body.body.planMonths) === 3 ? 3 : 1;
    const totalPayable = boundedNumber(body.body.totalPayableMillion, 0, 1000000);
    const trackingCode = safeText(body.body.trackingCode, 80);
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId) || !hoodName || !agencyName ||
        !phone || experienceYears === null || !Number.isInteger(experienceYears) || monthlyTariff === null || totalPayable === null) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_REQUEST' });
    }
    let phoneCiphertext: string;
    let phoneHash: string;
    try {
      [phoneCiphertext, phoneHash] = await Promise.all([encryptMarketPhone(phone, ctx.env), hashMarketPhone(phone, ctx.env)]);
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'MARKET_PII_ENCRYPTION_UNAVAILABLE' });
    }
    const phoneLast4 = phone.slice(-4);
    const key = readIdempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const rateLimited = await enforceMutationLimit(ctx, auth.db!, auth.uid!, 'buyer_lead', 8);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const status = auth.isAdmin ? 'approved' : 'pending';
    const expiresAtIso = auth.isAdmin
      ? safeText(body.body.expiresAtIso, 60) || new Date(Date.now() + (planMonths === 3 ? 90 : 30) * 86400000).toISOString()
      : null;
    const normalized = { cityId, hoodId, hoodName, agencyName, phoneHash, specialty, experienceYears, monthlyTariff, planMonths, totalPayable, trackingCode, status, expiresAtIso };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `spr_${(await sha256Hex(`${auth.uid}:sponsor.create:${key}`)).slice(0, 32)}`;
    const mutation = await persistIdempotentMutation({
      db: auth.db!, uid: auth.uid!, operationName: 'sponsor.create', idempotencyKey: key,
      requestHash, resourceId, createdAtIso: now,
      resourceStatements: [
        auth.db!.prepare(
          `INSERT INTO sponsor_requests (
            request_id, owner_uid, city_id, hood_id, hood_name, agency_name, phone_ciphertext, phone_hash, phone_last4,
            specialty, experience_years, monthly_tariff_million, plan_months, total_payable_million,
            tracking_code, status, expires_at_iso, created_at_iso, updated_at_iso
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?2 AND operation_name = 'sponsor.create' AND idempotency_key = ?19 AND request_hash = ?20
          )
          ON CONFLICT(request_id) DO NOTHING`,
        ).bind(resourceId, auth.uid, cityId, hoodId, hoodName, agencyName, phoneCiphertext, phoneHash, phoneLast4, specialty, experienceYears, monthlyTariff, planMonths, totalPayable, trackingCode, status, expiresAtIso, now, key, requestHash),
      ],
    });
    if (mutation.status === 'conflict' || mutation.status === 'not_committed') return idempotencyFailure(ctx, mutation.status);
    const record = await auth.db!.prepare(
      'SELECT request_id, status, tracking_code, monthly_tariff_million, total_payable_million FROM sponsor_requests WHERE request_id = ?1 AND owner_uid = ?2 LIMIT 1',
    ).bind(mutation.resourceId, auth.uid).first<Record<string, unknown>>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'SPONSOR_RECORD_NOT_FOUND_AFTER_COMMIT' });
    return jsonWorkerResponse(ctx, mutation.status === 'replayed' ? 200 : 201, {
      status: 'ok', durable: true, requestId: record.request_id, requestStatus: record.status,
      trackingCode: record.tracking_code, monthlyTariffMillion: record.monthly_tariff_million,
      totalPayableMillion: record.total_payable_million, idempotentReplay: mutation.status === 'replayed',
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/market/buyer-alerts') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response) return auth.response;
    const body = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const fullName = safeText(body.body.fullName, 100);
    const phone = normalizePhone(body.body.phone);
    const dealType = body.body.dealType === 'خرید' ? 'خرید' : body.body.dealType === 'اجاره' ? 'اجاره' : null;
    const maxBudgetMillion = boundedNumber(body.body.maxBudgetMillion, 0.01, 100000000);
    const consentVersion = safeText(body.body.consentVersion, 80);
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId) || !fullName ||
        !phone || !dealType || maxBudgetMillion === null || consentVersion !== 'buyer-alert-2026-10-v1') {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BUYER_ALERT' });
    }
    let phoneCiphertext: string;
    let phoneHash: string;
    try {
      [phoneCiphertext, phoneHash] = await Promise.all([encryptMarketPhone(phone, ctx.env), hashMarketPhone(phone, ctx.env)]);
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'MARKET_PII_ENCRYPTION_UNAVAILABLE' });
    }
    const phoneLast4 = phone.slice(-4);
    const key = readIdempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const rateLimited = await enforceMutationLimit(ctx, auth.db!, auth.uid!, 'buyer_lead', 5);
    if (rateLimited) return rateLimited;
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + 90 * 86400000).toISOString();
    const normalized = { cityId, hoodId, fullName, phoneHash, dealType, maxBudgetMillion, consentVersion };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `alr_${(await sha256Hex(`${auth.uid}:buyer-alert.create:${key}`)).slice(0, 32)}`;
    const mutation = await persistIdempotentMutation({
      db: auth.db!, uid: auth.uid!, operationName: 'buyer_alert.create', idempotencyKey: key,
      requestHash, resourceId, createdAtIso: nowIso,
      resourceStatements: [
        auth.db!.prepare(
          `INSERT INTO buyer_alerts (
            alert_id, owner_uid, city_id, hood_id, full_name, phone_ciphertext, phone_hash, phone_last4, deal_type,
            max_budget_million, consent_version, consent_at_iso, expires_at_iso, status, created_at_iso, updated_at_iso
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'active', ?12, ?12
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?2 AND operation_name = 'buyer_alert.create' AND idempotency_key = ?14 AND request_hash = ?15
          )
          ON CONFLICT(alert_id) DO NOTHING`,
        ).bind(resourceId, auth.uid, cityId, hoodId, fullName, phoneCiphertext, phoneHash, phoneLast4, dealType, maxBudgetMillion, consentVersion, nowIso, expiresAtIso, key, requestHash),
      ],
    });
    if (mutation.status === 'conflict' || mutation.status === 'not_committed') return idempotencyFailure(ctx, mutation.status);
    const record = await auth.db!.prepare(
      'SELECT alert_id, expires_at_iso FROM buyer_alerts WHERE alert_id = ?1 AND owner_uid = ?2 LIMIT 1',
    ).bind(mutation.resourceId, auth.uid).first<{ alert_id: string; expires_at_iso: string }>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BUYER_ALERT_RECORD_NOT_FOUND_AFTER_COMMIT' });
    return jsonWorkerResponse(ctx, mutation.status === 'replayed' ? 200 : 201, {
      status: 'ok', durable: true, alertId: record.alert_id, expiresAtIso: record.expires_at_iso,
      message: 'درخواست خریدار در Cloudflare D1 ذخیره شد.',
      idempotentReplay: mutation.status === 'replayed',
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

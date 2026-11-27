import { authenticateWorkerSession, sha256Hex } from '../auth/sessionAuth';
import { normalizePhone } from './authRoutes';
import { persistIdempotentMutation } from '../marketplace/d1MarketplaceMutations';
import { encryptMarketPhone, hashMarketPhone } from '../marketplace/marketPiiCrypto';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireUserDb } from '../db/bindingResolver';
import { getMarketStateFromD1 } from '../marketplace/d1MarketplaceRepository';
import { calculateCanonicalD1SponsorPricing } from '../marketplace/sponsorPricing';
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

type AuthenticatedMutationResult =
  | { response: Response; db: null; uid: null; isAdmin: false }
  | { response: null; db: D1Database; uid: string; isAdmin: boolean };

async function requireAuthenticatedMutation(ctx: WorkerRequestContext): Promise<AuthenticatedMutationResult> {
  const userDbResult = requireUserDb(ctx.env);
  if (userDbResult.ok === false) {
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


async function requireAdminMutation(ctx: WorkerRequestContext): Promise<AuthenticatedMutationResult> {
  const auth = await requireAuthenticatedMutation(ctx);
  if (auth.response !== null) return auth;
  if (!auth.isAdmin) {
    return {
      response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'MARKET_ADMIN_REQUIRED' }),
      db: null,
      uid: null,
      isAdmin: false,
    };
  }
  return auth;
}

function sanitizeSponsorOverride(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = safeText(row.name || row.agencyName, 120);
  if (!name) return null;
  const experienceYears = boundedNumber(row.experienceYears, 0, 80) ?? 0;
  const expiresAtIso = safeText(row.expiresAtIso, 60);
  const planType = row.planType === 'paid_3m' ? 'paid_3m' : row.planType === 'paid_1m' ? 'paid_1m' : 'free';
  return {
    name,
    phone: safeText(row.phone, 32),
    specialty: safeText(row.specialty, 120),
    experienceYears,
    expiresAtIso: expiresAtIso || undefined,
    planType,
  };
}

function isSuccessfulD1Batch(results: unknown, expectedLength: number): boolean {
  return Array.isArray(results) && results.length === expectedLength &&
    results.every((result) => Boolean(result && typeof result === 'object' && (result as { success?: unknown }).success === true));
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
    if (auth.response !== null) return auth.response;
    if (!auth.db || !auth.uid) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_NOT_BOUND' });
    const body = await readValidatedJsonBody(ctx.request, 12 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const requestedHoodName = safeText(body.body.hoodName, 120);
    const title = safeText(body.body.title, 160);
    const listingType = body.body.type === 'اجاره' ? 'اجاره' : body.body.type === 'خرید' ? 'خرید' : null;
    const sqm = boundedNumber(body.body.sqm, 25, 1000);
    const priceMillions = boundedNumber(body.body.priceMillions, 0.01, 10_000_000);
    const priceText = safeText(body.body.priceText, 160);
    const discountPercent = boundedNumber(body.body.discountPercent, 10, 60);
    const buyerProfitText = safeText(body.body.buyerProfitText, 160);
    const street = safeText(body.body.street, 120);
    const mediaObjectIds = Array.isArray(body.body.mediaObjectIds)
      ? body.body.mediaObjectIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id)).slice(0, 6)
      : [];
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId) ||
        !title || !listingType || sqm === null || !Number.isInteger(sqm) ||
        priceMillions === null || !priceText || discountPercent === null ||
        (Array.isArray(body.body.mediaObjectIds) && mediaObjectIds.length !== body.body.mediaObjectIds.length)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_REQUEST' });
    }
    // R2-backed media attachment is deferred; never silently discard uploaded object references.
    if (mediaObjectIds.length > 0 || safeText(body.body.videoUrl, 500)) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'MARKET_BARGAIN_MEDIA_NOT_AVAILABLE' });
    }
    const neighborhood = await auth.db.prepare(
      'SELECT name_fa FROM neighborhood_projections WHERE city_id = ?1 AND hood_id = ?2 LIMIT 1',
    ).bind(cityId, hoodId).first<{ name_fa: string }>();
    if (!neighborhood) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MARKET_NEIGHBORHOOD_NOT_FOUND' });
    const hoodName = safeText(neighborhood.name_fa, 120);
    if (requestedHoodName && requestedHoodName !== hoodName) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'MARKET_NEIGHBORHOOD_NAME_MISMATCH' });
    }
    const key = readIdempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const rateLimited = await enforceMutationLimit(ctx, auth.db, auth.uid, 'buyer_lead', 8);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const normalized = { cityId, hoodId, hoodName, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = 'brg_' + (await sha256Hex(auth.uid + ':bargain.create:' + key)).slice(0, 32);
    const mutation = await persistIdempotentMutation({
      db: auth.db, uid: auth.uid, operationName: 'bargain.create', idempotencyKey: key,
      requestHash, resourceId, createdAtIso: now,
      resourceStatements: [
        auth.db.prepare(
          `INSERT INTO bargains (
            bargain_id, owner_uid, city_id, hood_id, title, listing_type, sqm, price_millions,
            price_text, discount_percent, buyer_profit_text, street, media_metadata_json,
            status, created_at_iso, updated_at_iso
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '[]', 'pending', ?13, ?13
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?2 AND operation_name = 'bargain.create' AND idempotency_key = ?14 AND request_hash = ?15
          )
          ON CONFLICT(bargain_id) DO NOTHING`,
        ).bind(resourceId, auth.uid, cityId, hoodId, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street, now, key, requestHash),
        auth.db.prepare(
          `INSERT INTO bargain_projections (
            bargain_id, city_id, hood_id, hood_name, title, sqm, price_millions,
            discount_percent, lifecycle_state, updated_at_iso, owner_uid
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10
          WHERE EXISTS (
            SELECT 1 FROM market_mutation_idempotency
            WHERE uid = ?10 AND operation_name = 'bargain.create' AND idempotency_key = ?11 AND request_hash = ?12
          )
          ON CONFLICT(bargain_id) DO NOTHING`,
        ).bind(resourceId, cityId, hoodId, hoodName, title, sqm, priceMillions, discountPercent, now, auth.uid, key, requestHash),
      ],
    });
    if (mutation.status === 'conflict' || mutation.status === 'not_committed') return idempotencyFailure(ctx, mutation.status);
    const record = await auth.db.prepare(
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
    if (auth.response !== null) return auth.response;
    if (!auth.db || !auth.uid) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_NOT_BOUND' });
    const body = await readValidatedJsonBody(ctx.request, 12 * 1024);
    if (!body.ok) return jsonWorkerResponse(ctx, body.status, { status: 'error', code: body.code, message: body.messageFa });
    const cityId = safeText(body.body.cityId || 'tehran', 20).toLowerCase();
    const requestedHoodId = boundedNumber(body.body.hoodId, 1, 9999);
    const requestedHoodName = safeText(body.body.hoodName, 120);
    const agencyName = safeText(body.body.agencyName, 120);
    const phone = normalizePhone(body.body.phone);
    const specialty = safeText(body.body.specialty, 120);
    const experienceYears = boundedNumber(body.body.experienceYears, 0, 80);
    const requestedPlanMonths = Number(body.body.planMonths) === 3 ? 3 : 1;
    if (!SUPPORTED_CITY_IDS.has(cityId) || requestedHoodId === null || !Number.isInteger(requestedHoodId) ||
        !agencyName || !phone || experienceYears === null || !Number.isInteger(experienceYears)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_REQUEST' });
    }

    const neighbourhood = await auth.db.prepare([
      'SELECT p.name_fa, p.buy_per_sqm_million, o.buy_per_sqm',
      'FROM neighborhood_projections p',
      'LEFT JOIN neighborhood_overrides o ON o.city_id = p.city_id AND o.hood_id = p.hood_id',
      'WHERE p.city_id = ?1 AND p.hood_id = ?2 LIMIT 1',
    ].join(' ')).bind(cityId, requestedHoodId).first<{
      name_fa: string; buy_per_sqm_million: number; buy_per_sqm: number | null;
    }>();
    if (!neighbourhood) {
      return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MARKET_NEIGHBORHOOD_NOT_FOUND' });
    }
    const hoodName = safeText(neighbourhood.name_fa, 120);
    if (requestedHoodName && requestedHoodName !== hoodName) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'MARKET_NEIGHBORHOOD_NAME_MISMATCH' });
    }

    const monetization = await auth.db.prepare(
      "SELECT config_json FROM app_config WHERE config_key = 'monetization' LIMIT 1",
    ).first<{ config_json: string }>();
    let campaignDiscountPercent = 0;
    try {
      const config = JSON.parse(String(monetization?.config_json || '{}')) as Record<string, unknown>;
      const value = Number(config.campaignDiscountPercent);
      if (Number.isFinite(value) && value >= 0 && value <= 100) campaignDiscountPercent = value;
    } catch {
      // Corrupt optional discount settings fall back to the undiscounted canonical tariff.
    }
    const pricing = calculateCanonicalD1SponsorPricing(
      neighbourhood.buy_per_sqm ?? neighbourhood.buy_per_sqm_million,
      campaignDiscountPercent,
      requestedPlanMonths,
    );
    if (!pricing) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_PRICING_UNAVAILABLE' });

    const hoodId = requestedHoodId;
    const { planMonths, monthlyTariffMillion, totalPayableMillion, durationDays } = pricing;
    const randomBytes = crypto.getRandomValues(new Uint8Array(3));
    const trackingSuffix = Array.from(randomBytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const trackingCode = 'SP-' + hoodId + '-' + trackingSuffix;
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
    const rateLimited = await enforceMutationLimit(ctx, auth.db, auth.uid, 'buyer_lead', 8);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const status = 'pending';
    const expiresAtIso = null;
    const normalized = { cityId, hoodId, hoodName, agencyName, phoneHash, specialty, experienceYears, monthlyTariffMillion, planMonths, totalPayableMillion, campaignDiscountPercent, status, expiresAtIso };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `spr_${(await sha256Hex(`${auth.uid}:sponsor.create:${key}`)).slice(0, 32)}`;
    const mutation = await persistIdempotentMutation({
      db: auth.db!, uid: auth.uid!, operationName: 'sponsor.create', idempotencyKey: key,
      requestHash, resourceId, createdAtIso: now,
      resourceStatements: [
        auth.db.prepare(
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
        ).bind(resourceId, auth.uid, cityId, hoodId, hoodName, agencyName, phoneCiphertext, phoneHash, phoneLast4, specialty, experienceYears, monthlyTariffMillion, planMonths, totalPayableMillion, trackingCode, status, expiresAtIso, now, key, requestHash),
      ],
    });
    if (mutation.status === 'conflict' || mutation.status === 'not_committed') return idempotencyFailure(ctx, mutation.status);
    const record = await auth.db.prepare(
      'SELECT request_id, status, tracking_code, monthly_tariff_million, total_payable_million FROM sponsor_requests WHERE request_id = ?1 AND owner_uid = ?2 LIMIT 1',
    ).bind(mutation.resourceId, auth.uid).first<Record<string, unknown>>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'SPONSOR_RECORD_NOT_FOUND_AFTER_COMMIT' });
    return jsonWorkerResponse(ctx, mutation.status === 'replayed' ? 200 : 201, {
      status: 'ok', durable: true, requestId: record.request_id, requestStatus: record.status,
      trackingCode: record.tracking_code, monthlyTariffMillion: record.monthly_tariff_million,
      totalPayableMillion: record.total_payable_million, durationDays,
      idempotentReplay: mutation.status === 'replayed',
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/market/buyer-alerts') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response !== null) return auth.response;
    if (!auth.db || !auth.uid) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_NOT_BOUND' });
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
        !phone || !dealType || maxBudgetMillion === null || body.body.privacyConsent !== true ||
        consentVersion !== 'buyer-alert-2026-10-v1') {
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
    const rateLimited = await enforceMutationLimit(ctx, auth.db, auth.uid, 'buyer_lead', 5);
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
        auth.db.prepare(
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
    const record = await auth.db.prepare(
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
    if (auth.response !== null) return auth.response;
    if (!auth.db || !auth.uid) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_NOT_BOUND' });
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
    const profile = await auth.db.prepare('SELECT display_name FROM user_profiles WHERE uid = ?1 LIMIT 1').bind(auth.uid).first<{ display_name: string | null }>();
    const displayName = safeText(profile?.display_name, 100) || 'کاربر';
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || air === null || power === null
      || internet === null || metro === null || security === null || flat === null) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_VOTE_PAYLOAD' });
    }
    const rateLimited = await enforceMutationLimit(ctx, auth.db, auth.uid, 'buyer_lead', 20);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const voteId = crypto.randomUUID();
    const savedVote = await auth.db.prepare(
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
    return jsonWorkerResponse(ctx, 201, {
      status: 'ok', durable: true,
      // RETURNING provides the canonical id, including when ON CONFLICT updates an existing vote.
      vote: { id: String(savedVote.vote_id), cityId, hoodId, air, powerWater: power, internet, metro, security, flatTerrain: flat, comment, userDisplayName: displayName, updatedAtIso: now },
    }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/market/preferences') {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response !== null) return auth.response;
    if (!auth.db || !auth.uid) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'USER_DB_NOT_BOUND' });
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
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 9999))).slice(0, 25);
    if (!SUPPORTED_CITY_IDS.has(cityId) || !mode || deposit === null || monthlyRent === null
      || buyTotalBudget === null || targetSqm === null || rawFavorites.length > 100) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_PREFERENCES_PAYLOAD' });
    }
    const rateLimited = await enforceMutationLimit(ctx, auth.db, auth.uid, 'account_auth', 30);
    if (rateLimited) return rateLimited;
    const now = new Date().toISOString();
    const statements = [
      auth.db.prepare(
        `INSERT INTO user_preferences (uid, mode, deposit, monthly_rent, buy_total_budget, target_sqm, work_hub_id, updated_at_iso)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(uid) DO UPDATE SET mode = excluded.mode, deposit = excluded.deposit,
           monthly_rent = excluded.monthly_rent, buy_total_budget = excluded.buy_total_budget,
           target_sqm = excluded.target_sqm, work_hub_id = excluded.work_hub_id, updated_at_iso = excluded.updated_at_iso`,
      ).bind(auth.uid, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, now),
      auth.db.prepare('DELETE FROM user_favorites WHERE uid = ?1 AND city_id = ?2').bind(auth.uid, cityId),
      ...favorites.map((hoodId) => auth.db.prepare(
        'INSERT OR IGNORE INTO user_favorites (uid, city_id, hood_id, created_at_iso) VALUES (?1, ?2, ?3, ?4)',
      ).bind(auth.uid, cityId, hoodId, now)),
    ];
    try {
      const results = await auth.db!.batch(statements);
      if (!Array.isArray(results) || results.length !== statements.length || results.some((result) => result.success !== true)) {
        return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PREFERENCES_PERSISTENCE_FAILED' });
      }
    } catch {
      // The caller may safely retry this idempotent preference replacement.
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PREFERENCES_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, updatedAtIso: now }, { cacheControl: 'private, no-store' });
  }


  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/admin/market/neighborhood-overrides') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 16 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const cityId = safeText(parsed.body.cityId || 'tehran', 20).toLowerCase();
    const hoodId = boundedNumber(parsed.body.hoodId, 1, 9999);
    const buyPerSqm = parsed.body.buyPerSqm === undefined || parsed.body.buyPerSqm === null
      ? undefined : boundedNumber(parsed.body.buyPerSqm, 10, 5000);
    const rahn80m = parsed.body.rahn80m === undefined || parsed.body.rahn80m === null
      ? undefined : boundedNumber(parsed.body.rahn80m, 50, 100000);
    const hasSponsor = Object.prototype.hasOwnProperty.call(parsed.body, 'sponsor');
    const sponsor = hasSponsor ? sanitizeSponsorOverride(parsed.body.sponsor) : undefined;
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId) ||
        (parsed.body.buyPerSqm !== undefined && parsed.body.buyPerSqm !== null && buyPerSqm === null) ||
        (parsed.body.rahn80m !== undefined && parsed.body.rahn80m !== null && rahn80m === null) ||
        (hasSponsor && parsed.body.sponsor !== null && !sponsor)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_NEIGHBORHOOD_OVERRIDE' });
    }
    const existing = await auth.db.prepare(
      'SELECT buy_per_sqm, rahn_80m, sponsor_json FROM neighborhood_overrides WHERE city_id = ?1 AND hood_id = ?2 LIMIT 1',
    ).bind(cityId, hoodId).first<{ buy_per_sqm: number | null; rahn_80m: number | null; sponsor_json: string | null }>();
    const nextBuy = buyPerSqm ?? existing?.buy_per_sqm ?? null;
    const nextRahn = rahn80m ?? existing?.rahn_80m ?? null;
    const nextSponsorJson = hasSponsor ? (parsed.body.sponsor === null ? null : JSON.stringify(sponsor)) : existing?.sponsor_json ?? null;
    const now = new Date().toISOString();
    const manualLockUntilMs = boundedNumber(parsed.body.manualLockUntilMs, 0, 4102444800000) ?? (Date.now() + 7 * 86400000);
    try {
      await auth.db.prepare(
        `INSERT INTO neighborhood_overrides (
          city_id, hood_id, buy_per_sqm, rahn_80m, sponsor_json, override_source,
          manual_lock_until_ms, updated_by_uid, updated_at_iso
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'ADMIN_MANUAL', ?6, ?7, ?8)
        ON CONFLICT(city_id, hood_id) DO UPDATE SET
          buy_per_sqm = excluded.buy_per_sqm,
          rahn_80m = excluded.rahn_80m,
          sponsor_json = excluded.sponsor_json,
          override_source = excluded.override_source,
          manual_lock_until_ms = excluded.manual_lock_until_ms,
          updated_by_uid = excluded.updated_by_uid,
          updated_at_iso = excluded.updated_at_iso`,
      ).bind(cityId, hoodId, nextBuy, nextRahn, nextSponsorJson, manualLockUntilMs, auth.uid, now).run();
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'NEIGHBORHOOD_OVERRIDE_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, cityId, hoodId, updatedAtIso: now }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/admin/market/neighborhood-overrides/batch') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 128 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const rawItems = Array.isArray(parsed.body.overrides) ? parsed.body.overrides : [];
    if (rawItems.length < 1 || rawItems.length > 100) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OVERRIDE_BATCH_SIZE' });
    const cityId = safeText(parsed.body.cityId || 'tehran', 20).toLowerCase();
    if (!SUPPORTED_CITY_IDS.has(cityId)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CITY_ID' });
    const now = new Date().toISOString();
    const statements: ReturnType<D1Database['prepare']>[] = [];
    const seen = new Set<number>();
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OVERRIDE_BATCH_ITEM' });
      const row = raw as Record<string, unknown>;
      const hoodId = boundedNumber(row.hoodId, 1, 9999);
      const buy = boundedNumber(row.buyPerSqm, 10, 5000);
      const rahn = boundedNumber(row.rahn80m, 50, 100000);
      if (hoodId === null || !Number.isInteger(hoodId) || buy === null || rahn === null || seen.has(hoodId)) {
        return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OVERRIDE_BATCH_ITEM' });
      }
      seen.add(hoodId);
      const sponsor = Object.prototype.hasOwnProperty.call(row, 'sponsor') ? sanitizeSponsorOverride(row.sponsor) : null;
      if (row.sponsor !== undefined && row.sponsor !== null && !sponsor) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OVERRIDE_BATCH_SPONSOR' });
      statements.push(auth.db.prepare(
        `INSERT INTO neighborhood_overrides (
          city_id, hood_id, buy_per_sqm, rahn_80m, sponsor_json, override_source,
          manual_lock_until_ms, updated_by_uid, updated_at_iso
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'ADMIN_RESTORE', ?6, ?7, ?8)
        ON CONFLICT(city_id, hood_id) DO UPDATE SET
          buy_per_sqm = excluded.buy_per_sqm,
          rahn_80m = excluded.rahn_80m,
          sponsor_json = COALESCE(excluded.sponsor_json, neighborhood_overrides.sponsor_json),
          override_source = excluded.override_source,
          manual_lock_until_ms = excluded.manual_lock_until_ms,
          updated_by_uid = excluded.updated_by_uid,
          updated_at_iso = excluded.updated_at_iso`,
      ).bind(cityId, hoodId, buy, rahn, sponsor ? JSON.stringify(sponsor) : null, Date.now() + 7 * 86400000, auth.uid, now));
    }
    try {
      const results = await auth.db!.batch(statements);
      if (!isSuccessfulD1Batch(results, statements.length)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'OVERRIDE_BATCH_PERSISTENCE_FAILED' });
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'OVERRIDE_BATCH_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, syncedOverridesCount: statements.length }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/admin/market/feature-flags') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 16 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const rawFlags = parsed.body.flags;
    if (!rawFlags || typeof rawFlags !== 'object' || Array.isArray(rawFlags)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_FEATURE_FLAGS' });
    const entries = Object.entries(rawFlags as Record<string, unknown>);
    if (entries.length < 1 || entries.length > 100 || entries.some(([key, value]) => !/^enable[A-Z0-9][A-Za-z0-9]{0,60}$/.test(key) || typeof value !== 'boolean')) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_FEATURE_FLAGS' });
    }
    const existing = await auth.db.prepare("SELECT config_json FROM app_config WHERE config_key = 'feature_flags' LIMIT 1").first<{ config_json: string }>();
    let current: Record<string, unknown> = {};
    if (existing?.config_json) {
      try { const decoded: unknown = JSON.parse(existing.config_json); if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) current = decoded as Record<string, unknown>; } catch { return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'FEATURE_FLAGS_CONFIG_CORRUPT' }); }
    }
    const merged = { ...current, ...(rawFlags as Record<string, boolean>) };
    const now = new Date().toISOString();
    try {
      await auth.db.prepare(
        `INSERT INTO app_config (config_key, config_json, updated_by_uid, updated_at_iso)
         VALUES ('feature_flags', ?1, ?2, ?3)
         ON CONFLICT(config_key) DO UPDATE SET config_json = excluded.config_json, updated_by_uid = excluded.updated_by_uid, updated_at_iso = excluded.updated_at_iso`,
      ).bind(JSON.stringify(merged), auth.uid, now).run();
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'FEATURE_FLAGS_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, updatedAtIso: now }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'PUT' && ctx.pathname === '/api/v1/admin/market/monetization') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const discount = boundedNumber(parsed.body.campaignDiscountPercent, 0, 100);
    if (discount === null) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_MONETIZATION_DISCOUNT' });
    const now = new Date().toISOString();
    const config = { campaignDiscountPercent: Math.round(discount) };
    try {
      await auth.db.prepare(
        `INSERT INTO app_config (config_key, config_json, updated_by_uid, updated_at_iso)
         VALUES ('monetization', ?1, ?2, ?3)
         ON CONFLICT(config_key) DO UPDATE SET config_json = excluded.config_json, updated_by_uid = excluded.updated_by_uid, updated_at_iso = excluded.updated_at_iso`,
      ).bind(JSON.stringify(config), auth.uid, now).run();
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'MONETIZATION_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, updatedAtIso: now }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/admin/market/sponsors/approve') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const requestId = safeText(parsed.body.requestId, 80).replace(/^cloud-/, '');
    const hoodId = boundedNumber(parsed.body.hoodId, 1, 9999);
    if (!requestId || hoodId === null || !Number.isInteger(hoodId)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_APPROVAL' });
    const request = await auth.db.prepare(
      `SELECT city_id, hood_id, agency_name, phone_last4, specialty, experience_years, plan_months
       FROM sponsor_requests WHERE request_id = ?1 LIMIT 1`,
    ).bind(requestId).first<Record<string, unknown>>();
    if (!request || Number(request.hood_id) !== hoodId) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'SPONSOR_REQUEST_NOT_FOUND' });
    const expiresAtIso = safeText(parsed.body.expiresAtIso, 60) || new Date(Date.now() + (Number(request.plan_months) === 3 ? 90 : 30) * 86400000).toISOString();
    const sponsor = {
      name: safeText(request.agency_name, 120),
      specialty: safeText(request.specialty, 120),
      experienceYears: Number(request.experience_years || 0),
      expiresAtIso,
      planType: Number(request.plan_months) === 3 ? 'paid_3m' : 'paid_1m',
    };
    const now = new Date().toISOString();
    const statements = [
      auth.db.prepare("UPDATE sponsor_requests SET status = 'approved', expires_at_iso = ?1, updated_at_iso = ?2 WHERE request_id = ?3 AND hood_id = ?4")
        .bind(expiresAtIso, now, requestId, hoodId),
      auth.db.prepare(
        `INSERT INTO neighborhood_overrides (
          city_id, hood_id, sponsor_json, override_source, manual_lock_until_ms, updated_by_uid, updated_at_iso
        ) VALUES (?1, ?2, ?3, 'ADMIN_SPONSOR', ?4, ?5, ?6)
        ON CONFLICT(city_id, hood_id) DO UPDATE SET sponsor_json = excluded.sponsor_json,
          override_source = excluded.override_source, manual_lock_until_ms = excluded.manual_lock_until_ms,
          updated_by_uid = excluded.updated_by_uid, updated_at_iso = excluded.updated_at_iso`,
      ).bind(String(request.city_id || 'tehran'), hoodId, JSON.stringify(sponsor), Date.now() + 90 * 86400000, auth.uid, now),
    ];
    try {
      const results = await auth.db!.batch(statements);
      if (!isSuccessfulD1Batch(results, statements.length)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_APPROVAL_PERSISTENCE_FAILED' });
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_APPROVAL_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, requestId, hoodId, expiresAtIso }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/admin/market/sponsors/release') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const hoodId = boundedNumber(parsed.body.hoodId, 1, 9999);
    const cityId = safeText(parsed.body.cityId || 'tehran', 20).toLowerCase();
    if (!SUPPORTED_CITY_IDS.has(cityId) || hoodId === null || !Number.isInteger(hoodId)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_RELEASE' });
    const pastIso = new Date(Date.now() - 86400000).toISOString();
    const now = new Date().toISOString();
    const statements = [
      auth.db.prepare("UPDATE sponsor_requests SET status = 'expired', expires_at_iso = ?1, updated_at_iso = ?2 WHERE city_id = ?3 AND hood_id = ?4 AND status = 'approved'")
        .bind(pastIso, now, cityId, hoodId),
      auth.db.prepare(
        `INSERT INTO neighborhood_overrides (city_id, hood_id, sponsor_json, override_source, manual_lock_until_ms, updated_by_uid, updated_at_iso)
         VALUES (?1, ?2, NULL, 'ADMIN_SPONSOR_RELEASE', ?3, ?4, ?5)
         ON CONFLICT(city_id, hood_id) DO UPDATE SET sponsor_json = NULL, override_source = excluded.override_source,
           manual_lock_until_ms = excluded.manual_lock_until_ms, updated_by_uid = excluded.updated_by_uid, updated_at_iso = excluded.updated_at_iso`,
      ).bind(cityId, hoodId, Date.now(), auth.uid, now),
    ];
    try {
      const results = await auth.db!.batch(statements);
      if (!isSuccessfulD1Batch(results, statements.length)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_RELEASE_PERSISTENCE_FAILED' });
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_RELEASE_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, hoodId, cityId }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'DELETE' && ctx.pathname.startsWith('/api/v1/admin/market/sponsor-requests/')) {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const requestId = decodeURIComponent(ctx.pathname.slice('/api/v1/admin/market/sponsor-requests/'.length)).replace(/^cloud-/, '');
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_REQUEST_ID' });
    const request = await auth.db.prepare('SELECT city_id, hood_id, status FROM sponsor_requests WHERE request_id = ?1 LIMIT 1')
      .bind(requestId).first<{ city_id: string; hood_id: number; status: string }>();
    if (!request) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'SPONSOR_REQUEST_NOT_FOUND' });
    const statements = [
      auth.db.prepare('DELETE FROM sponsor_requests WHERE request_id = ?1').bind(requestId),
      ...(request.status === 'approved' ? [auth.db.prepare(
        `UPDATE neighborhood_overrides SET sponsor_json = NULL, override_source = 'ADMIN_SPONSOR_DELETE',
         updated_by_uid = ?1, updated_at_iso = ?2 WHERE city_id = ?3 AND hood_id = ?4`,
      ).bind(auth.uid, new Date().toISOString(), request.city_id, request.hood_id)] : []),
    ];
    try {
      const results = await auth.db!.batch(statements);
      if (!isSuccessfulD1Batch(results, statements.length)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_DELETE_PERSISTENCE_FAILED' });
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'SPONSOR_DELETE_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, requestId }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'POST' && ctx.pathname === '/api/v1/admin/market/bargains/approve') {
    const auth = await requireAdminMutation(ctx);
    if (auth.response !== null) return auth.response;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (parsed.ok === false) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    const bargainId = safeText(parsed.body.bargainId, 128).replace(/^cloud-/, '');
    if (!bargainId) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_ID' });
    const now = new Date().toISOString();
    const statements = [
      auth.db.prepare("UPDATE bargains SET status = 'approved', approved_at_iso = COALESCE(approved_at_iso, ?1), updated_at_iso = ?1 WHERE bargain_id = ?2 AND status IN ('pending', 'approved')")
        .bind(now, bargainId),
      auth.db.prepare("UPDATE bargain_projections SET lifecycle_state = 'approved', updated_at_iso = ?1 WHERE bargain_id = ?2")
        .bind(now, bargainId),
    ];
    try {
      const results = await auth.db!.batch(statements);
      if (!isSuccessfulD1Batch(results, statements.length)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'BARGAIN_APPROVAL_PERSISTENCE_FAILED' });
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'BARGAIN_APPROVAL_PERSISTENCE_FAILED' });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, bargainId }, { cacheControl: 'private, no-store' });
  }

  if (ctx.method === 'DELETE' && ctx.pathname.startsWith('/api/v1/market/bargains/')) {
    const auth = await requireAuthenticatedMutation(ctx);
    if (auth.response !== null) return auth.response;
    const bargainId = decodeURIComponent(ctx.pathname.slice('/api/v1/market/bargains/'.length)).replace(/^cloud-/, '');
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(bargainId)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_ID' });
    const record = await auth.db.prepare('SELECT owner_uid, media_metadata_json FROM bargains WHERE bargain_id = ?1 LIMIT 1')
      .bind(bargainId).first<{ owner_uid: string; media_metadata_json: string }>();
    if (!record) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'BARGAIN_NOT_FOUND' });
    if (record.owner_uid !== auth.uid && !auth.isAdmin) return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'BARGAIN_OWNER_OR_ADMIN_REQUIRED' });
    let mediaItems: unknown[] = [];
    try { const parsedMedia: unknown = JSON.parse(record.media_metadata_json || '[]'); if (Array.isArray(parsedMedia)) mediaItems = parsedMedia; } catch { return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BARGAIN_MEDIA_METADATA_CORRUPT' }); }
    if (mediaItems.length > 0) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BARGAIN_MEDIA_CLEANUP_REQUIRED' });
    const results = await auth.db!.batch([
      auth.db.prepare('DELETE FROM bargains WHERE bargain_id = ?1').bind(bargainId),
      auth.db.prepare('DELETE FROM bargain_projections WHERE bargain_id = ?1').bind(bargainId),
    ]);
    if (!isSuccessfulD1Batch(results, 2)) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'BARGAIN_DELETE_PERSISTENCE_FAILED' });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', durable: true, bargainId }, { cacheControl: 'private, no-store' });
  }

  return null;
}

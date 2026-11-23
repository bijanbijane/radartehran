import { authenticateWorkerSession, sha256Hex } from '../auth/sessionAuth';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireUserDb } from '../db/bindingResolver';
import { getMarketStateFromD1 } from '../marketplace/d1MarketplaceRepository';
import type { D1Database, WorkerRequestContext } from '../types';

const SUPPORTED_CITY_IDS = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

function parseHoodIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').slice(0, 100).map((part) => Number(part.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > 9999)) return undefined;
  return Array.from(new Set(ids));
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

function validCity(value: unknown): string {
  const city = typeof value === 'string' ? value.trim().toLowerCase() : 'tehran';
  return SUPPORTED_CITY_IDS.has(city) ? city : '';
}

function normalizeIranianPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = digits.slice(2);
  if (digits.startsWith('98') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) digits = `98${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `98${digits}`;
  return digits.startsWith('98') && digits.length === 12 ? `+${digits}` : '';
}

async function userWriteBlock(db: D1Database, uid: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT block_reason FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL LIMIT 1',
  ).bind(uid).first<{ block_reason: string }>();
  return row?.block_reason || null;
}

async function requireMarketUser(ctx: WorkerRequestContext, db: D1Database): Promise<
  { ok: true; uid: string; isAdmin: boolean } | { ok: false; response: Response }
> {
  const principal = await authenticateWorkerSession(ctx, true);
  if (!principal.authenticated || !principal.uid) {
    return { ok: false, response: jsonWorkerResponse(ctx, principal.statusCode === 503 ? 503 : 401, { status: 'error', code: principal.reasonCode || 'AUTH_REQUIRED' }) };
  }
  if (!principal.emailVerified && !principal.phoneNumber) {
    return { ok: false, response: jsonWorkerResponse(ctx, 403, { status: 'error', code: 'VERIFIED_IDENTITY_REQUIRED' }) };
  }
  const blockReason = await userWriteBlock(db, principal.uid);
  if (blockReason) {
    return { ok: false, response: jsonWorkerResponse(ctx, 423, { status: 'error', code: 'ACCOUNT_WRITE_BLOCKED', reason: blockReason }) };
  }
  return { ok: true, uid: principal.uid, isAdmin: principal.isAdmin };
}

async function enforceRateLimit(ctx: WorkerRequestContext, db: D1Database, uid: string, action: 'buyer_lead' | 'admin_mutation', maxRequests: number) {
  const result = await evaluateTieredWorkerRateLimit({
    tier: 'strong_durable',
    action,
    subjectKey: uid,
    maxRequests,
    windowSeconds: 60,
    db,
  });
  return result.allowed ? null : jsonWorkerResponse(ctx, 429, {
    status: 'error',
    code: 'MARKET_MUTATION_RATE_LIMITED',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

async function readIdempotency(db: D1Database, uid: string, operation: string, key: string) {
  return db.prepare(
    'SELECT request_hash, resource_id FROM market_mutation_idempotency WHERE uid = ?1 AND operation_name = ?2 AND idempotency_key = ?3 LIMIT 1',
  ).bind(uid, operation, key).first<{ request_hash: string; resource_id: string }>();
}

function idempotencyKey(ctx: WorkerRequestContext): string {
  const value = (ctx.request.headers.get('idempotency-key') || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : '';
}

async function idempotencyConflict(ctx: WorkerRequestContext, db: D1Database, uid: string, operation: string, key: string, requestHash: string) {
  const existing = await readIdempotency(db, uid, operation, key);
  if (!existing) return null;
  return existing.request_hash === requestHash
    ? { replay: true, resourceId: existing.resource_id }
    : { replay: false, resourceId: existing.resource_id };
}

export async function handleMarketplaceWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { method, pathname } = ctx;
  const userDbResult = requireUserDb(ctx.env);
  if (userDbResult.ok === false) {
    if (pathname === '/api/v1/market/state' || pathname.startsWith('/api/v1/market/')) {
      return jsonWorkerResponse(ctx, userDbResult.statusCode, {
        status: 'error',
        code: userDbResult.code,
        message: userDbResult.messageFa,
      });
    }
    return null;
  }
  const db = userDbResult.db;

  if (method === 'GET' && pathname === '/api/v1/market/state') {
    const cityId = validCity(ctx.url.searchParams.get('cityId') || 'tehran');
    if (!cityId) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CITY_ID' });
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
      db,
    });
    if (!rateLimit.allowed) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'MARKET_STATE_RATE_LIMITED', retryAfterSeconds: rateLimit.retryAfterSeconds });
    }
    const principal = await authenticateWorkerSession(ctx);
    const authenticatedUid = principal.authenticated ? principal.uid || undefined : undefined;
    const includeAdminRecords = Boolean(principal.authenticated && principal.isAdmin);
    const state = await getMarketStateFromD1(db, { cityId, hoodIds, uid: authenticatedUid, includeAdminRecords });
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      cityId,
      authenticated: Boolean(principal.authenticated),
      isAdmin: includeAdminRecords,
      ...state,
    }, { cacheControl: 'private, no-store' });
  }

  if (method === 'POST' && pathname === '/api/v1/market/bargains') {
    const caller = await requireMarketUser(ctx, db);
    if (!caller.ok) return caller.response;
    const limited = await enforceRateLimit(ctx, db, caller.uid, 'buyer_lead', 12);
    if (limited) return limited;
    const parsed = await readValidatedJsonBody(ctx.request, 12 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const body = parsed.body;
    const cityId = validCity(body.cityId);
    const hoodId = Number(body.hoodId);
    const title = cleanText(body.title, 160);
    const street = cleanText(body.street, 120);
    const listingType = body.type === 'اجاره' ? 'اجاره' : body.type === 'خرید' ? 'خرید' : '';
    const sqm = Number(body.sqm);
    const priceMillions = Number(body.priceMillions);
    const priceText = cleanText(body.priceText, 160);
    const discountPercent = Number(body.discountPercent);
    const buyerProfitText = cleanText(body.buyerProfitText, 160);
    if (!cityId || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 || !title || !street ||
        !listingType || !Number.isInteger(sqm) || sqm < 25 || sqm > 1000 ||
        !Number.isFinite(priceMillions) || priceMillions <= 0 || !priceText ||
        !Number.isFinite(discountPercent) || discountPercent < 10 || discountPercent > 60) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_INPUT' });
    }
    if (body.imageUrl || body.imageUrls || body.videoUrl || body.media || body.objectStorageKeys || body.objectStorageObjectIds) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'MEDIA_STORAGE_NOT_AVAILABLE', message: 'Binary media uploads remain disabled until an approved storage provider is configured; R2 is intentionally deferred.' });
    }
    const key = idempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const now = new Date().toISOString();
    const status = caller.isAdmin ? 'approved' : 'pending';
    const normalized = { cityId, hoodId, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street, status };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `brg_${(await sha256Hex(`${caller.uid}:bargain:${key}`)).slice(0, 32)}`;
    const previous = await idempotencyConflict(ctx, db, caller.uid, 'bargain.create', key, requestHash);
    if (previous && !previous.replay) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' });
    if (!previous) {
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO market_mutation_idempotency (uid, operation_name, idempotency_key, request_hash, resource_id, created_at_iso) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(caller.uid, 'bargain.create', key, requestHash, resourceId, now),
        db.prepare(
          `INSERT INTO bargains (bargain_id, owner_uid, city_id, hood_id, title, listing_type, sqm, price_millions, price_text, discount_percent, buyer_profit_text, street, media_metadata_json, status, created_at_iso, updated_at_iso, approved_at_iso)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '[]', ?13, ?14, ?14, CASE WHEN ?13 = 'approved' THEN ?14 ELSE NULL END
           WHERE EXISTS (SELECT 1 FROM market_mutation_idempotency WHERE uid = ?2 AND operation_name = 'bargain.create' AND idempotency_key = ?15 AND request_hash = ?16)
           ON CONFLICT(bargain_id) DO NOTHING`,
        ).bind(resourceId, caller.uid, cityId, hoodId, title, listingType, sqm, priceMillions, priceText, discountPercent, buyerProfitText, street, status, now, key, requestHash),
        db.prepare(
          `INSERT INTO bargain_projections (bargain_id, city_id, hood_id, hood_name, title, sqm, price_millions, discount_percent, lifecycle_state, updated_at_iso, owner_uid)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
           WHERE EXISTS (SELECT 1 FROM bargains WHERE bargain_id = ?1 AND owner_uid = ?11)
           ON CONFLICT(bargain_id) DO UPDATE SET title = excluded.title, sqm = excluded.sqm, price_millions = excluded.price_millions, discount_percent = excluded.discount_percent, lifecycle_state = excluded.lifecycle_state, updated_at_iso = excluded.updated_at_iso, owner_uid = excluded.owner_uid`,
        ).bind(resourceId, cityId, hoodId, cleanText(body.hoodName, 120) || `محله ${hoodId}`, title, sqm, priceMillions, discountPercent, status, now, caller.uid),
      ]);
    }
    const record = await db.prepare('SELECT bargain_id, status FROM bargains WHERE bargain_id = ?1 AND owner_uid = ?2 LIMIT 1')
      .bind(previous?.resourceId || resourceId, caller.uid).first<{ bargain_id: string; status: string }>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BARGAIN_CREATE_NOT_COMMITTED' });
    return jsonWorkerResponse(ctx, 201, { status: 'ok', bargainId: record.bargain_id, listingStatus: record.status, idempotentReplay: Boolean(previous) });
  }

  if (method === 'POST' && pathname === '/api/v1/market/sponsor-requests') {
    const caller = await requireMarketUser(ctx, db);
    if (!caller.ok) return caller.response;
    const limited = await enforceRateLimit(ctx, db, caller.uid, 'buyer_lead', 8);
    if (limited) return limited;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const body = parsed.body;
    const cityId = validCity(body.cityId);
    const hoodId = Number(body.hoodId);
    const hoodName = cleanText(body.hoodName, 120);
    const agencyName = cleanText(body.agencyName, 120);
    const phone = normalizeIranianPhone(body.phone);
    const specialty = cleanText(body.specialty, 120);
    const experienceYears = Number(body.experienceYears);
    const monthlyTariff = Number(body.monthlyTariffMillion);
    const planMonths = Number(body.planMonths) === 3 ? 3 : 1;
    const totalPayable = Number(body.totalPayableMillion);
    const trackingCode = cleanText(body.trackingCode, 80);
    if (!cityId || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 || !hoodName || !agencyName || !phone ||
        !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80 ||
        !Number.isFinite(monthlyTariff) || monthlyTariff < 0 || !Number.isFinite(totalPayable) || totalPayable < 0) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_SPONSOR_REQUEST' });
    }
    const key = idempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const now = new Date().toISOString();
    const status = caller.isAdmin ? 'approved' : 'pending';
    const expiresAtIso = status === 'approved' ? cleanText(body.expiresAtIso, 60) || null : null;
    const normalized = { cityId, hoodId, hoodName, agencyName, phone, specialty, experienceYears, monthlyTariff, planMonths, totalPayable, trackingCode, status, expiresAtIso };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `spr_${(await sha256Hex(`${caller.uid}:sponsor:${key}`)).slice(0, 32)}`;
    const previous = await idempotencyConflict(ctx, db, caller.uid, 'sponsor.create', key, requestHash);
    if (previous && !previous.replay) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' });
    if (!previous) {
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO market_mutation_idempotency (uid, operation_name, idempotency_key, request_hash, resource_id, created_at_iso) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(caller.uid, 'sponsor.create', key, requestHash, resourceId, now),
        db.prepare(
          `INSERT INTO sponsor_requests (request_id, owner_uid, city_id, hood_id, hood_name, agency_name, phone_e164, specialty, experience_years, monthly_tariff_million, plan_months, total_payable_million, tracking_code, status, expires_at_iso, created_at_iso, updated_at_iso)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16
           WHERE EXISTS (SELECT 1 FROM market_mutation_idempotency WHERE uid = ?2 AND operation_name = 'sponsor.create' AND idempotency_key = ?17 AND request_hash = ?18)
           ON CONFLICT(request_id) DO NOTHING`,
        ).bind(resourceId, caller.uid, cityId, hoodId, hoodName, agencyName, phone, specialty, experienceYears, monthlyTariff, planMonths, totalPayable, trackingCode, status, expiresAtIso, now, key, requestHash),
      ]);
    }
    const record = await db.prepare('SELECT request_id, status FROM sponsor_requests WHERE request_id = ?1 AND owner_uid = ?2 LIMIT 1')
      .bind(previous?.resourceId || resourceId, caller.uid).first<{ request_id: string; status: string }>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'SPONSOR_CREATE_NOT_COMMITTED' });
    return jsonWorkerResponse(ctx, 201, { status: 'ok', requestId: record.request_id, requestStatus: record.status, idempotentReplay: Boolean(previous) });
  }

  if (method === 'POST' && pathname === '/api/v1/market/buyer-alerts') {
    const caller = await requireMarketUser(ctx, db);
    if (!caller.ok) return caller.response;
    const limited = await enforceRateLimit(ctx, db, caller.uid, 'buyer_lead', 5);
    if (limited) return limited;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const body = parsed.body;
    const cityId = validCity(body.cityId);
    const hoodId = Number(body.hoodId);
    const fullName = cleanText(body.fullName, 100);
    const phone = normalizeIranianPhone(body.phone);
    const dealType = body.dealType === 'اجاره' ? 'اجاره' : body.dealType === 'خرید' ? 'خرید' : '';
    const maxBudget = Number(body.maxBudgetMillion);
    const consentVersion = cleanText(body.consentVersion, 80);
    if (!cityId || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 || !fullName || !phone || !dealType ||
        !Number.isFinite(maxBudget) || maxBudget <= 0 || consentVersion !== 'buyer-alert-2026-10-v1') {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BUYER_ALERT' });
    }
    const key = idempotencyKey(ctx);
    if (!key) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const normalized = { cityId, hoodId, fullName, phone, dealType, maxBudget, consentVersion };
    const requestHash = await sha256Hex(JSON.stringify(normalized));
    const resourceId = `alr_${(await sha256Hex(`${caller.uid}:buyer-alert:${key}`)).slice(0, 32)}`;
    const previous = await idempotencyConflict(ctx, db, caller.uid, 'buyer_alert.create', key, requestHash);
    if (previous && !previous.replay) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' });
    if (!previous) {
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO market_mutation_idempotency (uid, operation_name, idempotency_key, request_hash, resource_id, created_at_iso) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(caller.uid, 'buyer_alert.create', key, requestHash, resourceId, nowIso),
        db.prepare(
          `INSERT INTO buyer_alerts (alert_id, owner_uid, city_id, hood_id, full_name, phone_e164, deal_type, max_budget_million, consent_version, consent_at_iso, expires_at_iso, status, created_at_iso, updated_at_iso)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', ?10, ?10
           WHERE EXISTS (SELECT 1 FROM market_mutation_idempotency WHERE uid = ?2 AND operation_name = 'buyer_alert.create' AND idempotency_key = ?12 AND request_hash = ?13)
           ON CONFLICT(alert_id) DO NOTHING`,
        ).bind(resourceId, caller.uid, cityId, hoodId, fullName, phone, dealType, maxBudget, consentVersion, nowIso, expiresAtIso, key, requestHash),
      ]);
    }
    const record = await db.prepare('SELECT alert_id FROM buyer_alerts WHERE alert_id = ?1 AND owner_uid = ?2 LIMIT 1')
      .bind(previous?.resourceId || resourceId, caller.uid).first<{ alert_id: string }>();
    if (!record) return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'BUYER_ALERT_CREATE_NOT_COMMITTED' });
    return jsonWorkerResponse(ctx, 201, { status: 'ok', alertId: record.alert_id, expiresAtIso, idempotentReplay: Boolean(previous) });
  }

  if (method === 'POST' && pathname === '/api/v1/market/votes') {
    const caller = await requireMarketUser(ctx, db);
    if (!caller.ok) return caller.response;
    const limited = await enforceRateLimit(ctx, db, caller.uid, 'buyer_lead', 30);
    if (limited) return limited;
    const parsed = await readValidatedJsonBody(ctx.request, 6 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const body = parsed.body;
    const cityId = validCity(body.cityId);
    const hoodId = Number(body.hoodId);
    const score = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10 ? Number(value) : null;
    const air = score(body.air);
    const power = score(body.powerWater);
    const internet = score(body.internet);
    const metro = score(body.metro);
    const security = score(body.security);
    const flat = score(body.flatTerrain);
    const comment = cleanText(body.comment, 1000);
    if (!cityId || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 ||
        [air, power, internet, metro, security, flat].some((value) => value === null)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_NEIGHBORHOOD_VOTE' });
    }
    const voteId = `vot_${(await sha256Hex(`${caller.uid}:${cityId}:${hoodId}`)).slice(0, 32)}`;
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO neighborhood_votes (vote_id, owner_uid, city_id, hood_id, air_score, power_score, internet_score, metro_score, security_score, flat_score, comment, user_display_name, created_at_iso, updated_at_iso)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
       ON CONFLICT(owner_uid, city_id, hood_id) DO UPDATE SET air_score = excluded.air_score, power_score = excluded.power_score, internet_score = excluded.internet_score, metro_score = excluded.metro_score, security_score = excluded.security_score, flat_score = excluded.flat_score, comment = excluded.comment, user_display_name = excluded.user_display_name, updated_at_iso = excluded.updated_at_iso`,
    ).bind(voteId, caller.uid, cityId, hoodId, air, power, internet, metro, security, flat, comment, cleanText(body.userDisplayName, 100), now).run();
    return jsonWorkerResponse(ctx, 200, { status: 'ok', voteId, updatedAtIso: now });
  }

  if (method === 'POST' && pathname === '/api/v1/market/preferences') {
    const caller = await requireMarketUser(ctx, db);
    if (!caller.ok) return caller.response;
    const limited = await enforceRateLimit(ctx, db, caller.uid, 'buyer_lead', 20);
    if (limited) return limited;
    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const body = parsed.body;
    const cityId = validCity(body.cityId);
    const mode = body.mode === 'buy' ? 'buy' : body.mode === 'rent' ? 'rent' : '';
    const deposit = Number(body.deposit);
    const monthlyRent = Number(body.monthlyRent);
    const buyTotalBudget = Number(body.buyTotalBudget);
    const targetSqm = Number(body.targetSqm);
    const workHubId = cleanText(body.workHubId, 40) || 'none';
    const favoriteHoodIds = Array.isArray(body.favoriteHoodIds)
      ? Array.from(new Set(body.favoriteHoodIds.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= 9999))).slice(0, 100)
      : [];
    if (!cityId || !mode || !Number.isFinite(deposit) || deposit < 0 || deposit > 100000 ||
        !Number.isFinite(monthlyRent) || monthlyRent < 0 || monthlyRent > 1000 ||
        !Number.isFinite(buyTotalBudget) || buyTotalBudget < 500 || buyTotalBudget > 1000000 ||
        !Number.isFinite(targetSqm) || targetSqm < 20 || targetSqm > 1000) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_USER_PREFERENCES' });
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO user_preferences (uid, mode, deposit, monthly_rent, buy_total_budget, target_sqm, work_hub_id, updated_at_iso)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(uid) DO UPDATE SET mode = excluded.mode, deposit = excluded.deposit, monthly_rent = excluded.monthly_rent, buy_total_budget = excluded.buy_total_budget, target_sqm = excluded.target_sqm, work_hub_id = excluded.work_hub_id, updated_at_iso = excluded.updated_at_iso`,
      ).bind(caller.uid, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, now),
      db.prepare('DELETE FROM user_favorites WHERE uid = ?1 AND city_id = ?2').bind(caller.uid, cityId),
      ...favoriteHoodIds.map((hoodId) => db.prepare(
        'INSERT OR IGNORE INTO user_favorites (uid, city_id, hood_id, note, created_at_iso) VALUES (?1, ?2, ?3, \'\', ?4)',
      ).bind(caller.uid, cityId, hoodId, now)),
    ]);
    return jsonWorkerResponse(ctx, 200, { status: 'ok', updatedAtIso: now, favoriteCount: favoriteHoodIds.length });
  }

  return null;
}

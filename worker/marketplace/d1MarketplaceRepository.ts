import type { D1Database, WorkerEnv } from '../types';
import { decryptMarketPhone, maskMarketPhoneLast4 } from './marketPiiCrypto';

export interface MarketStateQuery {
  cityId: string;
  hoodIds?: readonly number[];
  uid?: string;
  includeAdminRecords?: boolean;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.length > 64_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function ownerUidVisible(ownerUid: unknown, query: MarketStateQuery): string {
  const uid = String(ownerUid || '');
  return uid && (query.includeAdminRecords || (query.uid && query.uid === uid)) ? uid : '';
}

export function maskPhoneForPublic(value: unknown): string {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return `+98***${digits.slice(-4)}`;
}

export function sanitizeSponsorForPublic(value: unknown, includeAdminRecords: boolean): Record<string, unknown> | null {
  const sponsor = typeof value === 'string' ? parseJsonRecord(value) : value as Record<string, unknown> | null;
  if (!sponsor || typeof sponsor !== 'object' || Array.isArray(sponsor)) return null;
  if (includeAdminRecords) return sponsor;
  const allowedKeys = ['name', 'agencyName', 'specialty', 'experienceYears', 'planType', 'expiresAtIso'];
  return Object.fromEntries(allowedKeys.filter((key) => sponsor[key] !== undefined).map((key) => [key, sponsor[key]]));
}

function makeHoodFilter(hoodIds: readonly number[] | undefined, startIndex: number): {
  sql: string;
  values: number[];
} {
  const clean = Array.from(new Set((hoodIds || []).filter((id) => Number.isInteger(id) && id >= 1 && id <= 9999))).slice(0, 100);
  if (clean.length === 0) return { sql: '', values: [] };
  return {
    sql: ` AND hood_id IN (${clean.map((_, index) => `?${startIndex + index}`).join(', ')})`,
    values: clean,
  };
}

export async function getMarketStateFromD1(db: D1Database, query: MarketStateQuery, env: WorkerEnv) {
  const cityId = query.cityId;
  const hoodFilter = makeHoodFilter(query.hoodIds, 2);
  const baseValues: unknown[] = [cityId, ...hoodFilter.values];

  const [bargainRows, sponsorRows, voteRows, overrideRows, buyerRows, featureConfig, monetizationConfig, preferences, favorites] = await Promise.all([
    db.prepare(
      `SELECT bargain_id, owner_uid, city_id, hood_id, title, listing_type, sqm, price_text,
              discount_percent, buyer_profit_text, street, status, created_at_iso, updated_at_iso
       FROM bargains
       WHERE city_id = ?1 AND status IN (${query.includeAdminRecords ? "'approved', 'pending', 'rejected'" : "'approved'"})${hoodFilter.sql}
       ORDER BY created_at_iso DESC LIMIT 1000`,
    ).bind(...baseValues).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT request_id, owner_uid, city_id, hood_id, hood_name, agency_name, phone_ciphertext, phone_last4, specialty,
              experience_years, monthly_tariff_million, plan_months, total_payable_million,
              tracking_code, status, expires_at_iso, created_at_iso
       FROM sponsor_requests
       WHERE city_id = ?1 AND status IN (${query.includeAdminRecords ? "'approved', 'pending'" : "'approved'"})${hoodFilter.sql}
       ORDER BY created_at_iso DESC LIMIT 500`,
    ).bind(...baseValues).all<Record<string, unknown>>(),
    query.includeAdminRecords
      ? db.prepare(
          `SELECT vote_id, owner_uid, city_id, hood_id, air_score, power_score, internet_score,
                  metro_score, security_score, flat_score, comment, user_display_name, updated_at_iso
           FROM neighborhood_votes
           WHERE city_id = ?1${hoodFilter.sql}
           ORDER BY updated_at_iso DESC LIMIT 2000`,
        ).bind(...baseValues).all<Record<string, unknown>>()
      : query.uid
        ? db.prepare(
            `SELECT vote_id, owner_uid, city_id, hood_id, air_score, power_score, internet_score,
                    metro_score, security_score, flat_score, comment, user_display_name, updated_at_iso
             FROM neighborhood_votes
             WHERE city_id = ?1 AND owner_uid = ?2${makeHoodFilter(query.hoodIds, 3).sql}
             ORDER BY updated_at_iso DESC LIMIT 1000`,
          ).bind(cityId, query.uid, ...makeHoodFilter(query.hoodIds, 3).values).all<Record<string, unknown>>()
        : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    db.prepare(
      `SELECT city_id, hood_id, buy_per_sqm, rahn_80m, sponsor_json, override_source,
              manual_lock_until_ms, updated_at_iso
       FROM neighborhood_overrides
       WHERE city_id = ?1${hoodFilter.sql}
       ORDER BY hood_id ASC LIMIT 1000`,
    ).bind(...baseValues).all<Record<string, unknown>>(),
    query.includeAdminRecords
      ? db.prepare(
          `SELECT alert_id, owner_uid, city_id, hood_id, full_name, phone_ciphertext, phone_last4, deal_type,
                  max_budget_million, consent_version, consent_at_iso, expires_at_iso, status, created_at_iso
           FROM buyer_alerts
           WHERE city_id = ?1 AND status = 'active'${hoodFilter.sql}
           ORDER BY created_at_iso DESC LIMIT 500`,
        ).bind(...baseValues).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    db.prepare("SELECT config_json FROM app_config WHERE config_key = 'feature_flags' LIMIT 1")
      .first<{ config_json: string }>(),
    db.prepare("SELECT config_json FROM app_config WHERE config_key = 'monetization' LIMIT 1")
      .first<{ config_json: string }>(),
    query.uid
      ? db.prepare(
          'SELECT mode, deposit, monthly_rent, buy_total_budget, target_sqm, work_hub_id FROM user_preferences WHERE uid = ?1 LIMIT 1',
        ).bind(query.uid).first<Record<string, unknown>>()
      : Promise.resolve(null),
    query.uid
      ? db.prepare('SELECT city_id, hood_id FROM user_favorites WHERE uid = ?1 AND city_id = ?2 ORDER BY created_at_iso DESC LIMIT 100')
          .bind(query.uid, cityId).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
  ]);

  const bargains = (bargainRows.results ?? []).map((row) => ({
    id: `cloud-${String(row.bargain_id)}`,
    hoodId: Number(row.hood_id),
    title: String(row.title || ''),
    type: row.listing_type === 'اجاره' ? 'اجاره' : 'خرید',
    sqm: Number(row.sqm),
    priceText: String(row.price_text || ''),
    discountPercent: Number(row.discount_percent),
    buyerProfitText: String(row.buyer_profit_text || ''),
    street: String(row.street || ''),
    status: String(row.status || 'approved'),
    createdAtIso: String(row.created_at_iso || ''),
    updatedAtIso: String(row.updated_at_iso || ''),
    ownerUserId: ownerUidVisible(row.owner_uid, query),
  }));

  const sponsors = await Promise.all((sponsorRows.results ?? []).map(async (row) => ({
    id: `cloud-${String(row.request_id)}`,
    hoodId: Number(row.hood_id),
    hoodName: String(row.hood_name || ''),
    agencyName: String(row.agency_name || ''),
    phone: query.includeAdminRecords ? await decryptMarketPhone(String(row.phone_ciphertext || ''), env) : maskMarketPhoneLast4(row.phone_last4),
    specialty: String(row.specialty || ''),
    experienceYears: Number(row.experience_years || 0),
    monthlyTariffMillion: Number(row.monthly_tariff_million || 0),
    planMonths: Number(row.plan_months) === 3 ? 3 : 1,
    totalPayableMillion: Number(row.total_payable_million || 0),
    trackingCode: String(row.tracking_code || ''),
    expiresAtIso: row.expires_at_iso ? String(row.expires_at_iso) : undefined,
    status: row.status === 'approved' ? 'approved' : 'pending',
    createdAtFa: 'ثبت ابری',
    ownerUserId: ownerUidVisible(row.owner_uid, query),
  })));

  const votes = (voteRows.results ?? []).map((row) => ({
    id: String(row.vote_id),
    hoodId: Number(row.hood_id),
    hoodName: '',
    userId: String(row.owner_uid || ''),
    userDisplayName: String(row.user_display_name || 'ساکن محله'),
    air: Number(row.air_score),
    powerWater: Number(row.power_score),
    internet: Number(row.internet_score),
    metro: Number(row.metro_score),
    security: Number(row.security_score),
    flatTerrain: Number(row.flat_score),
    comment: String(row.comment || ''),
    locationVerified: false,
  }));

  const overrides = (overrideRows.results ?? []).map((row) => ({
    hoodId: Number(row.hood_id),
    buyPerSqm: row.buy_per_sqm === null ? undefined : Number(row.buy_per_sqm),
    rahn80m: row.rahn_80m === null ? undefined : Number(row.rahn_80m),
    sponsor: sanitizeSponsorForPublic(row.sponsor_json, Boolean(query.includeAdminRecords)),
    overrideSource: String(row.override_source || 'ADMIN_MANUAL'),
    manualLockUntilMs: row.manual_lock_until_ms === null ? undefined : Number(row.manual_lock_until_ms),
    updatedAtIso: String(row.updated_at_iso || ''),
  }));

  const buyerAlerts = await Promise.all((buyerRows.results ?? []).map(async (row) => ({
    id: `cloud-${String(row.alert_id)}`,
    hoodId: Number(row.hood_id),
    hoodName: '',
    fullName: String(row.full_name || ''),
    phone: await decryptMarketPhone(String(row.phone_ciphertext || ''), env),
    dealType: row.deal_type === 'اجاره' ? 'اجاره' : 'خرید',
    maxBudgetText: `${Number(row.max_budget_million || 0)} میلیون تومان`,
    createdAtFa: 'ثبت ابری',
    createdAtIso: String(row.created_at_iso || ''),
    expiresAtIso: String(row.expires_at_iso || ''),
    consentVersion: String(row.consent_version || ''),
    submittedByUid: String(row.owner_uid || ''),
  })));

  return {
    bargains,
    sponsors,
    votes,
    overrides,
    buyerAlerts,
    featureFlags: parseJsonRecord(featureConfig?.config_json) || null,
    monetization: parseJsonRecord(monetizationConfig?.config_json) || null,
    preferences: preferences ? {
      mode: preferences.mode === 'buy' ? 'buy' : 'rent',
      deposit: Number(preferences.deposit || 0),
      monthlyRent: Number(preferences.monthly_rent || 0),
      buyTotalBudget: Number(preferences.buy_total_budget || 6500),
      targetSqm: Number(preferences.target_sqm || 80),
      workHubId: String(preferences.work_hub_id || 'none'),
    } : null,
    favoriteHoodIds: (favorites.results ?? []).map((row) => Number(row.hood_id)).filter((id) => Number.isInteger(id) && id > 0),
  };
}

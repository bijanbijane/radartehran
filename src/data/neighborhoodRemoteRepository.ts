/** @file src/data/neighborhoodRemoteRepository.ts — Cloudflare D1-backed market repository. */
import { getAuthClient } from '../platform/auth';
import {
  clampNumber,
  DEFAULT_FEATURE_FLAGS,
  loadValidatedFeatureFlags,
  normalizeDigitsToEnglish,
  type FeatureFlags,
} from '../utils/security';
import {
  convertAreaFromSqm,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
} from '../utils/areaUnit';
import {
  BargainListing,
  BuyerAlertLeadItem,
  isAuthorizedAdminUser,
  NeighborhoodSponsor,
  ResidentVoteDoc,
  SponsorCrmRequestItem,
} from './neighborhoods';
import {
  buildSanitizedBargainPayload,
  buildSanitizedOverridePayload,
  buildSanitizedSponsorMap,
  buildSanitizedVotePayload,
  clearNeighborhoodRepositoryCache,
  CreateBargainInput,
  CreateSponsorRequestInput,
  mapFirestoreDocToBargain,
  mapFirestoreDocToBuyerLead,
  mapFirestoreDocToOverride,
  mapFirestoreDocToSponsorRequest,
  mapFirestoreDocToVote,
  mergeNeighborhoodOverridesIntoList,
  NeighborhoodOverrideDto,
  normalizeIranMobilePhone,
  ParsedUserPreferences,
  recordOverrideCache,
  SaveNeighborhoodOverrideInput,
  SaveUserPreferencesInput,
  shouldSkipRedundantOverrideWrite,
  SubmitResidentVoteInput,
  UpsertBuyerAlertInput,
} from './firestoreNeighborhoodMappers';

export type Unsubscribe = () => void;
const noopUnsub: Unsubscribe = () => {};

export {
  buildSanitizedBargainPayload,
  buildSanitizedOverridePayload,
  buildSanitizedSponsorMap,
  buildSanitizedVotePayload,
  clearNeighborhoodRepositoryCache,
  mapFirestoreDocToBargain,
  mapFirestoreDocToBuyerLead,
  mapFirestoreDocToOverride,
  mapFirestoreDocToSponsorRequest,
  mapFirestoreDocToVote,
  mergeNeighborhoodOverridesIntoList,
  normalizeIranMobilePhone,
  recordOverrideCache,
  shouldSkipRedundantOverrideWrite,
};
export type {
  CreateBargainInput,
  CreateSponsorRequestInput,
  NeighborhoodOverrideDto,
  ParsedUserPreferences,
  SaveNeighborhoodOverrideInput,
  SaveUserPreferencesInput,
  SubmitResidentVoteInput,
  UpsertBuyerAlertInput,
};

interface MarketStateResponse {
  status?: string;
  cityId?: string;
  bargains?: Array<Record<string, unknown>>;
  sponsors?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  overrides?: Array<Record<string, unknown>>;
  buyerAlerts?: Array<Record<string, unknown>>;
  featureFlags?: Partial<FeatureFlags> | null;
  monetization?: Record<string, unknown> | null;
  preferences?: ParsedUserPreferences | null;
  favoriteHoodIds?: number[];
}

interface ApiResponse {
  status?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

async function currentSessionUid(): Promise<string | null> {
  const client = getAuthClient();
  const user = client.getUser() || await client.refreshSession();
  return user?.uid ?? null;
}

async function requestJson<T extends ApiResponse>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok || payload.status === 'error') {
    throw new Error(typeof payload.code === 'string' ? payload.code : `MARKET_API_HTTP_${response.status}`);
  }
  return payload;
}

async function readMarketState(cityId = 'tehran'): Promise<MarketStateResponse> {
  const query = new URLSearchParams({ cityId });
  return requestJson<MarketStateResponse>(`/api/v1/market/state?${query.toString()}`);
}

function subscribeToState<T>(
  select: (state: MarketStateResponse) => T,
  onUpdate: (value: T) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  let active = true;
  void readMarketState().then((state) => {
    if (active) onUpdate(select(state));
  }).catch((error) => {
    if (active) onError?.(error);
  });
  return () => { active = false; };
}

function idempotencyKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function formatUserPreferencesIntlSummary(
  prefs: ParsedUserPreferences,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
) {
  const sqm = clampNumber(prefs.targetSqm, 20, 1000, 80);
  return {
    displayAreaValue: Math.round(convertAreaFromSqm(sqm, areaUnit)),
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    budgetIntlText: formatMillionTomanAsIntlCurrency(clampNumber(prefs.buyTotalBudget, 500, 1000000, 6500), referenceCurrency),
    depositIntlText: formatMillionTomanAsIntlCurrency(clampNumber(prefs.deposit, 0, 100000, 800), referenceCurrency),
  };
}

export async function checkDelegatedAdminRole(user: { uid: string; email?: string | null; emailVerified?: boolean }): Promise<boolean> {
  if (!user.emailVerified || isAuthorizedAdminUser(user, false)) return false;
  const state = await readMarketState();
  return Boolean(state.status === 'ok' && getAuthClient().getUser()?.uid === user.uid &&
    getAuthClient().getUser()?.customClaims?.isAdmin === true);
}

export async function fetchUserPreferences(uid: string): Promise<ParsedUserPreferences | null> {
  const currentUid = await currentSessionUid();
  if (!currentUid || currentUid !== uid) return null;
  const state = await readMarketState();
  if (state.status !== 'ok' || !state.preferences) return null;
  return { ...state.preferences, favoriteHoodIds: Array.isArray(state.favoriteHoodIds) ? state.favoriteHoodIds : [] };
}

export async function saveUserPreferences(input: SaveUserPreferencesInput): Promise<void> {
  const uid = await currentSessionUid();
  if (!uid || uid !== input.userId) throw new Error('AUTH_REQUIRED');
  await requestJson('/api/v1/market/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      cityId: 'tehran',
      mode: input.mode,
      deposit: input.deposit,
      monthlyRent: input.monthlyRent,
      buyTotalBudget: input.buyTotalBudget,
      targetSqm: input.targetSqm,
      workHubId: input.workHubId,
      favoriteHoodIds: input.favoriteHoodIds,
    }),
  });
}

export function subscribeToFeatureFlags(onUpdate: (flags: FeatureFlags) => void): Unsubscribe {
  onUpdate(loadValidatedFeatureFlags());
  return subscribeToState((state) => ({
    ...DEFAULT_FEATURE_FLAGS,
    ...(state.featureFlags || {}),
  }) as FeatureFlags, onUpdate);
}

export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  await requestJson('/api/v1/admin/market/feature-flags', {
    method: 'PUT',
    body: JSON.stringify({ flags }),
  });
}

export function subscribeToMonetizationDiscount(onUpdate: (discountPercent: number) => void): Unsubscribe {
  try {
    const raw = localStorage.getItem('tehran_radar_campaign_discount_v1');
    const disc = raw ? Number(raw) : NaN;
    if (Number.isFinite(disc) && disc >= 0 && disc <= 100) onUpdate(Math.round(disc));
  } catch { /* browser storage may be unavailable */ }
  return subscribeToState((state) => {
    const value = Number(state.monetization?.campaignDiscountPercent);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : 0;
  }, onUpdate);
}

export async function saveMonetizationDiscount(discountPercent: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
  await requestJson('/api/v1/admin/market/monetization', {
    method: 'PUT',
    body: JSON.stringify({ campaignDiscountPercent: clamped }),
  });
  try { localStorage.setItem('tehran_radar_campaign_discount_v1', String(clamped)); } catch { /* ignore */ }
}

export function subscribeToNeighborhoodOverrides(onUpdate: (overridesMap: Record<number, NeighborhoodOverrideDto>) => void): Unsubscribe {
  return subscribeToState((state) => {
    const result: Record<number, NeighborhoodOverrideDto> = {};
    for (const row of state.overrides || []) {
      const hoodId = Number(row.hoodId);
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) continue;
      const mapped = mapFirestoreDocToOverride(String(hoodId), row);
      if (mapped) result[hoodId] = mapped;
    }
    return result;
  }, onUpdate);
}

export async function saveNeighborhoodOverride(
  input: SaveNeighborhoodOverrideInput,
  options?: { skipIfUnchanged?: boolean },
): Promise<boolean> {
  const clean = buildSanitizedOverridePayload(input);
  if (options?.skipIfUnchanged && shouldSkipRedundantOverrideWrite(input.hoodId, clean)) return false;
  await requestJson('/api/v1/admin/market/neighborhood-overrides', {
    method: 'PUT',
    body: JSON.stringify({
      cityId: 'tehran',
      hoodId: input.hoodId,
      buyPerSqm: input.buyPerSqm,
      rahn80m: input.rahn80m,
      ...(Object.prototype.hasOwnProperty.call(input, 'sponsor')
        ? { sponsor: input.sponsor ?? null }
        : {}),
    }),
  });
  recordOverrideCache(input.hoodId, clean);
  return true;
}

export async function batchSaveNeighborhoodOverrides(
  overrides: SaveNeighborhoodOverrideInput[],
  options?: { skipIfUnchanged?: boolean },
): Promise<number> {
  const unique = new Map<number, SaveNeighborhoodOverrideInput>();
  for (const item of overrides) unique.set(item.hoodId, item);
  const items = Array.from(unique.values()).filter((item) => {
    if (!options?.skipIfUnchanged) return true;
    return !shouldSkipRedundantOverrideWrite(item.hoodId, buildSanitizedOverridePayload(item));
  });
  let synced = 0;
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    const payload = batch.map((item) => ({
      hoodId: item.hoodId,
      buyPerSqm: item.buyPerSqm,
      rahn80m: item.rahn80m,
      ...(item.sponsor ? { sponsor: item.sponsor } : {}),
    }));
    await requestJson('/api/v1/admin/market/neighborhood-overrides/batch', {
      method: 'PUT',
      body: JSON.stringify({ cityId: 'tehran', overrides: payload }),
    });
    for (const item of batch) recordOverrideCache(item.hoodId, buildSanitizedOverridePayload(item));
    synced += batch.length;
  }
  return synced;
}

export function subscribeToBargains(
  onUpdate: (groupedByHood: Record<number, BargainListing[]>) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return subscribeToState((state) => {
    const grouped: Record<number, BargainListing[]> = {};
    for (const row of state.bargains || []) {
      const id = String(row.id || '');
      const mapped = mapFirestoreDocToBargain(id.replace(/^cloud-/, ''), row);
      if (mapped) (grouped[mapped.hoodId] ||= []).push({ ...mapped.listing, status: row.status as BargainListing['status'] });
    }
    return grouped;
  }, onUpdate, onError);
}

export async function createBargainWithOwner(
  input: CreateBargainInput,
  userId: string,
): Promise<{ bargainDocId: string; listing: BargainListing }> {
  const uid = await currentSessionUid();
  if (!uid || uid !== userId) throw new Error('AUTH_REQUIRED');
  const clean = buildSanitizedBargainPayload(input);
  const normalizedPrice = normalizeDigitsToEnglish(input.priceText).replace(/[^0-9.]/g, '');
  const priceMillions = Number(normalizedPrice);
  if (!Number.isFinite(priceMillions) || priceMillions <= 0) throw new Error('INVALID_PRICE_MILLIONS');
  const payload = await requestJson<ApiResponse & { bargainId?: string; listingStatus?: string }>('/api/v1/market/bargains', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey('bargain') },
    body: JSON.stringify({
      cityId: 'tehran',
      hoodId: input.hoodId,
      hoodName: input.hoodName || '',
      title: input.title,
      type: input.type,
      sqm: input.sqm,
      priceMillions,
      priceText: input.priceText,
      discountPercent: input.discountPercent,
      buyerProfitText: input.buyerProfitText,
      street: input.street,
      mediaObjectIds: input.objectStorageObjectIds || [],
      ...(clean.videoUrl ? { videoUrl: clean.videoUrl } : {}),
    }),
  });
  const bargainId = String(payload.bargainId || '');
  if (!bargainId) throw new Error('BARGAIN_RECORD_NOT_FOUND_AFTER_COMMIT');
  const mapped = mapFirestoreDocToBargain(bargainId, {
    ...clean, hoodId: input.hoodId, createdAtIso: new Date().toISOString(),
  });
  if (!mapped) throw new Error('BARGAIN_MAP_FAILED');
  return { bargainDocId: bargainId, listing: mapped.listing };
}

export async function deleteBargainWithOwner(bargainDocId: string): Promise<void> {
  const uid = await currentSessionUid();
  if (!uid) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/v1/market/bargains/${encodeURIComponent(bargainDocId)}`, {
    method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as ApiResponse;
  if (!response.ok) throw new Error(payload.code || `BARGAIN_DELETE_HTTP_${response.status}`);
}

export function subscribeToResidentVotes(
  params: { uid: string; isVerifiedAdmin: boolean },
  onUpdate: (votes: ResidentVoteDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return subscribeToState((state) => (state.votes || []).map((row) => ({
    id: String(row.id || ''),
    hoodId: Number(row.hoodId),
    hoodName: String(row.hoodName || ''),
    userId: String(row.userId || ''),
    userDisplayName: String(row.userDisplayName || 'ساکن محله'),
    air: Number(row.air), powerWater: Number(row.powerWater), internet: Number(row.internet),
    metro: Number(row.metro), security: Number(row.security), flatTerrain: Number(row.flatTerrain),
    comment: String(row.comment || ''), locationVerified: Boolean(row.locationVerified),
  })), onUpdate, onError);
}

export async function submitResidentVote(input: SubmitResidentVoteInput): Promise<string> {
  const { voteId } = buildSanitizedVotePayload(input);
  const payload = await requestJson<ApiResponse & { vote?: { id?: string } }>('/api/v1/market/votes', {
    method: 'POST',
    body: JSON.stringify({
      cityId: 'tehran', hoodId: input.hoodId, air: input.air, powerWater: input.powerWater,
      internet: input.internet, metro: input.metro, security: input.security, flatTerrain: input.flatTerrain,
      comment: input.comment,
    }),
  });
  return String(payload.vote?.id || voteId);
}

export function subscribeToSponsorRequests(
  onUpdate: (result: { requests: SponsorCrmRequestItem[]; activeSponsorsByHood: Record<number, NeighborhoodSponsor> }) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return subscribeToState((state) => {
    const requests = (state.sponsors || []).map((row) => ({
      id: String(row.id || ''),
      hoodId: Number(row.hoodId),
      hoodName: String(row.hoodName || ''),
      agencyName: String(row.agencyName || ''),
      phone: String(row.phone || ''),
      specialty: String(row.specialty || ''),
      experienceYears: Number(row.experienceYears || 0),
      monthlyTariffMillion: Number(row.monthlyTariffMillion || 0),
      planMonths: Number(row.planMonths) === 3 ? 3 as const : 1 as const,
      totalPayableMillion: Number(row.totalPayableMillion || 0),
      trackingCode: String(row.trackingCode || ''),
      expiresAtIso: typeof row.expiresAtIso === 'string' ? row.expiresAtIso : undefined,
      status: row.status === 'approved' ? 'approved' as const : 'pending' as const,
      createdAtFa: String(row.createdAtFa || 'ثبت ابری'),
      ownerUserId: String(row.ownerUserId || ''),
    })) as SponsorCrmRequestItem[];
    const activeSponsorsByHood: Record<number, NeighborhoodSponsor> = {};
    for (const row of state.overrides || []) {
      const hoodId = Number(row.hoodId);
      const sponsor = buildSanitizedSponsorMap(row.sponsor as NeighborhoodSponsor | undefined);
      if (Number.isInteger(hoodId) && hoodId > 0 && sponsor) activeSponsorsByHood[hoodId] = sponsor;
    }
    return { requests, activeSponsorsByHood };
  }, onUpdate, onError);
}

export async function createSponsorRequest(reqDocId: string, input: CreateSponsorRequestInput): Promise<void> {
  const uid = await currentSessionUid();
  if (!uid) throw new Error('AUTH_REQUIRED');
  await requestJson('/api/v1/market/sponsor-requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey('sponsor') },
    body: JSON.stringify({
      cityId: 'tehran',
      hoodId: input.hoodId,
      hoodName: input.hoodName,
      agencyName: input.agencyName,
      phone: normalizeIranMobilePhone(input.phone),
      specialty: input.specialty,
      experienceYears: input.experienceYears,
      monthlyTariffMillion: input.monthlyTariffMillion,
      planMonths: input.planMonths,
      totalPayableMillion: input.totalPayableMillion,
      trackingCode: input.trackingCode || reqDocId,
    }),
  });
}

async function findSponsorRequest(docId: string): Promise<Record<string, unknown>> {
  const state = await readMarketState();
  const found = (state.sponsors || []).find((row) => String(row.id || '') === docId || String(row.id || '') === `cloud-${docId}`);
  if (!found) throw new Error('SPONSOR_REQUEST_NOT_FOUND');
  return found;
}

export async function approveSponsorRequest(docId: string, expiresAtIso: string): Promise<void> {
  const row = await findSponsorRequest(docId);
  await requestJson('/api/v1/admin/market/sponsors/approve', {
    method: 'POST',
    body: JSON.stringify({ requestId: docId, hoodId: row.hoodId, expiresAtIso }),
  });
}

export async function updateSponsorRequestExpiry(docId: string, expiresAtIso: string): Promise<void> {
  await approveSponsorRequest(docId, expiresAtIso);
}

export async function deleteSponsorRequest(docId: string): Promise<void> {
  await requestJson(`/api/v1/admin/market/sponsor-requests/${encodeURIComponent(docId)}`, { method: 'DELETE' });
}

export function subscribeToBuyerAlerts(
  onUpdate: (leads: BuyerAlertLeadItem[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return subscribeToState((state) => (state.buyerAlerts || []).map((row) => ({
    id: String(row.id || ''),
    hoodId: Number(row.hoodId),
    hoodName: String(row.hoodName || ''),
    fullName: String(row.fullName || ''),
    phone: String(row.phone || ''),
    dealType: row.dealType === 'اجاره' ? 'اجاره' : 'خرید',
    maxBudgetText: String(row.maxBudgetText || ''),
    createdAtFa: String(row.createdAtFa || 'ثبت ابری'),
    createdAtIso: String(row.createdAtIso || ''),
    expiresAtIso: String(row.expiresAtIso || ''),
    consentVersion: String(row.consentVersion || ''),
    submittedByUid: String(row.submittedByUid || ''),
  })), onUpdate, onError);
}

export async function upsertBuyerAlertLead(input: UpsertBuyerAlertInput): Promise<string> {
  const uid = await currentSessionUid();
  if (!uid || uid !== input.userId) throw new Error('AUTH_REQUIRED');
  const digits = normalizeDigitsToEnglish(input.maxBudgetText).replace(/[^0-9.]/g, '');
  const maxBudgetMillion = Number(digits);
  if (!Number.isFinite(maxBudgetMillion) || maxBudgetMillion <= 0) throw new Error('INVALID_BUYER_ALERT_BUDGET');
  const payload = await requestJson<ApiResponse & { alertId?: string }>('/api/v1/market/buyer-alerts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey('buyer-alert') },
    body: JSON.stringify({
      cityId: 'tehran', hoodId: input.hoodId, hoodName: input.hoodName, fullName: input.fullName,
      phone: normalizeIranMobilePhone(input.phone), dealType: input.dealType, maxBudgetMillion,
      privacyConsent: true, consentVersion: input.consentVersion || 'buyer-alert-2026-10-v1',
    }),
  });
  return String(payload.alertId || `${uid}_hood_${input.hoodId}`);
}

export async function repairFirestoreDocumentInCloud(
  collectionName: string,
  docId: string,
  sanitizedData: Record<string, unknown>,
): Promise<boolean> {
  void collectionName;
  void docId;
  void sanitizedData;
  return false;
}

export async function quarantineDeleteFirestoreDocument(collectionName: string, docId: string): Promise<boolean> {
  void collectionName;
  void docId;
  return false;
}

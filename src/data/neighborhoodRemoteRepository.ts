/** @file src/data/neighborhoodRemoteRepository.ts — API-backed neighborhood cloud sync (no client Firestore) */
import { auth } from '../firebase';
import { clampNumber, DEFAULT_FEATURE_FLAGS, type FeatureFlags, loadValidatedFeatureFlags } from '../utils/security';
import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';
import { BargainListing, BuyerAlertLeadItem, isAuthorizedAdminUser, NeighborhoodSponsor, ResidentVoteDoc, SponsorCrmRequestItem } from './neighborhoods';
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
import { OperationType, prepareFirestorePayload, recordFirestoreQueryError } from '../firebase';

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

async function getAuthBearer(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  } catch {
    return null;
  }
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
  return false;
}

export async function fetchUserPreferences(uid: string): Promise<ParsedUserPreferences | null> {
  void uid;
  return null;
}

export async function saveUserPreferences(input: SaveUserPreferencesInput): Promise<void> {
  const token = await getAuthBearer();
  if (!token) return;
  try {
    await fetch('/api/account/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        map: { mode: input.mode, buyTotalBudget: input.buyTotalBudget, deposit: input.deposit, monthlyRent: input.monthlyRent, targetSqm: input.targetSqm, workHubId: input.workHubId },
      }),
      cache: 'no-store',
    });
  } catch (err) {
    recordFirestoreQueryError(err, OperationType.WRITE, `userPreferences/${input.userId}`);
  }
}

export function subscribeToFeatureFlags(onUpdate: (flags: FeatureFlags) => void): Unsubscribe {
  onUpdate(loadValidatedFeatureFlags());
  return noopUnsub;
}

export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  void flags;
}

export function subscribeToMonetizationDiscount(onUpdate: (discountPercent: number) => void): Unsubscribe {
  try {
    const raw = localStorage.getItem('tehran_radar_campaign_discount_v1');
    const disc = raw ? Number(raw) : NaN;
    if (Number.isFinite(disc) && disc >= 0 && disc <= 100) onUpdate(Math.round(disc));
  } catch {
    /* ignore */
  }
  return noopUnsub;
}

export async function saveMonetizationDiscount(discountPercent: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
  try {
    localStorage.setItem('tehran_radar_campaign_discount_v1', String(clamped));
  } catch {
    /* ignore */
  }
}

export function subscribeToNeighborhoodOverrides(onUpdate: (overridesMap: Record<number, NeighborhoodOverrideDto>) => void): Unsubscribe {
  onUpdate({});
  return noopUnsub;
}

export async function saveNeighborhoodOverride(input: SaveNeighborhoodOverrideInput, options?: { skipIfUnchanged?: boolean }): Promise<boolean> {
  void input;
  void options;
  return false;
}

export async function batchSaveNeighborhoodOverrides(overrides: SaveNeighborhoodOverrideInput[], options?: { skipIfUnchanged?: boolean }): Promise<number> {
  void overrides;
  void options;
  return 0;
}

export function subscribeToBargains(onUpdate: (groupedByHood: Record<number, BargainListing[]>) => void, onError?: (err: unknown) => void): Unsubscribe {
  void onError;
  onUpdate({});
  return noopUnsub;
}

export async function createBargainWithOwner(
  input: CreateBargainInput,
  userId: string,
): Promise<{ bargainDocId: string; listing: BargainListing }> {
  const cleanPayload = buildSanitizedBargainPayload(input);
  const bargainDocId = `brg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const token = await getAuthBearer();
  if (!token) throw new Error('AUTH_REQUIRED');
  const res = await fetch('/api/my-bargains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: bargainDocId, hoodId: input.hoodId, hoodName: input.hoodName, title: input.title, ...cleanPayload, ownerUserId: userId }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BARGAIN_API_${res.status}`);
  const mapped = mapFirestoreDocToBargain(bargainDocId, cleanPayload);
  if (!mapped) throw new Error('BARGAIN_MAP_FAILED');
  return { bargainDocId, listing: mapped.listing };
}

export async function deleteBargainWithOwner(bargainDocId: string): Promise<void> {
  const token = await getAuthBearer();
  if (!token) return;
  await fetch(`/api/my-bargains/${encodeURIComponent(bargainDocId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
}

export function subscribeToResidentVotes(
  params: { uid: string; isVerifiedAdmin: boolean },
  onUpdate: (votes: ResidentVoteDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  void params;
  void onError;
  onUpdate([]);
  return noopUnsub;
}

export async function submitResidentVote(input: SubmitResidentVoteInput): Promise<string> {
  const { voteId } = buildSanitizedVotePayload(input);
  void voteId;
  return voteId;
}

export function subscribeToSponsorRequests(
  onUpdate: (result: { requests: SponsorCrmRequestItem[]; activeSponsorsByHood: Record<number, NeighborhoodSponsor> }) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  void onError;
  onUpdate({ requests: [], activeSponsorsByHood: {} });
  return noopUnsub;
}

export async function createSponsorRequest(reqDocId: string, input: CreateSponsorRequestInput): Promise<void> {
  void reqDocId;
  void input;
}

export async function approveSponsorRequest(docId: string, expiresAtIso: string): Promise<void> {
  void docId;
  void expiresAtIso;
}

export async function updateSponsorRequestExpiry(docId: string, expiresAtIso: string): Promise<void> {
  void docId;
  void expiresAtIso;
}

export async function deleteSponsorRequest(docId: string): Promise<void> {
  void docId;
}

export function subscribeToBuyerAlerts(onUpdate: (leads: BuyerAlertLeadItem[]) => void, onError?: (err: unknown) => void): Unsubscribe {
  void onError;
  onUpdate([]);
  return noopUnsub;
}

export async function upsertBuyerAlertLead(input: UpsertBuyerAlertInput): Promise<string> {
  const hoodId = Math.min(999, Math.max(1, Math.round(Number(input.hoodId) || 1)));
  const alertDocId = `${input.userId}_hood_${hoodId}`;
  const token = await getAuthBearer();
  if (!token) return alertDocId;
  try {
    await fetch('/api/buyer-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        hoodId,
        hoodName: input.hoodName,
        fullName: input.fullName,
        phone: normalizeIranMobilePhone(input.phone),
        dealType: input.dealType,
        maxBudgetText: input.maxBudgetText,
        privacyConsent: true,
        consentVersion: input.consentVersion || 'buyer-alert-2026-10-v1',
      }),
      cache: 'no-store',
    });
  } catch (err) {
    recordFirestoreQueryError(err, OperationType.WRITE, `buyerAlerts/${alertDocId}`);
  }
  return alertDocId;
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
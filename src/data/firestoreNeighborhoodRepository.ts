import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type Unsubscribe, } from 'firebase/firestore'; import { db, handleFirestoreError, OperationType, prepareFirestorePayload, recordFirestoreQueryError, } from '../firebase';
import { isAllowedFirestoreNeighborhoodDocument } from './firestoreNeighborhoodRepositoryGuards'; import { clampNumber, FeatureFlags } from '../utils/security'; import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; import { BargainListing, BuyerAlertLeadItem, isAuthorizedAdminUser, NeighborhoodSponsor, ResidentVoteDoc, SponsorCrmRequestItem, } from './neighborhoods'; import {
  buildSanitizedBargainPayload, buildSanitizedOverridePayload, buildSanitizedSponsorMap, buildSanitizedVotePayload, clearNeighborhoodRepositoryCache, CreateBargainInput, CreateSponsorRequestInput, mapFirestoreDocToBargain, mapFirestoreDocToBuyerLead, mapFirestoreDocToOverride, mapFirestoreDocToSponsorRequest, mapFirestoreDocToVote, mergeNeighborhoodOverridesIntoList, NeighborhoodOverrideDto, normalizeIranMobilePhone, ParsedUserPreferences, recordOverrideCache, SaveNeighborhoodOverrideInput, SaveUserPreferencesInput, shouldSkipRedundantOverrideWrite, SubmitResidentVoteInput, UpsertBuyerAlertInput,
} from './firestoreNeighborhoodMappers'; export { buildSanitizedBargainPayload, buildSanitizedOverridePayload, buildSanitizedSponsorMap, buildSanitizedVotePayload, clearNeighborhoodRepositoryCache, mapFirestoreDocToBargain,
  mapFirestoreDocToBuyerLead, mapFirestoreDocToOverride, mapFirestoreDocToSponsorRequest, mapFirestoreDocToVote, mergeNeighborhoodOverridesIntoList, normalizeIranMobilePhone, recordOverrideCache, shouldSkipRedundantOverrideWrite, };
export type { CreateBargainInput, CreateSponsorRequestInput, NeighborhoodOverrideDto, ParsedUserPreferences,
  SaveNeighborhoodOverrideInput, SaveUserPreferencesInput, SubmitResidentVoteInput, UpsertBuyerAlertInput, }; export function formatUserPreferencesIntlSummary(prefs: ParsedUserPreferences, areaUnit: AreaUnit = getStoredAreaUnit(), referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency()) { const sqm = clampNumber(prefs.targetSqm, 20, 1000, 80); return { displayAreaValue: Math.round(convertAreaFromSqm(sqm, areaUnit)), displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), budgetIntlText: formatMillionTomanAsIntlCurrency(clampNumber(prefs.buyTotalBudget, 500, 1000000, 6500), referenceCurrency), depositIntlText: formatMillionTomanAsIntlCurrency(clampNumber(prefs.deposit, 0, 100000, 800), referenceCurrency) }; } export async function checkDelegatedAdminRole(user: { uid: string; email?: string | null; emailVerified?: boolean }): Promise<boolean> { if (!user.emailVerified || isAuthorizedAdminUser(user, false)) return false; try { const snap = await getDoc(doc(db, 'admins', user.uid)); return snap.exists() && isAuthorizedAdminUser(user, snap.data() as any);
  } catch { return false; } }
export async function fetchUserPreferences(uid: string): Promise<ParsedUserPreferences | null> { const prefPath = `userPreferences/${uid}`;
  try { const snap = await getDoc(doc(db, 'userPreferences', uid)); if (!snap.exists()) return null; const d = snap.data();
    return { mode: d.mode === 'rent' || d.mode === 'buy' ? d.mode : undefined, deposit: typeof d.deposit === 'number' && d.deposit >= 0 && d.deposit <= 100000 ? d.deposit : undefined, monthlyRent: typeof d.monthlyRent === 'number' && d.monthlyRent >= 0 && d.monthlyRent <= 1000 ? d.monthlyRent : undefined,
      buyTotalBudget: typeof d.buyTotalBudget === 'number' && d.buyTotalBudget >= 500 && d.buyTotalBudget <= 1000000 ? d.buyTotalBudget : undefined, targetSqm: typeof d.targetSqm === 'number' && d.targetSqm >= 20 && d.targetSqm <= 1000 ? d.targetSqm : undefined,
      workHubId: typeof d.workHubId === 'string' && d.workHubId.length <= 40 ? d.workHubId : undefined, favoriteHoodIds: Array.isArray(d.favoriteHoodIds)
        ? d.favoriteHoodIds.filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 999).slice(0, 25) : [], };
  } catch (err) { try { handleFirestoreError(err, OperationType.GET, prefPath); } catch { /* Non-fatal */ } return null; } }
export async function saveUserPreferences(input: SaveUserPreferencesInput): Promise<void> { const cleanPayload = prepareFirestorePayload({ userId: input.userId, mode: input.mode === 'rent' ? 'rent' : 'buy',
    deposit: clampNumber(input.deposit, 0, 100000, 800), monthlyRent: clampNumber(input.monthlyRent, 0, 1000, 15), buyTotalBudget: clampNumber(input.buyTotalBudget, 500, 1000000, 6500), targetSqm: clampNumber(input.targetSqm, 20, 1000, 80),
    workHubId: (input.workHubId || 'none').slice(0, 40), favoriteHoodIds: Array.from(new Set(input.favoriteHoodIds.filter((id) => typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 999))).slice(0, 25),
  }); await setDoc(doc(db, 'userPreferences', input.userId), { ...cleanPayload, updatedAt: serverTimestamp() }); }
export function subscribeToFeatureFlags(onUpdate: (flags: FeatureFlags) => void): Unsubscribe { return onSnapshot(doc(db, 'appConfig', 'featureFlags'), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    onUpdate({
      enableCommissionCalc: Boolean(d.enableCommissionCalc ?? true), enableMultiCity: Boolean(d.enableMultiCity ?? true),
      enableSponsorBilling: Boolean(d.enableSponsorBilling ?? true), enableAiContractCheck: Boolean(d.enableAiContractCheck ?? true),
      enableTelegramFeed: Boolean(d.enableTelegramFeed ?? true), enableAiValuation: Boolean(d.enableAiValuation ?? true),
      enableFakeAdDetector: Boolean(d.enableFakeAdDetector ?? true), enableMortgageSimulator: Boolean(d.enableMortgageSimulator ?? true),
      enableTenantRights: Boolean(d.enableTenantRights ?? true), enableMunicipalityCalc: Boolean(d.enableMunicipalityCalc ?? true),
      enablePropertySwap: Boolean(d.enablePropertySwap ?? true), enableVisitChecklist: Boolean(d.enableVisitChecklist ?? true),
      enableSchoolRadar: Boolean(d.enableSchoolRadar ?? true), enableRealtorStudio: Boolean(d.enableRealtorStudio ?? true),
      enableRenovationCalc: Boolean(d.enableRenovationCalc ?? true), enableInvestmentSim: Boolean(d.enableInvestmentSim ?? true),
      enableSafetyRadar: Boolean(d.enableSafetyRadar ?? true), enableCommercialRadar: Boolean(d.enableCommercialRadar ?? true),
      enableSuburbRadar: Boolean(d.enableSuburbRadar ?? true), enablePreSaleRadar: Boolean(d.enablePreSaleRadar ?? true),
      enableMovingPlanner: Boolean(d.enableMovingPlanner ?? true), enableFractionalInvest: Boolean(d.enableFractionalInvest ?? true),
      enableTrafficZoneCalc: Boolean(d.enableTrafficZoneCalc ?? true), enableSeoContentGen: Boolean(d.enableSeoContentGen ?? true),
    });
  }, (err) => { recordFirestoreQueryError(err, OperationType.GET, 'appConfig/featureFlags'); });
}
export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  const cleanFlags = prepareFirestorePayload({ ...flags });
  await setDoc(doc(db, 'appConfig', 'featureFlags'), { ...cleanFlags, updatedAt: serverTimestamp() });
}
export function subscribeToMonetizationDiscount(onUpdate: (discountPercent: number) => void): Unsubscribe {
  return onSnapshot(doc(db, 'appConfig', 'monetization'), (snap) => {
    if (!snap.exists()) return;
    const disc = snap.data().campaignDiscountPercent;
    if (typeof disc === 'number' && !Number.isNaN(disc) && disc >= 0 && disc <= 100) onUpdate(Math.round(disc));
  }, (err) => { recordFirestoreQueryError(err, OperationType.GET, 'appConfig/monetization'); });
}
export async function saveMonetizationDiscount(discountPercent: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
  const cleanPayload = prepareFirestorePayload({ campaignDiscountPercent: clamped });
  await setDoc(doc(db, 'appConfig', 'monetization'), { ...cleanPayload, updatedAt: serverTimestamp() });
}
export function subscribeToNeighborhoodOverrides(
  onUpdate: (overridesMap: Record<number, NeighborhoodOverrideDto>) => void
): Unsubscribe {
  const q = query(collection(db, 'neighborhoodOverrides'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(1000));
  return onSnapshot(q, (snapshot) => {
    clearNeighborhoodRepositoryCache();
    if (snapshot.empty) return;
    const overridesMap: Record<number, NeighborhoodOverrideDto> = {};
    const orderedDocs = snapshot.docs.slice().sort((a, b) => {
      const aIsLegacy = a.id.startsWith('hood_') ? 0 : 1;
      const bIsLegacy = b.id.startsWith('hood_') ? 0 : 1;
      return aIsLegacy - bIsLegacy;
    });
    orderedDocs.forEach((docSnap) => {
      const dto = mapFirestoreDocToOverride(docSnap.id, docSnap.data());
      if (dto) overridesMap[dto.hoodId] = dto;
    });
    if (Object.keys(overridesMap).length > 0) onUpdate(overridesMap);
  }, (err) => { recordFirestoreQueryError(err, OperationType.LIST, 'neighborhoodOverrides'); });
}
export async function saveNeighborhoodOverride(
  input: SaveNeighborhoodOverrideInput,
  options?: { skipIfUnchanged?: boolean }
): Promise<boolean> {
  if (input.hoodId < 1 || input.hoodId > 999) return false;
  const cleanPayload = buildSanitizedOverridePayload(input);
  if (options?.skipIfUnchanged !== false && shouldSkipRedundantOverrideWrite(input.hoodId, cleanPayload)) return false;
  await setDoc(doc(db, 'neighborhoodOverrides', String(input.hoodId)), { ...cleanPayload, updatedAt: serverTimestamp() });
  recordOverrideCache(input.hoodId, cleanPayload);
  return true;
}
export async function batchSaveNeighborhoodOverrides(
  overrides: SaveNeighborhoodOverrideInput[],
  options?: { skipIfUnchanged?: boolean }
): Promise<number> {
  const pending: { hoodId: number; payload: Record<string, unknown> }[] = [];
  for (const item of overrides) {
    if (!item || item.hoodId < 1 || item.hoodId > 999) continue;
    const payload = buildSanitizedOverridePayload(item);
    if (options?.skipIfUnchanged !== false && shouldSkipRedundantOverrideWrite(item.hoodId, payload)) continue;
    pending.push({ hoodId: item.hoodId, payload });
  }
  const CHUNK_SIZE = 250;
  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const slice = pending.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const entry of slice) {
      batch.set(doc(db, 'neighborhoodOverrides', String(entry.hoodId)), { ...entry.payload, updatedAt: serverTimestamp() });
    }
    await batch.commit();
    for (const entry of slice) recordOverrideCache(entry.hoodId, entry.payload);
  }
  return pending.length;
}
export function subscribeToBargains(
  onUpdate: (groupedByHood: Record<number, BargainListing[]>) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'bargains'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(200));
  return onSnapshot(q, (snapshot) => {
    const grouped: Record<number, BargainListing[]> = {};
    const sortedDocs = snapshot.docs.slice().sort((a, b) => ((b.data().createdAt?.toMillis?.() ?? 0) as number) - ((a.data().createdAt?.toMillis?.() ?? 0) as number));
    sortedDocs.forEach((docSnap) => {
      const mapped = mapFirestoreDocToBargain(docSnap.id, docSnap.data());
      if (!mapped) return;
      if (!grouped[mapped.hoodId]) grouped[mapped.hoodId] = [];
      grouped[mapped.hoodId].push(mapped.listing);
    });
    onUpdate(grouped);
  }, (err) => {
    recordFirestoreQueryError(err, OperationType.LIST, 'bargains');
    if (onError) onError(err);
  });
}
export async function createBargainWithOwner(
  input: CreateBargainInput,
  userId: string
): Promise<{ bargainDocId: string; listing: BargainListing }> {
  const bargainRef = doc(collection(db, 'bargains'));
  const bargainDocId = bargainRef.id;
  const ownerRef = doc(db, 'bargainOwners', bargainDocId);
  const cleanPayload = buildSanitizedBargainPayload(input);
  const cleanOwner = prepareFirestorePayload({ bargainId: bargainDocId, userId });
  const batch = writeBatch(db);
  batch.set(bargainRef, { ...cleanPayload, createdAt: serverTimestamp() });
  batch.set(ownerRef, { ...cleanOwner, createdAt: serverTimestamp() });
  await batch.commit();
  return { bargainDocId, listing: mapFirestoreDocToBargain(bargainDocId, cleanPayload)!.listing };
}
export async function deleteBargainWithOwner(bargainDocId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'bargains', bargainDocId));
  batch.delete(doc(db, 'bargainOwners', bargainDocId));
  await batch.commit();
}
export function subscribeToResidentVotes(
  params: { uid: string; isVerifiedAdmin: boolean },
  onUpdate: (votes: ResidentVoteDoc[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = params.isVerifiedAdmin
    ? query(collection(db, 'votes'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(200))
    : query(collection(db, 'votes'), where('userId', '==', params.uid), limit(100));
  return onSnapshot(q, (snapshot) => {
    const docs: ResidentVoteDoc[] = [];
    snapshot.forEach((docSnap) => {
      const mapped = mapFirestoreDocToVote(docSnap.id, docSnap.data());
      if (mapped) docs.push(mapped);
    });
    onUpdate(docs);
  }, (err) => {
    recordFirestoreQueryError(err, OperationType.LIST, 'votes');
    if (onError) onError(err);
  });
}
export async function submitResidentVote(input: SubmitResidentVoteInput): Promise<string> {
  const { voteId, mutableFields, createFields } = buildSanitizedVotePayload(input);
  const voteRef = doc(db, 'votes', voteId);
  const existingSnap = await getDoc(voteRef);
  if (existingSnap.exists()) {
    await updateDoc(voteRef, { ...mutableFields, lastUpdatedAt: serverTimestamp() });
  } else {
    await setDoc(voteRef, { ...createFields, createdAt: serverTimestamp(), lastUpdatedAt: serverTimestamp() });
  }
  return voteId;
}
export function subscribeToSponsorRequests(
  onUpdate: (result: { requests: SponsorCrmRequestItem[]; activeSponsorsByHood: Record<number, NeighborhoodSponsor> }) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'sponsorRequests'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(150));
  return onSnapshot(q, (snapshot) => {
    const requests: SponsorCrmRequestItem[] = [];
    const activeSponsorsByHood: Record<number, NeighborhoodSponsor> = {};
    const nowMs = Date.now();
    snapshot.forEach((docSnap) => {
      const parsed = mapFirestoreDocToSponsorRequest(docSnap.id, docSnap.data(), nowMs);
      if (!parsed) return;
      requests.push(parsed.item);
      if (parsed.activeSponsor) activeSponsorsByHood[parsed.item.hoodId] = parsed.activeSponsor;
    });
    onUpdate({ requests, activeSponsorsByHood });
  }, (err) => {
    recordFirestoreQueryError(err, OperationType.LIST, 'sponsorRequests');
    if (onError) onError(err);
  });
}
export async function createSponsorRequest(reqDocId: string, input: CreateSponsorRequestInput): Promise<void> {
  const cleanPayload = prepareFirestorePayload({
    hoodId: Math.min(999, Math.max(1, Math.round(Number(input.hoodId) || 1))),
    hoodName: input.hoodName.slice(0, 80), agencyName: input.agencyName.slice(0, 120), phone: input.phone.slice(0, 30),
    specialty: input.specialty.slice(0, 140), experienceYears: Math.min(60, Math.max(1, Math.round(Number(input.experienceYears) || 10))),
    monthlyTariffMillion: Math.min(1000, Math.max(0, Number(input.monthlyTariffMillion) || 5)),
    planMonths: input.planMonths === 3 ? 3 : 1,
    totalPayableMillion: Math.min(5000, Math.max(0, Number(input.totalPayableMillion) || 5)),
    trackingCode: input.trackingCode.slice(0, 80), expiresAtIso: input.expiresAtIso.slice(0, 60),
    status: input.status === 'approved' ? 'approved' : 'pending',
  });
  await setDoc(doc(db, 'sponsorRequests', reqDocId), { ...cleanPayload, createdAt: serverTimestamp() });
}
export async function approveSponsorRequest(docId: string, expiresAtIso: string): Promise<void> {
  await updateDoc(doc(db, 'sponsorRequests', docId), prepareFirestorePayload({ status: 'approved', expiresAtIso: expiresAtIso.slice(0, 60) }));
}
export async function updateSponsorRequestExpiry(docId: string, expiresAtIso: string): Promise<void> {
  await updateDoc(doc(db, 'sponsorRequests', docId), prepareFirestorePayload({ expiresAtIso: expiresAtIso.slice(0, 60) }));
}
export async function deleteSponsorRequest(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'sponsorRequests', docId));
}
export function subscribeToBuyerAlerts(
  onUpdate: (leads: BuyerAlertLeadItem[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'buyerAlerts'), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(150));
  return onSnapshot(q, (snapshot) => {
    const leads: BuyerAlertLeadItem[] = [];
    const nowMs = Date.now();
    snapshot.forEach((docSnap) => {
      const mapped = mapFirestoreDocToBuyerLead(docSnap.id, docSnap.data(), nowMs);
      if (mapped) leads.push(mapped);
    });
    onUpdate(leads);
  }, (err) => {
    recordFirestoreQueryError(err, OperationType.LIST, 'buyerAlerts');
    if (onError) onError(err);
  });
}
export async function upsertBuyerAlertLead(input: UpsertBuyerAlertInput): Promise<string> {
  const hoodId = Math.min(999, Math.max(1, Math.round(Number(input.hoodId) || 1)));
  const alertDocId = `${input.userId}_hood_${hoodId}`;
  const alertRef = doc(db, 'buyerAlerts', alertDocId);
  const existingAlert = await getDoc(alertRef);
  const normalizedPhone = normalizeIranMobilePhone(input.phone);
  const mutableFields = prepareFirestorePayload({
    hoodName: input.hoodName.slice(0, 80), fullName: input.fullName.slice(0, 100), phone: normalizedPhone,
    dealType: input.dealType === 'اجاره' ? 'اجاره' : 'خرید', maxBudgetText: input.maxBudgetText.slice(0, 120),
    consentVersion: (input.consentVersion || 'buyer-alert-2026-10-v1').slice(0, 50),
  });
  const timestamps = { consentAt: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) };
  if (existingAlert.exists()) {
    await updateDoc(alertRef, { ...mutableFields, ...timestamps });
  } else {
    const createFields = prepareFirestorePayload({ userId: input.userId, hoodId, ...mutableFields });
    await setDoc(alertRef, { ...createFields, ...timestamps, createdAt: serverTimestamp() });
  }
  return alertDocId;
}
export async function repairFirestoreDocumentInCloud(collectionName: string, docId: string, sanitizedData: Record<string, unknown>): Promise<boolean> {
  if (!isAllowedFirestoreNeighborhoodDocument(collectionName, docId)) return false;
  if (docId.startsWith('sim_')) return true;
  try {
    const clean = prepareFirestorePayload(sanitizedData);
    if (collectionName === 'neighborhoodOverrides') await setDoc(doc(db, collectionName, docId), { ...clean, updatedAt: serverTimestamp() });
    else await updateDoc(doc(db, collectionName, docId), clean);
    return true;
  } catch (err) {
    recordFirestoreQueryError(err, OperationType.UPDATE, `${collectionName}/${docId}`);
    return false;
  }
}
export async function quarantineDeleteFirestoreDocument(collectionName: string, docId: string): Promise<boolean> {
  if (!isAllowedFirestoreNeighborhoodDocument(collectionName, docId)) return false;
  if (docId.startsWith('sim_')) return true;
  try { if (collectionName === 'bargains') { await deleteBargainWithOwner(docId); } else { await deleteDoc(doc(db, collectionName, docId)); } return true; } catch (err) {
    recordFirestoreQueryError(err, OperationType.DELETE, `${collectionName}/${docId}`);
    return false; } }
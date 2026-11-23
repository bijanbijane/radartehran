/**
 * @file src/data/firestoreNeighborhoodMappers.ts
 * @description Pure DTO mappers, payload sanitization builders, and in-memory write-deduplication
 * cache for the Firestore Neighborhood Repository layer.
 */
import { clampNumber, sanitizePayload } from '../utils/security'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; import { BargainListing, BuyerAlertLeadItem, Neighborhood, NeighborhoodSponsor, ResidentVoteDoc, SponsorCrmRequestItem, } from './neighborhoods';
export interface NeighborhoodOverrideDto { hoodId: number; buyPerSqm?: number; rahn80m?: number; pros?: string; cons?: string; sponsor?: NeighborhoodSponsor; displayAreaUnitLabel?: string; buyUnitPriceIntlText?: string; }
export interface SaveNeighborhoodOverrideInput { hoodId: number; buyPerSqm: number; rahn80m: number; pros?: string; cons?: string; sponsor?: Neighborhood['sponsor']; }
export interface CreateBargainInput { hoodId: number; hoodName?: string; title: string; type: 'خرید' | 'اجاره'; sqm: number; priceText: string; discountPercent: number; buyerProfitText: string; street: string; imageUrl?: string; imageUrls?: string[]; videoUrl?: string; objectStorageBucket?: string; objectStorageKeys?: string[]; objectStorageObjectIds?: string[]; }
export interface SubmitResidentVoteInput { hoodId: number; hoodName: string; userId: string; userDisplayName: string; air: number; powerWater: number; internet: number; metro: number; security: number; flatTerrain: number; comment: string; locationVerified: boolean; }
export interface UpsertBuyerAlertInput { userId: string; hoodId: number; hoodName: string; fullName: string; phone: string; dealType: 'خرید' | 'اجاره'; maxBudgetText: string; consentVersion?: string; }
export interface CreateSponsorRequestInput { hoodId: number; hoodName: string; agencyName: string; phone: string; specialty: string; experienceYears: number; monthlyTariffMillion: number; planMonths: 1 | 3; totalPayableMillion: number; trackingCode: string; expiresAtIso: string; status: 'pending' | 'approved'; }
export interface SaveUserPreferencesInput { userId: string; mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number; targetSqm: number; workHubId: string; favoriteHoodIds: number[]; }
export interface ParsedUserPreferences { mode?: 'rent' | 'buy'; deposit?: number; monthlyRent?: number; buyTotalBudget?: number; targetSqm?: number; workHubId?: string; favoriteHoodIds: number[]; }
const overrideCacheByHoodId = new Map<number, string>();
export function clearNeighborhoodRepositoryCache(): void { overrideCacheByHoodId.clear(); }
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/**
 * نرمال‌سازی شماره موبایل ایران به فرمت ۱۱ رقمی انگلیسی (09xxxxxxxxx)
 * جهت تضمین انطباق با قید امنیتی ^09[0-9]{9}$ در firestore.rules.
 */
export function normalizeIranMobilePhone(rawPhone: string): string {
  const ascii = String(rawPhone || '')
    .split('')
    .map((ch) => {
      const pIdx = PERSIAN_DIGITS.indexOf(ch);
      if (pIdx !== -1) return String(pIdx);
      const aIdx = ARABIC_DIGITS.indexOf(ch);
      if (aIdx !== -1) return String(aIdx);
      return ch;
    })
    .join('')
    .replace(/[^0-9+]/g, '');
  let digits = ascii.replace(/^\+98/, '0').replace(/^0098/, '0');
  if (digits.startsWith('989') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = `0${digits}`;
  }
  return /^09[0-9]{9}$/.test(digits) ? digits : '09120000000';
}
export function buildSanitizedSponsorMap(s?: Neighborhood['sponsor']): NeighborhoodSponsor | undefined {
  if (!s || typeof s.name !== 'string' || !s.name.trim()) return undefined;
  return {
    name: s.name.slice(0, 120),
    phone: (s.phone || '021-000').slice(0, 30),
    specialty: (s.specialty || 'مشاور محله').slice(0, 140),
    experienceYears: Math.min(60, Math.max(1, Math.round(Number(s.experienceYears) || 10))),
    ...(typeof s.expiresAtIso === 'string' && s.expiresAtIso.trim() ? { expiresAtIso: s.expiresAtIso.trim().slice(0, 60) } : {}),
    ...(s.planType === 'free' || s.planType === 'paid_1m' || s.planType === 'paid_3m' ? { planType: s.planType } : {}),
  };
}
export function buildSanitizedOverridePayload(input: SaveNeighborhoodOverrideInput): Record<string, unknown> {
  const hoodId = Math.round(Number(input.hoodId));
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) throw new Error('INVALID_HOOD_ID');
  const cleanSponsor = buildSanitizedSponsorMap(input.sponsor);
  return sanitizePayload({
    hoodId,
    buyPerSqm: Math.min(5000, Math.max(10, Math.round(Number(input.buyPerSqm) || 100))),
    rahn80m: Math.min(100000, Math.max(0, Math.round(Number(input.rahn80m) || 0))),
    ...(typeof input.pros === 'string' && input.pros.trim() ? { pros: input.pros.trim().slice(0, 400) } : {}),
    ...(typeof input.cons === 'string' && input.cons.trim() ? { cons: input.cons.trim().slice(0, 400) } : {}),
    ...(cleanSponsor ? { sponsor: cleanSponsor } : {}),
  });
}
export function shouldSkipRedundantOverrideWrite(hoodId: number, sanitizedPayload: Record<string, unknown>): boolean {
  return overrideCacheByHoodId.get(hoodId) === JSON.stringify(sanitizedPayload);
}
export function recordOverrideCache(hoodId: number, sanitizedPayload: Record<string, unknown>): void {
  overrideCacheByHoodId.set(hoodId, JSON.stringify(sanitizedPayload));
}
export function mapFirestoreDocToOverride(
  docId: string,
  d: Record<string, any>,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): NeighborhoodOverrideDto | null {
  const suffixMatch = /^(?:hood_)?(\d{1,3})$/.exec(String(docId || '').trim());
  const docSuffixNum = suffixMatch ? Number(suffixMatch[1]) : NaN;
  const explicitHoodId = d.hoodId !== undefined && d.hoodId !== null ? Number(d.hoodId) : NaN;
  if (Number.isInteger(docSuffixNum) && Number.isInteger(explicitHoodId) && docSuffixNum !== explicitHoodId) return null;
  const hoodId = Number.isInteger(explicitHoodId) ? explicitHoodId : docSuffixNum;
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) return null;
  const buyPerSqm = typeof d.buyPerSqm === 'number' && d.buyPerSqm >= 10 && d.buyPerSqm <= 5000 ? d.buyPerSqm : undefined;
  const rahn80m = typeof d.rahn80m === 'number' && d.rahn80m >= 0 && d.rahn80m <= 100000 ? d.rahn80m : undefined;
  const pros = typeof d.pros === 'string' && d.pros.trim() ? d.pros.slice(0, 400) : undefined;
  const cons = typeof d.cons === 'string' && d.cons.trim() ? d.cons.slice(0, 400) : undefined;
  const sponsor = d.sponsor && typeof d.sponsor === 'object' ? buildSanitizedSponsorMap(d.sponsor) : undefined;
  if (buyPerSqm !== undefined && rahn80m !== undefined) {
    recordOverrideCache(hoodId, buildSanitizedOverridePayload({ hoodId, buyPerSqm, rahn80m, pros, cons, sponsor }));
  }
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const buyUnitPriceIntlText = buyPerSqm !== undefined
    ? formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(buyPerSqm, areaUnit), referenceCurrency)
    : undefined;
  return { hoodId, buyPerSqm, rahn80m, pros, cons, sponsor, displayAreaUnitLabel, buyUnitPriceIntlText };
}
export function mergeNeighborhoodOverridesIntoList(
  prev: Neighborhood[],
  overridesMap: Record<number, NeighborhoodOverrideDto>,
  allCitySeeds: Neighborhood[],
  nowMs: number = Date.now()
): Neighborhood[] {
  if (Object.keys(overridesMap).length === 0) return prev;
  const mergeSponsor = (base: NeighborhoodSponsor, ovSponsor?: NeighborhoodSponsor, seedSponsor?: NeighborhoodSponsor): NeighborhoodSponsor => {
    if (!ovSponsor) return base;
    const expMs = typeof ovSponsor.expiresAtIso === 'string' ? Date.parse(ovSponsor.expiresAtIso) : NaN;
    if (Number.isFinite(expMs) && expMs <= nowMs) {
      const fallback = seedSponsor || base;
      return {
        name: fallback.name,
        phone: fallback.phone,
        specialty: fallback.specialty,
        experienceYears: fallback.experienceYears,
      };
    }
    return {
      ...base,
      ...ovSponsor,
      expiresAtIso: typeof ovSponsor.expiresAtIso === 'string' ? ovSponsor.expiresAtIso : undefined,
    };
  };
  const next = prev.map((n) => {
    const ov = overridesMap[n.id];
    if (!ov) return n;
    const seed = allCitySeeds.find((s) => s.id === n.id);
    return {
      ...n, buyPerSqm: ov.buyPerSqm ?? n.buyPerSqm, rahn80m: ov.rahn80m ?? n.rahn80m,
      pros: ov.pros ?? n.pros, cons: ov.cons ?? n.cons, sponsor: mergeSponsor(n.sponsor, ov.sponsor, seed?.sponsor),
    };
  });
  for (const [idStr, ov] of Object.entries(overridesMap)) {
    const numId = Number(idStr);
    if (!next.some((n) => n.id === numId)) {
      const seed = allCitySeeds.find((s) => s.id === numId);
      if (seed) {
        next.push({
          ...seed, buyPerSqm: ov.buyPerSqm ?? seed.buyPerSqm, rahn80m: ov.rahn80m ?? seed.rahn80m,
          pros: ov.pros ?? seed.pros, cons: ov.cons ?? seed.cons, sponsor: mergeSponsor(seed.sponsor, ov.sponsor, seed.sponsor),
        });
      }
    }
  }
  return next;
}
export function mapFirestoreDocToBargain(docId: string, d: Record<string, any>): { hoodId: number; listing: BargainListing } | null {
  const hoodId = Number(d.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || typeof d.title !== 'string' || typeof d.priceText !== 'string' || typeof d.street !== 'string') {
    return null;
  }
  const imageUrls = Array.isArray(d.imageUrls) ? d.imageUrls.filter((u: unknown): u is string => typeof u === 'string' && u.length <= 500).slice(0, 5) : undefined;
  const objectStorageKeys = Array.isArray(d.objectStorageKeys) ? d.objectStorageKeys.filter((k: unknown): k is string => typeof k === 'string' && k.length <= 240).slice(0, 6) : undefined;
  const objectStorageObjectIds = Array.isArray(d.objectStorageObjectIds) ? d.objectStorageObjectIds.filter((id: unknown): id is string => typeof id === 'string' && id.length <= 80).slice(0, 6) : undefined;
  const createdDate = typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate() : null;
  const createdAtIso = typeof d.createdAtIso === 'string' && d.createdAtIso.trim() ? d.createdAtIso.trim().slice(0, 40) : createdDate ? createdDate.toISOString() : undefined;
  return {
    hoodId,
    listing: {
      id: `cloud-${docId}`, title: d.title.slice(0, 160), type: d.type === 'اجاره' ? 'اجاره' : 'خرید',
      sqm: Math.min(1000, Math.max(25, Number(d.sqm) || 75)), priceText: d.priceText.slice(0, 160),
      discountPercent: Math.min(60, Math.max(10, Number(d.discountPercent) || 12)),
      buyerProfitText: typeof d.buyerProfitText === 'string' ? d.buyerProfitText.slice(0, 160) : '',
      street: d.street.slice(0, 120),
      ...(createdAtIso ? { createdAtIso } : {}),
      ...(typeof d.imageUrl === 'string' && d.imageUrl.length <= 500 ? { imageUrl: d.imageUrl.slice(0, 500) } : {}),
      ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
      ...(typeof d.videoUrl === 'string' && d.videoUrl.length <= 500 ? { videoUrl: d.videoUrl.slice(0, 500) } : {}),
      ...(typeof d.objectStorageBucket === 'string' ? { objectStorageBucket: d.objectStorageBucket.slice(0, 120) } : {}),
      ...(objectStorageKeys && objectStorageKeys.length > 0 ? { objectStorageKeys } : {}),
      ...(objectStorageObjectIds && objectStorageObjectIds.length > 0 ? { objectStorageObjectIds } : {}),
    },
  };
}
export function buildSanitizedBargainPayload(input: CreateBargainInput): Record<string, unknown> {
  const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.slice(0, 500)).slice(0, 5) : [];
  const objectStorageKeys = Array.isArray(input.objectStorageKeys) ? input.objectStorageKeys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).map((k) => k.slice(0, 240)).slice(0, 6) : [];
  const objectStorageObjectIds = Array.isArray(input.objectStorageObjectIds) ? input.objectStorageObjectIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.slice(0, 80)).slice(0, 6) : [];
  return sanitizePayload({
    hoodId: Math.min(999, Math.max(1, Math.round(Number(input.hoodId) || 1))),
    title: input.title.slice(0, 160), type: input.type === 'اجاره' ? 'اجاره' : 'خرید',
    sqm: Math.min(1000, Math.max(25, Math.round(Number(input.sqm) || 75))),
    priceText: input.priceText.slice(0, 160),
    discountPercent: Math.min(60, Math.max(10, Math.round(Number(input.discountPercent) || 10))),
    buyerProfitText: input.buyerProfitText.slice(0, 160), street: input.street.slice(0, 120),
    ...(imageUrls.length > 0
      ? { imageUrl: (input.imageUrl || imageUrls[0]).slice(0, 500), imageUrls }
      : typeof input.imageUrl === 'string' && input.imageUrl.trim() ? { imageUrl: input.imageUrl.slice(0, 500) } : {}),
    ...(typeof input.videoUrl === 'string' && input.videoUrl.trim() ? { videoUrl: input.videoUrl.slice(0, 500) } : {}),
    ...(typeof input.objectStorageBucket === 'string' && input.objectStorageBucket.trim() ? { objectStorageBucket: input.objectStorageBucket.slice(0, 120) } : {}),
    ...(objectStorageKeys.length > 0 ? { objectStorageKeys } : {}),
    ...(objectStorageObjectIds.length > 0 ? { objectStorageObjectIds } : {}),
  });
}
export function buildSanitizedVotePayload(input: SubmitResidentVoteInput): {
  voteId: string; mutableFields: Record<string, unknown>; createFields: Record<string, unknown>;
} {
  const hoodId = Math.min(999, Math.max(1, Math.round(Number(input.hoodId) || 1)));
  const voteId = `${input.userId}_hood_${hoodId}`;
  const mutableFields = sanitizePayload({
    hoodName: (input.hoodName || 'محله').slice(0, 80),
    userDisplayName: (input.userDisplayName || 'کاربر تاییدشده').slice(0, 100),
    air: clampNumber(input.air, 1, 10, 7), powerWater: clampNumber(input.powerWater, 1, 10, 7),
    internet: clampNumber(input.internet, 1, 10, 7), metro: clampNumber(input.metro, 1, 10, 7),
    security: clampNumber(input.security, 1, 10, 7), flatTerrain: clampNumber(input.flatTerrain, 1, 10, 7),
    comment: (input.comment || '').slice(0, 500), locationVerified: Boolean(input.locationVerified),
  });
  return { voteId, mutableFields, createFields: sanitizePayload({ hoodId, userId: input.userId, ...mutableFields }) };
}
export function mapFirestoreDocToVote(docId: string, d: Record<string, any>): ResidentVoteDoc | null {
  const hoodId = Number(d.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) return null;
  const validScore = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10 ? v : 7);
  return {
    id: docId, hoodId,
    hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 80) : '',
    userId: typeof d.userId === 'string' ? d.userId : 'anon',
    userDisplayName: typeof d.userDisplayName === 'string' ? d.userDisplayName.slice(0, 100) : 'ساکن محله',
    air: validScore(d.air), powerWater: validScore(d.powerWater), internet: validScore(d.internet),
    metro: validScore(d.metro), security: validScore(d.security), flatTerrain: validScore(d.flatTerrain),
    comment: typeof d.comment === 'string' ? d.comment.slice(0, 500) : '',
    locationVerified: Boolean(d.locationVerified),
  };
}
export function mapFirestoreDocToSponsorRequest(
  docId: string,
  d: Record<string, any>,
  nowMs: number
): { item: SponsorCrmRequestItem; activeSponsor?: NeighborhoodSponsor } | null {
  const hoodId = Number(d.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || typeof d.agencyName !== 'string' || typeof d.phone !== 'string') return null;
  const status = d.status === 'approved' ? 'approved' : 'pending';
  const planMonths = d.planMonths === 3 ? 3 : 1;
  const createdDate = typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate() : null;
  const safeTariff = typeof d.monthlyTariffMillion === 'number' && !Number.isNaN(d.monthlyTariffMillion) && d.monthlyTariffMillion >= 0 ? Math.min(1000, d.monthlyTariffMillion) : 5;
  const safeTotal = typeof d.totalPayableMillion === 'number' && !Number.isNaN(d.totalPayableMillion) && d.totalPayableMillion >= 0 ? Math.min(5000, d.totalPayableMillion) : safeTariff;
  const item: SponsorCrmRequestItem = {
    id: `cloud-${docId}`, hoodId, hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 80) : '',
    agencyName: d.agencyName.slice(0, 120), phone: d.phone.slice(0, 30),
    specialty: typeof d.specialty === 'string' ? d.specialty.slice(0, 140) : '',
    experienceYears: Math.min(60, Math.max(1, Number(d.experienceYears) || 10)),
    monthlyTariffMillion: safeTariff, planMonths, totalPayableMillion: safeTotal,
    trackingCode: typeof d.trackingCode === 'string' ? d.trackingCode.slice(0, 80) : '',
    expiresAtIso: typeof d.expiresAtIso === 'string' ? d.expiresAtIso : '', status,
    createdAtFa: typeof d.createdAtFa === 'string' ? d.createdAtFa : createdDate ? createdDate.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'ثبت ابری',
  };
  const expMs = item.expiresAtIso ? Date.parse(item.expiresAtIso) : NaN;
  const activeSponsor: NeighborhoodSponsor | undefined =
    status === 'approved' && (Number.isNaN(expMs) || expMs > nowMs)
      ? {
          name: item.agencyName, phone: item.phone, specialty: item.specialty, experienceYears: item.experienceYears,
          ...(item.expiresAtIso ? { expiresAtIso: item.expiresAtIso } : {}), planType: planMonths === 3 ? 'paid_3m' : 'paid_1m',
        }
      : undefined;
  return { item, activeSponsor };
}
export function mapFirestoreDocToBuyerLead(docId: string, d: Record<string, any>, nowMs: number): BuyerAlertLeadItem | null {
  const hoodId = Number(d.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || typeof d.fullName !== 'string' || typeof d.phone !== 'string') return null;
  const expDate = typeof d.expiresAt?.toDate === 'function' ? d.expiresAt.toDate() : null;
  if (expDate && expDate.getTime() <= nowMs) return null;
  const createdDate = typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate() : null;
  return {
    id: `cloud-${docId}`, hoodId, hoodName: typeof d.hoodName === 'string' ? d.hoodName.slice(0, 80) : '',
    fullName: d.fullName.slice(0, 100), phone: d.phone.slice(0, 30),
    dealType: d.dealType === 'اجاره' ? 'اجاره' : 'خرید',
    maxBudgetText: typeof d.maxBudgetText === 'string' ? d.maxBudgetText.slice(0, 120) : '',
    createdAtFa: typeof d.createdAtFa === 'string' ? d.createdAtFa : createdDate ? createdDate.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'ثبت ابری',
    ...(createdDate ? { createdAtIso: createdDate.toISOString() } : {}),
    ...(expDate ? { expiresAtIso: expDate.toISOString() } : {}),
    ...(typeof d.consentVersion === 'string' ? { consentVersion: d.consentVersion.slice(0, 50) } : {}),
    ...(typeof d.userId === 'string' ? { submittedByUid: d.userId.slice(0, 128) } : {}),
  };
}
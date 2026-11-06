import type { BargainListing, CityId } from '../types/models';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type DuplicateClassification = 'confirmed_duplicate' | 'probable_duplicate' | 'similar_but_distinct' | 'insufficient_information' | 'distinct';
export interface PropertyIdentityCandidate { id?: string; city?: string; hoodId?: number; type?: 'خرید' | 'اجاره' | string; sqm?: number; street?: string; title?: string; priceText?: string; floor?: number; unit?: number | string; buildAge?: number; }
export function normalizeIdentityText(value: unknown): string { if (typeof value !== 'string') return ''; return value
    .trim()
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u064A\u0649\u06CC]/g, 'ی')
    .replace(/[\u0643\u06A9]/g, 'ک')
    .replace(/\u0629/g, 'ه')
    .replace(/[\u0622\u0623\u0625]/g, 'ا')
    .replace(/[\u064B-\u065F\u0670\u0640\u200C-\u200F\u202A-\u202E]/g, ' ')
    .replace(/[،,;؛.\-_()/\\«»"':|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(); } export function computeTokenSimilarity(a: string, b: string): number { const normA = normalizeIdentityText(a); const normB = normalizeIdentityText(b); if (!normA || !normB) return 0; if (normA === normB) return 1; const tokensA = new Set(normA.split(' ').filter((t) => t.length >= 2)); const tokensB = new Set(normB.split(' ').filter((t) => t.length >= 2)); if (tokensA.size === 0 || tokensB.size === 0) { return normA === normB ? 1 : 0; } let intersection = 0; for (const t of tokensA) { if (tokensB.has(t)) intersection++; } const union = tokensA.size + tokensB.size - intersection; return union > 0 ? Math.round((intersection / union) * 1000) / 1000 : 0; } export function classifyPropertyDuplicateCandidate(
  a: PropertyIdentityCandidate,
  b: PropertyIdentityCandidate,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }
): { classification: DuplicateClassification; similarity: number; reason: string; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  const displayAreaUnitLabel = formatAreaUnitLabel(options?.areaUnit ?? 'sqm');
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT');
  const idA = typeof a?.id === 'string' ? a.id.trim() : ''; const idB = typeof b?.id === 'string' ? b.id.trim() : ''; if (idA && idB && idA === idB) { return { classification: 'confirmed_duplicate', similarity: 1, reason: 'EXACT_ENTITY_ID_MATCH', displayAreaUnitLabel, referenceValuationIntlText }; }
  const hoodA = Number(a?.hoodId); const hoodB = Number(b?.hoodId); const sqmA = Number(a?.sqm); const sqmB = Number(b?.sqm); const streetA = normalizeIdentityText(a?.street); const streetB = normalizeIdentityText(b?.street); const titleA = normalizeIdentityText(a?.title); const titleB = normalizeIdentityText(b?.title);
  if (!Number.isFinite(hoodA) || hoodA < 1 || !Number.isFinite(hoodB) || hoodB < 1 || !Number.isFinite(sqmA) || sqmA < 20 || !Number.isFinite(sqmB) || sqmB < 20 || (!streetA && !titleA) || (!streetB && !titleB)) {
    return { classification: 'insufficient_information', similarity: 0, reason: 'MISSING_CORE_IDENTITY_FIELDS', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const cityA = normalizeIdentityText(a?.city) || resolveCanonicalCityForHoodId(hoodA) || ''; const cityB = normalizeIdentityText(b?.city) || resolveCanonicalCityForHoodId(hoodB) || ''; if (cityA && cityB && cityA !== cityB) { return { classification: 'distinct', similarity: 0, reason: 'DIFFERENT_CITY', displayAreaUnitLabel, referenceValuationIntlText }; }
  if (hoodA !== hoodB) { return { classification: 'distinct', similarity: 0, reason: 'DIFFERENT_NEIGHBORHOOD', displayAreaUnitLabel, referenceValuationIntlText }; }
  const typeA = a?.type === 'اجاره' ? 'اجاره' : 'خرید'; const typeB = b?.type === 'اجاره' ? 'اجاره' : 'خرید'; if (typeA !== typeB) { return { classification: 'distinct', similarity: 0, reason: 'DIFFERENT_DEAL_TYPE', displayAreaUnitLabel, referenceValuationIntlText }; }
  const streetSim = streetA && streetB ? computeTokenSimilarity(streetA, streetB) : 0;
  const titleSim = titleA && titleB ? computeTokenSimilarity(titleA, titleB) : 0;
  const combinedSim = streetA && streetB && titleA && titleB ? Math.round((streetSim * 0.6 + titleSim * 0.4) * 1000) / 1000 : Math.max(streetSim, titleSim);
  const hasDistinctFloor = typeof a.floor === 'number' && typeof b.floor === 'number' && a.floor !== b.floor;
  const hasDistinctUnit = a.unit !== undefined && b.unit !== undefined && String(a.unit).trim() !== String(b.unit).trim();
  const hasDistinctAge = typeof a.buildAge === 'number' && typeof b.buildAge === 'number' && Math.abs(a.buildAge - b.buildAge) >= 2;
  const sqmDiff = Math.abs(sqmA - sqmB);
  if ((hasDistinctFloor || hasDistinctUnit || hasDistinctAge) && combinedSim >= 0.5) {
    return { classification: 'similar_but_distinct', similarity: combinedSim, reason: 'DIFFERENT_UNIT_FLOOR_OR_AGE', displayAreaUnitLabel, referenceValuationIntlText };
  }
  if (sqmDiff >= 2 && streetSim >= 0.7) {
    return { classification: 'similar_but_distinct', similarity: combinedSim, reason: 'SAME_STREET_DIFFERENT_AREA', displayAreaUnitLabel, referenceValuationIntlText };
  }
  const priceA = normalizeIdentityText(a?.priceText);
  const priceB = normalizeIdentityText(b?.priceText);
  const exactPriceMatch = Boolean(priceA && priceB && priceA === priceB);
  if (sqmDiff === 0 && streetA && streetA === streetB && (exactPriceMatch || titleSim >= 0.92)) {
    return { classification: 'confirmed_duplicate', similarity: Math.max(combinedSim, 0.96), reason: 'IDENTICAL_ATTRIBUTE_AND_ADDRESS_SIGNATURE', displayAreaUnitLabel, referenceValuationIntlText };
  }
  if (sqmDiff <= 1 && combinedSim >= 0.78) {
    return { classification: 'probable_duplicate', similarity: combinedSim, reason: 'HIGH_ADDRESS_AND_AREA_SIMILARITY', displayAreaUnitLabel, referenceValuationIntlText };
  }
  return { classification: 'distinct', similarity: combinedSim, reason: 'DISTINCT_LISTINGS', displayAreaUnitLabel, referenceValuationIntlText };
}
export function mergeEffectiveBargains(
  baseBargains: readonly BargainListing[] | undefined,
  liveBargains: readonly BargainListing[] | undefined,
  hoodId = 1
): BargainListing[] {
  const base = Array.isArray(baseBargains) ? baseBargains : [];
  const live = Array.isArray(liveBargains) ? liveBargains : [];
  const candidates =
    live.length > 0
      ? [...live, ...base.filter((item) => !String(item?.id ?? '').startsWith('live-divar-'))]
      : [...base];
  const seenIds = new Set<string>();
  const result: BargainListing[] = [];
  for (const item of candidates) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
    const id = item.id.trim();
    if (seenIds.has(id)) continue;
    const isConfirmedDup = result.some(
      (existing) =>
        classifyPropertyDuplicateCandidate(
          { ...existing, hoodId },
          { ...item, hoodId }
        ).classification === 'confirmed_duplicate'
    );
    if (isConfirmedDup) continue;
    seenIds.add(id);
    result.push(item);
  }
  return result;
}
export function deduplicateMediaObjects<
  T extends { id?: string; objectKey?: string; url?: string; sha256?: string }
>(items: readonly T[]): T[] {
  const seenKeys = new Set<string>();
  const seenHashes = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const hash = typeof item.sha256 === 'string' ? item.sha256.trim().toLowerCase() : '';
    const key = (item.objectKey || item.id || item.url || '').trim();
    if (!key && !hash) continue;
    if ((key && seenKeys.has(key)) || (hash && seenHashes.has(hash))) continue;
    if (key) seenKeys.add(key);
    if (hash) seenHashes.add(hash);
    out.push(item);
  }
  return out;
}
export function deduplicateHistoricalObservations<
  T extends { month?: string; dateIso?: string; hoodId?: number }
>(items: readonly T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const timeKey = normalizeIdentityText(item.dateIso || item.month || '');
    if (!timeKey) continue;
    const hoodKey = item.hoodId !== undefined ? String(item.hoodId) : 'all';
    byKey.set(`${hoodKey}:${timeKey}`, item);
  }
  return Array.from(byKey.values());
}
export function resolveCanonicalCityForHoodId(hoodId: number): CityId | null {
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) return null;
  if ((hoodId >= 1 && hoodId < 100) || (hoodId >= 500 && hoodId <= 599)) return 'tehran';
  if ((hoodId >= 100 && hoodId < 200) || (hoodId >= 600 && hoodId <= 699)) return 'karaj';
  if ((hoodId >= 200 && hoodId < 300) || (hoodId >= 700 && hoodId <= 776) || (hoodId >= 778 && hoodId <= 799)) return 'mashhad';
  if ((hoodId >= 300 && hoodId < 400) || (hoodId >= 800 && hoodId <= 887) || (hoodId >= 889 && hoodId <= 899)) return 'isfahan';
  if ((hoodId >= 400 && hoodId < 500) || (hoodId >= 900 && hoodId <= 998)) return 'shiraz';
  return 'tehran';
}
export function validateCityNeighborhoodScope(
  city: CityId,
  hoodId: number
): { valid: boolean; canonicalCity: CityId | null; reason?: string } {
  const canonicalCity = resolveCanonicalCityForHoodId(hoodId);
  if (!canonicalCity) {
    return { valid: false, canonicalCity: null, reason: 'INVALID_NEIGHBORHOOD_ID' };
  }
  if (canonicalCity !== city) {
    return { valid: false, canonicalCity, reason: 'CITY_NEIGHBORHOOD_SCOPE_MISMATCH' };
  }
  return { valid: true, canonicalCity };
}
const FORBIDDEN_DRAFT_SECRET_KEYS = new Set([
  'token', 'idtoken', 'accesstoken', 'refreshtoken', 'authorization',
  'password', 'adminpassinput', 'newadminpassword', 'savedadminpassword', 'secret', 'apikey',
]);
export interface FormDraftEnvelope<T> {
  schemaVersion: number;
  userId: string;
  updatedAtMs: number;
  serverRevisionMs: number;
  data: T;
}
export function getScopedStorageKey(baseKey: string, userId?: string | null): string {
  const cleanBase = String(baseKey || 'radar_draft').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUser =
    typeof userId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(userId.trim())
      ? userId.trim()
      : 'anon';
  return `${cleanBase}:${cleanUser}`;
}
function containsForbiddenDraftSecrets(obj: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (!obj || typeof obj !== 'object') return false;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    const cleanKey = k.toLowerCase().replace(/[_-]/g, '');
    if (FORBIDDEN_DRAFT_SECRET_KEYS.has(cleanKey) || /password|secret|apikey|idtoken|accesstoken|refreshtoken|privatekey|cookie|sessionid/i.test(cleanKey)) return true;
    if (v && typeof v === 'object' && containsForbiddenDraftSecrets(v, depth + 1)) return true;
  }
  return false;
}
export function saveUserScopedDraft<T>(
  storage: Pick<Storage, 'setItem'>,
  baseKey: string,
  userId: string | null | undefined,
  data: T,
  options: { schemaVersion?: number; nowMs?: number; serverRevisionMs?: number } = {}
): { saved: boolean; key: string; error?: string } {
  const key = getScopedStorageKey(baseKey, userId);
  if (containsForbiddenDraftSecrets(data)) {
    return { saved: false, key, error: 'FORBIDDEN_SENSITIVE_FIELD_IN_DRAFT' };
  }
  const envelope: FormDraftEnvelope<T> = {
    schemaVersion: options.schemaVersion ?? 1,
    userId: typeof userId === 'string' && userId.trim() ? userId.trim() : 'anon',
    updatedAtMs: options.nowMs ?? Date.now(),
    serverRevisionMs: options.serverRevisionMs ?? 0,
    data,
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
    return { saved: true, key };
  } catch {
    return { saved: false, key, error: 'STORAGE_QUOTA_OR_WRITE_ERROR' };
  }
}
export function loadUserScopedDraft<T>(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  baseKey: string,
  userId: string | null | undefined,
  validator: (val: unknown) => val is T,
  options: {
    schemaVersion?: number;
    maxAgeMs?: number;
    nowMs?: number;
    currentServerRevisionMs?: number;
  } = {}
): {
  status: 'restored' | 'empty' | 'stale_vs_server' | 'expired' | 'invalid_schema';
  data: T | null;
} {
  const key = getScopedStorageKey(baseKey, userId);
  const expectedUser = typeof userId === 'string' && userId.trim() ? userId.trim() : 'anon';
  const expectedSchema = options.schemaVersion ?? 1;
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const nowMs = options.nowMs ?? Date.now();
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: 'empty', data: null };
  }
  if (!raw || raw.length > 65_536) return { status: 'empty', data: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
  } catch {
    try { storage.removeItem(key); } catch { /* ignore */ }
    return { status: 'invalid_schema', data: null };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (parsed as FormDraftEnvelope<unknown>).schemaVersion !== expectedSchema ||
    (parsed as FormDraftEnvelope<unknown>).userId !== expectedUser ||
    typeof (parsed as FormDraftEnvelope<unknown>).updatedAtMs !== 'number' ||
    !Number.isFinite((parsed as FormDraftEnvelope<unknown>).updatedAtMs) ||
    containsForbiddenDraftSecrets((parsed as FormDraftEnvelope<unknown>).data) ||
    !validator((parsed as FormDraftEnvelope<unknown>).data)
  ) {
    try { storage.removeItem(key); } catch { /* ignore */ }
    return { status: 'invalid_schema', data: null };
  }
  const env = parsed as FormDraftEnvelope<T>;
  if (nowMs - env.updatedAtMs > maxAgeMs || env.updatedAtMs > nowMs + 86_400_000) {
    try { storage.removeItem(key); } catch { /* ignore */ }
    return { status: 'expired', data: null };
  }
  if (
    typeof options.currentServerRevisionMs === 'number' &&
    options.currentServerRevisionMs > env.updatedAtMs
  ) {
    return { status: 'stale_vs_server', data: null };
  }
  return { status: 'restored', data: env.data };
}
export function clearUserScopedDraft(
  storage: Pick<Storage, 'removeItem'>,
  baseKey: string,
  userId: string | null | undefined
): void {
  const key = getScopedStorageKey(baseKey, userId);
  try {
    storage.removeItem(key);
  } catch {
  }
}
export function sanitizeSafeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 1024 || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || host.includes('[') || host.includes(':')) return null;
    if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) return null;
    return parsed.toString();
  } catch { return null; }
}
export function sanitizeSafeTelHref(rawPhone: unknown): string | null { if (typeof rawPhone !== 'string') return null;
  const asciiDigits = rawPhone.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const cleaned = asciiDigits.replace(/[^\d+()-]/g, '').trim();
  if (!/^\+?[\d()-]{4,20}$/.test(cleaned) || (cleaned.match(/\d/g) || []).length < 4) return null;
  return `tel:${cleaned}`;
}
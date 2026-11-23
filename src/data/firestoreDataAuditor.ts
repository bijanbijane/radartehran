import { normalizeIranMobilePhone } from './firestoreNeighborhoodMappers'; import { checkDatabaseRelationalAndSchemaIntegrity, type DatabaseIntegrityIssue, type IntegrityIssueCategory } from './firestoreIntegrityChecks'; import type { BuyerAlertLeadItem, Neighborhood, SponsorCrmRequestItem } from './neighborhoods'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export { checkDatabaseRelationalAndSchemaIntegrity }; export type { DatabaseIntegrityIssue, IntegrityIssueCategory }; export type DataAnomalySeverity = 'CRITICAL_NEGATIVE' | 'OUT_OF_RANGE' | 'INCOMPLETE_FIELD' | 'TYPE_MISMATCH'; export interface DocumentValidationIssue { id: string; collection: string; docId: string; field: string; invalidValue: string; severity: DataAnomalySeverity; reasonFa: string; }
export interface RawDocumentAuditSample { collection: string; docId: string; data: Record<string, unknown>; } export interface FirestoreDataAuditReport { scannedAtFa: string; totalDocumentsScanned: number; invalidDocumentsCount: number; negativeFieldsCount: number; incompleteFieldsCount: number; outOfRangeCount: number; issues: DocumentValidationIssue[]; collectionStats: Record<string, { scanned: number; issues: number }>; }
const NUMERIC_BOUNDS_BY_FIELD: Record<string, { min: number; max: number; labelFa: string }> = { hoodId: { min: 1, max: 999, labelFa: 'شناسه محله (hoodId)' }, buyPerSqm: { min: 10, max: 5000, labelFa: 'قیمت هر متر مربع (میلیون تومان)' }, rahn80m: { min: 50, max: 50000, labelFa: 'رهن کامل ۸۰ متری (میلیون تومان)' }, sqm: { min: 25, max: 1000, labelFa: 'متراژ واحد (متر مربع)' }, discountPercent: { min: 10, max: 60, labelFa: 'درصد زیر قیمت بازار' }, monthlyTariffMillion: { min: 0, max: 1000, labelFa: 'تعرفه ماهانه حامی (میلیون)' }, totalPayableMillion: { min: 0, max: 5000, labelFa: 'مبلغ کل قرارداد حامی (میلیون)' }, experienceYears: { min: 1, max: 60, labelFa: 'سابقه فعالیت املاک (سال)' }, air: { min: 1, max: 10, labelFa: 'امتیاز کیفیت هوا' }, powerWater: { min: 1, max: 10, labelFa: 'امتیاز پایداری آب و برق' }, internet: { min: 1, max: 10, labelFa: 'امتیاز آنتن‌دهی و اینترنت' }, metro: { min: 1, max: 10, labelFa: 'امتیاز دسترسی مترو و حمل‌ونقل' }, security: { min: 1, max: 10, labelFa: 'امتیاز امنیت شبانه' }, flatTerrain: { min: 1, max: 10, labelFa: 'امتیاز همواری معابر' },
  campaignDiscountPercent: { min: 0, max: 100, labelFa: 'درصد تخفیف کمپین' }, deposit: { min: 0, max: 100000, labelFa: 'بودجه ودیعه' }, monthlyRent: { min: 0, max: 1000, labelFa: 'بودجه اجاره ماهانه' }, buyTotalBudget: { min: 500, max: 1000000, labelFa: 'بودجه کل خرید' }, targetSqm: { min: 20, max: 1000, labelFa: 'متراژ هدف' }, }; const REQUIRED_STRINGS_BY_COLLECTION: Record<string, { field: string; labelFa: string }[]> = { neighborhoods: [{ field: 'name', labelFa: 'نام محله' }, { field: 'zone', labelFa: 'پهنه جغرافیایی' }], bargains: [{ field: 'title', labelFa: 'عنوان آگهی شکار' }, { field: 'priceText', labelFa: 'متن قیمت آگهی' }, { field: 'street', labelFa: 'خیابان / محدوده' }],
  votes: [{ field: 'hoodName', labelFa: 'نام محله رای' }, { field: 'userId', labelFa: 'شناسه کاربر رای‌دهنده' }], sponsorRequests: [{ field: 'agencyName', labelFa: 'نام دفتر املاک' }, { field: 'phone', labelFa: 'شماره تماس املاک' }, { field: 'hoodName', labelFa: 'نام محله هدف' }], buyerAlerts: [{ field: 'fullName', labelFa: 'نام و نام خانوادگی خریدار' }, { field: 'phone', labelFa: 'شماره تماس خریدار' }, { field: 'hoodName', labelFa: 'نام محله هدف' }], }; export function auditRawDocument(collectionName: string, docId: string, data: Record<string, unknown>): DocumentValidationIssue[] {
  const issues: DocumentValidationIssue[] = []; if (!data || typeof data !== 'object') { issues.push({
      id: `${collectionName}:${docId}:root`, collection: collectionName, docId, field: 'root',
      invalidValue: String(data), severity: 'TYPE_MISMATCH', reasonFa: 'ساختار داکیومنت نامعتبر است (آبجکت نیست).', }); return issues; } for (const req of REQUIRED_STRINGS_BY_COLLECTION[collectionName] || []) { const val = data[req.field]; if (typeof val !== 'string' || val.trim().length === 0) { issues.push({
        id: `${collectionName}:${docId}:${req.field}:missing`, collection: collectionName, docId, field: req.field,
        invalidValue: val === undefined ? 'undefined' : JSON.stringify(val), severity: 'INCOMPLETE_FIELD',
        reasonFa: `فیلد اجباری «${req.labelFa}» (${req.field}) خالی یا تعریف‌نشده است.`,
      }); } } if (collectionName === 'neighborhoodOverrides' && data.buyPerSqm === undefined && data.rahn80m === undefined && data.pros === undefined && data.cons === undefined && data.sponsor === undefined) { issues.push({
      id: `${collectionName}:${docId}:emptyOverride`, collection: collectionName, docId, field: 'buyPerSqm | rahn80m',
      invalidValue: '{}', severity: 'INCOMPLETE_FIELD', reasonFa: 'داکیومنت بازنویسی محله فاقد هرگونه فیلد قیمت، مزایا/معایب یا حامی است.', }); }
  const flatEntries: [string, unknown][] = Object.entries(data); if (collectionName === 'neighborhoods' && 'id' in data) flatEntries.push(['hoodId', data.id]); if (data.scores && typeof data.scores === 'object' && !Array.isArray(data.scores)) { for (const [sk, sv] of Object.entries(data.scores as Record<string, unknown>)) flatEntries.push([sk, sv]); }
  if (data.sponsor && typeof data.sponsor === 'object' && !Array.isArray(data.sponsor)) { const sp = data.sponsor as Record<string, unknown>; if ('experienceYears' in sp) flatEntries.push(['experienceYears', sp.experienceYears]); }
  for (const [field, rawVal] of flatEntries) { const rule = NUMERIC_BOUNDS_BY_FIELD[field]; if (typeof rawVal === 'number') { if (Number.isNaN(rawVal) || !Number.isFinite(rawVal)) { issues.push({
          id: `${collectionName}:${docId}:${field}:nan`, collection: collectionName, docId, field,
          invalidValue: String(rawVal), severity: 'CRITICAL_NEGATIVE',
          reasonFa: `مقدار عددی نامعتبر (NaN / بی‌نهایت) در فیلد «${rule?.labelFa || field}».`,
        }); } else if (rawVal < 0) { issues.push({
          id: `${collectionName}:${docId}:${field}:neg`, collection: collectionName, docId, field,
          invalidValue: String(rawVal), severity: 'CRITICAL_NEGATIVE',
          reasonFa: `مقدار عددی منفی غیرمجاز (${rawVal}) در فیلد «${rule?.labelFa || field}».`,
        }); } else if (rule && (rawVal < rule.min || rawVal > rule.max)) { issues.push({
          id: `${collectionName}:${docId}:${field}:range`, collection: collectionName, docId, field,
          invalidValue: String(rawVal), severity: 'OUT_OF_RANGE',
          reasonFa: `مقدار فیلد «${rule.labelFa}» (${rawVal}) خارج از بازه مجاز [${rule.min} تا ${rule.max}] است.`,
        }); }
    } else if (rule && rawVal !== undefined && rawVal !== null) { issues.push({
        id: `${collectionName}:${docId}:${field}:type`, collection: collectionName, docId, field,
        invalidValue: JSON.stringify(rawVal), severity: 'TYPE_MISMATCH',
        reasonFa: `نوع داده فیلد «${rule.labelFa}» باید عدد (number) باشد اما ${typeof rawVal} دریافت شد.`,
      }); } }
  return issues; }
export function auditLocalRadarDatasets(params: { neighborhoods: Neighborhood[]; sponsorRequests: SponsorCrmRequestItem[]; buyerLeads: BuyerAlertLeadItem[];
  extraSamples?: RawDocumentAuditSample[]; }): FirestoreDataAuditReport { const allIssues: DocumentValidationIssue[] = []; const collectionStats: Record<string, { scanned: number; issues: number }> = {
    neighborhoods: { scanned: 0, issues: 0 }, bargains: { scanned: 0, issues: 0 }, sponsorRequests: { scanned: 0, issues: 0 },
    buyerAlerts: { scanned: 0, issues: 0 }, };
  const docsWithIssues = new Set<string>(); let totalDocumentsScanned = 0;
  const recordDocIssues = (col: string, docId: string, docIssues: DocumentValidationIssue[]) => {
    if (!collectionStats[col]) collectionStats[col] = { scanned: 0, issues: 0 };
    collectionStats[col].scanned += 1;
    totalDocumentsScanned += 1;
    if (docIssues.length > 0) {
      docsWithIssues.add(`${col}:${docId}`);
      collectionStats[col].issues += docIssues.length;
      allIssues.push(...docIssues);
    }
  };
  for (const hood of params.neighborhoods || []) {
    recordDocIssues('neighborhoods', `hood_${hood.id}`, auditRawDocument('neighborhoods', `hood_${hood.id}`, hood as unknown as Record<string, unknown>));
    for (const bg of hood.bargains || []) {
      recordDocIssues('bargains', String(bg.id), auditRawDocument('bargains', String(bg.id), { ...bg, hoodId: hood.id } as unknown as Record<string, unknown>));
    }
  }
  for (const req of params.sponsorRequests || []) {
    recordDocIssues('sponsorRequests', String(req.id), auditRawDocument('sponsorRequests', String(req.id), req as unknown as Record<string, unknown>));
  }
  for (const lead of params.buyerLeads || []) {
    recordDocIssues('buyerAlerts', String(lead.id), auditRawDocument('buyerAlerts', String(lead.id), lead as unknown as Record<string, unknown>));
  }
  for (const sample of params.extraSamples || []) {
    recordDocIssues(sample.collection, sample.docId, auditRawDocument(sample.collection, sample.docId, sample.data));
  }
  let scannedAtFa = new Date().toISOString();
  try {
    scannedAtFa = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { /* ignore */ }
  return {
    scannedAtFa, totalDocumentsScanned, invalidDocumentsCount: docsWithIssues.size,
    negativeFieldsCount: allIssues.filter((i) => i.severity === 'CRITICAL_NEGATIVE').length,
    incompleteFieldsCount: allIssues.filter((i) => i.severity === 'INCOMPLETE_FIELD' || i.severity === 'TYPE_MISMATCH').length,
    outOfRangeCount: allIssues.filter((i) => i.severity === 'OUT_OF_RANGE').length,
    issues: allIssues, collectionStats,
  };
}
export async function fetchLiveFirestoreSamplesForAudit(isVerifiedAdmin: boolean): Promise<RawDocumentAuditSample[]> {
  const samples: RawDocumentAuditSample[] = [];
  const [{ collection, getDocs, limit, query, where }, { db, OperationType, recordFirestoreQueryError }] = await Promise.all([
    import('firebase/firestore'),
    import('../firebase'),
  ]);
  const targets = [
    { name: 'neighborhoodOverrides', maxDocs: 200 },
    { name: 'bargains', maxDocs: 150 },
    ...(isVerifiedAdmin ? [{ name: 'votes', maxDocs: 150 }, { name: 'sponsorRequests', maxDocs: 100 }, { name: 'buyerAlerts', maxDocs: 100 }] : []),
  ];
  for (const target of targets) {
    try {
      const q = query(collection(db, target.name), where('hoodId', '>=', 1), where('hoodId', '<=', 999), limit(target.maxDocs));
      const snap = await getDocs(q);
      snap.forEach((docSnap) => samples.push({ collection: target.name, docId: docSnap.id, data: docSnap.data() as Record<string, unknown> }));
    } catch (err) {
      recordFirestoreQueryError(err, OperationType.LIST, target.name);
    }
  }
  return samples;
}
export interface WeeklyInvalidDocTrendPoint {
  dayKey: string;
  dayLabelFa: string;
  invalidDocsCount: number;
  negativeFieldsCount: number;
  incompleteOrRangeCount: number;
  healthScorePercent: number;
  isToday: boolean;
}
const WEEKLY_AUDIT_STORAGE_KEY = 'tehran_radar_db_audit_weekly_v1';
const PERSIAN_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const formatDayKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
export function buildWeeklyInvalidDocumentsTrend(report: FirestoreDataAuditReport, nowMs: number = Date.now()): WeeklyInvalidDocTrendPoint[] {
  const storedByDay: Record<string, { invalidDocsCount: number; negativeFieldsCount: number; incompleteOrRangeCount: number; healthScorePercent: number }> = Object.create(null);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WEEKLY_AUDIT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') storedByDay[k] = v;
        }
      }
    }
  } catch { /* ignore */ }
  const totalScanned = Math.max(1, report.totalDocumentsScanned);
  const todayHealth = Math.max(0, Math.min(100, Math.round(((totalScanned - report.invalidDocumentsCount) / totalScanned) * 1000) / 10));
  const todayKey = formatDayKey(new Date(nowMs));
  storedByDay[todayKey] = {
    invalidDocsCount: report.invalidDocumentsCount, negativeFieldsCount: report.negativeFieldsCount,
    incompleteOrRangeCount: report.incompleteFieldsCount + report.outOfRangeCount, healthScorePercent: todayHealth,
  };
  const points: WeeklyInvalidDocTrendPoint[] = [];
  const prunedStorage: Record<string, unknown> = {};
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(nowMs - offset * 24 * 60 * 60 * 1000);
    const key = formatDayKey(d);
    const weekdayFa = PERSIAN_WEEKDAYS[d.getUTCDay()] || 'روز';
    const isToday = offset === 0;
    const entry = storedByDay[key];
    if (entry) prunedStorage[key] = entry;
    points.push({
      dayKey: key, dayLabelFa: isToday ? `${weekdayFa} (امروز)` : weekdayFa,
      invalidDocsCount: entry ? entry.invalidDocsCount : 0, negativeFieldsCount: entry ? entry.negativeFieldsCount : 0,
      incompleteOrRangeCount: entry ? entry.incompleteOrRangeCount : 0, healthScorePercent: entry ? entry.healthScorePercent : 100, isToday,
    });
  }
  try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(WEEKLY_AUDIT_STORAGE_KEY, JSON.stringify(prunedStorage)); } catch { /* ignore */ }
  return points;
}
export interface NeighborhoodGeoCityCandidate {
  id?: number | string;
  hoodId?: number | string;
  name?: string;
  cityId?: string | null;
  zone?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}
export interface NeighborhoodGeoCityHealthIssue {
  docId: string;
  hoodId: number | null;
  name: string;
  rawCityId: string | null;
  resolvedCityId: string | null;
  lat: number | null;
  lng: number | null;
  hasValidCoordinates: boolean;
  hasValidCityId: boolean;
  reasonsFa: string[];
}
const VALID_CITY_ID_SET = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
function inferCanonicalCityByHoodId(id: number): string | null {
  if (!Number.isInteger(id) || id < 1 || id > 999) return null;
  if ((id >= 1 && id <= 99) || (id >= 500 && id <= 599)) return 'tehran';
  if ((id >= 100 && id <= 199) || (id >= 600 && id <= 699)) return 'karaj';
  if ((id >= 200 && id <= 299) || (id >= 700 && id <= 776) || (id >= 778 && id <= 799)) return 'mashhad';
  if ((id >= 300 && id <= 399) || (id >= 800 && id <= 887) || (id >= 889 && id <= 899)) return 'isfahan';
  if ((id >= 400 && id <= 499) || (id >= 900 && id <= 998)) return 'shiraz';
  return null;
}
export function checkNeighborhoodGeoAndCityHealth(
  candidates: readonly NeighborhoodGeoCityCandidate[],
  options?: { requireExplicitCityId?: boolean }
): NeighborhoodGeoCityHealthIssue[] {
  const issues: NeighborhoodGeoCityHealthIssue[] = [];
  for (let i = 0; i < (candidates || []).length; i += 1) {
    const item = candidates[i] || {};
    const rawId = item.id ?? item.hoodId;
    const numericId = typeof rawId === 'number' ? rawId : Number(rawId);
    const hoodId = Number.isFinite(numericId) ? numericId : null;
    const canonicalCity = hoodId !== null ? inferCanonicalCityByHoodId(hoodId) : null;
    const rawCity = item.cityId !== undefined && item.cityId !== null ? String(item.cityId).trim() : null;
    const latNum = typeof item.lat === 'number' ? item.lat : Number(item.lat);
    const lngNum = typeof item.lng === 'number' ? item.lng : Number(item.lng);
    const hasRawLatLng = item.lat !== undefined && item.lat !== null && item.lat !== '' && item.lng !== undefined && item.lng !== null && item.lng !== '';
    const hasValidCoordinates = hasRawLatLng && Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= 25 && latNum <= 40 && lngNum >= 44 && lngNum <= 64;
    let hasValidCityId = true;
    const reasonsFa: string[] = [];
    if (!hasValidCoordinates) {
      reasonsFa.push(`مختصات جغرافیایی (lat/lng) نامعتبر یا خارج از محدوده ایران (lat=${String(item.lat ?? 'null')}, lng=${String(item.lng ?? 'null')})`);
    }
    if (item.cityId !== undefined) {
      if (!rawCity || !VALID_CITY_ID_SET.has(rawCity)) {
        hasValidCityId = false;
        reasonsFa.push(`شناسه منطقه‌ای/شهری (cityId=${JSON.stringify(item.cityId)}) نامعتبر یا خالی است.`);
      } else if (canonicalCity && rawCity !== canonicalCity) {
        hasValidCityId = false;
        reasonsFa.push(`عدم تطابق شناسه شهر (${rawCity}) با بازه شناسه محله (${hoodId} متعلق به ${canonicalCity}).`);
      }
    } else if (options?.requireExplicitCityId || !canonicalCity || typeof item.zone !== 'string' || !item.zone.trim()) {
      hasValidCityId = false;
      reasonsFa.push('فاقد شناسه منطقه‌ای معتبر (cityId) یا خارج از بازه شناسه‌های شهری استاندارد.');
    }
    if (!hasValidCoordinates || !hasValidCityId) {
      issues.push({
        docId: hoodId !== null ? `hood_${hoodId}` : `hood_idx_${i}`, hoodId,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'محله بدون نام',
        rawCityId: rawCity, resolvedCityId: rawCity && VALID_CITY_ID_SET.has(rawCity) ? rawCity : canonicalCity,
        lat: hasRawLatLng && Number.isFinite(latNum) ? latNum : null,
        lng: hasRawLatLng && Number.isFinite(lngNum) ? lngNum : null,
        hasValidCoordinates, hasValidCityId, reasonsFa,
      });
    }
  }
  return issues;
}
export interface OrphanedReferenceIssue {
  id: string;
  collection: string;
  docId: string;
  referencedHoodId: number | null;
  titleOrLabel: string;
  reasonFa: string;
}
export function checkOrphanedHoodReferences(params: {
  validHoodIds: Iterable<number>;
  sponsorRequests?: readonly SponsorCrmRequestItem[];
  buyerLeads?: readonly BuyerAlertLeadItem[];
  extraSamples?: readonly RawDocumentAuditSample[];
}): OrphanedReferenceIssue[] {
  const validSet = new Set<number>(params.validHoodIds);
  const orphans: OrphanedReferenceIssue[] = [];
  const inspectRecord = (collectionName: string, docId: string, rawHoodId: unknown, label: string) => {
    const numId = typeof rawHoodId === 'number' ? rawHoodId : Number(rawHoodId);
    const hoodId = Number.isFinite(numId) ? numId : null;
    if (hoodId === null || !validSet.has(hoodId)) {
      orphans.push({
        id: `orphan:${collectionName}:${docId}`, collection: collectionName, docId,
        referencedHoodId: hoodId, titleOrLabel: label || docId,
        reasonFa: hoodId === null
          ? 'فاقد کلید خارجی شناسه محله (hoodId) معتبر.'
          : `مرجع یتیم (Orphaned Reference): محله با شناسه ${hoodId} در جدول محله‌های دیتابیس یافت نشد.`,
      });
    }
  };
  for (const req of params.sponsorRequests || []) inspectRecord('sponsorRequests', String(req.id), req.hoodId, req.agencyName || req.hoodName);
  for (const lead of params.buyerLeads || []) inspectRecord('buyerAlerts', String(lead.id), lead.hoodId, lead.fullName || lead.hoodName);
  for (const sample of params.extraSamples || []) {
    if ('hoodId' in sample.data) {
      const label = String(sample.data.title || sample.data.agencyName || sample.data.fullName || sample.data.hoodName || sample.docId);
      inspectRecord(sample.collection, sample.docId, sample.data.hoodId, label);
    }
  }
  return orphans;
}
export interface SanitizedDocumentPreview {
  collection: string; docId: string; sanitizedData: Record<string, unknown>; appliedFixesFa: string[];
  displayAreaUnitLabel?: string; sanitizedTotalBudgetIntlText?: string;
}
export function sanitizeCorruptedDocumentPayload(
  collectionName: string, docId: string, rawData: Record<string, unknown>,
  fallbackHood?: Pick<Neighborhood, 'id' | 'name' | 'buyPerSqm' | 'rahn80m'>,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): SanitizedDocumentPreview {
  const activeUnit = options?.areaUnit ?? getStoredAreaUnit(); const activeCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const sanitizedData: Record<string, unknown> = { ...rawData }; const appliedFixesFa: string[] = [];
  for (const req of REQUIRED_STRINGS_BY_COLLECTION[collectionName] || []) {
    const val = sanitizedData[req.field];
    if (typeof val !== 'string' || !val.trim()) {
      const defaultText = req.field === 'hoodName' && fallbackHood?.name ? fallbackHood.name : `${req.labelFa} (اصلاح خودکار)`;
      sanitizedData[req.field] = defaultText; appliedFixesFa.push(`تکمیل فیلد خالی «${req.labelFa}» با مقدار پیش‌فرض «${defaultText}»`);
    }
  } for (const [field, rule] of Object.entries(NUMERIC_BOUNDS_BY_FIELD)) { if (!(field in sanitizedData)) continue; const rawVal = sanitizedData[field]; const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal); if (!Number.isFinite(numVal) || numVal < 0) { const positiveCandidate = Number.isFinite(numVal) ? Math.abs(numVal) : rule.min; const clamped = Math.max(rule.min, Math.min(rule.max, positiveCandidate)); sanitizedData[field] = clamped;
      appliedFixesFa.push(`اصلاح عدد منفی/نامعتبر «${rule.labelFa}» از (${String(rawVal)}) به (${clamped})`);
    } else if (numVal < rule.min || numVal > rule.max) { const clamped = Math.max(rule.min, Math.min(rule.max, numVal)); sanitizedData[field] = clamped;
      appliedFixesFa.push(`محدودسازی فیلد «${rule.labelFa}» از (${numVal}) به بازه مجاز (${clamped})`);
    } } if (collectionName === 'buyerAlerts' && typeof sanitizedData.phone === 'string' && !/^09[0-9]{9}$/.test(sanitizedData.phone)) { const fixedPhone = normalizeIranMobilePhone(sanitizedData.phone);
    appliedFixesFa.push(`نرمال‌سازی شماره تماس خریدار از «${sanitizedData.phone}» به «${fixedPhone}» مطابق firestore.rules`);
    sanitizedData.phone = fixedPhone; }
  const refMillion = Number(sanitizedData.buyTotalBudget ?? sanitizedData.totalPayableMillion ?? fallbackHood?.buyPerSqm ?? 0);
  return { collection: collectionName, docId, sanitizedData, appliedFixesFa, displayAreaUnitLabel: formatAreaUnitLabel(activeUnit), sanitizedTotalBudgetIntlText: formatMillionTomanAsIntlCurrency(Number.isFinite(refMillion) ? refMillion : 0, activeCurrency) }; }
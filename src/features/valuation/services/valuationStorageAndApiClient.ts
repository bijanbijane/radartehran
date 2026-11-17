/** @file src/features/valuation/services/valuationStorageAndApiClient.ts — Stage 92.6, 93 & 94 Account-Scoped Valuation Storage, Schema Migration, API Client & Copy Formatter */
import type { User } from 'firebase/auth';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, type CityId } from '../../../data/multiCityData';
import { toPersianNum } from '../../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, type AreaUnit, type IntlCurrencyCode } from '../../../utils/areaUnit';
import {
  INPUT_ORIGIN_LABELS_FA,
  VALUATION_PURPOSE_LABELS_FA,
  type SavedValuationReport,
  type ValuationWorkspaceInput,
  type ValuationWorkspaceResult,
} from '../types/valuation.types';

const SAVED_VALUATIONS_V2_PREFIX = 'radar_valuation_reports_v2_';
const LEGACY_SAVED_VALUATIONS_V1_KEY = 'radar_valuation_reports_v1';

export function generateValuationReportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `val-${crypto.randomUUID()}`;
  }
  return `val-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getScopedStorageKey(uid?: string | null): string {
  const cleanUid = uid && uid.trim().length > 0 ? uid.trim() : 'device_local';
  return `${SAVED_VALUATIONS_V2_PREFIX}${cleanUid}`;
}

/** Stage 93.4: Untrusted JSON validation and non-destructive v1 -> v2 schema migration */
export function validateAndMigrateSavedValuationReports(rawUnknown: unknown): SavedValuationReport[] {
  let parsed: unknown = rawUnknown;
  if (typeof rawUnknown === 'string') {
    try {
      parsed = JSON.parse(rawUnknown);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const validReports: SavedValuationReport[] = [];
  const seenIds = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : '';
    if (!id || seenIds.has(id)) continue;

    const inputObj = rec.input as Record<string, unknown> | undefined;
    if (!inputObj || typeof inputObj !== 'object') continue;

    const sqm = Number(inputObj.sqm);
    const hoodId = Number(inputObj.hoodId ?? rec.neighborhoodId);
    const hedonicTotalMillion = Number(rec.hedonicTotalMillion);
    const hedonicPerSqm = Number(rec.hedonicPerSqm);

    if (
      !Number.isFinite(sqm) || sqm < 20 || sqm > 2000 ||
      !Number.isFinite(hoodId) || hoodId <= 0 ||
      !Number.isFinite(hedonicTotalMillion) || hedonicTotalMillion <= 0 ||
      !Number.isFinite(hedonicPerSqm) || hedonicPerSqm <= 0
    ) {
      continue;
    }

    const cityId = (typeof rec.cityId === 'string' && rec.cityId in MULTI_CITY_CONFIGS
      ? rec.cityId
      : resolveCityIdForNeighborhood(hoodId)) as CityId;
    const savedAtIso = typeof rec.savedAtIso === 'string' && rec.savedAtIso ? rec.savedAtIso : new Date().toISOString();
    const modelVersion = typeof rec.modelVersion === 'string' && rec.modelVersion ? rec.modelVersion : 'Hedonic Rule Heuristic v1405.1';
    const dataSnapshotId =
      typeof rec.dataSnapshotId === 'string' && rec.dataSnapshotId
        ? rec.dataSnapshotId
        : `snap-${cityId}-h${hoodId}-migrated`;

    const snapshotObj = (rec.snapshot && typeof rec.snapshot === 'object' ? rec.snapshot : null) as SavedValuationReport['snapshot'] | null;
    const migratedSnapshot: SavedValuationReport['snapshot'] = snapshotObj ?? {
      snapshotId: dataSnapshotId,
      dataSnapshotId,
      cityId,
      neighborhoodId: hoodId,
      canonicalNeighborhoodId: `${cityId}:${hoodId}`,
      datasetVersion: `curated-${cityId}-1405.08`,
      modelId: 'RADAR_HEDONIC_V1',
      modelVersion,
      methodologyVersion: 'hedonic_rule_1405_1',
      dataAsOfIso: savedAtIso,
      calculatedAtIso: savedAtIso,
      comparableIds: [],
      sourceIds: ['src-hedonic-v64'],
      inputFingerprint: typeof rec.inputFingerprint === 'string' ? rec.inputFingerprint : `fp-${cityId}-${hoodId}-${sqm}`,
    };

    seenIds.add(id);
    validReports.push({
      id,
      reportVersion: 2,
      savedAtIso,
      createdAtIso: typeof rec.createdAtIso === 'string' ? rec.createdAtIso : savedAtIso,
      updatedAtIso: typeof rec.updatedAtIso === 'string' ? rec.updatedAtIso : savedAtIso,
      ownerUserId: typeof rec.ownerUserId === 'string' ? rec.ownerUserId : undefined,
      storageScope: rec.storageScope === 'account_synced' ? 'account_synced' : 'device_local',
      cityId,
      neighborhoodId: hoodId,
      hoodName: typeof rec.hoodName === 'string' && rec.hoodName ? rec.hoodName : `محله ${hoodId}`,
      purpose: inputObj.purpose === 'rent' || inputObj.purpose === 'current_value' ? inputObj.purpose : 'sale',
      modelVersion,
      dataSnapshotId,
      snapshot: migratedSnapshot,
      inputFingerprint: migratedSnapshot.inputFingerprint,
      input: { ...(inputObj as unknown as ValuationWorkspaceInput), cityId, hoodId, sqm },
      hedonicTotalMillion,
      hedonicPerSqm,
      estimatedRahnMillion: typeof rec.estimatedRahnMillion === 'number' ? rec.estimatedRahnMillion : undefined,
      fastSaleTotalMillion: Number(rec.fastSaleTotalMillion) || Math.round(hedonicTotalMillion * 0.88),
      sensitivityMinMillion: Number(rec.sensitivityMinMillion) || Math.round(hedonicTotalMillion * 0.95),
      sensitivityMaxMillion: Number(rec.sensitivityMaxMillion) || Math.round(hedonicTotalMillion * 1.05),
      isHypotheticalScenario: Boolean(rec.isHypotheticalScenario),
    });
  }

  return validReports;
}

export function loadSavedValuationReports(uid?: string | null): SavedValuationReport[] {
  if (typeof window === 'undefined') return [];
  const key = getScopedStorageKey(uid);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return validateAndMigrateSavedValuationReports(raw);
    if (!uid) {
      const legacyRaw = window.localStorage.getItem(LEGACY_SAVED_VALUATIONS_V1_KEY);
      if (legacyRaw) {
        const migrated = validateAndMigrateSavedValuationReports(legacyRaw);
        window.localStorage.setItem(key, JSON.stringify(migrated));
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function persistSavedValuationReports(reports: SavedValuationReport[], uid?: string | null): void {
  if (typeof window === 'undefined') return;
  const key = getScopedStorageKey(uid);
  try {
    const validated = validateAndMigrateSavedValuationReports(reports).slice(0, 25);
    window.localStorage.setItem(key, JSON.stringify(validated));
  } catch { /* ignore */ }
}

async function getValuationAuthHeaders(currentUser?: User | null): Promise<{ ok: boolean; headers: Record<string, string>; errorFa?: string }> {
  if (!currentUser || !currentUser.uid || typeof currentUser.getIdToken !== 'function') {
    return { ok: false, headers: {}, errorFa: 'برای همگام‌سازی گزارش در حساب کاربری وارد شوید.' };
  }
  try {
    const token = await currentUser.getIdToken();
    if (!token) return { ok: false, headers: {}, errorFa: 'توکن احراز هویت دریافت نشد.' };
    return { ok: true, headers: { Authorization: `Bearer ${token}` } };
  } catch {
    return { ok: false, headers: {}, errorFa: 'خطا در احراز هویت کاربر.' };
  }
}

/** Stage 93.2: Account-linked valuation report API methods */
export async function getMyValuationReports(
  currentUser: User | null | undefined,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; items: SavedValuationReport[]; errorFa?: string }> {
  const auth = await getValuationAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, items: [], errorFa: auth.errorFa };
  try {
    const res = await fetch('/api/account/valuations', { headers: { Accept: 'application/json', ...auth.headers }, signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, items: [], errorFa: body?.message || 'خطا در دریافت گزارش‌ها' };
    return { ok: true, status: res.status, items: validateAndMigrateSavedValuationReports(body.items) };
  } catch {
    return { ok: false, status: 503, items: [], errorFa: 'عدم ارتباط با سرور گزارش‌های ارزش‌گذاری' };
  }
}

export async function saveValuationReport(
  report: SavedValuationReport,
  currentUser: User | null | undefined,
): Promise<{ ok: boolean; status: number; item?: SavedValuationReport; errorFa?: string }> {
  const auth = await getValuationAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  try {
    const res = await fetch('/api/account/valuations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify(report),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.item) return { ok: false, status: res.status, errorFa: body?.message || 'خطا در ذخیره گزارش در حساب' };
    const validated = validateAndMigrateSavedValuationReports([body.item]);
    return { ok: true, status: res.status, item: validated[0] || body.item };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در ارتباط با سرور' };
  }
}

export async function getValuationReport(
  reportId: string,
  currentUser: User | null | undefined,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; item?: SavedValuationReport; errorFa?: string }> {
  const auth = await getValuationAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  try {
    const res = await fetch(`/api/account/valuations/${encodeURIComponent(reportId)}`, {
      headers: { Accept: 'application/json', ...auth.headers },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.item) return { ok: false, status: res.status, errorFa: body?.message || 'گزارش یافت نشد' };
    const validated = validateAndMigrateSavedValuationReports([body.item]);
    return { ok: true, status: res.status, item: validated[0] };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در ارتباط با سرور' };
  }
}

export async function deleteValuationReport(
  reportId: string,
  currentUser: User | null | undefined,
): Promise<{ ok: boolean; status: number; errorFa?: string }> {
  const auth = await getValuationAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  try {
    const res = await fetch(`/api/account/valuations/${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
      headers: { ...auth.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: body?.message || 'حذف گزارش در سرور انجام نشد' };
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 503, errorFa: 'ارتباط با سرور جهت حذف گزارش برقرار نشد' };
  }
}

/** Stage 92.6, 94.6 & 95.6: Complete, purpose-aware, city-aware valuation copy formatter */
export function buildValuationSummaryCopyText(params: {
  input: ValuationWorkspaceInput;
  result: ValuationWorkspaceResult;
  hoodName: string;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
  isHypotheticalScenario?: boolean;
}): string {
  const { input, result, hoodName, areaUnit = 'sqm', intlCurrency = 'IRT', isHypotheticalScenario } = params;
  const h = result.hedonic;
  if (!h) return '';

  const cityConfig = MULTI_CITY_CONFIGS[result.geographicScope.cityId] || MULTI_CITY_CONFIGS.tehran;
  const unitLabel = formatAreaUnitLabel(areaUnit);
  const perUnit = convertPricePerSqmToUnit(h.hedonicPerSqm, areaUnit);
  const purposeLabel = VALUATION_PURPOSE_LABELS_FA[input.purpose];
  const scenarioPrefix = isHypotheticalScenario || input.isHypotheticalScenario ? ' [سناریوی فرضی What-If — غیرواقعی]' : '';

  const primaryLine =
    input.purpose === 'rent' && result.purposeResult?.kind === 'rent'
      ? `رهن کامل برآوردی (محدود به شاخص محله): ${toPersianNum(result.purposeResult.estimatedFullRahnMillion)} میلیون تومان (${result.purposeResult.methodologyLimitationFa})`
      : input.purpose === 'current_value' && result.purposeResult?.kind === 'current_value'
        ? `ارزش جاری فروش دارایی (تاریخ مرجع ${result.purposeResult.referenceDateIso.slice(0, 10)}): ${toPersianNum(h.hedonicTotalBillion)} میلیارد تومان (هر ${unitLabel}: ${toPersianNum(perUnit)} میلیون تومان)`
        : `برآورد ارزش فروش (غیررسمی): ${toPersianNum(h.hedonicTotalBillion)} میلیارد تومان (هر ${unitLabel}: ${toPersianNum(perUnit)} میلیون تومان) · فروش فوری نقدی (-۱۲٪): ${toPersianNum((h.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد`;

  const originsSummary = `متراژ: ${INPUT_ORIGIN_LABELS_FA[input.inputOrigins.sqm]} · ساخت: ${INPUT_ORIGIN_LABELS_FA[input.inputOrigins.buildYear]} · طبقه: ${INPUT_ORIGIN_LABELS_FA[input.inputOrigins.floor]}`;

  return [
    `گزارش ارزش‌گذاری ساختاریافته ملک${scenarioPrefix} — شهر ${cityConfig.nameFa} · محله ${hoodName}`,
    `هدف ارزش‌گذاری: ${purposeLabel} · واحد مساحت: ${unitLabel} · ارز مرجع: تومان (${intlCurrency})`,
    `مشخصات ورودی: ${toPersianNum(h.sqm)} مترمربع · ساخت ${toPersianNum(h.buildYear)} · طبقه ${toPersianNum(input.floor)} از ${toPersianNum(input.totalFloors)}`,
    `منشأ ورودی‌ها: ${originsSummary}`,
    primaryLine,
    `بازه حساسیت پارامتری مدل (±${toPersianNum(result.uncertainty.bandPercent)}٪): ${toPersianNum((h.sensitivityRangeMillion.min / 1000).toFixed(2))} تا ${toPersianNum((h.sensitivityRangeMillion.max / 1000).toFixed(2))} میلیارد تومان`,
    `شواهد مبنا: ${toPersianNum(result.sufficiency.usableListingsCount)} آگهی قابل استناد · معاملات رسمی تأییدشده در منبع داده: ${toPersianNum(result.sufficiency.verifiedTransactionCount)} مورد`,
    `نسخه مدل: ${result.modelVersion} · نسخه داده: ${result.snapshot.datasetVersion} · شناسه Snapshot: ${result.snapshot.snapshotId}`,
    `زمان محاسبه: ${result.snapshot.calculatedAtIso} · تاریخ داده مرجع: ${result.snapshot.dataAsOfIso}`,
    `محدودیت مدل: ${result.validation.labelFa} — ${result.validation.explanationFa}`,
  ].join('\n');
}

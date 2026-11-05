import type { BuyerAlertLeadItem, CityId, FeatureFlags, Neighborhood } from '../types/models'; import { MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { resolveCanonicalCityForHoodId } from './marketDataIntegrity'; import { normalizeMultiScriptDigits, parseMultiScriptNumericInput } from './multiScriptNumericAndUnits'; import { runLocalLegalRuleEngine, type ContractCheckResponse } from './serverLegalRuleEngine'; import { sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type DataCorrectionLifecycleStatus = 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'needs_more_information' | 'resolved';
export type CorrectableNeighborhoodField = 'buyPerSqm' | 'rahn80m' | 'air' | 'powerWater' | 'internet' | 'metro' | 'security' | 'flatTerrain' | 'pros_cons';
export interface DataCorrectionReportItem { id: string; cityId: CityId; hoodId: number; hoodName: string; field: CorrectableNeighborhoodField; fieldLabelFa: string; currentDisplayedValue: number | string; proposedValue: number | string; reasonFa: string; evidenceNoteFa?: string; submittedByUid: string; submittedByEmail?: string; createdAtIso: string; status: DataCorrectionLifecycleStatus; reviewedByAdminEmail?: string; reviewedAtIso?: string; reviewNoteFa?: string; } export const CORRECTABLE_FIELD_METADATA: Record<
  CorrectableNeighborhoodField, { labelFa: string; min?: number; max?: number; isNumeric: boolean; unitFa: string }
> = { buyPerSqm: { labelFa: 'میانگین قیمت خرید هر متر مربع', min: 10, max: 1500, isNumeric: true, unitFa: 'میلیون تومان' }, rahn80m: { labelFa: 'میانگین رهن کامل ۸۰ متری', min: 50, max: 25000, isNumeric: true, unitFa: 'میلیون تومان' }, air: { labelFa: 'امتیاز کیفیت هوا', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' }, powerWater: { labelFa: 'امتیاز پایداری آب و برق', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' },
  internet: { labelFa: 'امتیاز اینترنت و فیبر نوری', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' }, metro: { labelFa: 'امتیاز دسترسی مترو و حمل‌ونقل', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' },
  security: { labelFa: 'امتیاز امنیت شبانه', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' }, flatTerrain: { labelFa: 'امتیاز همواری معابر', min: 1, max: 10, isNumeric: true, unitFa: 'از ۱۰' }, pros_cons: { labelFa: 'توضیحات مزایا و معایب محله', isNumeric: false, unitFa: 'متن' }, };
export function validateDataCorrectionSubmission(
  params: { cityId: CityId; hoodId: number; hoodName: string; field: CorrectableNeighborhoodField; currentDisplayedValue: number | string; rawProposedValue: string | number; reasonFa: string; evidenceNoteFa?: string },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): { valid: boolean; normalizedProposedValue: number | string; errorMessageFa?: string; displayAreaUnitLabel?: string; proposedValueIntlText?: string } {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  if (typeof params.cityId !== 'string' || !(params.cityId in MULTI_CITY_CONFIGS) || !Number.isInteger(params.hoodId) || params.hoodId < 1 || params.hoodId > 999) {
    return { valid: false, normalizedProposedValue: '', errorMessageFa: 'محله انتخابی برای اصلاح داده معتبر نیست.', displayAreaUnitLabel };
  }
  const meta = CORRECTABLE_FIELD_METADATA[params.field]; if (!meta) { return { valid: false, normalizedProposedValue: '', errorMessageFa: 'فیلد انتخابی برای اصلاح معتبر نیست.', displayAreaUnitLabel }; }
  const cleanReason = sanitizeInput(params.reasonFa || '', 300).trim(); if (cleanReason.length < 5) { return { valid: false, normalizedProposedValue: '', errorMessageFa: 'لطفاً دلیل یا توضیح پیشنهاد اصلاح داده را حداقل در ۵ کاراکتر بنویسید.', displayAreaUnitLabel }; }
  if (meta.isNumeric) {
    const parsed = parseMultiScriptNumericInput(String(params.rawProposedValue));
    if (parsed.status !== 'valid' || parsed.value === null) {
      return { valid: false, normalizedProposedValue: 0, errorMessageFa: `مقدار پیشنهادی برای «${meta.labelFa}» باید یک عدد معتبر باشد.`, displayAreaUnitLabel };
    }
    const proposedValueIntlText = formatMillionTomanAsIntlCurrency(parsed.value, intlCurrency);
    if ((meta.min !== undefined && parsed.value < meta.min) || (meta.max !== undefined && parsed.value > meta.max)) {
      return { valid: false, normalizedProposedValue: parsed.value, errorMessageFa: `مقدار پیشنهادی برای «${meta.labelFa}» باید بین ${meta.min} تا ${meta.max} (${meta.unitFa}) باشد.`, displayAreaUnitLabel, proposedValueIntlText };
    }
    if (Number(params.currentDisplayedValue) === parsed.value) {
      return { valid: false, normalizedProposedValue: parsed.value, errorMessageFa: 'مقدار پیشنهادی با مقدار فعلی ثبت‌شده در سامانه تفاوتی ندارد.', displayAreaUnitLabel, proposedValueIntlText };
    }
    return { valid: true, normalizedProposedValue: parsed.value, displayAreaUnitLabel, proposedValueIntlText };
  }
  const textVal = sanitizeInput(String(params.rawProposedValue || ''), 280).trim();
  if (textVal.length < 5) {
    return { valid: false, normalizedProposedValue: textVal, errorMessageFa: 'متن پیشنهادی باید حداقل ۵ کاراکتر باشد.', displayAreaUnitLabel };
  }
  return { valid: true, normalizedProposedValue: textVal, displayAreaUnitLabel };
}
export function getCityContextualBranding(cityId: CityId = 'tehran'): {
  cityId: CityId;
  cityNameFa: string;
  radarTitleFa: string;
  shortBrandFa: string;
} {
  const cityNameFa = MULTI_CITY_CONFIGS[cityId]?.nameFa || 'تهران';
  return {
    cityId,
    cityNameFa,
    radarTitleFa: `رادار هوشمند مسکن ${cityNameFa}`,
    shortBrandFa: `رادار ${cityNameFa}`,
  };
}
export interface CityScopedFavoriteRef {
  cityId: CityId;
  neighborhoodId: number;
}
export function formatCityScopedFavoriteKey(cityId: CityId, neighborhoodId: number): string {
  return `${cityId}:${neighborhoodId}`;
}
export function parseCityScopedFavoriteKey(raw: unknown): CityScopedFavoriteRef | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 999) {
    return { cityId: resolveCanonicalCityForHoodId(raw) || 'tehran', neighborhoodId: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const id = Number(trimmed);
      return { cityId: resolveCanonicalCityForHoodId(id) || 'tehran', neighborhoodId: id };
    }
    const [c, idStr] = trimmed.split(':');
    const id = Number(idStr);
    if (c && c in MULTI_CITY_CONFIGS && Number.isInteger(id) && id >= 1 && id <= 999) {
      return { cityId: c as CityId, neighborhoodId: id };
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { cityId?: string; neighborhoodId?: number; hoodId?: number };
    const id = Number(obj.neighborhoodId ?? obj.hoodId);
    if (Number.isInteger(id) && id >= 1 && id <= 999) {
      const cityId =
        typeof obj.cityId === 'string' && obj.cityId in MULTI_CITY_CONFIGS
          ? (obj.cityId as CityId)
          : resolveCanonicalCityForHoodId(id) || 'tehran';
      return { cityId, neighborhoodId: id };
    }
  }
  return null;
}
export function validateContractAnalysisResult(raw: unknown): ContractCheckResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const riskScore = Number(r.riskScore);
  const riskLevel = r.riskLevel;
  const isValidRiskLevel =
    riskLevel === 'امن' || riskLevel === 'نیازمند احتیاط' || riskLevel === 'خطرناک و پرریسک';
  if (
    !Number.isFinite(riskScore) ||
    riskScore < 0 ||
    riskScore > 100 ||
    !isValidRiskLevel ||
    !Array.isArray(r.detectedTraps) ||
    typeof r.legalAdvice !== 'string' ||
    !r.legalAdvice.trim() ||
    typeof r.safeRewrite !== 'string' ||
    !r.safeRewrite.trim()
  ) {
    return null;
  }
  const detectedTraps = r.detectedTraps.slice(0, 25).map((t) => sanitizeInput(String(t || ''), 300).trim()).filter(Boolean);
  const legalAdvice = sanitizeInput(r.legalAdvice, 2000).trim();
  const safeRewrite = sanitizeInput(r.safeRewrite, 2000).trim();
  if (!legalAdvice || !safeRewrite) return null;
  const analysisSource =
    r.analysisSource === 'GEMINI_AI' || r.analysisSource === 'RULE_ENGINE' || r.analysisSource === 'CACHED_ANALYSIS'
      ? r.analysisSource
      : 'RULE_ENGINE';
  return {
    status: 'ok',
    source: analysisSource === 'GEMINI_AI' ? 'GEMINI_AI' : 'RULE_ENGINE',
    riskScore: Math.round(riskScore),
    riskLevel,
    summary: legalAdvice,
    traps: detectedTraps,
    detectedTraps,
    penaltiesWarning: typeof r.penaltiesWarning === 'string' ? sanitizeInput(r.penaltiesWarning, 500) : '',
    missingGuarantees: Array.isArray(r.missingGuarantees) ? r.missingGuarantees.slice(0, 20).map((g) => sanitizeInput(String(g || ''), 200)) : [],
    legalAdvice,
    safeRewrite,
    analysisSource,
    fallbackReason: typeof r.fallbackReason === 'string' ? sanitizeInput(r.fallbackReason, 300) : null,
  };
}
export function buildLocalRuleEngineContractFallback(
  clauseText: string,
  contractType: 'buy' | 'rent',
  fallbackReasonFa = 'سرویس تحلیل ابری در دسترس نبود؛ بررسی با موتور قواعد حقوقی محلی انجام شد.'
): ContractCheckResponse {
  const contractTypeLabel = contractType === 'buy' ? 'مبایعه‌نامه خرید' : 'اجاره‌نامه';
  const localResult = runLocalLegalRuleEngine(clauseText, contractTypeLabel);
  return {
    ...localResult,
    analysisSource: 'RULE_ENGINE',
    fallbackReason: fallbackReasonFa,
  };
}
export function calculateAntiFraudChecklistCompletion(
  checkedIds: readonly string[],
  totalChecklistCount: number
): {
  checkedCount: number;
  totalCount: number;
  completionPercent: number;
  labelFa: 'درصد تکمیل چک‌لیست بررسی';
  statusDescriptionFa: string;
} {
  const safeTotal = Math.max(1, Number(totalChecklistCount) || 10);
  const uniqueChecked = new Set(checkedIds.filter(Boolean)).size;
  const completionPercent = Math.min(100, Math.round((uniqueChecked / safeTotal) * 100));
  let statusDescriptionFa = 'هنوز هیچ موردی از چک‌لیست بررسی مدارک را علامت نزده‌اید.';
  if (completionPercent === 100) {
    statusDescriptionFa = 'تمامی موارد چک‌لیست بررسی مدارک توسط شما کنترل شد.';
  } else if (completionPercent >= 50) {
    statusDescriptionFa = `${uniqueChecked} مورد از ${safeTotal} بند چک‌لیست بررسی شده است؛ موارد باقی‌مانده را پیش از امضا کنترل کنید.`;
  } else if (uniqueChecked > 0) {
    statusDescriptionFa = `تنها ${uniqueChecked} مورد از ${safeTotal} بند بررسی شده است؛ پیش از پرداخت وجه سایر مدارک را احراز کنید.`;
  }
  return {
    checkedCount: uniqueChecked,
    totalCount: safeTotal,
    completionPercent,
    labelFa: 'درصد تکمیل چک‌لیست بررسی',
    statusDescriptionFa,
  };
}
export function maskBuyerPhoneForAdminDisplay(phone: string, revealed = false): string {
  const clean = String(phone || '').trim();
  if (!clean) return '—';
  if (revealed || clean.includes('*')) return clean;
  if (clean.length >= 10) {
    return `${clean.slice(0, 4)}***${clean.slice(-4)}`;
  }
  return clean;
}
export function filterAdminBuyerLeads(
  leads: readonly BuyerAlertLeadItem[],
  filters: {
    searchQuery?: string;
    dealType?: 'all' | 'خرید' | 'اجاره';
    hoodId?: number | 'all';
    cityId?: CityId | 'all';
  }
): BuyerAlertLeadItem[] {
  const q = normalizeMultiScriptDigits(filters.searchQuery || '').trim().toLowerCase();
  return leads.filter((lead) => {
    if (filters.dealType && filters.dealType !== 'all' && lead.dealType !== filters.dealType) {
      return false;
    }
    if (filters.hoodId && filters.hoodId !== 'all' && Number(lead.hoodId) !== Number(filters.hoodId)) {
      return false;
    }
    if (filters.cityId && filters.cityId !== 'all') {
      const leadCity = resolveCanonicalCityForHoodId(Number(lead.hoodId)) || 'tehran';
      if (leadCity !== filters.cityId) return false;
    }
    if (!q) return true;
    const hay = normalizeMultiScriptDigits(
      `${lead.fullName} ${lead.phone} ${lead.hoodName} ${lead.maxBudgetText}`
    ).toLowerCase();
    return hay.includes(q);
  });
}
export type FeatureFlagMutationStatus = 'idle' | 'updating' | 'saved' | 'failed' | 'conflict';
export interface VerifiableAdminBackupManifest {
  schemaVersion: 2;
  source: 'client_admin_workspace' | 'server_authoritative_snapshot';
  exportAuthority: string;
  timestampIso: string;
  recordCounts: {
    neighborhoods: number;
    sponsorRequests: number;
    buyerLeads: number;
    favoriteHoodIds: number;
    featureFlagsCount: number;
  };
  excludedData: string[];
  checksumHex: string;
}
export function computeDeterministicBackupChecksumHex(payloadJson: string): string {
  let h1 = 0xdeadbeef ^ payloadJson.length;
  let h2 = 0x41c6ce57 ^ payloadJson.length;
  for (let i = 0; i < payloadJson.length; i++) {
    const ch = payloadJson.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
export function buildVerifiableAdminBackupEnvelope(params: {
  neighborhoods: readonly Neighborhood[];
  sponsorRequests: readonly unknown[];
  buyerLeads: readonly unknown[];
  favoriteHoodIds: readonly number[];
  featureFlags: FeatureFlags;
  adminEmail?: string | null;
}): {
  manifest: VerifiableAdminBackupManifest;
  serializedJson: string;
} {
  const coreData = {
    neighborhoods: params.neighborhoods,
    sponsorRequests: params.sponsorRequests,
    buyerLeads: params.buyerLeads,
    favoriteHoodIds: params.favoriteHoodIds,
    featureFlags: params.featureFlags,
  };
  const safeReplacer = (k: string, v: unknown) =>
    /^(?:__proto__|constructor|prototype)$/i.test(k) || /secret|private_?key|bot_token|gemini_api_key|password|authorization|cookie/i.test(k) ? undefined : v;
  const coreJson = JSON.stringify(coreData, safeReplacer);
  const checksumHex = computeDeterministicBackupChecksumHex(coreJson);
  const manifest: VerifiableAdminBackupManifest = {
    schemaVersion: 2,
    source: 'client_admin_workspace',
    exportAuthority: sanitizeInput(params.adminEmail || '', 120).trim() || 'authorized_admin',
    timestampIso: new Date().toISOString(),
    recordCounts: {
      neighborhoods: params.neighborhoods.length,
      sponsorRequests: params.sponsorRequests.length,
      buyerLeads: params.buyerLeads.length,
      favoriteHoodIds: params.favoriteHoodIds.length,
      featureFlagsCount: Object.keys(params.featureFlags || {}).length,
    },
    excludedData: [
      'کلیدهای محرمانه سرور (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, S3_SECRET_ACCESS_KEY)',
      'توکن‌های احراز هویت کاربران (Firebase ID Tokens)',
      'فایل‌های باینری رسانه‌ای داخل Object Storage',
    ],
    checksumHex,
  };
  const fullEnvelope = { version: '2.0', exportedAtIso: manifest.timestampIso, manifest, ...coreData };
  return { manifest, serializedJson: JSON.stringify(fullEnvelope, safeReplacer, 2) };
}
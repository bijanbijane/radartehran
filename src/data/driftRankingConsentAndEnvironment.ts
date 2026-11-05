/**
 * @file src/data/driftRankingConsentAndEnvironment.ts
 * @description PROMPTS 151, 152, 153 & 154: * ۱. پایش انحراف مدل قیمت‌گذاری (Model Drift) و تفکیک تورم بازار از خطای مدل (PROMPT 151)
 * ۲. رتبه‌بندی قطعی و توضیح‌پذیر پیشنهاد ملک و محلات با شکستن تساوی پایدار (PROMPT 152)
 * ۳. مدیریت رضایت کاربر (Consent) و کمینه‌سازی داده مکانی و حریم خصوصی (PROMPT 153)
 * ۴. اعتبارسنجی زمانی-مکانی داده‌های هواشناسی، کیفیت هوا (AQI) و تخمین ترافیک (PROMPT 154)
 */

import type { Neighborhood } from './neighborhoods';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';

// ============================================================================
// PROMPT 151: PRICING MODEL DRIFT, DATASET DRIFT & CONTINUOUS MODEL MONITORING
// ============================================================================

export type DriftSignalClassification = | 'STABLE_NO_DRIFT'
  | 'MARKET_LEVEL_SHIFT_NOT_MODEL_FAILURE'
  | 'INPUT_DISTRIBUTION_DATA_DRIFT'
  | 'PROVIDER_DATA_QUALITY_DEGRADATION'
  | 'MODEL_RESIDUAL_PERFORMANCE_DRIFT';

export interface ModelDriftEvaluationInput { modelVersion: string; baselineMedianPricePerSqm: number; currentMedianPricePerSqm: number; baselineMeanAreaSqm: number; currentMeanAreaSqm: number; missingAttributeRate: number; verifiedReferenceResidualsPercent?: number[];
}

export interface ModelDriftEvaluationReport { modelVersion: string; classification: DriftSignalClassification; priceShiftPercent: number; areaDistributionShiftPercent: number; meanAbsoluteResidualPercent: number | null; automaticRecalibrationTriggered: false; recommendedAction: string;
}

export function evaluatePricingModelAndDatasetDrift( input: ModelDriftEvaluationInput, ): ModelDriftEvaluationReport { const priceShiftPercent = Number(
    (((input.currentMedianPricePerSqm - input.baselineMedianPricePerSqm) / Math.max(1, input.baselineMedianPricePerSqm)) * 100).toFixed(2), ); const areaDistributionShiftPercent = Number( (((input.currentMeanAreaSqm - input.baselineMeanAreaSqm) / Math.max(1, input.baselineMeanAreaSqm)) * 100).toFixed(2),
  );
  const residuals = input.verifiedReferenceResidualsPercent ?? []; const meanAbsoluteResidualPercent =
    residuals.length > 0
      ? Number((residuals.reduce((acc, r) => acc + Math.abs(r), 0) / residuals.length).toFixed(2))
      : null;

  if (input.missingAttributeRate > 0.15) {
    return {
      modelVersion: input.modelVersion, classification: 'PROVIDER_DATA_QUALITY_DEGRADATION', priceShiftPercent,
      areaDistributionShiftPercent, meanAbsoluteResidualPercent, automaticRecalibrationTriggered: false,
      recommendedAction: 'بررسی خط لوله دریافت داده؛ نرخ فیلدهای مفقود بیش از ۱۵٪ است.',
    };
  }
  if (meanAbsoluteResidualPercent !== null && meanAbsoluteResidualPercent > 12) {
    return {
      modelVersion: input.modelVersion, classification: 'MODEL_RESIDUAL_PERFORMANCE_DRIFT', priceShiftPercent,
      areaDistributionShiftPercent, meanAbsoluteResidualPercent, automaticRecalibrationTriggered: false,
      recommendedAction: 'خطای باقیمانده نسبت به مشاهدات مرجع تاییدشده افزایش یافته است؛ بازبینی انسانی ضرایب هدونیک توصیه می‌شود.',
    };
  }
  if (Math.abs(areaDistributionShiftPercent) > 25) {
    return {
      modelVersion: input.modelVersion, classification: 'INPUT_DISTRIBUTION_DATA_DRIFT', priceShiftPercent,
      areaDistributionShiftPercent, meanAbsoluteResidualPercent, automaticRecalibrationTriggered: false,
      recommendedAction: 'توزیع متراژ ورودی‌ها تغییر معناداری کرده است (Data Drift).',
    };
  }
  if (Math.abs(priceShiftPercent) > 15 && (meanAbsoluteResidualPercent === null || meanAbsoluteResidualPercent <= 12)) {
    return {
      modelVersion: input.modelVersion, classification: 'MARKET_LEVEL_SHIFT_NOT_MODEL_FAILURE', priceShiftPercent,
      areaDistributionShiftPercent, meanAbsoluteResidualPercent, automaticRecalibrationTriggered: false,
      recommendedAction: 'تغییر سطح عمومی قیمت‌های بازار ناشی از تورم کلان است و به معنای خرابی ضرایب نسبی مدل هدونیک نیست.',
    };
  }
  return {
    modelVersion: input.modelVersion, classification: 'STABLE_NO_DRIFT', priceShiftPercent,
    areaDistributionShiftPercent, meanAbsoluteResidualPercent, automaticRecalibrationTriggered: false,
    recommendedAction: 'مدل در وضعیت پایدار قرار دارد.',
  };
}

// ============================================================================
// PROMPT 152: PROPERTY RECOMMENDATION, RANKING & PERSONALIZED RESULT INTEGRITY
// ============================================================================

export const RANKING_WEIGHTS_VERSION = '2026.10.v1' as const;

export interface NeighborhoodRecommendationPreferences {
  cityKey: string;
  maxBudgetPerSqmMillion: number;
  prioritizeMetro: boolean;
  prioritizeAirQuality: boolean;
}

export interface RankedNeighborhoodRecommendation {
  hoodId: number;
  hoodName: string;
  totalScore: number;
  affordabilityScore: number;
  qualityScore: number;
  explanationFa: string;
  displayAreaUnitLabel?: string;
  unitPriceIntlText?: string;
  isObjectiveInvestmentAdvice: false;
}

export function rankNeighborhoodRecommendationsDeterministically(
  candidates: Array<Neighborhood & { cityKey?: string }>,
  prefs: NeighborhoodRecommendationPreferences,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode },
): RankedNeighborhoodRecommendation[] {
  const activeUnit = options?.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const displayAreaUnitLabel = formatAreaUnitLabel(activeUnit);
  const seenIds = new Set<number>();
  const eligible = candidates.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    if (c.cityKey && c.cityKey !== prefs.cityKey) return false;
    return c.buyPerSqm <= prefs.maxBudgetPerSqmMillion * 1.15;
  });

  return eligible
    .map((c) => {
      const budgetRatio = c.buyPerSqm / Math.max(10, prefs.maxBudgetPerSqmMillion);
      const affordabilityScore = Math.max(0, Math.min(100, Math.round((1.2 - budgetRatio) * 100)));
      const metroWeight = prefs.prioritizeMetro ? 2.5 : 1.0;
      const airWeight = prefs.prioritizeAirQuality ? 2.5 : 1.0;
      const qualityRaw =
        (c.metro * metroWeight + c.air * airWeight + c.security * 1.5 + c.internet * 1.0) /
        (metroWeight + airWeight + 2.5);
      const qualityScore = Math.round(qualityRaw * 10);
      const totalScore = Math.round(affordabilityScore * 0.55 + qualityScore * 0.45);
      const unitPrice = convertPricePerSqmToUnit(c.buyPerSqm, activeUnit);
      return {
        hoodId: c.id,
        hoodName: c.name,
        totalScore,
        affordabilityScore,
        qualityScore,
        explanationFa: `تناسب بودجه (${affordabilityScore} از ۱۰۰) + شاخص کیفیت محیطی و دسترسی (${qualityScore} از ۱۰۰)`,
        displayAreaUnitLabel,
        unitPriceIntlText: formatMillionTomanAsIntlCurrency(unitPrice, activeCurrency),
        isObjectiveInvestmentAdvice: false as const,
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
      return a.hoodId - b.hoodId; // Deterministic tie-breaker
    });
}

// ============================================================================
// PROMPT 153: USER CONSENT, PERMISSIONS & PRIVACY PREFERENCE ENFORCEMENT
// ============================================================================

export type ConsentCategory =
  | 'GEOLOCATION_FOREGROUND_LOOKUP'
  | 'BROWSER_PRICE_ALERT_NOTIFICATIONS'
  | 'EXTERNAL_AI_ANALYSIS'
  | 'OPTIONAL_DIAGNOSTIC_TELEMETRY';

export interface UserPrivacyConsentState {
  policyVersion: string;
  updatedAtIso: string;
  grants: Record<ConsentCategory, boolean>;
}

export class UserConsentAndPrivacyEnforcer {
  private readonly states = new Map<string, UserPrivacyConsentState>();
  private static readonly MAX_STATES = 2000;
  public readonly currentPolicyVersion = '2026.10.privacy.v1';

  getConsentState(userId: string): UserPrivacyConsentState {
    const existing = this.states.get(userId);
    if (existing) return { ...existing, grants: { ...existing.grants } };
    return {
      policyVersion: this.currentPolicyVersion,
      updatedAtIso: new Date(0).toISOString(),
      grants: {
        GEOLOCATION_FOREGROUND_LOOKUP: false,
        BROWSER_PRICE_ALERT_NOTIFICATIONS: false,
        EXTERNAL_AI_ANALYSIS: false,
        OPTIONAL_DIAGNOSTIC_TELEMETRY: false,
      },
    };
  }

  updateCategoryConsent(
    userId: string,
    category: ConsentCategory,
    granted: boolean,
    nowIso = new Date().toISOString(),
  ): UserPrivacyConsentState {
    const current = this.getConsentState(userId);
    if (Object.prototype.hasOwnProperty.call(current.grants, category)) {
      current.grants[category] = Boolean(granted);
    }
    current.policyVersion = this.currentPolicyVersion;
    current.updatedAtIso = nowIso;
    if (!this.states.has(userId) && this.states.size >= UserConsentAndPrivacyEnforcer.MAX_STATES) {
      const oldest = this.states.keys().next().value;
      if (oldest !== undefined) this.states.delete(oldest);
    }
    this.states.set(userId, current);
    return { ...current, grants: { ...current.grants } };
  }

  canExecuteOperation(userId: string, requiredCategory: ConsentCategory): {
    allowed: boolean;
    allowBackgroundLocationStorage: false;
    reason: string;
  } {
    const state = this.getConsentState(userId);
    const allowed = Object.prototype.hasOwnProperty.call(state.grants, requiredCategory) && state.grants[requiredCategory] === true;
    return {
      allowed,
      allowBackgroundLocationStorage: false,
      reason: allowed ? 'CONSENT_GRANTED_FOR_SPECIFIC_PURPOSE' : `CONSENT_NOT_GRANTED:${requiredCategory}`,
    };
  }
}

// ============================================================================
// PROMPT 154: ENVIRONMENTAL INDICATORS, TRAFFIC ESTIMATION & SPATIAL-TEMPORAL ACCURACY
// ============================================================================

export interface EnvironmentalAndTrafficSnapshot {
  hoodId: number;
  weather: {
    temperatureCelsius: number | null;
    observedAtIso: string;
    isStale: boolean;
    sourceType: 'LIVE_OPEN_METEO_OBSERVATION' | 'UNAVAILABLE';
  };
  airQuality: {
    usAqi: number | null;
    observedAtIso: string;
    stationDistanceKm: number;
    spatialValidity: 'LOCAL_REPRESENTATIVE' | 'REGIONAL_APPROXIMATION' | 'OUT_OF_RANGE_UNAVAILABLE';
  };
  traffic: {
    severity: 'smooth' | 'semi' | 'heavy';
    provenance: 'ALGORITHMIC_TIME_OF_DAY_MODEL_NOT_LIVE_SENSOR';
    causalWeatherClaimSuppressed: true;
    disclosureFa: string;
  };
}

export function buildVerifiedEnvironmentalAndTrafficSnapshot(params: {
  hoodId: number;
  temperatureCelsius: number | null;
  weatherObservedAtIso: string;
  usAqi: number | null;
  aqiObservedAtIso: string;
  stationDistanceKm: number;
  trafficSeverity: 'smooth' | 'semi' | 'heavy';
  nowMs?: number;
}): EnvironmentalAndTrafficSnapshot {
  const nowMs = params.nowMs ?? Date.now();
  const weatherObsMs = Date.parse(params.weatherObservedAtIso);
  const isWeatherStale = !Number.isFinite(weatherObsMs) || nowMs - weatherObsMs > 3 * 3600_000 || weatherObsMs > nowMs + 3600_000;
  const validDist = Number.isFinite(params.stationDistanceKm) && params.stationDistanceKm >= 0;
  const validAqi = params.usAqi !== null && Number.isFinite(params.usAqi) && params.usAqi >= 0 && params.usAqi <= 500;
  const spatialValidity: EnvironmentalAndTrafficSnapshot['airQuality']['spatialValidity'] =
    !validAqi || !validDist || params.stationDistanceKm > 25
      ? 'OUT_OF_RANGE_UNAVAILABLE'
      : params.stationDistanceKm <= 6
        ? 'LOCAL_REPRESENTATIVE'
        : 'REGIONAL_APPROXIMATION';
  const validTemp = params.temperatureCelsius !== null && Number.isFinite(params.temperatureCelsius) ? params.temperatureCelsius : null;
  return {
    hoodId: params.hoodId,
    weather: {
      temperatureCelsius: validTemp,
      observedAtIso: params.weatherObservedAtIso,
      isStale: isWeatherStale,
      sourceType: validTemp !== null ? 'LIVE_OPEN_METEO_OBSERVATION' : 'UNAVAILABLE',
    },
    airQuality: {
      usAqi: spatialValidity === 'OUT_OF_RANGE_UNAVAILABLE' ? null : params.usAqi,
      observedAtIso: params.aqiObservedAtIso,
      stationDistanceKm: validDist ? params.stationDistanceKm : -1,
      spatialValidity,
    },
    traffic: {
      severity: params.trafficSeverity,
      provenance: 'ALGORITHMIC_TIME_OF_DAY_MODEL_NOT_LIVE_SENSOR',
      causalWeatherClaimSuppressed: true,
      disclosureFa:
        'وضعیت ترافیک بر اساس الگوی الگوریتمی ساعات اوج محله برآورد شده و داده سنسور لحظه‌ای پلیس راهور نیست.',
    },
  };
}
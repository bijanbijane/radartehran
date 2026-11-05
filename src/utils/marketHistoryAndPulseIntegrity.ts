import type { Neighborhood } from '../types/models';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type MarketSeriesProvenanceType = 'verified_historical_series' | 'modeled_trend_series' | 'insufficient_historical_data'; export interface MarketHistoryPoint { monthKey: string; monthLabelFa: string; buyPricePerSqmMillions: number | null; rentMonthlyMillions: number | null; provenance: MarketSeriesProvenanceType; sampleCount: number; }
export interface MarketHistorySeriesEnvelope { neighborhoodId: number; neighborhoodName: string; provenance: MarketSeriesProvenanceType; provenanceBadgeFa: string; provenanceDescriptionFa: string; referenceJalaliYear: number; referenceJalaliMonth: number; points: MarketHistoryPoint[]; }
export const JALALI_MONTH_NAMES_FA: readonly string[] = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']; const MODELED_SEASONAL_BUY_FACTORS: readonly number[] = [0.84, 0.855, 0.87, 0.89, 0.91, 0.925, 0.94, 0.955, 0.97, 0.982, 0.992, 1.0]; const MODELED_SEASONAL_RENT_FACTORS: readonly number[] = [0.83, 0.845, 0.865, 0.895, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99, 1.0]; export function getJalaliYearAndMonth(referenceDate: Date = new Date()): { jy: number; jm: number } { try { const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric' }).formatToParts(referenceDate); const jy = Number(parts.find((p) => p.type === 'year')?.value); const jm = Number(parts.find((p) => p.type === 'month')?.value); if (Number.isFinite(jy) && Number.isFinite(jm) && jm >= 1 && jm <= 12) return { jy, jm }; } catch { /* fallback */ }
  return { jy: 1405, jm: 8 }; } export function buildTrailingJalaliMonths( count: number, referenceDate: Date = new Date(), ): Array<{ monthKey: string; monthLabelFa: string; jy: number; jm: number }> { const safeCount = Math.max(1, Math.min(24, Math.trunc(count))); const { jy: endJy, jm: endJm } = getJalaliYearAndMonth(referenceDate); const result: Array<{ monthKey: string; monthLabelFa: string; jy: number; jm: number }> = []; for (let offset = safeCount - 1; offset >= 0; offset--) { const totalMonths = endJy * 12 + (endJm - 1) - offset; const jy = Math.floor(totalMonths / 12);
    const jm0 = ((totalMonths % 12) + 12) % 12; const jm = jm0 + 1; const monthName = JALALI_MONTH_NAMES_FA[jm0] || 'ماه'; result.push({ monthKey: `${jy}-${String(jm).padStart(2, '0')}`, monthLabelFa: `${monthName} ${jy}`, jy, jm });
  } return result; }
export function buildTransparent12MonthMarketSeries( hood: Pick<Neighborhood, 'id' | 'name'> & { buyPerSqm?: number; avgPrice?: number; minPrice?: number; maxPrice?: number; change6m?: number; verifiedHistory12m?: Array<{ monthKey: string; buyPriceMillions: number; rentPriceMillions?: number; sampleCount?: number }>; }, referenceDate: Date = new Date(), ): MarketHistorySeriesEnvelope { const trailingMonths = buildTrailingJalaliMonths(12, referenceDate); const { jy, jm } = getJalaliYearAndMonth(referenceDate); const verifiedList = Array.isArray(hood.verifiedHistory12m) ? hood.verifiedHistory12m : []; if (verifiedList.length >= 6) {
    const byMonth = new Map(verifiedList.map((item) => [item.monthKey, item])); const points: MarketHistoryPoint[] = trailingMonths.map((m) => { const match = byMonth.get(m.monthKey); return { monthKey: m.monthKey, monthLabelFa: m.monthLabelFa, buyPricePerSqmMillions: match && typeof match.buyPriceMillions === 'number' && Number.isFinite(match.buyPriceMillions)
            ? match.buyPriceMillions
            : null, rentMonthlyMillions: match && typeof match.rentPriceMillions === 'number' && Number.isFinite(match.rentPriceMillions)
            ? match.rentPriceMillions
            : null, provenance: 'verified_historical_series', sampleCount: match?.sampleCount ?? 0, }; }); return { neighborhoodId: hood.id, neighborhoodName: hood.name, provenance: 'verified_historical_series', provenanceBadgeFa: 'سری تاریخی تأییدشده (مشاهدات واقعی بازار)', provenanceDescriptionFa:
        'مقادیر این نمودار مستقیماً از اسنپ‌شات‌های تأییدشده بازار در ۱۲ ماه گذشته استخراج شده‌اند.', referenceJalaliYear: jy, referenceJalaliMonth: jm, points, }; }
  const baseBuy = Number(hood.avgPrice ?? hood.buyPerSqm); if (!Number.isFinite(baseBuy) || baseBuy <= 0) { return { neighborhoodId: hood.id, neighborhoodName: hood.name, provenance: 'insufficient_historical_data', provenanceBadgeFa: 'داده تاریخی کافی برای این محله ثبت نشده است', provenanceDescriptionFa:
        'به دلیل نبود قیمت پایه یا مشاهدات کافی، نمودار روند ۱۲ ماهه قابل نمایش نیست.', referenceJalaliYear: jy, referenceJalaliMonth: jm, points: [],
    }; }
  const baseRent = Math.max(2, Math.round(baseBuy * 0.275 * 10) / 10); const points: MarketHistoryPoint[] = trailingMonths.map((m, idx) => { const buyFactor = MODELED_SEASONAL_BUY_FACTORS[idx] ?? 1;
    const rentFactor = MODELED_SEASONAL_RENT_FACTORS[idx] ?? 1; return {
      monthKey: m.monthKey,
      monthLabelFa: m.monthLabelFa,
      buyPricePerSqmMillions: Math.round(baseBuy * buyFactor * 10) / 10,
      rentMonthlyMillions: Math.round(baseRent * rentFactor * 10) / 10,
      provenance: 'modeled_trend_series',
      sampleCount: 0,
    };
  });
  return {
    neighborhoodId: hood.id,
    neighborhoodName: hood.name,
    provenance: 'modeled_trend_series',
    provenanceBadgeFa: 'سری شبیه‌سازی‌شده بر اساس قیمت فعلی و الگوی فصلی',
    provenanceDescriptionFa:
      'این منحنی یک برآورد تحلیلی بر پایه قیمت فعلی محله و ضرایب فصلی بازار است و جایگزین سری معاملات ثبت‌شده رسمی نیست.',
    referenceJalaliYear: jy,
    referenceJalaliMonth: jm,
    points,
  };
}
export interface ScraperAggregationAudit {
  acceptedSamples: number[]; rejectedOutliers: number[]; rawSampleCount: number; acceptedSampleCount: number;
  medianPriceMillions: number | null; iqrLowerBound: number | null; iqrUpperBound: number | null;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient'; displayAreaUnitLabel?: string; medianPriceIntlText?: string;
}
export function filterAndAggregateScrapedSamples(
  rawSamplesMillionsPerSqm: number[],
  minPlausibleMillions = 12,
  maxPlausibleMillions = 950,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): ScraperAggregationAudit {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const domainValid = rawSamplesMillionsPerSqm.filter(
    (v) => Number.isFinite(v) && v >= minPlausibleMillions && v <= maxPlausibleMillions,
  );
  const domainRejected = rawSamplesMillionsPerSqm.filter(
    (v) => !Number.isFinite(v) || v < minPlausibleMillions || v > maxPlausibleMillions,
  );
  if (domainValid.length === 0) {
    return {
      acceptedSamples: [],
      rejectedOutliers: domainRejected,
      rawSampleCount: rawSamplesMillionsPerSqm.length,
      acceptedSampleCount: 0,
      medianPriceMillions: null,
      iqrLowerBound: null,
      iqrUpperBound: null,
      confidenceLevel: 'insufficient',
      displayAreaUnitLabel,
    };
  }
  const sorted = [...domainValid].sort((a, b) => a - b);
  if (sorted.length < 4) {
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const medianPriceMillions = Math.round(median * 10) / 10;
    return {
      acceptedSamples: sorted,
      rejectedOutliers: domainRejected,
      rawSampleCount: rawSamplesMillionsPerSqm.length,
      acceptedSampleCount: sorted.length,
      medianPriceMillions,
      iqrLowerBound: sorted[0],
      iqrUpperBound: sorted[sorted.length - 1],
      confidenceLevel: sorted.length >= 3 ? 'low' : 'insufficient',
      displayAreaUnitLabel,
      medianPriceIntlText: formatMillionTomanAsIntlCurrency(medianPriceMillions, intlCurrency),
    };
  }
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = Math.max(1, q3 - q1);
  const lowerBound = Math.max(minPlausibleMillions, q1 - 1.5 * iqr);
  const upperBound = Math.min(maxPlausibleMillions, q3 + 1.5 * iqr);
  const accepted = sorted.filter((v) => v >= lowerBound && v <= upperBound);
  const iqrRejected = sorted.filter((v) => v < lowerBound || v > upperBound);
  const finalAccepted = accepted.length > 0 ? accepted : sorted;
  const mid = Math.floor(finalAccepted.length / 2);
  const median =
    finalAccepted.length % 2 === 1
      ? finalAccepted[mid]
      : (finalAccepted[mid - 1] + finalAccepted[mid]) / 2;
  const medianPriceMillions = Math.round(median * 10) / 10;
  return {
    acceptedSamples: finalAccepted,
    rejectedOutliers: [...domainRejected, ...iqrRejected],
    rawSampleCount: rawSamplesMillionsPerSqm.length,
    acceptedSampleCount: finalAccepted.length,
    medianPriceMillions,
    iqrLowerBound: Math.round(lowerBound * 10) / 10,
    iqrUpperBound: Math.round(upperBound * 10) / 10,
    confidenceLevel:
      finalAccepted.length >= 12 ? 'high' : finalAccepted.length >= 5 ? 'medium' : 'low',
    displayAreaUnitLabel,
    medianPriceIntlText: formatMillionTomanAsIntlCurrency(medianPriceMillions, intlCurrency),
  };
}
export interface AirQualityStationObservation {
  stationId: string; stationName: string; lat: number; lng: number; aqi: number; pm25?: number; observedAtIso?: string;
}
export interface NeighborhoodStationAssignment {
  stationId: string | null; stationName: string; stationDistanceKm: number | null; stationAqi: number | null; pm25: number | null;
  coverageStatus: 'nearest_station_within_range' | 'distant_station_extrapolated' | 'no_station_coverage';
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function assignNearestAirQualityStation(
  hoodLat: number,
  hoodLng: number,
  stations: AirQualityStationObservation[],
  maxCoverageRadiusKm = 25,
): NeighborhoodStationAssignment {
  const validStations = stations.filter(
    (s) =>
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      Number.isFinite(s.aqi) &&
      s.aqi > 0 &&
      s.aqi <= 500,
  );
  if (validStations.length === 0 || !Number.isFinite(hoodLat) || !Number.isFinite(hoodLng)) {
    return {
      stationId: null,
      stationName: 'بدون ایستگاه سنجش فعال در محدوده',
      stationDistanceKm: null,
      stationAqi: null,
      pm25: null,
      coverageStatus: 'no_station_coverage',
    };
  }
  let nearest = validStations[0];
  let minDistanceKm = haversineKm(hoodLat, hoodLng, nearest.lat, nearest.lng);
  for (let i = 1; i < validStations.length; i++) {
    const candidate = validStations[i];
    const dist = haversineKm(hoodLat, hoodLng, candidate.lat, candidate.lng);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
      nearest = candidate;
    }
  }
  const roundedDist = Math.round(minDistanceKm * 10) / 10;
  const withinRange = roundedDist <= maxCoverageRadiusKm;
  return {
    stationId: nearest.stationId,
    stationName: nearest.stationName,
    stationDistanceKm: roundedDist,
    stationAqi: Math.round(nearest.aqi),
    pm25: nearest.pm25 !== undefined ? Math.round(nearest.pm25 * 10) / 10 : null,
    coverageStatus: withinRange ? 'nearest_station_within_range' : 'distant_station_extrapolated',
  };
}
export interface RawMarketObservationInput {
  observationId: string;
  cityId: string;
  neighborhoodId: number;
  dealType: 'buy' | 'rent';
  priceValue: number;
  currencyUnit: 'million_toman_per_sqm' | 'toman_per_sqm' | 'rial_per_sqm' | 'million_toman_monthly';
  areaSqm: number;
  observedAtMs: number;
  sourceName: string;
  benchmarkPriceMillions?: number;
}
export type MarketAnomalyReasonCode =
  | 'INVALID_NUMERIC_VALUE' | 'IMPOSSIBLE_AREA_SQM' | 'UNIT_SCALE_MISMATCH'
  | 'EXTREME_BENCHMARK_DEVIATION' | 'FUTURE_OR_STALE_TIMESTAMP' | 'MISSING_IDENTITY_FIELDS' | 'DUPLICATE_OBSERVATION';
export interface QuarantinedMarketObservation {
  observationId: string;
  rawInput: RawMarketObservationInput;
  normalizedPriceMillions: number | null;
  anomalyCodes: MarketAnomalyReasonCode[];
  quarantinedAtMs: number;
  requiresManualReview: boolean;
}
export interface ValidatedMarketObservation {
  observationId: string;
  cityId: string;
  neighborhoodId: number;
  dealType: 'buy' | 'rent';
  normalizedPriceMillions: number;
  areaSqm: number;
  observedAtMs: number;
  sourceName: string;
}
export function validateAndQuarantineMarketObservation(
  input: RawMarketObservationInput,
  seenObservationIds: Set<string>,
  nowMs: number = Date.now(),
): { accepted: ValidatedMarketObservation | null; quarantined: QuarantinedMarketObservation | null } {
  const anomalyCodes: MarketAnomalyReasonCode[] = [];
  const safeObsId = String(input?.observationId || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 128);
  const safeCityId = String(input?.cityId || '').replace(/[^a-zA-Z0-9_-]/g, '').trim().slice(0, 64);
  const safeSourceName = String(input?.sourceName || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 120) || 'unknown';
  if (!safeObsId || !safeCityId || !Number.isInteger(input?.neighborhoodId) || input.neighborhoodId <= 0 || input.neighborhoodId > 999) {
    anomalyCodes.push('MISSING_IDENTITY_FIELDS');
  }
  if (safeObsId && seenObservationIds.has(safeObsId)) {
    anomalyCodes.push('DUPLICATE_OBSERVATION');
  }
  if (!Number.isFinite(input.areaSqm) || input.areaSqm < 15 || input.areaSqm > 5000) {
    anomalyCodes.push('IMPOSSIBLE_AREA_SQM');
  }
  const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(input.observedAtMs) || input.observedAtMs > nowMs + 5 * 60 * 1000 || input.observedAtMs < nowMs - maxAgeMs) {
    anomalyCodes.push('FUTURE_OR_STALE_TIMESTAMP');
  }
  let normalizedPriceMillions: number | null = null;
  if (!Number.isFinite(input.priceValue) || input.priceValue <= 0) {
    anomalyCodes.push('INVALID_NUMERIC_VALUE');
  } else {
    if (input.currencyUnit === 'million_toman_per_sqm' || input.currencyUnit === 'million_toman_monthly') {
      normalizedPriceMillions = input.priceValue;
    } else if (input.currencyUnit === 'toman_per_sqm') {
      normalizedPriceMillions = input.priceValue / 1_000_000;
    } else if (input.currencyUnit === 'rial_per_sqm') {
      normalizedPriceMillions = input.priceValue / 10_000_000;
    }
    if (
      normalizedPriceMillions === null ||
      (input.dealType === 'buy' && (normalizedPriceMillions < 8 || normalizedPriceMillions > 1200)) ||
      (input.dealType === 'rent' && (normalizedPriceMillions < 0.5 || normalizedPriceMillions > 500))
    ) {
      anomalyCodes.push('UNIT_SCALE_MISMATCH');
    } else if (
      input.benchmarkPriceMillions &&
      input.benchmarkPriceMillions > 0 &&
      (normalizedPriceMillions < input.benchmarkPriceMillions * 0.25 || normalizedPriceMillions > input.benchmarkPriceMillions * 3.5)
    ) {
      anomalyCodes.push('EXTREME_BENCHMARK_DEVIATION');
    }
  }
  if (anomalyCodes.length > 0 || normalizedPriceMillions === null) {
    return {
      accepted: null,
      quarantined: {
        observationId: safeObsId || 'unknown',
        rawInput: input,
        normalizedPriceMillions,
        anomalyCodes,
        quarantinedAtMs: nowMs,
        requiresManualReview: anomalyCodes.includes('EXTREME_BENCHMARK_DEVIATION'),
      },
    };
  }
  if (seenObservationIds.size >= 10_000) { const oldest = seenObservationIds.values().next().value; if (oldest !== undefined) seenObservationIds.delete(oldest); }
  seenObservationIds.add(safeObsId);
  return {
    accepted: {
      observationId: safeObsId, cityId: safeCityId, neighborhoodId: input.neighborhoodId, dealType: input.dealType,
      normalizedPriceMillions: Math.round(normalizedPriceMillions * 100) / 100, areaSqm: input.areaSqm, observedAtMs: input.observedAtMs, sourceName: safeSourceName,
    },
    quarantined: null,
  };
}
/**
 * [RULE-04], [RULE-12], [RULE-13] Off-Main-Thread Hedonic Property Valuation Worker
 * Computes realistic Tehran property prices with non-linear age depreciation & confidence bands.
 */

import { calculateTehranAgeFactor, computeRentConversion } from '../utils/persianFinancials';
import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface HedonicEstimationRequest {
  requestId: number;
  hoodBasePricePerSqmMillion: number;
  districtTier: 'NORTH_LUXURY' | 'CENTRAL_BALANCED' | 'SOUTH_HIGH_YIELD';
  areaSqm: number;
  buildingAgeYears: number;
  bedrooms: number;
  floorNumber: number;
  hasElevator: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  isSunlitSouthFacing: boolean;
  depositShareRatio: number;
  monthlyConversionRatePercent: number;
}

export interface HedonicEstimationResponse {
  requestId: number;
  estimatedPricePerSqmMillion: number;
  estimatedTotalMillion: number;
  estimatedTotalUsdText?: string;
  lowBandTotalMillion: number;
  highBandTotalMillion: number;
  ageRegimeLabel: string;
  ageMultiplier: number;
  amenityMultiplier: number;
  fullDepositMillion: number;
  suggestedDepositMillion: number;
  suggestedMonthlyRentMillion: number;
  annualCapRatePercent: number;
}

export function evaluateHedonicModelSync(
  req: HedonicEstimationRequest
): HedonicEstimationResponse {
  const safeArea = Math.max(30, Math.min(1000, req.areaSqm));
  const safeBase = Math.max(15, req.hoodBasePricePerSqmMillion);

  const ageFactor = calculateTehranAgeFactor(req.buildingAgeYears);

  // Floor & Elevator interaction (Walk-up penalty on floors > 2 without elevator)
  let floorMultiplier = 1.0;
  if (req.floorNumber > 1) {
    if (req.hasElevator) {
      floorMultiplier += Math.min(10, req.floorNumber - 1) * 0.008; // +0.8% per floor up to 10th
    } else if (req.floorNumber >= 3) {
      floorMultiplier -= (req.floorNumber - 2) * 0.045; // Walk-up penalty
    }
  }

  // Core Tehran Amenities
  let amenityBonus = 1.0;
  if (req.hasParking) amenityBonus += 0.065;
  else amenityBonus -= 0.075; // Severe penalty for no parking in Tehran

  if (req.hasElevator) amenityBonus += 0.035;
  if (req.hasStorage) amenityBonus += 0.018;
  if (req.isSunlitSouthFacing) amenityBonus += 0.025;

  // Area efficiency adjustment (micro-units command slight per-sqm premium; >220m² luxury premium in North)
  let sizeFactor = 1.0;
  if (safeArea < 65) sizeFactor = 1.035;
  else if (safeArea > 200 && req.districtTier === 'NORTH_LUXURY') sizeFactor = 1.06;

  const combinedAmenityMultiplier = Number((floorMultiplier * amenityBonus * sizeFactor).toFixed(4));
  const estimatedPricePerSqmMillion = Math.round(
    safeBase * ageFactor.multiplier * combinedAmenityMultiplier
  );

  const estimatedTotalMillion = Math.round(estimatedPricePerSqmMillion * safeArea);
  const lowBandTotalMillion = Math.round(estimatedTotalMillion * 0.94);
  const highBandTotalMillion = Math.round(estimatedTotalMillion * 1.06);

  const rentMetrics = computeRentConversion(
    estimatedTotalMillion,
    req.districtTier,
    req.depositShareRatio,
    req.monthlyConversionRatePercent
  );

  return {
    requestId: req.requestId,
    estimatedPricePerSqmMillion,
    estimatedTotalMillion,
    estimatedTotalUsdText: formatMillionTomanAsIntlCurrency(estimatedTotalMillion, 'USD', 'en'),
    lowBandTotalMillion,
    highBandTotalMillion,
    ageRegimeLabel: ageFactor.persianLabel,
    ageMultiplier: ageFactor.multiplier,
    amenityMultiplier: combinedAmenityMultiplier,
    fullDepositMillion: rentMetrics.fullDepositMillion,
    suggestedDepositMillion: rentMetrics.depositMillion,
    suggestedMonthlyRentMillion: rentMetrics.monthlyRentMillion,
    annualCapRatePercent: rentMetrics.annualCapRatePercent,
  };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event: MessageEvent<HedonicEstimationRequest>) => {
    if (!event.data || typeof event.data.requestId !== 'number') return;
    const result = evaluateHedonicModelSync(event.data);
    self.postMessage(result);
  });
}

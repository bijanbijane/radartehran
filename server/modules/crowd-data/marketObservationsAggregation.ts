/**
 * @fileoverview Pure Safe Analytical Aggregation Engine for Market Observations
 * (`server/modules/crowd-data/marketObservationsAggregation.ts`).
 *
 * Strictly distinguishes raw observations, quarantined observations, rejected observations,
 * expired observations, active verified observations, and derived statistical metrics.
 * Never manufactures synthetic fallback data when verified observations are absent.
 */

import { filterAndAggregateScrapedSamples } from '../../../src/utils/marketHistoryAndPulseIntegrity';
import type {
  AuthoritativeNeighborhoodRef,
  MarketObservationRecord,
  SafeMarketObservationAggregation,
} from './types';

export function computeSafeNeighborhoodAggregation(
  hoodRef: AuthoritativeNeighborhoodRef,
  allObservations: readonly MarketObservationRecord[],
  nowMs = Date.now()
): SafeMarketObservationAggregation {
  const evaluatedAtIso = new Date(nowMs).toISOString();

  let rawObservationCount = 0;
  let quarantinedObservationCount = 0;
  let rejectedObservationCount = 0;
  let expiredObservationCount = 0;
  const activeVerified: MarketObservationRecord[] = [];

  for (const obs of allObservations) {
    if (obs.verificationState === 'RAW_UNVERIFIED') {
      rawObservationCount++;
      continue;
    }
    if (obs.verificationState === 'QUARANTINED') {
      quarantinedObservationCount++;
      continue;
    }
    if (obs.verificationState === 'REJECTED_INVALID') {
      rejectedObservationCount++;
      continue;
    }
    if (obs.verificationState === 'VERIFIED_OBSERVATION') {
      const validUntilMs = Date.parse(obs.validity.validUntilIso);
      if (!Number.isFinite(validUntilMs) || validUntilMs < nowMs) {
        expiredObservationCount++;
        continue;
      }
      activeVerified.push(obs);
    }
  }

  if (activeVerified.length === 0) {
    return {
      cityId: hoodRef.cityId,
      hoodId: hoodRef.hoodId,
      hoodName: hoodRef.hoodName,
      evaluatedAtIso,
      rawObservationCount,
      quarantinedObservationCount,
      rejectedObservationCount,
      expiredObservationCount,
      verifiedActiveObservationCount: 0,
      outlierFilteredCount: 0,
      status: 'INSUFFICIENT_VERIFIED_OBSERVATIONS',
      syntheticFallbackUsed: false,
      derivedMetrics: null,
    };
  }

  const prices = activeVerified.map((item) => item.pricePerSqmMillionToman);
  const minPlausible = Math.max(8, Math.round(hoodRef.baseBuyPerSqmMillionToman * 0.25));
  const maxPlausible = Math.min(1200, Math.round(hoodRef.baseBuyPerSqmMillionToman * 3.5));
  const iqrSummary = filterAndAggregateScrapedSamples(prices, minPlausible, maxPlausible);

  if (
    iqrSummary.acceptedSampleCount === 0 ||
    iqrSummary.medianPriceMillions === null ||
    iqrSummary.iqrLowerBound === null ||
    iqrSummary.iqrUpperBound === null
  ) {
    return {
      cityId: hoodRef.cityId,
      hoodId: hoodRef.hoodId,
      hoodName: hoodRef.hoodName,
      evaluatedAtIso,
      rawObservationCount,
      quarantinedObservationCount,
      rejectedObservationCount,
      expiredObservationCount,
      verifiedActiveObservationCount: activeVerified.length,
      outlierFilteredCount: iqrSummary.rejectedOutliers.length,
      status: 'INSUFFICIENT_VERIFIED_OBSERVATIONS',
      syntheticFallbackUsed: false,
      derivedMetrics: null,
    };
  }

  const totalConfidence = activeVerified.reduce((acc, item) => acc + item.confidence.confidenceScore, 0);
  const meanWeightedConfidence = Math.round((totalConfidence / activeVerified.length) * 1000) / 1000;
  const sortedTimestamps = activeVerified
    .map((item) => item.validity.observedAtIso)
    .sort((a, b) => a.localeCompare(b));

  const aggGrade: 'high' | 'medium' | 'low' =
    iqrSummary.confidenceLevel === 'high'
      ? 'high'
      : iqrSummary.confidenceLevel === 'medium'
        ? 'medium'
        : 'low';

  return {
    cityId: hoodRef.cityId,
    hoodId: hoodRef.hoodId,
    hoodName: hoodRef.hoodName,
    evaluatedAtIso,
    rawObservationCount,
    quarantinedObservationCount,
    rejectedObservationCount,
    expiredObservationCount,
    verifiedActiveObservationCount: activeVerified.length,
    outlierFilteredCount: iqrSummary.rejectedOutliers.length,
    status: 'AGGREGATED_FROM_VERIFIED',
    syntheticFallbackUsed: false,
    derivedMetrics: {
      epistemicClass: 'DERIVED_MARKET_METRIC',
      medianBuyPerSqmMillionToman: iqrSummary.medianPriceMillions,
      q1BuyPerSqmMillionToman: iqrSummary.iqrLowerBound,
      q3BuyPerSqmMillionToman: iqrSummary.iqrUpperBound,
      iqrMillionToman: Math.round((iqrSummary.iqrUpperBound - iqrSummary.iqrLowerBound) * 10) / 10,
      meanWeightedConfidence,
      aggregateConfidenceGrade: aggGrade,
      earliestObservationIso: sortedTimestamps[0],
      latestObservationIso: sortedTimestamps[sortedTimestamps.length - 1],
    },
  };
}

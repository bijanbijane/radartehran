import type { MarketIntelligenceModuleDependencies } from './contracts/externalAdapters';
import {
  createMarketIntelligenceService as createInMemoryMarketIntelligenceService,
  type MarketIntelligenceService,
} from './service';
import { createMarketIntelligenceService as createDurableMarketIntelligenceService } from './services/marketIntelligenceService';
import type { MarketIntelligenceDependencies } from './types';

export * from './types';
export * from './indicatorsAndTemporalEngine';
export * from './segmentationComparisonAndAnomalyEngine';
export type { MarketIntelligenceService } from './service';
export * from './routes';
export type {
  AgeBandCategory,
  CanonicalMarketGeographicEntity,
  ConstructionStageCategory,
  DemandSignalClassification,
  MacroeconomicSeriesReadAdapter,
  MarketDemandSignalsReadAdapter,
  MarketGeographicLookup,
  MarketGeographyReadAdapter,
  MarketIntelligenceModuleDependencies,
  MarketListingSupplyReadAdapter,
  MarketTransactionMode,
  MarketTransactionsReadAdapter,
  PropertyFormCategory,
  PropertyUseCategory,
  RawListingLifecycleState,
  RawMarketDemandSignal,
  RawMarketListingObservation,
  RawMarketTransactionObservation,
  SizeBandCategory,
  TransactionVerificationClassification,
  VerifiedMacroeconomicPeriodRecord,
} from './contracts/externalAdapters';
export * from './domain/types';

export const MARKET_INTELLIGENCE_ROUTE_REGISTRATION_SPEC = [
  { method: 'POST', path: '/api/v1/market-intelligence/snapshots', operation: 'generateOrRecalculateMarketSnapshot' },
  { method: 'GET', path: '/api/v1/market-intelligence/overview', operation: 'retrieveMarketOverview' },
  { method: 'GET', path: '/api/v1/market-intelligence/overview/sale', operation: 'retrieveSaleMarketOverview' },
  { method: 'GET', path: '/api/v1/market-intelligence/overview/rental', operation: 'retrieveRentalMarketOverview' },
  { method: 'GET', path: '/api/v1/market-intelligence/supply', operation: 'retrieveMarketSupplyIndicators' },
  { method: 'GET', path: '/api/v1/market-intelligence/demand', operation: 'retrieveMarketDemandIndicators' },
  { method: 'GET', path: '/api/v1/market-intelligence/inventory/history', operation: 'retrieveListingInventoryHistory' },
  { method: 'GET', path: '/api/v1/market-intelligence/transactions/activity', operation: 'retrieveTransactionActivity' },
  { method: 'GET', path: '/api/v1/market-intelligence/distributions/asking-price', operation: 'retrieveAskingPriceDistributions' },
  { method: 'GET', path: '/api/v1/market-intelligence/distributions/confirmed-price', operation: 'retrieveConfirmedTransactionPriceDistributions' },
  { method: 'GET', path: '/api/v1/market-intelligence/rental/trends', operation: 'retrieveRentalMarketTrends' },
  { method: 'POST', path: '/api/v1/market-intelligence/indices', operation: 'computeAndRetrievePriceAndRentIndex' },
  { method: 'GET', path: '/api/v1/market-intelligence/liquidity', operation: 'retrieveMarketLiquidityIndicators' },
  { method: 'GET', path: '/api/v1/market-intelligence/absorption', operation: 'retrieveSupplyAbsorptionIndicators' },
  { method: 'POST', path: '/api/v1/market-intelligence/compare', operation: 'compareGeographicMarkets' },
  { method: 'GET', path: '/api/v1/market-intelligence/segments', operation: 'retrieveMarketSegmentDefinitions' },
  { method: 'GET', path: '/api/v1/market-intelligence/snapshots/history', operation: 'retrieveHistoricalMarketSnapshots' },
  { method: 'POST', path: '/api/v1/market-intelligence/forecasts', operation: 'requestMarketForecast' },
  { method: 'GET', path: '/api/v1/market-intelligence/forecasts/:forecastId', operation: 'retrieveForecastEvaluation' },
  { method: 'POST', path: '/api/v1/market-intelligence/scenarios', operation: 'runHypotheticalScenario' },
  { method: 'GET', path: '/api/v1/market-intelligence/snapshots/:snapshotId/provenance', operation: 'retrieveDataQualityAndProvenanceMetadata' },
  { method: 'GET', path: '/api/v1/market-intelligence/jobs/:jobId', operation: 'retrieveCalculationJobStatus' },
] as const;

export function createMarketIntelligenceService(
  deps: MarketIntelligenceModuleDependencies,
): ReturnType<typeof createDurableMarketIntelligenceService>;
export function createMarketIntelligenceService(
  deps?: MarketIntelligenceDependencies,
): MarketIntelligenceService;
export function createMarketIntelligenceService(
  deps: MarketIntelligenceDependencies | MarketIntelligenceModuleDependencies = {},
): MarketIntelligenceService | ReturnType<typeof createDurableMarketIntelligenceService> {
  if ('geography' in deps && deps.geography && 'txRunner' in deps && deps.txRunner) {
    return createDurableMarketIntelligenceService(deps as MarketIntelligenceModuleDependencies);
  }
  return createInMemoryMarketIntelligenceService(deps as MarketIntelligenceDependencies);
}

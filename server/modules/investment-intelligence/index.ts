export * from './contracts/externalAdapters';
export * from './domain/types';
export * from './methodologies/methodologyRegistry';
export * from './returns/yieldsCashflowsAndReturnsEngine';
export * from './diversification/portfolioAnalyticsAndRiskEngine';
export * from './services/investmentIntelligenceService';

export const INVESTMENT_INTELLIGENCE_ROUTE_REGISTRATION_SPEC = [
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios',
    operation: 'createInvestmentPortfolio',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId',
    operation: 'retrieveInvestmentPortfolio',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets',
    operation: 'addInvestmentAssetReference',
    authRequired: true,
  },
  {
    method: 'DELETE',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId',
    operation: 'removeInvestmentAssetReference',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets',
    operation: 'retrievePortfolioAssets',
    authRequired: true,
  },
  {
    method: 'PATCH',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/acquisition',
    operation: 'recordInvestmentAcquisitionInformation',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/entries',
    operation: 'recordFinancialEntryInformation',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/rental-yield',
    operation: 'retrieveRentalYieldAnalysis',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/cash-flow',
    operation: 'retrieveCashFlowAnalysis',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/returns',
    operation: 'calculateInvestmentReturn',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/scenarios',
    operation: 'runInvestmentScenario',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/scenarios/compare',
    operation: 'compareInvestmentScenarios',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/snapshots',
    operation: 'generateAndRetrievePerformanceSnapshot',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/allocation',
    operation: 'retrievePortfolioAllocationAndConcentration',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/risk-indicators',
    operation: 'retrieveInvestmentRiskIndicators',
    authRequired: true,
  },
  {
    method: 'POST',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/benchmarks/compare',
    operation: 'comparePortfolioWithMarketBenchmarks',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/methodologies',
    operation: 'retrieveMethodologyDefinitions',
    authRequired: false,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/portfolios/:portfolioId/assets/:investmentAssetId/provenance',
    operation: 'retrieveDataQualityAndProvenanceMetadata',
    authRequired: true,
  },
  {
    method: 'GET',
    path: '/api/v1/investment-intelligence/jobs/:jobId',
    operation: 'retrieveCalculationJobStatus',
    authRequired: true,
  },
] as const;

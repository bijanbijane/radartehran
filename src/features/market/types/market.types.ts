export type MarketType = 'residential' | 'commercial' | 'office' | 'land';
export type MarketTransactionType = 'sale' | 'rent';
export type PropertySubType =
  | 'apartment'
  | 'villa'
  | 'penthouse'
  | 'shop'
  | 'office_unit'
  | 'land_plot';
export type MarketGeoLevel = 'city' | 'zone' | 'neighborhood';
export type MarketPeriodId = '30d' | '90d' | '180d' | '365d';
export type MarketDataKind =
  | 'asking_price'
  | 'transaction_price'
  | 'estimated_value'
  | 'rent'
  | 'supply';
export type MarketIndicatorStatus =
  | 'published'
  | 'provisional'
  | 'insufficient_sample'
  | 'stale'
  | 'unavailable';

export interface MarketContextState {
  cityId: string;
  cityNameFa: string;
  geoLevel: MarketGeoLevel;
  zoneName: string;
  neighborhoodId: number;
  neighborhoodName: string;
  marketType: MarketType;
  transactionType: MarketTransactionType;
  propertySubType: PropertySubType;
  period: MarketPeriodId;
  activeMetricKind: MarketDataKind;
}

export interface MarketFilterDraft {
  marketType: MarketType;
  transactionType: MarketTransactionType;
  propertySubType: PropertySubType;
  geoLevel: MarketGeoLevel;
  zoneName: string;
  period: MarketPeriodId;
  areaRange: 'all' | 'under75' | '75to120' | 'over120';
  ageRange: 'all' | 'new_0_5' | 'mid_6_15' | 'old_16plus';
  rooms: 'all' | '1' | '2' | '3plus';
  onlyObserved: boolean;
  includeRentEquivalent: boolean;
}

export interface AppliedMarketFilters extends MarketFilterDraft {
  appliedAtIso: string;
}

export type MarketScopeStatus = 'valid_with_data' | 'valid_empty' | 'invalid_scope';
export type GeoPriceSourceKind = 'observed_listing' | 'internal_reference' | 'estimated_v64' | 'unavailable';

export interface DataQualityAssessment {
  status: MarketIndicatorStatus;
  rawCount: number;
  validCount: number;
  observedValidCount: number;
  illustrativeCount: number;
  duplicateExcluded: number;
  outlierExcluded: number;
  missingRatePct: number;
  observedCount: number;
  verifiedTransactionCount: number;
  coverageLabelFa: string;
  freshnessLabelFa: string;
  freshnessStatus?: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
  observedAtIso?: string | null;
  limitationFa: string;
}

export interface SourceRegistryEntry {
  id: string;
  nameFa: string;
  kindFa: string;
  cadenceFa: string;
  coverageNoteFa: string;
}

export interface MethodologyDefinition {
  id: string;
  version: string;
  titleFa: string;
  summaryFa: string;
  formulaText: string;
  assumptionsFa: string[];
  limitationsFa: string[];
}

export interface MarketReportItem {
  id: string;
  titleFa: string;
  scopeLabelFa: string;
  periodLabelFa: string;
  publishedJalali: string;
  generatedAtIso: string;
  dataAsOfIso: string | null;
  dataAsOfDisplayFa?: string | null;
  freshnessStatus?: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
  status: MarketIndicatorStatus;
  summaryFa: string;
  keyTakeawaysFa: string[];
  methodologyId: string;
  sourceIds: string[];
  sampleCount: number;
}

export interface SavedMarketAnalysis {
  id: string;
  title: string;
  savedAtIso: string;
  cityId: string;
  neighborhoodId: number;
  neighborhoodName: string;
  subTab: string;
  filters: AppliedMarketFilters;
  compareHoodIds: number[];
}

export interface GeoComparisonItem {
  hoodId: number;
  hoodName: string;
  zone: string;
  askingPerSqmMillion: number | null;
  estimatedDealPerSqmMillion: number | null;
  rahn80mMillion: number;
  monthlyRentEquivMillion: number;
  observedCount: number;
  status: MarketIndicatorStatus;
  priceSourceKind: GeoPriceSourceKind;
  gapFromBasePct: number | null;
  overallScore: number;
}

export interface MarketWidgetResult<T> {
  status: 'ready' | 'loading' | 'empty' | 'error';
  data: T | null;
  staleData: T | null;
  errorMessageFa: string | null;
  requestId: number;
}

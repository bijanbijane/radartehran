import type { MarketDataKind, MarketGeoLevel, MarketIndicatorStatus } from './market.types';

export type MarketIndicatorId =
  | 'asking_price_median_sqm'
  | 'asking_price_mean_sqm'
  | 'estimated_deal_v64_sqm'
  | 'verified_transaction_sqm'
  | 'supply_valid_count'
  | 'supply_raw_count'
  | 'rent_deposit_80m'
  | 'rent_monthly_80m'
  | 'rent_equivalent_80m'
  | 'period_change_pct'
  | 'asking_iqr_spread_pct';

export interface MarketIndicatorDefinition {
  id: MarketIndicatorId;
  titleFa: string;
  titleEn: string;
  shortDescFa: string;
  unitFa: string;
  dataKind: MarketDataKind;
  formulaFa: string;
  methodologyId: string;
  sourceIds: string[];
  minSampleByGeo: Record<MarketGeoLevel, number>;
}

export interface MarketIndicatorValue {
  id: MarketIndicatorId;
  titleFa: string;
  titleEn: string;
  dataKind: MarketDataKind;
  dataKindLabelFa: string;
  value: number | null;
  formattedValueFa: string;
  unitFa: string;
  intlText?: string;
  geoScopeFa: string;
  periodLabelFa: string;
  sampleCount: number;
  status: MarketIndicatorStatus;
  statusLabelFa: string;
  methodologyId: string;
  sourceSummaryFa: string;
  secondaryNoteFa: string;
}

export interface PriceDistributionStats {
  count: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  mean: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
  iqr: number | null;
  bins: Array<{
    rangeLabelFa: string;
    fromSqm: number;
    toSqm: number;
    count: number;
    sharePct: number;
  }>;
}

export interface PriceScatterPoint {
  id: string;
  label: string;
  sqm: number;
  perSqmMillion: number;
  fairPerSqmMillion: number;
  age: number;
  rooms?: number | null;
  propertySubType?: 'apartment' | 'villa' | 'penthouse' | 'shop' | 'office_unit' | 'land_plot';
  transactionType?: 'sale' | 'rent';
  createdAtIso?: string | null;
  isObserved: boolean;
  isOutlierBand: boolean;
}

export interface SupplyCompositionSegment {
  key: string;
  labelFa: string;
  count: number;
  sharePct: number;
}

export interface MarketTrendSeriesPoint {
  monthKey: string;
  monthLabelFa: string;
  askingPerSqmMillion: number | null;
  estimatedDealPerSqmMillion: number | null;
  cityAvgPerSqmMillion: number | null;
  deposit80mMillion: number | null;
  monthlyRentEquivMillion: number | null;
  sampleCount: number;
  hasDataGap: boolean;
}

export interface RentRawBreakdown {
  deposit80mMillion: number;
  monthlyRentAtMixedMillion: number;
  convertedFullMonthlyMillion: number;
  conversionRateAnnual: number;
  conversionRatioPerMillion: number;
  grossYieldPct: number | null;
  observedRentCount?: number;
  status: MarketIndicatorStatus;
}

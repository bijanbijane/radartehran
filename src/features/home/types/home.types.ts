/**
 * @file src/features/home/types/home.types.ts
 * @description Stage 14 (RT-UI-HOME-001) Homepage Experience & Stage 15 (RT-UI-MAP-001) Map Architecture Contracts.
 */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';

/** Section 14.11 & 14.17 — Canonical Data Quality States */
export type DataQuality =
  | 'verified'
  | 'estimated'
  | 'incomplete'
  | 'stale'
  | 'unavailable';

/** Section 14.17 — Proposed Data Contract for Market Snapshot Metrics */
export interface MarketSnapshotMetric {
  id: string;
  title: string;
  value: number | null;
  unit: string;
  formattedValue?: string;
  geography: {
    cityId: string;
    cityLabelFa: string;
    areaIds?: string[];
  };
  period: {
    from: string;
    to: string;
    labelFa: string;
  };
  dataType:
    | 'asking_price'
    | 'transaction_price'
    | 'rent'
    | 'supply'
    | 'other';
  dataTypeLabelFa: string;
  sourceLabels: string[];
  methodologyId?: string;
  methodologyLabelFa: string;
  updatedAt: string | null;
  quality: DataQuality;
  sampleCount?: number;
  limitationNote?: string;
}

/** Section 14.2 — Six Core User Intents on the Homepage */
export type HomeUserIntentId =
  | 'inspect_neighborhood'
  | 'check_regional_prices'
  | 'buy_or_rent_property'
  | 'estimate_property_value'
  | 'explore_spatial_data'
  | 'read_research_reports';

export interface HomeQuickAccessItem {
  id: string;
  intentId: HomeUserIntentId;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  visualWeight: 'primary' | 'secondary' | 'tertiary';
  iconName: 'map' | 'compass' | 'chart' | 'building' | 'calculator' | 'book';
}

/** Section 14.15 — Global Search Result Categories on Homepage */
export type HomeSearchCategoryId =
  | 'cities_areas'
  | 'neighborhoods'
  | 'streets_zones'
  | 'properties'
  | 'services'
  | 'research'
  | 'data';

export interface HomeSearchResultItem {
  id: string;
  category: HomeSearchCategoryId;
  categoryLabelFa: string;
  titleFa: string;
  subtitleFa: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  hoodId?: number;
  matchScore: number;
}

/** Section 14.16 — Homepage Section Resilience States */
export type HomeResilienceScenarioId =
  | 'normal'
  | 'loading'
  | 'search_empty'
  | 'partial_data'
  | 'market_unavailable'
  | 'old_data'
  | 'map_unavailable'
  | 'network_error'
  | 'empty_research'
  | 'empty_properties';

/** Section 14.8.2 — Editorial Neighborhood Selection Strategy */
export type HomeNeighborhoodSelectionMode =
  | 'editorial_curated'
  | 'data_completeness'
  | 'budget_fit';

/** Section 14.9 — Research & Urban Analysis Report Card Contract */
export interface HomeResearchReportItem {
  id: string;
  categoryLabelFa: string;
  titleFa: string;
  summaryFa: string;
  publishedAtFa: string | null;
  geographyScopeFa: string;
  status: 'published' | 'archived';
  sourceTraceFa: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
}

/** Section 14.11 — Four Data Provenance Pillars */
export interface HomeMethodologyPillar {
  id: 'source' | 'time' | 'method' | 'limitation';
  titleFa: string;
  questionFa: string;
  explanationFa: string;
}

/** Section 14.20 — Privacy-Safe Homepage Telemetry Events */
export type HomeTelemetryEventName =
  | 'home_view'
  | 'home_search_submit'
  | 'home_map_open'
  | 'home_neighborhood_open'
  | 'home_market_open'
  | 'home_report_open'
  | 'home_property_open';

export interface PrivacySafeHomeTelemetryPayload {
  event: HomeTelemetryEventName;
  timestampIso: string;
  cityId: string;
  hasSearchQuery?: boolean;
  queryLengthBucket?: '0' | '1_3' | '4_10' | '11_plus';
  resultCategory?: HomeSearchCategoryId;
  targetDestination?: string;
  piiScrubbed: true;
}

/** Section 14.21 — Phased Implementation Packages (HOME-01..HOME-11) */
export type HomeImplementationPackageId =
  | 'HOME-01'
  | 'HOME-02'
  | 'HOME-03'
  | 'HOME-04'
  | 'HOME-05'
  | 'HOME-06'
  | 'HOME-07'
  | 'HOME-08'
  | 'HOME-09'
  | 'HOME-10'
  | 'HOME-11';

export interface HomeImplementationPackage {
  id: HomeImplementationPackageId;
  phaseOrder: 1 | 2 | 3 | 4;
  titleFa: string;
  deliverableFa: string;
  status: 'implemented';
}

/** Section 14.23 — 18-Point Final Acceptance Checklist */
export interface HomeAcceptanceCriterion {
  id: string;
  index: number;
  statementFa: string;
  verified: boolean;
}

/** Stage 15 (RT-UI-MAP-001) — 15 Architectural Requirements for Primary Map Workspace */
export interface MapExperienceArchitectureSpecItem {
  id: string;
  index: number;
  titleFa: string;
  contractFa: string;
  connectedModule: string;
}

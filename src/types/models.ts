export type CityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz'; export type FreeKeylessTileServerId = 'voyager' | 'osm_hot' | 'carto_dark' | 'osm' | 'satellite'; export type MapTileServerId = 'neshan' | FreeKeylessTileServerId; export interface BargainListing { id: string; title: string; type: 'خرید' | 'اجاره'; sqm: number; priceText: string; discountPercent: number; buyerProfitText: string; street: string; imageUrl?: string; imageUrls?: string[]; videoUrl?: string; objectStorageBucket?: string; objectStorageKeys?: string[]; objectStorageObjectIds?: string[]; createdAtIso?: string; } export interface NeighborhoodSponsor { name: string; phone: string; specialty: string; experienceYears: number; expiresAtIso?: string; planType?: 'free' | 'paid_1m' | 'paid_3m';
} export interface NeighborhoodTrafficInfo { liveStatus: string; liveSeverity: 'heavy' | 'semi' | 'smooth'; peakHours: string; seasonalAnalysis: string; bottlenecks: string; trafficScore: number; } export interface Neighborhood { id: number; name: string; zone: string; lat: number; lng: number; radius: number;
  /** Canonical IRNI identity; legacy numeric id remains compatibility-only. */
  geographicEntityId?: string | null;
  geographicIdentityResolutionStatus?: 'RESOLVED' | 'UNRESOLVED' | 'UNAVAILABLE';
  geographicRegistryRevision?: number | null;
  buyPerSqm: number; baseBuyPerSqm?: number; rahn80m: number; air: number; powerWater: number; internet: number; metro: number; security: number; flatTerrain: number; pros: string; cons: string; sponsor: NeighborhoodSponsor; bargains: BargainListing[];
  votesCount?: number; trafficInfo?: NeighborhoodTrafficInfo; city?: CityId; opportunityScore?: number;
}
export interface CityConfig { id: CityId; nameFa: string; center: [number, number]; defaultZoom: number;
  neighborhoods: Neighborhood[]; workHubs?: WorkHub[]; }
export interface WorkHub { id: string; name: string;
  lat: number | null; lng: number | null;
}
export interface LocalLandmark {
  id: string;
  name: string;
  category:
    | 'مترو و حمل‌ونقل' | 'پارک و فضای سبز' | 'مرکز خرید و رفاهی' | 'درمانی و بیمارستان'
    | 'مترو و تبادل' | 'بوستان و تفریح' | 'خرید و تجاری';
  desc: string;
  latOffset: number;
  lngOffset: number;
}
export interface BubbleTrendPoint {
  month: string;
  hoodPrice: number;
  tehranAvg: number;
}
export interface BubbleReport {
  status: 'undervalued' | 'balanced' | 'bubble';
  badgeText: string;
  hoodGrowth6mPercent: number;
  tehranGrowth6mPercent: number;
  prRatio: number;
  summary: string;
  trendData: BubbleTrendPoint[];
  estimatedDealPricePerSqm?: number;
}
export interface CommuteRoutingTelemetry {
  drivingDistanceKm: number | null;
  walkingDistanceKm: number | null;
  transitDistanceKm: number | null;
  travelDurationMinutes: number | null;
  calculatedAtIso: string | null;
  routingSource: string | null;
  roadNetworkVersion: string | null;
}
export interface EvaluatedNeighborhood extends Neighborhood {
  baseBuyPerSqm?: number;
  status: 'green' | 'yellow' | 'red';
  distKm: number | null;
  commuteRouting?: CommuteRoutingTelemetry | null;
  overallScore: number;
  diffPercent: number;
  marketReport: BubbleReport;
  trafficInfo: NeighborhoodTrafficInfo;
}
export interface ResidentVoteDoc {
  id: string;
  hoodId: number;
  hoodName: string;
  userId: string;
  userDisplayName: string;
  air: number;
  powerWater: number;
  internet: number;
  metro: number;
  security: number;
  flatTerrain: number;
  comment: string;
  locationVerified: boolean;
}
export interface GroundingSourceLink {
  title: string;
  uri: string;
}
export interface HoodLiveSnapshot {
  id: number;
  name: string;
  liveBuyPerSqm: number;
  liveRahn80m: number;
  liveAirScore: number;
  stationAqi: number;
  pm25: number;
  hourlyChangePercent: number;
  liveTrafficStatus: string;
  liveTrafficScore: number;
  peakHours: string;
  seasonalAnalysis: string;
  bottlenecks: string;
  liveBargains?: BargainListing[];
}
export interface MarketPulseData {
  status: string;
  cacheStatus: 'HIT' | 'REFRESHED' | 'DEEP_SYNCED' | 'FALLBACK';
  lastUpdatedIso: string;
  lastUpdatedTimeFa: string;
  nextRefreshMinutes: number;
  nextScheduledTimeFa?: string;
  schedulerWindowLabel?: string;
  tehranTrafficSummary?:
    | string
    | {
        statusLabel?: string;
        peakWindow?: string;
        seasonalNote?: string;
      };
  liveMacroRates?: {
    gold18kToman: number;
    usdToman: number;
    updatedAtIso: string;
  };
  groundingSources?: GroundingSourceLink[];
  airQuality: {
    cityId?: CityId;
    sourceStatus?: 'LIVE' | 'PARTIAL' | 'STALE' | 'SEED' | 'LIVE_OR_PARTIAL';
    lastObservedAtIso?: string | null;
    stationSuccessCount?: number;
    stationCount?: number;
    lastAttemptMs?: number | null;
    successfulStations?: number;
    totalStations?: number;
    tehranAverageAqi: number;
    tehranPm25?: number;
    tehranAveragePm25?: number;
    statusLabel: string;
    dominantPollutant: string;
    dataStatus?: 'live' | 'mixed' | 'fallback';
    liveStationCount?: number;
    totalStationCount?: number;
    lastSuccessIso?: string;
    stations: {
      region: string;
      stationName: string;
      aqi: number;
      pm25: number;
      status: string;
      source?: 'open-meteo' | 'fallback';
      fetchedAtIso?: string;
    }[];
  };
  marketSummary: {
    totalNeighborhoods: number;
    totalBargainsCount: number;
    tehranAverageBuyPerSqm: number;
    tehranAverageRahn80m: number;
    cheapestNeighborhood: {
      id: number;
      name: string;
      zone: string;
      buyPerSqm: number;
      rahn80m: number;
    };
    mostExpensiveNeighborhood: {
      id: number;
      name: string;
      zone: string;
      buyPerSqm: number;
      rahn80m: number;
    };
  };
  hoodLiveSnapshots?: HoodLiveSnapshot[];
}
export interface BuyerAlertLeadItem {
  id: string;
  hoodId: number;
  hoodName: string;
  fullName: string;
  phone: string;
  dealType: 'خرید' | 'اجاره';
  maxBudgetText: string;
  createdAtFa: string;
  createdAtIso?: string;
  expiresAtIso?: string;
  consentAtIso?: string;
  consentVersion?: string;
  submittedByUid?: string;
}
export interface SponsorCrmRequestItem {
  id: string;
  hoodId: number;
  hoodName: string;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  monthlyTariffMillion: number;
  planMonths?: 1 | 3;
  totalPayableMillion?: number;
  trackingCode?: string;
  expiresAtIso?: string;
  status: 'pending' | 'approved';
  createdAtFa: string;
}
/** Structured server audit log entry maintained in memory and persisted to `.cache-data.json`. */
export interface ServerAuditLogEntry {
  id: string;
  timestampIso: string;
  timeFa: string;
  level: 'INFO' | 'WARN' | 'SYNC';
  event: string;
}
/** System health telemetry payload returned by `GET /api/system-health`. */
export interface SystemHealthData {
  status: 'ok';
  uptimeSeconds: number;
  uptimeMinutes: number;
  uptimeHours: number;
  memoryRssBytes: number;
  memoryRssMb: number;
  cacheStatus: {
    state: string;
    lastUpdatedIso: string;
    lastUpdatedTimeFa: string;
    nextScheduledTimeFa: string;
    totalCachedNeighborhoods: number;
    deepSyncedOverridesCount: number;
  };
  apiConnectivity: {
    openMeteoStatus: 'OK' | 'FALLBACK';
    airQualityByCity?: Record<string, { status: 'OK' | 'FALLBACK'; lastSuccessMs: number | null }>;
    geminiConfigured: boolean;
  };
  securityMetrics: {
    payloadLimit: string; generalRateLimit: string; heavySyncRateLimit: string;
    activeTrackedIps: number; totalBlockedRequests: number;
  };
  recentLogs: ServerAuditLogEntry[];
}
/** Authenticated buyer alert submission record stored in memory and `/buyerAlerts`. */
export interface BuyerAlertRequest {
  id: string; hoodId: number; hoodName: string; city: CityId;
  fullName: string; phone: string; dealType: 'خرید' | 'اجاره' | 'رهن و اجاره';
  maxBudgetText: string; createdAtIso: string; status: 'new' | 'contacted' | 'archived';
  userId: string; userEmail: string; privacyConsent: boolean;
  consentTimestampIso: string; consentVersion: string;
}
/** Response payload from `POST /api/contract-check` (AI Legal Contract & Anti-Fraud Clause Analyzer). */
export interface ContractCheckResponse {
  status: 'ok';
  source: 'GEMINI_AI' | 'RULE_ENGINE' | 'gemini_ai' | 'local_rule_engine';
  analysisSource?: 'GEMINI_AI' | 'RULE_ENGINE' | 'CACHED_ANALYSIS';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'کم‌ریسک' | 'نیازمند اصلاح' | 'خطرناک' | 'امن' | 'نیازمند احتیاط' | 'خطرناک و پرریسک';
  riskScore?: number; warnings?: string[]; legalCitation?: string; summary?: string;
  legalAdvice?: string; traps?: string[]; detectedTraps?: string[];
  penaltiesWarning?: string; missingGuarantees?: string[];
  safeRewrite: string; fallbackReason?: string | null;
}
/** OP-DEC-001 & OP-DEC-002 Canonical Area Unit & International Reference Currency Telemetry Contracts (`formatAreaUnitLabel` / `formatMillionTomanAsIntlCurrency`). */
export type AreaUnitCode = 'sqm' | 'sqft';
export type IntlReferenceCurrencyCode = 'IRT' | 'USD' | 'EUR' | 'AED';
export interface IntlValuationMetadata {
  displayAreaUnitLabel: string;
  referenceValuationIntlText: string;
}
export interface FeatureFlags {
  enableCommissionCalc: boolean; enableMultiCity: boolean; enableSponsorBilling: boolean;
  enableAiContractCheck: boolean; enableTelegramFeed: boolean;
  enableAiValuation?: boolean; enableFakeAdDetector?: boolean; enableMortgageSimulator?: boolean;
  enableTenantRights?: boolean; enableMunicipalityCalc?: boolean; enablePropertySwap?: boolean;
  enableVisitChecklist?: boolean; enableSchoolRadar?: boolean; enableRealtorStudio?: boolean;
  enableRenovationCalc?: boolean; enableInvestmentSim?: boolean; enableSafetyRadar?: boolean;
  enableCommercialRadar?: boolean; enableSuburbRadar?: boolean; enablePreSaleRadar?: boolean;
  enableMovingPlanner?: boolean; enableFractionalInvest?: boolean; enableTrafficZoneCalc?: boolean;
  enableSeoContentGen?: boolean;
}
export * from './typeGuards';
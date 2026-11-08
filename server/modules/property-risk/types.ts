/**
 * Property Environmental Risk & Resilience Intelligence Domain Types
 * (`server/modules/property-risk/types.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

export type HazardSuperCategory =
  | 'geological'
  | 'hydrological'
  | 'meteorological'
  | 'wildfire_and_environmental'
  | 'climate_related';

export type HazardCategoryType =
  | 'earthquake_shaking'
  | 'surface_fault_rupture'
  | 'soil_liquefaction'
  | 'land_subsidence'
  | 'landslide_and_rockfall'
  | 'river_flood'
  | 'flash_flood_surface_water'
  | 'groundwater_inundation'
  | 'drought_and_water_scarcity'
  | 'extreme_heat'
  | 'severe_wind_storm'
  | 'wildfire_and_smoke'
  | 'industrial_soil_contamination'
  | 'ambient_air_pollution';

export type HazardIntensityLevel = 'very_high' | 'high' | 'moderate' | 'low' | 'none_documented';

export type ExposureLevel =
  | 'very_high'
  | 'high'
  | 'moderate'
  | 'low'
  | 'no_documented_exposure'
  | 'insufficient_spatial_resolution'
  | 'unknown';

export type VulnerabilityLevel = 'very_high' | 'high' | 'moderate' | 'low' | 'resilient';

export type OverallRiskClass = 'critical' | 'high' | 'moderate' | 'low' | 'minimal' | 'undetermined';

export interface GeoBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface HazardZoneRecord {
  zoneId: string;
  hazardCategory: HazardCategoryType;
  jurisdiction: string; // e.g. 'IR'
  cityId?: string;
  hoodId?: number;
  boundingBox?: GeoBoundingBox;
  intensityLevel: HazardIntensityLevel;
  recurrenceIntervalYears?: number; // e.g. 50, 100, 475 years
  sourceDatasetName: string;
  sourceAuthorityFa: string;
  effectiveFromIso: string;
  effectiveUntilIso?: string;
  spatialResolution: 'parcel_exact' | 'neighborhood_block' | 'district_grid' | 'regional_coarse';
  isVerified: boolean;
  createdAtIso: string;
}

export interface PropertyExposureAssessment {
  exposureId: string;
  propertyId: string;
  hazardCategory: HazardCategoryType;
  zoneId?: string;
  matchMethod: 'exact_coordinates' | 'neighborhood_centroid' | 'fault_buffer_distance' | 'regional_default';
  exposureLevel: ExposureLevel;
  distanceToHazardSourceMeters?: number;
  sourceDatasetName: string;
  spatialResolution: string;
  confidenceRating: 'high' | 'medium' | 'low';
  assessmentDateIso: string;
  notesFa: string;
}

export interface BuildingVulnerabilityProfile {
  propertyId: string;
  structuralSystem: 'steel_moment_frame' | 'reinforced_concrete' | 'unreinforced_masonry' | 'confined_masonry' | 'unknown';
  constructionYear?: number;
  numberOfFloors: number;
  foundationType?: 'mat_raft' | 'strip_footing' | 'deep_pile' | 'shallow_pad' | 'unknown';
  slopeTopographyAngleDegrees?: number;
  hasBasement: boolean;
  seismicRetrofitCompleted: boolean;
  floodBarriersInstalled: boolean;
  fireResistantEnvelope: boolean;
  vulnerabilityLevel: VulnerabilityLevel;
  sourceProvenance: 'technical_inspection' | 'user_reported' | 'modeled_specification';
  lastUpdatedIso: string;
}

export interface PropertyRiskSynthesisResult {
  riskAssessmentId: string;
  propertyId: string;
  hazardCategory: HazardCategoryType;
  exposureLevel: ExposureLevel;
  vulnerabilityLevel: VulnerabilityLevel;
  overallRiskClass: OverallRiskClass;
  primaryRiskDriversFa: string[];
  missingEvidenceWarnings: string[];
  methodologyVersion: string;
  explanationFa: string;
  disclaimerFa: string;
  calculatedAtIso: string;
}

export interface HistoricalHazardEventRecord {
  eventId: string;
  hazardCategory: HazardCategoryType;
  officialIdentifier?: string;
  nameFa: string;
  eventDateIso: string;
  affectedCityId: string;
  affectedHoodId?: number;
  observedMagnitudeOrIntensity: string; // e.g. "Mw 5.2" or "85 mm/24h"
  impactSummaryFa: string;
  sourceAuthorityFa: string;
  verificationStatus: 'verified_official' | 'historical_archive' | 'unconfirmed_report';
  createdAtIso: string;
}

export interface ResilienceAssessmentRecord {
  assessmentId: string;
  propertyId: string;
  hazardCategory: HazardCategoryType;
  verifiedProtectiveSystems: string[];
  identifiedDeficienciesFa: string[];
  resilienceScorePercent: number; // 0 - 100
  recommendationsFa: string[];
  assessmentDateIso: string;
  reviewerId?: string;
}

export interface MitigationScenarioInput {
  propertyId: string;
  hazardCategory: HazardCategoryType;
  baselineRiskClass: OverallRiskClass;
  proposedInterventionKey:
    | 'seismic_steel_bracing_retrofit'
    | 'automatic_flood_gates_and_valves'
    | 'foundation_micropile_underpinning'
    | 'defensible_space_and_sprinklers'
    | 'high_efficiency_particulate_air_filtration';
  nameFa: string;
  descriptionFa: string;
  indicativeCostEstimate?: number;
}

export interface MitigationScenarioResult {
  scenarioId: string;
  propertyId: string;
  hazardCategory: HazardCategoryType;
  baselineRiskClass: OverallRiskClass;
  projectedRiskClass: OverallRiskClass;
  proposedIntervention: MitigationScenarioInput;
  projectedVulnerabilityImprovement: string;
  implementationPrerequisitesFa: string[];
  disclaimerFa: string;
  modeledAtIso: string;
}

export interface PropertyRiskDomainEvent {
  eventId: string;
  eventType:
    | 'property_risk.hazard_zone.created'
    | 'property_risk.exposure.assessed'
    | 'property_risk.vulnerability.updated'
    | 'property_risk.calculation.completed'
    | 'property_risk.hazard_event.recorded'
    | 'property_risk.resilience.assessed'
    | 'property_risk.mitigation_scenario.created';
  aggregateId: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}

/**
 * Building Energy Efficiency & Sustainability Intelligence Domain Types
 * (`server/modules/building-sustainability/types.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

export type EnergySourceType =
  | 'grid_electricity'
  | 'natural_gas'
  | 'lpg'
  | 'heating_oil'
  | 'district_heating'
  | 'district_cooling'
  | 'biomass'
  | 'on_site_solar_pv'
  | 'on_site_solar_thermal'
  | 'geothermal';

export type EnergyPhysicalUnit = 'kwh' | 'mwh' | 'mj' | 'gj' | 'cubic_meters' | 'liters';

export type MeasurementMethod = 'utility_smart_meter' | 'utility_manual_meter' | 'submeter' | 'utility_bill' | 'user_reported' | 'modeled_estimate';

export type EnergyRatingClass = 'A_plus' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'unrated';

export interface EnergySourceDefinition {
  sourceId: EnergySourceType;
  nameFa: string;
  category: 'fossil_fuel' | 'delivered_grid' | 'on_site_renewable' | 'district_network';
  standardUnit: EnergyPhysicalUnit;
  kwhConversionFactor: number; // Factor to convert 1 standardUnit to kWh
  primaryEnergyFactor: number; // Factor to convert delivered kWh to primary energy
  defaultEmissionsFactorKgCo2PerKwh: number;
}

export interface BuildingEnergyProfile {
  profileId: string;
  propertyId: string;
  buildingNameFa?: string;
  buildingCategory: 'residential_apartment' | 'residential_villa' | 'commercial_office' | 'retail' | 'industrial_warehouse';
  constructionYear?: number;
  grossFloorAreaM2: number;
  conditionedFloorAreaM2: number;
  numberOfFloors?: number;
  numberOfUnits?: number;
  envelopeInsulationRating?: 'poor' | 'moderate' | 'high_performance' | 'passive_house' | 'unknown';
  windowGlazingType?: 'single_pane' | 'double_glazing' | 'triple_glazing_low_e' | 'unknown';
  heatingSystemType?: string;
  coolingSystemType?: string;
  renewableSystemsInstalled: Array<{
    technology: 'solar_pv' | 'solar_thermal' | 'geothermal_heat_pump';
    installedCapacityKw: number;
    installationYear?: number;
  }>;
  dataCompletenessScorePercent: number;
  createdAtIso: string;
  updatedAtIso: string;
  revision: number;
}

export interface EnergyConsumptionRecord {
  recordId: string;
  propertyId: string;
  sourceId: EnergySourceType;
  periodStartIso: string;
  periodEndIso: string;
  rawAmount: number;
  rawUnit: EnergyPhysicalUnit;
  normalizedKwhDelivered: number;
  measurementMethod: MeasurementMethod;
  isEstimated: boolean;
  meterIdentifier?: string;
  sourceNotesFa?: string;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface EnergyUseIntensityResult {
  propertyId: string;
  periodDays: number;
  annualizedTotalDeliveredKwh: number;
  annualizedPrimaryEnergyKwh: number;
  grossFloorAreaM2: number;
  conditionedFloorAreaM2: number;
  siteEuiGrossKwhPerM2Year: number;
  siteEuiConditionedKwhPerM2Year: number;
  primaryEuiKwhPerM2Year: number;
  fuelBreakdownPercentage: Record<string, number>;
  dataConfidenceRating: 'high' | 'medium' | 'low';
  calculatedAtIso: string;
}

export interface CarbonEmissionsAccountingResult {
  calculationId: string;
  propertyId: string;
  periodStartIso: string;
  periodEndIso: string;
  scope1DirectFuelEmissionsKgCo2: number;
  scope2IndirectElectricityEmissionsKgCo2: number;
  totalOperationalEmissionsKgCo2: number;
  emissionsIntensityKgCo2PerM2Year: number;
  avoidedEmissionsFromRenewablesKgCo2: number;
  emissionsFactorVersion: string;
  calculatedAtIso: string;
}

export interface SolarPhotovoltaicScenarioInput {
  propertyId: string;
  proposedCapacityKwPeak: number;
  annualSolarIrradianceKwhPerM2?: number; // Default e.g. 1750 kWh/m2/year for Tehran
  performanceRatio?: number; // Standard e.g. 0.80
  estimatedSelfConsumptionPercent?: number; // e.g. 70%
  panelTiltDegrees?: number;
  shadingDerateFactor?: number;
}

export interface SolarPhotovoltaicScenarioResult {
  scenarioId: string;
  propertyId: string;
  proposedCapacityKwPeak: number;
  estimatedAnnualGenerationKwh: number;
  estimatedOnSiteSelfConsumptionKwh: number;
  estimatedGridExportKwh: number;
  estimatedAnnualCo2AvoidedKg: number;
  estimatedGridImportReductionPercent: number;
  assumptions: string[];
  disclaimerFa: string;
  calculatedAtIso: string;
}

export interface RetrofitIntervention {
  interventionKey:
    | 'exterior_wall_insulation'
    | 'roof_insulation_upgrade'
    | 'double_triple_glazing_retrofit'
    | 'heat_pump_electrification'
    | 'smart_thermostat_and_zoning'
    | 'led_lighting_upgrade'
    | 'solar_rooftop_pv';
  nameFa: string;
  estimatedEnergyReductionPercent: number;
  indicativeCostPerM2?: number;
  estimatedLifespanYears: number;
}

export interface RetrofitScenarioResult {
  scenarioId: string;
  propertyId: string;
  baselineSiteEuiKwhM2: number;
  selectedInterventions: RetrofitIntervention[];
  projectedSiteEuiKwhM2: number;
  projectedAnnualKwhSaved: number;
  projectedAnnualCo2ReducedKg: number;
  totalEstimatedCapex?: number;
  estimatedPaybackPeriodYears?: number;
  methodologyNotesFa: string;
  calculatedAtIso: string;
}

export interface WaterConsumptionRecord {
  recordId: string;
  propertyId: string;
  periodStartIso: string;
  periodEndIso: string;
  waterConsumptionM3: number;
  normalizedLitersPerDay: number;
  litersPerDayPerM2: number;
  measurementMethod: MeasurementMethod;
  createdAtIso: string;
}

export interface EnergyCertificateReference {
  certificateId: string;
  propertyId: string;
  certificateNumber: string;
  issuingBodyNameFa: string;
  energyRatingClass: EnergyRatingClass;
  assessedEuiKwhPerM2: number;
  issueDateIso: string;
  expiryDateIso: string;
  verificationStatus: 'user_uploaded' | 'independently_verified' | 'expired';
  createdAtIso: string;
}

export interface SustainabilityBenchmark {
  benchmarkId: string;
  propertyCategory: string;
  jurisdiction: string;
  climateZone: string;
  medianSiteEuiKwhPerM2Year: number;
  topQuartileEuiKwhPerM2Year: number; // Efficient 25% threshold
  medianEmissionsIntensityKgM2Year: number;
  sampleSize: number;
  effectiveYear: number;
  sourceAgencyFa: string;
}

export interface SustainabilityDomainEvent {
  eventId: string;
  eventType:
    | 'building_sustainability.energy_profile.created'
    | 'building_sustainability.energy_profile.updated'
    | 'building_sustainability.consumption.recorded'
    | 'building_sustainability.consumption.corrected'
    | 'building_sustainability.eui.calculated'
    | 'building_sustainability.emissions.calculated'
    | 'building_sustainability.solar_scenario.created'
    | 'building_sustainability.retrofit_scenario.created'
    | 'building_sustainability.certificate.reference_added';
  aggregateId: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}

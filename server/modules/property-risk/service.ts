/**
 * Primary Facade Service for Property Environmental Risk & Resilience Intelligence
 * (`server/modules/property-risk/service.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import { randomUUID } from 'node:crypto';
import {
  GeographySpatialAdapter,
  PropertyDueDiligenceRiskAdapter,
  PropertyRegistryRiskAdapter,
  PropertyRiskEventOutboxPublisher,
  UrbanIntelligenceEnvironmentalAdapter
} from './contracts.js';
import { PropertyRiskRepository } from './repository.js';
import {
  evaluatePropertyResilience,
  modelRiskMitigationScenario
} from './resilienceAndScenarioEngine.js';
import { matchPropertyToHazardZones } from './spatialAndHazardEngine.js';
import {
  BuildingVulnerabilityProfile,
  HazardCategoryType,
  HazardZoneRecord,
  HistoricalHazardEventRecord,
  MitigationScenarioInput,
  MitigationScenarioResult,
  PropertyExposureAssessment,
  PropertyRiskDomainEvent,
  PropertyRiskSynthesisResult,
  ResilienceAssessmentRecord
} from './types.js';
import {
  deriveBuildingVulnerability,
  synthesizePropertyRisk
} from './vulnerabilityAndRiskEngine.js';

export class PropertyRiskService {
  constructor(
    private readonly repository: PropertyRiskRepository,
    private readonly outboxPublisher?: PropertyRiskEventOutboxPublisher,
    private readonly propertyAdapter?: PropertyRegistryRiskAdapter,
    private readonly geographyAdapter?: GeographySpatialAdapter,
    private readonly dueDiligenceAdapter?: PropertyDueDiligenceRiskAdapter,
    private readonly urbanAdapter?: UrbanIntelligenceEnvironmentalAdapter
  ) {}

  private async emitEvent(
    eventType: PropertyRiskDomainEvent['eventType'],
    aggregateId: string,
    actorUserId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.outboxPublisher) return;
    const event: PropertyRiskDomainEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateId,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString()
    };
    await this.outboxPublisher.publish(event);
  }

  // --- 1. Hazard Zones ---

  async registerHazardZone(
    input: Omit<HazardZoneRecord, 'createdAtIso'>
  ): Promise<HazardZoneRecord> {
    const zone: HazardZoneRecord = {
      ...input,
      createdAtIso: new Date().toISOString()
    };
    await this.repository.saveHazardZone(zone);
    await this.emitEvent('property_risk.hazard_zone.created', zone.zoneId, undefined, { zone });
    return zone;
  }

  async getHazardZone(zoneId: string): Promise<HazardZoneRecord | null> {
    return this.repository.findHazardZoneById(zoneId);
  }

  async listHazardZones(category?: HazardCategoryType, jurisdiction?: string): Promise<HazardZoneRecord[]> {
    return this.repository.listHazardZones(category, jurisdiction);
  }

  // --- 2. Property Exposure Assessment ---

  async assessPropertyExposure(params: {
    propertyId: string;
    hazardCategory: HazardCategoryType;
    coordinates?: { lat: number; lng: number };
    cityId?: string;
    hoodId?: number;
  }): Promise<PropertyExposureAssessment> {
    let coords = params.coordinates;
    let cityId = params.cityId;
    let hoodId = params.hoodId;

    if (this.propertyAdapter) {
      const exists = await this.propertyAdapter.verifyPropertyExists(params.propertyId);
      if (!exists) {
        throw new Error(`ملک با شناسه ${params.propertyId} در سامانه یافت نشد.`);
      }

      if (!coords) {
        const c = await this.propertyAdapter.getPropertyCoordinates(params.propertyId);
        if (c) coords = c;
      }
      if (!cityId) {
        const loc = await this.propertyAdapter.getPropertyLocation(params.propertyId);
        if (loc) {
          cityId = loc.cityId;
          hoodId = loc.hoodId;
        }
      }
    }

    let nearestFaultDist: number | undefined;
    if (params.hazardCategory === 'surface_fault_rupture' && coords && this.geographyAdapter) {
      const dist = await this.geographyAdapter.getDistanceToNearestActiveFaultMeters(coords.lat, coords.lng);
      if (dist !== null) nearestFaultDist = dist;
    }

    const availableZones = await this.repository.listHazardZones(params.hazardCategory);

    const exposure = matchPropertyToHazardZones({
      propertyId: params.propertyId,
      category: params.hazardCategory,
      coordinates: coords,
      cityId,
      hoodId,
      availableZones,
      nearestFaultDistanceMeters: nearestFaultDist
    });

    await this.repository.saveExposure(exposure);
    await this.emitEvent('property_risk.exposure.assessed', exposure.exposureId, undefined, { exposure });
    return exposure;
  }

  async getPropertyExposures(propertyId: string): Promise<PropertyExposureAssessment[]> {
    return this.repository.listExposuresByProperty(propertyId);
  }

  // --- 3. Vulnerability Profile ---

  async setBuildingVulnerability(
    profileInput: Omit<BuildingVulnerabilityProfile, 'lastUpdatedIso' | 'vulnerabilityLevel'> & {
      vulnerabilityLevel?: BuildingVulnerabilityProfile['vulnerabilityLevel'];
    }
  ): Promise<BuildingVulnerabilityProfile> {
    let vulnerabilityLevel = profileInput.vulnerabilityLevel;
    if (!vulnerabilityLevel) {
      const derived = deriveBuildingVulnerability('earthquake_shaking', profileInput);
      vulnerabilityLevel = derived.vulnerabilityLevel;
    }

    const profile: BuildingVulnerabilityProfile = {
      ...profileInput,
      vulnerabilityLevel,
      lastUpdatedIso: new Date().toISOString()
    };

    await this.repository.saveVulnerability(profile);
    await this.emitEvent('property_risk.vulnerability.updated', profile.propertyId, undefined, { profile });
    return profile;
  }

  async getBuildingVulnerability(propertyId: string): Promise<BuildingVulnerabilityProfile | null> {
    return this.repository.findVulnerabilityByProperty(propertyId);
  }

  // --- 4. Risk Synthesis Matrix ---

  async synthesizeRisk(
    propertyId: string,
    hazardCategory: HazardCategoryType
  ): Promise<PropertyRiskSynthesisResult> {
    // 1. Get or evaluate exposure
    let exposure = await this.repository.findLatestExposure(propertyId, hazardCategory);
    if (!exposure) {
      exposure = await this.assessPropertyExposure({ propertyId, hazardCategory });
    }

    // 2. Get or derive building vulnerability
    let vulnProfile = await this.repository.findVulnerabilityByProperty(propertyId);
    let vulnLevel = vulnProfile?.vulnerabilityLevel;
    let drivers: string[] = [];
    let warnings: string[] = [];

    if (vulnProfile) {
      const derived = deriveBuildingVulnerability(hazardCategory, vulnProfile);
      vulnLevel = derived.vulnerabilityLevel;
      drivers = derived.primaryVulnerabilityDriversFa;
      warnings = derived.missingEvidenceWarnings;
    } else {
      vulnLevel = 'moderate';
      warnings.push('شناسنامه آسیب‌پذیری کالبدی ساختمان ثبت نشده است؛ ارزیابی بر مبنای فرضیات پیش‌فرض صورت گرفت.');
    }

    const result = synthesizePropertyRisk(
      propertyId,
      hazardCategory,
      exposure.exposureLevel,
      vulnLevel,
      drivers,
      warnings
    );

    await this.repository.saveRiskResult(result);
    await this.emitEvent('property_risk.calculation.completed', result.riskAssessmentId, undefined, { result });
    return result;
  }

  async getLatestRiskResult(
    propertyId: string,
    hazardCategory: HazardCategoryType
  ): Promise<PropertyRiskSynthesisResult | null> {
    return this.repository.findLatestRiskResult(propertyId, hazardCategory);
  }

  // --- 5. Historical Hazard Events ---

  async recordHistoricalEvent(
    input: Omit<HistoricalHazardEventRecord, 'createdAtIso'>
  ): Promise<HistoricalHazardEventRecord> {
    const event: HistoricalHazardEventRecord = {
      ...input,
      createdAtIso: new Date().toISOString()
    };
    await this.repository.saveHistoricalEvent(event);
    await this.emitEvent('property_risk.hazard_event.recorded', event.eventId, undefined, { event });
    return event;
  }

  async listHistoricalEvents(cityId?: string, category?: HazardCategoryType): Promise<HistoricalHazardEventRecord[]> {
    return this.repository.listHistoricalEvents(cityId, category);
  }

  // --- 6. Resilience & Mitigation Scenarios ---

  async assessResilience(params: {
    propertyId: string;
    hazardCategory: HazardCategoryType;
    verifiedProtectiveSystems: string[];
    reviewerId?: string;
  }): Promise<ResilienceAssessmentRecord> {
    const assessment = evaluatePropertyResilience(params);
    await this.repository.saveResilienceAssessment(assessment);
    await this.emitEvent('property_risk.resilience.assessed', assessment.assessmentId, undefined, { assessment });
    return assessment;
  }

  async modelMitigation(input: MitigationScenarioInput): Promise<MitigationScenarioResult> {
    const scenario = modelRiskMitigationScenario(input);
    await this.repository.saveMitigationScenario(scenario);
    await this.emitEvent('property_risk.mitigation_scenario.created', scenario.scenarioId, undefined, { scenario });
    return scenario;
  }
}

/**
 * Property Risk Repository & In-Memory Persistence
 * (`server/modules/property-risk/repository.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import {
  BuildingVulnerabilityProfile,
  HazardCategoryType,
  HazardZoneRecord,
  HistoricalHazardEventRecord,
  MitigationScenarioResult,
  PropertyExposureAssessment,
  PropertyRiskSynthesisResult,
  ResilienceAssessmentRecord
} from './types.js';

export interface PropertyRiskRepository {
  saveHazardZone(zone: HazardZoneRecord): Promise<void>;
  findHazardZoneById(zoneId: string): Promise<HazardZoneRecord | null>;
  listHazardZones(category?: HazardCategoryType, jurisdiction?: string): Promise<HazardZoneRecord[]>;

  saveExposure(exposure: PropertyExposureAssessment): Promise<void>;
  listExposuresByProperty(propertyId: string): Promise<PropertyExposureAssessment[]>;
  findLatestExposure(propertyId: string, category: HazardCategoryType): Promise<PropertyExposureAssessment | null>;

  saveVulnerability(profile: BuildingVulnerabilityProfile): Promise<void>;
  findVulnerabilityByProperty(propertyId: string): Promise<BuildingVulnerabilityProfile | null>;

  saveRiskResult(result: PropertyRiskSynthesisResult): Promise<void>;
  findLatestRiskResult(propertyId: string, category: HazardCategoryType): Promise<PropertyRiskSynthesisResult | null>;

  saveHistoricalEvent(event: HistoricalHazardEventRecord): Promise<void>;
  listHistoricalEvents(cityId?: string, category?: HazardCategoryType): Promise<HistoricalHazardEventRecord[]>;

  saveResilienceAssessment(assessment: ResilienceAssessmentRecord): Promise<void>;
  findResilienceAssessment(propertyId: string, category: HazardCategoryType): Promise<ResilienceAssessmentRecord | null>;

  saveMitigationScenario(scenario: MitigationScenarioResult): Promise<void>;
  findMitigationScenarioById(scenarioId: string): Promise<MitigationScenarioResult | null>;
}

export class InMemoryPropertyRiskRepository implements PropertyRiskRepository {
  private hazardZones: Map<string, HazardZoneRecord> = new Map();
  private exposures: Map<string, PropertyExposureAssessment> = new Map();
  private vulnerabilities: Map<string, BuildingVulnerabilityProfile> = new Map();
  private riskResults: Map<string, PropertyRiskSynthesisResult> = new Map();
  private historicalEvents: Map<string, HistoricalHazardEventRecord> = new Map();
  private resilienceAssessments: Map<string, ResilienceAssessmentRecord> = new Map();
  private mitigationScenarios: Map<string, MitigationScenarioResult> = new Map();

  async saveHazardZone(zone: HazardZoneRecord): Promise<void> {
    this.hazardZones.set(zone.zoneId, JSON.parse(JSON.stringify(zone)));
  }

  async findHazardZoneById(zoneId: string): Promise<HazardZoneRecord | null> {
    const z = this.hazardZones.get(zoneId);
    if (!z) return null;
    return JSON.parse(JSON.stringify(z));
  }

  async listHazardZones(category?: HazardCategoryType, jurisdiction?: string): Promise<HazardZoneRecord[]> {
    let list = Array.from(this.hazardZones.values());
    if (category) {
      list = list.filter(z => z.hazardCategory === category);
    }
    if (jurisdiction) {
      list = list.filter(z => z.jurisdiction === jurisdiction);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async saveExposure(exposure: PropertyExposureAssessment): Promise<void> {
    const key = `${exposure.propertyId}__${exposure.hazardCategory}__${exposure.exposureId}`;
    this.exposures.set(key, JSON.parse(JSON.stringify(exposure)));
  }

  async listExposuresByProperty(propertyId: string): Promise<PropertyExposureAssessment[]> {
    const list = Array.from(this.exposures.values()).filter(e => e.propertyId === propertyId);
    return JSON.parse(JSON.stringify(list));
  }

  async findLatestExposure(
    propertyId: string,
    category: HazardCategoryType
  ): Promise<PropertyExposureAssessment | null> {
    const list = Array.from(this.exposures.values())
      .filter(e => e.propertyId === propertyId && e.hazardCategory === category)
      .sort((a, b) => new Date(b.assessmentDateIso).getTime() - new Date(a.assessmentDateIso).getTime());

    if (list.length === 0) return null;
    return JSON.parse(JSON.stringify(list[0]));
  }

  async saveVulnerability(profile: BuildingVulnerabilityProfile): Promise<void> {
    this.vulnerabilities.set(profile.propertyId, JSON.parse(JSON.stringify(profile)));
  }

  async findVulnerabilityByProperty(propertyId: string): Promise<BuildingVulnerabilityProfile | null> {
    const v = this.vulnerabilities.get(propertyId);
    if (!v) return null;
    return JSON.parse(JSON.stringify(v));
  }

  async saveRiskResult(result: PropertyRiskSynthesisResult): Promise<void> {
    const key = `${result.propertyId}__${result.hazardCategory}`;
    this.riskResults.set(key, JSON.parse(JSON.stringify(result)));
  }

  async findLatestRiskResult(
    propertyId: string,
    category: HazardCategoryType
  ): Promise<PropertyRiskSynthesisResult | null> {
    const key = `${propertyId}__${category}`;
    const r = this.riskResults.get(key);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r));
  }

  async saveHistoricalEvent(event: HistoricalHazardEventRecord): Promise<void> {
    this.historicalEvents.set(event.eventId, JSON.parse(JSON.stringify(event)));
  }

  async listHistoricalEvents(cityId?: string, category?: HazardCategoryType): Promise<HistoricalHazardEventRecord[]> {
    let list = Array.from(this.historicalEvents.values());
    if (cityId) {
      list = list.filter(e => e.affectedCityId === cityId);
    }
    if (category) {
      list = list.filter(e => e.hazardCategory === category);
    }
    return list.sort((a, b) => new Date(b.eventDateIso).getTime() - new Date(a.eventDateIso).getTime());
  }

  async saveResilienceAssessment(assessment: ResilienceAssessmentRecord): Promise<void> {
    const key = `${assessment.propertyId}__${assessment.hazardCategory}`;
    this.resilienceAssessments.set(key, JSON.parse(JSON.stringify(assessment)));
  }

  async findResilienceAssessment(
    propertyId: string,
    category: HazardCategoryType
  ): Promise<ResilienceAssessmentRecord | null> {
    const key = `${propertyId}__${category}`;
    const a = this.resilienceAssessments.get(key);
    if (!a) return null;
    return JSON.parse(JSON.stringify(a));
  }

  async saveMitigationScenario(scenario: MitigationScenarioResult): Promise<void> {
    this.mitigationScenarios.set(scenario.scenarioId, JSON.parse(JSON.stringify(scenario)));
  }

  async findMitigationScenarioById(scenarioId: string): Promise<MitigationScenarioResult | null> {
    const s = this.mitigationScenarios.get(scenarioId);
    if (!s) return null;
    return JSON.parse(JSON.stringify(s));
  }

  clear(): void {
    this.hazardZones.clear();
    this.exposures.clear();
    this.vulnerabilities.clear();
    this.riskResults.clear();
    this.historicalEvents.clear();
    this.resilienceAssessments.clear();
    this.mitigationScenarios.clear();
  }
}

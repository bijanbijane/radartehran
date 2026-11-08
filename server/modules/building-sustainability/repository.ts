/**
 * Building Sustainability Repository & In-Memory Persistence
 * (`server/modules/building-sustainability/repository.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import {
  BuildingEnergyProfile,
  CarbonEmissionsAccountingResult,
  EnergyCertificateReference,
  EnergyConsumptionRecord,
  EnergyUseIntensityResult,
  RetrofitScenarioResult,
  SolarPhotovoltaicScenarioResult,
  SustainabilityBenchmark,
  WaterConsumptionRecord
} from './types.js';

export interface BuildingSustainabilityRepository {
  saveProfile(profile: BuildingEnergyProfile): Promise<void>;
  findProfileByPropertyId(propertyId: string): Promise<BuildingEnergyProfile | null>;

  saveConsumptionRecord(record: EnergyConsumptionRecord): Promise<void>;
  listConsumptionRecords(propertyId: string): Promise<EnergyConsumptionRecord[]>;
  findConsumptionOverlaps(
    propertyId: string,
    sourceId: string,
    startIso: string,
    endIso: string,
    excludeRecordId?: string
  ): Promise<EnergyConsumptionRecord[]>;

  saveEuiResult(result: EnergyUseIntensityResult): Promise<void>;
  findLatestEui(propertyId: string): Promise<EnergyUseIntensityResult | null>;

  saveEmissionsResult(result: CarbonEmissionsAccountingResult): Promise<void>;
  findLatestEmissions(propertyId: string): Promise<CarbonEmissionsAccountingResult | null>;

  saveSolarScenario(scenario: SolarPhotovoltaicScenarioResult): Promise<void>;
  findSolarScenarioById(scenarioId: string): Promise<SolarPhotovoltaicScenarioResult | null>;

  saveRetrofitScenario(scenario: RetrofitScenarioResult): Promise<void>;
  findRetrofitScenarioById(scenarioId: string): Promise<RetrofitScenarioResult | null>;

  saveWaterRecord(record: WaterConsumptionRecord): Promise<void>;
  listWaterRecords(propertyId: string): Promise<WaterConsumptionRecord[]>;

  saveCertificate(cert: EnergyCertificateReference): Promise<void>;
  findCertificateByPropertyId(propertyId: string): Promise<EnergyCertificateReference | null>;

  saveBenchmark(bench: SustainabilityBenchmark): Promise<void>;
  findBenchmark(propertyCategory: string, jurisdiction: string, climateZone: string): Promise<SustainabilityBenchmark | null>;
}

export class InMemoryBuildingSustainabilityRepository implements BuildingSustainabilityRepository {
  private profiles: Map<string, BuildingEnergyProfile> = new Map();
  private consumptionRecords: Map<string, EnergyConsumptionRecord> = new Map();
  private euiResults: Map<string, EnergyUseIntensityResult> = new Map();
  private emissionsResults: Map<string, CarbonEmissionsAccountingResult> = new Map();
  private solarScenarios: Map<string, SolarPhotovoltaicScenarioResult> = new Map();
  private retrofitScenarios: Map<string, RetrofitScenarioResult> = new Map();
  private waterRecords: Map<string, WaterConsumptionRecord> = new Map();
  private certificates: Map<string, EnergyCertificateReference> = new Map();
  private benchmarks: Map<string, SustainabilityBenchmark> = new Map();

  async saveProfile(profile: BuildingEnergyProfile): Promise<void> {
    const existing = this.profiles.get(profile.propertyId);
    if (existing) {
      if (profile.revision !== existing.revision + 1) {
        throw new Error(
          `خطای همزمانی مشخصات انرژی ساختمان (Concurrency Conflict): نسخه ارسالی (${profile.revision}) معتبر نیست.`
        );
      }
    } else {
      if (profile.revision !== 1) {
        throw new Error('نسخه رکورد جدید مشخصات انرژی باید ۱ باشد.');
      }
    }
    this.profiles.set(profile.propertyId, JSON.parse(JSON.stringify(profile)));
  }

  async findProfileByPropertyId(propertyId: string): Promise<BuildingEnergyProfile | null> {
    const p = this.profiles.get(propertyId);
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async saveConsumptionRecord(record: EnergyConsumptionRecord): Promise<void> {
    const existing = this.consumptionRecords.get(record.recordId);
    if (existing) {
      if (record.version <= existing.version) {
        throw new Error(
          `خطای ویرایش رکورد مصرف: نسخه تصحیح (${record.version}) باید بزرگ‌تر از نسخه فعلی (${existing.version}) باشد.`
        );
      }
    }
    this.consumptionRecords.set(record.recordId, JSON.parse(JSON.stringify(record)));
  }

  async listConsumptionRecords(propertyId: string): Promise<EnergyConsumptionRecord[]> {
    const list = Array.from(this.consumptionRecords.values()).filter(r => r.propertyId === propertyId);
    return list.sort((a, b) => new Date(a.periodStartIso).getTime() - new Date(b.periodStartIso).getTime());
  }

  async findConsumptionOverlaps(
    propertyId: string,
    sourceId: string,
    startIso: string,
    endIso: string,
    excludeRecordId?: string
  ): Promise<EnergyConsumptionRecord[]> {
    const newStart = new Date(startIso).getTime();
    const newEnd = new Date(endIso).getTime();
    const overlaps: EnergyConsumptionRecord[] = [];

    for (const rec of this.consumptionRecords.values()) {
      if (rec.propertyId !== propertyId || rec.sourceId !== sourceId) continue;
      if (excludeRecordId && rec.recordId === excludeRecordId) continue;

      const recStart = new Date(rec.periodStartIso).getTime();
      const recEnd = new Date(rec.periodEndIso).getTime();

      // Intersect check
      if (newStart < recEnd && newEnd > recStart) {
        overlaps.push(JSON.parse(JSON.stringify(rec)));
      }
    }

    return overlaps;
  }

  async saveEuiResult(result: EnergyUseIntensityResult): Promise<void> {
    this.euiResults.set(result.propertyId, JSON.parse(JSON.stringify(result)));
  }

  async findLatestEui(propertyId: string): Promise<EnergyUseIntensityResult | null> {
    const r = this.euiResults.get(propertyId);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r));
  }

  async saveEmissionsResult(result: CarbonEmissionsAccountingResult): Promise<void> {
    this.emissionsResults.set(result.propertyId, JSON.parse(JSON.stringify(result)));
  }

  async findLatestEmissions(propertyId: string): Promise<CarbonEmissionsAccountingResult | null> {
    const r = this.emissionsResults.get(propertyId);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r));
  }

  async saveSolarScenario(scenario: SolarPhotovoltaicScenarioResult): Promise<void> {
    this.solarScenarios.set(scenario.scenarioId, JSON.parse(JSON.stringify(scenario)));
  }

  async findSolarScenarioById(scenarioId: string): Promise<SolarPhotovoltaicScenarioResult | null> {
    const s = this.solarScenarios.get(scenarioId);
    if (!s) return null;
    return JSON.parse(JSON.stringify(s));
  }

  async saveRetrofitScenario(scenario: RetrofitScenarioResult): Promise<void> {
    this.retrofitScenarios.set(scenario.scenarioId, JSON.parse(JSON.stringify(scenario)));
  }

  async findRetrofitScenarioById(scenarioId: string): Promise<RetrofitScenarioResult | null> {
    const s = this.retrofitScenarios.get(scenarioId);
    if (!s) return null;
    return JSON.parse(JSON.stringify(s));
  }

  async saveWaterRecord(record: WaterConsumptionRecord): Promise<void> {
    this.waterRecords.set(record.recordId, JSON.parse(JSON.stringify(record)));
  }

  async listWaterRecords(propertyId: string): Promise<WaterConsumptionRecord[]> {
    const list = Array.from(this.waterRecords.values()).filter(r => r.propertyId === propertyId);
    return list.sort((a, b) => new Date(a.periodStartIso).getTime() - new Date(b.periodStartIso).getTime());
  }

  async saveCertificate(cert: EnergyCertificateReference): Promise<void> {
    this.certificates.set(cert.propertyId, JSON.parse(JSON.stringify(cert)));
  }

  async findCertificateByPropertyId(propertyId: string): Promise<EnergyCertificateReference | null> {
    const c = this.certificates.get(propertyId);
    if (!c) return null;
    return JSON.parse(JSON.stringify(c));
  }

  async saveBenchmark(bench: SustainabilityBenchmark): Promise<void> {
    const key = `${bench.propertyCategory}__${bench.jurisdiction}__${bench.climateZone}`;
    this.benchmarks.set(key, JSON.parse(JSON.stringify(bench)));
  }

  async findBenchmark(
    propertyCategory: string,
    jurisdiction: string,
    climateZone: string
  ): Promise<SustainabilityBenchmark | null> {
    const key = `${propertyCategory}__${jurisdiction}__${climateZone}`;
    const b = this.benchmarks.get(key);
    if (!b) return null;
    return JSON.parse(JSON.stringify(b));
  }

  clear(): void {
    this.profiles.clear();
    this.consumptionRecords.clear();
    this.euiResults.clear();
    this.emissionsResults.clear();
    this.solarScenarios.clear();
    this.retrofitScenarios.clear();
    this.waterRecords.clear();
    this.certificates.clear();
    this.benchmarks.clear();
  }
}

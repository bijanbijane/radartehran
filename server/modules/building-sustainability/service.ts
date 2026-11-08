/**
 * Primary Facade Service for Building Energy Efficiency & Sustainability Intelligence
 * (`server/modules/building-sustainability/service.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import { randomUUID } from 'node:crypto';
import {
  calculateOperationalEmissions,
  calculateSolarPhotovoltaicScenario,
  calculateWaterMetrics
} from './carbonAndSolarEngine.js';
import {
  GeographyClimateContextAdapter,
  PropertyDueDiligenceSustainabilityAdapter,
  PropertyRegistryReferenceAdapter,
  SustainabilityEventOutboxPublisher
} from './contracts.js';
import {
  evaluateSustainabilityBenchmark,
  modelBuildingRetrofit
} from './retrofitAndBenchmarkEngine.js';
import { BuildingSustainabilityRepository } from './repository.js';
import {
  BuildingEnergyProfile,
  CarbonEmissionsAccountingResult,
  EnergyCertificateReference,
  EnergyConsumptionRecord,
  EnergyPhysicalUnit,
  EnergySourceType,
  EnergyUseIntensityResult,
  MeasurementMethod,
  RetrofitIntervention,
  RetrofitScenarioResult,
  SolarPhotovoltaicScenarioInput,
  SolarPhotovoltaicScenarioResult,
  SustainabilityBenchmark,
  SustainabilityDomainEvent,
  WaterConsumptionRecord
} from './types.js';
import {
  calculateBuildingEui,
  normalizeToDeliveredKwh
} from './unitConversionAndEui.js';

export class BuildingSustainabilityService {
  constructor(
    private readonly repository: BuildingSustainabilityRepository,
    private readonly outboxPublisher?: SustainabilityEventOutboxPublisher,
    private readonly propertyAdapter?: PropertyRegistryReferenceAdapter,
    private readonly dueDiligenceAdapter?: PropertyDueDiligenceSustainabilityAdapter,
    private readonly climateAdapter?: GeographyClimateContextAdapter
  ) {}

  private async emitEvent(
    eventType: SustainabilityDomainEvent['eventType'],
    aggregateId: string,
    actorUserId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.outboxPublisher) return;
    const event: SustainabilityDomainEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateId,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString()
    };
    await this.outboxPublisher.publish(event);
  }

  // --- 1. Building Energy Profiles ---

  async createProfile(input: {
    propertyId: string;
    buildingNameFa?: string;
    buildingCategory: BuildingEnergyProfile['buildingCategory'];
    constructionYear?: number;
    grossFloorAreaM2: number;
    conditionedFloorAreaM2?: number;
    numberOfFloors?: number;
    numberOfUnits?: number;
    envelopeInsulationRating?: BuildingEnergyProfile['envelopeInsulationRating'];
    windowGlazingType?: BuildingEnergyProfile['windowGlazingType'];
    heatingSystemType?: string;
    coolingSystemType?: string;
    renewableSystemsInstalled?: BuildingEnergyProfile['renewableSystemsInstalled'];
  }): Promise<BuildingEnergyProfile> {
    if (this.propertyAdapter) {
      const exists = await this.propertyAdapter.verifyPropertyExists(input.propertyId);
      if (!exists) {
        throw new Error(`ملک با شناسه ${input.propertyId} در سامانه یافت نشد.`);
      }
    }

    if (input.grossFloorAreaM2 <= 0) {
      throw new Error('مساحت زیربنای کل ساختمان باید بزرگ‌تر از صفر باشد.');
    }

    const nowIso = new Date().toISOString();
    const conditionedArea = input.conditionedFloorAreaM2 ?? input.grossFloorAreaM2;

    let completeness = 40;
    if (input.constructionYear) completeness += 15;
    if (input.envelopeInsulationRating && input.envelopeInsulationRating !== 'unknown') completeness += 15;
    if (input.windowGlazingType && input.windowGlazingType !== 'unknown') completeness += 15;
    if (input.heatingSystemType && input.coolingSystemType) completeness += 15;

    const profile: BuildingEnergyProfile = {
      profileId: randomUUID(),
      propertyId: input.propertyId,
      buildingNameFa: input.buildingNameFa,
      buildingCategory: input.buildingCategory,
      constructionYear: input.constructionYear,
      grossFloorAreaM2: input.grossFloorAreaM2,
      conditionedFloorAreaM2: conditionedArea,
      numberOfFloors: input.numberOfFloors,
      numberOfUnits: input.numberOfUnits,
      envelopeInsulationRating: input.envelopeInsulationRating ?? 'unknown',
      windowGlazingType: input.windowGlazingType ?? 'unknown',
      heatingSystemType: input.heatingSystemType,
      coolingSystemType: input.coolingSystemType,
      renewableSystemsInstalled: input.renewableSystemsInstalled ?? [],
      dataCompletenessScorePercent: Math.min(100, completeness),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      revision: 1
    };

    await this.repository.saveProfile(profile);
    await this.emitEvent('building_sustainability.energy_profile.created', profile.propertyId, undefined, { profile });
    return profile;
  }

  async getProfile(propertyId: string): Promise<BuildingEnergyProfile | null> {
    return this.repository.findProfileByPropertyId(propertyId);
  }

  // --- 2. Energy Consumption Records ---

  async recordConsumption(input: {
    propertyId: string;
    sourceId: EnergySourceType;
    periodStartIso: string;
    periodEndIso: string;
    rawAmount: number;
    rawUnit: EnergyPhysicalUnit;
    measurementMethod?: MeasurementMethod;
    isEstimated?: boolean;
    meterIdentifier?: string;
    sourceNotesFa?: string;
  }): Promise<EnergyConsumptionRecord> {
    const start = new Date(input.periodStartIso).getTime();
    const end = new Date(input.periodEndIso).getTime();
    if (start >= end) {
      throw new Error('تاریخ شروع بازه مصرف باید پیش از تاریخ پایان باشد.');
    }

    // Overlap validation
    const overlaps = await this.repository.findConsumptionOverlaps(
      input.propertyId,
      input.sourceId,
      input.periodStartIso,
      input.periodEndIso
    );
    if (overlaps.length > 0) {
      throw new Error(
        `تداخل در بازه زمانی مصرف برای منبع ${input.sourceId}: با رکورد قبلی (${overlaps[0].periodStartIso} الی ${overlaps[0].periodEndIso}) همپوشانی دارد.`
      );
    }

    const normalizedKwh = normalizeToDeliveredKwh(input.rawAmount, input.rawUnit, input.sourceId);
    const nowIso = new Date().toISOString();

    const record: EnergyConsumptionRecord = {
      recordId: randomUUID(),
      propertyId: input.propertyId,
      sourceId: input.sourceId,
      periodStartIso: input.periodStartIso,
      periodEndIso: input.periodEndIso,
      rawAmount: input.rawAmount,
      rawUnit: input.rawUnit,
      normalizedKwhDelivered: normalizedKwh,
      measurementMethod: input.measurementMethod ?? 'utility_bill',
      isEstimated: input.isEstimated ?? false,
      meterIdentifier: input.meterIdentifier,
      sourceNotesFa: input.sourceNotesFa,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    await this.repository.saveConsumptionRecord(record);
    await this.emitEvent('building_sustainability.consumption.recorded', record.recordId, undefined, { record });
    return record;
  }

  async getConsumptionHistory(propertyId: string): Promise<EnergyConsumptionRecord[]> {
    return this.repository.listConsumptionRecords(propertyId);
  }

  // --- 3. EUI & Carbon Accounting ---

  async calculateEui(propertyId: string): Promise<EnergyUseIntensityResult> {
    const profile = await this.repository.findProfileByPropertyId(propertyId);
    if (!profile) {
      throw new Error(`پروفایل انرژی برای ملک ${propertyId} یافت نشد.`);
    }

    const records = await this.repository.listConsumptionRecords(propertyId);
    const result = calculateBuildingEui(profile, records);
    await this.repository.saveEuiResult(result);
    await this.emitEvent('building_sustainability.eui.calculated', propertyId, undefined, { result });
    return result;
  }

  async calculateEmissions(propertyId: string): Promise<CarbonEmissionsAccountingResult> {
    const profile = await this.repository.findProfileByPropertyId(propertyId);
    if (!profile) {
      throw new Error(`پروفایل انرژی برای ملک ${propertyId} یافت نشد.`);
    }

    const records = await this.repository.listConsumptionRecords(propertyId);
    const result = calculateOperationalEmissions(propertyId, records, profile.grossFloorAreaM2);
    await this.repository.saveEmissionsResult(result);
    await this.emitEvent('building_sustainability.emissions.calculated', propertyId, undefined, { result });
    return result;
  }

  // --- 4. Solar Scenarios ---

  async modelSolarPv(input: SolarPhotovoltaicScenarioInput): Promise<SolarPhotovoltaicScenarioResult> {
    const scenario = calculateSolarPhotovoltaicScenario(input);
    await this.repository.saveSolarScenario(scenario);
    await this.emitEvent('building_sustainability.solar_scenario.created', scenario.scenarioId, undefined, { scenario });
    return scenario;
  }

  // --- 5. Retrofit Scenarios ---

  async modelRetrofit(params: {
    propertyId: string;
    interventions: RetrofitIntervention[];
    blendedEnergyCostPerKwh?: number;
  }): Promise<RetrofitScenarioResult> {
    const profile = await this.repository.findProfileByPropertyId(params.propertyId);
    if (!profile) {
      throw new Error(`پروفایل انرژی برای ملک ${params.propertyId} یافت نشد.`);
    }

    let baselineEui = 180; // Standard default fallback
    const latestEui = await this.repository.findLatestEui(params.propertyId);
    if (latestEui) {
      baselineEui = latestEui.siteEuiGrossKwhPerM2Year;
    }

    const scenario = modelBuildingRetrofit({
      propertyId: params.propertyId,
      baselineSiteEuiKwhM2: baselineEui,
      grossFloorAreaM2: profile.grossFloorAreaM2,
      interventions: params.interventions,
      blendedEnergyCostPerKwh: params.blendedEnergyCostPerKwh
    });

    await this.repository.saveRetrofitScenario(scenario);
    await this.emitEvent('building_sustainability.retrofit_scenario.created', scenario.scenarioId, undefined, { scenario });
    return scenario;
  }

  // --- 6. Water Efficiency ---

  async recordWater(params: {
    propertyId: string;
    waterConsumptionM3: number;
    periodStartIso: string;
    periodEndIso: string;
  }): Promise<WaterConsumptionRecord> {
    const profile = await this.repository.findProfileByPropertyId(params.propertyId);
    const area = profile ? profile.grossFloorAreaM2 : 0;

    const record = calculateWaterMetrics({
      propertyId: params.propertyId,
      waterConsumptionM3: params.waterConsumptionM3,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
      grossFloorAreaM2: area
    });

    await this.repository.saveWaterRecord(record);
    return record;
  }

  async getWaterHistory(propertyId: string): Promise<WaterConsumptionRecord[]> {
    return this.repository.listWaterRecords(propertyId);
  }

  // --- 7. Certificates & Benchmarks ---

  async registerCertificate(cert: EnergyCertificateReference): Promise<void> {
    await this.repository.saveCertificate(cert);
    await this.emitEvent('building_sustainability.certificate.reference_added', cert.certificateId, undefined, { cert });
  }

  async getCertificate(propertyId: string): Promise<EnergyCertificateReference | null> {
    return this.repository.findCertificateByPropertyId(propertyId);
  }

  async registerBenchmark(bench: SustainabilityBenchmark): Promise<void> {
    await this.repository.saveBenchmark(bench);
  }

  async compareBenchmark(
    propertyId: string,
    jurisdiction: string,
    climateZone: string
  ): Promise<ReturnType<typeof evaluateSustainabilityBenchmark>> {
    const profile = await this.repository.findProfileByPropertyId(propertyId);
    if (!profile) {
      throw new Error(`پروفایل انرژی برای ملک ${propertyId} یافت نشد.`);
    }

    const benchmark = await this.repository.findBenchmark(profile.buildingCategory, jurisdiction, climateZone);
    if (!benchmark) {
      throw new Error(`داده معیار پایداری (Benchmark) برای رده ${profile.buildingCategory} در اقلیم ${climateZone} یافت نشد.`);
    }

    const latestEui = await this.repository.findLatestEui(propertyId);
    const actualEui = latestEui ? latestEui.siteEuiGrossKwhPerM2Year : 0;

    const latestEmissions = await this.repository.findLatestEmissions(propertyId);
    const actualEmissions = latestEmissions ? latestEmissions.emissionsIntensityKgCo2PerM2Year : 0;

    return evaluateSustainabilityBenchmark(actualEui, actualEmissions, benchmark);
  }
}

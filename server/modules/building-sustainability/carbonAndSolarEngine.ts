/**
 * Carbon Accounting, Solar Scenario & Water Efficiency Engine
 * (`server/modules/building-sustainability/carbonAndSolarEngine.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import { randomUUID } from 'node:crypto';
import {
  CarbonEmissionsAccountingResult,
  EnergyConsumptionRecord,
  SolarPhotovoltaicScenarioInput,
  SolarPhotovoltaicScenarioResult,
  WaterConsumptionRecord
} from './types.js';
import { STANDARD_ENERGY_SOURCES } from './unitConversionAndEui.js';

export const EMISSIONS_METHODOLOGY_VERSION = 'GHG-Protocol-Scope1-Scope2-v2.1';

export function calculateOperationalEmissions(
  propertyId: string,
  records: EnergyConsumptionRecord[],
  grossFloorAreaM2: number
): CarbonEmissionsAccountingResult {
  if (records.length === 0) {
    throw new Error('برای محاسبه ردپای کربن، حداقل یک رکورد مصرف انرژی الزامی است.');
  }

  let scope1DirectFuelEmissions = 0;
  let scope2IndirectElectricityEmissions = 0;
  let avoidedEmissionsFromRenewables = 0;

  const minTime = Math.min(...records.map(r => new Date(r.periodStartIso).getTime()));
  const maxTime = Math.max(...records.map(r => new Date(r.periodEndIso).getTime()));
  const periodDays = Math.max(1, Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)));
  const annualFactor = 365 / periodDays;

  for (const rec of records) {
    const kwh = rec.normalizedKwhDelivered;
    const def = STANDARD_ENERGY_SOURCES[rec.sourceId];
    const factor = def ? def.defaultEmissionsFactorKgCo2PerKwh : 0;

    if (rec.sourceId === 'grid_electricity') {
      scope2IndirectElectricityEmissions += kwh * factor;
    } else if (def && def.category === 'fossil_fuel') {
      scope1DirectFuelEmissions += kwh * factor;
    } else if (def && def.category === 'on_site_renewable') {
      // Avoided emissions compared to grid electricity
      const gridFactor = STANDARD_ENERGY_SOURCES.grid_electricity.defaultEmissionsFactorKgCo2PerKwh;
      avoidedEmissionsFromRenewables += kwh * gridFactor;
    }
  }

  // Annualize
  const annualizedScope1 = Math.round(scope1DirectFuelEmissions * annualFactor);
  const annualizedScope2 = Math.round(scope2IndirectElectricityEmissions * annualFactor);
  const totalAnnualOperational = annualizedScope1 + annualizedScope2;
  const avoidedAnnual = Math.round(avoidedEmissionsFromRenewables * annualFactor);

  const emissionsIntensity =
    grossFloorAreaM2 > 0 ? Math.round((totalAnnualOperational / grossFloorAreaM2) * 10) / 10 : 0;

  return {
    calculationId: randomUUID(),
    propertyId,
    periodStartIso: new Date(minTime).toISOString(),
    periodEndIso: new Date(maxTime).toISOString(),
    scope1DirectFuelEmissionsKgCo2: annualizedScope1,
    scope2IndirectElectricityEmissionsKgCo2: annualizedScope2,
    totalOperationalEmissionsKgCo2: totalAnnualOperational,
    emissionsIntensityKgCo2PerM2Year: emissionsIntensity,
    avoidedEmissionsFromRenewablesKgCo2: avoidedAnnual,
    emissionsFactorVersion: EMISSIONS_METHODOLOGY_VERSION,
    calculatedAtIso: new Date().toISOString()
  };
}

export function calculateSolarPhotovoltaicScenario(
  input: SolarPhotovoltaicScenarioInput
): SolarPhotovoltaicScenarioResult {
  if (input.proposedCapacityKwPeak <= 0) {
    throw new Error('ظرفیت پیشنهادی نیروگاه خورشیدی (kWp) باید بزرگ‌تر از صفر باشد.');
  }

  const irradiance = input.annualSolarIrradianceKwhPerM2 ?? 1750; // Tehran / Central plateau standard
  const pr = input.performanceRatio ?? 0.80; // IEC 61724 standard PR
  const derate = input.shadingDerateFactor ?? 0.95; // 5% shading derate
  const selfConsumptionRatio = (input.estimatedSelfConsumptionPercent ?? 70) / 100;

  // Annual Generation (kWh) = Capacity (kWp) * Irradiance (kWh/m2/year) * PR * Derate
  const estimatedAnnualGenerationKwh = Math.round(input.proposedCapacityKwPeak * irradiance * pr * derate);

  const selfConsumedKwh = Math.round(estimatedAnnualGenerationKwh * selfConsumptionRatio);
  const gridExportKwh = Math.round(estimatedAnnualGenerationKwh - selfConsumedKwh);

  const gridEmissionFactor = STANDARD_ENERGY_SOURCES.grid_electricity.defaultEmissionsFactorKgCo2PerKwh;
  const estimatedAnnualCo2AvoidedKg = Math.round(estimatedAnnualGenerationKwh * gridEmissionFactor);

  return {
    scenarioId: randomUUID(),
    propertyId: input.propertyId,
    proposedCapacityKwPeak: input.proposedCapacityKwPeak,
    estimatedAnnualGenerationKwh,
    estimatedOnSiteSelfConsumptionKwh: selfConsumedKwh,
    estimatedGridExportKwh: gridExportKwh,
    estimatedAnnualCo2AvoidedKg,
    estimatedGridImportReductionPercent: Math.round(selfConsumptionRatio * 100),
    assumptions: [
      `تابش سالانه مبنا: ${irradiance} kWh/m²`,
      `ضریب عملکرد سامانه (PR): ${Math.round(pr * 100)}%`,
      `ضریب افت سایه‌اندازی: ${Math.round((1 - derate) * 100)}%`,
      `نرخ خودمصرفی در محل: ${Math.round(selfConsumptionRatio * 100)}%`
    ],
    disclaimerFa:
      'این مدل‌سازی بر اساس محاسبات مهندسی و اطلس تابش خورشیدی بوده و تولید قطعی منوط به زاویه نصب نهایی، وضعیت سایه‌اندازی پیرامونی و تاییدیه فنی اتصال به شبکه توزیع می‌باشد.',
    calculatedAtIso: new Date().toISOString()
  };
}

export function calculateWaterMetrics(params: {
  propertyId: string;
  waterConsumptionM3: number;
  periodStartIso: string;
  periodEndIso: string;
  grossFloorAreaM2: number;
}): WaterConsumptionRecord {
  if (params.waterConsumptionM3 < 0) {
    throw new Error('مصرف آب نمی‌تواند منفی باشد.');
  }

  const start = new Date(params.periodStartIso).getTime();
  const end = new Date(params.periodEndIso).getTime();
  const periodDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

  const totalLiters = params.waterConsumptionM3 * 1000;
  const litersPerDay = Math.round(totalLiters / periodDays);
  const litersPerDayPerM2 =
    params.grossFloorAreaM2 > 0 ? Math.round((litersPerDay / params.grossFloorAreaM2) * 100) / 100 : 0;

  return {
    recordId: randomUUID(),
    propertyId: params.propertyId,
    periodStartIso: params.periodStartIso,
    periodEndIso: params.periodEndIso,
    waterConsumptionM3: params.waterConsumptionM3,
    normalizedLitersPerDay: litersPerDay,
    litersPerDayPerM2,
    measurementMethod: 'utility_bill',
    createdAtIso: new Date().toISOString()
  };
}

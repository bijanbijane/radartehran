/**
 * Physical Energy Unit Normalization & Energy-Use Intensity (EUI) Engine
 * (`server/modules/building-sustainability/unitConversionAndEui.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import {
  BuildingEnergyProfile,
  EnergyConsumptionRecord,
  EnergyPhysicalUnit,
  EnergySourceDefinition,
  EnergySourceType,
  EnergyUseIntensityResult
} from './types.js';

export const STANDARD_ENERGY_SOURCES: Record<EnergySourceType, EnergySourceDefinition> = {
  grid_electricity: {
    sourceId: 'grid_electricity',
    nameFa: 'برق شبکه سراسری',
    category: 'delivered_grid',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 2.5,
    defaultEmissionsFactorKgCo2PerKwh: 0.52
  },
  natural_gas: {
    sourceId: 'natural_gas',
    nameFa: 'گاز طبیعی شهری',
    category: 'fossil_fuel',
    standardUnit: 'cubic_meters',
    kwhConversionFactor: 10.5, // 1 m³ Iranian natural gas ≈ 10.5 kWh GCV
    primaryEnergyFactor: 1.1,
    defaultEmissionsFactorKgCo2PerKwh: 0.19
  },
  lpg: {
    sourceId: 'lpg',
    nameFa: 'گاز مایع (LPG)',
    category: 'fossil_fuel',
    standardUnit: 'liters',
    kwhConversionFactor: 6.9,
    primaryEnergyFactor: 1.1,
    defaultEmissionsFactorKgCo2PerKwh: 0.23
  },
  heating_oil: {
    sourceId: 'heating_oil',
    nameFa: 'نفت گاز / گازوئیل گرمایشی',
    category: 'fossil_fuel',
    standardUnit: 'liters',
    kwhConversionFactor: 10.0,
    primaryEnergyFactor: 1.1,
    defaultEmissionsFactorKgCo2PerKwh: 0.27
  },
  district_heating: {
    sourceId: 'district_heating',
    nameFa: 'حرارت مرکزی منطقه‌ای',
    category: 'district_network',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.3,
    defaultEmissionsFactorKgCo2PerKwh: 0.18
  },
  district_cooling: {
    sourceId: 'district_cooling',
    nameFa: 'برودت منطقه‌ای',
    category: 'district_network',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.5,
    defaultEmissionsFactorKgCo2PerKwh: 0.22
  },
  biomass: {
    sourceId: 'biomass',
    nameFa: 'سوخت زیستی / پلت چوب',
    category: 'fossil_fuel',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.1,
    defaultEmissionsFactorKgCo2PerKwh: 0.05
  },
  on_site_solar_pv: {
    sourceId: 'on_site_solar_pv',
    nameFa: 'برق خورشیدی در محل',
    category: 'on_site_renewable',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.0,
    defaultEmissionsFactorKgCo2PerKwh: 0.0
  },
  on_site_solar_thermal: {
    sourceId: 'on_site_solar_thermal',
    nameFa: 'آبگرمکن خورشیدی در محل',
    category: 'on_site_renewable',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.0,
    defaultEmissionsFactorKgCo2PerKwh: 0.0
  },
  geothermal: {
    sourceId: 'geothermal',
    nameFa: 'زمین‌گرمایی',
    category: 'on_site_renewable',
    standardUnit: 'kwh',
    kwhConversionFactor: 1.0,
    primaryEnergyFactor: 1.0,
    defaultEmissionsFactorKgCo2PerKwh: 0.0
  }
};

export function normalizeToDeliveredKwh(
  amount: number,
  unit: EnergyPhysicalUnit,
  sourceId: EnergySourceType
): number {
  if (amount < 0) {
    throw new Error('مقدار مصرف انرژی نمی‌تواند منفی باشد.');
  }

  const def = STANDARD_ENERGY_SOURCES[sourceId];
  if (!def) {
    throw new Error(`منبع انرژی ناشناخته: ${sourceId}`);
  }

  // Handle unit conversions
  if (unit === 'kwh') {
    return Math.round(amount * 100) / 100;
  }
  if (unit === 'mwh') {
    return Math.round(amount * 1000 * 100) / 100;
  }
  if (unit === 'mj') {
    return Math.round((amount / 3.6) * 100) / 100; // 1 kWh = 3.6 MJ
  }
  if (unit === 'gj') {
    return Math.round(((amount * 1000) / 3.6) * 100) / 100;
  }

  // Unit matches standard unit of source (e.g. cubic meters of natural gas, liters of fuel)
  if (unit === def.standardUnit) {
    return Math.round(amount * def.kwhConversionFactor * 100) / 100;
  }

  throw new Error(`تبدیل واحد ${unit} برای منبع ${sourceId} بدون ضریب تبدیل مشخص امکان‌پذیر نیست.`);
}

export function calculateBuildingEui(
  profile: BuildingEnergyProfile,
  records: EnergyConsumptionRecord[]
): EnergyUseIntensityResult {
  if (profile.grossFloorAreaM2 <= 0) {
    throw new Error('مساحت زیربنای کل ساختمان باید بزرگ‌تر از صفر باشد.');
  }

  if (records.length === 0) {
    throw new Error('حداقل یک رکورد ثبت مصرف انرژی جهت محاسبه شاخص شدت مصرف (EUI) الزامی است.');
  }

  // Determine span of observations
  const minTime = Math.min(...records.map(r => new Date(r.periodStartIso).getTime()));
  const maxTime = Math.max(...records.map(r => new Date(r.periodEndIso).getTime()));
  const periodDays = Math.max(1, Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)));

  let totalDeliveredKwh = 0;
  let totalPrimaryKwh = 0;
  const fuelTotals: Record<string, number> = {};

  for (const rec of records) {
    const kwh = rec.normalizedKwhDelivered;
    totalDeliveredKwh += kwh;

    const sourceDef = STANDARD_ENERGY_SOURCES[rec.sourceId];
    const primaryFactor = sourceDef ? sourceDef.primaryEnergyFactor : 1.0;
    totalPrimaryKwh += kwh * primaryFactor;

    fuelTotals[rec.sourceId] = (fuelTotals[rec.sourceId] || 0) + kwh;
  }

  // Annualize to 365 days
  const annualFactor = 365 / periodDays;
  const annualizedDeliveredKwh = Math.round(totalDeliveredKwh * annualFactor);
  const annualizedPrimaryKwh = Math.round(totalPrimaryKwh * annualFactor);

  const siteEuiGross = Math.round((annualizedDeliveredKwh / profile.grossFloorAreaM2) * 10) / 10;
  const conditionedArea = profile.conditionedFloorAreaM2 > 0 ? profile.conditionedFloorAreaM2 : profile.grossFloorAreaM2;
  const siteEuiConditioned = Math.round((annualizedDeliveredKwh / conditionedArea) * 10) / 10;
  const primaryEui = Math.round((annualizedPrimaryKwh / profile.grossFloorAreaM2) * 10) / 10;

  // Percentage breakdown
  const fuelBreakdownPercentage: Record<string, number> = {};
  for (const [fuel, amount] of Object.entries(fuelTotals)) {
    fuelBreakdownPercentage[fuel] = totalDeliveredKwh > 0 ? Math.round((amount / totalDeliveredKwh) * 1000) / 10 : 0;
  }

  const dataConfidenceRating: 'high' | 'medium' | 'low' =
    periodDays >= 330 ? 'high' : periodDays >= 150 ? 'medium' : 'low';

  return {
    propertyId: profile.propertyId,
    periodDays,
    annualizedTotalDeliveredKwh: annualizedDeliveredKwh,
    annualizedPrimaryEnergyKwh: annualizedPrimaryKwh,
    grossFloorAreaM2: profile.grossFloorAreaM2,
    conditionedFloorAreaM2: conditionedArea,
    siteEuiGrossKwhPerM2Year: siteEuiGross,
    siteEuiConditionedKwhPerM2Year: siteEuiConditioned,
    primaryEuiKwhPerM2Year: primaryEui,
    fuelBreakdownPercentage,
    dataConfidenceRating,
    calculatedAtIso: new Date().toISOString()
  };
}

/**
 * Building Retrofit Scenario Modeling & Sustainability Benchmarking
 * (`server/modules/building-sustainability/retrofitAndBenchmarkEngine.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import { randomUUID } from 'node:crypto';
import {
  RetrofitIntervention,
  RetrofitScenarioResult,
  SustainabilityBenchmark
} from './types.js';

export function modelBuildingRetrofit(params: {
  propertyId: string;
  baselineSiteEuiKwhM2: number;
  grossFloorAreaM2: number;
  interventions: RetrofitIntervention[];
  blendedEnergyCostPerKwh?: number;
}): RetrofitScenarioResult {
  if (params.baselineSiteEuiKwhM2 <= 0) {
    throw new Error('شاخص مصرف مبنا (Baseline EUI) باید بزرگ‌تر از صفر باشد.');
  }
  if (params.interventions.length === 0) {
    throw new Error('حداقل یک راهکار بهینه‌سازی انرژی جهت مدل‌سازی الزامی است.');
  }

  // Compound reduction formula: 1 - product(1 - r_i)
  let remainingFactor = 1.0;
  let totalEstimatedCapex = 0;

  for (const item of params.interventions) {
    const fraction = item.estimatedEnergyReductionPercent / 100;
    remainingFactor *= 1.0 - fraction;

    if (item.indicativeCostPerM2 && params.grossFloorAreaM2 > 0) {
      totalEstimatedCapex += item.indicativeCostPerM2 * params.grossFloorAreaM2;
    }
  }

  const totalReductionRatio = 1.0 - remainingFactor;
  const projectedSiteEui = Math.round(params.baselineSiteEuiKwhM2 * (1.0 - totalReductionRatio) * 10) / 10;
  const euiSaved = Math.max(0, params.baselineSiteEuiKwhM2 - projectedSiteEui);
  const projectedAnnualKwhSaved = Math.round(euiSaved * params.grossFloorAreaM2);

  // Approximate blended emissions reduction: ~0.35 kg CO2e / kWh
  const projectedAnnualCo2ReducedKg = Math.round(projectedAnnualKwhSaved * 0.35);

  let estimatedPaybackPeriodYears: number | undefined;
  if (params.blendedEnergyCostPerKwh && totalEstimatedCapex > 0 && projectedAnnualKwhSaved > 0) {
    const annualMonetarySavings = projectedAnnualKwhSaved * params.blendedEnergyCostPerKwh;
    if (annualMonetarySavings > 0) {
      estimatedPaybackPeriodYears = Math.round((totalEstimatedCapex / annualMonetarySavings) * 10) / 10;
    }
  }

  return {
    scenarioId: randomUUID(),
    propertyId: params.propertyId,
    baselineSiteEuiKwhM2: params.baselineSiteEuiKwhM2,
    selectedInterventions: params.interventions,
    projectedSiteEuiKwhM2: projectedSiteEui,
    projectedAnnualKwhSaved,
    projectedAnnualCo2ReducedKg,
    totalEstimatedCapex: totalEstimatedCapex > 0 ? Math.round(totalEstimatedCapex) : undefined,
    estimatedPaybackPeriodYears,
    methodologyNotesFa:
      'کاهش مصرف انرژی به صورت مرکب (Compound Interactions) مدل شده تا از بیش‌برآوردی صرفه‌جویی تجمعی جلوگیری شود.',
    calculatedAtIso: new Date().toISOString()
  };
}

export function evaluateSustainabilityBenchmark(
  actualSiteEui: number,
  actualEmissionsIntensity: number,
  benchmark: SustainabilityBenchmark
): {
  performanceTier: 'top_quartile_efficient' | 'typical_average' | 'high_consumption';
  euiPercentageRelativeToMedian: number;
  emissionsPercentageRelativeToMedian: number;
  explanationFa: string;
} {
  const euiDiffPercent =
    Math.round(((actualSiteEui - benchmark.medianSiteEuiKwhPerM2Year) / benchmark.medianSiteEuiKwhPerM2Year) * 1000) / 10;

  const co2DiffPercent =
    benchmark.medianEmissionsIntensityKgM2Year > 0
      ? Math.round(
          ((actualEmissionsIntensity - benchmark.medianEmissionsIntensityKgM2Year) /
            benchmark.medianEmissionsIntensityKgM2Year) *
            1000
        ) / 10
      : 0;

  let performanceTier: 'top_quartile_efficient' | 'typical_average' | 'high_consumption';
  let explanationFa: string;

  if (actualSiteEui <= benchmark.topQuartileEuiKwhPerM2Year) {
    performanceTier = 'top_quartile_efficient';
    explanationFa = `ساختمان در چارک برتر بهینه‌سازی انرژی (${benchmark.sourceAgencyFa}) قرار داشته و مصرف آن ${Math.abs(euiDiffPercent)}% پایین‌تر از میانگین منطقه است.`;
  } else if (actualSiteEui <= benchmark.medianSiteEuiKwhPerM2Year) {
    performanceTier = 'typical_average';
    explanationFa = `مصرف انرژی ساختمان در محدوده نرمال شهری است (${Math.abs(euiDiffPercent)}% تفاوت با میانه منطقه).`;
  } else {
    performanceTier = 'high_consumption';
    explanationFa = `شدت مصرف انرژی ساختمان ${euiDiffPercent}% بالاتر از میانه ساختمان‌های مشابه در پهنه اقلیمی ${benchmark.climateZone} است. پتانسیل بالایی برای بهینه‌سازی وجود دارد.`;
  }

  return {
    performanceTier,
    euiPercentageRelativeToMedian: euiDiffPercent,
    emissionsPercentageRelativeToMedian: co2DiffPercent,
    explanationFa
  };
}

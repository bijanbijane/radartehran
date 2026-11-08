/**
 * Insurance Premium & Deductible Calculation Engine
 * (`server/modules/property-insurance/formulas.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { randomUUID } from 'node:crypto';
import {
  DeductibleStructure,
  PremiumCalculationFormulaBasis,
  PremiumEstimateResult
} from './types.js';

export function roundCurrency(amount: number, currency: string = 'IRR'): number {
  if (currency.toUpperCase() === 'IRR' || currency.toUpperCase() === 'TOMAN') {
    return Math.round(amount);
  }
  return Math.round(amount * 100) / 100;
}

export function analyzeInsuredValueAdequacy(
  replacementCostEstimate: number,
  declaredInsuredValue: number
): {
  adequacyRatioPercent: number;
  status: 'adequately_insured' | 'underinsured' | 'overinsured';
  proportionalAverageRuleWarning: boolean;
  explanationFa: string;
} {
  if (replacementCostEstimate <= 0) {
    throw new Error('برآورد هزینه ساخت مجدد (Replacement Cost) باید عددی مثبت باشد.');
  }
  if (declaredInsuredValue <= 0) {
    throw new Error('ارزش بیمه‌شده اعلامی باید عددی مثبت باشد.');
  }

  const ratio = (declaredInsuredValue / replacementCostEstimate) * 100;
  const roundedRatio = Math.round(ratio * 10) / 10;

  if (roundedRatio < 90) {
    return {
      adequacyRatioPercent: roundedRatio,
      status: 'underinsured',
      proportionalAverageRuleWarning: true,
      explanationFa: `ملک دچار کم‌بیمه‌گی (Underinsurance) به میزان ${Math.round(100 - roundedRatio)}% است. در زمان بروز خسارت، قاعده نسبی سرمایه اعمال گردیده و خسارت به نسبت سرمایه بیمه‌شده پرداخت خواهد شد.`
    };
  }

  if (roundedRatio > 115) {
    return {
      adequacyRatioPercent: roundedRatio,
      status: 'overinsured',
      proportionalAverageRuleWarning: false,
      explanationFa: `ارزش اعلامی بیش از ۱۵٪ بالاتر از هزینه واقعی بازسازی است (بیمه مضاعف/اضافی). بیمه‌گر فراتر از ارزش واقعی خسارت وارده غرامتی پرداخت نخواهد کرد.`
    };
  }

  return {
    adequacyRatioPercent: roundedRatio,
    status: 'adequately_insured',
    proportionalAverageRuleWarning: false,
    explanationFa: 'سرمایه بیمه‌شده با برآورد بازسازی انطباق استاندارد داشته و مشمول قاعده نسبی خسارت نمی‌شود.'
  };
}

export function calculateDeductibleDeduction(
  assessedLossAmount: number,
  deductible: DeductibleStructure
): {
  deductibleAmount: number;
  netPayableClaimAmount: number;
} {
  if (assessedLossAmount <= 0) {
    return { deductibleAmount: 0, netPayableClaimAmount: 0 };
  }

  let deductibleAmount = 0;

  if (deductible.type === 'fixed_amount' || deductible.type === 'per_claim_fixed') {
    deductibleAmount = deductible.fixedAmount ?? 0;
  } else if (deductible.type === 'percentage_of_loss') {
    const rate = (deductible.percentageRate ?? 0) / 100;
    deductibleAmount = assessedLossAmount * rate;
  } else if (deductible.type === 'percentage_with_min_max') {
    const rate = (deductible.percentageRate ?? 0) / 100;
    let computed = assessedLossAmount * rate;
    if (deductible.minAmount !== undefined) {
      computed = Math.max(computed, deductible.minAmount);
    }
    if (deductible.maxAmount !== undefined) {
      computed = Math.min(computed, deductible.maxAmount);
    }
    deductibleAmount = computed;
  }

  const finalDeductible = Math.min(deductibleAmount, assessedLossAmount);
  const netPayable = Math.max(0, assessedLossAmount - finalDeductible);

  return {
    deductibleAmount: roundCurrency(finalDeductible, deductible.currency),
    netPayableClaimAmount: roundCurrency(netPayable, deductible.currency)
  };
}

export function calculateIndicativeAnnualPremium(params: {
  productId: string;
  productVersion: number;
  buildingReplacementValue: number;
  contentsValue?: number;
  formulaBasis: PremiumCalculationFormulaBasis;
  currency?: string;
}): PremiumEstimateResult {
  const currency = params.currency ?? 'IRR';
  const contentsValue = params.contentsValue ?? 0;
  const basis = params.formulaBasis;

  if (params.buildingReplacementValue <= 0) {
    throw new Error('ارزش ساخت مجدد اعیان باید بزرگ‌تر از صفر باشد.');
  }

  // Base building premium: (Value / 1000) * baseRate * constructionMultiplier
  const buildingPerThousand = params.buildingReplacementValue / 1000;
  const baseBuildingPremium = buildingPerThousand * basis.baseRatePerThousandBuilding * basis.constructionMultiplier;

  // Contents premium
  let contentsPremium = 0;
  if (contentsValue > 0) {
    const contentsPerThousand = contentsValue / 1000;
    const rateContents = basis.baseRatePerThousandContents ?? basis.baseRatePerThousandBuilding;
    contentsPremium = contentsPerThousand * rateContents;
  }

  // Environmental and natural hazard surcharges
  const baseTotal = baseBuildingPremium + contentsPremium;
  const earthquakeMultiplier = Math.max(0, basis.earthquakeZoneFactor - 1.0);
  const earthquakeSurcharge = baseTotal * earthquakeMultiplier;
  const floodSurcharge = baseTotal * Math.max(0, basis.floodFactor);

  const subtotalBeforeDiscounts = baseTotal + earthquakeSurcharge + floodSurcharge;
  const discounts = subtotalBeforeDiscounts * ((basis.officialDiscountsPercent ?? 0) / 100);
  const taxableAmount = Math.max(0, subtotalBeforeDiscounts - discounts);
  const taxesAndOfficialLevies = taxableAmount * (basis.applicableTaxesPercent / 100);

  const totalIndicative = roundCurrency(taxableAmount + taxesAndOfficialLevies, currency);

  return {
    estimateId: randomUUID(),
    productId: params.productId,
    productVersion: params.productVersion,
    buildingReplacementValue: params.buildingReplacementValue,
    contentsValue,
    currency,
    baseBuildingPremium: roundCurrency(baseBuildingPremium, currency),
    contentsPremium: roundCurrency(contentsPremium, currency),
    earthquakeSurcharge: roundCurrency(earthquakeSurcharge, currency),
    floodSurcharge: roundCurrency(floodSurcharge, currency),
    taxesAndOfficialLevies: roundCurrency(taxesAndOfficialLevies, currency),
    totalIndicativeAnnualPremium: totalIndicative,
    breakdownSummaryFa: `حق بیمه اعیان: ${roundCurrency(baseBuildingPremium, currency).toLocaleString('fa-IR')} | زلزله: ${roundCurrency(earthquakeSurcharge, currency).toLocaleString('fa-IR')} | مالیات و عوارض: ${roundCurrency(taxesAndOfficialLevies, currency).toLocaleString('fa-IR')}`,
    assumptions: [
      `ضریب سازه: ${basis.constructionMultiplier}`,
      `ضریب پهنه زلزله: ${basis.earthquakeZoneFactor}`,
      `مالیات بر ارزش افزوده و عوارض شهرداری: ${basis.applicableTaxesPercent}%`
    ],
    disclaimerFa:
      'این مبلغ صرفاً برآورد اولیه بر مبنای تعرفه رسمی مصوب بیمه مرکزی بوده و صدور قطعی بیمه‌نامه منوط به بازدید کارشناس رسمی بیمه‌گر و استعلام نهایی می‌باشد.',
    calculatedAtIso: new Date().toISOString()
  };
}

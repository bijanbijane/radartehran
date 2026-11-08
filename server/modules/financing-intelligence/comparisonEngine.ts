/**
 * Financing Product Comparison & Ranking Engine
 * (`server/modules/financing-intelligence/comparisonEngine.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { randomUUID } from 'node:crypto';
import { calculateAmortizationSchedule } from './formulas.js';
import {
  FinancingInstitution,
  FinancingProduct,
  ProductComparisonItem,
  ProductComparisonReport
} from './types.js';

export const STALE_PRODUCT_DAYS_THRESHOLD = 180; // 6 months

export interface CompareProductsQuery {
  requestedAmount: number;
  propertyValue: number;
  repaymentPeriodMonths: number;
  currency: string;
  jurisdiction: string;
  propertyCategory?: string;
  rankingMethodology?: 'lowest_modeled_installment' | 'lowest_total_repayment' | 'lowest_nominal_rate';
}

export function compareFinancingProducts(
  products: FinancingProduct[],
  institutions: Map<string, FinancingInstitution>,
  query: CompareProductsQuery
): ProductComparisonReport {
  const rankingMethodology = query.rankingMethodology ?? 'lowest_modeled_installment';
  const now = Date.now();
  const comparisonItems: ProductComparisonItem[] = [];

  for (const product of products) {
    // Only compare products matching jurisdiction and currency
    if (product.jurisdiction !== query.jurisdiction || product.currency !== query.currency) {
      continue;
    }

    const institution = institutions.get(product.institutionId);
    const institutionNameFa = institution?.nameFa ?? 'بانک یا موسسه ناشناخته';

    // Check freshness
    const lastVerifiedTime = new Date(product.lastVerifiedTimestampIso).getTime();
    const ageDays = (now - lastVerifiedTime) / (1000 * 60 * 60 * 24);
    const isStale = product.isStale || ageDays > STALE_PRODUCT_DAYS_THRESHOLD;

    // Check if criteria met
    const unmetCriteria: string[] = [];
    if (query.requestedAmount < product.minFinancingAmount || query.requestedAmount > product.maxFinancingAmount) {
      unmetCriteria.push('مبلغ درخواستی خارج از سقف تسهیلات است.');
    }
    if (
      query.repaymentPeriodMonths < product.minRepaymentPeriodMonths ||
      query.repaymentPeriodMonths > product.maxRepaymentPeriodMonths
    ) {
      unmetCriteria.push('مدت بازپرداخت خارج از محدوده مجاز است.');
    }

    const ltv = query.propertyValue > 0 ? (query.requestedAmount / query.propertyValue) * 100 : 0;
    if (ltv > product.maxLtvPercent) {
      unmetCriteria.push(`نسبت وام به ارزش ملک فراتر از حداکثر LTV مجاز (${product.maxLtvPercent}%) است.`);
    }

    // Modeled calculations
    const effectiveRate = product.rateStructure.nominalAnnualRatePercent;
    const schedule = calculateAmortizationSchedule(
      query.requestedAmount,
      effectiveRate,
      query.repaymentPeriodMonths,
      'equal_installments',
      query.currency
    );

    // Sum known mandatory fees
    let totalKnownMandatoryFees = 0;
    let hasMissingFeeInformation = false;

    if (product.fees.length === 0) {
      hasMissingFeeInformation = true;
    }

    for (const fee of product.fees) {
      if (!fee.isMandatory) continue;
      if (fee.fixedAmount !== undefined) {
        totalKnownMandatoryFees += fee.fixedAmount;
      } else if (fee.percentageOfPrincipal !== undefined) {
        totalKnownMandatoryFees += (fee.percentageOfPrincipal / 100) * query.requestedAmount;
      } else {
        hasMissingFeeInformation = true;
      }
    }

    comparisonItems.push({
      product,
      institutionNameFa,
      modeledMonthlyInstallment: schedule.monthlyInstallmentAmount,
      modeledTotalRepayment: schedule.totalRepaymentAmount,
      modeledTotalInterest: schedule.totalInterestAmount,
      totalKnownMandatoryFees: Math.round(totalKnownMandatoryFees),
      hasMissingFeeInformation,
      meetsRequestedCriteria: unmetCriteria.length === 0 && product.availabilityStatus === 'active',
      unmetCriteriaExplanationFa: unmetCriteria.length > 0 ? unmetCriteria : undefined,
      dataFreshnessStatus: isStale ? 'stale' : 'fresh'
    });
  }

  // Sort based on chosen methodology
  comparisonItems.sort((a, b) => {
    // Prioritize products meeting requested criteria
    if (a.meetsRequestedCriteria !== b.meetsRequestedCriteria) {
      return a.meetsRequestedCriteria ? -1 : 1;
    }

    if (rankingMethodology === 'lowest_modeled_installment') {
      return a.modeledMonthlyInstallment - b.modeledMonthlyInstallment;
    } else if (rankingMethodology === 'lowest_total_repayment') {
      return a.modeledTotalRepayment - b.modeledTotalRepayment;
    } else {
      return a.product.rateStructure.nominalAnnualRatePercent - b.product.rateStructure.nominalAnnualRatePercent;
    }
  });

  return {
    comparisonId: randomUUID(),
    criteria: {
      requestedAmount: query.requestedAmount,
      propertyValue: query.propertyValue,
      repaymentPeriodMonths: query.repaymentPeriodMonths,
      currency: query.currency,
      jurisdiction: query.jurisdiction
    },
    comparedProducts: comparisonItems,
    rankingMethodology,
    generatedAtIso: new Date().toISOString(),
    disclaimerFa:
      'مقایسه انجام شده صرفاً بر اساس اطلاعات ثبت‌شده در سامانه و فرضیات یکسان انجام شده است. رتبه‌بندی محصولات در صورت نقص اطلاعات کارمزدها قطعی نبوده و متضمن شرایط اعطای وام نیست.'
  };
}

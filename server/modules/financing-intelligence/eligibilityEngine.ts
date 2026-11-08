/**
 * Explainable Eligibility Criteria Evaluation Engine
 * (`server/modules/financing-intelligence/eligibilityEngine.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { FinancingProduct } from './types.js';

export interface EligibilityEvaluationQuery {
  requestedAmount: number;
  propertyValue?: number;
  proposedBorrowerContributionPercent?: number;
  requestedRepaymentPeriodMonths?: number;
  propertyCategory?: string;
  isFirstTimeBuyer?: boolean;
  employmentStatus?: string;
}

export interface RuleEvaluationDetail {
  ruleId: string;
  criterionType: string;
  isMandatory: boolean;
  passed: boolean;
  explanationFa: string;
  sourceReference: string;
}

export interface ProductEligibilityEvaluationResult {
  productId: string;
  productVersion: number;
  appearsEligible: boolean;
  allMandatoryPassed: boolean;
  evaluatedRules: RuleEvaluationDetail[];
  unmetRules: RuleEvaluationDetail[];
  missingDataWarnings: string[];
  requiredDocuments: Array<{ documentKey: string; nameFa: string; isMandatory: boolean }>;
  disclaimerFa: string;
  evaluatedAtIso: string;
}

export function evaluateProductEligibility(
  product: FinancingProduct,
  query: EligibilityEvaluationQuery
): ProductEligibilityEvaluationResult {
  const evaluatedRules: RuleEvaluationDetail[] = [];
  const unmetRules: RuleEvaluationDetail[] = [];
  const missingDataWarnings: string[] = [];

  // Check product availability
  if (product.availabilityStatus !== 'active') {
    missingDataWarnings.push(`این تسهیلات در وضعیت «${product.availabilityStatus}» بوده و در حال حاضر قابل ارائه نیست.`);
  }

  // Check amount limits
  if (query.requestedAmount < product.minFinancingAmount) {
    const detail: RuleEvaluationDetail = {
      ruleId: 'limit-min-amount',
      criterionType: 'min_financing_amount',
      isMandatory: true,
      passed: false,
      explanationFa: `مبلغ درخواستی (${query.requestedAmount.toLocaleString('fa-IR')}) کمتر از حداقل مجاز تسهیلات (${product.minFinancingAmount.toLocaleString('fa-IR')}) است.`,
      sourceReference: product.sourceReference
    };
    evaluatedRules.push(detail);
    unmetRules.push(detail);
  } else if (query.requestedAmount > product.maxFinancingAmount) {
    const detail: RuleEvaluationDetail = {
      ruleId: 'limit-max-amount',
      criterionType: 'max_financing_amount',
      isMandatory: true,
      passed: false,
      explanationFa: `مبلغ درخواستی (${query.requestedAmount.toLocaleString('fa-IR')}) بیشتر از سقف تسهیلات (${product.maxFinancingAmount.toLocaleString('fa-IR')}) است.`,
      sourceReference: product.sourceReference
    };
    evaluatedRules.push(detail);
    unmetRules.push(detail);
  } else {
    evaluatedRules.push({
      ruleId: 'limit-amount-ok',
      criterionType: 'financing_amount_within_limits',
      isMandatory: true,
      passed: true,
      explanationFa: 'مبلغ درخواستی در بازه مجاز سقف تسهیلات قرار دارد.',
      sourceReference: product.sourceReference
    });
  }

  // Check repayment period if supplied
  if (query.requestedRepaymentPeriodMonths !== undefined) {
    if (query.requestedRepaymentPeriodMonths < product.minRepaymentPeriodMonths) {
      const detail: RuleEvaluationDetail = {
        ruleId: 'period-min-months',
        criterionType: 'min_repayment_period_months',
        isMandatory: true,
        passed: false,
        explanationFa: `مدت بازپرداخت درخواستی (${query.requestedRepaymentPeriodMonths} ماه) کمتر از حداقل مجاز (${product.minRepaymentPeriodMonths} ماه) است.`,
        sourceReference: product.sourceReference
      };
      evaluatedRules.push(detail);
      unmetRules.push(detail);
    } else if (query.requestedRepaymentPeriodMonths > product.maxRepaymentPeriodMonths) {
      const detail: RuleEvaluationDetail = {
        ruleId: 'period-max-months',
        criterionType: 'max_repayment_period_months',
        isMandatory: true,
        passed: false,
        explanationFa: `مدت بازپرداخت درخواستی (${query.requestedRepaymentPeriodMonths} ماه) فراتر از سقف مجاز بازپرداخت (${product.maxRepaymentPeriodMonths} ماه) است.`,
        sourceReference: product.sourceReference
      };
      evaluatedRules.push(detail);
      unmetRules.push(detail);
    } else {
      evaluatedRules.push({
        ruleId: 'period-ok',
        criterionType: 'repayment_period_within_limits',
        isMandatory: true,
        passed: true,
        explanationFa: 'مدت بازپرداخت انتخابی در محدوده مجاز محصول است.',
        sourceReference: product.sourceReference
      });
    }
  }

  // Check LTV and borrower contribution if property value is given
  if (query.propertyValue && query.propertyValue > 0) {
    const ltv = (query.requestedAmount / query.propertyValue) * 100;
    if (ltv > product.maxLtvPercent) {
      const detail: RuleEvaluationDetail = {
        ruleId: 'rule-max-ltv',
        criterionType: 'max_ltv_percent',
        isMandatory: true,
        passed: false,
        explanationFa: `نسبت وام به ارزش ملک (${Math.round(ltv)}%) بیشتر از حداکثر LTV مجاز محصول (${product.maxLtvPercent}%) است.`,
        sourceReference: product.sourceReference
      };
      evaluatedRules.push(detail);
      unmetRules.push(detail);
    } else {
      evaluatedRules.push({
        ruleId: 'rule-max-ltv-pass',
        criterionType: 'max_ltv_percent',
        isMandatory: true,
        passed: true,
        explanationFa: `نسبت وام به ارزش ملک (${Math.round(ltv)}%) در محدوده مجاز است.`,
        sourceReference: product.sourceReference
      });
    }
  } else {
    missingDataWarnings.push('ارزش ملک وارد نشده است؛ کنترل نسبت وام به ارزش (LTV) امکان‌پذیر نیست.');
  }

  // Evaluate explicit eligibility rules attached to product
  for (const rule of product.eligibilityRules) {
    let passed = true;
    let explanationFa = rule.descriptionFa;

    if (rule.criterionType === 'first_time_buyer_only') {
      if (query.isFirstTimeBuyer === false) {
        passed = false;
        explanationFa = 'این تسهیلات اختصاص به خانه‌اولی‌ها دارد.';
      } else if (query.isFirstTimeBuyer === undefined) {
        missingDataWarnings.push('وضعیت خانه‌اولی بودن مشخص نشده است.');
      }
    } else if (rule.criterionType === 'allowed_property_categories') {
      const allowedCategories = Array.isArray(rule.targetValue) ? rule.targetValue : [];
      if (query.propertyCategory && !allowedCategories.includes(query.propertyCategory)) {
        passed = false;
        explanationFa = `نوع ملک انتخابی (${query.propertyCategory}) جزو کاربری‌های مورد قبول این تسهیلات نیست.`;
      }
    }

    const detail: RuleEvaluationDetail = {
      ruleId: rule.ruleId,
      criterionType: rule.criterionType,
      isMandatory: rule.isMandatory,
      passed,
      explanationFa,
      sourceReference: rule.sourceReference
    };

    evaluatedRules.push(detail);
    if (!passed) {
      unmetRules.push(detail);
    }
  }

  const allMandatoryPassed = !unmetRules.some(r => r.isMandatory);
  const appearsEligible = allMandatoryPassed && unmetRules.length === 0;

  return {
    productId: product.productId,
    productVersion: product.productVersion,
    appearsEligible,
    allMandatoryPassed,
    evaluatedRules,
    unmetRules,
    missingDataWarnings,
    requiredDocuments: product.requiredDocumentsChecklist,
    disclaimerFa:
      'این ارزیابی بر مبنای معیارهای منتشرشده بانک صورت گرفته و به هیچ عنوان به معنی موافقت اصولی، تخصیص اعتبار یا تعهد پرداخت وام نمی‌باشد.',
    evaluatedAtIso: new Date().toISOString()
  };
}

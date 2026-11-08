/**
 * Insurance Eligibility Criteria & Property Risk Evaluation Engine
 * (`server/modules/property-insurance/eligibilityAndRiskEngine.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { PropertyInsuranceProduct } from './types.js';

export interface PropertyInsuranceEvaluationQuery {
  propertyCategory: string;
  constructionType: string;
  buildingAgeYears?: number;
  declaredBuildingValue: number;
  hasFireExtinguisher?: boolean;
  electricalSafetyCertified?: boolean;
}

export interface RuleEvaluationItem {
  ruleId: string;
  criterionType: string;
  isMandatory: boolean;
  passed: boolean;
  explanationFa: string;
  sourceReference: string;
}

export interface EligibilityEvaluationReport {
  productId: string;
  productVersion: number;
  appearsEligible: boolean;
  allMandatoryPassed: boolean;
  evaluatedRules: RuleEvaluationItem[];
  unmetRules: RuleEvaluationItem[];
  requiredDocuments: Array<{ documentKey: string; nameFa: string; isMandatory: boolean }>;
  disclaimerFa: string;
  evaluatedAtIso: string;
}

export function evaluateInsuranceEligibility(
  product: PropertyInsuranceProduct,
  query: PropertyInsuranceEvaluationQuery
): EligibilityEvaluationReport {
  const evaluatedRules: RuleEvaluationItem[] = [];
  const unmetRules: RuleEvaluationItem[] = [];

  // 1. Property category compatibility
  const categoryAllowed = product.eligiblePropertyCategories.includes(query.propertyCategory);
  const catRule: RuleEvaluationItem = {
    ruleId: 'rule-property-category',
    criterionType: 'allowed_property_categories',
    isMandatory: true,
    passed: categoryAllowed,
    explanationFa: categoryAllowed
      ? `کاربری ملک (${query.propertyCategory}) مجاز است.`
      : `کاربری ملک (${query.propertyCategory}) در پوشش این بیمه‌نامه قرار ندارد. کاربری‌های مجاز: ${product.eligiblePropertyCategories.join('، ')}`,
    sourceReference: product.sourceReference
  };
  evaluatedRules.push(catRule);
  if (!categoryAllowed) unmetRules.push(catRule);

  // 2. Construction type compatibility
  const constructionAllowed = product.eligibleConstructionTypes.includes(query.constructionType);
  const constRule: RuleEvaluationItem = {
    ruleId: 'rule-construction-type',
    criterionType: 'allowed_construction_types',
    isMandatory: true,
    passed: constructionAllowed,
    explanationFa: constructionAllowed
      ? `نوع سازه (${query.constructionType}) مورد تایید است.`
      : `سازه (${query.constructionType}) تحت پوشش این محصول نیست. سازه‌های مجاز: ${product.eligibleConstructionTypes.join('، ')}`,
    sourceReference: product.sourceReference
  };
  evaluatedRules.push(constRule);
  if (!constructionAllowed) unmetRules.push(constRule);

  // 3. Dynamic rules defined on the product
  for (const rule of product.eligibilityRules) {
    let passed = true;
    let explanationFa = rule.descriptionFa;

    if (rule.criterionType === 'max_building_age_years') {
      const maxAge = Number(rule.targetValue);
      if (query.buildingAgeYears !== undefined && query.buildingAgeYears > maxAge) {
        passed = false;
        explanationFa = `سن بنا (${query.buildingAgeYears} سال) فراتر از حداکثر مجاز آیین‌نامه (${maxAge} سال) است. نیاز به بازدید ویژه کارشناسی دارد.`;
      }
    } else if (rule.criterionType === 'requires_fire_extinguisher') {
      if (query.hasFireExtinguisher === false) {
        passed = false;
        explanationFa = 'وجود کپسول اطفاء حریق دارای تاییدیه معتبر الزامی است.';
      }
    } else if (rule.criterionType === 'min_insured_value') {
      const minVal = Number(rule.targetValue);
      if (query.declaredBuildingValue < minVal) {
        passed = false;
        explanationFa = `سرمایه اعلامی کمتر از حداقل نصاب ارزش بیمه‌نامه (${minVal.toLocaleString('fa-IR')}) است.`;
      }
    } else if (rule.criterionType === 'max_insured_value') {
      const maxVal = Number(rule.targetValue);
      if (query.declaredBuildingValue > maxVal) {
        passed = false;
        explanationFa = `سرمایه اعلامی بیشتر از سقف اختیارات شعبه صدور (${maxVal.toLocaleString('fa-IR')}) است.`;
      }
    }

    const item: RuleEvaluationItem = {
      ruleId: rule.ruleId,
      criterionType: rule.criterionType,
      isMandatory: rule.isMandatory,
      passed,
      explanationFa,
      sourceReference: rule.sourceReference
    };

    evaluatedRules.push(item);
    if (!passed) {
      unmetRules.push(item);
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
    requiredDocuments: product.requiredDocumentsChecklist,
    disclaimerFa:
      'این بررسی اولیه مبتنی بر ضوابط عمومی شرکت بیمه بوده و جایگزین پرسشنامه رسمی پیشنهاد بیمه و بازدید کارشناس فنی نمی‌باشد.',
    evaluatedAtIso: new Date().toISOString()
  };
}

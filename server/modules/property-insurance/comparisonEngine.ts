/**
 * Property Insurance Comparison & Coverage Alignment Engine
 * (`server/modules/property-insurance/comparisonEngine.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { randomUUID } from 'node:crypto';
import {
  InsuranceComparisonReport,
  InsuranceInstitution,
  InsuranceProductComparisonItem,
  PropertyInsuranceProduct
} from './types.js';

export const STALE_INSURANCE_PRODUCT_DAYS = 180;

export interface CompareInsuranceProductsQuery {
  propertyValue: number;
  propertyCategory: string;
  constructionType: string;
  buildingAgeYears: number;
  currency: string;
  jurisdiction: string;
  rankingMethodology?: 'most_comprehensive_coverage' | 'lowest_indicative_premium';
}

export function compareInsuranceProducts(
  products: PropertyInsuranceProduct[],
  institutions: Map<string, InsuranceInstitution>,
  query: CompareInsuranceProductsQuery,
  indicativePremiums?: Map<string, number>
): InsuranceComparisonReport {
  const rankingMethodology = query.rankingMethodology ?? 'most_comprehensive_coverage';
  const now = Date.now();
  const comparisonItems: InsuranceProductComparisonItem[] = [];

  for (const product of products) {
    if (product.jurisdiction !== query.jurisdiction || product.currency !== query.currency) {
      continue;
    }

    const institution = institutions.get(product.institutionId);
    const institutionNameFa = institution?.nameFa ?? 'شرکت بیمه ناشناخته';

    // Stale check
    const lastVerified = new Date(product.lastVerifiedTimestampIso).getTime();
    const ageDays = (now - lastVerified) / (1000 * 60 * 60 * 24);
    const isStale = product.isStale || ageDays > STALE_INSURANCE_PRODUCT_DAYS;

    // Check criteria match
    const unmetCriteria: string[] = [];
    if (!product.eligiblePropertyCategories.includes(query.propertyCategory)) {
      unmetCriteria.push(`عدم پوشش کاربری ${query.propertyCategory}`);
    }
    if (!product.eligibleConstructionTypes.includes(query.constructionType)) {
      unmetCriteria.push(`عدم پوشش سازه ${query.constructionType}`);
    }

    const standardCoverages = product.coverages.filter(c => c.isStandard);
    const optionalCoverages = product.coverages.filter(c => !c.isStandard);
    const indicativePremium = indicativePremiums?.get(product.productId);

    comparisonItems.push({
      product,
      institutionNameFa,
      standardCoveragesCount: standardCoverages.length,
      optionalCoveragesCount: optionalCoverages.length,
      exclusionsCount: product.exclusions.length,
      indicativeAnnualPremium: indicativePremium,
      hasMissingPricingData: indicativePremium === undefined,
      dataFreshnessStatus: isStale ? 'stale' : 'fresh',
      meetsPropertyCriteria: unmetCriteria.length === 0 && product.availabilityStatus === 'active',
      unmetCriteriaExplanationFa: unmetCriteria.length > 0 ? unmetCriteria : undefined
    });
  }

  // Sort based on ranking methodology
  comparisonItems.sort((a, b) => {
    // Prioritize products meeting property criteria
    if (a.meetsPropertyCriteria !== b.meetsPropertyCriteria) {
      return a.meetsPropertyCriteria ? -1 : 1;
    }

    if (rankingMethodology === 'most_comprehensive_coverage') {
      // More standard coverages first, fewer exclusions second
      if (b.standardCoveragesCount !== a.standardCoveragesCount) {
        return b.standardCoveragesCount - a.standardCoveragesCount;
      }
      return a.exclusionsCount - b.exclusionsCount;
    }

    if (rankingMethodology === 'lowest_indicative_premium') {
      const priceA = typeof a.indicativeAnnualPremium === 'number' && Number.isFinite(a.indicativeAnnualPremium) ? a.indicativeAnnualPremium : Number.POSITIVE_INFINITY;
      const priceB = typeof b.indicativeAnnualPremium === 'number' && Number.isFinite(b.indicativeAnnualPremium) ? b.indicativeAnnualPremium : Number.POSITIVE_INFINITY;
      if (priceA !== priceB) {
        return priceA - priceB;
      }
      if (b.standardCoveragesCount !== a.standardCoveragesCount) {
        return b.standardCoveragesCount - a.standardCoveragesCount;
      }
      return a.exclusionsCount - b.exclusionsCount;
    }

    return 0;
  });

  return {
    comparisonId: randomUUID(),
    criteria: {
      propertyValue: query.propertyValue,
      propertyCategory: query.propertyCategory,
      constructionType: query.constructionType,
      buildingAgeYears: query.buildingAgeYears,
      currency: query.currency,
      jurisdiction: query.jurisdiction
    },
    comparedProducts: comparisonItems,
    rankingMethodology,
    generatedAtIso: new Date().toISOString(),
    disclaimerFa:
      'مقایسه پوشش‌ها بر مبنای شرایط عمومی و خصوصی ثبت‌شده در سامانه انجام شده است. استثنائات اختصاصی هر بیمه‌گر ممکن است تعهدات نهایی خسارت را تغییر دهد.'
  };
}

/**
 * Property Insurance & Coverage Intelligence Domain Types
 * (`server/modules/property-insurance/types.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

export type InsuranceInstitutionCategory =
  | 'property_insurer'
  | 'general_insurer'
  | 'specialized_property_insurer'
  | 'cooperative_insurer'
  | 'government_backed_fund'
  | 'other';

export type InsuranceProductCategory =
  | 'residential_building'
  | 'commercial_building'
  | 'contents_only'
  | 'combined_building_and_contents'
  | 'fire_and_lightning'
  | 'earthquake_extended'
  | 'flood_and_water_damage'
  | 'landlord_protection'
  | 'property_liability'
  | 'construction_all_risk'
  | 'renovation_insurance'
  | 'building_equipment_machinery';

export type CoverageCategory =
  | 'fire_and_explosion'
  | 'earthquake_and_volcano'
  | 'flood_and_water_damage'
  | 'storm_and_atmospheric'
  | 'structural_collapse'
  | 'property_contents'
  | 'third_party_liability'
  | 'landlord_loss_of_rent'
  | 'debris_removal'
  | 'emergency_temporary_housing';

export type DeductibleType =
  | 'fixed_amount'
  | 'percentage_of_loss'
  | 'percentage_with_min_max'
  | 'per_claim_fixed'
  | 'percentage_of_sum_insured';

export type ProductAvailabilityStatus =
  | 'active'
  | 'suspended'
  | 'discontinued'
  | 'unverified'
  | 'expired';

export type VerificationStatus = 'verified' | 'unverified' | 'stale' | 'disputed';

export interface InsuranceInstitution {
  institutionId: string;
  nameFa: string;
  nameEn?: string;
  category: InsuranceInstitutionCategory;
  jurisdiction: string;
  officialWebsite?: string;
  regulatoryCode?: string;
  verificationStatus: VerificationStatus;
  lastVerifiedTimestampIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CoverageTermItem {
  coverageId: string;
  category: CoverageCategory;
  nameFa: string;
  descriptionFa: string;
  isStandard: boolean; // standard vs optional extension
  limitAmount?: number;
  sublimitAmount?: number;
  isAggregateLimit: boolean;
  coverageBasis: 'replacement_cost' | 'actual_cash_value' | 'agreed_value' | 'first_loss';
  currency: string;
}

export interface ExclusionItem {
  exclusionId: string;
  category: string;
  titleFa: string;
  originalWordingFa: string;
  normalizedDescriptionFa: string;
  appliesToCoverages?: CoverageCategory[];
  sourceDocumentReference: string;
}

export interface DeductibleStructure {
  deductibleId: string;
  coverageCategory: CoverageCategory;
  type: DeductibleType;
  fixedAmount?: number;
  percentageRate?: number;
  minAmount?: number;
  maxAmount?: number;
  currency: string;
}

export interface InsuranceEligibilityRule {
  ruleId: string;
  criterionType:
    | 'allowed_property_categories'
    | 'max_building_age_years'
    | 'allowed_construction_types'
    | 'requires_fire_extinguisher'
    | 'requires_standard_electrical'
    | 'min_insured_value'
    | 'max_insured_value';
  targetValue: unknown;
  isMandatory: boolean;
  descriptionFa: string;
  sourceReference: string;
}

export interface PropertyInsuranceProduct {
  productId: string;
  institutionId: string;
  productVersion: number;
  productNameFa: string;
  category: InsuranceProductCategory;
  jurisdiction: string;
  currency: string;
  eligiblePropertyCategories: string[];
  eligibleConstructionTypes: string[];
  coverages: CoverageTermItem[];
  deductibles: DeductibleStructure[];
  exclusions: ExclusionItem[];
  eligibilityRules: InsuranceEligibilityRule[];
  requiredDocumentsChecklist: Array<{ documentKey: string; nameFa: string; isMandatory: boolean }>;
  policyDurationMonths: number;
  availabilityStatus: ProductAvailabilityStatus;
  sourceReference: string;
  lastVerifiedTimestampIso: string;
  effectiveFromIso: string;
  effectiveUntilIso?: string;
  isStale: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PremiumCalculationFormulaBasis {
  baseRatePerThousandBuilding: number; // e.g. 0.8 per 1000 IRR of building value
  baseRatePerThousandContents?: number;
  earthquakeZoneFactor: number; // e.g. 1.0 to 2.5
  floodFactor: number;
  constructionMultiplier: number; // e.g. steel 1.0, concrete 1.1, masonry 1.5
  applicableTaxesPercent: number; // e.g. 9% VAT
  officialDiscountsPercent?: number;
}

export interface PremiumEstimateResult {
  estimateId: string;
  productId: string;
  productVersion: number;
  buildingReplacementValue: number;
  contentsValue: number;
  currency: string;
  baseBuildingPremium: number;
  contentsPremium: number;
  earthquakeSurcharge: number;
  floodSurcharge: number;
  taxesAndOfficialLevies: number;
  totalIndicativeAnnualPremium: number;
  breakdownSummaryFa: string;
  assumptions: string[];
  disclaimerFa: string;
  calculatedAtIso: string;
}

export interface InsuranceProductComparisonItem {
  product: PropertyInsuranceProduct;
  institutionNameFa: string;
  standardCoveragesCount: number;
  optionalCoveragesCount: number;
  exclusionsCount: number;
  indicativeAnnualPremium?: number;
  hasMissingPricingData: boolean;
  dataFreshnessStatus: 'fresh' | 'stale';
  meetsPropertyCriteria: boolean;
  unmetCriteriaExplanationFa?: string[];
}

export interface InsuranceComparisonReport {
  comparisonId: string;
  criteria: {
    propertyValue: number;
    propertyCategory: string;
    constructionType: string;
    buildingAgeYears: number;
    currency: string;
    jurisdiction: string;
  };
  comparedProducts: InsuranceProductComparisonItem[];
  rankingMethodology: 'most_comprehensive_coverage' | 'lowest_indicative_premium';
  generatedAtIso: string;
  disclaimerFa: string;
}

export interface InsuranceQuoteReference {
  quoteReferenceId: string;
  productId: string;
  productVersion: number;
  institutionId: string;
  propertyId?: string;
  userId: string;
  declaredBuildingValue: number;
  declaredContentsValue: number;
  quotedAnnualPremium: number;
  currency: string;
  quoteEffectiveDateIso: string;
  quoteExpiryDateIso: string;
  externalQuoteNumber?: string;
  status: 'draft' | 'user_reported' | 'insurer_confirmed' | 'expired' | 'withdrawn';
  statusSource: 'user_declaration' | 'insurer_api' | 'manual_verification';
  createdAtIso: string;
  updatedAtIso: string;
}

export interface InsurancePolicyReference {
  policyReferenceId: string;
  userId: string;
  propertyId: string;
  institutionId: string;
  productId?: string;
  externalPolicyNumberProtected: string;
  policyStartDateIso: string;
  policyEndDateIso: string;
  annualPremiumPaid?: number;
  currency: string;
  status: 'active_user_reported' | 'active_confirmed' | 'expired' | 'cancelled' | 'renewed';
  statusSource: 'user_reported' | 'insurer_confirmed';
  renewalReminderDueIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface InsuranceClaimReference {
  claimReferenceId: string;
  policyReferenceId: string;
  propertyId: string;
  institutionId: string;
  userId: string;
  incidentDateIso: string;
  incidentCategory: CoverageCategory;
  userDescriptionFa: string;
  externalClaimNumber?: string;
  status:
    | 'incident_reported'
    | 'user_submitting'
    | 'insurer_acknowledged'
    | 'under_review'
    | 'approved_confirmed'
    | 'settled_confirmed'
    | 'declined_confirmed'
    | 'withdrawn';
  statusSource: 'user_declaration' | 'insurer_confirmed';
  settlementAmountRecorded?: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface InsuranceDomainEvent {
  eventId: string;
  eventType:
    | 'property_insurance.institution.created'
    | 'property_insurance.institution.updated'
    | 'property_insurance.product.created'
    | 'property_insurance.product.versioned'
    | 'property_insurance.product.discontinued'
    | 'property_insurance.premium_estimate.created'
    | 'property_insurance.comparison.created'
    | 'property_insurance.quote.created'
    | 'property_insurance.policy.reference_created'
    | 'property_insurance.policy.renewal_due'
    | 'property_insurance.claim.reference_created'
    | 'property_insurance.claim.reference_updated';
  aggregateId: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}

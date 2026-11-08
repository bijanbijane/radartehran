/**
 * Primary Facade Service for Property Insurance & Coverage Intelligence
 * (`server/modules/property-insurance/service.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { randomUUID } from 'node:crypto';
import { compareInsuranceProducts, CompareInsuranceProductsQuery } from './comparisonEngine.js';
import {
  GeographyHazardZoneAdapter,
  InsuranceEventOutboxPublisher,
  PropertyDueDiligenceInspectionAdapter,
  PropertyValuationInsuranceAdapter
} from './contracts.js';
import {
  evaluateInsuranceEligibility,
  PropertyInsuranceEvaluationQuery,
  EligibilityEvaluationReport
} from './eligibilityAndRiskEngine.js';
import {
  analyzeInsuredValueAdequacy,
  calculateDeductibleDeduction,
  calculateIndicativeAnnualPremium
} from './formulas.js';
import {
  createQuoteReferenceWorkflow,
  registerClaimReferenceWorkflow,
  registerPolicyReferenceWorkflow,
  updateClaimStatusWorkflow
} from './policyAndClaimsService.js';
import { PropertyInsuranceRepository } from './repository.js';
import {
  CoverageCategory,
  DeductibleStructure,
  InsuranceClaimReference,
  InsuranceComparisonReport,
  InsuranceDomainEvent,
  InsuranceInstitution,
  InsurancePolicyReference,
  InsuranceQuoteReference,
  PremiumCalculationFormulaBasis,
  PremiumEstimateResult,
  PropertyInsuranceProduct
} from './types.js';

export class PropertyInsuranceService {
  constructor(
    private readonly repository: PropertyInsuranceRepository,
    private readonly outboxPublisher?: InsuranceEventOutboxPublisher,
    private readonly valuationAdapter?: PropertyValuationInsuranceAdapter,
    private readonly dueDiligenceAdapter?: PropertyDueDiligenceInspectionAdapter,
    private readonly geographyAdapter?: GeographyHazardZoneAdapter
  ) {}

  private async emitEvent(
    eventType: InsuranceDomainEvent['eventType'],
    aggregateId: string,
    actorUserId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.outboxPublisher) return;
    const event: InsuranceDomainEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateId,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString()
    };
    await this.outboxPublisher.publish(event);
  }

  // --- 1. Institutions ---

  async registerInstitution(
    input: Omit<InsuranceInstitution, 'createdAtIso' | 'updatedAtIso'>
  ): Promise<InsuranceInstitution> {
    const nowIso = new Date().toISOString();
    const inst: InsuranceInstitution = {
      ...input,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };
    await this.repository.saveInstitution(inst);
    await this.emitEvent('property_insurance.institution.created', inst.institutionId, undefined, { inst });
    return inst;
  }

  async getInstitution(institutionId: string): Promise<InsuranceInstitution | null> {
    return this.repository.findInstitutionById(institutionId);
  }

  async listInstitutions(jurisdiction?: string): Promise<InsuranceInstitution[]> {
    return this.repository.listInstitutions(jurisdiction);
  }

  // --- 2. Products Catalog & Versioning ---

  async createProduct(
    input: Omit<PropertyInsuranceProduct, 'productVersion' | 'isStale' | 'createdAtIso' | 'updatedAtIso'>
  ): Promise<PropertyInsuranceProduct> {
    const inst = await this.repository.findInstitutionById(input.institutionId);
    if (!inst) {
      throw new Error(`شرکت بیمه با شناسه ${input.institutionId} یافت نشد.`);
    }

    const nowIso = new Date().toISOString();
    const product: PropertyInsuranceProduct = {
      ...input,
      productVersion: 1,
      isStale: false,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(product);
    await this.emitEvent('property_insurance.product.created', product.productId, undefined, { product });
    return product;
  }

  async updateProductVersion(
    productId: string,
    updates: Partial<Omit<PropertyInsuranceProduct, 'productId' | 'productVersion' | 'createdAtIso' | 'updatedAtIso'>>
  ): Promise<PropertyInsuranceProduct> {
    const existing = await this.repository.findProductById(productId);
    if (!existing) {
      throw new Error(`محصول بیمه با شناسه ${productId} یافت نشد.`);
    }

    const nowIso = new Date().toISOString();
    const updated: PropertyInsuranceProduct = {
      ...existing,
      ...updates,
      productId: existing.productId,
      productVersion: existing.productVersion + 1,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(updated);
    await this.emitEvent('property_insurance.product.versioned', productId, undefined, { updated });
    return updated;
  }

  async discontinueProduct(productId: string, reasonFa: string): Promise<PropertyInsuranceProduct> {
    const existing = await this.repository.findProductById(productId);
    if (!existing) {
      throw new Error(`محصول بیمه با شناسه ${productId} یافت نشد.`);
    }

    const nowIso = new Date().toISOString();
    const updated: PropertyInsuranceProduct = {
      ...existing,
      availabilityStatus: 'discontinued',
      effectiveUntilIso: nowIso,
      productVersion: existing.productVersion + 1,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(updated);
    await this.emitEvent('property_insurance.product.discontinued', productId, undefined, { reasonFa });
    return updated;
  }

  async getProduct(productId: string): Promise<PropertyInsuranceProduct | null> {
    return this.repository.findProductById(productId);
  }

  async getProductHistory(productId: string): Promise<PropertyInsuranceProduct[]> {
    return this.repository.findProductHistory(productId);
  }

  async listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: PropertyInsuranceProduct[]; nextCursor?: string; totalCount: number }> {
    return this.repository.listProducts(filters);
  }

  // --- 3. Eligibility & Valuation Adequacy ---

  async evaluateEligibility(
    productId: string,
    query: PropertyInsuranceEvaluationQuery
  ): Promise<EligibilityEvaluationReport> {
    const product = await this.repository.findProductById(productId);
    if (!product) {
      throw new Error(`محصول بیمه با شناسه ${productId} یافت نشد.`);
    }

    return evaluateInsuranceEligibility(product, query);
  }

  analyzeInsuredValueAdequacy(
    replacementCostEstimate: number,
    declaredInsuredValue: number
  ): {
    adequacyRatioPercent: number;
    status: 'adequately_insured' | 'underinsured' | 'overinsured';
    proportionalAverageRuleWarning: boolean;
    explanationFa: string;
  } {
    return analyzeInsuredValueAdequacy(replacementCostEstimate, declaredInsuredValue);
  }

  calculateDeductible(
    assessedLossAmount: number,
    deductible: DeductibleStructure
  ): { deductibleAmount: number; netPayableClaimAmount: number } {
    return calculateDeductibleDeduction(assessedLossAmount, deductible);
  }

  // --- 4. Premium Estimation Engine ---

  async calculatePremiumEstimate(params: {
    productId: string;
    buildingReplacementValue: number;
    contentsValue?: number;
    formulaBasis: PremiumCalculationFormulaBasis;
    currency?: string;
  }): Promise<PremiumEstimateResult> {
    const product = await this.repository.findProductById(params.productId);
    if (!product) {
      throw new Error(`محصول بیمه با شناسه ${params.productId} یافت نشد.`);
    }

    const estimate = calculateIndicativeAnnualPremium({
      productId: product.productId,
      productVersion: product.productVersion,
      buildingReplacementValue: params.buildingReplacementValue,
      contentsValue: params.contentsValue,
      formulaBasis: params.formulaBasis,
      currency: params.currency ?? product.currency
    });

    await this.repository.saveEstimate(estimate);
    await this.emitEvent('property_insurance.premium_estimate.created', estimate.estimateId, undefined, { estimate });
    return estimate;
  }

  // --- 5. Comparison Engine ---

  async compareProducts(query: CompareInsuranceProductsQuery): Promise<InsuranceComparisonReport> {
    const { products } = await this.repository.listProducts({
      jurisdiction: query.jurisdiction,
      currency: query.currency
    });

    const institutionsList = await this.repository.listInstitutions(query.jurisdiction);
    const institutionsMap = new Map<string, InsuranceInstitution>();
    for (const inst of institutionsList) {
      institutionsMap.set(inst.institutionId, inst);
    }

    const report = compareInsuranceProducts(products, institutionsMap, query);
    await this.repository.saveComparisonReport(report);
    await this.emitEvent('property_insurance.comparison.created', report.comparisonId, undefined, { report });
    return report;
  }

  // --- 6. Quotes, Policies & Claims Tracking ---

  async createQuoteReference(params: {
    productId: string;
    userId: string;
    propertyId?: string;
    declaredBuildingValue: number;
    declaredContentsValue?: number;
    quotedAnnualPremium: number;
    currency: string;
    externalQuoteNumber?: string;
  }): Promise<InsuranceQuoteReference> {
    const product = await this.repository.findProductById(params.productId);
    if (!product) {
      throw new Error(`محصول با شناسه ${params.productId} یافت نشد.`);
    }

    const quote = createQuoteReferenceWorkflow({
      productId: product.productId,
      productVersion: product.productVersion,
      institutionId: product.institutionId,
      propertyId: params.propertyId,
      userId: params.userId,
      declaredBuildingValue: params.declaredBuildingValue,
      declaredContentsValue: params.declaredContentsValue,
      quotedAnnualPremium: params.quotedAnnualPremium,
      currency: params.currency,
      externalQuoteNumber: params.externalQuoteNumber
    });

    await this.repository.saveQuote(quote);
    await this.emitEvent('property_insurance.quote.created', quote.quoteReferenceId, params.userId, { quote });
    return quote;
  }

  async registerPolicyReference(params: {
    userId: string;
    propertyId: string;
    institutionId: string;
    productId?: string;
    externalPolicyNumber: string;
    policyStartDateIso: string;
    policyEndDateIso: string;
    annualPremiumPaid?: number;
    currency?: string;
  }): Promise<InsurancePolicyReference> {
    const policy = registerPolicyReferenceWorkflow(params);
    await this.repository.savePolicy(policy);
    await this.emitEvent('property_insurance.policy.reference_created', policy.policyReferenceId, params.userId, { policy });
    return policy;
  }

  async getUserPolicies(userId: string): Promise<InsurancePolicyReference[]> {
    return this.repository.listPoliciesByUser(userId);
  }

  async getExpiringPolicies(beforeIso: string): Promise<InsurancePolicyReference[]> {
    return this.repository.listExpiringPolicies(beforeIso);
  }

  async registerClaimReference(params: {
    policyReferenceId: string;
    propertyId: string;
    institutionId: string;
    userId: string;
    incidentDateIso: string;
    incidentCategory: CoverageCategory;
    userDescriptionFa: string;
    externalClaimNumber?: string;
  }): Promise<InsuranceClaimReference> {
    const claim = registerClaimReferenceWorkflow(params);
    await this.repository.saveClaim(claim);
    await this.emitEvent('property_insurance.claim.reference_created', claim.claimReferenceId, params.userId, { claim });
    return claim;
  }

  async updateClaimStatus(
    claimId: string,
    newStatus: InsuranceClaimReference['status'],
    statusSource: InsuranceClaimReference['statusSource'],
    settlementAmount?: number
  ): Promise<InsuranceClaimReference> {
    const claim = await this.repository.findClaimById(claimId);
    if (!claim) {
      throw new Error(`پرونده خسارت با شناسه ${claimId} یافت نشد.`);
    }

    const updated = updateClaimStatusWorkflow(claim, newStatus, statusSource, settlementAmount);
    await this.repository.saveClaim(updated);
    await this.emitEvent('property_insurance.claim.reference_updated', claimId, claim.userId, { updated });
    return updated;
  }

  async getPolicyClaims(policyId: string): Promise<InsuranceClaimReference[]> {
    return this.repository.listClaimsByPolicy(policyId);
  }
}

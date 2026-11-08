/**
 * Primary Facade Service for Mortgage & Real Estate Financing Intelligence
 * (`server/modules/financing-intelligence/service.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import { randomUUID } from 'node:crypto';
import { compareFinancingProducts, CompareProductsQuery } from './comparisonEngine.js';
import {
  FinancingEventOutboxPublisher,
  GeographyJurisdictionAdapter,
  PropertyRegistryReferenceAdapter,
  PropertyValuationAdapter
} from './contracts.js';
import {
  evaluateProductEligibility,
  EligibilityEvaluationQuery,
  ProductEligibilityEvaluationResult
} from './eligibilityEngine.js';
import {
  calculateAmortizationSchedule,
  calculateEarlyRepayment,
  calculateLtvAndContribution,
  calculateRefinancing,
  evaluateAffordability
} from './formulas.js';
import { FinancingRepository } from './repository.js';
import {
  AffordabilityEvaluationInput,
  AffordabilityEvaluationResult,
  AmortizationScheduleResult,
  EarlyRepaymentScenarioInput,
  EarlyRepaymentScenarioResult,
  FinancingDomainEvent,
  FinancingInstitution,
  FinancingProduct,
  ProductComparisonReport,
  RefinancingScenarioInput,
  RefinancingScenarioResult,
  RepaymentMethod
} from './types.js';

export class FinancingIntelligenceService {
  constructor(
    private readonly repository: FinancingRepository,
    private readonly outboxPublisher?: FinancingEventOutboxPublisher,
    private readonly valuationAdapter?: PropertyValuationAdapter,
    private readonly propertyAdapter?: PropertyRegistryReferenceAdapter,
    private readonly geographyAdapter?: GeographyJurisdictionAdapter
  ) {}

  private async emitEvent(
    eventType: FinancingDomainEvent['eventType'],
    aggregateId: string,
    actorUserId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.outboxPublisher) return;
    const event: FinancingDomainEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateId,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString()
    };
    await this.outboxPublisher.publish(event);
  }

  // --- 1. Institution Directory ---

  async registerInstitution(input: Omit<FinancingInstitution, 'createdAtIso' | 'updatedAtIso'>): Promise<FinancingInstitution> {
    const nowIso = new Date().toISOString();
    const inst: FinancingInstitution = {
      ...input,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };
    await this.repository.saveInstitution(inst);
    await this.emitEvent('financing.institution.created', inst.institutionId, undefined, { inst });
    return inst;
  }

  async getInstitution(institutionId: string): Promise<FinancingInstitution | null> {
    return this.repository.findInstitutionById(institutionId);
  }

  async listInstitutions(jurisdiction?: string): Promise<FinancingInstitution[]> {
    return this.repository.listInstitutions(jurisdiction);
  }

  // --- 2. Product Catalog & Versioning ---

  async createProduct(
    input: Omit<FinancingProduct, 'productVersion' | 'isStale' | 'createdAtIso' | 'updatedAtIso'>
  ): Promise<FinancingProduct> {
    // Validate institution exists
    const inst = await this.repository.findInstitutionById(input.institutionId);
    if (!inst) {
      throw new Error(`موسسه مالی با شناسه ${input.institutionId} یافت نشد.`);
    }

    // Verify jurisdiction if adapter available
    if (this.geographyAdapter) {
      const supported = await this.geographyAdapter.verifyJurisdictionSupported(input.jurisdiction);
      if (!supported) {
        throw new Error(`حوزه قضایی ${input.jurisdiction} پشتیبانی نمی‌شود.`);
      }
    }

    const nowIso = new Date().toISOString();
    const product: FinancingProduct = {
      ...input,
      productVersion: 1,
      isStale: false,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(product);
    await this.emitEvent('financing.product.created', product.productId, undefined, { product });
    return product;
  }

  async updateProductVersion(
    productId: string,
    updates: Partial<Omit<FinancingProduct, 'productId' | 'productVersion' | 'createdAtIso' | 'updatedAtIso'>>
  ): Promise<FinancingProduct> {
    const existing = await this.repository.findProductById(productId);
    if (!existing) {
      throw new Error(`محصول تسهیلاتی با شناسه ${productId} یافت نشد.`);
    }

    const nowIso = new Date().toISOString();
    const updatedProduct: FinancingProduct = {
      ...existing,
      ...updates,
      productId: existing.productId,
      productVersion: existing.productVersion + 1,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(updatedProduct);
    await this.emitEvent('financing.product.versioned', productId, undefined, { updatedProduct });
    return updatedProduct;
  }

  async discontinueProduct(productId: string, reasonFa: string): Promise<FinancingProduct> {
    const existing = await this.repository.findProductById(productId);
    if (!existing) {
      throw new Error(`محصول تسهیلاتی با شناسه ${productId} یافت نشد.`);
    }

    const nowIso = new Date().toISOString();
    const updated: FinancingProduct = {
      ...existing,
      availabilityStatus: 'discontinued',
      effectiveUntilIso: nowIso,
      productVersion: existing.productVersion + 1,
      updatedAtIso: nowIso
    };

    await this.repository.saveProduct(updated);
    await this.emitEvent('financing.product.discontinued', productId, undefined, { reasonFa });
    return updated;
  }

  async getProduct(productId: string): Promise<FinancingProduct | null> {
    return this.repository.findProductById(productId);
  }

  async getProductHistory(productId: string): Promise<FinancingProduct[]> {
    return this.repository.findProductHistory(productId);
  }

  async listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: FinancingProduct[]; nextCursor?: string; totalCount: number }> {
    return this.repository.listProducts(filters);
  }

  // --- 3. Eligibility Criteria Evaluation ---

  async evaluateEligibility(
    productId: string,
    query: EligibilityEvaluationQuery
  ): Promise<ProductEligibilityEvaluationResult> {
    const product = await this.repository.findProductById(productId);
    if (!product) {
      throw new Error(`محصول با شناسه ${productId} یافت نشد.`);
    }

    const result = evaluateProductEligibility(product, query);
    await this.emitEvent('financing.eligibility.evaluated' as FinancingDomainEvent['eventType'], productId, undefined, { query, result });
    return result;
  }

  // --- 4. Core Calculations & Scenarios ---

  calculateLtv(
    propertyValue: number,
    financingAmount: number
  ): { ltvPercent: number; borrowerContributionAmount: number; borrowerContributionPercent: number } {
    return calculateLtvAndContribution(propertyValue, financingAmount);
  }

  async calculateAmortization(
    principalAmount: number,
    annualInterestRatePercent: number,
    repaymentPeriodMonths: number,
    repaymentMethod: RepaymentMethod = 'equal_installments',
    currency: string = 'IRR'
  ): Promise<AmortizationScheduleResult> {
    const result = calculateAmortizationSchedule(
      principalAmount,
      annualInterestRatePercent,
      repaymentPeriodMonths,
      repaymentMethod,
      currency
    );

    await this.repository.saveCalculation(result);
    await this.emitEvent('financing.calculation.completed', result.calculationId, undefined, { result });
    return result;
  }

  async evaluateAffordabilityScenario(input: AffordabilityEvaluationInput): Promise<AffordabilityEvaluationResult> {
    const result = evaluateAffordability(input);
    await this.emitEvent('financing.scenario.created', randomUUID(), undefined, { type: 'affordability', result });
    return result;
  }

  async calculateEarlyRepaymentScenario(input: EarlyRepaymentScenarioInput): Promise<EarlyRepaymentScenarioResult> {
    const result = calculateEarlyRepayment(input);
    await this.emitEvent('financing.scenario.created', randomUUID(), undefined, { type: 'early_repayment', result });
    return result;
  }

  async calculateRefinancingScenario(input: RefinancingScenarioInput): Promise<RefinancingScenarioResult> {
    const result = calculateRefinancing(input);
    await this.emitEvent('financing.scenario.created', randomUUID(), undefined, { type: 'refinancing', result });
    return result;
  }

  // --- 5. Product Comparison Engine ---

  async compareProducts(query: CompareProductsQuery): Promise<ProductComparisonReport> {
    const { products } = await this.repository.listProducts({
      jurisdiction: query.jurisdiction,
      currency: query.currency
    });

    const institutionsList = await this.repository.listInstitutions(query.jurisdiction);
    const institutionsMap = new Map<string, FinancingInstitution>();
    for (const inst of institutionsList) {
      institutionsMap.set(inst.institutionId, inst);
    }

    const report = compareFinancingProducts(products, institutionsMap, query);
    await this.repository.saveComparisonReport(report);
    await this.emitEvent('financing.comparison.created', report.comparisonId, undefined, { report });
    return report;
  }
}

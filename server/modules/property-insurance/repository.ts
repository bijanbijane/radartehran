/**
 * Property Insurance Repository & In-Memory Persistence
 * (`server/modules/property-insurance/repository.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import {
  InsuranceClaimReference,
  InsuranceComparisonReport,
  InsuranceInstitution,
  InsurancePolicyReference,
  InsuranceQuoteReference,
  PremiumEstimateResult,
  PropertyInsuranceProduct
} from './types.js';

export interface PropertyInsuranceRepository {
  saveInstitution(inst: InsuranceInstitution): Promise<void>;
  findInstitutionById(institutionId: string): Promise<InsuranceInstitution | null>;
  listInstitutions(jurisdiction?: string): Promise<InsuranceInstitution[]>;

  saveProduct(product: PropertyInsuranceProduct): Promise<void>;
  findProductById(productId: string): Promise<PropertyInsuranceProduct | null>;
  findProductHistory(productId: string): Promise<PropertyInsuranceProduct[]>;
  listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: PropertyInsuranceProduct[]; nextCursor?: string; totalCount: number }>;

  saveEstimate(estimate: PremiumEstimateResult): Promise<void>;
  findEstimateById(estimateId: string): Promise<PremiumEstimateResult | null>;

  saveQuote(quote: InsuranceQuoteReference): Promise<void>;
  findQuoteById(quoteId: string): Promise<InsuranceQuoteReference | null>;

  savePolicy(policy: InsurancePolicyReference): Promise<void>;
  findPolicyById(policyId: string): Promise<InsurancePolicyReference | null>;
  listPoliciesByUser(userId: string): Promise<InsurancePolicyReference[]>;
  listExpiringPolicies(beforeIso: string): Promise<InsurancePolicyReference[]>;

  saveClaim(claim: InsuranceClaimReference): Promise<void>;
  findClaimById(claimId: string): Promise<InsuranceClaimReference | null>;
  listClaimsByPolicy(policyId: string): Promise<InsuranceClaimReference[]>;

  saveComparisonReport(report: InsuranceComparisonReport): Promise<void>;
  findComparisonReportById(comparisonId: string): Promise<InsuranceComparisonReport | null>;
}

export class InMemoryPropertyInsuranceRepository implements PropertyInsuranceRepository {
  private institutions: Map<string, InsuranceInstitution> = new Map();
  private products: Map<string, PropertyInsuranceProduct> = new Map();
  private productVersions: Map<string, PropertyInsuranceProduct[]> = new Map();
  private estimates: Map<string, PremiumEstimateResult> = new Map();
  private quotes: Map<string, InsuranceQuoteReference> = new Map();
  private policies: Map<string, InsurancePolicyReference> = new Map();
  private claims: Map<string, InsuranceClaimReference> = new Map();
  private comparisonReports: Map<string, InsuranceComparisonReport> = new Map();

  async saveInstitution(inst: InsuranceInstitution): Promise<void> {
    this.institutions.set(inst.institutionId, JSON.parse(JSON.stringify(inst)));
  }

  async findInstitutionById(institutionId: string): Promise<InsuranceInstitution | null> {
    const inst = this.institutions.get(institutionId);
    if (!inst) return null;
    return JSON.parse(JSON.stringify(inst));
  }

  async listInstitutions(jurisdiction?: string): Promise<InsuranceInstitution[]> {
    const list = Array.from(this.institutions.values());
    if (jurisdiction) {
      return list.filter(i => i.jurisdiction === jurisdiction);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async saveProduct(product: PropertyInsuranceProduct): Promise<void> {
    const existing = this.products.get(product.productId);
    if (existing) {
      if (product.productVersion <= existing.productVersion) {
        throw new Error(
          `خطای نسخه محصول بیمه (Version Conflict): نسخه جدید (${product.productVersion}) باید بزرگ‌تر از نسخه فعلی (${existing.productVersion}) باشد.`
        );
      }
    }

    this.products.set(product.productId, JSON.parse(JSON.stringify(product)));

    const history = this.productVersions.get(product.productId) || [];
    history.push(JSON.parse(JSON.stringify(product)));
    this.productVersions.set(product.productId, history);
  }

  async findProductById(productId: string): Promise<PropertyInsuranceProduct | null> {
    const p = this.products.get(productId);
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async findProductHistory(productId: string): Promise<PropertyInsuranceProduct[]> {
    const h = this.productVersions.get(productId);
    if (!h) return [];
    return JSON.parse(JSON.stringify(h));
  }

  async listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: PropertyInsuranceProduct[]; nextCursor?: string; totalCount: number }> {
    let matched = Array.from(this.products.values());

    if (filters.jurisdiction) {
      matched = matched.filter(p => p.jurisdiction === filters.jurisdiction);
    }
    if (filters.currency) {
      matched = matched.filter(p => p.currency === filters.currency);
    }
    if (filters.category) {
      matched = matched.filter(p => p.category === filters.category);
    }
    if (filters.status) {
      matched = matched.filter(p => p.availabilityStatus === filters.status);
    }

    matched.sort((a, b) => a.productId.localeCompare(b.productId));
    const totalCount = matched.length;

    let startIndex = 0;
    if (filters.cursor) {
      const idx = matched.findIndex(p => p.productId === filters.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const limit = Math.max(1, Math.min(filters.limit || 50, 100));
    const paginated = matched.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < matched.length;
    const nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].productId : undefined;

    return {
      products: JSON.parse(JSON.stringify(paginated)),
      nextCursor,
      totalCount
    };
  }

  async saveEstimate(estimate: PremiumEstimateResult): Promise<void> {
    this.estimates.set(estimate.estimateId, JSON.parse(JSON.stringify(estimate)));
  }

  async findEstimateById(estimateId: string): Promise<PremiumEstimateResult | null> {
    const e = this.estimates.get(estimateId);
    if (!e) return null;
    return JSON.parse(JSON.stringify(e));
  }

  async saveQuote(quote: InsuranceQuoteReference): Promise<void> {
    this.quotes.set(quote.quoteReferenceId, JSON.parse(JSON.stringify(quote)));
  }

  async findQuoteById(quoteId: string): Promise<InsuranceQuoteReference | null> {
    const q = this.quotes.get(quoteId);
    if (!q) return null;
    return JSON.parse(JSON.stringify(q));
  }

  async savePolicy(policy: InsurancePolicyReference): Promise<void> {
    this.policies.set(policy.policyReferenceId, JSON.parse(JSON.stringify(policy)));
  }

  async findPolicyById(policyId: string): Promise<InsurancePolicyReference | null> {
    const p = this.policies.get(policyId);
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async listPoliciesByUser(userId: string): Promise<InsurancePolicyReference[]> {
    const list = Array.from(this.policies.values()).filter(p => p.userId === userId);
    return JSON.parse(JSON.stringify(list));
  }

  async listExpiringPolicies(beforeIso: string): Promise<InsurancePolicyReference[]> {
    const thresholdTime = new Date(beforeIso).getTime();
    if (Number.isNaN(thresholdTime)) {
      throw new Error('تاریخ مرجع استعلام انقضای بیمه‌نامه نامعتبر است.');
    }
    const list = Array.from(this.policies.values()).filter(p => {
      const endTime = new Date(p.policyEndDateIso).getTime();
      return endTime <= thresholdTime && p.status !== 'cancelled' && p.status !== 'renewed';
    });
    return JSON.parse(JSON.stringify(list));
  }

  async saveClaim(claim: InsuranceClaimReference): Promise<void> {
    this.claims.set(claim.claimReferenceId, JSON.parse(JSON.stringify(claim)));
  }

  async findClaimById(claimId: string): Promise<InsuranceClaimReference | null> {
    const c = this.claims.get(claimId);
    if (!c) return null;
    return JSON.parse(JSON.stringify(c));
  }

  async listClaimsByPolicy(policyId: string): Promise<InsuranceClaimReference[]> {
    const list = Array.from(this.claims.values()).filter(c => c.policyReferenceId === policyId);
    return JSON.parse(JSON.stringify(list));
  }

  async saveComparisonReport(report: InsuranceComparisonReport): Promise<void> {
    this.comparisonReports.set(report.comparisonId, JSON.parse(JSON.stringify(report)));
  }

  async findComparisonReportById(comparisonId: string): Promise<InsuranceComparisonReport | null> {
    const r = this.comparisonReports.get(comparisonId);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r));
  }

  clear(): void {
    this.institutions.clear();
    this.products.clear();
    this.productVersions.clear();
    this.estimates.clear();
    this.quotes.clear();
    this.policies.clear();
    this.claims.clear();
    this.comparisonReports.clear();
  }
}

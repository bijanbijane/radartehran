/**
 * Financing Intelligence Repository & In-Memory Persistence
 * (`server/modules/financing-intelligence/repository.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import {
  AmortizationScheduleResult,
  FinancingInstitution,
  FinancingProduct,
  ProductComparisonReport
} from './types.js';

export interface FinancingRepository {
  saveInstitution(inst: FinancingInstitution): Promise<void>;
  findInstitutionById(institutionId: string): Promise<FinancingInstitution | null>;
  listInstitutions(jurisdiction?: string): Promise<FinancingInstitution[]>;

  saveProduct(product: FinancingProduct): Promise<void>;
  findProductById(productId: string): Promise<FinancingProduct | null>;
  findProductHistory(productId: string): Promise<FinancingProduct[]>;
  listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: FinancingProduct[]; nextCursor?: string; totalCount: number }>;

  saveCalculation(calc: AmortizationScheduleResult): Promise<void>;
  findCalculationById(calculationId: string): Promise<AmortizationScheduleResult | null>;

  saveComparisonReport(report: ProductComparisonReport): Promise<void>;
  findComparisonReportById(comparisonId: string): Promise<ProductComparisonReport | null>;
}

export class InMemoryFinancingRepository implements FinancingRepository {
  private institutions: Map<string, FinancingInstitution> = new Map();
  private products: Map<string, FinancingProduct> = new Map();
  private productVersions: Map<string, FinancingProduct[]> = new Map();
  private calculations: Map<string, AmortizationScheduleResult> = new Map();
  private comparisonReports: Map<string, ProductComparisonReport> = new Map();

  async saveInstitution(inst: FinancingInstitution): Promise<void> {
    this.institutions.set(inst.institutionId, JSON.parse(JSON.stringify(inst)));
  }

  async findInstitutionById(institutionId: string): Promise<FinancingInstitution | null> {
    const inst = this.institutions.get(institutionId);
    if (!inst) return null;
    return JSON.parse(JSON.stringify(inst));
  }

  async listInstitutions(jurisdiction?: string): Promise<FinancingInstitution[]> {
    const list = Array.from(this.institutions.values());
    if (jurisdiction) {
      return list.filter(i => i.jurisdiction === jurisdiction);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async saveProduct(product: FinancingProduct): Promise<void> {
    const existing = this.products.get(product.productId);
    if (existing) {
      // Check version increment
      if (product.productVersion <= existing.productVersion) {
        throw new Error(
          `خطای نسخه محصول (Product Version Conflict): نسخه جدید (${product.productVersion}) باید بزرگ‌تر از نسخه فعلی (${existing.productVersion}) باشد.`
        );
      }
    }

    // Save latest
    this.products.set(product.productId, JSON.parse(JSON.stringify(product)));

    // Preserve historical version
    const history = this.productVersions.get(product.productId) || [];
    history.push(JSON.parse(JSON.stringify(product)));
    this.productVersions.set(product.productId, history);
  }

  async findProductById(productId: string): Promise<FinancingProduct | null> {
    const p = this.products.get(productId);
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async findProductHistory(productId: string): Promise<FinancingProduct[]> {
    const history = this.productVersions.get(productId);
    if (!history) return [];
    return JSON.parse(JSON.stringify(history));
  }

  async listProducts(filters: {
    jurisdiction?: string;
    currency?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ products: FinancingProduct[]; nextCursor?: string; totalCount: number }> {
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

  async saveCalculation(calc: AmortizationScheduleResult): Promise<void> {
    this.calculations.set(calc.calculationId, JSON.parse(JSON.stringify(calc)));
  }

  async findCalculationById(calculationId: string): Promise<AmortizationScheduleResult | null> {
    const c = this.calculations.get(calculationId);
    if (!c) return null;
    return JSON.parse(JSON.stringify(c));
  }

  async saveComparisonReport(report: ProductComparisonReport): Promise<void> {
    this.comparisonReports.set(report.comparisonId, JSON.parse(JSON.stringify(report)));
  }

  async findComparisonReportById(comparisonId: string): Promise<ProductComparisonReport | null> {
    const r = this.comparisonReports.get(comparisonId);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r));
  }

  clear(): void {
    this.institutions.clear();
    this.products.clear();
    this.productVersions.clear();
    this.calculations.clear();
    this.comparisonReports.clear();
  }
}

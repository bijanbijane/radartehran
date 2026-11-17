/** @file server/modules/platform-foundation/productLifecycleGovernance.ts — Stage 21 Product Lifecycle, RICE+Overrides & Consolidation Debt */
export type FeatureLifecycleStage =
  | 'IDEA_BACKLOG'
  | 'PROBLEM_VALIDATION'
  | 'TECH_LEGAL_REVIEW'
  | 'SANDBOX_BUILD'
  | 'CANARY_PILOT'
  | 'GA_LIMITED'
  | 'GA_FULL'
  | 'OPTIMIZATION'
  | 'DEPRECATION_NOTICE'
  | 'RETIRED';

export interface ProductCapabilityRecord {
  capabilityId: string;
  titleFa: string;
  ownerRole: 'PRODUCT' | 'TECH_LEAD' | 'SECURITY' | 'LEGAL' | 'DATA_SCIENCE' | 'DESIGN' | 'OPS' | 'GROWTH';
  stage: FeatureLifecycleStage;
  reach: number;
  impact: number;
  confidencePct: number;
  effortPersonWeeks: number;
  securityOrLegalBlocker: boolean;
  consolidationDebtNoteFa: string;
}

export function computeAdjustedRiceScore(item: Pick<ProductCapabilityRecord, 'reach' | 'impact' | 'confidencePct' | 'effortPersonWeeks' | 'securityOrLegalBlocker'>): {
  riceScore: number;
  overriddenByGate: boolean;
} {
  if (item.securityOrLegalBlocker) return { riceScore: 0, overriddenByGate: true };
  const effort = Math.max(0.5, item.effortPersonWeeks);
  const raw = (item.reach * item.impact * (Math.min(100, Math.max(10, item.confidencePct)) / 100)) / effort;
  return { riceScore: Number(raw.toFixed(2)), overriddenByGate: false };
}

export class ProductLifecycleGovernanceService {
  private readonly capabilities: ProductCapabilityRecord[] = [
    { capabilityId: 'CAP-SOCIAL-MOD', titleFa: 'نظارت پرونده‌محور جامعه (Stage 5)', ownerRole: 'SECURITY', stage: 'CANARY_PILOT', reach: 80, impact: 3, confidencePct: 85, effortPersonWeeks: 2, securityOrLegalBlocker: false, consolidationDebtNoteFa: 'ادغام مسیرهای تکراری moderation انجام شد.' },
    { capabilityId: 'CAP-PAYMENTS-LIVE', titleFa: 'درگاه پرداخت زنده اسپانسر', ownerRole: 'LEGAL', stage: 'TECH_LEGAL_REVIEW', reach: 40, impact: 3, confidencePct: 50, effortPersonWeeks: 4, securityOrLegalBlocker: true, consolidationDebtNoteFa: 'مسدود تا زمان دریافت مجوز تجاری و حقوقی.' },
    { capabilityId: 'CAP-MARKET-INTEL', titleFa: 'شاخص تفکیکی قیمت پیشنهادی و معامله (Stage 28)', ownerRole: 'DATA_SCIENCE', stage: 'SANDBOX_BUILD', reach: 95, impact: 3, confidencePct: 75, effortPersonWeeks: 3, securityOrLegalBlocker: false, consolidationDebtNoteFa: 'مبتنی بر موتور قطعی hedonicPricingEngine.' },
  ];

  evaluateExperiment(sampleSize: number, deltaPercent: number): {
    status: 'INCONCLUSIVE' | 'SIGNIFICANT_GAIN' | 'REGRESSION';
    reasonFa: string;
  } {
    if (sampleSize < 200) {
      return { status: 'INCONCLUSIVE', reasonFa: 'حجم نمونه برای نتیجه‌گیری آماری کافی نیست (INCONCLUSIVE).' };
    }
    if (deltaPercent >= 5) return { status: 'SIGNIFICANT_GAIN', reasonFa: 'بهبود معنادار در نمونه بالای حداقل آستانه.' };
    if (deltaPercent <= -5) return { status: 'REGRESSION', reasonFa: 'افت عملکرد مشاهده شد.' };
    return { status: 'INCONCLUSIVE', reasonFa: 'تفاوت مشاهده‌شده در بازه خطای تصادفی است.' };
  }

  getProductGovernanceOverview() {
    const ranked = this.capabilities.map((c) => ({ ...c, ...computeAdjustedRiceScore(c) }));
    return {
      status: 'PRODUCT_GOVERNANCE_READY_WITH_LIMITATIONS',
      capabilities: ranked,
      consolidationDebtCount: this.capabilities.filter((c) => Boolean(c.consolidationDebtNoteFa)).length,
    };
  }
}

export const defaultProductLifecycleGovernance = new ProductLifecycleGovernanceService();

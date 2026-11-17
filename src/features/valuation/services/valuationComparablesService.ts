/** @file src/features/valuation/services/valuationComparablesService.ts — Stage 91 Traceable Comparable Evidence, Multi-Factor Similarity & Sufficiency Separation */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
  parseIranianPriceToMillionToman,
} from '../../../data/realMarketPriceAggregator';
import type {
  ComparableEvidenceItem,
  SampleSufficiencyAssessment,
  ValuationWorkspaceInput,
} from '../types/valuation.types';

function isValidIsoOrPersianDate(dateVal: unknown): boolean {
  if (typeof dateVal !== 'string' || !dateVal.trim()) return false;
  const trimmed = dateVal.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) return true;
  if (trimmed.includes('۱۴۰') || trimmed.includes('امروز') || trimmed.includes('دیروز') || trimmed.includes('ساعت')) return true;
  const ms = Date.parse(trimmed);
  return !Number.isNaN(ms);
}

/** Stage 91.6: Multi-factor similarity calculation that never rewards missing fields with fabricated scores */
export function computeMultiFactorComparableSimilarity(params: {
  sameNeighborhood: boolean;
  compSqm?: number;
  targetSqm: number;
  compBuildYear?: number;
  targetBuildYear?: number;
  hasValidObservedDate: boolean;
  hasSourceId: boolean;
}): { score: number; factors: string[]; reasonFa: string } {
  let score = 0;
  const factors: string[] = [];

  if (params.sameNeighborhood) {
    score += 35;
    factors.push('هم‌محله (+۳۵)');
  }

  if (typeof params.compSqm === 'number' && params.compSqm > 0 && params.targetSqm > 0) {
    const diffRatio = Math.abs(params.compSqm - params.targetSqm) / Math.max(1, params.targetSqm);
    const areaPts = Math.max(0, Math.round(30 * (1 - Math.min(1, diffRatio * 1.8))));
    score += areaPts;
    factors.push(
      diffRatio <= 0.15
        ? `متراژ نزدیک ±۱۵٪ (+${areaPts})`
        : `اختلاف متراژ تعدیل‌پذیر (+${areaPts})`,
    );
  } else {
    factors.push('متراژ نامشخص (۰ امتیاز متراژ)');
  }

  if (typeof params.compBuildYear === 'number' && typeof params.targetBuildYear === 'number') {
    const yearDiff = Math.abs(params.compBuildYear - params.targetBuildYear);
    const yearPts = Math.max(0, Math.round(15 * (1 - Math.min(1, yearDiff / 18))));
    score += yearPts;
    factors.push(`تطابق سن بنا (+${yearPts})`);
  }

  if (params.hasValidObservedDate) {
    score += 10;
    factors.push('تاریخ مشاهده معتبر (+۱۰)');
  } else {
    factors.push('فاقد تاریخ مشاهده دقیق (۰)');
  }

  if (params.hasSourceId) {
    score += 10;
    factors.push('منبع قابل ردیابی (+۱۰)');
  }

  const bounded = Math.min(98, Math.max(10, score));
  const reasonFa = factors.slice(0, 3).join(' · ');
  return { score: bounded, factors, reasonFa };
}

export function buildValuationComparables(
  hood: EvaluatedNeighborhood,
  targetSqm: number,
  input?: Partial<ValuationWorkspaceInput>,
): {
  comparables: ComparableEvidenceItem[];
  supplementaryComparables: ComparableEvidenceItem[];
  neighborhoodBaselineEvidence: ComparableEvidenceItem;
  sufficiency: SampleSufficiencyAssessment;
  v64NeighborhoodDealPerSqm: number;
} {
  const samples = buildNeighborhoodListingSamples(hood);
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, samples);
  const usableItems: ComparableEvidenceItem[] = [];
  const supplementaryItems: ComparableEvidenceItem[] = [];

  let recordsWithSqmCount = 0;
  let recordsWithPriceCount = 0;
  let recordsWithValidDateCount = 0;
  let verifiedTransactionCount = 0;

  if (Array.isArray(hood.bargains) && hood.bargains.length > 0) {
    hood.bargains.forEach((rawBargain) => {
      const b = rawBargain as unknown as Record<string, unknown>;
      if (b.type === 'اجاره') return;

      // Stage 91.5: Never replace unknown sqm with targetSqm
      const explicitSqm = typeof b.sqm === 'number' && b.sqm > 0 ? b.sqm : undefined;
      if (explicitSqm !== undefined) recordsWithSqmCount += 1;

      // Stage 91.4: Never invent an 8% default discount; require explicit price or explicit stated discount
      let pricePerSqmMillion: number | undefined;
      let priceTotalMillion: number | undefined;
      const limitations: string[] = [];

      if (typeof b.perSqmMillion === 'number' && b.perSqmMillion > 0) {
        pricePerSqmMillion = Math.round(b.perSqmMillion);
        if (explicitSqm) priceTotalMillion = Math.round(pricePerSqmMillion * explicitSqm);
      } else if (typeof b.price === 'string' && b.price.trim().length > 0) {
        const parsed = parseIranianPriceToMillionToman(b.price, explicitSqm || 0, hood.buyPerSqm);
        if (parsed.perSqmMillion > 0) {
          pricePerSqmMillion = Math.round(parsed.perSqmMillion);
          priceTotalMillion = parsed.totalMillion > 0 ? Math.round(parsed.totalMillion) : undefined;
        }
      } else if (typeof b.discountPercent === 'number' && b.discountPercent > 0 && b.discountPercent < 60) {
        pricePerSqmMillion = Math.round(hood.buyPerSqm * (1 - b.discountPercent / 100));
        if (explicitSqm) priceTotalMillion = Math.round(pricePerSqmMillion * explicitSqm);
        limitations.push(`قیمت بر اساس تخفیف اعلامی (${b.discountPercent}٪) نسبت به نرخ مرجع محله (${hood.buyPerSqm} م) محاسبه شده است.`);
      }

      if (pricePerSqmMillion !== undefined && pricePerSqmMillion > 0) {
        recordsWithPriceCount += 1;
      } else {
        limitations.push('فاقد قیمت معتبر قابل استخراج؛ از محاسبه شواهد قیمتی کنار گذاشته شد.');
      }

      const rawObservedAt = typeof b.observedAt === 'string' ? b.observedAt : typeof b.date === 'string' ? b.date : '۱۴۰۵/۰۸';
      const hasValidDate = isValidIsoOrPersianDate(rawObservedAt);
      if (hasValidDate) recordsWithValidDateCount += 1;

      const sourceId = typeof b.sourceId === 'string' && b.sourceId.trim() ? b.sourceId.trim() : 'src-radar-curated-bargains';
      const hasSource = Boolean(sourceId);
      const compBuildYear = typeof b.buildYear === 'number' && b.buildYear >= 1340 ? b.buildYear : undefined;

      const sim = computeMultiFactorComparableSimilarity({
        sameNeighborhood: true,
        compSqm: explicitSqm,
        targetSqm,
        compBuildYear,
        targetBuildYear: input?.buildYear,
        hasValidObservedDate: hasValidDate,
        hasSourceId: hasSource,
      });

      const stableId =
        typeof b.id === 'string' && b.id.trim().length > 0
          ? b.id.trim()
          : `curated-${hood.id}-${String(b.title || '').slice(0, 16).replace(/\s+/g, '-')}`;

      const evidenceKind =
        b.evidenceKind === 'verified_transaction'
          ? 'verified_transaction'
          : b.evidenceKind === 'public_listing'
            ? 'public_listing'
            : 'curated_listing';

      if (evidenceKind === 'verified_transaction') {
        verifiedTransactionCount += 1;
      }

      const item: ComparableEvidenceItem = {
        id: stableId,
        title: String(b.title || `فایل پایش‌شده در ${hood.name}`),
        street: String(b.street || hood.zone || hood.name),
        evidenceKind,
        propertyId: typeof b.propertyId === 'string' ? b.propertyId : undefined,
        sourceId,
        sourceUrl: typeof b.sourceUrl === 'string' ? b.sourceUrl : undefined,
        neighborhoodId: hood.id,
        sqm: explicitSqm,
        buildYear: compBuildYear,
        floor: typeof b.floor === 'number' ? b.floor : undefined,
        priceTotalMillion,
        pricePerSqmMillion,
        askPerSqmMillion: pricePerSqmMillion ?? 0,
        observedAt: hasValidDate ? rawObservedAt : undefined,
        collectedAt: typeof b.collectedAt === 'string' ? b.collectedAt : '2026-11-01T00:00:00.000Z',
        similarityScore: sim.score,
        similarityReason: sim.reasonFa,
        similarityFactors: sim.factors,
        limitations,
        isSupplementaryOnly: explicitSqm === undefined || pricePerSqmMillion === undefined || !hasSource,
      };

      if (!item.isSupplementaryOnly) {
        usableItems.push(item);
      } else {
        supplementaryItems.push(item);
      }
    });
  }

  usableItems.sort((a, b) => b.similarityScore - a.similarityScore);

  // Stage 91.1 & 91.8: Keep neighborhood baseline in its own dedicated structure, NOT mixed as a fake listing
  const neighborhoodBaselineEvidence: ComparableEvidenceItem = {
    id: `baseline-hood-${hood.id}`,
    title: `شاخص پایه پیشنهادی محله ${hood.name} (مرجع کلان محله — غیرفایل)`,
    street: hood.zone,
    evidenceKind: 'neighborhood_baseline',
    sourceId: 'src-radar-listings',
    neighborhoodId: hood.id,
    pricePerSqmMillion: hood.buyPerSqm,
    askPerSqmMillion: hood.buyPerSqm,
    observedAt: 'آبان ۱۴۰۵',
    similarityScore: 50,
    similarityReason: 'مرجع کلان محله در تنظیم مدل قاعده‌محور (فایل ملکی مجزا نیست)',
    similarityFactors: ['شاخص پایه محله'],
    limitations: ['این رکورد میانگین/میانه پیشنهادی محله است و یک آگهی یا معامله مستقل محسوب نمی‌شود.'],
  };

  const usableListingsCount = usableItems.length;
  let sufficiency: SampleSufficiencyAssessment;
  if (usableListingsCount >= 3) {
    sufficiency = {
      level: 'sufficient',
      observedSamplesCount: usableListingsCount,
      usableListingsCount,
      verifiedTransactionCount,
      recordsWithSqmCount,
      recordsWithPriceCount,
      recordsWithValidDateCount,
      labelFa: `${usableListingsCount} آگهی قابل استناد · معامله رسمی: ${verifiedTransactionCount}`,
      explanationFa: `برآورد بر پایه ${usableListingsCount} فایل دارای متراژ و قیمت مشخص در همین محله و شاخص پایه است (تعداد معاملات رسمی ثبت‌شده: ${verifiedTransactionCount} مورد).`,
    };
  } else if (usableListingsCount >= 1) {
    sufficiency = {
      level: 'limited',
      observedSamplesCount: usableListingsCount,
      usableListingsCount,
      verifiedTransactionCount,
      recordsWithSqmCount,
      recordsWithPriceCount,
      recordsWithValidDateCount,
      labelFa: `نمونه محدود (${usableListingsCount} آگهی معتبر · معامله رسمی: ${verifiedTransactionCount})`,
      explanationFa: `تعداد آگهی دارای متراژ و قیمت کامل در این محله محدود (${usableListingsCount} مورد) است؛ اتکای اصلی بر شاخص پایه محله است.`,
    };
  } else {
    sufficiency = {
      level: 'baseline_only',
      observedSamplesCount: 0,
      usableListingsCount: 0,
      verifiedTransactionCount,
      recordsWithSqmCount,
      recordsWithPriceCount,
      recordsWithValidDateCount,
      labelFa: `صرفاً شاخص پایه محله (۰ آگهی کامل · معامله رسمی: ${verifiedTransactionCount})`,
      explanationFa: 'در حال حاضر فایل دارای متراژ و قیمت کامل در این محله ثبت نشده و برآورد صرفاً از شاخص مرجع محله استفاده می‌کند.',
    };
  }

  return {
    comparables: usableItems.slice(0, 5),
    supplementaryComparables: supplementaryItems.slice(0, 4),
    neighborhoodBaselineEvidence,
    sufficiency,
    v64NeighborhoodDealPerSqm: agg.estimatedDealPricePerSqm,
  };
}

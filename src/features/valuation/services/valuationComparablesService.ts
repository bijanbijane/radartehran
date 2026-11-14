/** @file src/features/valuation/services/valuationComparablesService.ts — Valuation Comparable Evidence & Sufficiency */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import type { ComparableEvidenceItem, SampleSufficiencyAssessment } from '../types/valuation.types';

export function buildValuationComparables(
  hood: EvaluatedNeighborhood,
  targetSqm: number,
): {
  comparables: ComparableEvidenceItem[];
  sufficiency: SampleSufficiencyAssessment;
  v64NeighborhoodDealPerSqm: number;
} {
  const samples = buildNeighborhoodListingSamples(hood);
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, samples);
  const items: ComparableEvidenceItem[] = [];

  if (hood.bargains && hood.bargains.length > 0) {
    hood.bargains.forEach((b, idx) => {
      if (b.type === 'اجاره') return;
      const sqm = typeof b.sqm === 'number' && b.sqm > 0 ? b.sqm : targetSqm;
      const discount = Math.min(60, Math.max(2, Number(b.discountPercent) || 8));
      const askPerSqm = Math.round(hood.buyPerSqm * (1 - discount / 100));
      const areaDiffRatio = Math.abs(sqm - targetSqm) / Math.max(1, targetSqm);
      const similarityScore = Math.max(45, Math.round(95 - areaDiffRatio * 80));

      items.push({
        id: b.id || `comp-${hood.id}-${idx}`,
        title: b.title,
        street: b.street || hood.zone,
        sqm,
        askPerSqmMillion: askPerSqm,
        similarityScore,
        similarityReason:
          areaDiffRatio <= 0.15
            ? 'هم‌محله و متراژ بسیار نزدیک (±۱۵٪)'
            : 'هم‌محله با اختلاف متراژ بیشتر (تعدیل‌پذیر)',
        evidenceKind: 'curated_asking',
      });
    });
  }

  items.push({
    id: `comp-base-${hood.id}`,
    title: `شاخص پایه پیشنهادی محله ${hood.name}`,
    street: hood.zone,
    sqm: targetSqm,
    askPerSqmMillion: hood.buyPerSqm,
    similarityScore: 80,
    similarityReason: 'مرجع کلان محله در تنظیم مدل قاعده‌محور',
    evidenceKind: 'neighborhood_baseline',
  });

  items.sort((a, b) => b.similarityScore - a.similarityScore);

  const liveCount = items.filter((i) => i.evidenceKind === 'curated_asking').length;
  let sufficiency: SampleSufficiencyAssessment;
  if (liveCount >= 3) {
    sufficiency = {
      level: 'sufficient',
      observedSamplesCount: liveCount,
      verifiedTransactionCount: 0,
      labelFa: `کفایت نسبی آگهی‌های مبنا (${liveCount} نمونه محله)`,
      explanationFa: 'برآورد بر پایه چند فایل پیشنهادی هم‌محله و شاخص پایه محله است؛ معامله ثبت‌شده رسمی = ۰ مورد.',
    };
  } else if (liveCount >= 1) {
    sufficiency = {
      level: 'limited',
      observedSamplesCount: liveCount,
      verifiedTransactionCount: 0,
      labelFa: `نمونه محدود (${liveCount} فایل پیشنهادی + شاخص پایه)`,
      explanationFa: 'تعداد فایل مشابه در این محله محدود است؛ اتکای اصلی بر نرخ پایه محله و ضرایب قاعده‌محور است و معامله رسمی = ۰ مورد.',
    };
  } else {
    sufficiency = {
      level: 'baseline_only',
      observedSamplesCount: 0,
      verifiedTransactionCount: 0,
      labelFa: 'مبتنی بر شاخص مرجع محله (بدون فایل زنده هم‌تراز)',
      explanationFa: 'در حال حاضر فایل مشابه زنده برای این متراژ ثبت نشده و مدل از شاخص پایه محله بهره می‌برد (معامله رسمی = ۰ مورد).',
    };
  }

  return {
    comparables: items.slice(0, 4),
    sufficiency,
    v64NeighborhoodDealPerSqm: agg.estimatedDealPricePerSqm,
  };
}

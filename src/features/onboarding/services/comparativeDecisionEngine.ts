/**
 * Stage 38 — Comparative Analysis & Decision Support Engine
 * (RT-UI-COMPARE-001 | مرحله ۳۸: طراحی تجربه مقایسه و تصمیم‌سازی چندمعیاره)
 */

export type ComparisonMode =
  | 'property_to_property'
  | 'neighborhood_to_neighborhood'
  | 'geographic_zone_to_zone'
  | 'market_indicator_trends';

export type ComparisonCellTrustStatus =
  | 'verified' | 'unrecorded' | 'unknown' | 'unverified' | 'stale' | 'conflicting' | 'incomparable';

export type PriceSemanticKind =
  | 'asking_price' | 'confirmed_transaction_price' | 'model_estimated_value' | 'not_price';

export interface ComparisonMetricCell {
  rawValue: number | string | boolean | null;
  displayValueFa: string;
  unitFa: string | null;
  priceSemanticKind: PriceSemanticKind;
  trustStatus: ComparisonCellTrustStatus;
  sourceLabelFa: string;
  updatedAtLabelFa: string;
  sampleCount: number | null;
  limitationNoteFa: string | null;
}

export interface ComparisonOptionItem {
  id: string;
  titleFa: string;
  locationLabelFa: string;
  boundaryVersion: string;
  lat: number;
  lng: number;
  summaryPrimaryLabelFa: string;
  dataQualitySummaryFa: string;
  lastUpdatedFa: string;
  cells: Record<string, ComparisonMetricCell>;
  normalizedScores0To100: Record<string, number | null>;
}

export interface ComparisonCriterionDef {
  id: string;
  categoryFa: string;
  labelFa: string;
  higherIsBetter: boolean | null;
  explanationFa: string;
}

export const COMPARISON_MODE_LIMITS: Record<ComparisonMode, { labelFa: string; min: number; max: number }> = {
  property_to_property: { labelFa: 'مقایسه ملک با ملک', min: 2, max: 4 },
  neighborhood_to_neighborhood: { labelFa: 'مقایسه محله با محله', min: 2, max: 3 },
  geographic_zone_to_zone: { labelFa: 'مقایسه محدوده‌های جغرافیایی', min: 2, max: 3 },
  market_indicator_trends: { labelFa: 'مقایسه شاخص‌های بازار', min: 2, max: 4 },
};

export type CompareTrayStatus = 'empty' | 'single_item' | 'ready' | 'at_capacity';

export function evaluateCompareTrayStatus(
  mode: ComparisonMode,
  selectedCount: number,
): { status: CompareTrayStatus; messageFa: string; canStartComparison: boolean } {
  const limits = COMPARISON_MODE_LIMITS[mode];
  if (selectedCount <= 0) {
    return { status: 'empty', messageFa: 'هنوز موردی برای مقایسه انتخاب نکرده‌اید. از نقشه، جست‌وجو یا فهرست املاک شروع کنید.', canStartComparison: false };
  }
  if (selectedCount < limits.min) {
    return { status: 'single_item', messageFa: 'برای شروع مقایسه، دست‌کم یک گزینه دیگر اضافه کنید.', canStartComparison: false };
  }
  if (selectedCount >= limits.max) {
    return { status: 'at_capacity', messageFa: `ظرفیت انتخاب برای «${limits.labelFa}» (${limits.max} مورد) تکمیل شده است.`, canStartComparison: true };
  }
  return { status: 'ready', messageFa: `${selectedCount} گزینه آماده مقایسه هستند (حداکثر ${limits.max} مورد).`, canStartComparison: true };
}

export function formatMissingOrZeroMetricCell(
  value: number | null | undefined,
  unitFa: string,
  statusWhenNull: 'unrecorded' | 'unknown' = 'unrecorded',
): { displayTextFa: string; isMissing: boolean } {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return { displayTextFa: statusWhenNull === 'unrecorded' ? 'اطلاعات ثبت نشده' : 'وضعیت مشخص نیست', isMissing: true };
  }
  return { displayTextFa: `${value.toLocaleString('fa-IR')} ${unitFa}`.trim(), isMissing: false };
}

export type MatrixViewMode = 'all' | 'differences_only' | 'selected_criteria';

export function filterComparisonCriteriaRows(input: {
  criteria: ComparisonCriterionDef[];
  options: ComparisonOptionItem[];
  viewMode: MatrixViewMode;
  selectedCriteriaIds: string[];
}): ComparisonCriterionDef[] {
  if (input.viewMode === 'selected_criteria') {
    const selectedSet = new Set(input.selectedCriteriaIds);
    return input.criteria.filter((c) => selectedSet.has(c.id));
  }
  if (input.viewMode === 'differences_only' && input.options.length >= 2) {
    return input.criteria.filter((c) => {
      const vals = input.options.map((opt) => {
        const cell = opt.cells[c.id];
        return cell ? `${cell.rawValue ?? 'NULL'}::${cell.trustStatus}` : 'NULL';
      });
      return new Set(vals).size > 1;
    });
  }
  return input.criteria;
}

export function detectBoundaryAndSemanticIncomparability(
  options: ComparisonOptionItem[],
): { hasWarning: boolean; warningsFa: string[] } {
  const warningsFa: string[] = [];
  if (new Set(options.map((o) => o.boundaryVersion)).size > 1) {
    warningsFa.push('گزینه‌ها دارای نسخه‌های مرزی متفاوت هستند؛ مقایسه شاخص‌های مکانی بدون هم‌ارزسازی قطعی نیست.');
  }
  if (options.some((o) => Object.values(o.cells).some((c) => c.trustStatus === 'stale'))) {
    warningsFa.push('اطلاعات دست‌کم یک گزینه نسبت به سایر موارد قدیمی‌تر است. پیش از تصمیم‌گیری، تاریخ داده را بررسی کنید.');
  }
  if (options.some((o) => Object.values(o.cells).some((c) => c.trustStatus === 'conflicting'))) {
    warningsFa.push('در یکی از شاخص‌ها تعارض میان دو منبع ثبت شده است؛ مقدار جایگزین خودکار نشده است.');
  }
  return { hasWarning: warningsFa.length > 0, warningsFa };
}

export interface VerifiableDifferenceClaim {
  criterionId: string;
  claimFa: string;
}

export function generateVerifiableDifferenceClaims(
  options: ComparisonOptionItem[],
  criteria: ComparisonCriterionDef[],
): VerifiableDifferenceClaim[] {
  if (options.length < 2) return [];
  const claims: VerifiableDifferenceClaim[] = [];
  for (const c of criteria) {
    const numericEntries = options
      .map((opt) => ({ opt, val: opt.cells[c.id]?.rawValue, trust: opt.cells[c.id]?.trustStatus }))
      .filter((e): e is { opt: ComparisonOptionItem; val: number; trust: ComparisonCellTrustStatus } =>
        typeof e.val === 'number' && Number.isFinite(e.val) && e.trust !== 'incomparable');
    if (numericEntries.length >= 2) {
      const sorted = [...numericEntries].sort((a, b) => a.val - b.val);
      const chosen = c.higherIsBetter === false ? sorted[0] : sorted[sorted.length - 1];
      if (sorted[0].val !== sorted[sorted.length - 1].val) {
        const qual = chosen.trust === 'stale' ? ' (هشدار: داده قدیمی‌تر)' : chosen.trust === 'unverified' ? ' (تأییدنشده)' : '';
        claims.push({ criterionId: c.id, claimFa: `در شاخص «${c.labelFa}»، «${chosen.opt.titleFa}» با مقدار ${chosen.opt.cells[c.id].displayValueFa} متمایز است${qual}.` });
      }
    }
  }
  return claims.slice(0, 4);
}

export interface MultiCriteriaRankedResult {
  optionId: string;
  titleFa: string;
  weightedScore0To100: number;
  normalizedWeightSumPct: number;
  contributions: Array<{ criterionId: string; labelFa: string; weightedPoints: number; isMissing: boolean }>;
  missingCriteriaLabelsFa: string[];
  computedNoticeFa: string;
}

export function evaluateMultiCriteriaDecision(input: {
  options: ComparisonOptionItem[];
  criteria: ComparisonCriterionDef[];
  weightsPctByCriterion: Record<string, number>;
}): { results: MultiCriteriaRankedResult[]; totalInputWeightPct: number; sensitivityNoteFa: string } {
  const activeCriteria = input.criteria.filter((c) => (input.weightsPctByCriterion[c.id] ?? 0) > 0);
  const totalInputWeightPct = activeCriteria.reduce((acc, c) => acc + Math.max(0, input.weightsPctByCriterion[c.id] ?? 0), 0);
  if (totalInputWeightPct <= 0 || input.options.length === 0) {
    return { results: [], totalInputWeightPct, sensitivityNoteFa: 'وزن معیارها صفر است؛ ابتدا اهمیت حداقل یک معیار را مشخص کنید.' };
  }

  const results: MultiCriteriaRankedResult[] = input.options.map((opt) => {
    let weightedSum = 0;
    const missingCriteriaLabelsFa: string[] = [];
    const contributions: MultiCriteriaRankedResult['contributions'] = [];
    for (const c of activeCriteria) {
      const normWeight = Math.max(0, input.weightsPctByCriterion[c.id] ?? 0) / totalInputWeightPct;
      const rawScore = opt.normalizedScores0To100[c.id];
      const isMissing = rawScore === null || rawScore === undefined || !Number.isFinite(rawScore);
      if (isMissing) {
        missingCriteriaLabelsFa.push(c.labelFa);
        contributions.push({ criterionId: c.id, labelFa: c.labelFa, weightedPoints: 0, isMissing: true });
      } else {
        const pts = Number((rawScore * normWeight).toFixed(1));
        weightedSum += pts;
        contributions.push({ criterionId: c.id, labelFa: c.labelFa, weightedPoints: pts, isMissing: false });
      }
    }
    return {
      optionId: opt.id,
      titleFa: opt.titleFa,
      weightedScore0To100: Number(weightedSum.toFixed(1)),
      normalizedWeightSumPct: 100,
      contributions,
      missingCriteriaLabelsFa,
      computedNoticeFa: missingCriteriaLabelsFa.length > 0
        ? `امتیاز محاسباتی بر اساس معیارهای موجود است؛ ${missingCriteriaLabelsFa.length} معیار بدون داده (۰ امتیاز در سهم) ثبت شد.`
        : 'امتیاز محاسباتی صرفاً بازتاب وزن‌های انتخابی شماست و جایگزین قضاوت نهایی نیست.',
    };
  });
  results.sort((a, b) => b.weightedScore0To100 - a.weightedScore0To100);
  const gap = results.length >= 2 ? Number((results[0].weightedScore0To100 - results[1].weightedScore0To100).toFixed(1)) : 0;
  return {
    results,
    totalInputWeightPct,
    sensitivityNoteFa: results.length >= 2 && gap <= 4
      ? `اختلاف رتبه اول و دوم تنها ${gap} امتیاز است؛ با تغییر جزئی وزن‌ها ممکن است ترتیب گزینه‌ها جابه‌جا شود.`
      : `اختلاف رتبه اول با گزینه دوم ${gap} امتیاز بر مبنای وزن‌های فعلی است.`,
  };
}

export const STAGE38_DESIGN_COMPONENT_IDS = [
  'CMP-01', 'CMP-02', 'CMP-03', 'CMP-04', 'CMP-05', 'CMP-06',
  'CMP-07', 'CMP-08', 'CMP-09', 'CMP-10', 'CMP-11', 'CMP-12',
  'CMP-13', 'CMP-14', 'CMP-15', 'CMP-16', 'CMP-17', 'CMP-18',
] as const;

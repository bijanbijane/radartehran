/** Compact epistemic banner when deal price is heuristic / no verified transactions. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import type { AggregatedMarketMetrics } from '../data/realMarketPriceAggregator';
import { LABEL_ADS_NOT_TRANSACTIONS_FA, LABEL_HEURISTIC_NEGOTIATION_V64_FA } from '../utils/epistemicUiLabels';
import { toPersianNum } from '../data/neighborhoods';

export function EpistemicMarketDisclaimer({ metrics, className = '' }: { metrics: AggregatedMarketMetrics; className?: string }) {
  if (metrics.isDealPriceDisplayableAsFact) return null;
  const text =
    metrics.observedSampleCount === 0
      ? LABEL_ADS_NOT_TRANSACTIONS_FA
      : `${LABEL_HEURISTIC_NEGOTIATION_V64_FA} · ${toPersianNum(metrics.observedSampleCount)} آگهی زنده در مدل`;
  return (
    <p
      role="note"
      className={`text-xs leading-relaxed font-semibold text-amber-900 dark:text-amber-200 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-lg px-2 py-1 ${className}`}
    >
      {text}
    </p>
  );
}

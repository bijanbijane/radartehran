/** UI entry: always uses live listing samples when hood.bargains allows. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { aggregateNeighborhoodMarketMetrics, type AggregatedMarketMetrics } from './realMarketPriceAggregator';
import { buildNeighborhoodListingSamples, type NeighborhoodListingSource } from './neighborhoodListingSamples';
import { LABEL_ADS_NOT_TRANSACTIONS_FA, LABEL_HEURISTIC_NEGOTIATION_V64_FA } from '../utils/epistemicUiLabels';

export interface HoodMarketUiBundle {
  metrics: AggregatedMarketMetrics;
  dealLabelFa: string;
  showDealAsFact: boolean;
  needsEpistemicBanner: boolean;
  epistemicBannerFa: string;
}

export function aggregateHoodMarketForUi(
  hood: NeighborhoodListingSource,
  buyPerSqmOverride?: number,
): HoodMarketUiBundle {
  const buyPerSqm = buyPerSqmOverride ?? hood.buyPerSqm;
  const samples = buildNeighborhoodListingSamples(hood);
  const metrics = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, buyPerSqm, samples);
  const needsEpistemicBanner =
    metrics.verifiedTransactionCount === 0 &&
    (metrics.observedSampleCount === 0 ||
      metrics.provenance === 'REFERENCE_BASELINE' ||
      metrics.provenance === 'HEURISTIC_ESTIMATE');
  const epistemicBannerFa =
    metrics.observedSampleCount === 0 ? LABEL_ADS_NOT_TRANSACTIONS_FA : LABEL_HEURISTIC_NEGOTIATION_V64_FA;
  return {
    metrics,
    dealLabelFa: metrics.displayDealLabelFa,
    showDealAsFact: metrics.isDealPriceDisplayableAsFact,
    needsEpistemicBanner,
    epistemicBannerFa,
  };
}

/** Prefer full `hood` (with bargains) when available so observed samples align across views. */
export function aggregateMarketMetricsForHood(
  hood: NeighborhoodListingSource,
  buyPerSqmOverride?: number,
): AggregatedMarketMetrics {
  return aggregateHoodMarketForUi(hood, buyPerSqmOverride).metrics;
}

export function aggregateMarketMetricsForScalars(
  hoodId: number,
  hoodName: string,
  buyPerSqm: number,
  hoodWithBargains?: NeighborhoodListingSource | null,
): AggregatedMarketMetrics {
  const hood: NeighborhoodListingSource = hoodWithBargains
    ? { ...hoodWithBargains, id: hoodId, name: hoodName, buyPerSqm }
    : { id: hoodId, name: hoodName, buyPerSqm };
  return aggregateMarketMetricsForHood(hood, buyPerSqm);
}

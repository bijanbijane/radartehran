/** Memoized v6.4 deal price per sqm by hood for list/grid ranking views. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { useMemo } from 'react';
import type { EvaluatedNeighborhood } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';

export function useDealPriceByHoodIdMap(hoods: readonly EvaluatedNeighborhood[]): ReadonlyMap<number, number> {
  return useMemo(() => {
    const m = new Map<number, number>();
    hoods.forEach((hood) => {
      m.set(
        hood.id,
        aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood))
          .estimatedDealPricePerSqm,
      );
    });
    return m;
  }, [hoods]);
}

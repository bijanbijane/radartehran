/** Epistemic deal-pricing banner & Stage 17 Neighborhood Intelligence Profile for Discover header (selected hood). OP-DEC-001: formatMillionTomanAsIntlCurrency */
import React, { useMemo } from 'react';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { aggregateHoodMarketForUi } from '../../data/aggregateHoodMarketForUi';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';
import { NeighborhoodIntelligenceProfilePanel } from '../../features/neighborhoods/components/NeighborhoodIntelligenceProfilePanel';

export function DiscoverSelectedHoodEpistemicBanner({ hood }: { hood: EvaluatedNeighborhood }): React.ReactElement {
  const metrics = useMemo(() => aggregateHoodMarketForUi(hood).metrics, [hood]);
  return (
    <div className="space-y-2">
      <EpistemicMarketDisclaimer metrics={metrics} className="mt-2 max-w-xl" />
      <NeighborhoodIntelligenceProfilePanel
        hood={hood}
        allNeighborhoods={INITIAL_NEIGHBORHOODS}
        dealPricePerSqm={Math.round(hood.buyPerSqm * 0.94)}
      />
    </div>
  );
}

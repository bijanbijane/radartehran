/** Epistemic deal-pricing banner & Stage 17 Neighborhood Intelligence Profile for Discover header (selected hood). OP-DEC-001: formatMillionTomanAsIntlCurrency */
import React, { useMemo } from 'react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import { aggregateHoodMarketForUi } from '../../data/aggregateHoodMarketForUi';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';
import { NeighborhoodIntelligenceProfilePanel } from '../../features/neighborhoods/components/NeighborhoodIntelligenceProfilePanel';

export interface DiscoverSelectedHoodEpistemicBannerProps {
  hood: EvaluatedNeighborhood;
  cityId?: CityId | string;
  allNeighborhoods?: readonly EvaluatedNeighborhood[];
}

export function DiscoverSelectedHoodEpistemicBanner({ hood, cityId = 'tehran', allNeighborhoods }: DiscoverSelectedHoodEpistemicBannerProps): React.ReactElement {
  const metrics = useMemo(() => aggregateHoodMarketForUi(hood).metrics, [hood]);
  return (
    <div className="space-y-2">
      <EpistemicMarketDisclaimer metrics={metrics} className="mt-2 max-w-xl" />
      <NeighborhoodIntelligenceProfilePanel
        hood={hood}
        cityId={cityId}
        allNeighborhoods={allNeighborhoods && allNeighborhoods.length > 0 ? allNeighborhoods : [hood]}
        dealPricePerSqm={metrics.observedSampleCount > 0 ? metrics.estimatedDealPricePerSqm : undefined}
      />
    </div>
  );
}

/** Epistemic deal-pricing banner for Discover header (selected hood). */
import React, { useMemo } from 'react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import { aggregateHoodMarketForUi } from '../../data/aggregateHoodMarketForUi';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';

export interface DiscoverSelectedHoodEpistemicBannerProps {
  hood: EvaluatedNeighborhood;
  cityId?: CityId | string;
  allNeighborhoods?: readonly EvaluatedNeighborhood[];
}

export function DiscoverSelectedHoodEpistemicBanner({
  hood,
}: DiscoverSelectedHoodEpistemicBannerProps): React.ReactElement {
  const metrics = useMemo(() => aggregateHoodMarketForUi(hood).metrics, [hood]);
  return (
    <div className="space-y-2">
      <EpistemicMarketDisclaimer metrics={metrics} className="mt-2 max-w-xl" />
    </div>
  );
}

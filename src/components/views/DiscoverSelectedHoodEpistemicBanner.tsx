/** Epistemic deal-pricing banner for Discover header (selected hood). OP-DEC-001: formatMillionTomanAsIntlCurrency */
import React, { useMemo } from 'react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { aggregateHoodMarketForUi } from '../../data/aggregateHoodMarketForUi';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';

export function DiscoverSelectedHoodEpistemicBanner({ hood }: { hood: EvaluatedNeighborhood }): React.ReactElement {
  const metrics = useMemo(() => aggregateHoodMarketForUi(hood).metrics, [hood]);
  return <EpistemicMarketDisclaimer metrics={metrics} className="mt-2 max-w-xl" />;
}

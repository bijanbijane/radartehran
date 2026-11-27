import type { EvaluatedNeighborhood } from '../../data/neighborhoods';

/**
 * Returns the statistical median for valid positive neighborhood price samples.
 * Null means there is no usable sample; callers must not render a fabricated zero.
 */
export function calculateNeighborhoodMedianMetric(
  neighborhoods: readonly EvaluatedNeighborhood[],
  mode: 'rent' | 'buy',
): number | null {
  const values = neighborhoods
    .map((neighborhood) => (mode === 'buy' ? neighborhood.buyPerSqm : neighborhood.rahn80m))
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle];

  return (values[middle - 1] + values[middle]) / 2;
}

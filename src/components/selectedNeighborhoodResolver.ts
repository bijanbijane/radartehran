import type { EvaluatedNeighborhood } from '../data/neighborhoods';

/**
 * Resolve a selected neighborhood only when its ID exists in the current or
 * nationwide evaluated dataset. Never substitute an unrelated first result.
 */
export function resolveSelectedNeighborhoodById(
  selectedHoodId: number,
  currentCityNeighborhoods: readonly EvaluatedNeighborhood[],
  nationwideNeighborhoods: readonly EvaluatedNeighborhood[],
): EvaluatedNeighborhood | undefined {
  return (
    currentCityNeighborhoods.find((hood) => hood.id === selectedHoodId) ??
    nationwideNeighborhoods.find((hood) => hood.id === selectedHoodId)
  );
}

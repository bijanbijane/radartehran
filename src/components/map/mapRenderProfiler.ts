import {
  clearMapLayerProfiles,
  getMapLayerProfiles,
  recordMapLayerProfile,
  type LayerOperationCounts,
  type MapLayerKind,
  type MapLayerProfileEntry,
} from '../../utils/diagnostics';

export type { LayerOperationCounts, MapLayerKind, MapLayerProfileEntry };
export { clearMapLayerProfiles, getMapLayerProfiles };

export interface MapLayerProfile {
  layer: MapLayerKind;
  created: number;
  updated: number;
  removed: number;
  retained: number;
  durationMs: number;
  reason: string;
}

export function deriveDiffReason(counts: LayerOperationCounts, baseReason: string): string {
  if (counts.created === 0 && counts.updated === 0 && counts.removed === 0) {
    return counts.retained > 0 ? 'no-op' : `${baseReason}:empty`;
  }
  if (counts.removed > 0 && counts.created === 0 && counts.updated === 0) {
    return `${baseReason}:pruned`;
  }
  if (counts.created > 0 && counts.updated === 0 && counts.removed === 0) {
    return `${baseReason}:initial-or-expand`;
  }
  return baseReason;
}

export function profileLayerReconciliation(
  layer: MapLayerKind,
  baseReason: string,
  reconcileFn: () => LayerOperationCounts
): LayerOperationCounts {
  const startMs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const counts = reconcileFn();
  const endMs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const durationMs = Math.max(0, endMs - startMs);
  recordMapLayerProfile(layer, counts, durationMs, deriveDiffReason(counts, baseReason));
  return counts;
}

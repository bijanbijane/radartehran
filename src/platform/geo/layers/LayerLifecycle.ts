import { MapLayerType } from '../core/GeoTypes';
import { LayerRegistry } from './LayerRegistry';

export interface DiffUpdateResult<T> {
  added: T[];
  updated: T[];
  removedIds: string[];
  unchangedCount: number;
}

export function computeKeyedLayerDiff<T extends { id: string; revisionHash?: string }>(
  previousItems: Map<string, T>,
  nextItems: readonly T[]
): DiffUpdateResult<T> {
  const added: T[] = [];
  const updated: T[] = [];
  let unchangedCount = 0;
  const seenIds = new Set<string>();

  for (const item of nextItems) {
    seenIds.add(item.id);
    const prev = previousItems.get(item.id);
    if (!prev) {
      added.push(item);
    } else if (prev.revisionHash !== item.revisionHash) {
      updated.push(item);
    } else {
      unchangedCount += 1;
    }
  }

  const removedIds: string[] = [];
  for (const prevId of previousItems.keys()) {
    if (!seenIds.has(prevId)) {
      removedIds.push(prevId);
    }
  }

  return { added, updated, removedIds, unchangedCount };
}

export function transitionLayerData<T extends { id: string }>(
  registry: LayerRegistry,
  layerType: MapLayerType,
  items: readonly T[]
): number {
  const handle = registry.updateLayerItems(layerType, items.length);
  return handle.itemCount;
}

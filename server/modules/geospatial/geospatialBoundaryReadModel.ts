import type { BoundaryVersionRecord } from './types';

export function pickActiveBoundaryVersion(history: BoundaryVersionRecord[]): BoundaryVersionRecord | null {
  const active = history.filter((record) => record.status === 'ACTIVE');
  return active.length === 1 ? structuredClone(active[0]) : null;
}

export function pickLatestBoundaryVersion(history: BoundaryVersionRecord[]): BoundaryVersionRecord | null {
  const latest = history[history.length - 1];
  return latest ? structuredClone(latest) : null;
}

export function detectActiveBoundaryBboxOverlaps(
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>,
  cityId: string,
  level: BoundaryVersionRecord['level'] = 'neighborhood',
  bboxOverlap: (a: BoundaryVersionRecord['boundingBox'], b: BoundaryVersionRecord['boundingBox']) => boolean,
): Array<{ entityA: string; entityB: string }> {
  const activeList: BoundaryVersionRecord[] = [];
  for (const history of boundaryHistoryByEntity.values()) {
    const active = history.filter((record) => record.status === 'ACTIVE');
    // Validate lifecycle uniqueness across the complete entity history before
    // applying city/level filters. A conflicting ACTIVE record with mismatched
    // metadata must not make the remaining record look authoritative.
    if (active.length !== 1) continue;
    if (active[0].cityId === cityId && active[0].level === level) {
      activeList.push(active[0]);
    }
  }
  const overlaps: Array<{ entityA: string; entityB: string }> = [];
  for (let i = 0; i < activeList.length; i++) {
    for (let j = i + 1; j < activeList.length; j++) {
      if (bboxOverlap(activeList[i].boundingBox, activeList[j].boundingBox)) {
        overlaps.push({ entityA: activeList[i].entityId, entityB: activeList[j].entityId });
      }
    }
  }
  return overlaps;
}
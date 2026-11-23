import type { BoundaryVersionRecord } from './types';

export function pickActiveBoundaryVersion(history: BoundaryVersionRecord[]): BoundaryVersionRecord | null {
  const active = history.find((b) => b.status === 'ACTIVE');
  return active ? structuredClone(active) : null;
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
    const act = history.find((b) => b.status === 'ACTIVE' && b.cityId === cityId && b.level === level);
    if (act) activeList.push(act);
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
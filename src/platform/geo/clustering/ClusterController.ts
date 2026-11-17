import { SpatialPointItem } from '../core/GeoTypes';
import { ClusterPolicyDecision, resolveClusterPolicy } from './ClusterPolicy';

export interface SpatialClusterNode<T = Record<string, unknown>> {
  id: string;
  isCluster: boolean;
  lat: number;
  lng: number;
  count: number;
  avgPricePerSqm: number | null;
  goldPinCount: number;
  memberIds: string[];
  singleItem?: SpatialPointItem<T>;
}

export interface ClusteringExecutionResult<T = Record<string, unknown>> {
  policy: ClusterPolicyDecision;
  nodes: SpatialClusterNode<T>[];
}

export function buildSpatialClusters<T = Record<string, unknown>>(
  items: readonly SpatialPointItem<T>[],
  zoom: number
): ClusteringExecutionResult<T> {
  const policy = resolveClusterPolicy(items.length, zoom);

  if (!policy.useClustering || policy.gridCellDegrees <= 0) {
    const nodes: SpatialClusterNode<T>[] = items.map((item) => ({
      id: item.id,
      isCluster: false,
      lat: item.lat,
      lng: item.lng,
      count: 1,
      avgPricePerSqm: item.pricePerSqm ?? null,
      goldPinCount: item.isGoldPin ? 1 : 0,
      memberIds: [item.id],
      singleItem: item,
    }));
    return { policy, nodes };
  }

  const cellDeg = policy.gridCellDegrees;
  const buckets = new Map<string, SpatialPointItem<T>[]>();

  for (const item of items) {
    const r = Math.floor(item.lat / cellDeg);
    const c = Math.floor(item.lng / cellDeg);
    const key = `${r}:${c}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(item);
  }

  const nodes: SpatialClusterNode<T>[] = [];
  for (const [key, group] of buckets.entries()) {
    if (group.length === 1) {
      const single = group[0];
      nodes.push({
        id: single.id,
        isCluster: false,
        lat: single.lat,
        lng: single.lng,
        count: 1,
        avgPricePerSqm: single.pricePerSqm ?? null,
        goldPinCount: single.isGoldPin ? 1 : 0,
        memberIds: [single.id],
        singleItem: single,
      });
      continue;
    }

    let sumLat = 0;
    let sumLng = 0;
    let sumPrice = 0;
    let priceCount = 0;
    let goldPinCount = 0;
    const memberIds: string[] = [];

    for (const pt of group) {
      sumLat += pt.lat;
      sumLng += pt.lng;
      if (pt.pricePerSqm !== undefined && Number.isFinite(pt.pricePerSqm)) {
        sumPrice += pt.pricePerSqm;
        priceCount += 1;
      }
      if (pt.isGoldPin) goldPinCount += 1;
      memberIds.push(pt.id);
    }

    nodes.push({
      id: `cluster:${key}:${group.length}`,
      isCluster: true,
      lat: sumLat / group.length,
      lng: sumLng / group.length,
      count: group.length,
      avgPricePerSqm: priceCount > 0 ? Math.round(sumPrice / priceCount) : null,
      goldPinCount,
      memberIds,
    });
  }

  return { policy, nodes };
}

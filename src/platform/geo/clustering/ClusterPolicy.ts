export type PointDensityTier =
  | 'DIRECT_MARKERS'       // 0 - 100
  | 'LIGHT_CLUSTER'        // 101 - 500
  | 'FULL_CLUSTER_SUMMARY' // 501 - 2,000
  | 'SPATIAL_INDEX_WORKER' // 2,001 - 10,000
  | 'SERVER_AGGREGATION';  // > 10,000

export interface ClusterPolicyDecision {
  tier: PointDensityTier;
  pointCount: number;
  zoom: number;
  renderDirectMarkers: boolean;
  useClustering: boolean;
  useWorkerOffload: boolean;
  requireServerAggregation: boolean;
  gridCellDegrees: number;
}

export function resolveClusterPolicy(pointCount: number, zoom: number): ClusterPolicyDecision {
  const count = Math.max(0, Math.floor(pointCount));
  const clampedZoom = Math.max(9, Math.min(19, Math.round(zoom)));

  if (count <= 100) {
    return {
      tier: 'DIRECT_MARKERS',
      pointCount: count,
      zoom: clampedZoom,
      renderDirectMarkers: true,
      useClustering: false,
      useWorkerOffload: false,
      requireServerAggregation: false,
      gridCellDegrees: 0,
    };
  }

  if (count <= 500) {
    return {
      tier: 'LIGHT_CLUSTER',
      pointCount: count,
      zoom: clampedZoom,
      renderDirectMarkers: clampedZoom >= 16,
      useClustering: clampedZoom < 16,
      useWorkerOffload: false,
      requireServerAggregation: false,
      gridCellDegrees: clampedZoom >= 14 ? 0.008 : 0.02,
    };
  }

  if (count <= 2_000) {
    return {
      tier: 'FULL_CLUSTER_SUMMARY',
      pointCount: count,
      zoom: clampedZoom,
      renderDirectMarkers: clampedZoom >= 17,
      useClustering: clampedZoom < 17,
      useWorkerOffload: false,
      requireServerAggregation: false,
      gridCellDegrees: clampedZoom >= 14 ? 0.012 : 0.03,
    };
  }

  if (count <= 10_000) {
    return {
      tier: 'SPATIAL_INDEX_WORKER',
      pointCount: count,
      zoom: clampedZoom,
      renderDirectMarkers: false,
      useClustering: true,
      useWorkerOffload: true,
      requireServerAggregation: false,
      gridCellDegrees: clampedZoom >= 14 ? 0.015 : 0.04,
    };
  }

  return {
    tier: 'SERVER_AGGREGATION',
    pointCount: count,
    zoom: clampedZoom,
    renderDirectMarkers: false,
    useClustering: true,
    useWorkerOffload: true,
    requireServerAggregation: true,
    gridCellDegrees: 0.05,
  };
}

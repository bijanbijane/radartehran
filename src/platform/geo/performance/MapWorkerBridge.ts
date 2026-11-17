import { BoundingBox, LatLngPoint, SpatialPointItem } from '../core/GeoTypes';
import { buildSpatialClusters, ClusteringExecutionResult } from '../clustering/ClusterController';
import { applySpatialFilterPipeline, SpatialFilterCriteria } from '../spatial/SpatialFilter';

export interface WorkerSpatialTaskPayload<T = Record<string, unknown>> {
  items: readonly SpatialPointItem<T>[];
  zoom: number;
  filter?: SpatialFilterCriteria;
  bounds?: BoundingBox;
  polygonRing?: readonly LatLngPoint[];
}

export class MapWorkerBridge {
  private terminated = false;

  async executeSpatialClusteringTask<T = Record<string, unknown>>(
    payload: WorkerSpatialTaskPayload<T>
  ): Promise<ClusteringExecutionResult<T>> {
    if (this.terminated) {
      throw new Error('MAP_WORKER_BRIDGE_TERMINATED');
    }

    const filtered = applySpatialFilterPipeline(payload.items, {
      ...payload.filter,
      bounds: payload.bounds ?? payload.filter?.bounds,
      polygonRing: payload.polygonRing ?? payload.filter?.polygonRing,
    });

    return buildSpatialClusters(filtered, payload.zoom);
  }

  terminate(): void {
    this.terminated = true;
  }

  isTerminated(): boolean {
    return this.terminated;
  }
}

import { CoreApiError } from '../core';
import type { GeographicOverlayLayer, GeospatialObservabilityMetrics } from './types';

export async function executeUpsertGeographicOverlay(
  layer: GeographicOverlayLayer,
  overlayStore: Map<string, GeographicOverlayLayer>,
  overlayCache: Map<string, GeographicOverlayLayer>,
  persistRuntime: () => Promise<void>,
): Promise<GeographicOverlayLayer> {
  const previousLayer = overlayStore.get(layer.layerId);
  const previousCache = overlayCache.get(layer.layerId);
  overlayStore.set(layer.layerId, structuredClone(layer));
  try {
    await persistRuntime();
  } catch (error) {
    if (previousLayer) overlayStore.set(layer.layerId, previousLayer);
    else overlayStore.delete(layer.layerId);
    if (previousCache) overlayCache.set(layer.layerId, previousCache);
    else overlayCache.delete(layer.layerId);
    throw error;
  }
  overlayCache.delete(layer.layerId);
  return structuredClone(layer);
}

export function executeGetGeographicOverlay(params: {
  layerId: string;
  isAdminCaller: boolean;
  overlayStore: Map<string, GeographicOverlayLayer>;
  overlayCache: Map<string, GeographicOverlayLayer>;
  metrics: GeospatialObservabilityMetrics;
}): GeographicOverlayLayer {
  const cached = params.overlayCache.get(params.layerId);
  if (cached) {
    if (cached.visibilityPolicy === 'ADMIN_ONLY' && !params.isAdminCaller) {
      throw new CoreApiError('FORBIDDEN', 403, 'Access to administrative geographic overlay is restricted.');
    }
    params.metrics.cacheHitsCount += 1;
    return structuredClone(cached);
  }

  params.metrics.cacheMissesCount += 1;
  const layer = params.overlayStore.get(params.layerId);
  if (!layer) {
    throw new CoreApiError('NOT_FOUND', 404, `Geographic overlay '${params.layerId}' not found.`);
  }
  if (layer.visibilityPolicy === 'ADMIN_ONLY' && !params.isAdminCaller) {
    throw new CoreApiError('FORBIDDEN', 403, 'Access to administrative geographic overlay is restricted.');
  }
  params.overlayCache.set(params.layerId, structuredClone(layer));
  return structuredClone(layer);
}
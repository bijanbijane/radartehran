import { GEO_ENGINE_CONFIG, TEHRAN_DEFAULT_CENTER, TEHRAN_METROPOLITAN_BOUNDS } from '../core/GeoConfig';
import { MapViewportState } from '../core/GeoTypes';

export function createInitialViewportState(overrides?: Partial<MapViewportState>): MapViewportState {
  return {
    center: overrides?.center ?? { ...TEHRAN_DEFAULT_CENTER },
    zoom: overrides?.zoom ?? GEO_ENGINE_CONFIG.defaultZoom,
    bounds: overrides?.bounds ?? { ...TEHRAN_METROPOLITAN_BOUNDS },
    selectedNeighborhoodId: overrides?.selectedNeighborhoodId ?? null,
    selectedPropertyId: overrides?.selectedPropertyId ?? null,
    activeLayers: overrides?.activeLayers ?? [...GEO_ENGINE_CONFIG.defaultActiveLayers],
    drawingMode: overrides?.drawingMode ?? 'none',
    viewMode: overrides?.viewMode ?? 'map',
    updatedAt: overrides?.updatedAt ?? Date.now(),
  };
}

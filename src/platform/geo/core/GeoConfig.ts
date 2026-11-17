import { BoundingBox, LatLngPoint, MapLayerType } from './GeoTypes';

export const TEHRAN_DEFAULT_CENTER: LatLngPoint = {
  lat: 35.7219,
  lng: 51.3347,
};

export const TEHRAN_METROPOLITAN_BOUNDS: BoundingBox = {
  north: 35.95,
  south: 35.45,
  east: 51.75,
  west: 50.95,
};

export const IRAN_VALID_BOUNDS: BoundingBox = {
  north: 40.0,
  south: 24.0,
  east: 64.0,
  west: 44.0,
};

export const GEO_ENGINE_CONFIG = {
  coordinateSystem: 'WGS84_EPSG_4326' as const,
  minZoom: 9,
  maxZoom: 19,
  defaultZoom: 12,
  urlSyncDebounceMs: 350,
  tileErrorWarningRatio: 0.3,
  workerOffloadThresholdMs: 50,
  maxActiveMapInstancesPerContainer: 1,
  defaultActiveLayers: ['Tile', 'Boundary', 'Neighborhood', 'Marker', 'GoldPin'] as MapLayerType[],
} as const;

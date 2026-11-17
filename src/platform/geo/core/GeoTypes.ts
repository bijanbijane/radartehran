export type CoordinateSystemId = 'WGS84_EPSG_4326';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export type GeoTuple = [number, number]; // [lat, lng]

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type MapLayerType =
  | 'Tile'
  | 'Boundary'
  | 'Neighborhood'
  | 'Marker'
  | 'GoldPin'
  | 'Heatmap'
  | 'Landmark'
  | 'Route'
  | 'Drawing';

export type MapViewKind = 'map' | 'split' | 'list';

export interface MapViewportState {
  center: LatLngPoint;
  zoom: number;
  bounds: BoundingBox;
  selectedNeighborhoodId: number | null;
  selectedPropertyId: string | null;
  activeLayers: MapLayerType[];
  drawingMode: 'none' | 'polygon' | 'rectangle';
  viewMode: MapViewKind;
  updatedAt: number;
}

export interface SpatialPointItem<T = Record<string, unknown>> {
  id: string;
  lat: number;
  lng: number;
  neighborhoodId?: number;
  pricePerSqm?: number;
  isGoldPin?: boolean;
  payload: T;
}

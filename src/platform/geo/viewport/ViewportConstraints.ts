import { GEO_ENGINE_CONFIG, IRAN_VALID_BOUNDS } from '../core/GeoConfig';
import { BoundingBox, LatLngPoint } from '../core/GeoTypes';

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return GEO_ENGINE_CONFIG.defaultZoom;
  return Math.max(GEO_ENGINE_CONFIG.minZoom, Math.min(GEO_ENGINE_CONFIG.maxZoom, Math.round(zoom)));
}

export function clampCenterToBounds(
  center: LatLngPoint,
  bounds: BoundingBox = IRAN_VALID_BOUNDS
): LatLngPoint {
  const lat = Number.isFinite(center.lat)
    ? Math.max(bounds.south, Math.min(bounds.north, center.lat))
    : 35.7219;
  const lng = Number.isFinite(center.lng)
    ? Math.max(bounds.west, Math.min(bounds.east, center.lng))
    : 51.3347;
  return { lat, lng };
}

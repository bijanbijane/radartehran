import { LatLngPoint } from '../core/GeoTypes';
import { calculatePolylineLengthMeters } from '../core/GeoDistance';
import { adaptPolygonToLeafletRing } from '../leaflet/LeafletAdapters';

export interface RouteDescriptor {
  id: string;
  waypoints: LatLngPoint[];
  leafletPath: [number, number][];
  distanceMeters: number;
  estimatedMinutes: number;
}

export function buildRouteDescriptor(
  id: string,
  waypoints: readonly LatLngPoint[],
  avgSpeedMetersPerMinute = 500
): RouteDescriptor | null {
  const leafletPath = adaptPolygonToLeafletRing(waypoints);
  if (leafletPath.length < 2) return null;
  const validWaypoints = leafletPath.map(([lat, lng]) => ({ lat, lng }));
  const distanceMeters = calculatePolylineLengthMeters(validWaypoints);
  const estimatedMinutes = Math.max(1, Math.round(distanceMeters / Math.max(50, avgSpeedMetersPerMinute)));

  return {
    id,
    waypoints: validWaypoints,
    leafletPath,
    distanceMeters,
    estimatedMinutes,
  };
}

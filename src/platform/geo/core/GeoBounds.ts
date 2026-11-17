import { BoundingBox, LatLngPoint } from './GeoTypes';

export function isValidBoundingBox(box: BoundingBox): boolean {
  if (
    !Number.isFinite(box.north) ||
    !Number.isFinite(box.south) ||
    !Number.isFinite(box.east) ||
    !Number.isFinite(box.west)
  ) {
    return false;
  }
  return (
    box.north >= box.south &&
    box.east >= box.west &&
    box.north <= 90 &&
    box.south >= -90 &&
    box.east <= 180 &&
    box.west >= -180
  );
}

export function isPointInBoundingBox(point: LatLngPoint, box: BoundingBox): boolean {
  if (!isValidBoundingBox(box)) return false;
  return (
    point.lat >= box.south &&
    point.lat <= box.north &&
    point.lng >= box.west &&
    point.lng <= box.east
  );
}

export function doBoundingBoxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  if (!isValidBoundingBox(a) || !isValidBoundingBox(b)) return false;
  return !(
    b.west > a.east ||
    b.east < a.west ||
    b.south > a.north ||
    b.north < a.south
  );
}

export function computeBoundingBoxFromPoints(points: readonly LatLngPoint[]): BoundingBox | null {
  if (!points || points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }

  if (!Number.isFinite(north) || !Number.isFinite(south)) return null;
  return { north, south, east, west };
}

export function expandBoundingBox(box: BoundingBox, paddingDegrees: number): BoundingBox {
  const pad = Math.max(0, paddingDegrees);
  return {
    north: Math.min(90, box.north + pad),
    south: Math.max(-90, box.south - pad),
    east: Math.min(180, box.east + pad),
    west: Math.max(-180, box.west - pad),
  };
}

export function getBoundingBoxCenter(box: BoundingBox): LatLngPoint {
  return {
    lat: (box.north + box.south) / 2,
    lng: (box.east + box.west) / 2,
  };
}

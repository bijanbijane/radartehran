import type { LinearRingCoords, Wgs84Coordinate } from './types';

function isPointOnSegment(
  pt: Wgs84Coordinate,
  v1: [number, number],
  v2: [number, number],
  epsilon = 1e-5,
): boolean {
  const [x1, y1] = v1; // [lng, lat]
  const [x2, y2] = v2;
  const px = pt.lng;
  const py = pt.lat;

  const minX = Math.min(x1, x2) - epsilon;
  const maxX = Math.max(x1, x2) + epsilon;
  const minY = Math.min(y1, y2) - epsilon;
  const maxY = Math.max(y1, y2) + epsilon;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return Math.hypot(px - x1, py - y1) <= epsilon;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY) <= epsilon;
}

export function classifyPointInRing(
  point: Wgs84Coordinate,
  ring: LinearRingCoords,
): 'INSIDE' | 'ON_EDGE' | 'OUTSIDE' {
  if (
    !Array.isArray(ring)
    || ring.length < 4
    || !ring.every((position) =>
      Array.isArray(position)
      && position.length >= 2
      && Number.isFinite(position[0])
      && Number.isFinite(position[1]),
    )
  ) return 'OUTSIDE';
  for (let i = 0; i < ring.length - 1; i++) {
    if (isPointOnSegment(point, ring[i], ring[i + 1])) return 'ON_EDGE';
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > point.lat !== yj > point.lat
      && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside ? 'INSIDE' : 'OUTSIDE';
}


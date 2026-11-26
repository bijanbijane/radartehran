/**
 * Deterministic approximate hexagon geometry for map visualization only.
 * This is not a legal, cadastral, or surveyed neighborhood boundary.
 */
export type LatLngPair = [number, number];

export function computeApproxHexRing(
  lat: number,
  lng: number,
  areaSqKm = 2.5,
  seedId = 1,
): LatLngPair[] {
  const safeLat = Number.isFinite(lat) ? Math.min(41, Math.max(24, lat)) : 35.7219;
  const safeLng = Number.isFinite(lng) ? Math.min(64, Math.max(43, lng)) : 51.3347;
  const radiusKm = Math.min(3.5, Math.max(0.6, Math.sqrt(Math.max(0.2, areaSqKm) / Math.PI)));
  const latDeg = radiusKm / 111.0;
  const lngDeg = radiusKm / Math.max(20, 111.0 * Math.cos((safeLat * Math.PI) / 180));
  const ring: LatLngPair[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + ((seedId % 7) * 0.05);
    ring.push([
      Number((safeLat + latDeg * Math.sin(angle)).toFixed(5)),
      Number((safeLng + lngDeg * Math.cos(angle)).toFixed(5)),
    ]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

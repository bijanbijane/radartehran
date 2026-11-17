import { LatLngPoint } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';

export interface HeatmapPointInput extends LatLngPoint {
  weight: number;
}

export interface NormalizedHeatCell {
  lat: number;
  lng: number;
  intensity: number; // [0..1]
}

export function buildNormalizedHeatmapCells(points: readonly HeatmapPointInput[]): NormalizedHeatCell[] {
  if (!points || points.length === 0) return [];
  let minW = Infinity;
  let maxW = -Infinity;
  const validPoints: HeatmapPointInput[] = [];

  for (const pt of points) {
    const v = validateCoordinate(pt.lat, pt.lng);
    if (!v.valid || !Number.isFinite(pt.weight)) continue;
    validPoints.push({ lat: v.normalized!.lat, lng: v.normalized!.lng, weight: pt.weight });
    if (pt.weight < minW) minW = pt.weight;
    if (pt.weight > maxW) maxW = pt.weight;
  }

  if (validPoints.length === 0) return [];
  const span = maxW - minW;

  return validPoints.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    intensity: span > 0 ? Math.max(0.05, Math.min(1, (p.weight - minW) / span)) : 0.5,
  }));
}

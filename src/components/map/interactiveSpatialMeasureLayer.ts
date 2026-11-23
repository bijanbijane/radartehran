/**
 * @file src/components/map/interactiveSpatialMeasureLayer.ts
 * @description Interactive Leaflet spatial ruler & polygon drawing store, geodesic/travel-time
 * pure helpers, and XSS-safe Leaflet layer reconciler.
 */
import { useSyncExternalStore } from 'react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { escapeHtmlAttr } from '../../utils/security';
import {
  computeGeodesicMeasurement,
  validateDrawnPolygonWGS84,
} from '../../features/map/services/mapExperienceEngine';
import type { GeoPointWGS84, MapMode, MeasurementToolKind } from '../../features/map/types/map.types';

export interface InteractiveSpatialMeasureState {
  mode: MapMode;
  measureKind: MeasurementToolKind;
  points: GeoPointWGS84[];
}

export interface TravelTimeEstimate {
  walkMinutes: number;
  driveMinutes: number;
}

export interface PolygonNeighborhoodMatchResult {
  validPolygon: boolean;
  hasSelfIntersection: boolean;
  areaSqKm: number;
  matched: EvaluatedNeighborhood[];
  avgBuyPerSqm: number | null;
  avgRahn80m: number | null;
}

const INITIAL_STATE: InteractiveSpatialMeasureState = {
  mode: 'explore',
  measureKind: 'linear_distance',
  points: [],
};

let currentState: InteractiveSpatialMeasureState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function getInteractiveSpatialMeasureState(): InteractiveSpatialMeasureState {
  return currentState;
}

export function subscribeInteractiveSpatialMeasure(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInteractiveSpatialMeasureState(): InteractiveSpatialMeasureState {
  return useSyncExternalStore(
    subscribeInteractiveSpatialMeasure,
    getInteractiveSpatialMeasureState,
    getInteractiveSpatialMeasureState,
  );
}

export function setInteractiveSpatialMode(
  mode: MapMode,
  options?: { preservePoints?: boolean },
): void {
  const preservePoints = options?.preservePoints ?? (mode !== 'explore' && currentState.mode !== 'explore');
  const nextPoints = preservePoints ? currentState.points : mode === 'explore' ? [] : currentState.points;
  if (currentState.mode === mode && nextPoints === currentState.points) return;
  currentState = { ...currentState, mode, points: nextPoints };
  emit();
}

export function setInteractiveMeasureKind(measureKind: MeasurementToolKind): void {
  if (currentState.measureKind === measureKind) return;
  currentState = { ...currentState, measureKind };
  emit();
}

export function appendInteractiveSpatialPoint(point: GeoPointWGS84): void {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
  const rounded: GeoPointWGS84 = {
    lat: Math.round(point.lat * 100000) / 100000,
    lng: Math.round(point.lng * 100000) / 100000,
  };
  currentState = { ...currentState, points: [...currentState.points, rounded] };
  emit();
}

export function undoInteractiveSpatialPoint(): void {
  if (currentState.points.length === 0) return;
  currentState = { ...currentState, points: currentState.points.slice(0, -1) };
  emit();
}

export function clearInteractiveSpatialPoints(): void {
  if (currentState.points.length === 0) return;
  currentState = { ...currentState, points: [] };
  emit();
}

export function setInteractiveSpatialPoints(points: readonly GeoPointWGS84[]): void {
  const clean = points.filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
  currentState = { ...currentState, points: [...clean] };
  emit();
}

export function resetInteractiveSpatialMeasure(): void {
  currentState = INITIAL_STATE;
  emit();
}

/**
 * Estimates urban walking (~4.5 km/h) and Tehran city driving (~24 km/h) travel minutes.
 */
export function estimateTravelTimesFromMeters(distanceMeters: number): TravelTimeEstimate {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return { walkMinutes: 0, driveMinutes: 0 };
  }
  const walkMinutes = Math.max(1, Math.round(distanceMeters / 75));
  const driveMinutes = Math.max(1, Math.round(distanceMeters / 400));
  return { walkMinutes, driveMinutes };
}

/**
 * Ray-casting point-in-polygon check in WGS84 lat/lng coordinates.
 */
export function isPointInsidePolygonWGS84(
  point: GeoPointWGS84,
  polygon: readonly GeoPointWGS84[],
): boolean {
  if (polygon.length < 3 || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Validates drawn polygon and finds all neighborhoods contained inside it with average pricing.
 */
export function findNeighborhoodsInsidePolygon(
  points: readonly GeoPointWGS84[],
  neighborhoods: readonly EvaluatedNeighborhood[],
): PolygonNeighborhoodMatchResult {
  const check = validateDrawnPolygonWGS84(points);
  if (!check.valid) {
    return {
      validPolygon: false,
      hasSelfIntersection: check.hasSelfIntersection,
      areaSqKm: 0,
      matched: [],
      avgBuyPerSqm: null,
      avgRahn80m: null,
    };
  }
  const matched = neighborhoods
    .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && isPointInsidePolygonWGS84({ lat: h.lat, lng: h.lng }, points))
    .sort((a, b) => b.overallScore - a.overallScore);

  if (matched.length === 0) {
    return {
      validPolygon: true,
      hasSelfIntersection: false,
      areaSqKm: check.areaSqKm,
      matched: [],
      avgBuyPerSqm: null,
      avgRahn80m: null,
    };
  }

  const avgBuyPerSqm = Math.round(
    matched.reduce((acc, h) => acc + (Number(h.buyPerSqm) || 0), 0) / matched.length,
  );
  const avgRahn80m = Math.round(
    matched.reduce((acc, h) => acc + (Number(h.rahn80m) || 0), 0) / matched.length,
  );

  return {
    validPolygon: true,
    hasSelfIntersection: false,
    areaSqKm: check.areaSqKm,
    matched,
    avgBuyPerSqm,
    avgRahn80m,
  };
}

export function clearInteractiveSpatialMeasureLayer(map: any, groupRef: { current: any }): void {
  if (groupRef.current) {
    try {
      map?.removeLayer?.(groupRef.current);
    } catch { /* ignore */ }
    groupRef.current = null;
  }
}

export function reconcileInteractiveSpatialMeasureLayer(params: {
  L: any;
  map: any;
  groupRef: { current: any };
  state: InteractiveSpatialMeasureState;
  isDarkMap: boolean;
}): void {
  const { L, map, groupRef, state, isDarkMap } = params;
  clearInteractiveSpatialMeasureLayer(map, groupRef);
  if (!L || !map || state.points.length === 0) return;

  const group = L.layerGroup();
  const isPolygonMode = state.mode === 'draw' || (state.mode === 'measure' && state.measureKind === 'area');
  const polygonCheck = isPolygonMode && state.points.length >= 3 ? validateDrawnPolygonWGS84(state.points) : null;
  const strokeColor = polygonCheck && !polygonCheck.valid ? '#e11d48' : isPolygonMode ? '#059669' : '#4f46e5';
  const latLngs = state.points.map((pt) => [pt.lat, pt.lng] as [number, number]);

  if (isPolygonMode && latLngs.length >= 3) {
    const poly = L.polygon(latLngs, {
      color: strokeColor,
      weight: 2.5,
      dashArray: '6, 5',
      fillColor: strokeColor,
      fillOpacity: polygonCheck?.valid ? 0.16 : 0.12,
      interactive: false,
    });
    group.addLayer(poly);
  } else if (latLngs.length >= 2) {
    const line = L.polyline(latLngs, {
      color: strokeColor,
      weight: 3,
      dashArray: '7, 6',
      opacity: 0.92,
      interactive: false,
    });
    group.addLayer(line);
  }

  state.points.forEach((pt, idx) => {
    const safeIdx = escapeHtmlAttr(toPersianNum(idx + 1));
    const pinBg = isDarkMap ? '#0f172a' : '#ffffff';
    const pinText = isDarkMap ? '#f8fafc' : '#0f172a';
    const icon = L.divIcon({
      className: 'radar-spatial-pin-icon',
      html: `<div style="width:22px;height:22px;border-radius:9999px;background:${pinBg};color:${pinText};border:2.5px solid ${strokeColor};display:flex;align-items:center;justify-content:center;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.28);">${safeIdx}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    group.addLayer(L.marker([pt.lat, pt.lng], { icon, interactive: false }));
  });

  if (state.points.length >= 2) {
    const measurement = computeGeodesicMeasurement(isPolygonMode ? 'area' : 'linear_distance', state.points);
    const travel = !isPolygonMode ? estimateTravelTimesFromMeters(measurement.rawValueMetersOrSqm) : null;
    const badgeLabel = isPolygonMode
      ? state.points.length >= 3
        ? polygonCheck?.valid
          ? `مساحت: ${measurement.formattedValueFa}`
          : 'چندضلعی خودمتقاطع است'
        : 'حداقل ۳ نقطه برای بستن محدوده'
      : `فاصله: ${measurement.formattedValueFa} · پیاده ${toPersianNum(travel?.walkMinutes ?? 0)}د · خودرو ${toPersianNum(travel?.driveMinutes ?? 0)}د`;

    const safeLabel = escapeHtmlAttr(badgeLabel);
    const anchorPoint = state.points[state.points.length - 1];
    const labelIcon = L.divIcon({
      className: 'radar-spatial-label-icon',
      html: `<div dir="rtl" style="white-space:nowrap;display:inline-flex;align-items:center;padding:3px 9px;border-radius:8px;background:${isDarkMap ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.96)'};color:${isDarkMap ? '#f8fafc' : '#0f172a'};border:1.5px solid ${strokeColor};font-family:Vazirmatn,Tahoma,sans-serif;font-size:10.5px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,0.2);transform:translate(-50%,-135%);">${safeLabel}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    group.addLayer(L.marker([anchorPoint.lat, anchorPoint.lng], { icon: labelIcon, interactive: false }));
  }

  group.addTo(map);
  groupRef.current = group;
}

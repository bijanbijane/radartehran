/** @file src/features/properties/services/propertyMapService.ts — Viewport Bounds, Privacy Coordinates & Distance Calculation */
import type { GeoBounds } from '../filters/PropertyFilterDraft';
import type { PropertyListingRecord } from '../types/listing.types';

export interface MappedPropertyCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  isCluster: boolean;
  precision: 'exact' | 'approximate' | 'neighborhood';
  privacyRadiusMeters: number;
  items: PropertyListingRecord[];
  primaryItem: PropertyListingRecord;
}

export interface PropertyMapProjection {
  clusters: MappedPropertyCluster[];
  mappedCount: number;
  unavailableCount: number;
  bounds: GeoBounds;
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatStraightLineDistanceFa(km: number): string {
  if (!Number.isFinite(km) || km < 0) return 'نامشخص';
  if (km < 1) return `${Math.round(km * 1000)} متر (فاصله مستقیم خطی)`;
  return `${km.toFixed(1)} کیلومتر (فاصله مستقیم خطی)`;
}

export interface PropertyMapCameraState {
  centerLat: number;
  centerLng: number;
  zoom: number;
  cityId?: string;
}

export const DEFAULT_TEHRAN_CAMERA: PropertyMapCameraState = {
  centerLat: 35.7219,
  centerLng: 51.3347,
  zoom: 12,
  cityId: 'tehran',
};

export function computeCameraViewportBounds(
  centerLat: number,
  centerLng: number,
  zoom = 12,
): GeoBounds {
  const safeLat = Number.isFinite(centerLat) ? centerLat : DEFAULT_TEHRAN_CAMERA.centerLat;
  const safeLng = Number.isFinite(centerLng) ? centerLng : DEFAULT_TEHRAN_CAMERA.centerLng;
  const clampedZoom = Math.min(16, Math.max(9, Number.isFinite(zoom) ? zoom : 12));
  const scale = Math.pow(2, 12 - clampedZoom);
  const halfLat = Math.max(0.005, 0.08 * scale);
  const halfLng = Math.max(0.006, 0.11 * scale);
  return {
    north: Number((safeLat + halfLat).toFixed(6)),
    south: Number((safeLat - halfLat).toFixed(6)),
    east: Number((safeLng + halfLng).toFixed(6)),
    west: Number((safeLng - halfLng).toFixed(6)),
  };
}

export function panCameraViewport(
  camera: PropertyMapCameraState,
  direction: 'north' | 'south' | 'east' | 'west',
  stepFraction = 0.35,
): PropertyMapCameraState {
  const currentBounds = computeCameraViewportBounds(camera.centerLat, camera.centerLng, camera.zoom);
  const latStep = (currentBounds.north - currentBounds.south) * stepFraction;
  const lngStep = (currentBounds.east - currentBounds.west) * stepFraction;
  if (direction === 'north') {
    return { ...camera, centerLat: Math.min(85, Number((camera.centerLat + latStep).toFixed(6))) };
  }
  if (direction === 'south') {
    return { ...camera, centerLat: Math.max(-85, Number((camera.centerLat - latStep).toFixed(6))) };
  }
  if (direction === 'east') {
    return { ...camera, centerLng: Math.min(179, Number((camera.centerLng + lngStep).toFixed(6))) };
  }
  return { ...camera, centerLng: Math.max(-179, Number((camera.centerLng - lngStep).toFixed(6))) };
}

export function buildPropertyMapProjection(
  records: PropertyListingRecord[],
  zoomLevel = 12,
  selectedListingId?: string | null,
  cameraBounds?: GeoBounds | null,
  cameraCenter?: { lat: number; lng: number } | null,
): PropertyMapProjection {
  const mapped: PropertyListingRecord[] = [];
  let unavailableCount = 0;

  for (const r of records) {
    if (
      r.property.locationPrecision === 'unavailable' ||
      r.property.lat === null ||
      r.property.lng === null ||
      !Number.isFinite(r.property.lat) ||
      !Number.isFinite(r.property.lng)
    ) {
      unavailableCount += 1;
    } else {
      mapped.push(r);
    }
  }

  const resolvedBounds: GeoBounds = cameraBounds
    ? { ...cameraBounds }
    : cameraCenter && Number.isFinite(cameraCenter.lat) && Number.isFinite(cameraCenter.lng)
    ? computeCameraViewportBounds(cameraCenter.lat, cameraCenter.lng, zoomLevel)
    : computeCameraViewportBounds(
        DEFAULT_TEHRAN_CAMERA.centerLat,
        DEFAULT_TEHRAN_CAMERA.centerLng,
        zoomLevel,
      );

  // Group into grid cells when zoomed out (< 13) unless listing is explicitly selected
  const cellDeg = zoomLevel >= 14 ? 0.0001 : zoomLevel >= 12 ? 0.015 : 0.032;
  const buckets = new Map<string, PropertyListingRecord[]>();

  for (const rec of mapped) {
    const isSelected = selectedListingId && rec.listing.listingId === selectedListingId;
    const key = isSelected
      ? `pin-${rec.listing.listingId}`
      : `${Math.round((rec.property.lat as number) / cellDeg)}:${Math.round((rec.property.lng as number) / cellDeg)}`;
    const list = buckets.get(key) || [];
    list.push(rec);
    buckets.set(key, list);
  }

  const clusters: MappedPropertyCluster[] = [];
  for (const [key, items] of buckets.entries()) {
    const avgLat = items.reduce((s, x) => s + (x.property.lat as number), 0) / items.length;
    const avgLng = items.reduce((s, x) => s + (x.property.lng as number), 0) / items.length;
    const primary = items[0];
    const p = primary.property.locationPrecision === 'unavailable' ? 'neighborhood' : primary.property.locationPrecision;
    clusters.push({
      id: key,
      lat: avgLat,
      lng: avgLng,
      count: items.length,
      isCluster: items.length > 1,
      precision: items.length > 1 ? 'neighborhood' : p,
      privacyRadiusMeters: primary.property.privacyRadiusMeters,
      items,
      primaryItem: primary,
    });
  }

  return {
    clusters,
    mappedCount: mapped.length,
    unavailableCount,
    bounds: resolvedBounds,
  };
}

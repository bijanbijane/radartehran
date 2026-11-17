import { SpatialPointItem } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';

export interface MarkerDescriptor<T = Record<string, unknown>> {
  id: string;
  lat: number;
  lng: number;
  isGoldPin: boolean;
  isSelected: boolean;
  zIndexOffset: number;
  payload: T;
}

export function buildMarkerDescriptors<T = Record<string, unknown>>(
  points: readonly SpatialPointItem<T>[],
  selectedId?: string | null
): MarkerDescriptor<T>[] {
  const result: MarkerDescriptor<T>[] = [];
  for (const pt of points) {
    const check = validateCoordinate(pt.lat, pt.lng);
    if (!check.valid || !check.normalized) continue;
    const isSelected = selectedId != null && pt.id === selectedId;
    const isGoldPin = Boolean(pt.isGoldPin);
    result.push({
      id: pt.id,
      lat: check.normalized.lat,
      lng: check.normalized.lng,
      isGoldPin,
      isSelected,
      zIndexOffset: isSelected ? 1000 : isGoldPin ? 500 : 0,
      payload: pt.payload,
    });
  }
  return result;
}

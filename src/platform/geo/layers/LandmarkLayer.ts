import { LatLngPoint } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';

export type LandmarkCategory = 'metro' | 'brt' | 'hospital' | 'park' | 'university' | 'shopping';

export interface LandmarkPoint {
  id: string;
  nameFa: string;
  category: LandmarkCategory;
  lat: number;
  lng: number;
}

export function filterValidLandmarks(
  landmarks: readonly LandmarkPoint[],
  categories?: readonly LandmarkCategory[]
): LandmarkPoint[] {
  const allowedSet = categories && categories.length > 0 ? new Set(categories) : null;
  return landmarks.filter((lm) => {
    if (allowedSet && !allowedSet.has(lm.category)) return false;
    return validateCoordinate(lm.lat, lm.lng).valid;
  });
}

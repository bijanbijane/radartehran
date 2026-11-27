import type { CityId, Neighborhood } from '../data/neighborhoods';

export function resolveUrlNeighborhoodEntry(
  hoodParam: string | null,
  validCityParam: CityId | undefined,
  allCityHoods: { cityId: CityId; hood: Neighborhood }[],
): { cityId: CityId; hood: Neighborhood } | null | undefined {
  if (hoodParam === null) return undefined;
  const hoodId = Number(hoodParam.trim());
  if (!Number.isSafeInteger(hoodId) || hoodId <= 0) return null;
  const entry = allCityHoods.find((item) => item.hood.id === hoodId);
  if (!entry || (validCityParam && entry.cityId !== validCityParam)) return null;
  return entry;
}

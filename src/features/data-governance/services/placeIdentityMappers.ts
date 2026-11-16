/**
 * Independent Identity Mappers for Data Provenance & Analytics Place Dimensions.
 * Never infer an entity/place ID by string guessing or city+name concatenation.
 */

const PROVENANCE_ENTITY_BY_HOOD_ID: Readonly<Record<number, string>> = {
  3: 'saadat-abad',
};

const ANALYTICS_PLACE_BY_HOOD_ID: Readonly<Record<number, string>> = {
  3: 'saadat-abad',
  5: 'punak',
};

/** Maps a neighborhood numeric ID to its registered provenance chain ID, or null if none is registered. */
export function resolveProvenanceEntityId(hoodId: number): string | null {
  return PROVENANCE_ENTITY_BY_HOOD_ID[hoodId] ?? null;
}

/** City-scoped governance provenance entity lookup (prevents cross-city ID collisions). */
export function resolveGovernanceEntityId(cityId: string, hoodId: number): string | null {
  return cityId === 'tehran' ? resolveProvenanceEntityId(hoodId) : null;
}

/** Maps a neighborhood numeric ID to its registered SCD2 analytics place ID, or null if none is registered. */
export function resolveAnalyticsPlaceId(hoodId: number, cityId = 'tehran'): string | null {
  return cityId === 'tehran' ? (ANALYTICS_PLACE_BY_HOOD_ID[hoodId] ?? null) : null;
}

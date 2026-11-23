/**
 * Stable, namespaced encodings for pre-IRNI Radar geographic identifiers.
 *
 * These values are lookup keys only. They do not establish that a legacy record
 * is the same real-world entity as an IRNI canonical entity; IRNI must already
 * contain an evidence-backed LegacyIdAliasRecord before resolution can succeed.
 */
export const RADAR_LEGACY_IDENTIFIER_PREFIX = Object.freeze({
  CITY_NEIGHBORHOOD: 'radar:city-hood:v1:',
  GEOGRAPHY_CATALOG: 'radar:geography-catalog:v1:',
  URBAN_INTELLIGENCE: 'radar:urban-intelligence:v1:',
} as const);

export type RadarLegacyIdentifierKind =
  keyof typeof RADAR_LEGACY_IDENTIFIER_PREFIX;

const CITY_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]{0,8}$/;
const GEOGRAPHY_CATALOG_ID_PATTERN = /^hood:[a-z][a-z0-9_-]{0,63}:[1-9][0-9]{0,8}$/;
const URBAN_INTELLIGENCE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}:hood:[1-9][0-9]{0,8}$/;

function requireCityId(cityId: string): string {
  if (
    typeof cityId !== 'string' ||
    cityId.length === 0 ||
    cityId.trim() !== cityId ||
    !CITY_ID_PATTERN.test(cityId)
  ) {
    throw new TypeError('Invalid Radar legacy city identifier.');
  }
  return cityId;
}

function requirePositiveNeighborhoodId(value: number | string): string {
  const candidate = typeof value === 'number'
    ? Number.isSafeInteger(value) && value > 0
      ? String(value)
      : ''
    : value;

  if (
    typeof candidate !== 'string' ||
    !POSITIVE_INTEGER_PATTERN.test(candidate)
  ) {
    throw new TypeError('Invalid Radar legacy neighborhood identifier.');
  }

  return candidate;
}

/**
 * Encodes the legacy database tuple (city_id, hood_id) as one unambiguous key.
 * The tuple remains namespaced; a numeric hood_id is never used by itself.
 */
export function encodeRadarCityNeighborhoodAlias(
  cityId: string,
  neighborhoodId: number | string,
): string {
  return (
    RADAR_LEGACY_IDENTIFIER_PREFIX.CITY_NEIGHBORHOOD +
    requireCityId(cityId) +
    ':' +
    requirePositiveNeighborhoodId(neighborhoodId)
  );
}

/**
 * Encodes the old GeographyCatalog identifier hood:<cityId>:<numericId>.
 * The full old identifier is preserved as an opaque, escaped component.
 */
export function encodeRadarGeographyCatalogAlias(
  legacyGeographicEntityId: string,
): string {
  if (
    typeof legacyGeographicEntityId !== 'string' ||
    !GEOGRAPHY_CATALOG_ID_PATTERN.test(legacyGeographicEntityId)
  ) {
    throw new TypeError('Invalid legacy GeographyCatalog entity identifier.');
  }

  return (
    RADAR_LEGACY_IDENTIFIER_PREFIX.GEOGRAPHY_CATALOG +
    encodeURIComponent(legacyGeographicEntityId)
  );
}

/**
 * Encodes Urban Intelligence identifiers such as tehran:hood:1.
 * No name-based or numeric-only matching is performed.
 */
export function encodeRadarUrbanIntelligenceAlias(
  legacyGeographicEntityId: string,
): string {
  if (
    typeof legacyGeographicEntityId !== 'string' ||
    !URBAN_INTELLIGENCE_ID_PATTERN.test(legacyGeographicEntityId)
  ) {
    throw new TypeError('Invalid legacy Urban Intelligence entity identifier.');
  }

  return (
    RADAR_LEGACY_IDENTIFIER_PREFIX.URBAN_INTELLIGENCE +
    encodeURIComponent(legacyGeographicEntityId)
  );
}

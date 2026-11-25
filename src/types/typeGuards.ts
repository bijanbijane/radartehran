import type { CityId, MapTileServerId, BargainListing, NeighborhoodSponsor, NeighborhoodTrafficInfo, Neighborhood, FeatureFlags, MarketPulseData, ContractCheckResponse, AreaUnitCode, IntlReferenceCurrencyCode, IntlValuationMetadata } from './models'; const VALID_CITY_ID_SET: ReadonlySet<string> = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']); const VALID_TILE_SERVER_SET: ReadonlySet<string> = new Set(['neshan', 'voyager', 'osm']); export function isValidCityId(value: unknown): value is CityId { try { return typeof value === 'string' && VALID_CITY_ID_SET.has(value.trim().toLowerCase()); } catch { return false; } }
export function isValidMapTileServerId(value: unknown): value is MapTileServerId { try { return typeof value === 'string' && VALID_TILE_SERVER_SET.has(value.trim()); } catch { return false; } } export function isBargainListing(candidate: unknown): candidate is BargainListing { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return ( typeof obj.id === 'string' && obj.id.trim().length > 0 && typeof obj.title === 'string' &&
      obj.title.trim().length > 0 && (obj.type === 'خرید' || obj.type === 'اجاره') && typeof obj.sqm === 'number' && Number.isFinite(obj.sqm) &&
      obj.sqm > 0 && typeof obj.priceText === 'string' &&
      typeof obj.discountPercent === 'number' && Number.isFinite(obj.discountPercent) &&
      typeof obj.buyerProfitText === 'string' && typeof obj.street === 'string' ); } catch { return false; } } export function isNeighborhoodSponsor(candidate: unknown): candidate is NeighborhoodSponsor { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return ( typeof obj.name === 'string' &&
      obj.name.trim().length > 0 && typeof obj.phone === 'string' &&
      typeof obj.specialty === 'string' && typeof obj.experienceYears === 'number' &&
      Number.isFinite(obj.experienceYears) ); } catch { return false; } } export function isNeighborhoodTrafficInfo(candidate: unknown): candidate is NeighborhoodTrafficInfo { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return ( typeof obj.liveStatus === 'string' && (obj.liveSeverity === 'heavy' ||
        obj.liveSeverity === 'semi' || obj.liveSeverity === 'smooth') &&
      typeof obj.peakHours === 'string' && typeof obj.seasonalAnalysis === 'string' &&
      typeof obj.bottlenecks === 'string' && typeof obj.trafficScore === 'number' &&
      Number.isFinite(obj.trafficScore) ); } catch { return false; } }
export function isNeighborhood(candidate: unknown): candidate is Neighborhood { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return ( typeof obj.id === 'number' && Number.isInteger(obj.id) &&
      obj.id >= 1 && obj.id <= 999 && typeof obj.name === 'string' && obj.name.trim().length > 0 &&
      typeof obj.zone === 'string' && typeof obj.lat === 'number' && Number.isFinite(obj.lat) && typeof obj.lng === 'number' && Number.isFinite(obj.lng) &&
      typeof obj.buyPerSqm === 'number' && Number.isFinite(obj.buyPerSqm) && obj.buyPerSqm > 0 &&
      typeof obj.rahn80m === 'number' && Number.isFinite(obj.rahn80m) && obj.rahn80m > 0 ); } catch { return false; } }
export function isFeatureFlags(candidate: unknown): candidate is FeatureFlags { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return ( typeof obj.enableCommissionCalc === 'boolean' &&
      typeof obj.enableMultiCity === 'boolean' && typeof obj.enableSponsorBilling === 'boolean' &&
      typeof obj.enableAiContractCheck === 'boolean' && typeof obj.enableTelegramFeed === 'boolean' ); } catch { return false; } }
function isRecordValue(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
/** OP-DEC-001 & OP-DEC-002 Runtime Type Guards for `formatAreaUnitLabel` & `formatMillionTomanAsIntlCurrency` contracts. */
const VALID_AREA_UNITS: ReadonlySet<string> = new Set(['sqm', 'sqft']);
const VALID_INTL_CURRENCIES: ReadonlySet<string> = new Set(['IRT', 'USD', 'EUR', 'AED']);
export function isValidAreaUnitCode(value: unknown): value is AreaUnitCode { return typeof value === 'string' && VALID_AREA_UNITS.has(value.trim()); }
export function isValidIntlReferenceCurrencyCode(value: unknown): value is IntlReferenceCurrencyCode { return typeof value === 'string' && VALID_INTL_CURRENCIES.has(value.trim().toUpperCase()); }
export function hasIntlValuationMetadata(candidate: unknown): candidate is IntlValuationMetadata {
  if (!isRecordValue(candidate)) return false;
  return typeof candidate.displayAreaUnitLabel === 'string' && candidate.displayAreaUnitLabel.trim().length > 0 && typeof candidate.referenceValuationIntlText === 'string' && candidate.referenceValuationIntlText.trim().length > 0;
}
export function isMarketPulseData(
  candidate: unknown
): candidate is MarketPulseData {
  try {
    if (!isRecordValue(candidate)) return false;
    const obj = candidate;
    const validCacheStatuses = ['HIT', 'REFRESHED', 'DEEP_SYNCED', 'FALLBACK'];
    if (
      obj.status !== 'ok' ||
      !validCacheStatuses.includes(String(obj.cacheStatus)) ||
      typeof obj.lastUpdatedIso !== 'string' ||
      !Number.isFinite(Date.parse(obj.lastUpdatedIso)) ||
      typeof obj.lastUpdatedTimeFa !== 'string' ||
      !isFiniteNumberInRange(obj.nextRefreshMinutes, 0, 100_000)
    ) {
      return false;
    }
    const air = obj.airQuality;
    const summary = obj.marketSummary;
    if (!isRecordValue(air) || !isRecordValue(summary)) {
      return false;
    }
    if (
      !isFiniteNumberInRange(air.tehranAverageAqi, 0, 500) ||
      typeof air.statusLabel !== 'string' ||
      typeof air.dominantPollutant !== 'string' ||
      !Array.isArray(air.stations)
    ) {
      return false;
    }
    const validStations = air.stations.every(
      (station: unknown) => {
        if (!isRecordValue(station)) return false;
        return (
          typeof station.region === 'string' &&
          typeof station.stationName === 'string' &&
          isFiniteNumberInRange(station.aqi, 0, 500) &&
          isFiniteNumberInRange(station.pm25, 0, 1000) &&
          typeof station.status === 'string'
        );
      }
    );
    if (!validStations) return false;
    if (
      !isFiniteNumberInRange(
        summary.totalNeighborhoods,
        0,
        100_000
      ) ||
      !Number.isInteger(summary.totalNeighborhoods) ||
      !isFiniteNumberInRange(
        summary.totalBargainsCount,
        0,
        1_000_000
      ) ||
      !Number.isInteger(summary.totalBargainsCount) ||
      !isFiniteNumberInRange(
        summary.tehranAverageBuyPerSqm,
        0,
        1_000_000
      ) ||
      !isFiniteNumberInRange(
        summary.tehranAverageRahn80m,
        0,
        100_000_000
      )
    ) {
      return false;
    }
    const validPriceExtreme = (value: unknown): boolean => {
      if (!isRecordValue(value)) return false;
      return (
        isFiniteNumberInRange(value.id, 1, 100_000) &&
        Number.isInteger(value.id) &&
        typeof value.name === 'string' &&
        typeof value.zone === 'string' &&
        isFiniteNumberInRange(
          value.buyPerSqm,
          0,
          1_000_000
        ) &&
        isFiniteNumberInRange(
          value.rahn80m,
          0,
          100_000_000
        )
      );
    };
    if (
      !validPriceExtreme(summary.cheapestNeighborhood) ||
      !validPriceExtreme(summary.mostExpensiveNeighborhood)
    ) {
      return false;
    }
    if (obj.hoodLiveSnapshots !== undefined) {
      if (!Array.isArray(obj.hoodLiveSnapshots)) {
        return false;
      }
      const validSnapshots = obj.hoodLiveSnapshots.every(
        (snapshot: unknown) => {
          if (!isRecordValue(snapshot)) return false;
          if (
            !isFiniteNumberInRange(
              snapshot.id,
              1,
              100_000
            ) ||
            !Number.isInteger(snapshot.id) ||
            typeof snapshot.name !== 'string' ||
            !isFiniteNumberInRange(
              snapshot.liveBuyPerSqm,
              0,
              1_000_000
            ) ||
            !isFiniteNumberInRange(
              snapshot.liveRahn80m,
              0,
              100_000_000
            ) ||
            !isFiniteNumberInRange(
              snapshot.liveAirScore,
              0,
              10
            ) ||
            !isFiniteNumberInRange(
              snapshot.stationAqi,
              0,
              500
            ) ||
            !isFiniteNumberInRange(
              snapshot.pm25,
              0,
              1000
            ) ||
            !isFiniteNumberInRange(
              snapshot.hourlyChangePercent,
              -100,
              1000
            ) ||
            typeof snapshot.liveTrafficStatus !== 'string' ||
            !isFiniteNumberInRange(
              snapshot.liveTrafficScore,
              0,
              10
            ) ||
            typeof snapshot.peakHours !== 'string' ||
            typeof snapshot.seasonalAnalysis !== 'string' ||
            typeof snapshot.bottlenecks !== 'string'
          ) {
            return false;
          }
          if (snapshot.liveBargains !== undefined) {
            if (!Array.isArray(snapshot.liveBargains)) {
              return false;
            }
            if (
              !snapshot.liveBargains.every(
                (item) => isBargainListing(item)
              )
            ) {
              return false;
            }
          }
          return true;
        }
      );
      if (!validSnapshots) return false;
    }
    if (obj.groundingSources !== undefined) {
      if (!Array.isArray(obj.groundingSources)) {
        return false;
      }
      const validSources = obj.groundingSources.every(
        (source: unknown) => {
          if (!isRecordValue(source)) return false;
          if (
            typeof source.title !== 'string' ||
            source.title.trim().length === 0 ||
            typeof source.uri !== 'string'
          ) {
            return false;
          }
          try {
            return new URL(source.uri).protocol === 'https:';
          } catch {
            return false;
          }
        }
      );
      if (!validSources) return false;
    }
    if (obj.liveMacroRates !== undefined) {
      if (!isRecordValue(obj.liveMacroRates)) {
        return false;
      }
      if (
        !isFiniteNumberInRange(
          obj.liveMacroRates.gold18kToman,
          0,
          100_000_000
        ) ||
        !isFiniteNumberInRange(
          obj.liveMacroRates.usdToman,
          0,
          10_000_000
        ) ||
        typeof obj.liveMacroRates.updatedAtIso !== 'string' ||
        !Number.isFinite(
          Date.parse(obj.liveMacroRates.updatedAtIso)
        )
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } } export function isContractCheckResponse(candidate: unknown): candidate is ContractCheckResponse { try { if (!candidate || typeof candidate !== 'object') return false; const obj = candidate as Record<string, unknown>; return (
      obj.status === 'ok' &&
      (obj.riskLevel === 'LOW' || obj.riskLevel === 'MEDIUM' || obj.riskLevel === 'HIGH') &&
      typeof obj.summary === 'string' &&
      Array.isArray(obj.traps) &&
      typeof obj.penaltiesWarning === 'string' &&
      Array.isArray(obj.missingGuarantees) &&
      typeof obj.safeRewrite === 'string'
    ); } catch { return false; } }
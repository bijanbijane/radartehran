import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type SupportedCrsCode = 'EPSG:4326' | 'EPSG:3857'; export interface NormalizedCoordinateResult { valid: boolean; canonicalCrs: 'EPSG:4326'; lat: number | null; lng: number | null; sourceCrs: string; originalFirstValue: number; originalSecondValue: number; errorCode: 'NONE' | 'UNSUPPORTED_CRS' | 'LAT_LNG_SWAPPED_DETECTED' | 'OUT_OF_RANGE_OR_NULL_ISLAND' | 'NON_FINITE_COORDINATE'; explanationFa: string; }
export function normalizeAndValidateCoordinateCrs(params: { firstValue: number; secondValue: number; sourceCrs: string; enforceIranBounds?: boolean; }): NormalizedCoordinateResult { const { firstValue, secondValue, sourceCrs, enforceIranBounds = true } = params; if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) { return { valid: false, canonicalCrs: 'EPSG:4326', lat: null, lng: null, sourceCrs, originalFirstValue: firstValue, originalSecondValue: secondValue, errorCode: 'NON_FINITE_COORDINATE', explanationFa: 'مختصات ورودی عددی و معتبر نیست.', }; }
  if (sourceCrs !== 'EPSG:4326' && sourceCrs !== 'EPSG:3857') { return { valid: false, canonicalCrs: 'EPSG:4326', lat: null, lng: null, sourceCrs, originalFirstValue: firstValue, originalSecondValue: secondValue,
      errorCode: 'UNSUPPORTED_CRS', explanationFa: `سیستم تصویر «${sourceCrs}» بدون تبدیل صریح پشتیبانی نمی‌شود.`, };
  } let lat = firstValue; let lng = secondValue; if (sourceCrs === 'EPSG:3857') { const earthRadius = 6378137; lng = (firstValue / earthRadius) * (180 / Math.PI); lat = (2 * Math.atan(Math.exp(secondValue / earthRadius)) - Math.PI / 2) * (180 / Math.PI); }
  if (enforceIranBounds && lat >= 44 && lat <= 63.5 && lng >= 25 && lng <= 40) { return { valid: false, canonicalCrs: 'EPSG:4326', lat: null, lng: null, sourceCrs, originalFirstValue: firstValue, originalSecondValue: secondValue, errorCode: 'LAT_LNG_SWAPPED_DETECTED', explanationFa: 'جابجایی احتمالی عرض و طول جغرافیایی (Lat/Lng Inversion) تشخیص داده شد؛ اصلاح خودکار بدون تأیید مجاز نیست.', };
  } if ( (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) || lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
    (enforceIranBounds && (lat < 24.5 || lat > 40.5 || lng < 43.5 || lng > 64))
  ) { return { valid: false, canonicalCrs: 'EPSG:4326', lat: null, lng: null, sourceCrs, originalFirstValue: firstValue, originalSecondValue: secondValue, errorCode: 'OUT_OF_RANGE_OR_NULL_ISLAND', explanationFa: 'مختصات خارج از محدوده جغرافیایی مجاز یا روی نقطه صفر (Null Island) قرار دارد.', }; }
  return { valid: true, canonicalCrs: 'EPSG:4326', lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), sourceCrs, originalFirstValue: firstValue, originalSecondValue: secondValue, errorCode: 'NONE', explanationFa: 'مختصات در سیستم مرجع استاندارد EPSG:4326 معتبر است.', }; }
export interface ParcelPolygonInput { parcelId: string; provenance: 'USER_DRAWN_APPROXIMATE' | 'OFFICIAL_CADASTRAL_VERIFIED'; sourceAuthority: string; ringCoordinatesLatLng: ReadonlyArray<readonly [number, number]>; }
export function validateParcelPolygonGeometry(
  input: ParcelPolygonInput,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): {
  validTopology: boolean;
  isClosedRing: boolean;
  vertexCount: number;
  provenanceLabelFa: string;
  canLabelAsOfficialCadastre: boolean;
  displayAreaUnitLabel: string;
  cadastralSurveyFeeEstimateIntlText: string;
  errorFa: string | null;
} {
  const pts = input.ringCoordinatesLatLng;
  const provenanceLabelFa = input.provenance === 'OFFICIAL_CADASTRAL_VERIFIED' ? `مرز رسمی کاداستر (${input.sourceAuthority})` : 'محدوده ترسیمی تقریبی کاربر (غیرثبتی)';
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const cadastralSurveyFeeEstimateIntlText = formatMillionTomanAsIntlCurrency(12, intlCurrency);
  if (pts.length < 4) {
    return { validTopology: false, isClosedRing: false, vertexCount: pts.length, provenanceLabelFa, canLabelAsOfficialCadastre: false, displayAreaUnitLabel, cadastralSurveyFeeEstimateIntlText, errorFa: 'پلیگون قطعه باید حداقل دارای ۴ نقطه (۳ رأس مستقل و نقطه بستن حلقه) باشد.' };
  }
  const first = pts[0], last = pts[pts.length - 1];
  const isClosedRing = Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6;
  if (!isClosedRing) {
    return { validTopology: false, isClosedRing: false, vertexCount: pts.length, provenanceLabelFa, canLabelAsOfficialCadastre: false, displayAreaUnitLabel, cadastralSurveyFeeEstimateIntlText, errorFa: 'حلقه پلیگون بسته نشده است (نقطه شروع و پایان یکسان نیست).' };
  }
  let area2 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    area2 += pts[i][1] * pts[i + 1][0] - pts[i + 1][1] * pts[i][0];
  }
  if (Math.abs(area2) < 1e-11) {
    return { validTopology: false, isClosedRing: true, vertexCount: pts.length, provenanceLabelFa, canLabelAsOfficialCadastre: false, displayAreaUnitLabel, cadastralSurveyFeeEstimateIntlText, errorFa: 'مساحت هندسی پلیگون صفر یا خطی (Degenerate) است.' };
  }
  return { validTopology: true, isClosedRing: true, vertexCount: pts.length, provenanceLabelFa, canLabelAsOfficialCadastre: input.provenance === 'OFFICIAL_CADASTRAL_VERIFIED', displayAreaUnitLabel, cadastralSurveyFeeEstimateIntlText, errorFa: null };
}
export interface VersionedBoundaryPolygon {
  boundaryId: string;
  boundaryVersion: string;
  city: string;
  districtId: number;
  hoodNameFa: string;
  boundaryType: 'OFFICIAL_MUNICIPAL' | 'INFORMAL_LOCAL';
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}
export function classifyPointAgainstVersionedBoundaries(params: {
  lat: number;
  lng: number;
  coordinatePrecision: 'ROOFTOP_EXACT' | 'STREET_APPROXIMATE' | 'CITY_COARSE';
  boundaries: readonly VersionedBoundaryPolygon[];
}): {
  status: 'UNIQUE_MATCH' | 'AMBIGUOUS_OVERLAP' | 'INSUFFICIENT_COORDINATE_PRECISION' | 'OUTSIDE_KNOWN_BOUNDARIES';
  matchedBoundaries: VersionedBoundaryPolygon[];
  recordedBoundaryVersion: string | null;
  explanationFa: string;
} {
  if (params.coordinatePrecision === 'CITY_COARSE') {
    return {
      status: 'INSUFFICIENT_COORDINATE_PRECISION',
      matchedBoundaries: [],
      recordedBoundaryVersion: null,
      explanationFa: 'دقت مختصات در سطح شهر (Coarse) است و انتساب قطعی به یک محله مجاز نیست.',
    };
  }
  const matches = params.boundaries.filter(
    (b) =>
      params.lat >= b.bbox.minLat &&
      params.lat <= b.bbox.maxLat &&
      params.lng >= b.bbox.minLng &&
      params.lng <= b.bbox.maxLng
  );
  if (matches.length === 0) {
    return {
      status: 'OUTSIDE_KNOWN_BOUNDARIES',
      matchedBoundaries: [],
      recordedBoundaryVersion: null,
      explanationFa: 'نقطه خارج از محدوده‌های نسخه‌بندی‌شده فعلی قرار دارد.',
    };
  }
  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS_OVERLAP',
      matchedBoundaries: matches,
      recordedBoundaryVersion: matches[0].boundaryVersion,
      explanationFa: `هم‌پوشانی مرزی بین ${matches.length} محدوده (${matches.map((m) => m.hoodNameFa).join('، ')}) تشخیص داده شد؛ انتخاب خودسرانه انجام نمی‌شود.`,
    };
  }
  return {
    status: 'UNIQUE_MATCH',
    matchedBoundaries: matches,
    recordedBoundaryVersion: matches[0].boundaryVersion,
    explanationFa: `تطبیق قطعی با محله «${matches[0].hoodNameFa}» در نسخه مرز «${matches[0].boundaryVersion}».`,
  };
}
export function computeGeodesicDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
export interface MetroStationFacilityRecord {
  stationId: string;
  nameFa: string;
  lineNumber: number;
  operationalStatus: 'OPERATIONAL' | 'UNDER_CONSTRUCTION' | 'CLOSED';
  centerLat: number;
  centerLng: number;
  verifiedEntranceLat?: number | null;
  verifiedEntranceLng?: number | null;
  verifiedWalkingRouteMeters?: number | null;
}
export function evaluateMetroAndPoiAccessibility(params: {
  propertyLat: number;
  propertyLng: number;
  stations: readonly MetroStationFacilityRecord[];
  pois: ReadonlyArray<{
    poiId: string;
    category: 'EDUCATION' | 'HEALTHCARE' | 'RETAIL' | 'GREEN_SPACE';
    nameFa: string;
    lat: number;
    lng: number;
    status: 'OPEN' | 'CLOSED_OR_UNVERIFIED';
    publicAccess: boolean;
  }>;
  radiusMeters: number;
}): {
  nearestOperationalMetro: {
    stationId: string;
    nameFa: string;
    distanceBasis: 'VERIFIED_ENTRANCE_GEODESIC' | 'STATION_CENTER_GEODESIC';
    straightLineMeters: number;
    verifiedWalkingRouteMeters: number | null;
  } | null;
  ignoredNonOperationalStationsCount: number;
  countsWithinRadiusByCategory: Record<'EDUCATION' | 'HEALTHCARE' | 'RETAIL' | 'GREEN_SPACE', number>;
  coverageDisclaimerFa: string;
} {
  let ignoredNonOperationalStationsCount = 0;
  let nearest: {
    stationId: string;
    nameFa: string;
    distanceBasis: 'VERIFIED_ENTRANCE_GEODESIC' | 'STATION_CENTER_GEODESIC';
    straightLineMeters: number;
    verifiedWalkingRouteMeters: number | null;
  } | null = null;
  const seenStationIds = new Set<string>();
  for (const st of params.stations) {
    if (seenStationIds.has(st.stationId)) continue;
    seenStationIds.add(st.stationId);
    if (st.operationalStatus !== 'OPERATIONAL') {
      ignoredNonOperationalStationsCount++;
      continue;
    }
    const hasEntrance =
      typeof st.verifiedEntranceLat === 'number' && typeof st.verifiedEntranceLng === 'number';
    const targetLat = hasEntrance ? (st.verifiedEntranceLat as number) : st.centerLat;
    const targetLng = hasEntrance ? (st.verifiedEntranceLng as number) : st.centerLng;
    const dist = computeGeodesicDistanceMeters(params.propertyLat, params.propertyLng, targetLat, targetLng);
    if (!nearest || dist < nearest.straightLineMeters) {
      nearest = {
        stationId: st.stationId,
        nameFa: st.nameFa,
        distanceBasis: hasEntrance ? 'VERIFIED_ENTRANCE_GEODESIC' : 'STATION_CENTER_GEODESIC',
        straightLineMeters: dist,
        verifiedWalkingRouteMeters: st.verifiedWalkingRouteMeters ?? null,
      };
    }
  }
  const counts: Record<'EDUCATION' | 'HEALTHCARE' | 'RETAIL' | 'GREEN_SPACE', number> = {
    EDUCATION: 0,
    HEALTHCARE: 0,
    RETAIL: 0,
    GREEN_SPACE: 0,
  };
  const seenPoiKeys = new Set<string>();
  for (const p of params.pois) {
    if (p.status !== 'OPEN') continue;
    if (p.category === 'GREEN_SPACE' && !p.publicAccess) continue; // Private green areas excluded (Prompt 1311)
    const dedupKey = `${p.category}:${p.nameFa.trim()}:${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`;
    if (seenPoiKeys.has(dedupKey)) continue;
    seenPoiKeys.add(dedupKey);
    const d = computeGeodesicDistanceMeters(params.propertyLat, params.propertyLng, p.lat, p.lng);
    if (d <= params.radiusMeters) {
      counts[p.category]++;
    }
  }
  return {
    nearestOperationalMetro: nearest,
    ignoredNonOperationalStationsCount,
    countsWithinRadiusByCategory: counts,
    coverageDisclaimerFa:
      'فاصله خط مستقیم هوایی (Geodesic) با مسافت واقعی پیاده‌روی متفاوت است و نزدیکی مکانی به‌منزله کیفیت آموزشی/درمانی یا تضمین ترافیکی نیست.',
  };
}
export function evaluateWalkabilityEnvironmentalAndPrivacy(params: {
  propertyId: string;
  workspaceId: string;
  exactLat: number;
  exactLng: number;
  viewerAuthorizedForExactLocation: boolean;
  transitScore0To100: number | null;
  dailyServicesScore0To100: number | null;
  greenSpaceScore0To100: number | null;
  pedestrianConnectivityScore0To100: number | null;
  airQualitySensorReadingAqi: number | null;
  airSensorDistanceMeters: number | null;
  airSensorAgeHours: number | null;
  floodHazardLayerAvailable: boolean;
  intersectsFloodZone: boolean;
  boundaryVersion: string;
  poiDatasetVersion: string;
}): {
  displayCoordinates: { lat: number; lng: number; precisionMode: 'AUTHORIZED_EXACT' | 'PRIVACY_MASKED_APPROXIMATE' };
  walkabilityIndex: {
    compositeScore0To100: number | null;
    availableIndicatorsCount: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    configurationVersion: string;
  };
  environmentalStatus: {
    aqiValue: number | null;
    freshnessStatus: 'FRESH_DIRECT_OR_NEARBY' | 'STALE_OR_DISTANT_WARNING' | 'UNAVAILABLE';
    floodRiskClassification: 'INTERSECTS_HAZARD' | 'NO_INTERSECTION_OBSERVED' | 'UNKNOWN_LAYER_UNAVAILABLE';
  };
  immutableSnapshotId: string;
} {
  const displayCoordinates = params.viewerAuthorizedForExactLocation
    ? {
        lat: Number(params.exactLat.toFixed(6)),
        lng: Number(params.exactLng.toFixed(6)),
        precisionMode: 'AUTHORIZED_EXACT' as const,
      }
    : {
        lat: Number(params.exactLat.toFixed(2)),
        lng: Number(params.exactLng.toFixed(2)),
        precisionMode: 'PRIVACY_MASKED_APPROXIMATE' as const,
      };
  const indicators = [
    params.transitScore0To100,
    params.dailyServicesScore0To100,
    params.greenSpaceScore0To100,
    params.pedestrianConnectivityScore0To100,
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const compositeScore0To100 =
    indicators.length >= 2
      ? Math.round(indicators.reduce((s, v) => s + v, 0) / indicators.length)
      : null;
  const freshnessStatus =
    params.airQualitySensorReadingAqi === null
      ? 'UNAVAILABLE'
      : (params.airSensorDistanceMeters ?? 9999) > 3000 || (params.airSensorAgeHours ?? 999) > 6
      ? 'STALE_OR_DISTANT_WARNING'
      : 'FRESH_DIRECT_OR_NEARBY';
  const floodRiskClassification = !params.floodHazardLayerAvailable
    ? 'UNKNOWN_LAYER_UNAVAILABLE'
    : params.intersectsFloodZone
    ? 'INTERSECTS_HAZARD'
    : 'NO_INTERSECTION_OBSERVED';
  const immutableSnapshotId = `snap-${params.workspaceId}-${params.propertyId}-${params.boundaryVersion}-${params.poiDatasetVersion}`;
  return {
    displayCoordinates,
    walkabilityIndex: {
      compositeScore0To100,
      availableIndicatorsCount: indicators.length,
      confidence: indicators.length === 4 ? 'HIGH' : indicators.length >= 2 ? 'MEDIUM' : 'LOW', configurationVersion: 'walk-cfg-v1.4', }, environmentalStatus: { aqiValue: params.airQualitySensorReadingAqi, freshnessStatus, floodRiskClassification, }, immutableSnapshotId, }; }
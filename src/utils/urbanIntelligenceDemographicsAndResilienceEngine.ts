import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type UrbanGeographicResolution = 'CITY' | 'DISTRICT' | 'NEIGHBORHOOD' | 'PARCEL'; export interface UrbanIndicatorDefinition { indicatorId: string; category: 'DEMOGRAPHIC' | 'MORPHOLOGY' | 'LAND_USE' | 'INFRASTRUCTURE' | 'ENVIRONMENT' | 'RESILIENCE'; labelFa: string; unit: string; resolution: UrbanGeographicResolution; sourceAuthorityFa: string; methodologyVersion: string; } export const URBAN_INDICATOR_REGISTRY: Readonly<Record<string, UrbanIndicatorDefinition>> = { POPULATION_DENSITY_PER_HA: { indicatorId: 'POPULATION_DENSITY_PER_HA',
    category: 'DEMOGRAPHIC', labelFa: 'تراکم جمعیتی ناخالص محله', unit: 'PERSONS_PER_HECTARE', resolution: 'NEIGHBORHOOD', sourceAuthorityFa: 'مرکز آمار ایران / سالنامه آماری شهرداری تهران', methodologyVersion: 'demog-v2.0', },
  BUILDING_COVERAGE_RATIO_PCT: { indicatorId: 'BUILDING_COVERAGE_RATIO_PCT', category: 'MORPHOLOGY', labelFa: 'سطح اشغال ساختمانی (BCR)',
    unit: 'PERCENT', resolution: 'NEIGHBORHOOD', sourceAuthorityFa: 'لایه عوارض ساختمانی و قطعات ثبتی', methodologyVersion: 'morph-v1.3', }, SERVICE_CAPACITY_PER_10K: { indicatorId: 'SERVICE_CAPACITY_PER_10K', category: 'INFRASTRUCTURE', labelFa: 'سرانه دسترسی خدمات شهری به ازای ۱۰ هزار نفر',
    unit: 'FACILITIES_PER_10K_POP', resolution: 'NEIGHBORHOOD', sourceAuthorityFa: 'سامانه اطلاعات مکانی خدمات شهری', methodologyVersion: 'equity-v1.2', }, INSAR_SUBSIDENCE_MM_YR: {
    indicatorId: 'INSAR_SUBSIDENCE_MM_YR', category: 'ENVIRONMENT', labelFa: 'نرخ جابجایی قائم سطح زمین (InSAR)', unit: 'MM_PER_YEAR',
    resolution: 'DISTRICT', sourceAuthorityFa: 'پایش راداری سازمان نقشه‌برداری کشور', methodologyVersion: 'insar-v1.1', },
}; export function computeDemographicAndHouseholdMetrics(params: { hoodId: number; boundaryVersion: string;
  areaHectares: number; observationBasis: 'OFFICIAL_CENSUS' | 'ADMINISTRATIVE_ESTIMATE' | 'MODELED_PROJECTION';
  referencePeriodLabel: string;
  residentialPopulation: number | null;
  daytimePopulation?: number | null;
  previousPeriodPopulation?: number | null;
  previousBoundaryVersion?: string | null;
  ageBands?: { under15: number; working15To64: number; senior65Plus: number } | null;
  householdCount?: number | null;
  occupiedHousingUnits?: number | null;
}): {
  densityPersonsPerHectare: number | null;
  populationChangePercent: number | null;
  boundaryDiscontinuityWarningFa: string | null;
  ageDependencyRatioPercent: number | null;
  meanHouseholdSize: number | null;
  observationBasis: 'OFFICIAL_CENSUS' | 'ADMINISTRATIVE_ESTIMATE' | 'MODELED_PROJECTION';
  ecologicalFallacyDisclaimerFa: string;
} {
  const validArea = Number.isFinite(params.areaHectares) && params.areaHectares > 0;
  const validPop =
    typeof params.residentialPopulation === 'number' &&
    Number.isFinite(params.residentialPopulation) &&
    params.residentialPopulation >= 0;
  const densityPersonsPerHectare =
    validArea && validPop
      ? Number(((params.residentialPopulation as number) / params.areaHectares).toFixed(1))
      : null;
  const boundaryChanged =
    Boolean(params.previousBoundaryVersion) && params.previousBoundaryVersion !== params.boundaryVersion;
  let populationChangePercent: number | null = null;
  if (
    !boundaryChanged &&
    validPop &&
    typeof params.previousPeriodPopulation === 'number' &&
    params.previousPeriodPopulation > 0
  ) {
    populationChangePercent = Number(
      ((((params.residentialPopulation as number) - params.previousPeriodPopulation) /
        params.previousPeriodPopulation) *
        100).toFixed(2)
    );
  }
  let ageDependencyRatioPercent: number | null = null;
  if (params.ageBands && params.ageBands.working15To64 > 0) {
    const dependents = Math.max(0, params.ageBands.under15) + Math.max(0, params.ageBands.senior65Plus);
    ageDependencyRatioPercent = Number(((dependents / params.ageBands.working15To64) * 100).toFixed(1));
  }
  const meanHouseholdSize =
    validPop && typeof params.householdCount === 'number' && params.householdCount > 0
      ? Number(((params.residentialPopulation as number) / params.householdCount).toFixed(2))
      : null;
  return {
    densityPersonsPerHectare,
    populationChangePercent,
    boundaryDiscontinuityWarningFa: boundaryChanged
      ? `هشدار ناپیوستگی مرزی: نسخه مرز دوره قبل (${params.previousBoundaryVersion}) با نسخه فعلی (${params.boundaryVersion}) متفاوت است؛ محاسبه نرخ رشد مستقیم بدون همگن‌سازی مکانی متوقف شد.`
      : null,
    ageDependencyRatioPercent,
    meanHouseholdSize,
    observationBasis: params.observationBasis,
    ecologicalFallacyDisclaimerFa:
      'شاخص‌های جمعیت‌شناختی در مقیاس تجمیعی محله هستند و نباید برای استنتاج ویژگی‌های فردی ساکنان یا علیت مستقیم قیمت مسکن به کار روند.',
  };
}
export function evaluateUrbanMorphologyAndLandUseBalance(
  params: {
    totalParcelAreaSqm: number;
    totalBuildingFootprintSqm: number;
    verifiedTotalFloorAreaSqm: number | null;
    buildingsByAgeCategory: { under10Years: number; years10To25: number; over25Years: number; unknownConstructionYear: number };
    landUseSharesSqm: { residentialSqm: number; commercialSqm: number; serviceAndAdminSqm: number; greenAndOpenSqm: number };
    previousTaxonomyVersion: string;
    currentTaxonomyVersion: string;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): {
  buildingCoverageRatioPercent: number | null;
  floorAreaRatioFar: number | null;
  agedBuildingsOver25PctOfKnown: number | null;
  unknownAgeBuildingsCount: number;
  landUseDiversityIndex0To1: number;
  canCompareHistoricalLandUseChange: boolean;
  displayAreaUnitLabel: string;
  estimatedRenewalCapexPerSqmIntlText: string;
  morphologyDisclaimerFa: string;
} {
  const validParcel = Number.isFinite(params.totalParcelAreaSqm) && params.totalParcelAreaSqm > 0;
  const footprint = Number.isFinite(params.totalBuildingFootprintSqm) && params.totalBuildingFootprintSqm >= 0 ? params.totalBuildingFootprintSqm : 0;
  const buildingCoverageRatioPercent = validParcel
    ? Number(Math.min(100, (footprint / params.totalParcelAreaSqm) * 100).toFixed(1))
    : null;
  const floorAreaRatioFar =
    validParcel && typeof params.verifiedTotalFloorAreaSqm === 'number' && Number.isFinite(params.verifiedTotalFloorAreaSqm) && params.verifiedTotalFloorAreaSqm > 0
      ? Number((params.verifiedTotalFloorAreaSqm / params.totalParcelAreaSqm).toFixed(2))
      : null;
  const u10 = Number.isFinite(params.buildingsByAgeCategory.under10Years) && params.buildingsByAgeCategory.under10Years >= 0 ? params.buildingsByAgeCategory.under10Years : 0;
  const y1025 = Number.isFinite(params.buildingsByAgeCategory.years10To25) && params.buildingsByAgeCategory.years10To25 >= 0 ? params.buildingsByAgeCategory.years10To25 : 0;
  const o25 = Number.isFinite(params.buildingsByAgeCategory.over25Years) && params.buildingsByAgeCategory.over25Years >= 0 ? params.buildingsByAgeCategory.over25Years : 0;
  const knownAgeTotal = u10 + y1025 + o25;
  const agedBuildingsOver25PctOfKnown =
    knownAgeTotal > 0
      ? Number(((o25 / knownAgeTotal) * 100).toFixed(1))
      : null;
  const luValues = Object.values(params.landUseSharesSqm).filter((v) => Number.isFinite(v) && v > 0);
  const totalLu = luValues.reduce((s, v) => s + v, 0);
  let entropy = 0;
  if (totalLu > 0 && luValues.length > 1) {
    for (const v of luValues) {
      const p = v / totalLu;
      entropy -= p * Math.log(p);
    }
    entropy = Number((entropy / Math.log(4)).toFixed(3));
  }
  return {
    buildingCoverageRatioPercent,
    floorAreaRatioFar,
    agedBuildingsOver25PctOfKnown,
    unknownAgeBuildingsCount: params.buildingsByAgeCategory.unknownConstructionYear,
    landUseDiversityIndex0To1: entropy,
    canCompareHistoricalLandUseChange: params.previousTaxonomyVersion === params.currentTaxonomyVersion,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    estimatedRenewalCapexPerSqmIntlText: formatMillionTomanAsIntlCurrency(45, intlCurrency),
    morphologyDisclaimerFa:
      'سطح اشغال (BCR) و تراکم ساختمانی (FAR) صرفاً بیانگر وضعیت کالبدی ثبت‌شده هستند و به‌منزله مجوز تراکم قانونی یا ایمنی سازه‌ای ساختمان نیستند.',
  };
}
export interface UtilityAndBroadbandStatus {
  utilityType: 'WATER' | 'ELECTRICITY' | 'GAS' | 'SEWAGE' | 'FIBER_OPTIC';
  status: 'CONFIRMED_BUILDING_CONNECTION' | 'NETWORK_PASSES_NEARBY_UNCONFIRMED' | 'UNAVAILABLE_OR_UNKNOWN';
  sourceAuthorityFa: string;
}
export function evaluateServiceEquityAndInfrastructureCoverage(params: {
  residentialPopulation: number | null;
  verifiedFacilityCount: number;
  targetThresholdPer10kPop: number;
  poiDatasetCompletenessPercent: number;
  nearestFireStationMeters: number | null;
  utilities: readonly UtilityAndBroadbandStatus[];
}): {
  facilitiesPer10kPopulation: number | null;
  serviceGapStatus:
    | 'ADEQUATE_COVERAGE'
    | 'VERIFIED_SERVICE_GAP'
    | 'INCONCLUSIVE_LOW_MAP_COVERAGE'
    | 'POPULATION_DENOMINATOR_MISSING';
  confirmedBuildingUtilities: string[];
  unconfirmedProximityOnlyUtilities: string[];
  emergencyDistanceMeters: number | null;
  infrastructureDisclaimerFa: string;
} {
  if (!params.residentialPopulation || params.residentialPopulation <= 0) {
    return {
      facilitiesPer10kPopulation: null,
      serviceGapStatus: 'POPULATION_DENOMINATOR_MISSING',
      confirmedBuildingUtilities: [],
      unconfirmedProximityOnlyUtilities: [],
      emergencyDistanceMeters: params.nearestFireStationMeters,
      infrastructureDisclaimerFa: 'جمعیت پایه برای محاسبه سرانه خدمات شهری در دسترس نیست.',
    };
  }
  const facilitiesPer10kPopulation = Number(
    ((params.verifiedFacilityCount / params.residentialPopulation) * 10_000).toFixed(2)
  );
  let serviceGapStatus:
    | 'ADEQUATE_COVERAGE'
    | 'VERIFIED_SERVICE_GAP'
    | 'INCONCLUSIVE_LOW_MAP_COVERAGE' = 'ADEQUATE_COVERAGE';
  if (facilitiesPer10kPopulation < params.targetThresholdPer10kPop) {
    serviceGapStatus =
      params.poiDatasetCompletenessPercent >= 75
        ? 'VERIFIED_SERVICE_GAP'
        : 'INCONCLUSIVE_LOW_MAP_COVERAGE';
  }
  const confirmedBuildingUtilities = params.utilities
    .filter((u) => u.status === 'CONFIRMED_BUILDING_CONNECTION')
    .map((u) => u.utilityType);
  const unconfirmedProximityOnlyUtilities = params.utilities
    .filter((u) => u.status === 'NETWORK_PASSES_NEARBY_UNCONFIRMED')
    .map((u) => u.utilityType);
  return {
    facilitiesPer10kPopulation,
    serviceGapStatus,
    confirmedBuildingUtilities,
    unconfirmedProximityOnlyUtilities,
    emergencyDistanceMeters: params.nearestFireStationMeters,
    infrastructureDisclaimerFa:
      'عبور شبکه زیرساخت یا فیبر نوری از معبر مجاور به‌منزله انشعاب قطعی ساختمان نیست؛ همچنین فاصله تا ایستگاه آتش‌نشانی تضمین‌کننده زمان واقعی عملیات امدادی نمی‌باشد.',
  };
}
/**
 * Prompts 1356 to 1369: Environmental Noise, Urban Heat Island (LST vs Air),
 * InSAR Subsidence, Fault Context, Residential Quality, Resilience & Global Moran's I
 */
export function evaluateUrbanHazardsResilienceAndSpatialAutocorrelation(params: {
  measuredNoiseDb: number | null;
  satelliteLandSurfaceTempCelsius: number | null;
  insarVerticalSubsidenceMmPerYear: number | null;
  distanceToMappedFaultMeters: number | null;
  resilienceDimensions: {
    infrastructureRedundancy0To100: number | null;
    emergencyAccess0To100: number | null;
    environmentalSafety0To100: number | null;
    publicServiceAccess0To100: number | null;
  };
  neighborhoodValuesForMoran: ReadonlyArray<{
    hoodId: number;
    value: number;
    adjacentHoodIds: readonly number[];
  }>;
}): {
  noiseStatusLabelFa: string;
  thermalContextLabelFa: string;
  subsidenceContextLabelFa: string;
  seismicContextLabelFa: string;
  resilienceProfile: {
    compositeScore0To100: number | null;
    knownDimensionsCount: number;
    unknownDimensionsCount: number;
  };
  globalMoransI: number | null;
  spatialEconometricsDisclaimerFa: string;
} {
  const noiseStatusLabelFa =
    params.measuredNoiseDb === null
      ? 'داده سنجش صوتی موجود نیست (عدم جایگزینی با صفر دسی‌بل)'
      : `${params.measuredNoiseDb} dB(A) (سنجش ایستگاهی)`;
  const thermalContextLabelFa =
    params.satelliteLandSurfaceTempCelsius === null
      ? 'داده دمای سطح زمین (LST) موجود نیست'
      : `دمای سطح زمین ماهواره‌ای (LST): ${params.satelliteLandSurfaceTempCelsius}°C (متفاوت از دمای هوای داخل ملک)`;
  const subsidenceContextLabelFa =
    params.insarVerticalSubsidenceMmPerYear === null
      ? 'لایه راداری فرونشست برای این محدوده در دسترس نیست'
      : `نرخ جابجایی قائم پهنه‌ای (InSAR): ${params.insarVerticalSubsidenceMmPerYear} میلی‌متر در سال (شاخص منطقه‌ای، غیرقابل تعمیم مستقیم به سازه تک‌بنا)`;
  const seismicContextLabelFa =
    params.distanceToMappedFaultMeters === null
      ? 'فاصله تا گسل نقشه‌برداری‌شده نامشخص'
      : `فاصله هندسی تا گسل نقشه‌برداری‌شده: ${params.distanceToMappedFaultMeters.toLocaleString('fa-IR')} متر (نیازمند ارزیابی آیین‌نامه ۲۸۰۰ سازه)`;
  const dims = Object.values(params.resilienceDimensions);
  const knownDims = dims.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const compositeScore0To100 =
    knownDims.length >= 2
      ? Math.round(knownDims.reduce((s, v) => s + v, 0) / knownDims.length)
      : null;
  let globalMoransI: number | null = null;
  const nodes = params.neighborhoodValuesForMoran.filter((n) => Number.isFinite(n.value));
  if (nodes.length >= 3) {
    const mean = nodes.reduce((s, n) => s + n.value, 0) / nodes.length;
    const nodeMap = new Map(nodes.map((n) => [n.hoodId, n]));
    let numSum = 0;
    let denomSum = 0;
    let weightSum = 0;
    for (const ni of nodes) {
      const devI = ni.value - mean;
      denomSum += devI * devI;
      for (const adjId of ni.adjacentHoodIds) {
        const nj = nodeMap.get(adjId);
        if (nj) {
          numSum += devI * (nj.value - mean);
          weightSum += 1;
        }
      }
    }
    if (denomSum > 0 && weightSum > 0) {
      globalMoransI = Number(((nodes.length / weightSum) * (numSum / denomSum)).toFixed(3));
    }
  }
  return {
    noiseStatusLabelFa,
    thermalContextLabelFa,
    subsidenceContextLabelFa, seismicContextLabelFa, resilienceProfile: { compositeScore0To100, knownDimensionsCount: knownDims.length, unknownDimensionsCount: dims.length - knownDims.length, }, globalMoransI, spatialEconometricsDisclaimerFa:
      'خودهمبستگی فضایی (Moran’s I) و همبستگی مجاورت، صرفاً ارتباط آماری مکانی را نشان می‌دهند و دلیل بر رابطه علّی یا تضمین ایمنی در برابر سوانح نیستند.', }; }
export const NARMAK_1332_PARCEL_SUBDIVISION = { foundedSolarYear: 1332, developerInstitutionFa: 'بانک ساختمانی', areaHectares: 720, initialPlannedAreaSqm: 6_000_000, plannedSquaresCount: 100, totalInitialParcels: 3991, weightedMeanParcelSqm: 354.45, brackets: [{ sqm: 200, count: 1235 }, { sqm: 300, count: 844 }, { sqm: 400, count: 416 }, { sqm: 500, count: 1496 }] } as const;
export const TEHRAN_22_DISTRICTS_VERIFIED_BASELINE_1405: ReadonlyArray<{ district: number; pop: number; areaHa: number; hoods: number; greenSqmCapita: number; elevM: number; dilapidatedHa: number; subsidenceMmYr: number }> = [
  { district: 1, pop: 493889, areaHa: 4598, hoods: 26, greenSqmCapita: 23.4, elevM: 1650, dilapidatedHa: 148, subsidenceMmYr: 5 }, { district: 2, pop: 701303, areaHa: 4729, hoods: 21, greenSqmCapita: 21.8, elevM: 1420, dilapidatedHa: 85, subsidenceMmYr: 8 }, { district: 3, pop: 330004, areaHa: 2938, hoods: 12, greenSqmCapita: 18.5, elevM: 1460, dilapidatedHa: 64, subsidenceMmYr: 6 }, { district: 4, pop: 919001, areaHa: 6155, hoods: 20, greenSqmCapita: 22.1, elevM: 1380, dilapidatedHa: 132, subsidenceMmYr: 12 }, { district: 5, pop: 858346, areaHa: 5287, hoods: 29, greenSqmCapita: 19.4, elevM: 1360, dilapidatedHa: 78, subsidenceMmYr: 15 },
  { district: 6, pop: 251384, areaHa: 2138, hoods: 18, greenSqmCapita: 16.2, elevM: 1280, dilapidatedHa: 62, subsidenceMmYr: 10 }, { district: 7, pop: 312194, areaHa: 1534, hoods: 14, greenSqmCapita: 6.8, elevM: 1230, dilapidatedHa: 228, subsidenceMmYr: 14 }, { district: 8, pop: 425197, areaHa: 1321, hoods: 13, greenSqmCapita: 8.4, elevM: 1260, dilapidatedHa: 185, subsidenceMmYr: 12 }, { district: 9, pop: 174239, areaHa: 1951, hoods: 8, greenSqmCapita: 13.5, elevM: 1170, dilapidatedHa: 195, subsidenceMmYr: 85 }, { district: 10, pop: 327115, areaHa: 817, hoods: 10, greenSqmCapita: 2.8, elevM: 1165, dilapidatedHa: 342, subsidenceMmYr: 45 },
  { district: 11, pop: 308176, areaHa: 1206, hoods: 17, greenSqmCapita: 7.2, elevM: 1160, dilapidatedHa: 371, subsidenceMmYr: 35 }, { district: 12, pop: 240909, areaHa: 1601, hoods: 13, greenSqmCapita: 8.9, elevM: 1140, dilapidatedHa: 586, subsidenceMmYr: 30 }, { district: 13, pop: 239686, areaHa: 1283, hoods: 13, greenSqmCapita: 25.0, elevM: 1220, dilapidatedHa: 144, subsidenceMmYr: 15 }, { district: 14, pop: 489101, areaHa: 1456, hoods: 21, greenSqmCapita: 9.1, elevM: 1160, dilapidatedHa: 288, subsidenceMmYr: 22 }, { district: 15, pop: 659468, areaHa: 2777, hoods: 20, greenSqmCapita: 19.8, elevM: 1110, dilapidatedHa: 315, subsidenceMmYr: 40 },
  { district: 16, pop: 267678, areaHa: 1651, hoods: 9, greenSqmCapita: 15.6, elevM: 1090, dilapidatedHa: 245, subsidenceMmYr: 75 }, { district: 17, pop: 278354, areaHa: 822, hoods: 14, greenSqmCapita: 4.5, elevM: 1115, dilapidatedHa: 268, subsidenceMmYr: 160 }, { district: 18, pop: 419249, areaHa: 3816, hoods: 17, greenSqmCapita: 18.2, elevM: 1105, dilapidatedHa: 192, subsidenceMmYr: 310 }, { district: 19, pop: 255533, areaHa: 2059, hoods: 12, greenSqmCapita: 26.5, elevM: 1065, dilapidatedHa: 140, subsidenceMmYr: 320 }, { district: 20, pop: 453740, areaHa: 2266, hoods: 20, greenSqmCapita: 22.4, elevM: 1055, dilapidatedHa: 295, subsidenceMmYr: 110 },
  { district: 21, pop: 186598, areaHa: 5156, hoods: 13, greenSqmCapita: 34.0, elevM: 1245, dilapidatedHa: 45, subsidenceMmYr: 90 }, { district: 22, pop: 175398, areaHa: 5881, hoods: 12, greenSqmCapita: 62.5, elevM: 1340, dilapidatedHa: 20, subsidenceMmYr: 18 },
] as const;
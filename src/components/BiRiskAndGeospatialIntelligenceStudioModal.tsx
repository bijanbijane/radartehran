import React, { useState, useMemo } from 'react'; import { BarChart3, TrendingUp, MapPin, Compass, Building2, Lock, Unlock, X } from 'lucide-react'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { REAL_ESTATE_METRICS_REGISTRY, computePricePerSqmIndexAndGap, estimatePropertyValueRangeFromComparables, runInvestmentCashFlowBreakEvenAndMonteCarlo, evaluatePortfolioConcentrationVacancyAndDelinquency, evaluateChronologicalForecastAndRisk, type AnalyticalObservationRecord } from '../utils/marketBiRiskAndForecastingEngine'; import { normalizeAndValidateCoordinateCrs, validateParcelPolygonGeometry, classifyPointAgainstVersionedBoundaries, evaluateMetroAndPoiAccessibility, evaluateWalkabilityEnvironmentalAndPrivacy } from '../utils/geospatialCrsAccessibilityAndEnvironmentalEngine'; import { URBAN_INDICATOR_REGISTRY, computeDemographicAndHouseholdMetrics, evaluateUrbanMorphologyAndLandUseBalance, evaluateServiceEquityAndInfrastructureCoverage, evaluateUrbanHazardsResilienceAndSpatialAutocorrelation } from '../utils/urbanIntelligenceDemographicsAndResilienceEngine'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { useDialogFocus } from './useDialogFocus';
export interface BiRiskAndGeospatialIntelligenceStudioModalProps { isOpen: boolean; onClose: () => void; } type BiGisTabId = 'market_bi_comps' | 'investment_mc_risk' | 'gis_crs_accessibility' | 'walkability_env_privacy' | 'urban_demographics_resilience'; const SAMPLE_OBSERVATIONS: AnalyticalObservationRecord[] = [ { observationId: 'obs-1', workspaceId: 'org-tehran-prime', propertyId: 'prop-101', city: 'tehran', districtId: 2, hoodId: 1, propertyType: 'APARTMENT', areaBasis: 'BUILT_AREA_SQM', areaSqm: 120, ageYears: 4, bedrooms: 3, priceBasis: 'ASKING_LISTING', totalPriceToman: 14_400_000_000, observedAtIso: '2026-04-10T10:00:00Z', lifecycleState: 'ACTIVE', daysOnMarket: 18 }, { observationId: 'obs-2', workspaceId: 'org-tehran-prime', propertyId: 'prop-101', city: 'tehran', districtId: 2, hoodId: 1, propertyType: 'APARTMENT', areaBasis: 'BUILT_AREA_SQM', areaSqm: 120, ageYears: 4, bedrooms: 3, priceBasis: 'CONFIRMED_TRANSACTION', totalPriceToman: 13_680_000_000, observedAtIso: '2026-04-22T10:00:00Z', lifecycleState: 'SOLD', daysOnMarket: 30 }, { observationId: 'obs-3', workspaceId: 'org-tehran-prime', propertyId: 'prop-102', city: 'tehran', districtId: 2, hoodId: 1, propertyType: 'APARTMENT', areaBasis: 'BUILT_AREA_SQM', areaSqm: 115, ageYears: 5, bedrooms: 2, priceBasis: 'CONFIRMED_TRANSACTION', totalPriceToman: 13_110_000_000, observedAtIso: '2026-04-18T10:00:00Z', lifecycleState: 'SOLD', daysOnMarket: 25 }, { observationId: 'obs-4', workspaceId: 'org-tehran-prime', propertyId: 'prop-103', city: 'tehran', districtId: 2, hoodId: 2, propertyType: 'APARTMENT', areaBasis: 'BUILT_AREA_SQM', areaSqm: 130, ageYears: 3, bedrooms: 3, priceBasis: 'ASKING_LISTING', totalPriceToman: 15_860_000_000, observedAtIso: '2026-04-25T10:00:00Z', lifecycleState: 'ACTIVE', daysOnMarket: 12 }, ]; export const BiRiskAndGeospatialIntelligenceStudioModal: React.FC<BiRiskAndGeospatialIntelligenceStudioModalProps> = ({ isOpen, onClose }) => { const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT'; const dialogRef = useDialogFocus(isOpen, onClose); const [activeTab, setActiveTab] = useState<BiGisTabId>('market_bi_comps'); const [subjectAreaSqm, setSubjectAreaSqm] = useState(122); const [purchasePriceMillion, setPurchasePriceMillion] = useState(13800);
  const [monthlyRentMillion, setMonthlyRentMillion] = useState(85); const [vacancyPercent, setVacancyPercent] = useState(8); const [mcSeed, setMcSeed] = useState(1405); const [coordFirst, setCoordFirst] = useState(35.7762); const [coordSecond, setCoordSecond] = useState(51.3654); const [sourceCrs] = useState<'EPSG:4326' | 'EPSG:3857'>('EPSG:4326'); const [radiusMeters, setRadiusMeters] = useState<500 | 1000 | 1500>(1000); const [viewerAuthorizedExact, setViewerAuthorizedExact] = useState(false); const [floodLayerAvailable, setFloodLayerAvailable] = useState(false); const [hoodPopulation, setHoodPopulation] = useState(48500); const [hoodAreaHectares, setHoodAreaHectares] = useState(310); const [prevBoundaryVersion, setPrevBoundaryVersion] = useState<'muni-1404' | 'muni-1395'>('muni-1404');
  const indexAndGap = useMemo(() => computePricePerSqmIndexAndGap({ workspaceId: 'org-tehran-prime', observations: SAMPLE_OBSERVATIONS, minSampleSize: 2 }), []); const compValuation = useMemo(() => estimatePropertyValueRangeFromComparables({ subject: { propertyId: 'subj-1', hoodId: 1, districtId: 2, propertyType: 'APARTMENT', areaSqm: subjectAreaSqm, ageYears: 4, bedrooms: 3 }, candidates: SAMPLE_OBSERVATIONS, }), [subjectAreaSqm]); const investmentSim = useMemo(() => runInvestmentCashFlowBreakEvenAndMonteCarlo({
    purchasePriceToman: purchasePriceMillion * 1_000_000, acquisitionCostsToman: 220_000_000, monthlyGrossRentToman: monthlyRentMillion * 1_000_000, vacancyRatePercent: vacancyPercent, annualOperatingExpensesToman: 65_000_000, annualCapexReserveToman: 35_000_000, annualDebtServiceToman: 180_000_000, equityInvestedToman: (purchasePriceMillion - 1000) * 1_000_000, randomSeed: mcSeed, }), [purchasePriceMillion, monthlyRentMillion, vacancyPercent, mcSeed]); const portfolioRisk = useMemo(() => evaluatePortfolioConcentrationVacancyAndDelinquency({ assets: [
      { assetId: 'ast-1', districtId: 2, propertyType: 'APARTMENT', estimatedValueToman: 14_000_000_000, ownershipSharePercent: 100, occupiedDays: 330, marketVacantDays: 20, plannedRenovationDays: 15 }, { assetId: 'ast-2', districtId: 1, propertyType: 'COMMERCIAL', estimatedValueToman: 22_000_000_000, ownershipSharePercent: 50, occupiedDays: 345, marketVacantDays: 20, plannedRenovationDays: 0 }, ], rentObligations: [ { obligationId: 'obl-1', dueAmountToman: 85_000_000, receivedAmountToman: 50_000_000, daysPastDue: 18, status: 'NORMAL' }, { obligationId: 'obl-2', dueAmountToman: 90_000_000, receivedAmountToman: 0, daysPastDue: 45, status: 'DISPUTED' }, ], }), []); const forecastAndRisk = useMemo(() => evaluateChronologicalForecastAndRisk({ chronologicalMonthlyPerSqmToman: [104_000_000, 106_500_000, 108_000_000, 110_200_000, 112_800_000, 115_000_000], cpiIndexSeries: [100, 102.5, 105.0, 107.8, 110.5, 113.2], hasVerifiedTitleDeed: true, vacancyRatePercent: vacancyPercent, concentrationSharePercent: portfolioRisk.topDistrictSharePercent, }), [vacancyPercent, portfolioRisk.topDistrictSharePercent]); const crsCheck = useMemo(() => normalizeAndValidateCoordinateCrs({ firstValue: coordFirst, secondValue: coordSecond, sourceCrs, enforceIranBounds: true }), [coordFirst, coordSecond, sourceCrs]); const parcelCheck = useMemo(() => validateParcelPolygonGeometry({ parcelId: 'prc-saadat-101', provenance: 'USER_DRAWN_APPROXIMATE', sourceAuthority: 'ترسیم کاربر روی نقشه', ringCoordinatesLatLng: [[35.776, 51.365], [35.777, 51.365], [35.777, 51.366], [35.776, 51.365]], }), []); const boundaryClass = useMemo(() => classifyPointAgainstVersionedBoundaries({
    lat: crsCheck.lat ?? 35.7762, lng: crsCheck.lng ?? 51.3654, coordinatePrecision: 'ROOFTOP_EXACT', boundaries: [{ boundaryId: 'bnd-saadat', boundaryVersion: 'tehran-muni-v1404.2', city: 'tehran', districtId: 2, hoodNameFa: 'سعادت‌آباد', boundaryType: 'OFFICIAL_MUNICIPAL', bbox: { minLat: 35.76, maxLat: 35.80, minLng: 51.35, maxLng: 51.38 } }],
  }), [crsCheck.lat, crsCheck.lng]); const metroAndPoi = useMemo(() => evaluateMetroAndPoiAccessibility({ propertyLat: crsCheck.lat ?? 35.7762, propertyLng: crsCheck.lng ?? 51.3654, radiusMeters, stations: [
      { stationId: 'st-ketab', nameFa: 'ایستگاه مترو میدان کتاب (خط ۷)', lineNumber: 7, operationalStatus: 'OPERATIONAL', centerLat: 35.7795, centerLng: 51.3592, verifiedEntranceLat: 35.7788, verifiedEntranceLng: 51.3601, verifiedWalkingRouteMeters: 740 }, { stationId: 'st-future', nameFa: 'ایستگاه در حال احداث (خط ۱۰)', lineNumber: 10, operationalStatus: 'UNDER_CONSTRUCTION', centerLat: 35.7765, centerLng: 51.3655 },
    ], pois: [
      { poiId: 'p1', category: 'EDUCATION', nameFa: 'دبیرستان علامه', lat: 35.777, lng: 51.366, status: 'OPEN', publicAccess: true }, { poiId: 'p2', category: 'HEALTHCARE', nameFa: 'بیمارستان عرفان', lat: 35.779, lng: 51.362, status: 'OPEN', publicAccess: true },
      { poiId: 'p3', category: 'RETAIL', nameFa: 'مرکز خرید اپال', lat: 35.781, lng: 51.358, status: 'OPEN', publicAccess: true }, { poiId: 'p4', category: 'GREEN_SPACE', nameFa: 'بوستان پرواز', lat: 35.782, lng: 51.355, status: 'OPEN', publicAccess: true }, ], }), [crsCheck.lat, crsCheck.lng, radiusMeters]);
  const walkabilityAndEnv = useMemo(() => evaluateWalkabilityEnvironmentalAndPrivacy({ propertyId: 'prop-101', workspaceId: 'org-tehran-prime', exactLat: crsCheck.lat ?? 35.776249, exactLng: crsCheck.lng ?? 51.365418, viewerAuthorizedForExactLocation: viewerAuthorizedExact,
    transitScore0To100: 82, dailyServicesScore0To100: 88, greenSpaceScore0To100: 76, pedestrianConnectivityScore0To100: 80, airQualitySensorReadingAqi: 74, airSensorDistanceMeters: 1850, airSensorAgeHours: 2, floodHazardLayerAvailable: floodLayerAvailable, intersectsFloodZone: false,
    boundaryVersion: 'tehran-muni-v1404.2', poiDatasetVersion: 'poi-v2026.04', }), [crsCheck.lat, crsCheck.lng, viewerAuthorizedExact, floodLayerAvailable]); const demographicMetrics = useMemo( () => computeDemographicAndHouseholdMetrics({ hoodId: 1, boundaryVersion: 'muni-1404', areaHectares: hoodAreaHectares,
      observationBasis: 'OFFICIAL_CENSUS', referencePeriodLabel: '1404', residentialPopulation: hoodPopulation, previousPeriodPopulation: 45200,
      previousBoundaryVersion: prevBoundaryVersion, ageBands: { under15: 7800, working15To64: 35100, senior65Plus: 5600 },
      householdCount: 15600, occupiedHousingUnits: 14900, }), [hoodPopulation, hoodAreaHectares, prevBoundaryVersion] );
  const morphologyMetrics = useMemo( () => evaluateUrbanMorphologyAndLandUseBalance({
      totalParcelAreaSqm: 1_200_000, totalBuildingFootprintSqm: 660_000, verifiedTotalFloorAreaSqm: 3_480_000,
      buildingsByAgeCategory: { under10Years: 1420, years10To25: 1850, over25Years: 410, unknownConstructionYear: 95 },
      landUseSharesSqm: { residentialSqm: 720_000, commercialSqm: 180_000, serviceAndAdminSqm: 140_000, greenAndOpenSqm: 160_000 },
      previousTaxonomyVersion: 'lu-v2', currentTaxonomyVersion: 'lu-v2', }), [] );
  const serviceEquity = useMemo( () => evaluateServiceEquityAndInfrastructureCoverage({
      residentialPopulation: hoodPopulation, verifiedFacilityCount: 18, targetThresholdPer10kPop: 3.2,
      poiDatasetCompletenessPercent: 88, nearestFireStationMeters: 1120,
      utilities: [
        { utilityType: 'WATER', status: 'CONFIRMED_BUILDING_CONNECTION', sourceAuthorityFa: 'آبفا' },
        { utilityType: 'ELECTRICITY', status: 'CONFIRMED_BUILDING_CONNECTION', sourceAuthorityFa: 'توزیع برق' },
        { utilityType: 'GAS', status: 'CONFIRMED_BUILDING_CONNECTION', sourceAuthorityFa: 'شرکت گاز' },
        { utilityType: 'FIBER_OPTIC', status: 'NETWORK_PASSES_NEARBY_UNCONFIRMED', sourceAuthorityFa: 'اپراتور فیبر نوری' },
      ], }), [hoodPopulation] );
  const hazardsAndMoran = useMemo( () => evaluateUrbanHazardsResilienceAndSpatialAutocorrelation({
      measuredNoiseDb: null, satelliteLandSurfaceTempCelsius: 33.4,
      insarVerticalSubsidenceMmPerYear: -4.2, distanceToMappedFaultMeters: 2850,
      resilienceDimensions: { infrastructureRedundancy0To100: 84, emergencyAccess0To100: 78, environmentalSafety0To100: 72, publicServiceAccess0To100: null },
      neighborhoodValuesForMoran: [
        { hoodId: 1, value: 138, adjacentHoodIds: [2, 3] }, { hoodId: 2, value: 134, adjacentHoodIds: [1, 3] },
        { hoodId: 3, value: 141, adjacentHoodIds: [1, 2] }, { hoodId: 4, value: 78, adjacentHoodIds: [5] },
        { hoodId: 5, value: 82, adjacentHoodIds: [4] }, ], }), [] );
  if (!isOpen) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="bi-gis-studio-title" dir="rtl">
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 dark:border-slate-700 bg-slate-900 dark:bg-slate-900 text-slate-100 dark:text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-sky-400" />
            <div>
              <h2 id="bi-gis-studio-title" className="text-base font-bold text-white">
                استودیوی هوش تجاری (BI)، مدیریت ریسک، سامانه اطلاعات مکانی (GIS) و هوشمندی شهری (Urban Intelligence)
              </h2>
              <p className="text-xs text-slate-400">
                بسته‌های ۱۱۴، ۱۱۵ و ۱۱۶ (پرامپت‌های ۱۲۵۶ تا ۱۳۸۵) · تفکیک قیمت آگهی و معامله · حریم خصوصی مختصات · تحلیل جمعیت و تاب‌آوری شهری
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="بستن پنجره BI و GIS">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950/60 px-6 py-3">
          {[
            { id: 'market_bi_comps', label: '۰۱. هوش بازار و املاک مشابه (۱۲۵۶–۱۲۶۵)', icon: BarChart3 },
            { id: 'investment_mc_risk', label: '۰۲. بازده، مونت‌کارلو و ریسک سبد (۱۲۶۶–۱۲۷۹)', icon: TrendingUp },
            { id: 'gis_crs_accessibility', label: '۰۳. استاندارد CRS، کاداستر و مترو (۱۲۹۷–۱۳۱۲)', icon: MapPin },
            { id: 'walkability_env_privacy', label: '۰۴. پیاده‌روی و حریم خصوصی مکان (۱۳۱۳–۱۳۳۹)', icon: Compass },
            { id: 'urban_demographics_resilience', label: '۰۵. هوشمندی شهری، جمعیت، زیرساخت و تاب‌آوری (۱۳۴۰–۱۳۸۵)', icon: Building2 },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as BiGisTabId)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          {activeTab === 'market_bi_comps' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-400">میانه قیمت پیشنهادی (آگهی)</div>
                  <div className="mt-1 text-sm font-bold text-white">{Math.round(convertPricePerSqmToUnit((indexAndGap.askingMedianPerSqmToman ?? 0) / 1_000_000, areaUnit) * 1_000_000).toLocaleString('fa-IR')} تومان/{areaUnit === 'sqft' ? 'فوت‌مربع' : 'مترمربع'}{showIntl ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit((indexAndGap.askingMedianPerSqmToman ?? 0) / 1_000_000, areaUnit), currency, locale)})` : ''}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-400">میانه قیمت قطعی معامله‌شده</div>
                  <div className="mt-1 text-sm font-bold text-emerald-400">{Math.round(convertPricePerSqmToUnit((indexAndGap.transactionMedianPerSqmToman ?? 0) / 1_000_000, areaUnit) * 1_000_000).toLocaleString('fa-IR')} تومان/{areaUnit === 'sqft' ? 'فوت‌مربع' : 'مترمربع'} (معامله v6.4: {Math.round(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', (indexAndGap.askingMedianPerSqmToman ?? 120_000_000) / 1_000_000, []).estimatedDealPricePerSqm, areaUnit)).toLocaleString('fa-IR')} م){showIntl ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit((indexAndGap.transactionMedianPerSqmToman ?? 0) / 1_000_000, areaUnit), currency, locale)})` : ''}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-400">شکاف قیمت آگهی تا معامله (۱۲۶۰)</div>
                  <div className="mt-1 text-sm font-bold text-amber-400" dir="ltr">{indexAndGap.meanListingToTransactionGapPercent}%</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-400">ثبت در فرهنگنامه متریک (۱۲۵۷)</div>
                  <div className="mt-1 text-sm font-bold text-sky-400">{Object.keys(REAL_ESTATE_METRICS_REGISTRY).length} شاخص استاندارد</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-sky-400">موتور املاک مشابه (Comps) و برآورد بازه ارزش بازار (۱۲۶۱–۱۲۶۲)</h3>
                  <label className="inline-flex items-center gap-2 text-slate-300">
                    متراژ ملک هدف ({formatAreaShort(subjectAreaSqm, areaUnit)}):
                    <input type="number" value={subjectAreaSqm} onChange={(e) => setSubjectAreaSqm(Number(e.target.value) || 100)} className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
                  </label>
                </div>
                {compValuation.estimatedRangeToman ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-sm font-bold text-white">
                      بازه برآوردی ارزش کل: {compValuation.estimatedRangeToman.lowToman.toLocaleString('fa-IR')} تا {compValuation.estimatedRangeToman.highToman.toLocaleString('fa-IR')} تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(compValuation.estimatedRangeToman.lowToman / 1_000_000, currency, locale)} – ${formatMillionTomanAsIntlCurrency(compValuation.estimatedRangeToman.highToman / 1_000_000, currency, locale)})` : ''} · هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {Math.round(convertPricePerSqmToUnit(compValuation.estimatedRangeToman.lowToman / 1_000_000 / Math.max(1, subjectAreaSqm), areaUnit)).toLocaleString('fa-IR')}–{Math.round(convertPricePerSqmToUnit(compValuation.estimatedRangeToman.highToman / 1_000_000 / Math.max(1, subjectAreaSqm), areaUnit)).toLocaleString('fa-IR')} م (اطمینان: {compValuation.confidenceLevel})
                    </div>
                    <p className="text-[11px] text-amber-300">{compValuation.nonAppraisalDisclaimerFa}</p>
                  </div>
                ) : (
                  <div className="mt-2 text-amber-400">داده مشابه کافی برای این متراژ یافت نشد.</div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'investment_mc_risk' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-3 font-bold text-emerald-400">تحلیل بازده سرمایه‌گذاری، جریان نقدی، نقطه سربه‌سر و شبیه‌سازی مونت‌کارلو (۱۲۶۶–۱۲۷۰)</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="block"><span className="text-[11px] text-slate-400">قیمت خرید (میلیون تومان){showIntl ? ` (${formatMillionTomanAsIntlCurrency(purchasePriceMillion, currency, locale)})` : ''}</span><input type="number" value={purchasePriceMillion} onChange={(e) => setPurchasePriceMillion(Number(e.target.value) || 1000)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white" /></label>
                  <label className="block"><span className="text-[11px] text-slate-400">اجاره ماهانه (میلیون تومان){showIntl ? ` (${formatMillionTomanAsIntlCurrency(monthlyRentMillion, currency, locale)})` : ''}</span><input type="number" value={monthlyRentMillion} onChange={(e) => setMonthlyRentMillion(Number(e.target.value) || 10)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white" /></label>
                  <label className="block"><span className="text-[11px] text-slate-400">نرخ خالی‌ماندن (%)</span><input type="number" value={vacancyPercent} onChange={(e) => setVacancyPercent(Number(e.target.value) || 0)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white" /></label>
                  <label className="block"><span className="text-[11px] text-slate-400">بذر مونت‌کارلو (Seed)</span><input type="number" value={mcSeed} onChange={(e) => setMcSeed(Number(e.target.value) || 1)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white" /></label>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-white">شاخص‌های بازده و سربه‌سر</div>
                    <div className="mt-1 text-[11px] text-slate-300">بازده ناخالص: {investmentSim.grossRentalYieldPercent}% · بازده خالص: {investmentSim.netRentalYieldPercent}% · اشغال سربه‌سر: {investmentSim.breakEvenOccupancyPercent}% · NOI: {Math.round(investmentSim.annualNetOperatingIncomeToman / 1_000_000).toLocaleString('fa-IR')} م{showIntl ? ` (${formatMillionTomanAsIntlCurrency(investmentSim.annualNetOperatingIncomeToman / 1_000_000, currency, locale)})` : ''}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-amber-300">مونت‌کارلو ({investmentSim.monteCarloNetYieldPercentiles.simulationCount} تکرار)</div>
                    <div className="mt-1 text-[11px] text-slate-300">P10: {investmentSim.monteCarloNetYieldPercentiles.p10Percent}% · P50: {investmentSim.monteCarloNetYieldPercentiles.p50Percent}% · P90: {investmentSim.monteCarloNetYieldPercentiles.p90Percent}%</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-sky-300">پیش‌بینی با بک‌تست و ریسک (۱۲۷۷–۱۲۷۹)</div>
                    <div className="mt-1 text-[11px] text-slate-300">MAPE بک‌تست: {forecastAndRisk.backtestMapePercent}% · امتیاز ریسک ملک: {forecastAndRisk.decomposableRiskScore0To100}/100</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'gis_crs_accessibility' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-2 font-bold text-sky-400">نرمال‌سازی CRS، تشخیص جابجایی Lat/Lng و تطبیق مرز نسخه‌بندی‌شده (۱۲۹۷–۱۳۰۲)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setCoordFirst(51.3654); setCoordSecond(35.7762); }} className="rounded bg-amber-600/80 px-2.5 py-1 text-[11px] text-white">شبیه‌سازی جابجایی (Lng, Lat)</button>
                  <button type="button" onClick={() => { setCoordFirst(35.7762); setCoordSecond(51.3654); }} className="rounded bg-emerald-600/80 px-2.5 py-1 text-[11px] text-white">مختصات صحیح تهران</button>
                </div>
                <div className="mt-2 rounded bg-slate-900 p-2.5 text-[11px]">
                  <div className={crsCheck.valid ? 'text-emerald-300' : 'text-rose-400'}>{crsCheck.explanationFa}</div>
                  <div className="mt-1 text-slate-300">{boundaryClass.explanationFa} · {parcelCheck.provenanceLabelFa}</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-emerald-400">دسترسی شعاعی، ورودی مترو و حذف ایستگاه‌های غیرفعال (۱۳۰۳–۱۳۱۲)</h3>
                  <div className="flex gap-1.5">
                    {([500, 1000, 1500] as const).map((r) => (
                      <button key={r} type="button" onClick={() => setRadiusMeters(r)} className={`rounded px-2.5 py-1 text-[11px] font-semibold ${radiusMeters === r ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>شعاع {r} متر{areaUnit === 'sqft' ? ` (${Math.round(r * 3.28084)} ft)` : ''}</button>
                    ))}
                  </div>
                </div>
                {metroAndPoi.nearestOperationalMetro && (
                  <div className="mt-2 text-[11px] text-slate-200">
                    نزدیک‌ترین مترو فعال: <strong>{metroAndPoi.nearestOperationalMetro.nameFa}</strong> · خط مستقیم تا ورودی: {metroAndPoi.nearestOperationalMetro.straightLineMeters} متر{areaUnit === 'sqft' ? ` (${Math.round((metroAndPoi.nearestOperationalMetro.straightLineMeters ?? 0) * 3.28084)} ft)` : ''} · پیاده‌روی شبکه: {metroAndPoi.nearestOperationalMetro.verifiedWalkingRouteMeters} متر{areaUnit === 'sqft' ? ` (${Math.round((metroAndPoi.nearestOperationalMetro.verifiedWalkingRouteMeters ?? 0) * 3.28084)} ft)` : ''}
                  </div>
                )} </div>
            </div>
          )} {activeTab === 'walkability_env_privacy' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-emerald-400">حریم خصوصی مختصات، شاخص پیاده‌روی و اسنپ‌شات مکانی (۱۳۱۳–۱۳۳۹)</h3>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setViewerAuthorizedExact((p) => !p)} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200">
                    {viewerAuthorizedExact ? <Unlock className="h-3.5 w-3.5 text-emerald-400" /> : <Lock className="h-3.5 w-3.5 text-amber-400" />} {viewerAuthorizedExact ? 'مجوز مکان دقیق فعال' : 'حالت عمومی (مختصات تقریب‌خورده)'} </button>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                    <input type="checkbox" checked={floodLayerAvailable} onChange={(e) => setFloodLayerAvailable(e.target.checked)} /> لایه رسمی سیلاب موجود است
                  </label>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="font-bold text-white">مختصات نمایشی</div>
                  <div className="mt-1 text-[11px] text-sky-300" dir="ltr">{walkabilityAndEnv.displayCoordinates.lat}, {walkabilityAndEnv.displayCoordinates.lng} ({walkabilityAndEnv.displayCoordinates.precisionMode})</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="font-bold text-emerald-300">شاخص پیاده‌روی</div>
                  <div className="mt-1 text-[11px] text-slate-300">امتیاز: {walkabilityAndEnv.walkabilityIndex.compositeScore0To100}/100 ({walkabilityAndEnv.walkabilityIndex.confidence})</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="font-bold text-amber-300">وضعیت مخاطرات سیلاب</div>
                  <div className="mt-1 text-[11px] text-slate-300">{walkabilityAndEnv.environmentalStatus.floodRiskClassification}</div>
                </div>
              </div>
            </div>
          )} {activeTab === 'urban_demographics_resilience' && (
            <div className="space-y-4">
              {/* Prompts 1340 to 1355: Demographics, Morphology & Service Equity */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-sky-400">جمعیت‌شناسی، تراکم کالبدی (BCR/FAR) و عدالت فضایی خدمات شهری (۱۳۴۰–۱۳۵۵، ۱۳۷۰–۱۳۷۶)</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-slate-300">
                      جمعیت محله:
                      <input type="number" value={hoodPopulation} onChange={(e) => setHoodPopulation(Number(e.target.value) || 0)} className="mr-1 w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
                    </label>
                    <button
                      type="button"
                      onClick={() => setPrevBoundaryVersion((v) => (v === 'muni-1404' ? 'muni-1395' : 'muni-1404'))} className="rounded bg-slate-800 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-slate-700"
                    >
                      تغییر نسخه مرز دوره قبل ({prevBoundaryVersion})
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-white">تراکم جمعیتی و بعد خانوار ({Object.keys(URBAN_INDICATOR_REGISTRY).length} شاخص ثبتی)</div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      تراکم: {demographicMetrics.densityPersonsPerHectare} نفر/هکتار{areaUnit === 'sqft' ? ` (${((demographicMetrics.densityPersonsPerHectare ?? 0) / 2.47105).toFixed(1)} نفر/Acre)` : ''} · نرخ رشد: {demographicMetrics.populationChangePercent !== null ? `${demographicMetrics.populationChangePercent}%` : 'متوقف به علت تغییر مرز'} · بار تکفل سنی: {demographicMetrics.ageDependencyRatioPercent}% · بعد خانوار: {demographicMetrics.meanHouseholdSize}
                    </div>
                    {demographicMetrics.boundaryDiscontinuityWarningFa && (
                      <div className="mt-1 text-[10px] text-amber-400">{demographicMetrics.boundaryDiscontinuityWarningFa}</div>
                    )} </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-emerald-300">مورفولوژی کالبدی و تعادل کاربری (۱۳۴۵–۱۳۵۰)</div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      سطح اشغال (BCR): {morphologyMetrics.buildingCoverageRatioPercent}% · تراکم (FAR): {morphologyMetrics.floorAreaRatioFar} · بناهای بالای ۲۵ سال: {morphologyMetrics.agedBuildingsOver25PctOfKnown}% (نامشخص: {morphologyMetrics.unknownAgeBuildingsCount}) · شاخص تنوع کاربری: {morphologyMetrics.landUseDiversityIndex0To1} </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="font-bold text-amber-300">عدالت فضایی و انشعابات زیرساختی (۱۳۵۱–۱۳۵۵)</div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      سرانه خدمات به ازای ۱۰ هزار نفر: {serviceEquity.facilitiesPer10kPopulation} ({serviceEquity.serviceGapStatus}) · انشعاب تاییدشده: {serviceEquity.confirmedBuildingUtilities.join(', ')} · صرفاً عبور از معبر مجاور: {serviceEquity.unconfirmedProximityOnlyUtilities.join(', ')} </div>
                  </div>
                </div>
              </div>
              {/* Prompts 1356 to 1369: Urban Climate, InSAR Subsidence, Fault Context, Resilience & Moran's I */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-2 font-bold text-emerald-400">اقلیم شهری (LST)، فرونشست راداری (InSAR)، گسل، تاب‌آوری و خودهمبستگی فضایی موران (۱۳۵۶–۱۳۸۵)</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px] text-slate-300">
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">• تراز صوتی: {hazardsAndMoran.noiseStatusLabelFa}</div>
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">• جزیره حرارتی: {hazardsAndMoran.thermalContextLabelFa}</div>
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">• فرونشست زمین: {hazardsAndMoran.subsidenceContextLabelFa}</div>
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">• زمینه لرزه‌خیزی: {hazardsAndMoran.seismicContextLabelFa}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-300">
                  <span>امتیاز تاب‌آوری محله: {hazardsAndMoran.resilienceProfile.compositeScore0To100}/100 (ابعاد موجود: {hazardsAndMoran.resilienceProfile.knownDimensionsCount}، نامشخص: {hazardsAndMoran.resilienceProfile.unknownDimensionsCount})</span>
                  <span>ضریب خودهمبستگی فضایی (Global Moran&apos;s I): <strong dir="ltr">{hazardsAndMoran.globalMoransI}</strong></span>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{hazardsAndMoran.spatialEconometricsDisclaimerFa}</p>
              </div>
            </div>
          )} </div>
      </div>
    </div>
  ); };
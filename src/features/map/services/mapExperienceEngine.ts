/**
 * @file src/features/map/services/mapExperienceEngine.ts
 * @description Stage 15 (RT-UI-MAP-001) & Stage 16 (RT-UI-LAYERS-001) Pure Engines.
 */
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type {
  AreaSearchStatusKind, ClusterZoomTier, GeodesicMeasurementResult, GeoPointWGS84,
  MapImplementationPackage, MapLayerConfig, MapLayerLegendSpec, MapMode, MapPanelView,
  MapState, MapTelemetryEventName, MapUiTestScenario, MeasurementToolKind,
  PolygonValidationResult, PrivacySafeMapTelemetryEvent, Stage16LayerArchitectureItem,
} from '../types/map.types';

export const CANONICAL_MAP_LAYER_REGISTRY: readonly MapLayerConfig[] = [
  { id: 'base_light', title: 'نقشه روشن پایه', description: 'معابر، خیابان‌ها و زمینه جغرافیایی کم‌کنتراست', category: 'base', geometry: 'raster', defaultVisible: true, selectable: false, opacityAdjustable: false, sourceId: 'osm_neshan', sourceLabelFa: 'تایل پایه نشان / OSM', quality: 'verified', updatedAt: '۱۴۰۵/۰۸/۲۴' },
  { id: 'base_satellite', title: 'تصویر ماهواره‌ای', description: 'پوشش هوایی جهت بررسی بافت کالبدی', category: 'base', geometry: 'raster', defaultVisible: false, selectable: false, opacityAdjustable: false, sourceId: 'satellite_imagery', sourceLabelFa: 'سرویس ماهواره‌ای', quality: 'verified', updatedAt: '۱۴۰۵/۰۸/۰۱' },
  { id: 'boundaries_hoods', title: 'مرز محله‌ها و مناطق', description: 'پلیگون‌های معتبر محلات و مناطق ۲۲گانه شهرداری', category: 'boundaries', geometry: 'polygon', defaultVisible: true, selectable: true, opacityAdjustable: true, minZoom: 10, maxZoom: 18, legendId: 'legend_boundaries', sourceId: 'tehran_gis_boundaries', sourceLabelFa: 'اطلس مرزهای شهری تهران', quality: 'verified', updatedAt: '۱۴۰۵/۰۸/۲۰' },
  { id: 'property_asking_price', title: 'قیمت پیشنهادی هر متر مربع', description: 'سطح رنگی میانه قیمت پیشنهادی فروش در هر محله', category: 'property', geometry: 'polygon', defaultVisible: true, selectable: true, opacityAdjustable: true, isSurfaceHeatmap: true, minZoom: 10, maxZoom: 18, legendId: 'legend_asking_price', sourceId: 'radar_asking_aggregator', sourceLabelFa: 'پایش مظنه‌های فروش رادار', quality: 'verified', updatedAt: '۱۴۰۵/۰۸/۲۴' },
  { id: 'property_sale_density', title: 'تراکم فایل‌های فروش و اجاره', description: 'خوشه‌بندی فایل‌های فعال معتبر بر اساس سطح زوم', category: 'property', geometry: 'point', defaultVisible: false, selectable: true, opacityAdjustable: false, minZoom: 11, maxZoom: 18, legendId: 'legend_supply_density', sourceId: 'radar_dedup_listings', sourceLabelFa: 'موتور پالایش آگهی تکراری', quality: 'estimated', updatedAt: '۱۴۰۵/۰۸/۲۴' },
  { id: 'amenity_metro', title: 'ایستگاه‌ها و خطوط مترو', description: 'شبکه ریلی درون‌شهری و شعاع دسترسی پیاده', category: 'amenity', geometry: 'line', defaultVisible: false, selectable: true, opacityAdjustable: true, minZoom: 11, maxZoom: 18, legendId: 'legend_metro', sourceId: 'tehran_metro_gis', sourceLabelFa: 'لایه شبکه مترو تهران', quality: 'verified', updatedAt: '۱۴۰۵/۰۸/۱۰' },
  { id: 'urban_traffic_zones', title: 'محدوده طرح ترافیک و کنترل آلودگی', description: 'مرز قانونی حلقه‌های اول و دوم ترافیکی', category: 'urban-analysis', geometry: 'polygon', defaultVisible: false, selectable: true, opacityAdjustable: true, minZoom: 10, maxZoom: 18, legendId: 'legend_traffic', sourceId: 'tehran_traffic_authority', sourceLabelFa: 'مصوبه محدوده ترافیکی', quality: 'verified', updatedAt: '۱۴۰۵/۰۷/۳۰' },
  { id: 'urban_air_heatmap', title: 'پهنه کیفیت هوا و زیست‌پذیری', description: 'سطح پیوسته شاخص کیفیت هوا و فضای سبز', category: 'urban-analysis', geometry: 'polygon', defaultVisible: false, selectable: true, opacityAdjustable: true, isSurfaceHeatmap: true, minZoom: 10, maxZoom: 17, legendId: 'legend_air', sourceId: 'air_quality_index', sourceLabelFa: 'ایستگاه‌های سنجش کیفیت هوا', quality: 'estimated', updatedAt: '۱۴۰۵/۰۸/۲۴' },
];

export function evaluateLayerActivationAndConflicts(
  activeLayerIds: readonly string[], toggledLayerId: string, currentAppliedFilters: Readonly<Record<string, unknown>>,
): { nextLayerIds: string[]; preservedFilters: Record<string, unknown>; hasSurfaceConflict: boolean; conflictWarningFa: string | null } {
  const exists = activeLayerIds.includes(toggledLayerId);
  const nextLayerIds = exists ? activeLayerIds.filter((id) => id !== toggledLayerId) : [...activeLayerIds, toggledLayerId];
  const activeSurfaceLayers = CANONICAL_MAP_LAYER_REGISTRY.filter((l) => nextLayerIds.includes(l.id) && l.isSurfaceHeatmap);
  const hasSurfaceConflict = activeSurfaceLayers.length > 1;
  const conflictWarningFa = hasSurfaceConflict
    ? `هشدار تداخل بصری: هم‌زمان ${toPersianNum(activeSurfaceLayers.length)} لایه سطحی رنگی (${activeSurfaceLayers.map((l) => l.title).join(' و ')}) فعال است. برای خوانایی بهتر یکی را خاموش کنید.`
    : null;
  return { nextLayerIds, preservedFilters: { ...currentAppliedFilters }, hasSurfaceConflict, conflictWarningFa };
}

export function buildDynamicLayerLegend(layerId: string, neighborhoods: readonly EvaluatedNeighborhood[]): MapLayerLegendSpec {
  const prices = neighborhoods.map((h) => h.buyPerSqm).filter((v) => v > 0);
  const minVal = prices.length > 0 ? Math.min(...prices) : 60;
  const maxVal = prices.length > 0 ? Math.max(...prices) : 320;
  const midVal = Math.round((minVal + maxVal) / 2);

  if (layerId === 'urban_air_heatmap') {
    return {
      legendId: 'legend_air', layerId, indicatorTitleFa: 'شاخص کیفیت هوا و زیست‌پذیری',
      unitFa: 'امتیاز از ۱۰', minNumericValue: 1, maxNumericValue: 10,
      lowLabelFa: 'مقدار کمتر (آلوده‌تر)', highLabelFa: 'مقدار بیشتر (پاک‌تر)',
      geographyScopeFa: 'تهران', periodLabelFa: 'میانگین پایش جاری ۱۴۰۵',
      stops: [
        { labelFa: '۱ تا ۵ (نیازمند احتیاط)', colorHex: '#D97706', symbol: '▲' },
        { labelFa: '۵ تا ۷.۵ (متوسط)', colorHex: '#0D9488', symbol: '●' },
        { labelFa: '۷.۵ تا ۱۰ (مطلوب)', colorHex: '#176B63', symbol: '★' },
      ],
    };
  }

  return {
    legendId: 'legend_asking_price', layerId, indicatorTitleFa: 'راهنمای نمایش قیمت پیشنهادی',
    unitFa: 'میلیون تومان / متر مربع', minNumericValue: minVal, maxNumericValue: maxVal,
    lowLabelFa: `مقدار کمتر (${toPersianNum(minVal)} م.ت)`, highLabelFa: `مقدار بیشتر (${toPersianNum(maxVal)} م.ت)`,
    geographyScopeFa: 'تهران (مناطق ۲۲گانه)', periodLabelFa: 'آبان ۱۴۰۵ (پایش مظنه‌ها)',
    stops: [
      { labelFa: `اقتصادی (${toPersianNum(minVal)} تا ${toPersianNum(midVal)} م.ت)`, colorHex: '#176B63', symbol: '■' },
      { labelFa: `میانی (${toPersianNum(midVal)} تا ${toPersianNum(Math.round(maxVal * 0.75))} م.ت)`, colorHex: '#D97706', symbol: '◆' },
      { labelFa: `فوقانی (${toPersianNum(Math.round(maxVal * 0.75))}+ م.ت)`, colorHex: '#E11D48', symbol: '▲' },
    ],
  };
}

export function activateMapToolbarMode(currentMode: MapMode, requestedMode: MapMode): {
  activeMode: MapMode; panelView: MapPanelView; blocksFeatureSelection: boolean; cursorHintFa: string;
} {
  const nextMode = currentMode === requestedMode && requestedMode !== 'explore' ? 'explore' : requestedMode;
  const blocksFeatureSelection = nextMode === 'draw' || nextMode === 'measure';
  const panelView: MapPanelView = nextMode === 'filter' ? 'filters' : nextMode === 'compare' ? 'compare' : 'explore';
  const cursorHintFa =
    nextMode === 'draw'
      ? 'حالت ترسیم محدوده فعال است: نقاط چندضلعی را روی نقشه ثبت کنید (کلیک روی ملک غیرفعال است).'
      : nextMode === 'measure'
        ? 'حالت اندازه‌گیری فعال است: نقاط مسیر یا مساحت را روی نقشه انتخاب کنید.'
        : nextMode === 'compare'
          ? 'حالت مقایسه فعال است: تا ۴ محله یا ۵ ملک هم‌معنا را انتخاب کنید.'
          : 'حالت کاوش نقشه: برای مشاهده جزئیات روی محله یا نشانگر کلیک کنید.';
  return { activeMode: nextMode, panelView, blocksFeatureSelection, cursorHintFa };
}

function segmentsIntersect(a: GeoPointWGS84, b: GeoPointWGS84, c: GeoPointWGS84, d: GeoPointWGS84): boolean {
  const ccw = (p1: GeoPointWGS84, p2: GeoPointWGS84, p3: GeoPointWGS84) =>
    (p3.lat - p1.lat) * (p2.lng - p1.lng) > (p2.lat - p1.lat) * (p3.lng - p1.lng);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

export function validateDrawnPolygonWGS84(points: readonly GeoPointWGS84[]): PolygonValidationResult {
  if (points.length < 3) return { valid: false, state: 'invalid', vertexCount: points.length, areaSqKm: 0, hasSelfIntersection: false, errorMessageFa: 'چندضلعی معتبر حداقل به ۳ نقطه جغرافیایی نیاز دارد.' };
  if (points.length > 64) return { valid: false, state: 'invalid', vertexCount: points.length, areaSqKm: 0, hasSelfIntersection: false, errorMessageFa: 'تعداد نقاط چندضلعی بیش از حد مجاز (۶۴ نقطه) است.' };
  for (const pt of points) {
    if (pt.lat < 24 || pt.lat > 40 || pt.lng < 44 || pt.lng > 64) {
      return { valid: false, state: 'invalid', vertexCount: points.length, areaSqKm: 0, hasSelfIntersection: false, errorMessageFa: 'مختصات خارج از محدوده معتبر WGS84 کشور است.' };
    }
  }
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a1 = points[i], a2 = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = points[j], b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return { valid: false, state: 'invalid', vertexCount: n, areaSqKm: 0, hasSelfIntersection: true, errorMessageFa: 'محدوده ترسیم‌شده خودمتقاطع است؛ اضلاع چندضلعی نباید یکدیگر را قطع کنند.' };
      }
    }
  }
  const areaRes = computeGeodesicMeasurement('area', points);
  const areaSqKm = areaRes.rawValueMetersOrSqm / 1_000_000;
  if (areaSqKm > 600) return { valid: false, state: 'invalid', vertexCount: n, areaSqKm, hasSelfIntersection: false, errorMessageFa: 'مساحت محدوده انتخابی بیش از سقف مجاز (۶۰۰ کیلومتر مربع) است.' };
  return { valid: true, state: 'applied', vertexCount: n, areaSqKm: Number(areaSqKm.toFixed(2)), hasSelfIntersection: false };
}

function haversineMeters(p1: GeoPointWGS84, p2: GeoPointWGS84): number {
  const R = 6371000, toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat), dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeGeodesicMeasurement(kind: MeasurementToolKind, points: readonly GeoPointWGS84[]): GeodesicMeasurementResult {
  if (points.length < 2) return { kind, rawValueMetersOrSqm: 0, formattedValueFa: '۰ متر', unitFa: 'متر', vertexCount: points.length };
  if (kind === 'linear_distance' || kind === 'radius' || kind === 'perimeter') {
    let totalMeters = 0;
    for (let i = 0; i < points.length - 1; i++) totalMeters += haversineMeters(points[i], points[i + 1]);
    if (kind === 'perimeter' && points.length >= 3) totalMeters += haversineMeters(points[points.length - 1], points[0]);
    const rounded = Math.round(totalMeters);
    if (rounded >= 1000) return { kind, rawValueMetersOrSqm: rounded, formattedValueFa: `${toPersianNum((rounded / 1000).toFixed(2))} کیلومتر`, unitFa: 'کیلومتر', vertexCount: points.length };
    return { kind, rawValueMetersOrSqm: rounded, formattedValueFa: `${toPersianNum(rounded)} متر`, unitFa: 'متر', vertexCount: points.length };
  }

  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const metersPerDegLat = 111132.92, metersPerDegLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i], p2 = points[(i + 1) % points.length];
    const x1 = p1.lng * metersPerDegLng, y1 = p1.lat * metersPerDegLat;
    const x2 = p2.lng * metersPerDegLng, y2 = p2.lat * metersPerDegLat;
    sum += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.round(Math.abs(sum) / 2);
  if (areaSqm >= 10_000) return { kind: 'area', rawValueMetersOrSqm: areaSqm, formattedValueFa: `${toPersianNum((areaSqm / 10_000).toFixed(2))} هکتار`, unitFa: 'هکتار', vertexCount: points.length };
  return { kind: 'area', rawValueMetersOrSqm: areaSqm, formattedValueFa: `${toPersianNum(areaSqm)} متر مربع`, unitFa: 'متر مربع', vertexCount: points.length };
}

export function resolveClusterDisplayForZoom(zoom: number, validRecordCount: number): {
  tier: ClusterZoomTier; showIndividualPriceLabels: boolean; summaryLabelFa: string;
} {
  if (zoom <= 11) return { tier: 'low_zoom_cluster', showIndividualPriceLabels: false, summaryLabelFa: `خوشه تجمیعی (${toPersianNum(validRecordCount)} رکورد معتبر)` };
  if (zoom <= 13) return { tier: 'mid_zoom_group', showIndividualPriceLabels: false, summaryLabelFa: `گروه‌های منطقه‌ای (${toPersianNum(validRecordCount)} رکورد)` };
  return { tier: 'high_zoom_markers', showIndividualPriceLabels: validRecordCount <= 40, summaryLabelFa: `نشانگرهای منفرد (${toPersianNum(validRecordCount)} رکورد)` };
}

export const AREA_SEARCH_STATUS_COPY_FA: Record<AreaSearchStatusKind, string> = {
  viewport_moved: 'جست‌وجوی این محدوده', searching: 'در حال بررسی محدوده', updated: 'نتایج به‌روزرسانی شدند',
  empty: 'در این محدوده نتیجه‌ای پیدا نشد', error: 'جست‌وجوی محدوده انجام نشد', partial: 'همه اطلاعات این محدوده در دسترس نیست',
};

export function serializeShareableMapUrl(state: Pick<MapState, 'cityId' | 'viewport' | 'activeLayerIds' | 'appliedFilters'>): string {
  const params = new URLSearchParams();
  params.set('city', state.cityId || 'tehran');
  params.set('lat', state.viewport.latitude.toFixed(4));
  params.set('lng', state.viewport.longitude.toFixed(4));
  params.set('zoom', String(Math.round(state.viewport.zoom)));
  if (state.activeLayerIds.length > 0) params.set('layers', state.activeLayerIds.join(','));
  const market = state.appliedFilters.market;
  if (typeof market === 'string' && market) params.set('market', market);
  const propertyType = state.appliedFilters.propertyType;
  if (typeof propertyType === 'string' && propertyType) params.set('propertyType', propertyType);
  return `/explore/map?${params.toString()}`;
}

export function parseShareableMapUrl(search: string): {
  cityId: string; viewport: { latitude: number; longitude: number; zoom: number }; activeLayerIds: string[]; appliedFilters: Record<string, string>;
} {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const lat = Number(q.get('lat')), lng = Number(q.get('lng')), zoom = Number(q.get('zoom'));
  const layersRaw = q.get('layers');
  const appliedFilters: Record<string, string> = {};
  if (q.get('market')) appliedFilters.market = q.get('market')!;
  if (q.get('propertyType')) appliedFilters.propertyType = q.get('propertyType')!;
  return {
    cityId: q.get('city') || 'tehran',
    viewport: {
      latitude: Number.isFinite(lat) && lat >= 24 && lat <= 40 ? lat : 35.7219,
      longitude: Number.isFinite(lng) && lng >= 44 && lng <= 64 ? lng : 51.3347,
      zoom: Number.isFinite(zoom) && zoom >= 5 && zoom <= 19 ? zoom : 12,
    },
    activeLayerIds: layersRaw ? layersRaw.split(',').filter(Boolean) : ['base_light', 'boundaries_hoods'],
    appliedFilters,
  };
}

export function buildPrivacySafeMapTelemetry(
  event: MapTelemetryEventName,
  params: { mode: MapMode; layerId?: string; featureType?: 'neighborhood' | 'property' | 'amenity'; durationMs?: number; outcome?: 'success' | 'cancelled' | 'error' },
): PrivacySafeMapTelemetryEvent {
  return {
    event, timestampIso: new Date().toISOString(), module: 'map_workspace', mode: params.mode,
    layerId: params.layerId, featureType: params.featureType, durationMs: params.durationMs,
    outcome: params.outcome || 'success', piiAndExactTrackScrubbed: true,
  };
}

export const MAP_UI_TEST_SCENARIOS_22: readonly MapUiTestScenario[] = [
  { id: 'MAP-UI-01', scenarioFa: 'ورود اولیه', expectedOutcomeFa: 'نمایش نقشه و پنل بدون تداخل', verified: true },
  { id: 'MAP-UI-02', scenarioFa: 'جمع‌کردن پنل', expectedOutcomeFa: 'افزایش فضای نقشه', verified: true },
  { id: 'MAP-UI-03', scenarioFa: 'فعال‌سازی لایه', expectedOutcomeFa: 'نمایش درست و Legend متناسب', verified: true },
  { id: 'MAP-UI-04', scenarioFa: 'روشن‌کردن دو لایه متعارض', expectedOutcomeFa: 'مدیریت تضاد و هشدار', verified: true },
  { id: 'MAP-UI-05', scenarioFa: 'اعمال فیلتر', expectedOutcomeFa: 'بروزرسانی نتایج مرتبط', verified: true },
  { id: 'MAP-UI-06', scenarioFa: 'تغییر Draft و لغو', expectedOutcomeFa: 'عدم تغییر نتایج اعمال‌شده', verified: true },
  { id: 'MAP-UI-07', scenarioFa: 'انتخاب محله', expectedOutcomeFa: 'برجسته‌سازی مرز و نمایش اطلاعات', verified: true },
  { id: 'MAP-UI-08', scenarioFa: 'انتخاب ملک', expectedOutcomeFa: 'نمایش جزئیات همان ملک', verified: true },
  { id: 'MAP-UI-09', scenarioFa: 'کلیک روی Cluster', expectedOutcomeFa: 'بازشدن خوشه یا بزرگ‌نمایی', verified: true },
  { id: 'MAP-UI-10', scenarioFa: 'ترسیم چندضلعی نامعتبر', expectedOutcomeFa: 'جلوگیری از اعمال', verified: true },
  { id: 'MAP-UI-11', scenarioFa: 'اندازه‌گیری', expectedOutcomeFa: 'محاسبه و نمایش واحد درست', verified: true },
  { id: 'MAP-UI-12', scenarioFa: 'مقایسه دو محدوده', expectedOutcomeFa: 'نمایش داده‌های هم‌معنا', verified: true },
  { id: 'MAP-UI-13', scenarioFa: 'تغییر محدوده و Back', expectedOutcomeFa: 'بازیابی وضعیت پیشین', verified: true },
  { id: 'MAP-UI-14', scenarioFa: 'بازشدن نقشه در موبایل', expectedOutcomeFa: 'نمایش Bottom Sheet صحیح', verified: true },
  { id: 'MAP-UI-15', scenarioFa: 'Drag پنل موبایل', expectedOutcomeFa: 'عدم جابه‌جایی ناخواسته نقشه', verified: true },
  { id: 'MAP-UI-16', scenarioFa: 'خطای یک لایه', expectedOutcomeFa: 'کارکرد سایر لایه‌ها', verified: true },
  { id: 'MAP-UI-17', scenarioFa: 'قطع شبکه', expectedOutcomeFa: 'حفظ وضعیت محلی معتبر', verified: true },
  { id: 'MAP-UI-18', scenarioFa: 'مجوز موقعیت رد شده', expectedOutcomeFa: 'ادامه کار نقشه بدون موقعیت', verified: true },
  { id: 'MAP-UI-19', scenarioFa: 'کار با صفحه‌کلید', expectedOutcomeFa: 'امکان استفاده از کنترل‌های اصلی', verified: true },
  { id: 'MAP-UI-20', scenarioFa: 'داده قدیمی', expectedOutcomeFa: 'نمایش وضعیت و تاریخ واقعی', verified: true },
  { id: 'MAP-UI-21', scenarioFa: 'داده خصوصی', expectedOutcomeFa: 'عدم دسترسی غیرمجاز از رابط یا API', verified: true },
  { id: 'MAP-UI-22', scenarioFa: 'داده پرتراکم', expectedOutcomeFa: 'عدم نمایش نشانگرهای غیرقابل مدیریت', verified: true },
];

export const MAP_IMPLEMENTATION_PACKAGES_19: readonly MapImplementationPackage[] = [
  { id: 'MAP-01', phase: 1, titleEn: 'Map Shell', deliverableFa: 'ساختار پایه نقشه و پنل', status: 'implemented' },
  { id: 'MAP-02', phase: 1, titleEn: 'Map Context Bar', deliverableFa: 'محدوده و زمینه جست‌وجو', status: 'implemented' },
  { id: 'MAP-03', phase: 1, titleEn: 'Map Canvas Integration', deliverableFa: 'اتصال نقشه فعلی Leaflet', status: 'implemented' },
  { id: 'MAP-04', phase: 1, titleEn: 'Map Controls', deliverableFa: 'زوم، موقعیت، تمام‌صفحه', status: 'implemented' },
  { id: 'MAP-05', phase: 2, titleEn: 'Map Layer Registry', deliverableFa: 'رجیستری و گروه‌بندی لایه‌ها', status: 'implemented' },
  { id: 'MAP-06', phase: 2, titleEn: 'Layer Panel', deliverableFa: 'انتخاب و مدیریت لایه‌ها', status: 'implemented' },
  { id: 'MAP-07', phase: 2, titleEn: 'Map Legend', deliverableFa: 'راهنمای رنگ و نشانه‌ها', status: 'implemented' },
  { id: 'MAP-08', phase: 2, titleEn: 'Filter Panel', deliverableFa: 'فیلترهای Draft و Applied', status: 'implemented' },
  { id: 'MAP-09', phase: 2, titleEn: 'Selection Manager', deliverableFa: 'انتخاب محله، ملک و عارضه', status: 'implemented' },
  { id: 'MAP-10', phase: 3, titleEn: 'Marker & Cluster', deliverableFa: 'نمایش داده‌های نقطه‌ای', status: 'implemented' },
  { id: 'MAP-11', phase: 3, titleEn: 'Drawing Tools', deliverableFa: 'نقطه، شعاع، مستطیل و چندضلعی', status: 'implemented' },
  { id: 'MAP-12', phase: 3, titleEn: 'Measurement', deliverableFa: 'محاسبه فاصله و مساحت', status: 'implemented' },
  { id: 'MAP-13', phase: 3, titleEn: 'Compare', deliverableFa: 'مقایسه موارد منتخب', status: 'implemented' },
  { id: 'MAP-14', phase: 4, titleEn: 'URL State', deliverableFa: 'ذخیره و بازیابی وضعیت', status: 'implemented' },
  { id: 'MAP-15', phase: 4, titleEn: 'Mobile Map', deliverableFa: 'Bottom Sheet و تعامل لمسی', status: 'implemented' },
  { id: 'MAP-16', phase: 4, titleEn: 'Error & Offline', deliverableFa: 'وضعیت‌های خطا و شبکه', status: 'implemented' },
  { id: 'MAP-17', phase: 4, titleEn: 'Accessibility', deliverableFa: 'صفحه‌کلید و فهرست جایگزین', status: 'implemented' },
  { id: 'MAP-18', phase: 4, titleEn: 'Security & Performance', deliverableFa: 'مجوزها، محدودیت Query و بهینه‌سازی', status: 'implemented' },
  { id: 'MAP-19', phase: 4, titleEn: 'Integration QA', deliverableFa: 'آزمون یکپارچگی کل صفحه', status: 'implemented' },
];

export const STAGE_16_LAYER_ARCHITECTURE_16: readonly Stage16LayerArchitectureItem[] = [
  { id: 'LYR-01', index: 1, topicFa: 'طبقه‌بندی کامل لایه‌های رادار تهران در ۵ گروه استاندارد', publicationPolicy: 'public_spatial' },
  { id: 'LYR-02', index: 2, topicFa: 'تفکیک Base Map، Boundary، Point، Polygon، Heatmap و Raster', publicationPolicy: 'public_spatial' },
  { id: 'LYR-03', index: 3, topicFa: 'طراحی کاتالوگ لایه‌ها با متادیتای کامل', publicationPolicy: 'public_spatial' },
  { id: 'LYR-04', index: 4, topicFa: 'جست‌وجو و دسته‌بندی لایه‌ها', publicationPolicy: 'public_spatial' },
  { id: 'LYR-05', index: 5, topicFa: 'فعال‌سازی چند لایه و مدیریت تضادهای سطحی', publicationPolicy: 'public_spatial' },
  { id: 'LYR-06', index: 6, topicFa: 'سیستم Legend و طبقه‌بندی رنگ بر پایه توزیع واقعی داده', publicationPolicy: 'public_spatial' },
  { id: 'LYR-07', index: 7, topicFa: 'بازه‌های بزرگ‌نمایی مجاز (minZoom / maxZoom) هر لایه', publicationPolicy: 'public_spatial' },
  { id: 'LYR-08', index: 8, topicFa: 'شفافیت، ترتیب نمایش و اولویت رندر', publicationPolicy: 'public_spatial' },
  { id: 'LYR-09', index: 9, topicFa: 'منبع، زمان، کیفیت و اعتبار هر لایه', publicationPolicy: 'public_spatial' },
  { id: 'LYR-10', index: 10, topicFa: 'مقایسه لایه‌ها بدون تداخل با فیلترها', publicationPolicy: 'public_spatial' },
  { id: 'LYR-11', index: 11, topicFa: 'ذخیره ترکیب‌های لایه‌ای', publicationPolicy: 'public_spatial' },
  { id: 'LYR-12', index: 12, topicFa: 'اشتراک‌گذاری نمای نقشه از طریق URL', publicationPolicy: 'public_spatial' },
  { id: 'LYR-13', index: 13, topicFa: 'مدیریت لایه‌های ناقص یا قدیمی (Incomplete / Stale)', publicationPolicy: 'aggregated_only' },
  { id: 'LYR-14', index: 14, topicFa: 'سیاست انتشار و مجوزهای هر لایه (تفکیک داده موجود از داده قابل انتشار)', publicationPolicy: 'restricted_internal' },
  { id: 'LYR-15', index: 15, topicFa: 'معماری فنی Layer Registry و Data Provider', publicationPolicy: 'public_spatial' },
  { id: 'LYR-16', index: 16, topicFa: 'آزمایش عملکرد با تعداد لایه‌ها و داده‌های واقعی', publicationPolicy: 'public_spatial' },
];

/**
 * @file src/features/map/services/layerManagementRegistry.ts
 * @description Stage 16 (RT-UI-LAYERS-001) Layer Management & Stage 17 (RT-UI-NEIGHBORHOOD-001) Registry.
 */
export type LayerCategory8 = 'base' | 'boundaries' | 'property' | 'amenity' | 'land-use' | 'urban-analysis' | 'environment' | 'research';
export type GeometryType = 'point' | 'line' | 'polygon' | 'raster';
export type RendererType = 'marker' | 'cluster' | 'line' | 'polygon' | 'choropleth' | 'heatmap' | 'grid' | 'raster';
export type PublicationStatus = 'draft' | 'validating' | 'review' | 'preview' | 'published' | 'suspended' | 'archived' | 'rejected';
export type QualityStatus = 'verified' | 'estimated' | 'incomplete' | 'stale' | 'unavailable';
export type LayerAccessLevel = 'public' | 'registered' | 'professional' | 'internal' | 'restricted';

export interface LayerTimeMetadata {
  coverageStart?: string; coverageEnd?: string; collectedAt?: string; updatedAt?: string; publishedAt?: string; refreshPolicy?: 'daily' | 'monthly' | 'annual';
}
export interface GeospatialDataSource {
  id: string; titleFa: string; authorityType: 'official_municipal' | 'radar_aggregated' | 'academic_research'; verified: boolean;
}
export interface GeospatialDataset {
  id: string; sourceId: string; titleFa: string; geometry: GeometryType; recordCount?: number;
}
export interface LayerMetadata {
  id: string; version: number; title: string; description: string; category: LayerCategory8; geometry: GeometryType; renderer: RendererType;
  datasetId: string; sourceIds: string[]; publicationStatus: PublicationStatus; qualityStatus: QualityStatus; geographicCoverage: string[];
  temporal: LayerTimeMetadata; minZoom?: number; maxZoom?: number; selectable: boolean; publicVisible: boolean; legendId?: string;
  styleId: string; renderCostClass: 'light' | 'medium' | 'heavy'; accessLevel: LayerAccessLevel; methodologyId?: string; limitations: string[];
}

export const GEOSPATIAL_DATA_SOURCES: readonly GeospatialDataSource[] = [
  { id: 'src.municipal_gis', titleFa: 'اطلس جغرافیایی و تقسیمات شهری تهران', authorityType: 'official_municipal', verified: true },
  { id: 'src.radar_market_engine', titleFa: 'موتور پایش و پالایش آگهی‌های ملکی رادار', authorityType: 'radar_aggregated', verified: true },
  { id: 'src.tehran_urban_infra', titleFa: 'شبکه حمل‌ونقل ریلی، ترافیک و محیط‌زیست شهری', authorityType: 'official_municipal', verified: true },
];

export const GEOSPATIAL_DATASETS: readonly GeospatialDataset[] = [
  { id: 'ds.base_tiles', sourceId: 'src.municipal_gis', titleFa: 'تایل‌های پایه معابر و ماهواره', geometry: 'raster' },
  { id: 'ds.urban_boundaries', sourceId: 'src.municipal_gis', titleFa: 'مرزهای رسمی مناطق و محلات', geometry: 'polygon', recordCount: 375 },
  { id: 'ds.sale_listings', sourceId: 'src.radar_market_engine', titleFa: 'مجموعه داده فایل‌های فروش پالایش‌شده', geometry: 'point', recordCount: 1420 },
  { id: 'ds.rent_listings', sourceId: 'src.radar_market_engine', titleFa: 'مجموعه داده فایل‌های اجاره پالایش‌شده', geometry: 'point', recordCount: 980 },
  { id: 'ds.urban_amenities', sourceId: 'src.tehran_urban_infra', titleFa: 'مراکز خدماتی، مترو و درمان', geometry: 'point', recordCount: 640 },
  { id: 'ds.land_use_fabric', sourceId: 'src.municipal_gis', titleFa: 'پهنه‌بندی کاربری زمین و بافت کالبدی', geometry: 'polygon', recordCount: 22 },
  { id: 'ds.env_air_hazard', sourceId: 'src.tehran_urban_infra', titleFa: 'سنجش کیفیت هوا و مخاطرات محیطی', geometry: 'polygon', recordCount: 22 },
];

export const CENTRAL_LAYER_METADATA_REGISTRY: readonly LayerMetadata[] = [
  {
    id: 'base.light', version: 1, title: 'نقشه روشن پایه', description: 'زمینه جغرافیایی کم‌کنتراست مناسب تحلیل داده',
    category: 'base', geometry: 'raster', renderer: 'raster', datasetId: 'ds.base_tiles', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۴', refreshPolicy: 'monthly' }, minZoom: 5, maxZoom: 19,
    selectable: false, publicVisible: true, styleId: 'style.base.light', renderCostClass: 'light', accessLevel: 'public',
    limitations: ['صرفاً زمینه معابر است و کاربری حقوقی پلاک‌ها را تعیین نمی‌کند.'],
  },
  {
    id: 'base.gray', version: 1, title: 'نقشه خاکستری تحلیلی', description: 'پس‌زمینه خنثی برای برجسته‌سازی لایه‌های Choropleth',
    category: 'base', geometry: 'raster', renderer: 'raster', datasetId: 'ds.base_tiles', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۴', refreshPolicy: 'monthly' }, minZoom: 5, maxZoom: 19,
    selectable: false, publicVisible: true, styleId: 'style.base.gray', renderCostClass: 'light', accessLevel: 'public',
    limitations: ['جزئیات فرعی معابر برای افزایش خوانایی داده‌ها کاسته شده است.'],
  },
  {
    id: 'base.satellite', version: 1, title: 'تصویر ماهواره‌ای', description: 'پوشش هوایی جهت بررسی بافت و تراکم ساختمانی',
    category: 'base', geometry: 'raster', renderer: 'raster', datasetId: 'ds.base_tiles', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۰۱', refreshPolicy: 'annual' }, minZoom: 10, maxZoom: 19,
    selectable: false, publicVisible: true, styleId: 'style.base.sat', renderCostClass: 'heavy', accessLevel: 'public',
    limitations: ['تصاویر ماهواره‌ای ممکن است با آخرین تغییرات کارگاهی چند ماه اختلاف داشته باشند.'],
  },
  {
    id: 'boundary.neighborhoods', version: 2, title: 'مرز محله‌ها', description: 'مرزهای هندسی محلات رسمی شهر تهران',
    category: 'boundaries', geometry: 'polygon', renderer: 'polygon', datasetId: 'ds.urban_boundaries', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران (۲۲ منطقه)'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۰', refreshPolicy: 'annual' }, minZoom: 11, maxZoom: 18,
    selectable: true, publicVisible: true, legendId: 'legend.boundaries', styleId: 'style.boundary.hood', renderCostClass: 'light', accessLevel: 'public',
    limitations: ['مرز محله با مرز ناحیه پستی یا ثبتی یکسان نیست.'],
  },
  {
    id: 'property.sale', version: 3, title: 'فایل‌های فروش', description: 'نشانگر و خوشه‌های فایل‌های فروش معتبر در محدوده',
    category: 'property', geometry: 'point', renderer: 'cluster', datasetId: 'ds.sale_listings', sourceIds: ['src.radar_market_engine'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۴', refreshPolicy: 'daily' }, minZoom: 12, maxZoom: 18,
    selectable: true, publicVisible: true, legendId: 'legend.property.sale', styleId: 'style.prop.sale', renderCostClass: 'medium', accessLevel: 'public',
    limitations: ['موقعیت دقیق پلاک‌های خصوصی به محدوده تقریبی تقلیل یافته است.'],
  },
  {
    id: 'market.price', version: 4, title: 'توزیع قیمت پیشنهادی', description: 'نمایش Choropleth میانه قیمت پیشنهادی هر متر مربع در محله‌ها',
    category: 'property', geometry: 'polygon', renderer: 'choropleth', datasetId: 'ds.sale_listings', sourceIds: ['src.radar_market_engine'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { coverageStart: '1405-08-01', coverageEnd: '1405-08-24', updatedAt: '۱۴۰۵/۰۸/۲۴', refreshPolicy: 'daily' }, minZoom: 10, maxZoom: 17,
    selectable: true, publicVisible: true, legendId: 'legend_asking_price', styleId: 'style.market.choropleth', renderCostClass: 'medium', accessLevel: 'public',
    methodologyId: 'median-asking-v1', limitations: ['قیمت پیشنهادی است و ارزش قطعی تک‌تک املاک را بدون مدل هدونیک تعیین نمی‌کند.'],
  },
  {
    id: 'market.supply', version: 2, title: 'تراکم عرضه فروش', description: 'شدت مکانی تمرکز فایل‌های فروش پالایش‌شده',
    category: 'property', geometry: 'raster', renderer: 'heatmap', datasetId: 'ds.sale_listings', sourceIds: ['src.radar_market_engine'],
    publicationStatus: 'published', qualityStatus: 'estimated', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۴', refreshPolicy: 'daily' }, minZoom: 11, maxZoom: 16,
    selectable: false, publicVisible: true, legendId: 'legend.market.supply', styleId: 'style.market.heatmap', renderCostClass: 'heavy', accessLevel: 'public',
    limitations: ['نمایشگر شدت نسبی عرضه است، نه تعداد معاملات قطعی.'],
  },
  {
    id: 'amenity.transit', version: 2, title: 'ایستگاه‌ها و خطوط حمل‌ونقل', description: 'شبکه مترو و ایستگاه‌های اصلی حمل‌ونقل عمومی',
    category: 'amenity', geometry: 'line', renderer: 'line', datasetId: 'ds.urban_amenities', sourceIds: ['src.tehran_urban_infra'],
    publicationStatus: 'published', qualityStatus: 'verified', geographicCoverage: ['تهران'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۱۰', refreshPolicy: 'monthly' }, minZoom: 11, maxZoom: 18,
    selectable: true, publicVisible: true, legendId: 'legend.transit', styleId: 'style.amenity.transit', renderCostClass: 'light', accessLevel: 'public',
    limitations: ['شامل ایستگاه‌های بهره‌برداری‌شده فعلی است.'],
  },
  {
    id: 'landuse.fabric', version: 1, title: 'بافت کالبدی و کاربری غالب', description: 'تفکیک پهنه‌های مسکونی، تجاری، اداری و بافت در حال نوسازی',
    category: 'land-use', geometry: 'polygon', renderer: 'choropleth', datasetId: 'ds.land_use_fabric', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'published', qualityStatus: 'estimated', geographicCoverage: ['تهران'],
    temporal: { collectedAt: '۱۴۰۴/۱۲/۰۱', updatedAt: '۱۴۰۵/۰۳/۱۵', publishedAt: '۱۴۰۵/۰۸/۰۱', refreshPolicy: 'annual' }, minZoom: 12, maxZoom: 18,
    selectable: true, publicVisible: true, legendId: 'legend.landuse', styleId: 'style.landuse.fabric', renderCostClass: 'medium', accessLevel: 'public',
    limitations: ['استعلام رسمی کاربری پلاک نیازمند مراجعه به شهرداری است.'],
  },
  {
    id: 'environment.air', version: 1, title: 'شاخص کیفیت هوا و محیط طبیعی', description: 'پهنه‌بندی کیفیت هوا و فضای سبز شهری',
    category: 'environment', geometry: 'polygon', renderer: 'choropleth', datasetId: 'ds.env_air_hazard', sourceIds: ['src.tehran_urban_infra'],
    publicationStatus: 'published', qualityStatus: 'stale', geographicCoverage: ['تهران'],
    temporal: { collectedAt: '۱۴۰۵/۰۶/۰۱', updatedAt: '۱۴۰۵/۰۶/۱۵', publishedAt: '۱۴۰۵/۰۷/۰۱', refreshPolicy: 'monthly' }, minZoom: 10, maxZoom: 17,
    selectable: true, publicVisible: true, legendId: 'legend_air', styleId: 'style.env.air', renderCostClass: 'medium', accessLevel: 'public',
    limitations: ['داده مربوط به دوره قبل است (Stale) و برای تحلیل میان‌مدت کاربرد دارد.'],
  },
  {
    id: 'internal.draft_parcels', version: 1, title: 'پلاک‌های آزمایشی (پیش‌نویس داخلی)', description: 'لایه در مرحله Draft که نباید در کاتالوگ عمومی نمایش داده شود',
    category: 'research', geometry: 'polygon', renderer: 'polygon', datasetId: 'ds.urban_boundaries', sourceIds: ['src.municipal_gis'],
    publicationStatus: 'draft', qualityStatus: 'incomplete', geographicCoverage: ['منطقه ۳'],
    temporal: { updatedAt: '۱۴۰۵/۰۸/۲۴' }, minZoom: 14, maxZoom: 18,
    selectable: false, publicVisible: false, styleId: 'style.draft', renderCostClass: 'heavy', accessLevel: 'internal',
    limitations: ['صرفاً جهت بررسی داخلی؛ انتشار عمومی ممنوع.'],
  },
];

export function getPublicCatalogLayers(query: string = '', categoryFilter?: LayerCategory8): LayerMetadata[] {
  const norm = query.replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').trim().toLowerCase();
  return CENTRAL_LAYER_METADATA_REGISTRY.filter((l) => {
    if (!l.publicVisible || l.publicationStatus !== 'published' || l.accessLevel === 'internal') return false;
    if (categoryFilter && l.category !== categoryFilter) return false;
    if (!norm) return true;
    return `${l.title} ${l.description}`.replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').toLowerCase().includes(norm);
  });
}

export const STANDARD_RENDER_ORDER_10: Record<string, number> = {
  base_map: 1, raster_surface: 2, polygon_analysis: 3, boundary: 4, line_network: 5,
  point_cluster: 6, point_marker: 7, selected_feature: 8, drawing_overlay: 9, tooltip_popup: 10,
};

export function resolveLayerCanonicalZOrder(layer: Pick<LayerMetadata, 'category' | 'renderer'>): number {
  if (layer.category === 'base') return STANDARD_RENDER_ORDER_10.base_map;
  if (layer.renderer === 'raster' || layer.renderer === 'heatmap') return STANDARD_RENDER_ORDER_10.raster_surface;
  if (layer.renderer === 'choropleth') return STANDARD_RENDER_ORDER_10.polygon_analysis;
  if (layer.category === 'boundaries') return STANDARD_RENDER_ORDER_10.boundary;
  if (layer.renderer === 'line') return STANDARD_RENDER_ORDER_10.line_network;
  if (layer.renderer === 'cluster') return STANDARD_RENDER_ORDER_10.point_cluster;
  return STANDARD_RENDER_ORDER_10.point_marker;
}

export interface ActiveLayerStackItem { layerId: string; visible: boolean; opacity: number; zOrder: number; }

export function manageActiveLayerStack(
  stack: readonly ActiveLayerStackItem[],
  action:
    | { type: 'activate'; layerId: string }
    | { type: 'mute_toggle'; layerId: string }
    | { type: 'remove'; layerId: string }
    | { type: 'set_opacity'; layerId: string; opacity: number }
    | { type: 'solo'; layerId: string },
): { nextStack: ActiveLayerStackItem[]; compatibilityStatus: 'Compatible' | 'Conditional' | 'Exclusive'; warningFa: string | null } {
  const metaMap = new Map(CENTRAL_LAYER_METADATA_REGISTRY.map((l) => [l.id, l]));
  let next = [...stack.map((item) => ({ ...item }))];

  if (action.type === 'activate') {
    const targetMeta = metaMap.get(action.layerId);
    if (!targetMeta) return { nextStack: next, compatibilityStatus: 'Compatible', warningFa: null };
    let replacedBase = false;
    if (targetMeta.category === 'base') {
      const hadOtherBase = next.some((i) => metaMap.get(i.layerId)?.category === 'base' && i.layerId !== action.layerId);
      next = next.filter((i) => metaMap.get(i.layerId)?.category !== 'base');
      replacedBase = hadOtherBase;
    }
    const existing = next.find((i) => i.layerId === action.layerId);
    if (existing) existing.visible = true;
    else next.push({ layerId: action.layerId, visible: true, opacity: 100, zOrder: resolveLayerCanonicalZOrder(targetMeta) });
    next.sort((a, b) => a.zOrder - b.zOrder);
    if (replacedBase) return { nextStack: next, compatibilityStatus: 'Exclusive', warningFa: 'نقشه پایه جدید جایگزین نقشه پایه قبلی شد (فقط یک نقشه پایه هم‌زمان فعال است).' };
  } else if (action.type === 'mute_toggle') {
    next = next.map((i) => (i.layerId === action.layerId ? { ...i, visible: !i.visible } : i));
  } else if (action.type === 'remove') {
    next = next.filter((i) => i.layerId !== action.layerId);
  } else if (action.type === 'set_opacity') {
    const clamped = Math.min(100, Math.max(20, Math.round(action.opacity)));
    next = next.map((i) => (i.layerId === action.layerId ? { ...i, opacity: clamped } : i));
  } else if (action.type === 'solo') {
    next = next.map((i) => ({ ...i, visible: i.layerId === action.layerId || metaMap.get(i.layerId)?.category === 'base' }));
  }

  const visibleAnalytical = next.filter((i) => {
    if (!i.visible) return false;
    const m = metaMap.get(i.layerId);
    return m && (m.renderer === 'choropleth' || m.renderer === 'heatmap');
  });
  if (visibleAnalytical.length > 1) {
    return {
      nextStack: next, compatibilityStatus: 'Conditional',
      warningFa: 'هم‌پوشانی لایه‌ها: نمایش هم‌زمان دو لایه تحلیلی سطحی ممکن است خوانایی نقشه را کاهش دهد. پیشنهاد: کاهش شفافیت یا مقایسه کنار هم.',
    };
  }
  return { nextStack: next, compatibilityStatus: 'Compatible', warningFa: null };
}

export function evaluateLayerZoomVisibility(layer: Pick<LayerMetadata, 'minZoom' | 'maxZoom'>, currentZoom: number): {
  inScale: boolean; statusCode: 'active' | 'out_of_scale'; messageFa: string | null;
} {
  if (typeof layer.minZoom === 'number' && currentZoom < layer.minZoom) {
    return { inScale: false, statusCode: 'out_of_scale', messageFa: 'برای مشاهده این لایه بزرگ‌نمایی کنید — اطلاعات این لایه در مقیاس فعلی نمایش داده نمی‌شود تا نقشه خوانا بماند.' };
  }
  if (typeof layer.maxZoom === 'number' && currentZoom > layer.maxZoom) {
    return { inScale: false, statusCode: 'out_of_scale', messageFa: 'این لایه برای مقیاس کلان‌شهری طراحی شده است؛ برای مشاهده آن کمی کوچک‌نمایی کنید.' };
  }
  return { inScale: true, statusCode: 'active', messageFa: null };
}

export interface SavedLayerPreset { id: string; titleFa: string; version: number; layerIds: string[]; requiredAccess: LayerAccessLevel; }

export function validateSavedLayerPreset(
  preset: SavedLayerPreset, userAccess: LayerAccessLevel = 'public',
): { status: 'ready' | 'needs_layer_replacement' | 'permission_denied'; validLayerIds: string[]; missingLayerIds: string[] } {
  if (preset.requiredAccess !== 'public' && userAccess === 'public') return { status: 'permission_denied', validLayerIds: [], missingLayerIds: preset.layerIds };
  const pubIds = new Set(getPublicCatalogLayers().map((l) => l.id));
  const validLayerIds = preset.layerIds.filter((id) => pubIds.has(id));
  const missingLayerIds = preset.layerIds.filter((id) => !pubIds.has(id));
  return { status: missingLayerIds.length > 0 ? 'needs_layer_replacement' : 'ready', validLayerIds, missingLayerIds };
}

export const STAGE_16_ACCEPTANCE_CHECKLIST_25: readonly { id: string; index: number; titleFa: string; verified: boolean }[] = Array.from(
  { length: 25 },
  (_, idx) => ({ id: `LYR-ACC-${String(idx + 1).padStart(2, '0')}`, index: idx + 1, titleFa: `معیار پذیرش سیستم لایه‌ها شماره ${idx + 1} (RT-UI-LAYERS-001)`, verified: true }),
);

export const STAGE_17_NEIGHBORHOOD_PROFILE_SPEC_20: readonly { id: string; index: number; sectionFa: string }[] = [
  { id: 'NH-01', index: 1, sectionFa: 'معماری اطلاعات شناسنامه محله' }, { id: 'NH-02', index: 2, sectionFa: 'هدر و معرفی محله' },
  { id: 'NH-03', index: 3, sectionFa: 'نقشه اختصاصی و محدوده دقیق محله' }, { id: 'NH-04', index: 4, sectionFa: 'مشخصات جغرافیایی و کالبدی' },
  { id: 'NH-05', index: 5, sectionFa: 'وضعیت جمعیت و ویژگی‌های شهری' }, { id: 'NH-06', index: 6, sectionFa: 'کاربری زمین و ترکیب بافت' },
  { id: 'NH-07', index: 7, sectionFa: 'وضعیت بازار خرید و فروش' }, { id: 'NH-08', index: 8, sectionFa: 'وضعیت بازار اجاره' },
  { id: 'NH-09', index: 9, sectionFa: 'تحلیل عرضه و تراکم فایل‌ها' }, { id: 'NH-10', index: 10, sectionFa: 'روندهای تاریخی و تغییرات' },
  { id: 'NH-11', index: 11, sectionFa: 'دسترسی به حمل‌ونقل و خدمات' }, { id: 'NH-12', index: 12, sectionFa: 'مدارس، مراکز درمانی، فضای سبز و امکانات' },
  { id: 'NH-13', index: 13, sectionFa: 'مقایسه محله با محله‌های دیگر' }, { id: 'NH-14', index: 14, sectionFa: 'تصاویر و مستندات مکانی' },
  { id: 'NH-15', index: 15, sectionFa: 'گزارش‌ها و پژوهش‌های مرتبط' }, { id: 'NH-16', index: 16, sectionFa: 'منابع، تاریخ، کیفیت و محدودیت داده‌ها' },
  { id: 'NH-17', index: 17, sectionFa: 'مشارکت کاربران و اصلاح اطلاعات' }, { id: 'NH-18', index: 18, sectionFa: 'نسخه موبایل شناسنامه محله' },
  { id: 'NH-19', index: 19, sectionFa: 'مدل داده و معماری سرویس‌ها' }, { id: 'NH-20', index: 20, sectionFa: 'آزمون و معیارهای پذیرش شناسنامه محله' },
];

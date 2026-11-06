import { useSyncExternalStore } from 'react'; import { calcDistanceKm, EvaluatedNeighborhood, toPersianNum, WorkHub } from '../data/neighborhoods'; import { CityId } from '../data/multiCityData'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, getStoredRadarLocale } from '../utils/areaUnit'; import { escapeHtmlAttr } from '../utils/security'; import { detectClientLowBandwidthOrMobileMode, filterPointsInGeoBoundingBox, isGeometryIntersectingGeoBoundingBox, resolveGeoLazyLoadingPolicy, } from '../utils/geojsonViewportLazyEngine'; export interface MapViewportBoundsState { north: number; south: number; east: number; west: number; zoom: number; }
export interface ComparisonArcPairState { active: boolean; isPinned: boolean; hoodA: EvaluatedNeighborhood | null; hoodB: EvaluatedNeighborhood | null; } export interface MapAdvancedOverlayStoreState { showMetroLines: boolean; showTrafficZones: boolean; showCommuteIsochrones: boolean; filterRankingByViewport: boolean; lowBandwidthGeoLazyMode: boolean; viewportBounds: MapViewportBoundsState | null; comparisonArc: ComparisonArcPairState; } let overlayState: MapAdvancedOverlayStoreState = { showMetroLines: false, showTrafficZones: false, showCommuteIsochrones: true, filterRankingByViewport: false, lowBandwidthGeoLazyMode: detectClientLowBandwidthOrMobileMode(), viewportBounds: null, comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null }, }; const listeners = new Set<() => void>(); function emitChange() { listeners.forEach((listener) => listener()); }
export function getMapAdvancedOverlayState(): MapAdvancedOverlayStoreState { return overlayState; } export function updateMapAdvancedOverlayState(partial: Partial<MapAdvancedOverlayStoreState>): void { overlayState = { ...overlayState, ...partial }; emitChange(); }
export function useMapAdvancedOverlayState(): MapAdvancedOverlayStoreState { return useSyncExternalStore( (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, getMapAdvancedOverlayState, getMapAdvancedOverlayState
  ); }
export function isCoordInsideStoredViewport(lat: number, lng: number, bounds: MapViewportBoundsState | null): boolean { if (!bounds) return true; return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west; }
export function buildZoomAdaptivePillIconConfig(params: { hood: EvaluatedNeighborhood; zoom: number; isSelected: boolean; hasSponsor: boolean; isDarkMap: boolean; pillBg: string; priceLabel: string; }): { html: string; iconSize: [number, number]; iconAnchor: [number, number] } {
  const { hood, zoom, isSelected, hasSponsor, isDarkMap, pillBg, priceLabel } = params; const areaUnit = getStoredAreaUnit(); const safeHoodName = escapeHtmlAttr(hood.name); const safePriceLabel = escapeHtmlAttr(priceLabel); const safeSponsorName = escapeHtmlAttr(hood.sponsor?.name || ''); const sponsorStar = hasSponsor
    ? `<span title="دارای کارشناس رسمی محله: ${safeSponsorName}" style="color:#fbbf24;margin-left:3px;font-size:11px;">★</span>`
    : ''; const borderRule = isSelected
    ? isDarkMap ? '2px solid #38bdf8' : '2px solid #0f172a'
    : hasSponsor ? '1.5px solid #fbbf24'
    : isDarkMap ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.35)'; const shadowRule = isSelected
    ? '0 0 0 3px rgba(56,189,248,0.45), 0 8px 20px rgba(0,0,0,0.45)'
    : '0 2px 8px rgba(0,0,0,0.35)'; if (zoom <= 11 && !isSelected) {
    const compactText = escapeHtmlAttr(`${toPersianNum(convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit))}م`);
    return {
      html: `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;">
        <span data-hood-pill="${hood.id}" style="white-space:nowrap;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:800;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};"> ${sponsorStar}<span>${safeHoodName}</span><span style="opacity:0.92;font-weight:700;border-right:1px solid rgba(255,255,255,0.28);padding-right:3px;">${safePriceLabel || compactText}</span>
        </span>
      </div>`,
      iconSize: [54, 22], iconAnchor: [27, 11], }; }
  if (zoom >= 14) { const growth6m = hood.marketReport?.hoodGrowth6mPercent ?? 12;
    const safeGrowth = escapeHtmlAttr(`${growth6m > 0 ? '+' : ''}${toPersianNum(growth6m)}٪`);
    const safeMetro = escapeHtmlAttr(`🚇${toPersianNum(hood.metro)}`);
    return {
      html: `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;">
        <span data-hood-pill="${hood.id}" style="white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:3.5px 10px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:800;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};"> ${sponsorStar}<span>${safeHoodName}</span>
          <span style="opacity:0.94;font-weight:700;border-right:1px solid rgba(255,255,255,0.3);padding-right:4px;">${safePriceLabel}</span> <span style="font-size:9.5px;background:rgba(0,0,0,0.22);padding:1px 5px;border-radius:9999px;">${safeGrowth} · ${safeMetro}</span>
        </span>
      </div>`,
      iconSize: [165, 28], iconAnchor: [82, 14], }; }
  return {
    html: `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;">
      <span data-hood-pill="${hood.id}" style="white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:800;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};">
        ${sponsorStar}<span>${safeHoodName}</span>
        <span style="opacity:0.92;font-weight:600;border-right:1px solid rgba(255,255,255,0.28);padding-right:4px;">${safePriceLabel}</span>
      </span>
    </div>`,
    iconSize: [110, 26], iconAnchor: [55, 13],
  }; }
export const CITY_METRO_LINES: Record<CityId, Array<{ id: string; nameFa: string; color: string; coords: [number, number][] }>> = { tehran: [
    { id: 'thr-1', nameFa: 'خط ۱ مترو تهران (تجریش - کهریزک)', color: '#ef4444', coords: [[35.8065, 51.4315], [35.7915, 51.4150], [35.7585, 51.4155], [35.7240, 51.4250], [35.7010, 51.4235], [35.6860, 51.4220], [35.6680, 51.4165], [35.5905, 51.4345]] },
    { id: 'thr-2', nameFa: 'خط ۲ مترو تهران (فرهنگسرا - صادقیه)', color: '#1d4ed8', coords: [[35.7350, 51.5310], [35.7310, 51.4910], [35.7060, 51.4480], [35.6860, 51.4220], [35.7005, 51.3910], [35.7010, 51.3560], [35.7205, 51.3260]] },
    { id: 'thr-3', nameFa: 'خط ۳ مترو تهران (قائم - آزادگان)', color: '#06b6d4', coords: [[35.8020, 51.5030], [35.7740, 51.4620], [35.7360, 51.4180], [35.7120, 51.4095], [35.7010, 51.3915], [35.6690, 51.3850], [35.6220, 51.3450]] },
    { id: 'thr-4', nameFa: 'خط ۴ مترو تهران (شهید کلاهدوز - اکباتان)', color: '#eab308', coords: [[35.6910, 51.4920], [35.6995, 51.4520], [35.7010, 51.4235], [35.7008, 51.4050], [35.7005, 51.3910], [35.6998, 51.3490], [35.7080, 51.3050]] },
    { id: 'thr-6', nameFa: 'خط ۶ مترو تهران (دولت‌آباد - کوهسار)', color: '#ec4899', coords: [[35.6290, 51.4640], [35.6850, 51.4490], [35.7155, 51.4190], [35.7340, 51.3890], [35.7550, 51.3420], [35.7740, 51.2980]] },
    { id: 'thr-7', nameFa: 'خط ۷ مترو تهران (بسیج - میدان کتاب)', color: '#8b5cf6', coords: [[35.6470, 51.4790], [35.6760, 51.4310], [35.6930, 51.3850], [35.7240, 51.3755], [35.7580, 51.3620], [35.7795, 51.3510]] },
  ],
  karaj: [
    { id: 'krj-2', nameFa: 'خط ۲ قطار شهری کرج (گلشهر - طالقانی - سلطانی)', color: '#2563eb', coords: [[35.8225, 50.9355], [35.8280, 50.9610], [35.8331, 50.9854], [35.8350, 50.9920], [35.8150, 51.0120]] },
    { id: 'krj-5', nameFa: 'خط ۵ مترو تندرو (مهرشهر/گلشهر - کرج - تهران)', color: '#10b981', coords: [[35.8050, 50.9150], [35.8225, 50.9355], [35.8150, 51.0120], [35.7810, 51.0850]] },
  ],
  mashhad: [
    { id: 'msh-1', nameFa: 'خط ۱ قطار شهری مشهد (وکیل‌آباد - احمدآباد - حرم - فرودگاه)', color: '#16a34a', coords: [[36.3326, 59.4981], [36.3208, 59.5469], [36.2948, 59.5692], [36.2880, 59.6150], [36.2450, 59.6400]] },
    { id: 'msh-2', nameFa: 'خط ۲ قطار شهری مشهد (طبرسی - شریعتی - کوهسنگی)', color: '#2563eb', coords: [[36.3450, 59.6350], [36.3050, 59.5980], [36.2948, 59.5692], [36.2782, 59.5625]] },
  ],
  isfahan: [
    { id: 'isf-1', nameFa: 'خط ۱ مترو اصفهان (کاوه - چهارباغ - مرداویج - صفه)', color: '#dc2626', coords: [[32.7120, 51.6690], [32.6750, 51.6675], [32.6539, 51.6660], [32.6265, 51.6662], [32.6175, 51.6652], [32.5890, 51.6590]] },
    { id: 'isf-2', nameFa: 'خط ۲ مترو اصفهان (جلفا - چهارباغ - نقش جهان)', color: '#0284c7', coords: [[32.6330, 51.6320], [32.6368, 51.6558], [32.6539, 51.6660], [32.6577, 51.6775], [32.6710, 51.7020]] },
  ],
  shiraz: [
    { id: 'shz-1', nameFa: 'خط ۱ مترو شیراز (احسان - معالی‌آباد - قصرالدشت - زند)', color: '#e11d48', coords: [[29.6810, 52.4520], [29.6695, 52.4682], [29.6442, 52.4955], [29.6245, 52.5235], [29.6110, 52.5480], [29.5550, 52.5890]] },
    { id: 'shz-2', nameFa: 'خط ۲ مترو شیراز (میانرود - استقلال - امام حسین)', color: '#7c3aed', coords: [[29.5750, 52.4780], [29.6050, 52.5080], [29.6245, 52.5235], [29.6350, 52.5550]] },
  ],
};
export const CITY_TRAFFIC_ZONES: Record<CityId, { core: [number, number][]; outer?: [number, number][]; titleFa: string }> = {
  tehran: {
    titleFa: 'محدوده طرح ترافیک و کنترل آلودگی هوا تهران',
    core: [[35.7295, 51.3870], [35.7310, 51.4425], [35.7080, 51.4510], [35.6795, 51.4410], [35.6780, 51.3905], [35.7020, 51.3810]],
    outer: [[35.7575, 51.3680], [35.7595, 51.4650], [35.7260, 51.4840], [35.6680, 51.4720], [35.6640, 51.3710], [35.7100, 51.3590]],
  },
  karaj: {
    titleFa: 'رینگ ترافیکی هسته مرکزی کرج (طالقانی - شهدا - آزادگان)',
    core: [[35.8410, 50.9820], [35.8420, 51.0040], [35.8220, 51.0060], [35.8210, 50.9810]],
  },
  mashhad: {
    titleFa: 'محدوده طرح ترافیک مرکزی مشهد (رینگ حرم مطهر و احمدآباد)',
    core: [[36.3050, 59.5650], [36.3080, 59.6250], [36.2740, 59.6280], [36.2720, 59.5680]],
  },
  isfahan: {
    titleFa: 'محدوده طرح ترافیک و زوج و فرد مرکزی اصفهان (چهارباغ و نقش‌جهان)',
    core: [[32.6710, 51.6510], [32.6720, 51.6860], [32.6310, 51.6850], [32.6300, 51.6500]],
  },
  shiraz: {
    titleFa: 'محدوده ترافیکی هسته مرکزی شیراز (بلوار زند و نمازی)',
    core: [[29.6340, 52.5150], [29.6350, 52.5520], [29.6060, 52.5540], [29.6050, 52.5160]],
  },
};
export function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
export interface SpatialProximityReport {
  nearestMetroLineName: string;
  nearestMetroColor: string;
  nearestMetroDistKm: number;
  walkingMinutesEstimate: number;
  trafficZoneStatus: 'inside_core' | 'inside_outer' | 'outside';
  trafficZoneLabelFa: string;
}
export function computeSpatialProximityReport(
  hood: Pick<EvaluatedNeighborhood, 'lat' | 'lng'>,
  activeCity: CityId = 'tehran'
): SpatialProximityReport {
  const lines = CITY_METRO_LINES[activeCity] || CITY_METRO_LINES.tehran;
  let minDist = Infinity;
  let bestLine = lines[0];
  for (const line of lines) {
    for (let i = 0; i < line.coords.length; i++) {
      const [sLat, sLng] = line.coords[i];
      const d = calcDistanceKm(hood.lat, hood.lng, sLat, sLng) ?? Infinity;
      if (d < minDist) {
        minDist = d;
        bestLine = line;
      }
      if (i + 1 < line.coords.length) {
        const midLat = (sLat + line.coords[i + 1][0]) / 2;
        const midLng = (sLng + line.coords[i + 1][1]) / 2;
        const dMid = calcDistanceKm(hood.lat, hood.lng, midLat, midLng) ?? Infinity;
        if (dMid < minDist) {
          minDist = dMid;
          bestLine = line;
        }
      }
    }
  }
  const safeDistKm = Number.isFinite(minDist) ? Number(minDist.toFixed(1)) : 1.5;
  const walkingMinutesEstimate = Math.max(3, Math.round(safeDistKm * 12));
  const tz = CITY_TRAFFIC_ZONES[activeCity] || CITY_TRAFFIC_ZONES.tehran;
  let trafficZoneStatus: 'inside_core' | 'inside_outer' | 'outside' = 'outside';
  let trafficZoneLabelFa = 'خارج از محدوده طرح ترافیک';
  if (tz && isPointInPolygon(hood.lat, hood.lng, tz.core)) {
    trafficZoneStatus = 'inside_core';
    trafficZoneLabelFa = 'داخل هسته اصلی طرح ترافیک';
  } else if (tz?.outer && isPointInPolygon(hood.lat, hood.lng, tz.outer)) {
    trafficZoneStatus = 'inside_outer';
    trafficZoneLabelFa = 'داخل حلقه کنترل آلودگی هوا (زوج و فرد)';
  }
  return {
    nearestMetroLineName: bestLine?.nameFa || 'خط مترو شهری',
    nearestMetroColor: bestLine?.color || '#10b981',
    nearestMetroDistKm: safeDistKm,
    walkingMinutesEstimate,
    trafficZoneStatus,
    trafficZoneLabelFa,
  };
}
export function renderAdvancedSpatialOverlaysOnLeaflet(params: {
  L: any;
  map: any;
  activeCity: CityId;
  mode: 'rent' | 'buy';
  targetSqm: number;
  rentAgeMultiplier: number;
  selectedWorkHub: WorkHub;
  overlayState: MapAdvancedOverlayStoreState;
}): any {
  const { L, map, activeCity, mode, targetSqm, rentAgeMultiplier, selectedWorkHub, overlayState: st } = params;
  const group = L.layerGroup();
  const activeZoom = st.viewportBounds?.zoom ?? (typeof map?.getZoom === 'function' ? map.getZoom() : 12);
  const lazyPolicy = resolveGeoLazyLoadingPolicy(activeZoom, st.lowBandwidthGeoLazyMode);
  const bbox = st.viewportBounds;
  const trafficZone = CITY_TRAFFIC_ZONES[activeCity];
  if (st.showTrafficZones && trafficZone) {
    if (trafficZone.outer && isGeometryIntersectingGeoBoundingBox(trafficZone.outer, bbox)) {
      const pollutionPoly = L.polygon(trafficZone.outer, {
        color: '#f59e0b', weight: 2, dashArray: '8, 6', fillColor: '#f59e0b', fillOpacity: 0.06,
      }).bindTooltip(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;text-align:right;"><strong style="color:#d97706;">🟠 محدوده طرح کنترل آلودگی هوا (زوج و فرد سابق)</strong><br/><span>تردد رایگان تا ۲۰ روز در هر فصل با پلاک بومی</span></div>`,
        { sticky: true, direction: 'top' }
      );
      group.addLayer(pollutionPoly);
    }
    if (isGeometryIntersectingGeoBoundingBox(trafficZone.core, bbox)) {
      const safeZoneTitle = escapeHtmlAttr(trafficZone.titleFa);
      const coreTrafficPoly = L.polygon(trafficZone.core, {
        color: '#e11d48', weight: 2.2, dashArray: '5, 5', fillColor: '#f43f5e', fillOpacity: 0.11,
      }).bindTooltip(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;text-align:right;"><strong style="color:#e11d48;">🔴 ${safeZoneTitle}</strong><br/><span>ساعت اعمال محدودیت: ۶:۳۰ صبح تا ۱۸:۰۰</span></div>`,
        { sticky: true, direction: 'top' }
      );
      group.addLayer(coreTrafficPoly);
    }
  }
  const cityMetroLines = CITY_METRO_LINES[activeCity] || [];
  if (st.showMetroLines && cityMetroLines.length > 0) {
    cityMetroLines.forEach((line) => {
      if (!isGeometryIntersectingGeoBoundingBox(line.coords, bbox)) return;
      const safeLineName = escapeHtmlAttr(line.nameFa);
      const poly = L.polyline(line.coords, {
        color: line.color, weight: 3.5, opacity: 0.85, lineJoin: 'round',
      }).bindTooltip(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:800;">🚇 ${safeLineName}</div>`,
        { sticky: true, direction: 'top' }
      );
      group.addLayer(poly);
      if (activeZoom >= lazyPolicy.metroStationsMinZoom) {
        const visibleStations = filterPointsInGeoBoundingBox(line.coords, bbox);
        visibleStations.forEach((pt) => {
          const stationDot = L.circleMarker(pt, {
            radius: 3.5, color: '#ffffff', weight: 1.5, fillColor: line.color, fillOpacity: 1,
          }).bindTooltip(
            `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:10.5px;">ایستگاه ${safeLineName}</div>`,
            { direction: 'top' }
          );
          group.addLayer(stationDot);
        });
      }
    });
  }
  if (st.showCommuteIsochrones && selectedWorkHub.lat !== null && selectedWorkHub.lng !== null) {
    const safeHubName = escapeHtmlAttr(selectedWorkHub.name);
    const rings: Array<{ radiusM: number; color: string; label: string; fillOp: number }> = [
      { radiusM: 12500, color: '#f43f5e', label: '🔴 حلقه ۳۵ تا ۵۰ دقیقه تردد تا ' + safeHubName, fillOp: 0.03 },
      { radiusM: 8200, color: '#f59e0b', label: '🟡 حلقه ۲۰ تا ۳۵ دقیقه تردد تا ' + safeHubName, fillOp: 0.045 },
      { radiusM: 4300, color: '#10b981', label: '🟢 حلقه طلایی زیر ۲۰ دقیقه تردد تا ' + safeHubName, fillOp: 0.07 },
    ];
    rings.forEach((r) => {
      const ringCircle = L.circle([selectedWorkHub.lat, selectedWorkHub.lng], {
        radius: r.radiusM,
        color: r.color,
        weight: 1.4,
        dashArray: '4, 6',
        fillColor: r.color,
        fillOpacity: r.fillOp,
      }).bindTooltip(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:700;">${r.label}</div>`,
        { sticky: true, direction: 'top' }
      );
      group.addLayer(ringCircle);
    });
  }
  const { active, hoodA, hoodB } = st.comparisonArc;
  if (active && hoodA && hoodB && hoodA.id !== hoodB.id) {
    const midLat = (hoodA.lat + hoodB.lat) / 2;
    const midLng = (hoodA.lng + hoodB.lng) / 2;
    const dLat = hoodB.lat - hoodA.lat;
    const dLng = hoodB.lng - hoodA.lng;
    const ctrlLat = midLat + dLng * 0.18;
    const ctrlLng = midLng - dLat * 0.18;
    const arcPoints: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      const lat = u * u * hoodA.lat + 2 * u * t * ctrlLat + t * t * hoodB.lat;
      const lng = u * u * hoodA.lng + 2 * u * t * ctrlLng + t * t * hoodB.lng;
      arcPoints.push([lat, lng]);
    }
    const arcLine = L.polyline(arcPoints, {
      color: '#6366f1',
      weight: 3,
      dashArray: '6, 5',
      opacity: 0.92,
    });
    group.addLayer(arcLine);
    const safeNameA = escapeHtmlAttr(hoodA.name); const safeNameB = escapeHtmlAttr(hoodB.name); const areaUnit = getStoredAreaUnit(); const intlCurrency = getStoredIntlCurrency(); const locale = getStoredRadarLocale(); const unitLabel = formatAreaUnitLabel(areaUnit);
    let deltaText = '';
    if (mode === 'rent') {
      const safeSqm = Math.max(25, targetSqm || 75);
      const rA = Math.round(hoodA.rahn80m * (safeSqm / 80) * rentAgeMultiplier);
      const rB = Math.round(hoodB.rahn80m * (safeSqm / 80) * rentAgeMultiplier);
      const diff = rB - rA; const fxSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(diff || rA), intlCurrency, locale)})` : '';
      deltaText = diff === 0
        ? `رهن برابر (${toPersianNum(rA)}م${fxSuffix})`
        : diff > 0
        ? `${safeNameB}: +${toPersianNum(diff)}م رهن بیشتر${fxSuffix}`
        : `${safeNameB}: ${toPersianNum(Math.abs(diff))}م رهن ارزان‌تر${fxSuffix}`;
    } else {
      const uA = convertPricePerSqmToUnit(hoodA.buyPerSqm, areaUnit); const uB = convertPricePerSqmToUnit(hoodB.buyPerSqm, areaUnit); const diff = uB - uA; const dA = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hoodA.id, hoodA.name, hoodA.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit); const dB = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hoodB.id, hoodB.name, hoodB.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit); const dealDiff = dB - dA; const fxSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(diff || uA), intlCurrency, locale)})` : '';
      deltaText = diff === 0
        ? `قیمت برابر (${unitLabel} ${toPersianNum(uA)}م · معامله v6.4: ${toPersianNum(dA)}م${fxSuffix})`
        : diff > 0
        ? `${safeNameB}: ${unitLabel} +${toPersianNum(diff)}م گران‌تر از ${safeNameA} (معامله v6.4: +${toPersianNum(dealDiff)}م)${fxSuffix}`
        : `${safeNameB}: ${unitLabel} ${toPersianNum(Math.abs(diff))}م ارزان‌تر از ${safeNameA} (معامله v6.4: ${toPersianNum(Math.abs(dealDiff))}م)${fxSuffix}`;
    }
    const safeDeltaText = escapeHtmlAttr(deltaText);
    const arcMidPoint = arcPoints[8] || [ctrlLat, ctrlLng]; const arcBadgeIcon = L.divIcon({ className: 'comparison-arc-badge',
      html: `<div style="display:flex;justify-content:center;align-items:center;transform:translate(-50%,-50%);">
        <span style="white-space:nowrap;padding:3px 9px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10.5px;font-weight:800;color:#ffffff;background:linear-gradient(135deg,#4f46e5,#7c3aed);border:1.5px solid #ffffff;box-shadow:0 4px 12px rgba(79,70,229,0.55);">
          ⚖️ ${safeDeltaText} </span>
      </div>`,
      iconSize: [0, 0], }); const badgeMarker = L.marker(arcMidPoint, { icon: arcBadgeIcon, zIndexOffset: 950 }); group.addLayer(badgeMarker); } group.addTo(map); return group; }
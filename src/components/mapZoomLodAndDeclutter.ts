import { calcDistanceKm, EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { CityId } from '../data/multiCityData'; import { aggregateMarketMetricsForHood, formatNeighborhoodPriceTruthFa, isLiveDivarBargainId } from '../data/realMarketPriceAggregator'; import { isNeighborhoodInLeafletViewport } from './priceHeatmapAndViewportLazy'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, getStoredRadarLocale } from '../utils/areaUnit'; import { buildExternalDivarUrl, escapeHtmlAttr } from '../utils/security'; import { buildNeighborhoodTooltipTrendSectionHtml } from './map/neighborhoodTooltipTrendHelpers'; import { formatPersianDeltaPercent, formatPersianScore, normalizeMapPinPriceText } from '../utils/persianBidiFormat'; export type MarkerVisualTier = 'dot' | 'compact_chip' | 'standard_pill' | 'detailed_pill'; export interface MacroCityCluster { clusterId: string; lat: number; lng: number; count: number; avgBuyPerSqm: number; avgRahn80m: number; primaryName: string; containsSelected: boolean; dominantStroke: string; dominantPillBg: string; sampleHood: EvaluatedNeighborhood; } export const STANDARD_VIEWPORT_BUFFER_PAD = 0.10; export function filterNeighborhoodsInViewportWithBuffer( map: any, neighborhoods: EvaluatedNeighborhood[], selectedHoodId: number | null, statusFilter: 'all' | 'green' | 'yellow' | 'red', padRatio: number = STANDARD_VIEWPORT_BUFFER_PAD, radialMarginKm: number = 3.5
): EvaluatedNeighborhood[] { let centerLat: number | null = null, centerLng: number | null = null, maxRadiusKm = 18; try { if (map && typeof map.getBounds === 'function') { const bounds = map.getBounds(); const center = typeof map.getCenter === 'function' ? map.getCenter() : bounds?.getCenter?.(); const ne = bounds?.getNorthEast?.(); if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) { centerLat = center.lat; centerLng = center.lng; if (ne && Number.isFinite(ne.lat) && Number.isFinite(ne.lng)) { const cornerDist = calcDistanceKm(center.lat, center.lng, ne.lat, ne.lng); if (cornerDist !== null && cornerDist > 0) maxRadiusKm = cornerDist + radialMarginKm; } } }
  } catch { } return neighborhoods.filter((hood) => { if (statusFilter !== 'all' && hood.status !== statusFilter) return false; if (hood.id === selectedHoodId) return true; if (isNeighborhoodInLeafletViewport(map, hood.lat, hood.lng, padRatio)) return true; if (centerLat !== null && centerLng !== null) { const dist = calcDistanceKm(centerLat, centerLng, hood.lat, hood.lng); if (dist !== null && dist <= maxRadiusKm) return true; }
    return false; }); }
export function buildMacroZoomClusters( neighborhoods: EvaluatedNeighborhood[], selectedHoodId: number | null, zoom: number, getPalette: (h: EvaluatedNeighborhood) => { stroke: string; fill: string; pillBg: string }
): MacroCityCluster[] { const mergeRadiusKm = zoom <= 7 ? 85 : zoom === 8 ? 55 : 36; const rawGroups: EvaluatedNeighborhood[][] = [];
  for (const hood of neighborhoods) { let targetGroup: EvaluatedNeighborhood[] | null = null; for (const group of rawGroups) { const seed = group[0]; const dist = calcDistanceKm(seed.lat, seed.lng, hood.lat, hood.lng); if (dist !== null && dist <= mergeRadiusKm) { targetGroup = group; break; } }
    if (targetGroup) targetGroup.push(hood); else rawGroups.push([hood]); }
  return rawGroups.map((group, idx) => { let sumLat = 0, sumLng = 0, sumBuy = 0, sumRahn = 0, containsSelected = false; const sorted = [...group].sort((a, b) => b.overallScore - a.overallScore); const primary = sorted[0];
    for (const h of group) { sumLat += h.lat; sumLng += h.lng; sumBuy += h.buyPerSqm; sumRahn += h.rahn80m; if (h.id === selectedHoodId) containsSelected = true; }
    const count = group.length; const palette = getPalette(primary); return {
      clusterId: `cluster-${idx}-${primary.id}`,
      lat: sumLat / count, lng: sumLng / count, count, avgBuyPerSqm: Math.round(sumBuy / count),
      avgRahn80m: Math.round(sumRahn / count), primaryName: count > 3 && primary.id <= 500 ? 'تهران' : primary.name, containsSelected, dominantStroke: palette.stroke,
      dominantPillBg: palette.pillBg, sampleHood: primary,
    };
  });
}
export function formatCompactNeighborhoodName(name: string): string {
  const cleaned = String(name || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const primary = cleaned.split(/\s+و\s+|[/،]/)[0]?.trim() || cleaned;
  return primary.length > 14 ? `${primary.slice(0, 13)}…` : primary;
}
export function estimateLodPillSize(params: {
  tier: MarkerVisualTier; hoodName: string; shortPriceLabel?: string; fullPriceLabel?: string; hasSponsor?: boolean;
}): { w: number; h: number } {
  const { tier, hoodName, shortPriceLabel = '', fullPriceLabel = '', hasSponsor = false } = params;
  if (tier === 'dot') return { w: 20, h: 20 };
  if (tier === 'compact_chip') {
    const labelLen = formatCompactNeighborhoodName(hoodName).length + shortPriceLabel.length;
    return { w: Math.max(104, Math.ceil(labelLen * 7.1 + (hasSponsor ? 14 : 0) + 28)), h: 24 };
  }
  if (tier === 'detailed_pill') {
    const labelLen = hoodName.length + (fullPriceLabel || shortPriceLabel).length;
    return { w: Math.max(152, Math.ceil(labelLen * 6.8 + (hasSponsor ? 16 : 0) + 78)), h: 28 };
  }
  const labelLen = hoodName.length + shortPriceLabel.length;
  return { w: Math.max(114, Math.ceil(labelLen * 7.0 + (hasSponsor ? 15 : 0) + 30)), h: 25 };
}
export function computeDeclutteredMarkerTiers(
  map: any, visibleHoods: EvaluatedNeighborhood[], zoom: number, selectedHoodId: number | null,
  isSponsorCheck: (hood: EvaluatedNeighborhood) => boolean,
  priceLabelsById?: Map<number, { shortPriceLabel: string; fullPriceLabel: string }>
): Map<number, MarkerVisualTier> {
  const result = new Map<number, MarkerVisualTier>();
  if (zoom < 12) { for (const h of visibleHoods) result.set(h.id, 'dot'); return result; }
  const prioritized = [...visibleHoods].sort((a, b) => {
    if (a.id === selectedHoodId) return -1; if (b.id === selectedHoodId) return 1;
    const spA = isSponsorCheck(a) ? 1 : 0; const spB = isSponsorCheck(b) ? 1 : 0;
    return spA !== spB ? spB - spA : b.overallScore - a.overallScore;
  });
  const placedBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const horizontalGap = zoom <= 12 ? 22 : 11;
  const verticalGap = zoom <= 12 ? 14 : 8;
  const canPlaceBox = (x: number, y: number, w: number, h: number): boolean => {
    for (const box of placedBoxes) {
      if (Math.abs(x - box.x) * 2 < w + box.w && Math.abs(y - box.y) * 2 < h + box.h) return false;
    }
    return true;
  };
  const markerBox = (hood: EvaluatedNeighborhood, tier: Exclude<MarkerVisualTier, 'dot'>, hasSponsor: boolean) => {
    const lbl = priceLabelsById?.get(hood.id);
    const sz = lbl
      ? estimateLodPillSize({ tier, hoodName: hood.name, shortPriceLabel: lbl.shortPriceLabel, fullPriceLabel: lbl.fullPriceLabel, hasSponsor })
      : tier === 'compact_chip' ? { w: 82, h: 21 } : tier === 'standard_pill' ? { w: 100, h: 23 } : { w: 148, h: 26 };
    return { w: sz.w + horizontalGap, h: sz.h + verticalGap };
  };
  for (const hood of prioritized) {
    const isSelected = hood.id === selectedHoodId;
    const hasSponsor = isSponsorCheck(hood);
    let pt = { x: hood.lng * 1000, y: hood.lat * 1000 };
    try {
      if (map && typeof map.latLngToContainerPoint === 'function') {
        const p = map.latLngToContainerPoint([hood.lat, hood.lng]);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pt = { x: p.x, y: p.y };
      }
    } catch { }
    if (isSelected) {
      const tier: MarkerVisualTier = zoom >= 14 ? 'detailed_pill' : 'standard_pill';
      const box = markerBox(hood, tier, hasSponsor);
      placedBoxes.push({ x: pt.x, y: pt.y, ...box });
      result.set(hood.id, tier); continue;
    }
    const candidateTiers: Array<Exclude<MarkerVisualTier, 'dot'>> = zoom < 13 ? ['compact_chip'] : zoom < 14 ? ['standard_pill', 'compact_chip'] : ['detailed_pill', 'standard_pill', 'compact_chip'];
    let placed = false;
    for (const tier of candidateTiers) {
      const box = markerBox(hood, tier, hasSponsor);
      if (!canPlaceBox(pt.x, pt.y, box.w, box.h)) continue;
      placedBoxes.push({ x: pt.x, y: pt.y, ...box });
      result.set(hood.id, tier); placed = true; break;
    }
    if (!placed) result.set(hood.id, 'dot');
  }
  return result;
}
export function buildNeighborhoodLodDivIconConfig(params: {
  hood: EvaluatedNeighborhood; tier: MarkerVisualTier; zoom: number; isSelected: boolean; hasSponsor: boolean;
  isDarkMap: boolean; pillBg: string; stroke: string; shortPriceLabel: string; fullPriceLabel: string;
}): { html: string; iconSize: [number, number]; iconAnchor: [number, number] } {
  const { hood, tier, zoom, isSelected, hasSponsor, isDarkMap, pillBg, stroke, shortPriceLabel, fullPriceLabel } = params;
  const safeHoodName = escapeHtmlAttr(hood.name);
  const safeShortPrice = escapeHtmlAttr(normalizeMapPinPriceText(shortPriceLabel));
  const safeFullPrice = escapeHtmlAttr(normalizeMapPinPriceText(fullPriceLabel));
  const safeSponsorName = escapeHtmlAttr(hood.sponsor?.name || '');
  const markerState = isSelected ? 'selected' : hood.status === 'red' ? 'unavailable' : 'default';
  const markerStateAttr = `data-marker-state="${markerState}"`;
  if (tier === 'dot' || zoom < 12) {
    const dotSize = isSelected ? 16 : zoom <= 10 ? 10 : 12;
    const ringBorder = isSelected ? (isDarkMap ? '2.5px solid #38bdf8' : '2.5px solid #0f172a') : hasSponsor ? '2px solid #fbbf24' : isDarkMap ? '2px solid rgba(255,255,255,0.92)' : '2px solid #ffffff';
    const dotShadow = isSelected ? '0 0 14px rgba(16,185,129,0.95), 0 0 0 4px rgba(56,189,248,0.35)' : `0 2px 6px rgba(0,0,0,0.45), 0 0 0 2px ${stroke}33`;
    return {
      html: `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;"><span data-hood-pill="${hood.id}" data-lod-tier="dot" ${markerStateAttr} style="display:inline-block;width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${pillBg};border:${ringBorder};box-shadow:${dotShadow};transition:transform 0.15s ease;"></span><span class="hood-text-label" style="display:none;opacity:0;">${safeHoodName}</span><span class="hood-price-label" style="display:none;opacity:0;"></span></div>`,
      iconSize: [dotSize + 8, dotSize + 8], iconAnchor: [(dotSize + 8) / 2, (dotSize + 8) / 2],
    };
  }
  const sponsorStar = hasSponsor ? `<span title="دارای کارشناس رسمی محله: ${safeSponsorName}" style="color:#fde047;margin-left:2px;font-size:12px;">★</span>` : '';
  const borderRule = isSelected ? (isDarkMap ? '2px solid #38bdf8' : '2px solid #0f172a') : hasSponsor ? '1.5px solid #fbbf24' : isDarkMap ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.9)';
  const shadowRule = isSelected ? '0 0 16px rgba(16,185,129,0.85)' : '0 2px 8px rgba(15,23,42,0.38)';
  const sz = estimateLodPillSize({ tier, hoodName: hood.name, shortPriceLabel, fullPriceLabel, hasSponsor });
  if (tier === 'compact_chip') {
    const safeTruncName = escapeHtmlAttr(formatCompactNeighborhoodName(hood.name));
    return {
      html: `<div dir="rtl" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;direction:rtl;"><span data-hood-pill="${hood.id}" data-lod-tier="compact" ${markerStateAttr} dir="rtl" style="direction:rtl;unicode-bidi:isolate;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:12px;font-weight:700;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};">${sponsorStar}<span class="hood-text-label">${safeTruncName}</span><span class="hood-price-label" dir="rtl" style="unicode-bidi:isolate;font-weight:700;font-size:12px;border-right:1px solid rgba(255,255,255,0.45);padding-right:4px;">${safeShortPrice}</span></span></div>`,
      iconSize: [Math.max(sz.w, 108), Math.max(sz.h, 26)], iconAnchor: [Math.round(Math.max(sz.w, 108) / 2), Math.round(Math.max(sz.h, 26) / 2)],
    };
  }
  if (tier === 'detailed_pill') {
    const growth6m = hood.marketReport?.hoodGrowth6mPercent ?? 12;
    const safeGrowth = escapeHtmlAttr(formatPersianDeltaPercent(growth6m));
    const safeMetro = escapeHtmlAttr(`مترو ${toPersianNum(hood.metro)}`);
    return {
      html: `<div dir="rtl" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;direction:rtl;"><span data-hood-pill="${hood.id}" data-lod-tier="detailed" ${markerStateAttr} dir="rtl" style="direction:rtl;unicode-bidi:isolate;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:12px;font-weight:700;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};">${sponsorStar}<span class="hood-text-label">${safeHoodName}</span><span class="hood-price-label" dir="rtl" style="unicode-bidi:isolate;font-weight:700;font-size:12px;border-right:1px solid rgba(255,255,255,0.45);padding-right:5px;">${safeFullPrice}</span><span class="hood-price-label" style="font-size:12px;background:rgba(0,0,0,0.32);padding:1px 6px;border-radius:9999px;">${safeGrowth} · ${safeMetro}</span></span></div>`,
      iconSize: [Math.max(sz.w, 168), Math.max(sz.h, 30)], iconAnchor: [Math.round(Math.max(sz.w, 168) / 2), Math.round(Math.max(sz.h, 30) / 2)],
    };
  }
  return {
    html: `<div dir="rtl" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;direction:rtl;"><span data-hood-pill="${hood.id}" data-lod-tier="standard" ${markerStateAttr} dir="rtl" style="direction:rtl;unicode-bidi:isolate;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:2.5px 9px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:12px;font-weight:700;color:#ffffff;background:${pillBg};border:${borderRule};box-shadow:${shadowRule};">${sponsorStar}<span class="hood-text-label">${safeHoodName}</span><span class="hood-price-label" dir="rtl" style="unicode-bidi:isolate;font-weight:700;font-size:12px;border-right:1px solid rgba(255,255,255,0.45);padding-right:4px;">${safeShortPrice}</span></span></div>`,
    iconSize: [Math.max(sz.w, 120), Math.max(sz.h, 28)], iconAnchor: [Math.round(Math.max(sz.w, 120) / 2), Math.round(Math.max(sz.h, 28) / 2)],
  };
}
export function buildNeighborhoodRichTooltipHtml(params: {
  hood: EvaluatedNeighborhood; activeCity: CityId; mode: 'rent' | 'buy';
  safeSqmPill: number; scaledRahnPill: number; isDarkMap: boolean;
}): string {
  const { hood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap } = params; const areaUnit = getStoredAreaUnit(); const intlCurrency = getStoredIntlCurrency(); const locale = getStoredRadarLocale();
  const safeHoodName = escapeHtmlAttr(hood.name); const safeZone = escapeHtmlAttr(hood.zone); const safeTrafficStatus = escapeHtmlAttr(hood.trafficInfo?.liveStatus || 'تردد عادی'); const divarUrl = escapeHtmlAttr(buildExternalDivarUrl(activeCity, mode, hood.name));
  const unitPrice = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit); const safeUnitLabel = escapeHtmlAttr(formatAreaUnitLabel(areaUnit)); const safeAreaShort = escapeHtmlAttr(formatAreaShort(safeSqmPill, areaUnit));
  const total80mMillions = Number(((hood.buyPerSqm * 80) / 1000).toFixed(1)); const monthlyRent80mMillions = Math.round(hood.rahn80m * 0.03);
  const safeBuyFx = intlCurrency !== 'IRT' ? escapeHtmlAttr(` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, locale)})`) : ''; const safeRahnFx = intlCurrency !== 'IRT' ? escapeHtmlAttr(` (${formatMillionTomanAsIntlCurrency(scaledRahnPill, intlCurrency, locale)})`) : '';
  const titleColor = isDarkMap ? '#34d399' : '#047857'; const scoreBg = isDarkMap ? 'rgba(16,185,129,0.22)' : '#ecfdf5'; const scoreColor = isDarkMap ? '#6ee7b7' : '#065f46'; const bodyTextColor = isDarkMap ? '#e2e8f0' : '#1e293b';
  const headerZoneText = safeZone.includes('(') ? ` · ${safeZone}` : ` (${safeZone})`;
  return `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;min-width:215px;padding:3px 2px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(148,163,184,0.25);padding-bottom:4px;margin-bottom:5px;">
      <strong style="font-size:12.5px;color:${titleColor};">محله ${safeHoodName}${headerZoneText}</strong>
      <span dir="rtl" style="background:${scoreBg};color:${scoreColor};padding:1px 6px;border-radius:6px;font-size:10.5px;font-weight:700;">${escapeHtmlAttr(formatPersianScore(hood.overallScore, 10))}</span>
    </div>
    <div style="font-size:11px;line-height:1.65;color:${bodyTextColor};">
      <div>میانگین خرید (${safeUnitLabel}): <strong>${toPersianNum(unitPrice)} میلیون${safeBuyFx}</strong> (کل: ${toPersianNum(total80mMillions)} میلیارد)</div>
      <div>${escapeHtmlAttr(formatNeighborhoodPriceTruthFa(hood.id, (hood.bargains || []).filter((row) => isLiveDivarBargainId(row.id)).length))}</div>
      <div>رهن کامل (${safeAreaShort}): <strong>${toPersianNum(scaledRahnPill)} میلیون${safeRahnFx}</strong> (اجاره: ${toPersianNum(monthlyRent80mMillions)} م)</div>
      <div>ترافیک: <span>${safeTrafficStatus}</span></div>
    </div>
    ${buildNeighborhoodTooltipTrendSectionHtml({ hood, mode, safeSqmPill, scaledRahnPill, isDarkMap })}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:7px;padding-top:6px;border-top:1px solid rgba(148,163,184,0.2);">
      <button type="button" data-hood-id="${hood.id}" data-hood-action="anatomy" style="background:#059669;color:#ffffff;border:none;border-radius:6px;padding:4px 6px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:700;cursor:pointer;">کالبدشکافی</button>
      <button type="button" data-hood-id="${hood.id}" data-hood-action="hedonic" style="background:#4f46e5;color:#ffffff;border:none;border-radius:6px;padding:4px 6px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:700;cursor:pointer;">قیمت‌گذاری ملک</button>
      <button type="button" data-hood-id="${hood.id}" data-hood-action="bargains" style="background:#d97706;color:#020617;border:none;border-radius:6px;padding:4px 6px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:700;cursor:pointer;">فایل شکار (${toPersianNum((hood.bargains || []).length)})</button>
      <a href="${divarUrl}" target="_blank" rel="noopener noreferrer" style="background:#334155;color:#f8fafc;text-decoration:none;text-align:center;border-radius:6px;padding:4px 6px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:700;">دیوار محله</a>
    </div></div>`;
}
export function renderMacroClustersOnLeaflet(params: {
  L: any; map: any; clusters: MacroCityCluster[]; mode: 'rent' | 'buy';
  currentZoom: number; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}): any[] {
  const { L, map, clusters, mode, currentZoom, onSelectNeighborhood } = params; const areaUnit = getStoredAreaUnit(); const unitLbl = formatAreaUnitLabel(areaUnit);
  return clusters.map((cluster) => {
    const safeClusterName = escapeHtmlAttr(cluster.primaryName); const uClusterBuy = convertPricePerSqmToUnit(cluster.avgBuyPerSqm, areaUnit); const uClusterDeal = convertPricePerSqmToUnit(aggregateMarketMetricsForHood({ ...cluster.sampleHood, name: cluster.primaryName, buyPerSqm: cluster.avgBuyPerSqm }).estimatedDealPricePerSqm, areaUnit);
    const monthlyRent80mCluster = Math.round(cluster.avgRahn80m * 0.03);
    const safeAvgPrice = escapeHtmlAttr(
      mode === 'rent' ? `رهن ${toPersianNum(cluster.avgRahn80m)}م (اجاره: ${toPersianNum(monthlyRent80mCluster)}م)` : `${unitLbl} ${toPersianNum(uClusterBuy)}م (برآورد معامله: ${toPersianNum(uClusterDeal)}م)`
    );
    const dotSize = cluster.count === 1 ? 12 : Math.min(24, 14 + Math.round(Math.log2(cluster.count + 1) * 2));
    const clusterHtml = `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;cursor:pointer;">
      <span data-macro-cluster="${escapeHtmlAttr(cluster.clusterId)}" style="display:inline-flex;align-items:center;justify-content:center;width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${cluster.dominantPillBg};border:2.5px solid #ffffff;box-shadow:0 3px 12px rgba(0,0,0,0.5), 0 0 0 4px ${cluster.dominantPillBg}44;color:#ffffff;font-family:Vazirmatn,Tahoma,sans-serif;font-size:9.5px;font-weight:700;">
        ${cluster.count > 1 ? toPersianNum(cluster.count) : ''}
      </span>
    </div>`;
    const cIcon = L.divIcon({
      className: 'macro-city-cluster-pin', html: clusterHtml,
      iconSize: [dotSize + 8, dotSize + 8], iconAnchor: [(dotSize + 8) / 2, (dotSize + 8) / 2],
    });
    const clusterLabel = `محدوده ${cluster.primaryName} (${toPersianNum(cluster.count)} محله)`;
    const cMarker = L.marker([cluster.lat, cluster.lng], {
      icon: cIcon, title: clusterLabel, alt: clusterLabel, zIndexOffset: cluster.containsSelected ? 1000 : 400,
    }).addTo(map);
    const cEl = cMarker.getElement?.() as HTMLElement | null;
    if (cEl) cEl.setAttribute('aria-label', clusterLabel);
    cMarker.bindTooltip(
      `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;font-size:12px;">
        <strong>محدوده ${safeClusterName} (${toPersianNum(cluster.count)} محله)</strong><br/>
        <span>میانگین قیمت: <strong>${safeAvgPrice}</strong></span><br/>
        <span style="font-size:11px;opacity:0.85;">کلیک برای بزرگ‌نمایی و مشاهده نقاط محلات</span>
      </div>`,
      { direction: 'top' }
    );
    cMarker.on('click', () => {
      if (cluster.count === 1) {
        onSelectNeighborhood(cluster.sampleHood);
        map.flyTo([cluster.lat, cluster.lng], 12, { duration: 0.65 });
      } else {
        map.flyTo([cluster.lat, cluster.lng], Math.min(12, Math.max(currentZoom + 2, 11)), { duration: 0.65 });
      }
    });
    return cMarker;
  });
}
export function renderGoldBargainPinOnLeaflet(params: {
  L: any; map: any; hood: EvaluatedNeighborhood; isDarkMap: boolean; onClickBargain: (hoodId: number) => void;
}): any | null {
  const { L, map, hood, isDarkMap, onClickBargain } = params;
  const b = Array.isArray(hood.bargains) ? hood.bargains.find((row) => isLiveDivarBargainId(row.id)) : undefined;
  if (!b) return null;
  const safeHoodName = escapeHtmlAttr(hood.name);
  const safeBargainTitle = escapeHtmlAttr(b.title);
  const safeBargainPrice = escapeHtmlAttr(b.priceText);
  const safeBargainProfit = escapeHtmlAttr(b.buyerProfitText);
  const goldAccent = isDarkMap ? '#fde047' : '#b45309'; const titleColor = isDarkMap ? '#34d399' : '#047857'; const bodyTextColor = isDarkMap ? '#e2e8f0' : '#1e293b'; const goldIcon = L.divIcon({ className: 'gold-bargain-pin',
    html: `<div style="display:flex;justify-content:center;align-items:center;transform:translate(-50%,-50%);cursor:pointer;">
      <span style="white-space:nowrap;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:700;color:#020617;background:linear-gradient(135deg,#fde047,#f59e0b);border:1.5px solid #ffffff;box-shadow:0 0 12px rgba(245,158,11,0.85);">
        -${toPersianNum(b.discountPercent)}٪ زیر قیمت
      </span>
    </div>`,
    iconSize: [0, 0], });
  const bargainLabel = `فایل زیر قیمت محله ${hood.name} با ${toPersianNum(b.discountPercent)} درصد تخفیف`;
  const gPin = L.marker([hood.lat + 0.0045, hood.lng - 0.0045], { icon: goldIcon, title: bargainLabel, alt: bargainLabel })
    .addTo(map)
    .bindTooltip(
      `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;color:${bodyTextColor};font-size:12px;">
        <strong style="color:${goldAccent};">فایل زیر قیمت محله ${safeHoodName}:</strong><br/>${safeBargainTitle}<br/>
        <span style="color:${titleColor};font-weight:bold;">${safeBargainPrice}</span><br/>
        <span style="font-size:11px;color:${goldAccent};font-weight:700;">اختلاف نسبت به میانگین: ${safeBargainProfit}</span>
      </div>`,
      { direction: 'top' } );
  const gEl = gPin.getElement?.() as HTMLElement | null;
  if (gEl) gEl.setAttribute('aria-label', bargainLabel);
  gPin.on('click', () => onClickBargain(hood.id)); return gPin; }
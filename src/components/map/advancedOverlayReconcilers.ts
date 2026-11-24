import { WorkHub, EvaluatedNeighborhood, toPersianNum } from '../../data/neighborhoods';
import { CityId } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode, type RadarLocale } from '../../utils/areaUnit';
import { escapeHtmlAttr } from '../../utils/security';
import { filterPointsInGeoBoundingBox, isGeometryIntersectingGeoBoundingBox, resolveGeoLazyLoadingPolicy } from '../../utils/geojsonViewportLazyEngine';
import type { ComparisonArcPairState, MapViewportBoundsState } from '../mapAdvancedLayers';
import { profileLayerReconciliation } from './mapRenderProfiler';

export interface MetroLineEntry { polyline: any; stations: Map<string, any>; geometryKey: string; }
export interface TrafficZoneEntry { layer: any; geometryKey: string; }

export function reconcileTrafficZonesLayer(params: {
  L: any; map: any; groupRef: { current: any }; entriesMap: Map<string, TrafficZoneEntry>;
  city: CityId; showTrafficZones: boolean; viewportBounds: MapViewportBoundsState | null;
  trafficZone: { core: [number, number][]; outer?: [number, number][]; titleFa: string } | undefined;
}): void {
  const { L, map, groupRef, entriesMap, city, showTrafficZones, viewportBounds, trafficZone } = params;
  if (!map || !L) return;
  if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
  const group = groupRef.current;
  const targets = new Map<string, { coords: [number, number][]; options: any; tooltip: string; geometryKey: string }>();
  if (showTrafficZones && trafficZone) {
    if (trafficZone.outer && isGeometryIntersectingGeoBoundingBox(trafficZone.outer, viewportBounds)) {
      targets.set(`${city}:outer`, {
        coords: trafficZone.outer,
        options: { color: '#f59e0b', weight: 2, dashArray: '8, 6', fillColor: '#f59e0b', fillOpacity: 0.06 },
        tooltip: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;text-align:right;"><strong style="color:#d97706;">محدوده طرح کنترل آلودگی هوا (زوج و فرد سابق)</strong><br/><span>تردد رایگان تا ۲۰ روز در هر فصل با پلاک بومی</span></div>`,
        geometryKey: `${city}:outer:${trafficZone.outer.length}`,
      });
    }
    if (isGeometryIntersectingGeoBoundingBox(trafficZone.core, viewportBounds)) {
      const safeTitle = escapeHtmlAttr(trafficZone.titleFa);
      targets.set(`${city}:core`, {
        coords: trafficZone.core,
        options: { color: '#e11d48', weight: 2.2, dashArray: '5, 5', fillColor: '#f43f5e', fillOpacity: 0.11 },
        tooltip: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;text-align:right;"><strong style="color:#e11d48;">${safeTitle}</strong><br/><span>ساعت اعمال محدودیت: ۶:۳۰ صبح تا ۱۸:۰۰</span></div>`,
        geometryKey: `${city}:core:${trafficZone.core.length}`,
      });
    }
  }
  for (const [key, entry] of entriesMap.entries()) {
    if (!targets.has(key)) { group.removeLayer?.(entry.layer); entriesMap.delete(key); }
  }
  for (const [key, t] of targets.entries()) {
    const existing = entriesMap.get(key);
    if (existing && existing.geometryKey === t.geometryKey) continue;
    if (existing) group.removeLayer?.(existing.layer);
    const poly = L.polygon(t.coords, t.options).bindTooltip(t.tooltip, { sticky: true, direction: 'top' });
    group.addLayer?.(poly);
    entriesMap.set(key, { layer: poly, geometryKey: t.geometryKey });
  }
}

export function reconcileMetroLinesLayer(params: {
  L: any; map: any; groupRef: { current: any }; entriesMap: Map<string, MetroLineEntry>;
  city: CityId; showMetroLines: boolean; viewportBounds: MapViewportBoundsState | null; zoom: number; lowBandwidthMode: boolean;
  lines: Array<{ id: string; nameFa: string; color: string; coords: [number, number][] }>;
}): void {
  const { L, map, groupRef, entriesMap, city, showMetroLines, viewportBounds, zoom, lowBandwidthMode, lines } = params;
  if (!map || !L) return;
  if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
  const group = groupRef.current;
  const activeZoom = viewportBounds?.zoom ?? zoom;
  const lazyPolicy = resolveGeoLazyLoadingPolicy(activeZoom, lowBandwidthMode);
  const visibleLineMap = new Map<string, { line: (typeof lines)[number]; lineKey: string }>();
  if (showMetroLines) {
    for (const line of lines) {
      if (!isGeometryIntersectingGeoBoundingBox(line.coords, viewportBounds)) continue;
      visibleLineMap.set(`${city}:${line.id}`, { line, lineKey: `${city}:${line.id}:${line.color}:${line.coords.length}` });
    }
  }
  for (const [key, entry] of entriesMap.entries()) {
    if (!visibleLineMap.has(key)) {
      entry.stations.forEach((stMarker) => group.removeLayer?.(stMarker));
      entry.stations.clear();
      group.removeLayer?.(entry.polyline);
      entriesMap.delete(key);
    }
  }
  for (const [key, { line, lineKey }] of visibleLineMap.entries()) {
    const safeLineName = escapeHtmlAttr(line.nameFa);
    let entry = entriesMap.get(key);
    if (!entry || entry.geometryKey !== lineKey) {
      if (entry) { entry.stations.forEach((stMarker) => group.removeLayer?.(stMarker)); group.removeLayer?.(entry.polyline); }
      const polyline = L.polyline(line.coords, { color: line.color, weight: 3.5, opacity: 0.85, lineJoin: 'round' })
        .bindTooltip(`<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:700;">${safeLineName}</div>`, { sticky: true, direction: 'top' });
      group.addLayer?.(polyline);
      entry = { polyline, stations: new Map(), geometryKey: lineKey };
      entriesMap.set(key, entry);
    }
    const targetStations = new Map<string, [number, number]>();
    if (activeZoom >= lazyPolicy.metroStationsMinZoom) {
      filterPointsInGeoBoundingBox(line.coords, viewportBounds).forEach((pt, idx) => {
        targetStations.set(`${key}:st:${pt[0].toFixed(5)}:${pt[1].toFixed(5)}:${idx}`, pt);
      });
    }
    for (const [stKey, stMarker] of entry.stations.entries()) {
      if (!targetStations.has(stKey)) { group.removeLayer?.(stMarker); entry.stations.delete(stKey); }
    }
    for (const [stKey, pt] of targetStations.entries()) {
      if (entry.stations.has(stKey)) continue;
      const stationDot = L.circleMarker(pt, { radius: 3.5, color: '#ffffff', weight: 1.5, fillColor: line.color, fillOpacity: 1 })
        .bindTooltip(`<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:10.5px;">ایستگاه ${safeLineName}</div>`, { direction: 'top' });
      group.addLayer?.(stationDot);
      entry.stations.set(stKey, stationDot);
    }
  }
}

export function buildRadialDistanceRingSpecs(workHub: WorkHub): Array<{ radiusM: number; color: string; label: string; fillOp: number }> {
  const safeHubName = escapeHtmlAttr(workHub.name);
  return [
    { radiusM: 12500, color: '#f43f5e', label: `محدوده شعاعی ۱۲٫۵ کیلومتر تا ${safeHubName}`, fillOp: 0.03 },
    { radiusM: 8200, color: '#f59e0b', label: `محدوده شعاعی ۸٫۲ کیلومتر تا ${safeHubName}`, fillOp: 0.045 },
    { radiusM: 4300, color: '#10b981', label: `محدوده شعاعی ۴٫۳ کیلومتر تا ${safeHubName}`, fillOp: 0.07 },
  ];
}

export function buildComparisonArcGroup(
  L: any, mode: 'rent' | 'buy', targetSqm: number, rentAgeMultiplier: number,
  areaUnit: AreaUnit, intlCurrency: IntlCurrencyCode, locale: RadarLocale, comparisonArc: ComparisonArcPairState
): any | null {
  const { active, hoodA, hoodB } = comparisonArc;
  if (!active || !hoodA || !hoodB || hoodA.id === hoodB.id) return null;
  const sub = L.layerGroup();
  const midLat = (hoodA.lat + hoodB.lat) / 2, midLng = (hoodA.lng + hoodB.lng) / 2;
  const dLat = hoodB.lat - hoodA.lat, dLng = hoodB.lng - hoodA.lng;
  const ctrlLat = midLat + dLng * 0.18, ctrlLng = midLng - dLat * 0.18;
  const arcPoints: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    arcPoints.push([u * u * hoodA.lat + 2 * u * t * ctrlLat + t * t * hoodB.lat, u * u * hoodA.lng + 2 * u * t * ctrlLng + t * t * hoodB.lng]);
  }
  sub.addLayer(L.polyline(arcPoints, { color: '#6366f1', weight: 3, dashArray: '6, 5', opacity: 0.92 }));
  const safeNameA = escapeHtmlAttr(hoodA.name), safeNameB = escapeHtmlAttr(hoodB.name), unitLabel = formatAreaUnitLabel(areaUnit, locale);
  let deltaText = '';
  if (mode === 'rent') {
    const safeSqm = Math.max(25, targetSqm || 75);
    const rA = Math.round(hoodA.rahn80m * (safeSqm / 80) * rentAgeMultiplier), rB = Math.round(hoodB.rahn80m * (safeSqm / 80) * rentAgeMultiplier);
    const diff = rB - rA, fxSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(diff || rA), intlCurrency, locale)})` : '';
    deltaText = diff === 0 ? `رهن برابر (${toPersianNum(rA)}م${fxSuffix})` : diff > 0 ? `${safeNameB}: +${toPersianNum(diff)}م رهن بیشتر${fxSuffix}` : `${safeNameB}: ${toPersianNum(Math.abs(diff))}م رهن ارزان‌تر${fxSuffix}`;
  } else {
    const uA = convertPricePerSqmToUnit(hoodA.buyPerSqm, areaUnit), uB = convertPricePerSqmToUnit(hoodB.buyPerSqm, areaUnit), diff = uB - uA;
    const dA = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hoodA.id, hoodA.name, hoodA.buyPerSqm, buildNeighborhoodListingSamples(hoodA)).estimatedDealPricePerSqm, areaUnit);
    const dB = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hoodB.id, hoodB.name, hoodB.buyPerSqm, buildNeighborhoodListingSamples(hoodB)).estimatedDealPricePerSqm, areaUnit);
    const dealDiff = dB - dA, fxSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(diff || uA), intlCurrency, locale)})` : '';
    deltaText = diff === 0 ? `قیمت برابر (${unitLabel} ${toPersianNum(uA)}م · معامله v6.4: ${toPersianNum(dA)}م${fxSuffix})` : diff > 0 ? `${safeNameB}: ${unitLabel} +${toPersianNum(diff)}م گران‌تر از ${safeNameA} (معامله v6.4: +${toPersianNum(dealDiff)}م)${fxSuffix}` : `${safeNameB}: ${unitLabel} ${toPersianNum(Math.abs(diff))}م ارزان‌تر از ${safeNameA} (معامله v6.4: ${toPersianNum(Math.abs(dealDiff))}م)${fxSuffix}`;
  }
  const safeDeltaText = escapeHtmlAttr(deltaText), arcMidPoint = arcPoints[8] || [ctrlLat, ctrlLng];
  const arcBadgeIcon = L.divIcon({ className: 'comparison-arc-badge', html: `<div style="display:flex;justify-content:center;align-items:center;transform:translate(-50%,-50%);"><span style="white-space:nowrap;padding:3px 9px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10.5px;font-weight:700;color:#ffffff;background:linear-gradient(135deg,#4f46e5,#7c3aed);border:1.5px solid #ffffff;box-shadow:0 4px 12px rgba(79,70,229,0.55);">مقایسه: ${safeDeltaText}</span></div>`, iconSize: [0, 0] });
  sub.addLayer(L.marker(arcMidPoint, { icon: arcBadgeIcon, zIndexOffset: 950 }));
  return sub;
}

export function reconcileCommuteIsochronesLayer(params: { L: any; map: any; groupRef: { current: any }; sigRef: { current: string | null }; showCommuteIsochrones: boolean; selectedWorkHub: WorkHub; activeCity: CityId }): void {
  const { L, map, groupRef, sigRef, showCommuteIsochrones, selectedWorkHub, activeCity } = params;
  if (!map || !L) return;
  const active = showCommuteIsochrones && selectedWorkHub.lat !== null && selectedWorkHub.lng !== null;
  const nextSig = active ? `${activeCity}|${selectedWorkHub.id}|${selectedWorkHub.lat}|${selectedWorkHub.lng}|${selectedWorkHub.name}` : 'off';
  if (sigRef.current === nextSig && (active ? Boolean(groupRef.current) : !groupRef.current)) return;
  clearOverlayGroupRef(map, groupRef);
  sigRef.current = nextSig;
  if (!active) return;
  const group = L.layerGroup();
  buildRadialDistanceRingSpecs(selectedWorkHub).forEach((r) => {
    group.addLayer(L.circle([selectedWorkHub.lat, selectedWorkHub.lng], { radius: r.radiusM, color: r.color, weight: 1.4, dashArray: '4, 6', fillColor: r.color, fillOpacity: r.fillOp }).bindTooltip(`<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:700;">${r.label}</div>`, { sticky: true, direction: 'top' }));
  });
  group.addTo(map);
  groupRef.current = group;
}

export function reconcileNeighborhoodComparisonArcLayer(params: { L: any; map: any; groupRef: { current: any }; sigRef: { current: string | null }; mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number; areaUnit: AreaUnit; intlCurrency: IntlCurrencyCode; locale: RadarLocale; comparisonArc: ComparisonArcPairState }): void {
  const { L, map, groupRef, sigRef, mode, targetSqm, rentAgeMultiplier, areaUnit, intlCurrency, locale, comparisonArc } = params;
  if (!map || !L) return;
  const active = Boolean(comparisonArc.active && comparisonArc.hoodA && comparisonArc.hoodB && comparisonArc.hoodA.id !== comparisonArc.hoodB.id);
  const nextSig = active ? `${comparisonArc.hoodA!.id}|${comparisonArc.hoodB!.id}|${mode}|${targetSqm}|${rentAgeMultiplier}|${areaUnit}|${intlCurrency}|${locale}` : 'off';
  if (sigRef.current === nextSig && (active ? Boolean(groupRef.current) : !groupRef.current)) return;
  clearOverlayGroupRef(map, groupRef);
  sigRef.current = nextSig;
  if (!active) return;
  const sub = buildComparisonArcGroup(L, mode, targetSqm, rentAgeMultiplier, areaUnit, intlCurrency, locale, comparisonArc);
  if (sub) { sub.addTo(map); groupRef.current = sub; }
}

export function clearOverlayGroupRef(map: any, groupRef: { current: any }, extraMap?: Map<string, any>): void {
  if (extraMap) {
    extraMap.forEach((v) => { if (v && v.stations instanceof Map) v.stations.clear(); });
    extraMap.clear();
  }
  if (groupRef.current) {
    try { groupRef.current.clearLayers?.(); map?.removeLayer?.(groupRef.current); } catch { /* ignore */ }
    groupRef.current = null;
  }
  void profileLayerReconciliation;
}

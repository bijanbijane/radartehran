import { EvaluatedNeighborhood, getNeighborhoodLandmarks, LocalLandmark, toPersianNum, WorkHub } from '../../data/neighborhoods';
import type { AreaUnit } from '../../utils/areaUnit';
import { escapeHtmlAttr } from '../../utils/security';
import { profileLayerReconciliation } from './mapRenderProfiler';

export interface WorkRouteAndLandmarkRefs {
  workMarker: any | null;
  workLine: any | null;
  workSignature: string | null;
  landmarksById: Map<string, { marker: any; signature: string }>;
}

export function createEmptyWorkRouteAndLandmarkRefs(): WorkRouteAndLandmarkRefs {
  return {
    workMarker: null,
    workLine: null,
    workSignature: null,
    landmarksById: new Map(),
  };
}

export function clearWorkRouteAndLandmarkLayers(map: any, refs: WorkRouteAndLandmarkRefs): void {
  if (refs.workLine) {
    try { map?.removeLayer?.(refs.workLine); } catch { /* ignore */ }
    refs.workLine = null;
  }
  if (refs.workMarker) {
    try { map?.removeLayer?.(refs.workMarker); } catch { /* ignore */ }
    refs.workMarker = null;
  }
  refs.workSignature = null;
  refs.landmarksById.forEach((entry) => {
    try { map?.removeLayer?.(entry.marker); } catch { /* ignore */ }
  });
  refs.landmarksById.clear();
}

function getLandmarkCategoryBadge(category: LocalLandmark['category']): { color: string; shortLabel: string } {
  if (category === 'مترو و حمل‌ونقل') return { color: '#0284c7', shortLabel: 'مترو' };
  if (category === 'پارک و فضای سبز') return { color: '#059669', shortLabel: 'پارک' };
  if (category === 'مرکز خرید و رفاهی') return { color: '#d97706', shortLabel: 'خرید' };
  return { color: '#e11d48', shortLabel: 'درمان' };
}

export function reconcileWorkRouteAndLandmarks(params: {
  L: any;
  map: any;
  refs: WorkRouteAndLandmarkRefs;
  selectedWorkHub: WorkHub;
  selectedHood: EvaluatedNeighborhood | undefined;
  showLandmarkPins: boolean;
  hoodLandmarks: LocalLandmark[];
  areaUnit?: AreaUnit;
}): void {
  const { L, map, refs, selectedWorkHub, selectedHood, showLandmarkPins, hoodLandmarks } = params;

  profileLayerReconciliation('work-route', 'workHubOrHood', () => {
    const hasWorkRoute = selectedWorkHub.lat !== null && selectedWorkHub.lng !== null && Boolean(selectedHood);
    if (!hasWorkRoute || !selectedHood) {
      let removed = 0;
      if (refs.workLine) { map.removeLayer(refs.workLine); refs.workLine = null; removed++; }
      if (refs.workMarker) { map.removeLayer(refs.workMarker); refs.workMarker = null; removed++; }
      refs.workSignature = null;
      return { created: 0, updated: 0, removed, retained: 0 };
    }
    const nextSig = `${selectedWorkHub.name}|${selectedWorkHub.lat}|${selectedWorkHub.lng}|${selectedHood.id}|${selectedHood.lat}|${selectedHood.lng}|${selectedHood.distKm}`;
    if (refs.workSignature === nextSig && refs.workMarker && refs.workLine) {
      return { created: 0, updated: 0, removed: 0, retained: 2 };
    }
    const hadPrevious = Boolean(refs.workMarker || refs.workLine);
    if (refs.workLine) { map.removeLayer(refs.workLine); refs.workLine = null; }
    if (refs.workMarker) { map.removeLayer(refs.workMarker); refs.workMarker = null; }
    const safeHubName = escapeHtmlAttr(selectedWorkHub.name);
    const safeHoodLabel = escapeHtmlAttr(selectedHood.name);
    const hubIcon = L.divIcon({
      className: 'work-hub-pin',
      html: `<div class="work-hub-pin-label">محل کار: ${safeHubName}</div>`,
      iconSize: [0, 0],
    });
    refs.workMarker = L.marker([selectedWorkHub.lat, selectedWorkHub.lng], { icon: hubIcon, zIndexOffset: 900 }).addTo(map);
    const distVal = (selectedHood.distKm || 0).toFixed(1);
    refs.workLine = L.polyline(
      [[selectedHood.lat, selectedHood.lng], [selectedWorkHub.lat, selectedWorkHub.lng]],
      { color: '#38bdf8', weight: 2.5, dashArray: '6, 6', opacity: 0.85 }
    ).addTo(map).bindTooltip(
      `<div dir="rtl" class="work-route-tooltip">خط مستقیم ${safeHoodLabel} تا ${safeHubName}: <strong>${toPersianNum(distVal)} کیلومتر</strong></div>`,
      { sticky: true, direction: 'top' }
    );
    refs.workSignature = nextSig;
    return hadPrevious
      ? { created: 0, updated: 2, removed: 0, retained: 0 }
      : { created: 2, updated: 0, removed: 0, retained: 0 };
  });

  profileLayerReconciliation('landmarks', 'landmarksUpdate', () => {
    const targetLandmarks = showLandmarkPins && selectedHood
      ? (hoodLandmarks.length > 0 ? hoodLandmarks : getNeighborhoodLandmarks(selectedHood))
      : [];
    const targetById = new Map<string, { lm: LocalLandmark; lat: number; lng: number; signature: string }>();
    if (selectedHood) {
      for (const lm of targetLandmarks) {
        const lat = selectedHood.lat + lm.latOffset;
        const lng = selectedHood.lng + lm.lngOffset;
        const key = `${selectedHood.id}:${lm.id}`;
        const signature = `${key}|${lat}|${lng}|${lm.name}|${lm.category}|${lm.desc}`;
        targetById.set(key, { lm, lat, lng, signature });
      }
    }

    let created = 0, updated = 0, removed = 0, retained = 0;
    for (const [key, entry] of refs.landmarksById.entries()) {
      if (!targetById.has(key)) {
        map.removeLayer(entry.marker);
        refs.landmarksById.delete(key);
        removed++;
      }
    }
    for (const [key, target] of targetById.entries()) {
      const existing = refs.landmarksById.get(key);
      if (existing && existing.signature === target.signature) {
        retained++;
        continue;
      }
      if (existing) map.removeLayer(existing.marker);
      const { color, shortLabel } = getLandmarkCategoryBadge(target.lm.category);
      const safeName = escapeHtmlAttr(target.lm.name);
      const safeCat = escapeHtmlAttr(target.lm.category);
      const safeDesc = escapeHtmlAttr(target.lm.desc);
      const safeShort = escapeHtmlAttr(shortLabel);
      const lmIcon = L.divIcon({
        className: 'hood-landmark-pin',
        html: `<div class="hood-landmark-pin-wrap"><span class="hood-landmark-pin-label" style="background:${color};">[${safeShort}] ${safeName}</span></div>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([target.lat, target.lng], { icon: lmIcon }).addTo(map).bindTooltip(
        `<div dir="rtl" class="hood-landmark-tooltip"><strong>[${safeShort}] ${safeName}</strong> (${safeCat})<br/><span style="font-size:11px;opacity:0.85;">${safeDesc}</span></div>`,
        { direction: 'top' }
      );
      refs.landmarksById.set(key, { marker, signature: target.signature });
      if (existing) updated++;
      else created++;
    }
    return { created, updated, removed, retained };
  });
}

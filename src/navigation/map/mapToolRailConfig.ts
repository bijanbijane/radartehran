/** @file src/navigation/map/mapToolRailConfig.ts — Dedicated Map Tool Rail State & Saved Views Storage (RT-UI-NAV-001 Section 8) */
import type { MapToolId, MapToolVisualState, SavedMapViewItem } from '../registry/route.types';

export const SAVED_MAP_VIEWS_STORAGE_KEY = 'tehran_radar_saved_map_views_v1';
export const MAX_SAVED_MAP_VIEWS = 12;

export type MapContextPanelId = 'layers' | 'filters' | 'analysis' | 'compare' | 'save_view' | null;

export interface MapToolRailStateSnapshot {
  openPanel: MapContextPanelId;
  activeLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';
  showMetroLines: boolean;
  showTrafficZones: boolean;
  hasFilterApplied: boolean;
  isComparing: boolean;
  hasSavedViews: boolean;
}

export function resolveMapToolVisualState(toolId: MapToolId, snap: MapToolRailStateSnapshot): MapToolVisualState {
  if (toolId === 'layers') {
    if (snap.openPanel === 'layers') return 'open';
    if (snap.activeLens !== 'budget' || snap.showMetroLines || snap.showTrafficZones) return 'active';
    return 'default';
  }
  if (toolId === 'filters') {
    if (snap.openPanel === 'filters') return 'open';
    if (snap.hasFilterApplied) return 'active';
    return 'default';
  }
  if (toolId === 'analysis') {
    return snap.openPanel === 'analysis' ? 'open' : 'default';
  }
  if (toolId === 'compare') {
    if (snap.openPanel === 'compare') return 'open';
    if (snap.isComparing) return 'active';
    return 'default';
  }
  if (toolId === 'save_view') {
    if (snap.openPanel === 'save_view') return 'open';
    if (snap.hasSavedViews) return 'active';
    return 'default';
  }
  return 'default';
}

export function toggleMapContextPanel(current: MapContextPanelId, target: Exclude<MapContextPanelId, null>): MapContextPanelId {
  return current === target ? null : target;
}

export function readSavedMapViews(): SavedMapViewItem[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(SAVED_MAP_VIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SavedMapViewItem => Boolean(x && typeof x.id === 'string' && typeof x.label === 'string' && typeof x.hoodId === 'number'))
      .slice(0, MAX_SAVED_MAP_VIEWS);
  } catch {
    return [];
  }
}

export function saveCurrentMapView(item: Omit<SavedMapViewItem, 'id' | 'createdAt'>): SavedMapViewItem[] {
  const existing = readSavedMapViews();
  const nextItem: SavedMapViewItem = {
    ...item,
    id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const deduped = [
    nextItem,
    ...existing.filter((x) => !(x.hoodId === nextItem.hoodId && x.lens === nextItem.lens && x.cityId === nextItem.cityId)),
  ].slice(0, MAX_SAVED_MAP_VIEWS);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SAVED_MAP_VIEWS_STORAGE_KEY, JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent('radar-saved-views-updated'));
    }
  } catch { /* Ignore storage quota errors */ }
  return deduped;
}

export function deleteSavedMapView(id: string): SavedMapViewItem[] {
  const next = readSavedMapViews().filter((x) => x.id !== id);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SAVED_MAP_VIEWS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('radar-saved-views-updated'));
    }
  } catch { /* Ignore */ }
  return next;
}

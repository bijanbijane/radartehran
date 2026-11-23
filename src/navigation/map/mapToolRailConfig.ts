/** @file src/navigation/map/mapToolRailConfig.ts — Dedicated Map Tool Rail State & Saved Views Storage (RT-UI-NAV-001 Section 8) */
import type { MapToolId, MapToolVisualState, SavedMapViewItem } from '../registry/route.types';
import { readScopedStorageJson, writeScopedStorageJson } from '../../features/account/services/accountStorageScope';

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
  showSpatialTools?: boolean;
  isSpatialMeasuring?: boolean;
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
  if (toolId === 'measure') {
    if (snap.showSpatialTools) return 'open';
    if (snap.isSpatialMeasuring) return 'active';
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

export function readSavedMapViews(uid?: string | null): SavedMapViewItem[] {
  const parsed = readScopedStorageJson<unknown[]>(SAVED_MAP_VIEWS_STORAGE_KEY, [], uid);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is SavedMapViewItem => Boolean(x && typeof (x as SavedMapViewItem).id === 'string' && typeof (x as SavedMapViewItem).label === 'string' && typeof (x as SavedMapViewItem).hoodId === 'number'))
    .slice(0, MAX_SAVED_MAP_VIEWS);
}

export function saveCurrentMapView(item: Omit<SavedMapViewItem, 'id' | 'createdAt'>, uid?: string | null): SavedMapViewItem[] {
  const existing = readSavedMapViews(uid);
  const nextItem: SavedMapViewItem = {
    ...item,
    id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const deduped = [
    nextItem,
    ...existing.filter((x) => !(x.hoodId === nextItem.hoodId && x.lens === nextItem.lens && x.cityId === nextItem.cityId)),
  ].slice(0, MAX_SAVED_MAP_VIEWS);
  writeScopedStorageJson(SAVED_MAP_VIEWS_STORAGE_KEY, deduped, uid);
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('radar-saved-views-updated'));
  } catch { /* Ignore */ }
  return deduped;
}

export function deleteSavedMapView(id: string, uid?: string | null): SavedMapViewItem[] {
  const next = readSavedMapViews(uid).filter((x) => x.id !== id);
  writeScopedStorageJson(SAVED_MAP_VIEWS_STORAGE_KEY, next, uid);
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('radar-saved-views-updated'));
  } catch { /* Ignore */ }
  return next;
}

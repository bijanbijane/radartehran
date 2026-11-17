import { GEO_ENGINE_CONFIG, TEHRAN_DEFAULT_CENTER } from '../core/GeoConfig';
import { MapViewKind, MapViewportState } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';
import { clampCenterToBounds, clampZoom } from './ViewportConstraints';
import { createInitialViewportState } from './ViewportState';

export function serializeViewportToUrlParams(state: MapViewportState): string {
  const params = new URLSearchParams();
  params.set('lat', state.center.lat.toFixed(4));
  params.set('lng', state.center.lng.toFixed(4));
  params.set('zoom', String(clampZoom(state.zoom)));
  if (state.selectedNeighborhoodId != null) {
    params.set('neighborhood', String(state.selectedNeighborhoodId));
  }
  if (state.selectedPropertyId) {
    params.set('property', state.selectedPropertyId);
  }
  if (state.viewMode !== 'map') {
    params.set('view', state.viewMode);
  }
  return params.toString();
}

export function parseViewportFromUrlParams(queryString: string): MapViewportState {
  const params = new URLSearchParams(queryString.startsWith('?') ? queryString.slice(1) : queryString);
  const rawLat = Number(params.get('lat'));
  const rawLng = Number(params.get('lng'));
  const rawZoom = Number(params.get('zoom'));
  const rawNeighborhood = params.get('neighborhood');
  const rawProperty = params.get('property');
  const rawView = params.get('view') as MapViewKind | null;

  const coordCheck = validateCoordinate(rawLat, rawLng);
  const center =
    coordCheck.valid && coordCheck.normalized
      ? clampCenterToBounds(coordCheck.normalized)
      : { ...TEHRAN_DEFAULT_CENTER };

  const zoom = Number.isFinite(rawZoom) && params.has('zoom')
    ? clampZoom(rawZoom)
    : GEO_ENGINE_CONFIG.defaultZoom;

  const selectedNeighborhoodId =
    rawNeighborhood && Number.isInteger(Number(rawNeighborhood)) && Number(rawNeighborhood) > 0
      ? Number(rawNeighborhood)
      : null;

  const viewMode: MapViewKind =
    rawView === 'split' || rawView === 'list' || rawView === 'map' ? rawView : 'map';

  return createInitialViewportState({
    center,
    zoom,
    selectedNeighborhoodId,
    selectedPropertyId: rawProperty && rawProperty.trim() ? rawProperty.trim() : null,
    viewMode,
  });
}

export class ViewportController {
  private state: MapViewportState;
  private subscribers = new Set<(state: MapViewportState) => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onUrlSync?: (queryString: string) => void;
  private debounceMs: number;

  constructor(
    initial?: Partial<MapViewportState>,
    options?: { debounceMs?: number; onUrlSync?: (queryString: string) => void }
  ) {
    this.state = createInitialViewportState(initial);
    this.debounceMs = Math.max(300, Math.min(500, options?.debounceMs ?? GEO_ENGINE_CONFIG.urlSyncDebounceMs));
    this.onUrlSync = options?.onUrlSync;
  }

  getState(): MapViewportState {
    return this.state;
  }

  updateViewport(patch: Partial<MapViewportState>): MapViewportState {
    const nextCenter = patch.center ? clampCenterToBounds(patch.center) : this.state.center;
    const nextZoom = patch.zoom !== undefined ? clampZoom(patch.zoom) : this.state.zoom;

    this.state = {
      ...this.state,
      ...patch,
      center: nextCenter,
      zoom: nextZoom,
      updatedAt: Date.now(),
    };

    for (const sub of this.subscribers) {
      sub(this.state);
    }

    this.scheduleUrlSync();
    return this.state;
  }

  selectNeighborhood(neighborhoodId: number | null, center?: { lat: number; lng: number }, zoom?: number): MapViewportState {
    return this.updateViewport({
      selectedNeighborhoodId: neighborhoodId,
      center: center ?? this.state.center,
      zoom: zoom ?? this.state.zoom,
    });
  }

  selectProperty(propertyId: string | null): MapViewportState {
    return this.updateViewport({ selectedPropertyId: propertyId });
  }

  subscribe(listener: (state: MapViewportState) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  flushUrlSync(): string {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const qs = serializeViewportToUrlParams(this.state);
    this.onUrlSync?.(qs);
    return qs;
  }

  private scheduleUrlSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onUrlSync?.(serializeViewportToUrlParams(this.state));
    }, this.debounceMs);
  }
}

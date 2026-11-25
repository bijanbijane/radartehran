import { GEO_ENGINE_CONFIG } from '../core/GeoConfig';

export interface TileHealthSnapshot {
  loadedCount: number;
  errorCount: number;
  errorRatio: number;
  degraded: boolean;
  activeProviderUrl: string;
  fallbackActivated: boolean;
}

export const PRIMARY_TILE_URL_PROXY = '/api/osm-tile/{z}/{x}/{y}.png';
export const PRIMARY_TILE_URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** @deprecated Use PRIMARY_TILE_URL_PROXY. Retained for legacy imports. */
export const PRIMARY_TILE_URL_DARK = PRIMARY_TILE_URL_PROXY;
/** @deprecated Use PRIMARY_TILE_URL_OSM. Retained for legacy imports. */
export const PRIMARY_TILE_URL_LIGHT = PRIMARY_TILE_URL_OSM;
export const FALLBACK_TILE_URL_OSM = PRIMARY_TILE_URL_OSM;

export class TileProviderHealthTracker {
  private loadedCount = 0;
  private errorCount = 0;
  private activeProviderUrl = PRIMARY_TILE_URL_PROXY;
  private fallbackActivated = false;

  constructor(initialUrl = PRIMARY_TILE_URL_PROXY) {
    this.activeProviderUrl = initialUrl;
  }

  recordTileLoad(): TileHealthSnapshot {
    this.loadedCount += 1;
    return this.getSnapshot();
  }

  recordTileError(): TileHealthSnapshot {
    this.errorCount += 1;
    const snap = this.getSnapshot();
    if (snap.degraded && !this.fallbackActivated) {
      this.fallbackActivated = true;
      this.activeProviderUrl = FALLBACK_TILE_URL_OSM;
    }
    return this.getSnapshot();
  }

  reset(providerUrl = PRIMARY_TILE_URL_PROXY): void {
    this.loadedCount = 0;
    this.errorCount = 0;
    this.activeProviderUrl = providerUrl;
    this.fallbackActivated = false;
  }

  getSnapshot(): TileHealthSnapshot {
    const total = this.loadedCount + this.errorCount;
    const errorRatio = total > 0 ? this.errorCount / total : 0;
    const degraded = total >= 4 && errorRatio > GEO_ENGINE_CONFIG.tileErrorWarningRatio;
    return {
      loadedCount: this.loadedCount,
      errorCount: this.errorCount,
      errorRatio,
      degraded,
      activeProviderUrl: this.activeProviderUrl,
      fallbackActivated: this.fallbackActivated,
    };
  }
}

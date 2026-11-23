import type { MapTileServerId } from '../types/models';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export const DEFAULT_NESHAN_WEB_KEY = 'web.d1062b862f27494f892ae998f10bf735'; export const OFFICIAL_OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const NESHAN_FALLBACK_MESSAGE = 'نقشه نشان در دسترس نیست؛ نقشه رایگان OpenStreetMap به عنوان پشتیبان فعال گردید.'; export const TILE_STYLE_PREF_STORAGE_KEY = 'tehran_radar_tile_style_v1'; export const NESHAN_PREF_MIGRATED_KEY = 'tehran_radar_neshan_pref_migrated_v1'; export const NESHAN_FALLBACK_CIRCUIT_KEY = 'tehran_radar_neshan_fallback_state_v1';
export const NESHAN_TILE_OPTIONS = { tileSize: 256, zoomOffset: 0, detectRetina: false, minZoom: 4, maxZoom: 19, subdomains: ['1', '2', '3', '4'], keepBuffer: 6, updateWhenIdle: false, updateWhenZooming: false } as const; export const OSM_STANDARD_TILE_OPTIONS = { tileSize: 256, zoomOffset: 0, detectRetina: false, minZoom: 1, maxZoom: 19, keepBuffer: 6, updateWhenIdle: false, updateWhenZooming: false } as const;
export function patchLeafletGridLayerNullSafety(L: any): void { if (!L || !L.GridLayer || (L.GridLayer.prototype as any).__tehranRadarPatched) return; const proto = L.GridLayer.prototype; (proto as any).__tehranRadarPatched = true; const origAnimateZoom = proto._animateZoom;
  if (typeof origAnimateZoom === 'function') { proto._animateZoom = function (e: any) { if (!this._map) return; return origAnimateZoom.call(this, e); }; }
  const origSetView = proto._setView; if (typeof origSetView === 'function') { proto._setView = function (center: any, zoom: any, noPrune: any, noUpdate: any) { if (!this._map) return; return origSetView.call(this, center, zoom, noPrune, noUpdate); }; }
  const origUpdateLevels = proto._updateLevels; if (typeof origUpdateLevels === 'function') { proto._updateLevels = function () { if (!this._map) return; return origUpdateLevels.call(this); }; }
  const origUpdate = proto._update; if (typeof origUpdate === 'function') { proto._update = function (center: any) { if (!this._map) return; return origUpdate.call(this, center); }; } }
export interface NeshanKeyValidationResult { isValid: boolean; normalizedKey: string; reason?: string; }
export function validateNeshanApiKey(rawKey?: string | null): NeshanKeyValidationResult { const candidate = (rawKey ?? '').trim(); if (!candidate) return { isValid: false, normalizedKey: '', reason: 'Neshan API key is empty or missing.' }; const webPattern = /^web\.[a-fA-F0-9]{20,64}$/;
  if (webPattern.test(candidate) || (candidate.length >= 16 && /^[a-zA-Z0-9._-]+$/.test(candidate))) { return { isValid: true, normalizedKey: candidate }; }
  return { isValid: false, normalizedKey: candidate, reason: 'Neshan API key format is invalid. Expected format: web.<hash>' }; }
export interface NeshanResolvedConfig { key: string; isValid: boolean; status: 'valid' | 'fallback_default' | 'invalid'; message?: string; displayAreaUnitLabel?: string; referenceValuationIntlText?: string; }
export function resolveNeshanConfiguration(options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }): NeshanResolvedConfig {
  const displayAreaUnitLabel = formatAreaUnitLabel(options?.areaUnit ?? 'sqm');
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT');
  let rawKey = '';
  try { if (typeof import.meta !== 'undefined' && (import.meta as any).env) rawKey = (import.meta as any).env.VITE_NESHAN_API_KEY || ''; } catch { rawKey = ''; }
  if (!rawKey.trim()) rawKey = DEFAULT_NESHAN_WEB_KEY;
  const validation = validateNeshanApiKey(rawKey);
  if (validation.isValid) {
    return { key: validation.normalizedKey, isValid: true, status: 'valid', displayAreaUnitLabel, referenceValuationIntlText };
  }
  return { key: DEFAULT_NESHAN_WEB_KEY, isValid: true, status: 'fallback_default', message: validation.reason, displayAreaUnitLabel, referenceValuationIntlText };
}
export function calcNeshanTile(
  z: number,
  x: number,
  y: number,
  styleCode: number = 103,
  salt: number = 2518
): string {
  const safeZ = Number.isFinite(z) ? Math.min(22, Math.max(0, Math.floor(z))) : 0;
  const safeX = Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
  const safeY = Number.isFinite(y) ? Math.max(0, Math.floor(y)) : 0;
  const safeStyle = Number.isFinite(styleCode) ? Math.max(0, Math.floor(styleCode)) : 103;
  const r: number[] = [];
  const s = [safeX, safeY, safeZ, safeStyle];
  const saltDigits = String(salt).split('');
  let a = 2;
  let lenDigits = '';
  for (let h = 0; h < 4; ++a, ++h) {
    if (a > 3) a = 0;
    const prod = s[a] * Number(saltDigits[a]);
    r[h] = prod;
    lenDigits += String(prod).length;
  }
  lenDigits += '2';
  r.unshift(Number(lenDigits));
  return '301' + r.join('');
}
/**
 * Builds the URL for a Neshan base map tile.
 */
export function buildNeshanBaseTileUrl(
  z: number,
  x: number,
  y: number,
  subdomainIndex: number = 0
): string {
  const hash = calcNeshanTile(z, x, y, 103, 2518);
  const sub = (Math.abs(subdomainIndex) % 4) + 1;
  return `https://tile${sub}.neshan.org/${hash}.png`;
}
/**
 * Builds the URL for a Neshan POI/labels overlay tile.
 */
export function buildNeshanLabelTileUrl(
  z: number,
  x: number,
  y: number,
  subdomainIndex: number = 0
): string {
  const hash = calcNeshanTile(z, x, y, 202, 2518);
  const sub = (Math.abs(subdomainIndex) % 4) + 5;
  return `https://tile${sub}.neshan.org/${hash}.png`;
}
export function buildProviderAttributionHtml(provider: 'neshan' | 'osm' | string): string {
  if (provider === 'neshan') {
    return '&copy; <a href="https://neshan.org" target="_blank" rel="noopener noreferrer">نشان</a> &copy; <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> Contributors';
  }
  return '&copy; <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> Contributors';
}
export type NeshanErrorCategory =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'network_error';
export interface ClassifiedTileError {
  category: NeshanErrorCategory;
  httpStatus: number | null;
  message: string;
  isRetryable: boolean;
}
export function classifyNeshanHttpError(status?: number | null): ClassifiedTileError {
  if (status === 401) {
    return {
      category: 'unauthorized',
      httpStatus: 401,
      message: 'کلید وب سرویس نشان نامعتبر است یا منقضی گردیده است.',
      isRetryable: false,
    };
  }
  if (status === 403) {
    return {
      category: 'forbidden',
      httpStatus: 403,
      message: 'دسترسی به کاشی‌های نقشه نشان مسدود شده است.',
      isRetryable: false,
    };
  }
  if (status === 404 || status === 410) {
    return {
      category: 'not_found',
      httpStatus: status,
      message: 'کاشی نقشه برای مختصات درخواستی در سرور نشان یافت نشد.',
      isRetryable: false,
    };
  }
  if (status === 429) {
    return {
      category: 'rate_limited',
      httpStatus: 429,
      message: 'سقف درخواست‌های مجاز در ثانیه/دقیقه به سرور نشان پر شده است.',
      isRetryable: true,
    };
  }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return {
      category: 'server_error',
      httpStatus: status,
      message: `خطای داخلی سرور ارائه‌دهنده نشان (${status}).`,
      isRetryable: true,
    };
  }
  return {
    category: 'network_error',
    httpStatus: null,
    message: 'خطای بارگذاری کاشی نقشه به دلیل قطعی شبکه یا اختلال سرور.',
    isRetryable: true,
  };
}
export interface FailoverWindowConfig {
  windowDurationMs: number;
  minCompletedOutcomes: number;
  minFailedOutcomes: number;
  failureRateThreshold: number;
}
export const DEFAULT_FAILOVER_CONFIG: FailoverWindowConfig = {
  windowDurationMs: 20_000,
  minCompletedOutcomes: 8,
  minFailedOutcomes: 5,
  failureRateThreshold: 0.6,
};
interface TileOutcome {
  timestamp: number;
  success: boolean;
  layerGeneration: number;
}
export class NeshanTileHealthMonitor {
  private outcomes: TileOutcome[] = [];
  private activeLayerGeneration = 0;
  private readonly config: FailoverWindowConfig;
  private onFailoverTriggered: (() => void) | null = null;
  private failoverFired = false;
  constructor(
    config: Partial<FailoverWindowConfig> = {},
    onFailover?: () => void
  ) {
    this.config = { ...DEFAULT_FAILOVER_CONFIG, ...config };
    if (onFailover) this.onFailoverTriggered = onFailover;
  }
  public setFailoverCallback(cb: () => void): void {
    this.onFailoverTriggered = cb;
  }
  public setLayerGeneration(gen: number): void {
    this.activeLayerGeneration = gen;
    this.reset();
  }
  public recordSuccess(layerGen: number): void {
    if (layerGen !== this.activeLayerGeneration) return;
    this.prune();
    this.outcomes.push({
      timestamp: Date.now(),
      success: true,
      layerGeneration: layerGen,
    });
  }
  public recordError(layerGen: number, _httpStatus?: number | null): void {
    if (layerGen !== this.activeLayerGeneration) return;
    this.prune();
    this.outcomes.push({
      timestamp: Date.now(),
      success: false,
      layerGeneration: layerGen,
    });
    this.evaluateHealth();
  }
  public recordAbort(_layerGen: number): void {
  }
  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowDurationMs;
    this.outcomes = this.outcomes.filter(
      (o) => o.timestamp >= cutoff && o.layerGeneration === this.activeLayerGeneration
    );
  }
  private evaluateHealth(): void {
    if (this.failoverFired) return;
    this.prune();
    const total = this.outcomes.length;
    if (total < this.config.minCompletedOutcomes) return;
    const failures = this.outcomes.filter((o) => !o.success).length;
    if (failures < this.config.minFailedOutcomes) return;
    const rate = failures / total;
    if (rate >= this.config.failureRateThreshold) {
      this.failoverFired = true;
      if (this.onFailoverTriggered) {
        this.onFailoverTriggered();
      }
    }
  }
  public reset(): void {
    this.outcomes = [];
    this.failoverFired = false;
  }
  public getSnapshot(): {
    total: number;
    failures: number;
    successes: number;
    failureRate: number;
    isHealthy: boolean;
  } {
    this.prune();
    const total = this.outcomes.length;
    const failures = this.outcomes.filter((o) => !o.success).length;
    const successes = total - failures;
    const failureRate = total === 0 ? 0 : failures / total;
    return {
      total,
      failures,
      successes,
      failureRate,
      isHealthy: !this.failoverFired,
    };
  }
}
export function readPersistedFallbackCircuit(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(NESHAN_FALLBACK_CIRCUIT_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
    return Boolean(data && data.fallbackActive === true);
  } catch {
    return false;
  }
}
export function writePersistedFallbackCircuit(active: boolean, reason?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!active) {
      localStorage.removeItem(NESHAN_FALLBACK_CIRCUIT_KEY);
      return;
    }
    localStorage.setItem(
      NESHAN_FALLBACK_CIRCUIT_KEY,
      JSON.stringify({
        fallbackActive: true,
        activatedAtIso: new Date().toISOString(),
        reason: (reason || 'Automatic failover triggered').replace(/[\r\n<>]/g, ' ').slice(0, 160),
      })
    );
  } catch {
  }
}
const APPROVED_MAP_TILE_STYLES: ReadonlySet<string> = new Set(['neshan', 'osm', 'voyager']);

export function resolveInitialPreferredTileStyle(): MapTileServerId {
  try {
    if (typeof localStorage === 'undefined') return 'neshan';
    const stored = localStorage.getItem(TILE_STYLE_PREF_STORAGE_KEY);
    if (stored && APPROVED_MAP_TILE_STYLES.has(stored)) return stored as MapTileServerId;
    if (stored !== null) {
      // Remove legacy/unlicensed styles from persistent preferences rather than
      // falling back repeatedly on every reload.
      localStorage.setItem(TILE_STYLE_PREF_STORAGE_KEY, 'neshan');
    }
    return 'neshan';
  } catch {
    return 'neshan';
  }
}
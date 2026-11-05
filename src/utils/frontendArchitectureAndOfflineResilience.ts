/**
 * @file src/utils/frontendArchitectureAndOfflineResilience.ts
 * @description Frontend Architecture, Client Request Cancellation & Stale Response Isolation, * Deep-Link Validation, Core Web Vitals Budgets, Overlay Focus Stack, Design Tokens, * Cross-Browser Feature Detection, IndexedDB Versioned Migrations, Offline Mutation Outbox, * and Storage Quota Eviction Resilience (Prompts 899–916).
 *
 * Architectural Rule: Pure utility module in `src/utils/` — no imports from `src/components/`,
 * `src/App.tsx`, `server.ts`, or `react`.
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit';
export type AsyncRequestState = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'cancelled';
export interface TrackedRequestTicket { scopeKey: string; generationId: number; abortController: AbortController; startedAtMs: number; timeoutMs: number; }
export class ScopedRequestLifecycleCoordinator { private readonly activeByScope = new Map<string, TrackedRequestTicket>(); private generationCounter = 0; public beginRequest(scopeKey: string, timeoutMs = 12_000): TrackedRequestTicket { const existing = this.activeByScope.get(scopeKey); if (existing) { try { existing.abortController.abort('SUPERSEDED_BY_NEWER_REQUEST'); } catch {
      } }
    this.generationCounter += 1; const ticket: TrackedRequestTicket = { scopeKey, generationId: this.generationCounter, abortController: new AbortController(), startedAtMs: Date.now(), timeoutMs, };
    this.activeByScope.set(scopeKey, ticket); return ticket; }
  public isCurrentGeneration(scopeKey: string, generationId: number): boolean { const active = this.activeByScope.get(scopeKey); return Boolean( active &&
        active.generationId === generationId && !active.abortController.signal.aborted, ); }
  public cancelScope(scopeKey: string): void { const existing = this.activeByScope.get(scopeKey); if (existing) { try {
        existing.abortController.abort('SCOPE_CANCELLED'); } catch { }
      this.activeByScope.delete(scopeKey); } }
  public cancelAll(): void {
    for (const key of Array.from(this.activeByScope.keys())) {
      this.cancelScope(key);
    }
  }
}
export interface ParsedRadarDeepLink {
  cityId: string; neighborhoodId: number | null; dealMode: 'خرید' | 'اجاره';
  mapLat: number | null; mapLng: number | null; mapZoom: number | null;
  missingEntityWarningFa: string | null; displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
}
export function resolveSafeDeepLinkState(
  searchParamsString: string,
  validCityIds: readonly string[],
  validNeighborhoodIdsForCity: ReadonlySet<number>,
): ParsedRadarDeepLink {
  const params = new URLSearchParams(searchParamsString || '');
  const rawCity = (params.get('city') || 'tehran').trim().toLowerCase();
  const cityId = validCityIds.includes(rawCity) ? rawCity : 'tehran';
  const rawMode = params.get('mode');
  const dealMode: 'خرید' | 'اجاره' =
    rawMode === 'rent' || rawMode === 'اجاره' ? 'اجاره' : 'خرید';
  let neighborhoodId: number | null = null;
  let missingEntityWarningFa: string | null = null;
  const rawHood = params.get('hood') || params.get('hoodId');
  if (rawHood !== null && rawHood.trim() !== '') {
    const parsedHood = Number(rawHood);
    if (Number.isInteger(parsedHood) && validNeighborhoodIdsForCity.has(parsedHood)) {
      neighborhoodId = parsedHood;
    } else {
      missingEntityWarningFa =
        'محله یا آگهی اشاره‌شده در این پیوند در شهر انتخابی یافت نشد یا حذف شده است.';
    }
  }
  const rawLat = Number(params.get('lat'));
  const rawLng = Number(params.get('lng'));
  const rawZoom = Number(params.get('z') || params.get('zoom'));
  const hasValidCoords =
    params.has('lat') &&
    params.has('lng') &&
    Number.isFinite(rawLat) &&
    Number.isFinite(rawLng) &&
    rawLat >= 24 &&
    rawLat <= 40 &&
    rawLng >= 44 &&
    rawLng <= 64;
  return {
    cityId, neighborhoodId, dealMode,
    mapLat: hasValidCoords ? Math.round(rawLat * 10000) / 10000 : null,
    mapLng: hasValidCoords ? Math.round(rawLng * 10000) / 10000 : null,
    mapZoom: Number.isFinite(rawZoom) && rawZoom >= 9 && rawZoom <= 19 ? Math.round(rawZoom) : null,
    missingEntityWarningFa,
    displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, getStoredIntlCurrency()),
  };
}
/**
 * Core Web Vitals & Performance Budget Governance (Prompt 906).
 */
export interface WebVitalsBudgetThresholds {
  maxLcpMs: number;
  maxInpMs: number;
  maxClsScore: number;
  maxFcpMs: number;
  maxTtfbMs: number;
  maxInitialJsGzipKb: number;
}
export const RADAR_PERFORMANCE_BUDGETS: Readonly<WebVitalsBudgetThresholds> = {
  maxLcpMs: 2500,
  maxInpMs: 200,
  maxClsScore: 0.1,
  maxFcpMs: 1800,
  maxTtfbMs: 800,
  maxInitialJsGzipKb: 380,
};
export function evaluatePerformanceMetricsAgainstBudget(metrics: {
  lcpMs?: number;
  inpMs?: number;
  clsScore?: number;
  fcpMs?: number;
  ttfbMs?: number;
  initialJsGzipKb?: number;
}): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  if (metrics.lcpMs !== undefined && metrics.lcpMs > RADAR_PERFORMANCE_BUDGETS.maxLcpMs) {
    violations.push(`LCP (${metrics.lcpMs}ms > ${RADAR_PERFORMANCE_BUDGETS.maxLcpMs}ms)`);
  }
  if (metrics.inpMs !== undefined && metrics.inpMs > RADAR_PERFORMANCE_BUDGETS.maxInpMs) {
    violations.push(`INP (${metrics.inpMs}ms > ${RADAR_PERFORMANCE_BUDGETS.maxInpMs}ms)`);
  }
  if (metrics.clsScore !== undefined && metrics.clsScore > RADAR_PERFORMANCE_BUDGETS.maxClsScore) {
    violations.push(`CLS (${metrics.clsScore} > ${RADAR_PERFORMANCE_BUDGETS.maxClsScore})`);
  }
  if (
    metrics.initialJsGzipKb !== undefined &&
    metrics.initialJsGzipKb > RADAR_PERFORMANCE_BUDGETS.maxInitialJsGzipKb
  ) {
    violations.push(
      `Initial JS Gzip (${metrics.initialJsGzipKb}KB > ${RADAR_PERFORMANCE_BUDGETS.maxInitialJsGzipKb}KB)`,
    );
  }
  return { passed: violations.length === 0, violations };
}
/**
 * Overlay Focus Stack & Escape Key Coordinator (Prompt 910).
 * Ensures pressing Escape only closes the top-most active modal/drawer and restores focus cleanly.
 */
export class OverlayFocusStackCoordinator {
  private readonly stack: string[] = [];
  public pushOverlay(overlayId: string): void {
    const idx = this.stack.indexOf(overlayId);
    if (idx !== -1) this.stack.splice(idx, 1);
    this.stack.push(overlayId);
  }
  public removeOverlay(overlayId: string): void {
    const idx = this.stack.indexOf(overlayId);
    if (idx !== -1) this.stack.splice(idx, 1);
  }
  public getTopOverlayId(): string | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }
  public isTopOverlay(overlayId: string): boolean {
    return this.getTopOverlayId() === overlayId;
  }
  public shouldLockBodyScroll(): boolean {
    return this.stack.length > 0;
  }
}
export const globalOverlayFocusStack = new OverlayFocusStackCoordinator();
/**
 * Centralized Design Token Registry for Light & Dark Themes (Prompt 911).
 */
export const RADAR_SEMANTIC_DESIGN_TOKENS = {
  light: {
    bgPrimary: '#f2f2f7', bgWindow: '#f5f5f7', surfaceCard: '#ffffff',
    textPrimary: '#1c1c1e', textSecondary: '#3a3a3c', textMuted: '#6c6c70',
    accentBrand: '#007aff', statusSuccess: '#059669', statusWarning: '#d97706', statusDanger: '#e11d48',
  },
  dark: {
    bgPrimary: '#000000', bgWindow: '#1c1c1e', surfaceCard: '#2c2c2e',
    textPrimary: '#f5f5f7', textSecondary: '#ebebf5', textMuted: '#98989d',
    accentBrand: '#0a84ff', statusSuccess: '#34d399', statusWarning: '#fbbf24', statusDanger: '#fb7185',
  },
} as const;
/**
 * Cross-Browser Feature Detection Matrix (Prompt 913).
 */
export interface BrowserCapabilityReport {
  hasIndexedDb: boolean; hasLocalStorage: boolean; hasServiceWorker: boolean;
  hasBroadcastChannel: boolean; hasResizeObserver: boolean; hasGeolocation: boolean;
  hasClipboardWrite: boolean; hasStorageManagerEstimate: boolean;
}
export function detectBrowserCapabilities(): BrowserCapabilityReport {
  const win = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  let hasLocalStorage = false;
  try { hasLocalStorage = Boolean(win && win.localStorage); } catch { hasLocalStorage = false; }
  return {
    hasIndexedDb: Boolean(win && 'indexedDB' in win && win.indexedDB),
    hasLocalStorage,
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasBroadcastChannel: typeof BroadcastChannel !== 'undefined',
    hasResizeObserver: typeof ResizeObserver !== 'undefined',
    hasGeolocation: Boolean(nav && 'geolocation' in nav),
    hasClipboardWrite: Boolean(nav && nav.clipboard && typeof nav.clipboard.writeText === 'function'),
    hasStorageManagerEstimate: Boolean(nav && nav.storage && typeof nav.storage.estimate === 'function'),
  };
}
/**
 * IndexedDB Versioned Schema Migration Plan (Prompt 914).
 */
export interface IndexedDbMigrationStep {
  fromVersion: number; toVersion: number; description: string; storesToEnsure: readonly string[];
}
export const RADAR_INDEXEDDB_MIGRATION_PLAN: readonly IndexedDbMigrationStep[] = [
  {
    fromVersion: 0, toVersion: 1,
    description: 'Create core offline snapshot and neighborhood cache stores',
    storesToEnsure: ['market_snapshots', 'neighborhood_boundaries'],
  },
  {
    fromVersion: 1, toVersion: 2,
    description: 'Add durable offline mutation outbox store with idempotency index',
    storesToEnsure: ['market_snapshots', 'neighborhood_boundaries', 'offline_mutation_outbox'],
  },
  {
    fromVersion: 2, toVersion: 3,
    description: 'Add quarantined corrupted records store and user calculation snapshots',
    storesToEnsure: ['market_snapshots', 'neighborhood_boundaries', 'offline_mutation_outbox', 'calculation_snapshots', 'quarantined_records'],
  },
];
export function getRequiredMigrationSteps(oldVersion: number, targetVersion = 3): IndexedDbMigrationStep[] {
  return RADAR_INDEXEDDB_MIGRATION_PLAN.filter((step) => step.toVersion > oldVersion && step.toVersion <= targetVersion);
}
/**
 * Durable Offline Mutation Outbox & Server Reconciliation Model (Prompt 915).
 */
export type OfflineEligibleOperationType =
  | 'buyer_lead_submission' | 'favorite_neighborhood_toggle' | 'listing_draft_autosave' | 'price_alert_subscription';
export type OfflineOutboxSyncStatus =
  | 'saved_locally' | 'waiting_for_connection' | 'synchronizing' | 'confirmed_by_server' | 'failed' | 'requires_user_action';
export interface OfflineMutationOutboxRecord {
  operationId: string; idempotencyKey: string; operationType: OfflineEligibleOperationType;
  entityId: string; payloadVersion: number; payload: Record<string, unknown>;
  createdAtMs: number; retryCount: number; status: OfflineOutboxSyncStatus;
  statusLabelFa: string; lastErrorFa: string | null;
}
export const OUTBOX_STATUS_LABELS_FA: Readonly<Record<OfflineOutboxSyncStatus, string>> = {
  saved_locally: 'ذخیره محلی در مرورگر (تأیید نهایی سرور انجام نشده)',
  waiting_for_connection: 'در انتظار اتصال اینترنت برای ارسال به سرور',
  synchronizing: 'در حال همگام‌سازی با سرور...',
  confirmed_by_server: 'تأیید و ثبت نهایی در سرور',
  failed: 'خطا در ارسال؛ آماده تلاش مجدد',
  requires_user_action: 'نیازمند بررسی و اصلاح اطلاعات توسط کاربر',
};
export function createOfflineOutboxRecord(input: {
  idempotencyKey: string; operationType: OfflineEligibleOperationType;
  entityId: string; payload: Record<string, unknown>; isOnline: boolean;
}): OfflineMutationOutboxRecord {
  const status: OfflineOutboxSyncStatus = input.isOnline ? 'synchronizing' : 'waiting_for_connection';
  return {
    operationId: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: input.idempotencyKey, operationType: input.operationType,
    entityId: input.entityId, payloadVersion: 2, payload: input.payload,
    createdAtMs: Date.now(), retryCount: 0, status, statusLabelFa: OUTBOX_STATUS_LABELS_FA[status], lastErrorFa: null,
  };
}
/**
 * Browser Storage Quota & Priority Eviction Policy (Prompt 916).
 */
export const PROTECTED_USER_STORAGE_PREFIXES: readonly string[] = [
  'radar_listing_draft_', 'radar_offline_outbox_', 'radar_buyer_price_alerts_', 'radar_visit_book_', 'favoriteHoodIds',
];
export const EVICTABLE_CACHE_STORAGE_PREFIXES: readonly string[] = [
  'radar_tile_cache_', 'radar_market_cache_', 'radar_osm_boundary_cache_', 'radar_recent_perf_trace_',
];
export function isStorageKeySafeToEvict(key: string): boolean {
  if (PROTECTED_USER_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix) || key === prefix)) return false;
  return EVICTABLE_CACHE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}
export function safeWriteLocalStorageWithQuotaRecovery(
  key: string,
  value: string,
  storageObj?: Storage,
): { persisted: boolean; evictedCacheCount: number; errorFa: string | null } {
  const target = storageObj || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return { persisted: false, evictedCacheCount: 0, errorFa: 'حافظه محلی مرورگر در دسترس نیست.' };
  try {
    target.setItem(key, value);
    const readBack = target.getItem(key);
    return {
      persisted: readBack === value, evictedCacheCount: 0,
      errorFa: readBack === value ? null : 'عدم تطابق داده پس از نوشتن در حافظه.',
    };
  } catch {
    let evictedCacheCount = 0;
    try {
      const keysToEvict: string[] = [];
      for (let i = 0; i < target.length; i++) {
        const k = target.key(i);
        if (k && isStorageKeySafeToEvict(k)) keysToEvict.push(k);
      }
      for (const k of keysToEvict) { target.removeItem(k); evictedCacheCount += 1; } target.setItem(key, value); return { persisted: target.getItem(key) === value, evictedCacheCount, errorFa: null }; } catch { return { persisted: false, evictedCacheCount, errorFa: 'ظرفیت حافظه مرورگر تکمیل شده است؛ اطلاعات حساس شما حذف نشد اما ذخیره جدید نیازمند آزادسازی کش است.', }; } } }
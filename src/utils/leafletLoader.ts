/**
 * @file src/utils/leafletLoader.ts
 * @description
 * Prompt 754 — Deterministic Leaflet Runtime Loader, Timeout Guard & Failure Recovery.
 * Replaces indefinite polling with an event-driven, race-safe script readiness state machine.
 */

import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export type MapLibraryState = 'idle' | 'loading' | 'ready' | 'failed';

export interface LeafletLoadOptions {
  timeoutMs?: number;
  scriptSrc?: string;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
  referenceValuationMillionToman?: number;
}

type MapLibraryListener = (state: MapLibraryState, errorReason?: string) => void;

const DEFAULT_LEAFLET_TIMEOUT_MS = 8000;
const DEFAULT_LEAFLET_SCRIPT_SRC =
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let currentLibraryState: MapLibraryState = 'idle';
let lastFailureReason: string | undefined;
let activeLoadPromise: Promise<any> | null = null;
let loadGeneration = 0;

const stateListeners = new Set<MapLibraryListener>();

function isGlobalLeafletReady(): boolean {
  if (typeof window === 'undefined') return false;
  const L = (window as unknown as { L?: { map?: unknown; tileLayer?: unknown; divIcon?: unknown } }).L;
  return Boolean(L && typeof L.map === 'function' && typeof L.tileLayer === 'function');
}

function setLibraryState(nextState: MapLibraryState, reason?: string): void {
  currentLibraryState = nextState;
  lastFailureReason = reason;
  for (const listener of stateListeners) {
    try {
      listener(currentLibraryState, lastFailureReason);
    } catch {
      // Ignore listener errors
    }
  }
}

export function getLeafletLibraryState(): MapLibraryState {
  if (isGlobalLeafletReady() && currentLibraryState !== 'ready') {
    currentLibraryState = 'ready';
    lastFailureReason = undefined;
  }
  return currentLibraryState;
}

export function getLeafletFailureReason(): string | undefined {
  return lastFailureReason;
}

export function getLeafletLoaderDiagnosticSnapshot(
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 10000,
): { state: MapLibraryState; failureReason?: string; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  return {
    state: getLeafletLibraryState(),
    ...(lastFailureReason ? { failureReason: lastFailureReason } : {}),
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en'),
  };
}

export function subscribeLeafletLibraryState(listener: MapLibraryListener): () => void {
  stateListeners.add(listener);
  try {
    listener(getLeafletLibraryState(), lastFailureReason);
  } catch {
    // Ignore
  }
  return () => {
    stateListeners.delete(listener);
  };
}

function findExistingLeafletScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;
  const scripts = Array.from(document.querySelectorAll('script'));
  return (
    scripts.find((script) => {
      const src = script.getAttribute('src') || '';
      return src.toLowerCase().includes('leaflet');
    }) || null
  );
}

const TRUSTED_LEAFLET_CDN_HOSTS = new Set(['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com']);

export function isTrustedLeafletScriptUrl(rawUrl: string): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > 512 || /[\r\n\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('..')) {
    return /\.m?js$/i.test(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search) return false;
    return TRUSTED_LEAFLET_CDN_HOSTS.has(parsed.hostname.toLowerCase()) && /leaflet.*\.m?js$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Deterministically ensure `window.L` is loaded and ready.
 * Shares a single in-flight promise across concurrent callers and enforces a bounded timeout.
 */
export function ensureLeafletLoaded(options?: LeafletLoadOptions): Promise<any> {
  if (isGlobalLeafletReady()) {
    setLibraryState('ready');
    return Promise.resolve((window as any).L);
  }

  if (activeLoadPromise) {
    return activeLoadPromise;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    setLibraryState('failed', 'NON_BROWSER_ENVIRONMENT');
    return Promise.reject(new Error('LEAFLET_NON_BROWSER_ENVIRONMENT'));
  }

  const scriptSrc = options?.scriptSrc || DEFAULT_LEAFLET_SCRIPT_SRC;
  if (!isTrustedLeafletScriptUrl(scriptSrc)) {
    setLibraryState('failed', 'UNTRUSTED_LEAFLET_SCRIPT_SRC');
    return Promise.reject(new Error('UNTRUSTED_LEAFLET_SCRIPT_SRC'));
  }

  const generation = ++loadGeneration;
  const timeoutMs = Math.max(200, Math.min(30_000, Number(options?.timeoutMs) || DEFAULT_LEAFLET_TIMEOUT_MS));

  setLibraryState('loading');

  activeLoadPromise = new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let checkIntervalId: ReturnType<typeof setInterval> | null = null;
    let scriptEl = findExistingLeafletScript();

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
      }
      if (scriptEl) {
        scriptEl.removeEventListener('load', onScriptLoad);
        scriptEl.removeEventListener('error', onScriptError);
      }
    };

    const settleSuccess = () => {
      if (settled || generation !== loadGeneration) return;
      settled = true;
      cleanup();
      activeLoadPromise = null;
      setLibraryState('ready');
      resolve((window as any).L);
    };

    const settleFailure = (reason: string) => {
      if (settled || generation !== loadGeneration) return;
      settled = true;
      cleanup();
      activeLoadPromise = null;
      if (scriptEl) {
        scriptEl.setAttribute('data-leaflet-failed', 'true');
      }
      setLibraryState('failed', reason);
      reject(new Error(reason));
    };

    const onScriptLoad = () => {
      if (isGlobalLeafletReady()) {
        settleSuccess();
      } else {
        settleFailure('LEAFLET_LOADED_WITHOUT_GLOBAL');
      }
    };

    const onScriptError = () => {
      settleFailure('LEAFLET_SCRIPT_LOAD_ERROR');
    };

    if (isGlobalLeafletReady()) {
      settleSuccess();
      return;
    }

    if (!scriptEl || scriptEl.getAttribute('data-leaflet-failed') === 'true') {
      if (scriptEl && scriptEl.parentNode) {
        try {
          scriptEl.parentNode.removeChild(scriptEl);
        } catch {
          // Ignore removal issues
        }
      }
      scriptEl = document.createElement('script');
      scriptEl.src = scriptSrc;
      scriptEl.defer = true;
      scriptEl.crossOrigin = 'anonymous';
      scriptEl.referrerPolicy = 'no-referrer';
      scriptEl.setAttribute('data-leaflet-loader', 'managed');
      document.head.appendChild(scriptEl);
    }

    scriptEl.addEventListener('load', onScriptLoad);
    scriptEl.addEventListener('error', onScriptError);

    // Bounded readiness check in case the existing <script defer> finished between checks
    checkIntervalId = setInterval(() => {
      if (isGlobalLeafletReady()) {
        settleSuccess();
      }
    }, 60);

    timeoutId = setTimeout(() => {
      if (isGlobalLeafletReady()) {
        settleSuccess();
      } else {
        settleFailure('LEAFLET_LOAD_TIMEOUT');
      }
    }, timeoutMs);
  });

  return activeLoadPromise;
}

/**
 * Explicitly retry loading Leaflet after a previous failure or timeout.
 */
export function retryLeafletLoad(options?: LeafletLoadOptions): Promise<any> {
  if (isGlobalLeafletReady()) {
    setLibraryState('ready');
    return Promise.resolve((window as any).L);
  }
  activeLoadPromise = null;
  const existing = findExistingLeafletScript();
  if (existing) {
    existing.setAttribute('data-leaflet-failed', 'true');
  }
  setLibraryState('idle');
  return ensureLeafletLoaded(options);
}

/**
 * Reset loader state for deterministic unit/E2E tests.
 */
export function resetLeafletLoaderForTests(): void {
  loadGeneration += 1;
  activeLoadPromise = null;
  currentLibraryState = isGlobalLeafletReady() ? 'ready' : 'idle';
  lastFailureReason = undefined;
}

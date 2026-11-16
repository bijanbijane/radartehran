/**
 * @file src/features/commerce/services/exchangeRateClient.ts
 * @description Single authoritative client gateway for USD/IRT reference exchange rate via GET /api/v1/commerce/catalog.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { setRuntimeExchangeRateSnapshot } from '../../../utils/areaUnit';

export interface ExchangeRateSnapshot {
  source: string;
  usdToTomanRate: number;
  recordedAtIso: string;
  isStaleWarningFa: string;
  conversionPolicyFa?: string;
}

export type ExchangeRateStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface ExchangeRateStoreState {
  snapshot: ExchangeRateSnapshot | null;
  status: ExchangeRateStatus;
  fetchedAtMs: number | null;
  errorFa: string | null;
}

export const EXCHANGE_RATE_CACHE_TTL_MS = 300_000;
const CATALOG_ENDPOINT = '/api/v1/commerce/catalog';

let storeState: ExchangeRateStoreState = {
  snapshot: null,
  status: 'idle',
  fetchedAtMs: null,
  errorFa: null,
};

let inFlightPromise: Promise<ExchangeRateStoreState> | null = null;
const storeListeners = new Set<() => void>();

function emitStoreChange(): void {
  storeListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* Ignore subscriber errors */
    }
  });
}

function setStoreState(next: ExchangeRateStoreState): void {
  storeState = next;
  setRuntimeExchangeRateSnapshot(next.snapshot);
  emitStoreChange();
}

export function validateCatalogExchangeRatePayload(payload: unknown): ExchangeRateSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (obj.status !== 'ok' || obj.version !== 'v1') return null;
  const ref = obj.exchangeRateReference;
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  const rate = Number(r.usdToTomanRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 10_000_000) return null;
  if (typeof r.recordedAtIso !== 'string' || !Number.isFinite(Date.parse(r.recordedAtIso))) return null;
  if (typeof r.source !== 'string' || !r.source.trim()) return null;
  return {
    source: r.source.trim(),
    usdToTomanRate: rate,
    recordedAtIso: r.recordedAtIso,
    isStaleWarningFa:
      typeof r.isStaleWarningFa === 'string' && r.isStaleWarningFa.trim()
        ? r.isStaleWarningFa.trim()
        : 'نرخ مرجع تبدیل ارز ثابت و جهت برآورد تحلیلی است.',
    conversionPolicyFa: typeof r.conversionPolicyFa === 'string' ? r.conversionPolicyFa.trim() : undefined,
  };
}

export async function fetchExchangeRateSnapshot(options?: {
  forceRefresh?: boolean;
  fetcher?: typeof fetch;
  nowMs?: number;
}): Promise<ExchangeRateStoreState> {
  const now = options?.nowMs ?? Date.now();
  const hasFreshCache =
    !options?.forceRefresh &&
    storeState.snapshot !== null &&
    storeState.fetchedAtMs !== null &&
    now - storeState.fetchedAtMs < EXCHANGE_RATE_CACHE_TTL_MS;

  if (hasFreshCache) {
    return storeState;
  }

  if (inFlightPromise && !options?.forceRefresh) {
    return inFlightPromise;
  }

  const doFetch = async (): Promise<ExchangeRateStoreState> => {
    const fetchFn = options?.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!fetchFn) {
      const next: ExchangeRateStoreState = storeState.snapshot
        ? { ...storeState, status: 'ready', errorFa: 'امکان بروزرسانی نرخ مرجع در این محیط وجود ندارد.' }
        : { snapshot: null, status: 'unavailable', fetchedAtMs: now, errorFa: 'نرخ مرجع تبدیل ارز در دسترس نیست' };
      setStoreState(next);
      return next;
    }

    if (storeState.status === 'idle') {
      storeState = { ...storeState, status: 'loading' };
      emitStoreChange();
    }

    try {
      const response = await fetchFn(CATALOG_ENDPOINT, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const json: unknown = await response.json();
      const validated = validateCatalogExchangeRatePayload(json);
      if (!validated) {
        throw new Error('INVALID_EXCHANGE_RATE_PAYLOAD');
      }
      const readyState: ExchangeRateStoreState = {
        snapshot: validated,
        status: 'ready',
        fetchedAtMs: options?.nowMs ?? Date.now(),
        errorFa: null,
      };
      setStoreState(readyState);
      return readyState;
    } catch {
      const fallbackState: ExchangeRateStoreState = storeState.snapshot
        ? {
            ...storeState,
            status: 'ready',
            errorFa: 'بروزرسانی نرخ جدید ناموفق بود؛ آخرین نرخ معتبر مرجع نمایش داده می‌شود.',
          }
        : {
            snapshot: null,
            status: 'unavailable',
            fetchedAtMs: options?.nowMs ?? Date.now(),
            errorFa: 'نرخ مرجع تبدیل ارز در دسترس نیست',
          };
      setStoreState(fallbackState);
      return fallbackState;
    }
  };

  inFlightPromise = doFetch().finally(() => {
    inFlightPromise = null;
  });
  return inFlightPromise;
}

export function getExchangeRateStoreSnapshot(): ExchangeRateStoreState {
  return storeState;
}

export function subscribeExchangeRateStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

export function useExchangeRateSnapshot(): ExchangeRateStoreState {
  const state = useSyncExternalStore(
    subscribeExchangeRateStore,
    getExchangeRateStoreSnapshot,
    getExchangeRateStoreSnapshot,
  );

  useEffect(() => {
    const isExpired =
      state.fetchedAtMs !== null && Date.now() - state.fetchedAtMs >= EXCHANGE_RATE_CACHE_TTL_MS;
    if (state.status === 'idle' || isExpired) {
      void fetchExchangeRateSnapshot();
    }
  }, [state.status, state.fetchedAtMs]);

  return state;
}

export function convertMillionTomanToUsd(
  millionToman: number,
  snapshot: ExchangeRateSnapshot | null | undefined,
): number | null {
  if (!snapshot || !Number.isFinite(snapshot.usdToTomanRate) || snapshot.usdToTomanRate <= 0) {
    return null;
  }
  const safeMillion = Number.isFinite(millionToman) ? Math.max(0, millionToman) : 0;
  return (safeMillion * 1_000_000) / snapshot.usdToTomanRate;
}

export function formatExchangeRateRecordedDateFa(recordedAtIso: string | undefined): string {
  if (!recordedAtIso) return 'تاریخ نامشخص';
  const parsed = Date.parse(recordedAtIso);
  if (!Number.isFinite(parsed)) return 'تاریخ نامشخص';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(parsed));
  } catch {
    return recordedAtIso.slice(0, 10);
  }
}

export function resetExchangeRateStoreForTests(): void {
  inFlightPromise = null;
  setStoreState({
    snapshot: null,
    status: 'idle',
    fetchedAtMs: null,
    errorFa: null,
  });
}

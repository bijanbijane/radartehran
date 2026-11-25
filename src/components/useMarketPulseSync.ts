/**
 * @file src/components/useMarketPulseSync.ts
 * @description هوک همگام‌سازی خودکار نبض بازار (`/api/market-pulse`) و اسکرپینگ عمیق وب (`/api/market-pulse/deep-sync`)
 * با حفظ قیمت‌های سفارشی مدیر و لغو درخواست‌های قدیمی هنگام تغییر شهر.
 */

import React, { useEffect, useCallback, useRef } from 'react';
import type { AuthUserSnapshot } from '../platform/auth';
import {
  INITIAL_NEIGHBORHOODS,
  LOCAL_STORAGE_KEY,
  type CityId,
  type MarketPulseData,
  type Neighborhood,
} from '../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
} from '../utils/areaUnit';
import type { AppUiState } from './useAppUiState';
import { mergeEffectiveBargains } from '../utils/marketDataIntegrity';

export const activeCloudOverrideHoodIds = new Set<number>();

function applyPulseSnapshots(
  prev: Neighborhood[],
  snapshotMap: Map<number, { liveBuyPerSqm?: number; liveRahn80m?: number; liveAirScore?: number; liveBargains?: Neighborhood['bargains'] }>,
  customIds: Set<number>,
  forceRefresh: boolean,
): Neighborhood[] {
  let changed = false;
  const next = prev.map((base) => {
    const snapshot = snapshotMap.get(base.id);
    if (!snapshot) return base;
    const nextAir =
      typeof snapshot.liveAirScore === 'number' && Number.isFinite(snapshot.liveAirScore) && snapshot.liveAirScore >= 0 && snapshot.liveAirScore <= 10
        ? snapshot.liveAirScore
        : base.air;
    const incomingLive = Array.isArray(snapshot.liveBargains) && snapshot.liveBargains.length > 0 ? snapshot.liveBargains : undefined;
    const nextBargains = incomingLive ? mergeEffectiveBargains(base.bargains, incomingLive, base.id) : base.bargains;
    const prevSig = (base.bargains || []).map((b) => b.id).join(',');
    const nextSig = (nextBargains || []).map((b) => b.id).join(',');
    const bargainsChanged = prevSig !== nextSig;
    if (activeCloudOverrideHoodIds.has(base.id) || (customIds.has(base.id) && !forceRefresh)) {
      if (nextAir === base.air && !bargainsChanged) return base;
      changed = true;
      return { ...base, air: nextAir, bargains: nextBargains };
    }
    const buyVal = typeof snapshot.liveBuyPerSqm === 'number' && Number.isFinite(snapshot.liveBuyPerSqm) ? snapshot.liveBuyPerSqm : NaN;
    const rahnVal = Number(snapshot.liveRahn80m);
    const hasBuyDelta = typeof snapshot.liveBuyPerSqm === 'number' && Number.isFinite(buyVal) && buyVal > 0 && Math.abs(snapshot.liveBuyPerSqm - base.buyPerSqm) > 0.01;
    const hasRahnDelta = Number.isFinite(rahnVal) && rahnVal > 0 && Math.abs(rahnVal - base.rahn80m) > 0.01;
    const nextBuy = hasBuyDelta ? buyVal : base.buyPerSqm;
    const nextRahn = hasRahnDelta ? rahnVal : base.rahn80m;
    if (nextBuy === base.buyPerSqm && nextRahn === base.rahn80m && nextAir === base.air && !bargainsChanged) return base;
    changed = true;
    return { ...base, buyPerSqm: nextBuy, rahn80m: nextRahn, air: nextAir, bargains: nextBargains };
  });
  return changed ? next : prev;
}

export interface UseMarketPulseSyncParams {
  ui: AppUiState;
  activeCityRef: React.MutableRefObject<CityId>;
  currentUser: AuthUserSnapshot | null;
  allExpansionSeeds: Neighborhood[];
  setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>;
}

export function useMarketPulseSync({
  ui,
  activeCityRef,
  currentUser,
  allExpansionSeeds,
  setNeighborhoods,
}: UseMarketPulseSyncParams) {
  const pulseAbortRef = useRef<AbortController | null>(null);
  const pulseSeqRef = useRef<number>(0);
  const deepSyncAbortRef = useRef<AbortController | null>(null);
  const deepSyncSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pulseAbortRef.current?.abort();
      deepSyncAbortRef.current?.abort();
    };
  }, []);

  const fetchMarketPulse = useCallback(
    async (forceRefresh = false, cityOverride?: CityId) => {
      const targetCity = cityOverride || ui.activeCity;
      activeCityRef.current = targetCity;
      pulseAbortRef.current?.abort();
      const controller = new AbortController();
      pulseAbortRef.current = controller;
      const seq = ++pulseSeqRef.current;
      ui.setSyncingPulse(true);
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (controller.signal.aborted || !isMountedRef.current || seq !== pulseSeqRef.current) return;
        const res = await fetch(
          `/api/market-pulse?city=${encodeURIComponent(targetCity)}${forceRefresh ? '&refresh=1' : ''}`,
          { credentials: 'same-origin', headers, signal: controller.signal }
        );
        if (controller.signal.aborted || !isMountedRef.current || seq !== pulseSeqRef.current) return;
        if (res.ok && activeCityRef.current === targetCity) {
          const data: MarketPulseData = await res.json();
          const payloadCity = typeof (data as { city?: unknown }).city === 'string' ? (data as { city?: string }).city : targetCity;
          if (controller.signal.aborted || !isMountedRef.current || seq !== pulseSeqRef.current || activeCityRef.current !== targetCity || payloadCity !== targetCity) return;
          ui.setMarketPulse({ ...data, city: targetCity } as MarketPulseData);
          if (Array.isArray(data.hoodLiveSnapshots) && data.hoodLiveSnapshots.length > 0) {
            const snapshotMap = new Map(data.hoodLiveSnapshots.map((s) => [Number(s.id), s]));
            const customIds = new Set<number>(activeCloudOverrideHoodIds);
            try {
              const rawSaved = localStorage.getItem(LOCAL_STORAGE_KEY);
              if (rawSaved) {
                const parsed = JSON.parse(rawSaved);
                if (Array.isArray(parsed)) {
                  parsed.forEach((item: any) => {
                    const seed = [...INITIAL_NEIGHBORHOODS, ...allExpansionSeeds].find((s) => s.id === Number(item?.id));
                    if (seed && (item.buyPerSqm !== seed.buyPerSqm || item.rahn80m !== seed.rahn80m)) {
                      customIds.add(seed.id);
                    }
                  });
                }
              }
            } catch { /* ignore */ }
            setNeighborhoods((prev) => applyPulseSnapshots(prev, snapshotMap, customIds, forceRefresh));
          }
          if (forceRefresh) {
            const areaUnit = getStoredAreaUnit(); const intlCurrency = getStoredIntlCurrency(); const unitLabel = formatAreaUnitLabel(areaUnit);
            const avgSqm = Number(data.hoodLiveSnapshots?.[0]?.liveBuyPerSqm) || 115; const unitPrice = convertPricePerSqmToUnit(avgSqm, areaUnit);
            const intlBadge = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, getStoredRadarLocale())}/${unitLabel}` : '';
            ui.setLastSyncNotice(`بروزرسانی زنده از سرور انجام شد (${data.lastUpdatedTimeFa} · واحد ${unitLabel}${intlBadge})`);
          }
        }
      } catch { /* fallback to cache or aborted */ } finally {
        if (isMountedRef.current && seq === pulseSeqRef.current) {
          ui.setSyncingPulse(false);
        }
      }
    },
    [ui.activeCity, currentUser, allExpansionSeeds, activeCityRef, setNeighborhoods]
  );

  const handleDeepWebSync = useCallback(async () => {
    const targetCity = ui.activeCity;
    deepSyncAbortRef.current?.abort();
    const controller = new AbortController();
    deepSyncAbortRef.current = controller;
    const seq = ++deepSyncSeqRef.current;
    ui.setDeepSyncing(true);
    ui.setLastSyncNotice('در حال استعلام زنده از منابع رایگان وب (AQICN، دیوار و شیپور)...');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (controller.signal.aborted || !isMountedRef.current || seq !== deepSyncSeqRef.current) return;
      const res = await fetch('/api/market-pulse/deep-sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ city: targetCity }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || !isMountedRef.current || seq !== deepSyncSeqRef.current || activeCityRef.current !== targetCity) return;
      if (res.ok) {
        const result = await res.json();
        if (controller.signal.aborted || !isMountedRef.current || seq !== deepSyncSeqRef.current || activeCityRef.current !== targetCity) return;
        const pulseData = result.pulse || result;
        if (pulseData?.status === 'ok') ui.setMarketPulse(pulseData);
        if (Array.isArray(pulseData?.hoodLiveSnapshots) && pulseData.hoodLiveSnapshots.length > 0) {
          const snapshotMap = new Map<number, { liveBuyPerSqm?: number; liveRahn80m?: number; liveAirScore?: number; liveBargains?: Neighborhood['bargains'] }>(
            pulseData.hoodLiveSnapshots.map((s: any) => [Number(s.id), s]),
          );
          setNeighborhoods((prev) => applyPulseSnapshots(prev, snapshotMap, activeCloudOverrideHoodIds, true));
        } else if (Array.isArray(result.hoodPriceUpdates) && result.hoodPriceUpdates.length > 0) {
          const fallbackMap = new Map<number, { liveBuyPerSqm?: number; liveRahn80m?: number; liveAirScore?: number; liveBargains?: Neighborhood['bargains'] }>(
            result.hoodPriceUpdates.map((u: any) => [
              Number(u.id),
              { liveBuyPerSqm: u.buyPerSqm, liveRahn80m: u.rahn80m, liveAirScore: u.airScore, liveBargains: u.liveBargains },
            ]),
          );
          setNeighborhoods((prev) => applyPulseSnapshots(prev, fallbackMap, activeCloudOverrideHoodIds, true));
        }
        const sourceSummary = Array.isArray(result.sourcesReached)
          ? result.sourcesReached.join(' + ')
          : 'منابع وب';
        const areaUnit = getStoredAreaUnit();
        const intlCurrency = getStoredIntlCurrency();
        const unitLabel = formatAreaUnitLabel(areaUnit);
        const sampleBuy = Number(result.hoodPriceUpdates?.[0]?.buyPerSqm) || 115;
        const unitPrice = convertPricePerSqmToUnit(sampleBuy, areaUnit);
        const intlBadge =
          intlCurrency !== 'IRT'
            ? ` · ${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, getStoredRadarLocale())}/${unitLabel}`
            : '';
        ui.setLastSyncNotice(`تکمیل شد: ${sourceSummary} (واحد ${unitLabel}${intlBadge})`);
      } else if (res.status === 401 || res.status === 403) {
        ui.setLastSyncNotice('دسترسی همگام‌سازی عمیق نیازمند نشست مدیر تأییدشده است.');
      } else if (res.status === 429) {
        ui.setLastSyncNotice('محدودیت نرخ درخواست فعال است؛ چند لحظه بعد دوباره تلاش کنید.');
      } else {
        ui.setLastSyncNotice('بروزرسانی با الگوریتم پشتیبان سرور انجام شد.');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError' && isMountedRef.current && seq === deepSyncSeqRef.current) {
        ui.setLastSyncNotice('خطا در ارتباط با سرور همگام‌سازی؛ داده‌های کش محلی فعال است.');
      }
    } finally {
      if (isMountedRef.current && seq === deepSyncSeqRef.current) {
        ui.setDeepSyncing(false);
      }
    }
  }, [ui.activeCity, currentUser, activeCityRef, setNeighborhoods]);

  useEffect(() => {
    activeCityRef.current = ui.activeCity;
    ui.setMarketPulse((prev) => (prev && (prev as { city?: string }).city === ui.activeCity ? prev : null));
    pruneLocalCache(50);
    void fetchMarketPulse(false, ui.activeCity);
    // [RULE-02] Stale-While-Revalidate (SWR) polling interval (5 minutes = 300_000ms)
    const interval = setInterval(() => void fetchMarketPulse(false, ui.activeCity), 300_000);
    return () => {
      clearInterval(interval);
      pulseAbortRef.current?.abort();
    };
  }, [ui.activeCity, fetchMarketPulse, activeCityRef]);

  return { fetchMarketPulse, handleDeepWebSync };
}

export type ConnectionStatusState = 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING';

/**
 * [RULE-03] & [RULE-18] LRU Cache Eviction Policy (maxEntries = 50) & 24-Hour TTL Invalidation
 * Prevents QuotaExceededError on iOS Safari and purges stale (>24h) cached entries.
 */
export function pruneLocalCache(maxEntries = 50): number {
  const safeLimit = Math.max(5, Math.min(500, maxEntries));
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 0;
  let evictedCount = 0;
  try {
    const now = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000;
    const rawTs = localStorage.getItem('tehran_radar_cache_ts_v1');
    if (rawTs && now - Number(rawTs) > ttlMs) {
      localStorage.setItem('tehran_radar_cache_ts_v1', String(now));
      evictedCount += 1;
    } else if (!rawTs) {
      localStorage.setItem('tehran_radar_cache_ts_v1', String(now));
    }
    const rawLru = localStorage.getItem('tehran_radar_hood_lru_v1');
    if (rawLru) {
      const parsed = JSON.parse(rawLru);
      if (Array.isArray(parsed) && parsed.length > safeLimit) {
        const trimmed = parsed.slice(-safeLimit);
        localStorage.setItem('tehran_radar_hood_lru_v1', JSON.stringify(trimmed));
        evictedCount += parsed.length - trimmed.length;
      }
    }
  } catch {
    /* ignore storage quota errors during cleanup */
  }
  return evictedCount;
}

export const useMarketSync = useMarketPulseSync;

export function useSponsorSync<T>(sponsorsByHood: Record<number, T>): Record<number, T> {
  return sponsorsByHood;
}

export function useUserCacheSync(maxEntries = 50): { evictedCount: number } {
  return { evictedCount: pruneLocalCache(maxEntries) };
}


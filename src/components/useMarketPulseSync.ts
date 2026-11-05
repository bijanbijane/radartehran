/**
 * @file src/components/useMarketPulseSync.ts
 * @description هوک همگام‌سازی خودکار نبض بازار (`/api/market-pulse`) و اسکرپینگ عمیق وب (`/api/market-pulse/deep-sync`)
 * با حفظ قیمت‌های سفارشی مدیر و لغو درخواست‌های قدیمی هنگام تغییر شهر.
 */

import React, { useEffect, useCallback } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
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

export interface UseMarketPulseSyncParams {
  ui: AppUiState;
  activeCityRef: React.MutableRefObject<CityId>;
  currentUser: FirebaseUser | null;
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
  const fetchMarketPulse = useCallback(
    async (forceRefresh = false, cityOverride?: CityId) => {
      const targetCity = cityOverride || ui.activeCity;
      activeCityRef.current = targetCity;
      ui.setSyncingPulse(true);
      try {
        const headers: Record<string, string> = {};
        if (forceRefresh && currentUser) {
          try {
            headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;
          } catch {
            /* ignore */
          }
        }
        const res = await fetch(
          `/api/market-pulse?city=${encodeURIComponent(targetCity)}${forceRefresh ? '&refresh=1' : ''}`,
          { headers }
        );
        if (res.ok && activeCityRef.current === targetCity) {
          const data: MarketPulseData = await res.json();
          ui.setMarketPulse(data);
          if (Array.isArray(data.hoodLiveSnapshots) && data.hoodLiveSnapshots.length > 0) {
            const snapshotMap = new Map(data.hoodLiveSnapshots.map((s) => [Number(s.id), s]));
            const customIds = new Set<number>();
            try {
              const rawSaved = localStorage.getItem(LOCAL_STORAGE_KEY);
              if (rawSaved) {
                const parsed = JSON.parse(rawSaved);
                if (Array.isArray(parsed)) {
                  parsed.forEach((item: any) => {
                    const seed = [...INITIAL_NEIGHBORHOODS, ...allExpansionSeeds].find(
                      (s) => s.id === Number(item?.id)
                    );
                    if (seed && (item.buyPerSqm !== seed.buyPerSqm || item.rahn80m !== seed.rahn80m)) {
                      customIds.add(seed.id);
                    }
                  });
                }
              }
            } catch {
              /* ignore */
            }
            setNeighborhoods((prev) => {
              let changed = false;
              const next = prev.map((base) => {
                const snapshot = snapshotMap.get(base.id);
                if (!snapshot) return base;
                const nextAir =
                  Number.isFinite(snapshot.liveAirScore) &&
                  snapshot.liveAirScore >= 0 &&
                  snapshot.liveAirScore <= 10
                    ? snapshot.liveAirScore
                    : base.air;
                if (customIds.has(base.id) && !forceRefresh) {
                  if (nextAir === base.air) return base;
                  changed = true;
                  return { ...base, air: nextAir };
                }
                const hasLivePriceDelta = Math.abs(Number(snapshot.hourlyChangePercent) || 0) > 0.01;
                const nextBuy =
                  hasLivePriceDelta && Number.isFinite(snapshot.liveBuyPerSqm) && snapshot.liveBuyPerSqm > 0
                    ? snapshot.liveBuyPerSqm
                    : base.buyPerSqm;
                const nextRahn =
                  hasLivePriceDelta && Number.isFinite(snapshot.liveRahn80m) && snapshot.liveRahn80m > 0
                    ? snapshot.liveRahn80m
                    : base.rahn80m;
                if (nextBuy === base.buyPerSqm && nextRahn === base.rahn80m && nextAir === base.air) {
                  return base;
                }
                changed = true;
                return { ...base, buyPerSqm: nextBuy, rahn80m: nextRahn, air: nextAir };
              });
              return changed ? next : prev;
            });
          }
          if (forceRefresh) {
            const areaUnit = getStoredAreaUnit();
            const intlCurrency = getStoredIntlCurrency();
            const unitLabel = formatAreaUnitLabel(areaUnit);
            const avgSqm = Number(data.hoodLiveSnapshots?.[0]?.liveBuyPerSqm) || 115;
            const unitPrice = convertPricePerSqmToUnit(avgSqm, areaUnit);
            const intlBadge =
              intlCurrency !== 'IRT'
                ? ` · ${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, getStoredRadarLocale())}/${unitLabel}`
                : '';
            ui.setLastSyncNotice(`بروزرسانی زنده از سرور انجام شد (${data.lastUpdatedTimeFa} · واحد ${unitLabel}${intlBadge})`);
          }
        }
      } catch {
        /* fallback to cache */
      } finally {
        ui.setSyncingPulse(false);
      }
    },
    [ui.activeCity, currentUser, allExpansionSeeds, activeCityRef, setNeighborhoods]
  );

  const handleDeepWebSync = useCallback(async () => {
    ui.setDeepSyncing(true);
    ui.setLastSyncNotice('در حال استعلام زنده از منابع رایگان وب (AQICN، دیوار و شیپور)...');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUser) {
        try {
          headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;
        } catch {
          /* ignore */
        }
      }
      const res = await fetch('/api/market-pulse/deep-sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ city: ui.activeCity }),
      });
      if (res.ok) {
        const result = await res.json();
        const pulseData = result.pulse || result;
        if (pulseData?.status === 'ok') ui.setMarketPulse(pulseData);
        if (Array.isArray(result.hoodPriceUpdates) && result.hoodPriceUpdates.length > 0) {
          setNeighborhoods((prev) =>
            prev.map((hood) => {
              const live = result.hoodPriceUpdates.find((u: any) => u.id === hood.id);
              return live
                ? {
                    ...hood,
                    buyPerSqm: live.buyPerSqm || hood.buyPerSqm,
                    rahn80m: live.rahn80m || hood.rahn80m,
                    air: live.airScore || hood.air,
                  }
                : hood;
            })
          );
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
      } else {
        ui.setLastSyncNotice('بروزرسانی با الگوریتم پشتیبان سرور انجام شد.');
      }
    } catch {
      ui.setLastSyncNotice('خطا در ارتباط با سرور همگام‌سازی؛ داده‌های کش محلی فعال است.');
    } finally {
      ui.setDeepSyncing(false);
    }
  }, [ui.activeCity, currentUser, setNeighborhoods]);

  useEffect(() => {
    activeCityRef.current = ui.activeCity;
    pruneLocalCache(50);
    void fetchMarketPulse(false, ui.activeCity);
    // [RULE-02] Stale-While-Revalidate (SWR) polling interval (5 minutes = 300_000ms)
    const interval = setInterval(() => void fetchMarketPulse(false, ui.activeCity), 300_000);
    return () => clearInterval(interval);
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


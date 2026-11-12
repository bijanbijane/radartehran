/**
 * @file src/utils/nationalNetworkResilienceCache.ts
 * @description National Network Resilience & Offline Fallback Cache for Tehran Radar.
 * Ensures the application functions autonomously under network partitions, censorship, or cloud API timeouts.
 * OP-DEC-001: formatMillionTomanAsIntlCurrency
 */

const RESILIENCE_CACHE_PREFIX = 'radar_resilience_v1_';

export interface ResilientDossierRecord {
  hoodId: number;
  hoodName: string;
  cachedAtIso: string;
  dealPricePerSqm: number;
  askingPricePerSqm: number;
  verdictTitleFa: string;
  deedDiscountPct?: number;
  liquidityDays?: number;
}

export function saveDossierToResilienceCache(dossier: ResilientDossierRecord): void {
  try {
    const key = `${RESILIENCE_CACHE_PREFIX}hood_${dossier.hoodId}`;
    localStorage.setItem(key, JSON.stringify(dossier));
  } catch {
    // Ignore quota errors in restricted browser contexts
  }
}

export function loadDossierFromResilienceCache(hoodId: number): ResilientDossierRecord | null {
  try {
    const key = `${RESILIENCE_CACHE_PREFIX}hood_${hoodId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ResilientDossierRecord;
  } catch {
    return null;
  }
}

export function getResilienceCacheStats(): { cachedHoodsCount: number; isOfflineCapable: boolean } {
  try {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RESILIENCE_CACHE_PREFIX)) count++;
    }
    return { cachedHoodsCount: count, isOfflineCapable: count > 0 || navigator.onLine === false };
  } catch {
    return { cachedHoodsCount: 0, isOfflineCapable: false };
  }
}

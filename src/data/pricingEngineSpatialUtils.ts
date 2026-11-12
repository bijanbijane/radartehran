export function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function applySpatialGrowthFallback(
  targetHood: { id: number; lat: number; lng: number; buyPerSqm: number },
  allHoods: ReadonlyArray<{ id: number; lat: number; lng: number; buyPerSqm: number; growthPct?: number }>,
): number {
  let weightedSum = 0, weightTotal = 0;
  for (const h of allHoods) {
    if (h.id === targetHood.id || typeof h.growthPct !== 'number') continue;
    const distKm = Math.hypot((targetHood.lat - h.lat) * 111, (targetHood.lng - h.lng) * 90); if (distKm > 12) continue;
    const w = 1 / Math.pow(Math.max(0.3, distKm), 2); weightedSum += h.growthPct * w; weightTotal += w;
  }
  return weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : 0;
}

import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface ListingLifecycleEvent { type: 'FIRST_PUBLISHED' | 'RENEWED' | 'EXPIRED' | 'WITHDRAWN' | 'REJECTED' | 'REPUBLISHED'; timestampMs: number; } export function calculateListingDaysOnMarket( events: ListingLifecycleEvent[], evaluationNowMs: number
) { if (!events || events.length === 0) { return { valid: false, error: 'MISSING_PUBLICATION_LIFECYCLE', currentActiveDays: 0, cumulativePublishedDays: 0, renewalCount: 0, currentStatus: 'unobserved' as const, isCompletedSaleConfirmed: false as const, }; } const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs); if (sorted[0].timestampMs > evaluationNowMs) { return { valid: false, error: 'FUTURE_LIFECYCLE_TIMESTAMP', currentActiveDays: 0, cumulativePublishedDays: 0, renewalCount: 0, currentStatus: 'unobserved' as const, isCompletedSaleConfirmed: false as const, }; } let activeSinceMs: number | null = null; let cumulativeMs = 0; let renewalCount = 0; let currentStatus: 'active' | 'expired' | 'withdrawn' | 'rejected' | 'unobserved' = 'unobserved';
  for (const ev of sorted) { if (ev.timestampMs > evaluationNowMs) break; if (ev.type === 'FIRST_PUBLISHED' || ev.type === 'REPUBLISHED') { if (activeSinceMs === null) activeSinceMs = ev.timestampMs; currentStatus = 'active'; } else if (ev.type === 'RENEWED') { renewalCount++; if (activeSinceMs === null) activeSinceMs = ev.timestampMs; currentStatus = 'active';
    } else { if (activeSinceMs !== null && ev.timestampMs >= activeSinceMs) { cumulativeMs += ev.timestampMs - activeSinceMs; activeSinceMs = null; }
      currentStatus = ev.type === 'EXPIRED' ? 'expired' : ev.type === 'WITHDRAWN' ? 'withdrawn' : 'rejected'; } }
  let currentActiveMs = 0; if (activeSinceMs !== null && evaluationNowMs >= activeSinceMs) { currentActiveMs = evaluationNowMs - activeSinceMs; cumulativeMs += currentActiveMs; }
  const msPerDay = 86_400_000; return { valid: true, currentActiveDays: Number((currentActiveMs / msPerDay).toFixed(2)), cumulativePublishedDays: Number((cumulativeMs / msPerDay).toFixed(2)), renewalCount, currentStatus, isCompletedSaleConfirmed: false as const, };
}
export interface PriceRevisionObservation { revisionId: string; timestampMs: number; dealMode: 'buy' | 'rent';
  currency: 'TOMAN'; askingPriceToman: number; }
export function analyzeListingPriceRevisionHistory(revisions: PriceRevisionObservation[]) { if (!revisions || revisions.length === 0) { return { status: 'empty' as const, originalAskingPriceToman: null, latestAskingPriceToman: null,
      cumulativeAbsoluteChangeToman: 0, cumulativePercentChange: null, revisionCount: 0, meanDaysBetweenRevisions: null, priceRangeSpanToman: 0, latestDirection: 'none' as const, events: [], }; }
  const sorted = [...revisions].sort((a, b) => a.timestampMs - b.timestampMs); const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) {
    return {
      status: 'single_observation' as const, originalAskingPriceToman: first.askingPriceToman,
      latestAskingPriceToman: first.askingPriceToman, cumulativeAbsoluteChangeToman: 0,
      cumulativePercentChange: 0, revisionCount: 0, meanDaysBetweenRevisions: null,
      priceRangeSpanToman: 0, latestDirection: 'none' as const, events: [],
    };
  }
  const events: Array<{
    fromRevisionId: string;
    toRevisionId: string;
    classification: 'price_increase' | 'price_decrease' | 'no_monetary_change' | 'transaction_mode_change' | 'invalid_baseline';
    deltaToman: number;
    deltaPercent: number | null;
  }> = [];
  let hasModeChange = false;
  let totalIntervalMs = 0;
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const r of sorted) {
    if (r.askingPriceToman > 0) {
      if (r.askingPriceToman < minPrice) minPrice = r.askingPriceToman;
      if (r.askingPriceToman > maxPrice) maxPrice = r.askingPriceToman;
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    totalIntervalMs += Math.max(0, curr.timestampMs - prev.timestampMs);
    if (prev.dealMode !== curr.dealMode || prev.currency !== curr.currency) {
      hasModeChange = true;
      events.push({ fromRevisionId: prev.revisionId, toRevisionId: curr.revisionId, classification: 'transaction_mode_change', deltaToman: 0, deltaPercent: null });
      continue;
    }
    if (prev.askingPriceToman <= 0 || curr.askingPriceToman <= 0) {
      events.push({ fromRevisionId: prev.revisionId, toRevisionId: curr.revisionId, classification: 'invalid_baseline', deltaToman: 0, deltaPercent: null });
      continue;
    }
    const delta = curr.askingPriceToman - prev.askingPriceToman;
    const pct = Number(((delta / prev.askingPriceToman) * 100).toFixed(2));
    events.push({
      fromRevisionId: prev.revisionId, toRevisionId: curr.revisionId,
      classification: delta > 0 ? 'price_increase' : delta < 0 ? 'price_decrease' : 'no_monetary_change',
      deltaToman: delta, deltaPercent: pct,
    });
  }
  const cumDelta = !hasModeChange ? last.askingPriceToman - first.askingPriceToman : 0;
  const cumPct = !hasModeChange && first.askingPriceToman > 0
    ? Number(((cumDelta / first.askingPriceToman) * 100).toFixed(2)) : null;
  const lastEvent = events[events.length - 1];
  return {
    status: hasModeChange ? ('incompatible_modes' as const) : ('sufficient' as const),
    originalAskingPriceToman: first.askingPriceToman,
    latestAskingPriceToman: last.askingPriceToman,
    cumulativeAbsoluteChangeToman: cumDelta,
    cumulativePercentChange: cumPct,
    revisionCount: sorted.length - 1,
    meanDaysBetweenRevisions: Number((totalIntervalMs / (sorted.length - 1) / 86_400_000).toFixed(2)),
    priceRangeSpanToman: Number.isFinite(minPrice) ? maxPrice - minPrice : 0,
    latestDirection: lastEvent?.classification === 'price_increase' ? ('increase' as const)
      : lastEvent?.classification === 'price_decrease' ? ('decrease' as const)
      : lastEvent?.classification === 'no_monetary_change' ? ('unchanged' as const) : ('none' as const),
    events,
  };
}
export function computeInventoryTurnoverAndSupplyFlow(params: {
  openingActiveCount: number;
  newPublicationsCount: number;
  republicationsCount: number;
  renewalsCount: number;
  expirationsCount: number;
  withdrawalsCount: number;
  administrativeRemovalsCount: number;
}) {
  const inflowCount = Math.max(0, params.newPublicationsCount) + Math.max(0, params.republicationsCount);
  const outflowCount = Math.max(0, params.expirationsCount) + Math.max(0, params.withdrawalsCount) + Math.max(0, params.administrativeRemovalsCount);
  const netInventoryChange = inflowCount - outflowCount;
  const closingActiveCount = Math.max(0, params.openingActiveCount + netInventoryChange);
  const activePool = Math.max(0, params.openingActiveCount) + inflowCount;
  return {
    inflowCount, outflowCount, netInventoryChange, closingActiveCount,
    withdrawalRatePercent: activePool > 0 ? Number(((params.withdrawalsCount / activePool) * 100).toFixed(2)) : null,
    expirationRatePercent: activePool > 0 ? Number(((params.expirationsCount / activePool) * 100).toFixed(2)) : null,
    confirmedSalesTurnoverRate: null,
  };
}
export function calculateMarketPriceIndices(
  params: { indexId: string; methodologyVersion: string; basePeriodLabel: string; basePeriodValuePerSqm: number; observations: Array<{ pricePerSqm: number; areaSqm: number; stratumKey: string }>; baseStratumWeights?: Record<string, number>; basePeriodCpi?: number; currentPeriodCpi?: number },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
) {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const eligible = params.observations.filter((o) => o.pricePerSqm > 0 && o.areaSqm > 0);
  if (eligible.length === 0 || params.basePeriodValuePerSqm <= 0) {
    return {
      valid: false, indexId: params.indexId, methodologyVersion: params.methodologyVersion,
      basePeriodLabel: params.basePeriodLabel, unweightedMeanPerSqm: 0, areaWeightedMeanPerSqm: 0,
      displayAreaUnitLabel, areaWeightedMeanPerSqmIntlText: formatMillionTomanAsIntlCurrency(0, intlCurrency),
      stratifiedConstantQualityPerSqm: null, nominalIndexBase100: 0, realInflationAdjustedIndexBase100: null,
    };
  }
  const unweightedMeanPerSqm = Math.round(eligible.reduce((s, o) => s + o.pricePerSqm, 0) / eligible.length);
  const totalArea = eligible.reduce((s, o) => s + o.areaSqm, 0);
  const areaWeightedMeanPerSqm = Math.round(eligible.reduce((s, o) => s + o.pricePerSqm * o.areaSqm, 0) / totalArea);
  let stratifiedConstantQualityPerSqm: number | null = null;
  if (params.baseStratumWeights) {
    let weightedSum = 0, weightTotal = 0;
    for (const [stratum, weight] of Object.entries(params.baseStratumWeights)) {
      if (weight <= 0) continue;
      const stratumObs = eligible.filter((o) => o.stratumKey === stratum);
      if (stratumObs.length > 0) {
        weightedSum += (stratumObs.reduce((s, o) => s + o.pricePerSqm, 0) / stratumObs.length) * weight;
        weightTotal += weight;
      }
    }
    if (weightTotal > 0) stratifiedConstantQualityPerSqm = Math.round(weightedSum / weightTotal);
  }
  const referenceCurrent = stratifiedConstantQualityPerSqm ?? areaWeightedMeanPerSqm;
  const nominalIndexBase100 = Number(((referenceCurrent / params.basePeriodValuePerSqm) * 100).toFixed(2));
  const realInflationAdjustedIndexBase100 =
    params.basePeriodCpi && params.currentPeriodCpi && params.basePeriodCpi > 0 && params.currentPeriodCpi > 0
      ? Number((nominalIndexBase100 * (params.basePeriodCpi / params.currentPeriodCpi)).toFixed(2))
      : null;
  return {
    valid: true, indexId: params.indexId, methodologyVersion: params.methodologyVersion,
    basePeriodLabel: params.basePeriodLabel, unweightedMeanPerSqm, areaWeightedMeanPerSqm,
    displayAreaUnitLabel, areaWeightedMeanPerSqmIntlText: formatMillionTomanAsIntlCurrency(areaWeightedMeanPerSqm / 1_000_000, intlCurrency),
    stratifiedConstantQualityPerSqm, nominalIndexBase100, realInflationAdjustedIndexBase100,
  };
}
export function calculatePriceDistributionAndRentalBenchmarks(
  buyPricesPerSqm: number[],
  rentalListings: Array<{ depositToman: number; monthlyRentToman: number; areaSqm: number }>
) {
  const validBuy = buyPricesPerSqm.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const pct = (arr: number[], q: number): number | null => {
    if (arr.length === 0) return null;
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return Math.round(arr[base] + rest * ((arr[base + 1] ?? arr[base]) - arr[base]));
  };
  const sufficient = validBuy.length >= 5;
  const p25 = sufficient ? pct(validBuy, 0.25) : null;
  const p75 = sufficient ? pct(validBuy, 0.75) : null;
  const fullDeposit = rentalListings.filter((r) => r.depositToman > 0 && r.monthlyRentToman === 0);
  const hybrid = rentalListings.filter((r) => r.depositToman >= 0 && r.monthlyRentToman > 0);
  return {
    distribution: {
      sampleCount: validBuy.length, sufficient, min: validBuy[0] ?? null,
      p10: sufficient ? pct(validBuy, 0.1) : null, p25,
      median: validBuy.length > 0 ? pct(validBuy, 0.5) : null, p75,
      p90: sufficient ? pct(validBuy, 0.9) : null, max: validBuy[validBuy.length - 1] ?? null,
      iqr: p25 !== null && p75 !== null ? p75 - p25 : null,
    },
    rentalBenchmarks: {
      fullDepositSampleCount: fullDeposit.length,
      depositPlusRentSampleCount: hybrid.length,
      medianFullDepositToman: pct(fullDeposit.map((r) => r.depositToman).sort((a, b) => a - b), 0.5),
      medianHybridDepositToman: pct(hybrid.map((r) => r.depositToman).sort((a, b) => a - b), 0.5),
      medianHybridMonthlyRentToman: pct(hybrid.map((r) => r.monthlyRentToman).sort((a, b) => a - b), 0.5),
    },
  };
}
export function computeKaplanMeierListingSurvival(
  observations: Array<{ durationDays: number; eventObserved: boolean }>
) {
  const valid = observations
    .filter((o) => Number.isFinite(o.durationDays) && o.durationDays >= 0)
    .sort((a, b) => a.durationDays - b.durationDays);
  if (valid.length === 0) return [];
  const uniqueDays = Array.from(new Set(valid.map((o) => o.durationDays))).sort((a, b) => a - b);
  let atRisk = valid.length;
  let survivalProb = 1.0;
  return uniqueDays.map((day) => {
    const atDay = valid.filter((o) => o.durationDays === day);
    const events = atDay.filter((o) => o.eventObserved).length;
    const censored = atDay.length - events;
    if (atRisk > 0 && events > 0) survivalProb *= 1 - events / atRisk;
    const row = {
      day, atRiskCount: atRisk, eventCount: events, censoredCount: censored,
      survivalProbability: Number(survivalProb.toFixed(4)),
    };
    atRisk -= atDay.length;
    return row;
  });
}
export interface GeoLatLng {
  lat: number;
  lng: number;
}
export function validateAndMeasureSearchPolygon(vertices: GeoLatLng[]) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    return { valid: false, error: 'MIN_3_VERTICES_REQUIRED', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
  }
  if (vertices.length > 250) {
    return { valid: false, error: 'MAX_VERTEX_COMPLEXITY_EXCEEDED', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
  }
  const ring: GeoLatLng[] = [];
  for (const v of vertices) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || v.lat < -90 || v.lat > 90 || v.lng < -180 || v.lng > 180) {
      return { valid: false, error: 'OUT_OF_RANGE_COORDINATES', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
    }
    const prev = ring[ring.length - 1];
    if (!prev || prev.lat !== v.lat || prev.lng !== v.lng) ring.push(v);
  }
  if (ring.length > 2 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng) {
    ring.pop();
  }
  if (ring.length < 3) {
    return { valid: false, error: 'DEGENERATE_POLYGON_RING', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
  }
  const orient = (p: GeoLatLng, q: GeoLatLng, r: GeoLatLng) =>
    (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const segsIntersect = (a1: GeoLatLng, a2: GeoLatLng, b1: GeoLatLng, b2: GeoLatLng) =>
    orient(a1, a2, b1) * orient(a1, a2, b2) < 0 && orient(b1, b2, a1) * orient(b1, b2, a2) < 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsIntersect(a1, a2, ring[j], ring[(j + 1) % n])) {
        return { valid: false, error: 'SELF_INTERSECTING_POLYGON', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
      }
    }
  }
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  let perimeterMeters = 0, shoelaceSqMeters = 0;
  const earthRadiusM = 6_371_008.8;
  const meanLatRad = (ring.reduce((s, p) => s + p.lat, 0) / n) * (Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    if (p1.lat < south) south = p1.lat;
    if (p1.lat > north) north = p1.lat;
    if (p1.lng < west) west = p1.lng;
    if (p1.lng > east) east = p1.lng;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    perimeterMeters += 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const x1 = ((p1.lng * Math.PI) / 180) * earthRadiusM * Math.cos(meanLatRad);
    const y1 = ((p1.lat * Math.PI) / 180) * earthRadiusM;
    const x2 = ((p2.lng * Math.PI) / 180) * earthRadiusM * Math.cos(meanLatRad);
    const y2 = ((p2.lat * Math.PI) / 180) * earthRadiusM;
    shoelaceSqMeters += x1 * y2 - x2 * y1;
  }
  const areaSqMeters = Math.abs(shoelaceSqMeters) / 2;
  if (areaSqMeters < 1) {
    return { valid: false, error: 'ZERO_AREA_POLYGON', geodesicPerimeterMeters: 0, geodesicAreaSqMeters: 0 };
  }
  return {
    valid: true, bbox: { south, north, west, east },
    geodesicPerimeterMeters: Math.round(perimeterMeters),
    geodesicAreaSqMeters: Math.round(areaSqMeters),
  };
}
export function filterPropertiesInsidePolygon<T extends { id: string; lat: number; lng: number }>(
  candidates: T[],
  polygonVertices: GeoLatLng[]
) {
  const check = validateAndMeasureSearchPolygon(polygonVertices);
  if (!check.valid || !check.bbox) {
    return { validPolygon: false, bboxCandidateCount: 0, matchedProperties: [] as T[] };
  }
  const { south, north, west, east } = check.bbox;
  const prefiltered = candidates.filter((c) => c.lat >= south && c.lat <= north && c.lng >= west && c.lng <= east);
  const insideRayCast = (pt: GeoLatLng, ring: GeoLatLng[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng, yi = ring[i].lat, xj = ring[j].lng, yj = ring[j].lat;
      const intersect = yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-15) + xi; if (intersect) inside = !inside; } return inside; }; return { validPolygon: true, bboxCandidateCount: prefiltered.length, matchedProperties: prefiltered.filter((c) => insideRayCast(c, polygonVertices)), }; }
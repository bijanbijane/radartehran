import { useMemo } from 'react'; import { BargainListing, calcDistanceKm, EvaluatedNeighborhood, getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, Neighborhood, NeighborhoodSponsor, ResidentVoteDoc, WorkHub, } from '../data/neighborhoods';
import { getTrafficZoneStatus } from '../data/neighborhoodInsights'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { matchesPersianSearch } from '../utils/security'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export type HousingStatus = 'green' | 'yellow' | 'red';
export type SuggestSortMode = 'cheapest' | 'clean_calm' | 'commute_metro' | 'undervalued' | 'score' | 'cheap' | 'commute' | 'yield'; export type SuggestPriorityMode = 'balanced' | 'metro' | 'air' | 'security';
export const EVALUATED_RECOMMENDATION_WEIGHTS_VERSION = '2026.10.v2' as const; export const EVALUATED_RECOMMENDATION_WEIGHTS = { version: EVALUATED_RECOMMENDATION_WEIGHTS_VERSION, seedVoteBaseWeight: 8, locationVerifiedVoteWeight: 2,
  unverifiedVoteWeight: 1, loanBoosterRahnMillion: 400, loanBoosterBuyMillion: 1200, deedHoldbackRatio: 0.10, priorityFactorMultiplier: 2.0, balancedOverallMultiplier: 2.0,
  distanceMaxRadiusKm: 15, distanceBonusPerKm: 0.25, defaultMissingDistanceKm: 99, statusBonus: { green: 3, yellow: 1, red: -5 },
} as const; export interface UseEvaluatedNeighborhoodsParams { activeCity: CityId; activeCitySeedList?: Neighborhood[]; neighborhoods: Neighborhood[];
  cloudBargainsByHood?: Record<number, BargainListing[]>; cloudSponsorsByHood?: Record<number, NeighborhoodSponsor>; cloudVotes: ResidentVoteDoc[];
  mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number; targetSqm: number; useLoanBooster: boolean;
  deductTenantRahnInBuy: boolean; buildingAgeSegment?: 'new' | 'mid' | 'older' | 'old'; buyAgeMultiplier?: number; rentAgeMultiplier: number;
  selectedWorkHub: WorkHub; statusFilter: 'all' | 'green' | 'yellow' | 'red'; deferredSearchQuery?: string; onlyOutsideTrafficZone: boolean;
  onlyHighMetro: boolean; suggestSortBy?: SuggestSortMode; suggestPriority?: SuggestPriorityMode;
}
export function calcOverallScore(s: { air: number; powerWater: number; internet: number; metro: number; security: number; flatTerrain: number }): number {
  return Math.round(((s.air + s.powerWater + s.internet + s.metro + s.security + s.flatTerrain) / 6) * 10) / 10;
}
export function computeVersionedPriorityScore(
  h: Pick<EvaluatedNeighborhood, 'metro' | 'air' | 'security' | 'overallScore' | 'distKm' | 'status'>,
  suggestPriority: SuggestPriorityMode = 'balanced',
): number {
  const w = EVALUATED_RECOMMENDATION_WEIGHTS;
  const base =
    suggestPriority === 'metro' ? h.metro * w.priorityFactorMultiplier + h.overallScore
    : suggestPriority === 'air' ? h.air * w.priorityFactorMultiplier + h.overallScore
    : suggestPriority === 'security' ? h.security * w.priorityFactorMultiplier + h.overallScore
    : h.overallScore * w.balancedOverallMultiplier;
  const distBonus = h.distKm !== null && Number.isFinite(h.distKm) ? Math.max(0, w.distanceMaxRadiusKm - h.distKm) * w.distanceBonusPerKm : 0;
  const statusBonus = w.statusBonus[h.status] ?? 0;
  return Number((base + distBonus + statusBonus).toFixed(4));
}
export function compareEvaluatedNeighborhoodsForSuggestion(
  a: EvaluatedNeighborhood,
  b: EvaluatedNeighborhood,
  options: { mode: 'rent' | 'buy'; suggestSortBy?: SuggestSortMode; suggestPriority?: SuggestPriorityMode },
): number {
  const { mode, suggestSortBy, suggestPriority = 'balanced' } = options;
  const EPS = 1e-9;
  let primaryDiff = 0;
  if (suggestSortBy === 'cheap' || suggestSortBy === 'cheapest') {
    primaryDiff = mode === 'rent' ? a.rahn80m - b.rahn80m : a.buyPerSqm - b.buyPerSqm;
  } else if (suggestSortBy === 'commute' || suggestSortBy === 'commute_metro') {
    const distA = a.distKm ?? EVALUATED_RECOMMENDATION_WEIGHTS.defaultMissingDistanceKm;
    const distB = b.distKm ?? EVALUATED_RECOMMENDATION_WEIGHTS.defaultMissingDistanceKm;
    primaryDiff = distA - distB;
    if (Math.abs(primaryDiff) <= EPS) primaryDiff = b.metro - a.metro;
  } else if (suggestSortBy === 'clean_calm') {
    primaryDiff = (b.air + b.security) - (a.air + a.security);
  } else if (suggestSortBy === 'yield' || suggestSortBy === 'undervalued') {
    const yieldA = a.rahn80m / Math.max(1, a.buyPerSqm * 80);
    const yieldB = b.rahn80m / Math.max(1, b.buyPerSqm * 80);
    primaryDiff = yieldB - yieldA;
  } else {
    primaryDiff = computeVersionedPriorityScore(b, suggestPriority) - computeVersionedPriorityScore(a, suggestPriority);
  }
  if (Math.abs(primaryDiff) > EPS) return primaryDiff < 0 ? -1 : 1;
  const scoreDiff = b.overallScore - a.overallScore;
  if (Math.abs(scoreDiff) > EPS) return scoreDiff < 0 ? -1 : 1;
  const priceDiff = mode === 'rent' ? a.rahn80m - b.rahn80m : a.buyPerSqm - b.buyPerSqm;
  if (Math.abs(priceDiff) > EPS) return priceDiff < 0 ? -1 : 1;
  return a.id - b.id;
}
export function useEvaluatedNeighborhoods(params: UseEvaluatedNeighborhoodsParams) {
  const {
    activeCity, activeCitySeedList, neighborhoods,
    cloudBargainsByHood = {}, cloudSponsorsByHood = {}, cloudVotes,
    mode, deposit, monthlyRent, buyTotalBudget, targetSqm, useLoanBooster,
    deductTenantRahnInBuy, buildingAgeSegment, buyAgeMultiplier: explicitBuyAgeMult,
    rentAgeMultiplier, selectedWorkHub, statusFilter, deferredSearchQuery = '',
    onlyOutsideTrafficZone, onlyHighMetro, suggestSortBy, suggestPriority = 'balanced',
  } = params;
  const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale();
  const buyAgeMultiplier = explicitBuyAgeMult ?? (buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.88 : 0.76);
  const activeCityNeighborhoods = useMemo(() => {
    if (activeCity === 'tehran' && !activeCitySeedList) return neighborhoods.filter((n) => n.id < 100 || (n.id >= 500 && n.id <= 599));
    const seedList = activeCitySeedList || MULTI_CITY_CONFIGS[activeCity].neighborhoods;
    return seedList.map((seed) => {
      const base = neighborhoods.find((n) => n.id === seed.id) || seed;
      const cloudList = cloudBargainsByHood[base.id] || [];
      const mergedBargains = [...cloudList, ...(base.bargains || []).filter((b) => !cloudList.some((cb) => cb.id === b.id))];
      return { ...base, bargains: mergedBargains, sponsor: cloudSponsorsByHood[base.id] || base.sponsor };
    });
  }, [activeCity, activeCitySeedList, neighborhoods, cloudBargainsByHood, cloudSponsorsByHood]);
  const totalRahnEquivalent = useMemo(() => {
    const base = deposit + Math.round((monthlyRent * 100) / 3);
    return useLoanBooster ? base + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterRahnMillion : base;
  }, [deposit, monthlyRent, useLoanBooster]);
  const maxAffordablePerSqm = useMemo(() => {
    const safeSqm = Math.max(25, Number(targetSqm) || 75);
    const effectiveBuy = useLoanBooster ? buyTotalBudget + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterBuyMillion : buyTotalBudget;
    return Math.round(effectiveBuy / safeSqm);
  }, [buyTotalBudget, targetSqm, useLoanBooster]);
  const maxAffordablePerUnit = convertPricePerSqmToUnit(maxAffordablePerSqm, areaUnit);
  const maxAffordableIntlText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(maxAffordablePerUnit, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)}` : '';
  const extraGreenWithLoan = useMemo(() => {
    const safeSqm = Math.max(25, Number(targetSqm) || 75);
    const scaleFactor = safeSqm / 80;
    const baseRahn = deposit + Math.round((monthlyRent * 100) / 3);
    const boostedRahn = baseRahn + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterRahnMillion;
    let extra = 0;
    for (const n of activeCityNeighborhoods) {
      const effectiveBuySqm = Math.max(15, Math.round(n.buyPerSqm * buyAgeMultiplier));
      const scaledRahn = Math.max(50, Math.round(n.rahn80m * scaleFactor * rentAgeMultiplier));
      const totalUnitPriceNoLoan = effectiveBuySqm * safeSqm;
      const deedHoldback = Math.round(totalUnitPriceNoLoan * EVALUATED_RECOMMENDATION_WEIGHTS.deedHoldbackRatio);
      const netRequiredCash = deductTenantRahnInBuy ? Math.max(500, totalUnitPriceNoLoan - scaledRahn - deedHoldback) : totalUnitPriceNoLoan;
      const isGreenWithout = mode === 'rent' ? scaledRahn <= baseRahn : netRequiredCash <= buyTotalBudget;
      const isGreenWith = mode === 'rent' ? scaledRahn <= boostedRahn : netRequiredCash <= buyTotalBudget + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterBuyMillion;
      if (!isGreenWithout && isGreenWith) extra++;
    }
    return extra;
  }, [activeCityNeighborhoods, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, buyAgeMultiplier, rentAgeMultiplier, deductTenantRahnInBuy]);
  const evaluateList = useMemo(() => {
    const safeSqm = Math.max(25, Number(targetSqm) || 75);
    const scaleFactor = safeSqm / 80;
    const effectiveTotalBuyBudget = useLoanBooster
      ? buyTotalBudget + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterBuyMillion
      : buyTotalBudget;
    return (list: Neighborhood[]): EvaluatedNeighborhood[] =>
      list.map((n) => {
        const hoodVotes = cloudVotes.filter((v) => v.hoodId === n.id);
        let { air, powerWater, internet, metro, security, flatTerrain } = n;
        let votesCount = n.votesCount || 12;
        if (hoodVotes.length > 0) {
          let totalW = EVALUATED_RECOMMENDATION_WEIGHTS.seedVoteBaseWeight;
          let sumAir = n.air * totalW, sumPower = n.powerWater * totalW, sumNet = n.internet * totalW;
          let sumMetro = n.metro * totalW, sumSec = n.security * totalW, sumFlat = n.flatTerrain * totalW;
          for (const v of hoodVotes) {
            const w = v.locationVerified
              ? EVALUATED_RECOMMENDATION_WEIGHTS.locationVerifiedVoteWeight
              : EVALUATED_RECOMMENDATION_WEIGHTS.unverifiedVoteWeight;
            totalW += w;
            sumAir += v.air * w; sumPower += v.powerWater * w; sumNet += v.internet * w;
            sumMetro += v.metro * w; sumSec += v.security * w; sumFlat += v.flatTerrain * w;
          }
          air = Math.round((sumAir / totalW) * 10) / 10;
          powerWater = Math.round((sumPower / totalW) * 10) / 10;
          internet = Math.round((sumNet / totalW) * 10) / 10;
          metro = Math.round((sumMetro / totalW) * 10) / 10;
          security = Math.round((sumSec / totalW) * 10) / 10;
          flatTerrain = Math.round((sumFlat / totalW) * 10) / 10;
          votesCount = (n.votesCount || 12) + hoodVotes.length;
        }
        const overallScore = calcOverallScore({ air, powerWater, internet, metro, security, flatTerrain });
        const effectiveBuyPerSqm = Math.max(15, Math.round(n.buyPerSqm * buyAgeMultiplier));
        const scaledRahnTarget = Math.max(50, Math.round(n.rahn80m * scaleFactor * rentAgeMultiplier));
        const totalUnitBuyPrice = effectiveBuyPerSqm * safeSqm;
        const deedHoldback = Math.round(totalUnitBuyPrice * EVALUATED_RECOMMENDATION_WEIGHTS.deedHoldbackRatio);
        const netRequiredBuyCash = deductTenantRahnInBuy ? Math.max(500, totalUnitBuyPrice - scaledRahnTarget - deedHoldback) : totalUnitBuyPrice;
        const ratio = mode === 'rent'
          ? scaledRahnTarget / Math.max(1, totalRahnEquivalent)
          : netRequiredBuyCash / Math.max(1, effectiveTotalBuyBudget);
        const status: HousingStatus = ratio <= 1.0 ? 'green' : ratio <= 1.15 ? 'yellow' : 'red';
        const diffPercent = Math.round((ratio - 1) * 100);
        const distKm = selectedWorkHub.lat ? calcDistanceKm(n.lat, n.lng, selectedWorkHub.lat, selectedWorkHub.lng) : null;
        const cloudList = cloudBargainsByHood[n.id] || [];
        const mergedBargains = [...cloudList, ...(n.bargains || []).filter((b) => !cloudList.some((cb) => cb.id === b.id))];
        return {
          ...n,
          baseBuyPerSqm: n.buyPerSqm,
          buyPerSqm: effectiveBuyPerSqm,
          air, powerWater, internet, metro, security, flatTerrain, votesCount,
          bargains: mergedBargains,
          sponsor: cloudSponsorsByHood[n.id] || n.sponsor,
          overallScore, status, diffPercent, distKm,
          marketReport: getNeighborhoodMarketReport(n),
          trafficInfo: getNeighborhoodTrafficInfo(n),
        };
      });
  }, [
    cloudVotes, cloudBargainsByHood, cloudSponsorsByHood,
    mode, totalRahnEquivalent, buyTotalBudget, useLoanBooster, selectedWorkHub,
    targetSqm, buyAgeMultiplier, rentAgeMultiplier, deductTenantRahnInBuy,
  ]);
  const evaluatedNeighborhoods = useMemo<EvaluatedNeighborhood[]>(
    () => evaluateList(activeCityNeighborhoods),
    [evaluateList, activeCityNeighborhoods]
  );
  const nationwideEvaluatedNeighborhoods = useMemo<EvaluatedNeighborhood[]>(
    () => evaluateList(neighborhoods),
    [evaluateList, neighborhoods]
  );
  const filteredNeighborhoods = useMemo(() => {
    const q = deferredSearchQuery.trim();
    return evaluatedNeighborhoods.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (q && !matchesPersianSearch(n.name, q) && !matchesPersianSearch(n.zone, q) && !matchesPersianSearch(n.pros, q) && !(n.bargains?.[0]?.street && matchesPersianSearch(n.bargains[0].street, q))) return false;
      if (onlyOutsideTrafficZone && activeCity === 'tehran' && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
      if (onlyHighMetro && n.metro < 8) return false;
      return true;
    });
  }, [evaluatedNeighborhoods, statusFilter, deferredSearchQuery, onlyOutsideTrafficZone, onlyHighMetro, activeCity]);
  const nationwideFilteredNeighborhoods = useMemo(() => {
    const q = deferredSearchQuery.trim();
    return nationwideEvaluatedNeighborhoods.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (q && !matchesPersianSearch(n.name, q) && !matchesPersianSearch(n.zone, q) && !matchesPersianSearch(n.pros, q) && !(n.bargains?.[0]?.street && matchesPersianSearch(n.bargains[0].street, q))) return false;
      if (onlyOutsideTrafficZone && (n.id < 100 || (n.id >= 500 && n.id <= 599)) && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
      if (onlyHighMetro && n.metro < 8) return false;
      return true;
    });
  }, [nationwideEvaluatedNeighborhoods, statusFilter, deferredSearchQuery, onlyOutsideTrafficZone, onlyHighMetro]);
  const lifestylePool = useMemo(() => {
    return evaluatedNeighborhoods.filter((n) => {
      if (onlyOutsideTrafficZone && activeCity === 'tehran' && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
      if (onlyHighMetro && n.metro < 8) return false;
      return true;
    });
  }, [evaluatedNeighborhoods, onlyOutsideTrafficZone, onlyHighMetro, activeCity]);
  const counts = useMemo(() => ({
    green: lifestylePool.filter((n) => n.status === 'green').length,
    yellow: lifestylePool.filter((n) => n.status === 'yellow').length,
    red: lifestylePool.filter((n) => n.status === 'red').length,
  }), [lifestylePool]);
  const smartSuggestedNeighborhoods = useMemo(() => {
    const seenIds = new Set<number>();
    const dedupedPool = lifestylePool.filter((n) => {
      if (seenIds.has(n.id)) return false;
      seenIds.add(n.id);
      return true;
    });
    const affordable = dedupedPool.filter((n) => n.status === 'green' || n.status === 'yellow');
    const pool = affordable.length >= 3 ? affordable : dedupedPool;
    return [...pool]
      .sort((a, b) =>
        compareEvaluatedNeighborhoodsForSuggestion(a, b, {
          mode,
          suggestSortBy,
          suggestPriority,
        }),
      )
      .slice(0, 3);
  }, [lifestylePool, suggestSortBy, suggestPriority, mode]);
  return {
    rankingWeightsVersion: EVALUATED_RECOMMENDATION_WEIGHTS_VERSION,
    totalRahnEquivalent, maxAffordablePerSqm, maxAffordablePerUnit, maxAffordableIntlText, extraGreenWithLoan,
    evaluatedNeighborhoods, filteredNeighborhoods,
    nationwideEvaluatedNeighborhoods, nationwideFilteredNeighborhoods,
    counts, smartSuggestedNeighborhoods,
  };
}
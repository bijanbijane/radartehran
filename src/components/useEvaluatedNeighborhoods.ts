import { useMemo } from 'react'; import { BargainListing, calcDistanceKm, EvaluatedNeighborhood, getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, Neighborhood, NeighborhoodSponsor, ResidentVoteDoc, WorkHub, } from '../data/neighborhoods';
import { getTrafficZoneStatus } from '../data/neighborhoodInsights'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { matchesPersianSearch } from '../utils/security'; import { createExecutionTimer } from '../utils/diagnostics'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export type HousingStatus = 'green' | 'yellow' | 'red';
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
  const dealA = a.marketReport?.estimatedDealPricePerSqm ?? (Array.isArray(a.bargains) && a.bargains.length > 0 ? aggregateNeighborhoodMarketMetrics(a.id, a.name, a.buyPerSqm, buildNeighborhoodListingSamples(a)).estimatedDealPricePerSqm : a.buyPerSqm);
  const dealB = b.marketReport?.estimatedDealPricePerSqm ?? (Array.isArray(b.bargains) && b.bargains.length > 0 ? aggregateNeighborhoodMarketMetrics(b.id, b.name, b.buyPerSqm, buildNeighborhoodListingSamples(b)).estimatedDealPricePerSqm : b.buyPerSqm);
  let primaryDiff = 0;
  if (suggestSortBy === 'cheap' || suggestSortBy === 'cheapest') {
    primaryDiff = mode === 'rent' ? a.rahn80m - b.rahn80m : dealA - dealB;
  } else if (suggestSortBy === 'commute' || suggestSortBy === 'commute_metro') {
    const distA = a.distKm ?? EVALUATED_RECOMMENDATION_WEIGHTS.defaultMissingDistanceKm;
    const distB = b.distKm ?? EVALUATED_RECOMMENDATION_WEIGHTS.defaultMissingDistanceKm;
    primaryDiff = distA - distB;
    if (Math.abs(primaryDiff) <= EPS) primaryDiff = b.metro - a.metro;
  } else if (suggestSortBy === 'clean_calm') {
    primaryDiff = (b.air + b.security) - (a.air + a.security);
  } else if (suggestSortBy === 'yield' || suggestSortBy === 'undervalued') {
    const yieldA = a.rahn80m / Math.max(1, dealA * 80);
    const yieldB = b.rahn80m / Math.max(1, dealB * 80);
    primaryDiff = yieldB - yieldA;
  } else {
    primaryDiff = computeVersionedPriorityScore(b, suggestPriority) - computeVersionedPriorityScore(a, suggestPriority);
  }
  if (Math.abs(primaryDiff) > EPS) return primaryDiff < 0 ? -1 : 1;
  const scoreDiff = b.overallScore - a.overallScore;
  if (Math.abs(scoreDiff) > EPS) return scoreDiff < 0 ? -1 : 1;
  const priceDiff = mode === 'rent' ? a.rahn80m - b.rahn80m : dealA - dealB;
  if (Math.abs(priceDiff) > EPS) return priceDiff < 0 ? -1 : 1;
  return a.id - b.id;
}
export interface NeighborhoodRecommendationExplanation {
  budgetFitStatus: HousingStatus; budgetFitSemanticsLabelFa: string; scoreSemanticsLabelFa: string;
  primaryReasonFa: string; tradeOffSummaryFa: string; nonCompensatoryWarningsFa: string[];
  isTieBandWithTop: boolean; tieBandNoticeFa: string | null; strongestDimensionLabelFa: string; weakestDimensionLabelFa: string;
}
export function explainNeighborhoodRecommendation(
  hood: Pick<EvaluatedNeighborhood, 'name' | 'status' | 'diffPercent' | 'overallScore' | 'air' | 'powerWater' | 'internet' | 'metro' | 'security' | 'flatTerrain' | 'distKm'>,
  options: { mode?: 'rent' | 'buy'; priority?: SuggestPriorityMode; sortBy?: SuggestSortMode; topReferenceScore?: number } = {},
): NeighborhoodRecommendationExplanation {
  const { priority = 'balanced', sortBy = 'score', topReferenceScore } = options;
  const dims = [
    { key: 'metro', label: 'دسترسی مترو', val: hood.metro }, { key: 'air', label: 'کیفیت هوا', val: hood.air },
    { key: 'security', label: 'امنیت محله', val: hood.security }, { key: 'powerWater', label: 'پایداری آب و برق', val: hood.powerWater },
    { key: 'internet', label: 'کیفیت اینترنت', val: hood.internet }, { key: 'flatTerrain', label: 'شیب زمین', val: hood.flatTerrain },
  ];
  const sortedDims = [...dims].sort((a, b) => b.val - a.val);
  const strongest = sortedDims[0], weakest = sortedDims[sortedDims.length - 1];
  const budgetFitSemanticsLabelFa = hood.status === 'green' ? 'همخوان با فرض بودجه فعلی' : hood.status === 'yellow' ? 'مرزی (تا ۱۵٪ بالاتر از فرض بودجه)' : 'فراتر از فرض بودجه فعلی';
  const primaryReasonFa =
    sortBy === 'cheap' || sortBy === 'cheapest' ? `رتبه‌بندی بر پایه کمترین هزینه ورود مالی (${budgetFitSemanticsLabelFa})`
    : sortBy === 'commute' || sortBy === 'commute_metro' ? `کمترین فاصله تردد${hood.distKm !== null ? ` (${hood.distKm} km)` : ''} و مترو ${hood.metro}/10`
    : sortBy === 'clean_calm' ? `ترکیب هوای پاک (${hood.air}/10) و امنیت (${hood.security}/10)`
    : sortBy === 'yield' || sortBy === 'undervalued' ? `نسبت بازده اجاره به قیمت خرید بالاتر از میانگین`
    : priority === 'metro' ? `اولویت مترو و حمل‌ونقل (${hood.metro}/10) همراه با ${budgetFitSemanticsLabelFa}`
    : priority === 'air' ? `اولویت کیفیت هوا (${hood.air}/10) همراه با ${budgetFitSemanticsLabelFa}`
    : priority === 'security' ? `اولویت امنیت (${hood.security}/10) همراه با ${budgetFitSemanticsLabelFa}`
    : `توازن ۶ شاخص زیرساختی (${hood.overallScore}/10) و ${budgetFitSemanticsLabelFa}`;
  const nonCompensatoryWarningsFa = dims.filter((d) => d.val < 6.5).map((d) => `هشدار غیرجبرانی: ${d.label} (${d.val}/10) پایین است و با امتیاز سایر شاخص‌ها جبران نمی‌شود`);
  const tradeOffSummaryFa = `قوت اصلی: ${strongest.label} (${strongest.val}/10) · محدودیت اصلی: ${weakest.label} (${weakest.val}/10)${hood.diffPercent > 0 ? ` و +${hood.diffPercent}٪ فاصله بودجه` : ''}`;
  const isTieBandWithTop = typeof topReferenceScore === 'number' && Number.isFinite(topReferenceScore) && Math.abs(topReferenceScore - hood.overallScore) <= 0.3;
  return {
    budgetFitStatus: hood.status, budgetFitSemanticsLabelFa,
    scoreSemanticsLabelFa: 'میانگین هم‌وزن ۶ سنجه زیرساختی (توصیفی، نه مطلوبیت مطلق)',
    primaryReasonFa, tradeOffSummaryFa, nonCompensatoryWarningsFa, isTieBandWithTop,
    tieBandNoticeFa: isTieBandWithTop ? 'هم‌تراز حساسیت (±۰.۳ امتیاز؛ تفاوت قاطع نیست)' : null,
    strongestDimensionLabelFa: `${strongest.label} (${strongest.val}/10)`, weakestDimensionLabelFa: `${weakest.label} (${weakest.val}/10)`,
  };
}
const EMPTY_RESIDENT_VOTES: ResidentVoteDoc[] = [];
export function indexResidentVotesByHoodId(votes: ResidentVoteDoc[]): Map<number, ResidentVoteDoc[]> {
  const map = new Map<number, ResidentVoteDoc[]>();
  for (const v of votes) { const b = map.get(v.hoodId); if (b) b.push(v); else map.set(v.hoodId, [v]); }
  return map;
}
export type PrecomputedNeighborhood = Neighborhood & Pick<EvaluatedNeighborhood, 'marketReport' | 'trafficInfo'>;
const staticReportCache = new WeakMap<Neighborhood, {
  cloudBargains: BargainListing[] | undefined; cloudSponsor: NeighborhoodSponsor | undefined; value: PrecomputedNeighborhood;
}>();
export function precomputeNeighborhoodStaticReports(
  base: Neighborhood,
  cloudBargainsByHood: Record<number, BargainListing[]> = {},
  cloudSponsorsByHood: Record<number, NeighborhoodSponsor> = {},
): PrecomputedNeighborhood {
  const cloudList = cloudBargainsByHood[base.id], cloudSponsor = cloudSponsorsByHood[base.id];
  const cached = staticReportCache.get(base);
  if (cached && cached.cloudBargains === cloudList && cached.cloudSponsor === cloudSponsor) return cached.value;
  const mergedBargains = cloudList?.length ? [...cloudList, ...(base.bargains || []).filter((b) => !cloudList.some((cb) => cb.id === b.id))] : (base.bargains || []);
  const merged: Neighborhood = { ...base, bargains: mergedBargains, sponsor: cloudSponsor || base.sponsor };
  const value = { ...merged, marketReport: getNeighborhoodMarketReport(merged), trafficInfo: getNeighborhoodTrafficInfo(merged) };
  staticReportCache.set(base, { cloudBargains: cloudList, cloudSponsor, value });
  return value;
}
export function useEvaluatedNeighborhoods(params: UseEvaluatedNeighborhoodsParams) {
  const {
    activeCity, activeCitySeedList, neighborhoods, cloudBargainsByHood = {}, cloudSponsorsByHood = {}, cloudVotes,
    mode, deposit, monthlyRent, buyTotalBudget, targetSqm, useLoanBooster, deductTenantRahnInBuy, buildingAgeSegment,
    buyAgeMultiplier: explicitBuyAgeMult, rentAgeMultiplier, selectedWorkHub, statusFilter, deferredSearchQuery = '',
    onlyOutsideTrafficZone, onlyHighMetro, suggestSortBy, suggestPriority = 'balanced',
  } = params;
  const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale();
  const buyAgeMultiplier = explicitBuyAgeMult ?? (buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.88 : 0.76);
  const votesByHoodId = useMemo(() => indexResidentVotesByHoodId(cloudVotes), [cloudVotes]);
  const mergedNationwideNeighborhoods = useMemo(() => neighborhoods.map((n) => precomputeNeighborhoodStaticReports(n, cloudBargainsByHood, cloudSponsorsByHood)), [neighborhoods, cloudBargainsByHood, cloudSponsorsByHood]);
  const activeCityNeighborhoods = useMemo(() => {
    if (activeCity === 'tehran' && !activeCitySeedList) return mergedNationwideNeighborhoods.filter((n) => n.id < 100 || (n.id >= 500 && n.id <= 599));
    const byId = new Map<number, PrecomputedNeighborhood>(mergedNationwideNeighborhoods.map((n) => [n.id, n]));
    const seedList = activeCitySeedList || MULTI_CITY_CONFIGS[activeCity].neighborhoods;
    return seedList.map((seed) => byId.get(seed.id) ?? precomputeNeighborhoodStaticReports(seed, cloudBargainsByHood, cloudSponsorsByHood));
  }, [activeCity, activeCitySeedList, mergedNationwideNeighborhoods, cloudBargainsByHood, cloudSponsorsByHood]);
  const cityMedianRahn80m = useMemo(() => {
    const vals = activeCityNeighborhoods.map((n) => n.rahn80m).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    return vals.length === 0 ? 1200 : vals[Math.floor(vals.length / 2)];
  }, [activeCityNeighborhoods]);
  const totalRahnEquivalent = useMemo(() => {
    const base = deposit + Math.round((monthlyRent * 100) / 3);
    return useLoanBooster ? base + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterRahnMillion : base;
  }, [deposit, monthlyRent, useLoanBooster]);
  const maxAffordablePerSqm = useMemo(() => {
    const safeSqm = Math.max(25, Number(targetSqm) || 75);
    const effectiveBuy = useLoanBooster ? buyTotalBudget + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterBuyMillion : buyTotalBudget;
    if (!deductTenantRahnInBuy) return Math.round(effectiveBuy / safeSqm);
    const refRahn = cityMedianRahn80m * (safeSqm / 80) * (rentAgeMultiplier || 1);
    return Math.round(Math.round((effectiveBuy + refRahn) / 0.9) / safeSqm);
  }, [buyTotalBudget, targetSqm, useLoanBooster, deductTenantRahnInBuy, rentAgeMultiplier, cityMedianRahn80m]);
  const maxAffordablePerUnit = convertPricePerSqmToUnit(maxAffordablePerSqm, areaUnit);
  const maxAffordableIntlText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(maxAffordablePerUnit, intlCurrency, locale)} / ${formatAreaUnitLabel(areaUnit)}` : '';
  const extraGreenWithLoan = useMemo(() => {
    const timer = createExecutionTimer('Filter', 'extraGreenWithLoanCalculation');
    const safeSqm = Math.max(25, Number(targetSqm) || 75); const scaleFactor = safeSqm / 80;
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
    timer('success');
    return extra;
  }, [activeCityNeighborhoods, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, buyAgeMultiplier, rentAgeMultiplier, deductTenantRahnInBuy]);
  const evaluateList = useMemo(() => {
    const safeSqm = Math.max(25, Number(targetSqm) || 75); const scaleFactor = safeSqm / 80;
    const effectiveTotalBuyBudget = useLoanBooster ? buyTotalBudget + EVALUATED_RECOMMENDATION_WEIGHTS.loanBoosterBuyMillion : buyTotalBudget;
    return (list: Array<Neighborhood & Partial<Pick<EvaluatedNeighborhood, 'marketReport' | 'trafficInfo'>>>): EvaluatedNeighborhood[] =>
      list.map((n) => {
        const hoodVotes = votesByHoodId.get(n.id) ?? EMPTY_RESIDENT_VOTES;
        let { air, powerWater, internet, metro, security, flatTerrain } = n;
        let votesCount = n.votesCount || 12;
        if (hoodVotes.length > 0) {
          let totalW = EVALUATED_RECOMMENDATION_WEIGHTS.seedVoteBaseWeight;
          let sumAir = n.air * totalW, sumPower = n.powerWater * totalW, sumNet = n.internet * totalW;
          let sumMetro = n.metro * totalW, sumSec = n.security * totalW, sumFlat = n.flatTerrain * totalW;
          for (const v of hoodVotes) {
            const w = v.locationVerified ? EVALUATED_RECOMMENDATION_WEIGHTS.locationVerifiedVoteWeight : EVALUATED_RECOMMENDATION_WEIGHTS.unverifiedVoteWeight;
            totalW += w;
            sumAir += v.air * w; sumPower += v.powerWater * w; sumNet += v.internet * w;
            sumMetro += v.metro * w; sumSec += v.security * w; sumFlat += v.flatTerrain * w;
          }
          air = Math.round((sumAir / totalW) * 10) / 10; powerWater = Math.round((sumPower / totalW) * 10) / 10;
          internet = Math.round((sumNet / totalW) * 10) / 10; metro = Math.round((sumMetro / totalW) * 10) / 10;
          security = Math.round((sumSec / totalW) * 10) / 10; flatTerrain = Math.round((sumFlat / totalW) * 10) / 10;
          votesCount = (n.votesCount || 12) + hoodVotes.length;
        }
        const overallScore = calcOverallScore({ air, powerWater, internet, metro, security, flatTerrain });
        const effectiveBuyPerSqm = Math.max(15, Math.round(n.buyPerSqm * buyAgeMultiplier));
        const scaledRahnTarget = Math.max(50, Math.round(n.rahn80m * scaleFactor * rentAgeMultiplier));
        const totalUnitBuyPrice = effectiveBuyPerSqm * safeSqm;
        const deedHoldback = Math.round(totalUnitBuyPrice * EVALUATED_RECOMMENDATION_WEIGHTS.deedHoldbackRatio);
        const netRequiredBuyCash = deductTenantRahnInBuy ? Math.max(500, totalUnitBuyPrice - scaledRahnTarget - deedHoldback) : totalUnitBuyPrice;
        const ratio = mode === 'rent' ? scaledRahnTarget / Math.max(1, totalRahnEquivalent) : netRequiredBuyCash / Math.max(1, effectiveTotalBuyBudget);
        const status: HousingStatus = ratio <= 1.0 ? 'green' : ratio <= 1.15 ? 'yellow' : 'red';
        const diffPercent = Math.round((ratio - 1) * 100);
        const distKm = selectedWorkHub.lat ? calcDistanceKm(n.lat, n.lng, selectedWorkHub.lat, selectedWorkHub.lng) : null;
        return {
          ...n, baseBuyPerSqm: n.buyPerSqm, buyPerSqm: effectiveBuyPerSqm,
          air, powerWater, internet, metro, security, flatTerrain, votesCount,
          overallScore, status, diffPercent, distKm,
          marketReport: n.marketReport ?? getNeighborhoodMarketReport(n),
          trafficInfo: n.trafficInfo ?? getNeighborhoodTrafficInfo(n),
        };
      });
  }, [
    votesByHoodId, mode, totalRahnEquivalent, buyTotalBudget, useLoanBooster, selectedWorkHub,
    targetSqm, buyAgeMultiplier, rentAgeMultiplier, deductTenantRahnInBuy,
  ]);
  const evaluatedNeighborhoods = useMemo<EvaluatedNeighborhood[]>(() => {
    const timer = createExecutionTimer('Filter', 'evaluateCityNeighborhoods');
    const res = evaluateList(activeCityNeighborhoods);
    timer('success');
    return res;
  }, [evaluateList, activeCityNeighborhoods]);
  const nationwideEvaluatedNeighborhoods = useMemo<EvaluatedNeighborhood[]>(() => {
    const timer = createExecutionTimer('Filter', 'evaluateNationwideNeighborhoods');
    const res = evaluateList(mergedNationwideNeighborhoods);
    timer('success');
    return res;
  }, [evaluateList, mergedNationwideNeighborhoods]);
  const filteredNeighborhoods = useMemo(() => {
    const timer = createExecutionTimer('Filter', 'filterCityNeighborhoods');
    const q = deferredSearchQuery.trim();
    const res = evaluatedNeighborhoods.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (q && !matchesPersianSearch(n.name, q) && !matchesPersianSearch(n.zone, q) && !matchesPersianSearch(n.pros, q) && !n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q))))) return false;
      if (onlyOutsideTrafficZone && activeCity === 'tehran' && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
      if (onlyHighMetro && n.metro < 8) return false;
      return true;
    });
    timer('success');
    return res;
  }, [evaluatedNeighborhoods, statusFilter, deferredSearchQuery, onlyOutsideTrafficZone, onlyHighMetro, activeCity]);
  const nationwideFilteredNeighborhoods = useMemo(() => {
    const timer = createExecutionTimer('Filter', 'filterNationwideNeighborhoods');
    const q = deferredSearchQuery.trim();
    const res = nationwideEvaluatedNeighborhoods.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (q && !matchesPersianSearch(n.name, q) && !matchesPersianSearch(n.zone, q) && !matchesPersianSearch(n.pros, q) && !n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q))))) return false;
      if (onlyOutsideTrafficZone && (n.id < 100 || (n.id >= 500 && n.id <= 599)) && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
      if (onlyHighMetro && n.metro < 8) return false;
      return true;
    });
    timer('success');
    return res;
  }, [nationwideEvaluatedNeighborhoods, statusFilter, deferredSearchQuery, onlyOutsideTrafficZone, onlyHighMetro]);
  const lifestylePool = useMemo(() => evaluatedNeighborhoods.filter((n) => {
    if (onlyOutsideTrafficZone && activeCity === 'tehran' && getTrafficZoneStatus(n.id).zoneType !== 'free') return false;
    if (onlyHighMetro && n.metro < 8) return false;
    return true;
  }), [evaluatedNeighborhoods, onlyOutsideTrafficZone, onlyHighMetro, activeCity]);
  const counts = useMemo(() => ({
    green: lifestylePool.filter((n) => n.status === 'green').length,
    yellow: lifestylePool.filter((n) => n.status === 'yellow').length,
    red: lifestylePool.filter((n) => n.status === 'red').length,
  }), [lifestylePool]);
  const smartSuggestedNeighborhoods = useMemo(() => {
    const timer = createExecutionTimer('Filter', 'smartSuggestedNeighborhoods');
    const seenIds = new Set<number>();
    const dedupedPool = lifestylePool.filter((n) => { if (seenIds.has(n.id)) return false; seenIds.add(n.id); return true; });
    const affordable = dedupedPool.filter((n) => n.status === 'green' || n.status === 'yellow');
    const pool = affordable.length >= 3 ? affordable : dedupedPool;
    const res = [...pool].sort((a, b) => compareEvaluatedNeighborhoodsForSuggestion(a, b, { mode, suggestSortBy, suggestPriority })).slice(0, 3);
    timer('success');
    return res;
  }, [lifestylePool, suggestSortBy, suggestPriority, mode]);
  return {
    rankingWeightsVersion: EVALUATED_RECOMMENDATION_WEIGHTS_VERSION,
    totalRahnEquivalent, maxAffordablePerSqm, maxAffordablePerUnit, maxAffordableIntlText, extraGreenWithLoan,
    evaluatedNeighborhoods, filteredNeighborhoods, nationwideEvaluatedNeighborhoods, nationwideFilteredNeighborhoods, counts, smartSuggestedNeighborhoods,
  };
}
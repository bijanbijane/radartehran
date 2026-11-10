/**
 * @file src/cells/decision-epistemology/paretoRegretEngine.ts
 * @description CASPER Game-Theoretic & Decision Science Engine (Charter Sections 17, 19, 20, 33):
 * - Savage's Minimax Regret Criterion across 3 Macroeconomic Regimes (36-month horizon)
 * - Pareto Frontier & Multi-Criteria Spatial Arbitrage Solver (MAUT)
 */
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS, type Neighborhood, toPersianNum } from '../../data/neighborhoods';
import { FAST_SALE_FACTOR } from '../../data/hedonicPricingEngine';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { clampNumber, validateCityParam } from '../../utils/security';

export type MacroRegimeId = 'CURRENCY_SHOCK' | 'STAGFLATION_LOCK' | 'REAL_YIELD_DISINFLATION';

export type DecisionStrategyId =
  | 'BUY_TARGET_NEGOTIATED'
  | 'RENT_AND_CAPITAL_SHIELD'
  | 'PARETO_SPATIAL_ARBITRAGE';

export interface MacroRegimeSpec {
  regimeId: MacroRegimeId;
  titleFa: string;
  annualInflationPct: number;
  annualPropertyGrowthPct: number;
  annualLiquidShieldReturnPct: number;
  descriptionFa: string;
}

export interface StrategyRegimeCell {
  regimeId: MacroRegimeId;
  terminalWealthMillion: number;
  terminalWealthIntlText: string;
  regretMillion: number;
}

export interface EvaluatedStrategyRow {
  strategyId: DecisionStrategyId;
  titleFa: string;
  subtitleFa: string;
  cells: Record<MacroRegimeId, StrategyRegimeCell>;
  maxRegretMillion: number;
  expectedWealthMillion: number;
  hurwiczScoreMillion: number;
  isMinimaxOptimal: boolean;
  isHurwiczOptimal: boolean;
}

export interface ParetoArbitrageCandidate {
  hoodId: number;
  hoodName: string;
  zone: string;
  askingPriceSqm: number;
  estimatedDealPriceSqm: number;
  dealPriceIntlText: string;
  utilityScore: number;
  priceSavingsPct: number;
  capitalFreed85mMillion: number;
  dominanceType: 'STRICT_PARETO' | 'HIGH_EFFICIENCY_SUBSTITUTE';
  rationaleFa: string;
}

export interface ParetoRegretAnalysisResult {
  cityId: CityId;
  hoodId: number;
  hoodName: string;
  targetSqm: number;
  horizonYears: number;
  optimismAlpha: number;
  targetUtilityScore: number;
  regimes: MacroRegimeSpec[];
  strategies: EvaluatedStrategyRow[];
  minimaxWinnerId: DecisionStrategyId;
  minimaxSummaryFa: string;
  paretoAlternatives: ParetoArbitrageCandidate[];
}

export const MACRO_REGIMES_3Y: readonly MacroRegimeSpec[] = [
  {
    regimeId: 'CURRENCY_SHOCK', titleFa: 'سناریوی ۱: تکانه ارزی و جهش تورمی (تورم ۵۲٪)',
    annualInflationPct: 52, annualPropertyGrowthPct: 48, annualLiquidShieldReturnPct: 50,
    descriptionFa: 'جهش نرخ ارز و رشد اسمی سریع دارایی‌های فیزیکی؛ نگهداری نقدینگی ریالی بدون سپر تورمی زیان‌بار است.',
  },
  {
    regimeId: 'STAGFLATION_LOCK', titleFa: 'سناریوی ۲: رکود تورمی و قفل نقدشوندگی (تورم ۳۴٪)',
    annualInflationPct: 34, annualPropertyGrowthPct: 24, annualLiquidShieldReturnPct: 36,
    descriptionFa: 'افت شدید حجم معاملات و جاماندن رشد اسمی مسکن از تورم عمومی به‌همراه هزینه خروج فوری ۱۲٪.',
  },
  {
    regimeId: 'REAL_YIELD_DISINFLATION', titleFa: 'سناریوی ۳: ثبات نسبی و برتری سود حقیقی (تورم ۲۲٪)',
    annualInflationPct: 22, annualPropertyGrowthPct: 17, annualLiquidShieldReturnPct: 31,
    descriptionFa: 'کاهش انتظارات تورمی و برتری بازده مرکب ابزارهای مالی و تولیدی نسبت به حباب قیمتی ملک.',
  },
];

export function computeNeighborhoodUtilityScore(hood: {
  overallScore?: number; transit?: number; metro?: number; air?: number; traffic?: number; walking?: number; density?: number;
}): number {
  const transitVal = Number(hood.transit ?? hood.metro) || 6.5;
  const airVal = Number(hood.air) || 6.5;
  const trafficVal = Number(hood.traffic ?? hood.density) || 6.5;
  const walkVal = Number(hood.walking) || 6.5;
  const baseOverall = Number(hood.overallScore) || (transitVal + airVal + trafficVal + walkVal) / 4;
  const minDim = Math.min(transitVal, airVal, trafficVal, walkVal);
  const vetoPenalty = minDim < 5.0 ? (5.0 - minDim) * 8.5 : 0;
  const raw = baseOverall * 4.5 + transitVal * 2.0 + airVal * 1.5 + trafficVal * 1.0 + walkVal * 1.0 - vetoPenalty;
  return Math.round(clampNumber(raw, 25, 99, 72));
}

export function findParetoDominantNeighborhoods(input: {
  cityId?: string; hoodId: number; basePriceSqm?: number; targetSqm?: number; intlCurrency?: IntlCurrencyCode; providedHood?: Neighborhood;
}): { targetUtilityScore: number; candidates: ParetoArbitrageCandidate[] } {
  const safeCity = validateCityParam(input.cityId, 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const targetHood = (input.providedHood && input.providedHood.id === input.hoodId)
    ? input.providedHood
    : cityHoods.find((h) => h.id === input.hoodId) ?? INITIAL_NEIGHBORHOODS[0];
  const targetSqm = clampNumber(input.targetSqm ?? 85, 35, 500, 85);
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';

  const targetBuySqm = input.basePriceSqm && input.basePriceSqm > 0 ? input.basePriceSqm : targetHood.buyPerSqm;
  const targetAgg = aggregateNeighborhoodMarketMetrics(targetHood.id, targetHood.name, targetBuySqm, buildNeighborhoodListingSamples(targetHood));
  const targetDealSqm = Math.max(15, targetAgg.estimatedDealPricePerSqm);
  const targetUtilityScore = computeNeighborhoodUtilityScore(targetHood);

  const preFiltered = cityHoods
    .filter((peer) => peer.id !== targetHood.id && peer.buyPerSqm > 0 && peer.buyPerSqm < targetBuySqm * 0.96)
    .map((peer) => ({ peer, peerUtility: computeNeighborhoodUtilityScore(peer) }))
    .filter((item) => item.peerUtility >= targetUtilityScore - 6)
    .sort((a, b) => b.peerUtility - a.peerUtility)
    .slice(0, 12);

  const scored: ParetoArbitrageCandidate[] = [];
  for (const { peer, peerUtility } of preFiltered) {
    const peerAgg = aggregateNeighborhoodMarketMetrics(peer.id, peer.name, peer.buyPerSqm, buildNeighborhoodListingSamples(peer));
    const peerDealSqm = Math.max(15, peerAgg.estimatedDealPricePerSqm);
    const priceSavingsPct = Number((((targetDealSqm - peerDealSqm) / targetDealSqm) * 100).toFixed(1));
    if (priceSavingsPct < 4) continue;

    const isStrictPareto = peerUtility >= targetUtilityScore && priceSavingsPct >= 5;
    const capitalFreed85mMillion = Math.max(0, Math.round((targetDealSqm - peerDealSqm) * targetSqm));
    scored.push({
      hoodId: peer.id, hoodName: peer.name, zone: peer.zone || 'منطقه شهری',
      askingPriceSqm: peer.buyPerSqm, estimatedDealPriceSqm: peerDealSqm,
      dealPriceIntlText: formatMillionTomanAsIntlCurrency(peerDealSqm, intlCurrency, 'fa'),
      utilityScore: peerUtility, priceSavingsPct, capitalFreed85mMillion,
      dominanceType: isStrictPareto ? 'STRICT_PARETO' : 'HIGH_EFFICIENCY_SUBSTITUTE',
      rationaleFa: isStrictPareto
        ? `غلبه قطعی پارتو: امتیاز زیست‌پذیری بالاتر یا مساوی (${toPersianNum(peerUtility)} در برابر ${toPersianNum(targetUtilityScore)}) همراه با ${toPersianNum(priceSavingsPct)}٪ قیمت پایین‌تر و آزادسازی ${toPersianNum(capitalFreed85mMillion)} م.ت سرمایه.`
        : `جایگزین پربازده: حفظ ${toPersianNum(Math.round((peerUtility / Math.max(1, targetUtilityScore)) * 100))}٪ کیفیت سکونتی محله هدف با ${toPersianNum(priceSavingsPct)}٪ صرفه‌جویی سرمایه‌ای.`,
    });
  }

  scored.sort((a, b) => {
    if (a.dominanceType !== b.dominanceType) return a.dominanceType === 'STRICT_PARETO' ? -1 : 1;
    return b.priceSavingsPct + (b.utilityScore - targetUtilityScore) * 1.5 - (a.priceSavingsPct + (a.utilityScore - targetUtilityScore) * 1.5);
  });

  return { targetUtilityScore, candidates: scored.slice(0, 3) };
}

export function computeSavageMinimaxRegretMatrix(input: {
  cityId?: string; hoodId: number; hoodName?: string; basePriceSqm?: number; targetSqm?: number; intlCurrency?: IntlCurrencyCode; optimismAlpha?: number; providedHood?: Neighborhood;
}): ParetoRegretAnalysisResult {
  const safeCity = validateCityParam(input.cityId, 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const targetHood = (input.providedHood && input.providedHood.id === input.hoodId)
    ? input.providedHood
    : cityHoods.find((h) => h.id === input.hoodId) ?? INITIAL_NEIGHBORHOODS[0];
  const hoodName = input.hoodName || targetHood.name;
  const targetSqm = clampNumber(input.targetSqm ?? 85, 35, 500, 85);
  const optimismAlpha = clampNumber(input.optimismAlpha ?? 0.35, 0, 1, 0.35);
  const horizonYears = 3;
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';

  const buySqm = input.basePriceSqm && input.basePriceSqm > 0 ? input.basePriceSqm : targetHood.buyPerSqm;
  const agg = aggregateNeighborhoodMarketMetrics(targetHood.id, hoodName, buySqm, buildNeighborhoodListingSamples(targetHood));
  const dealSqm = Math.max(15, agg.estimatedDealPricePerSqm);
  const initialCapitalMillion = Math.round(dealSqm * targetSqm);
  const scaledBaseRahn = Math.round(
    (dealSqm / Math.max(1, targetHood.buyPerSqm)) * (targetHood.rahn80m || Math.round(targetHood.buyPerSqm * 80 * 0.18))
  );
  const rahnEquivalentMillion = Math.round(scaledBaseRahn * (targetSqm / 80));

  const { targetUtilityScore, candidates } = findParetoDominantNeighborhoods({
    cityId: safeCity, hoodId: targetHood.id, basePriceSqm: buySqm, targetSqm, intlCurrency, providedHood: input.providedHood,
  });
  const bestArbitrage = candidates[0];
  const arbitrageSavingsRatio = bestArbitrage ? clampNumber(bestArbitrage.priceSavingsPct / 100, 0.05, 0.30, 0.12) : 0.12;

  const rawWealth: Record<DecisionStrategyId, Record<MacroRegimeId, number>> = {
    BUY_TARGET_NEGOTIATED: { CURRENCY_SHOCK: 0, STAGFLATION_LOCK: 0, REAL_YIELD_DISINFLATION: 0 },
    RENT_AND_CAPITAL_SHIELD: { CURRENCY_SHOCK: 0, STAGFLATION_LOCK: 0, REAL_YIELD_DISINFLATION: 0 },
    PARETO_SPATIAL_ARBITRAGE: { CURRENCY_SHOCK: 0, STAGFLATION_LOCK: 0, REAL_YIELD_DISINFLATION: 0 },
  };

  for (const reg of MACRO_REGIMES_3Y) {
    const propMult = Math.pow(1 + reg.annualPropertyGrowthPct / 100, horizonYears);
    const shieldMult = Math.pow(1 + reg.annualLiquidShieldReturnPct / 100, horizonYears);
    const liqFactor = reg.regimeId === 'STAGFLATION_LOCK' ? (1 + FAST_SALE_FACTOR) / 2 : 0.985;

    rawWealth.BUY_TARGET_NEGOTIATED[reg.regimeId] = Math.round(initialCapitalMillion * propMult * liqFactor);
    const investableAfterRahn = Math.max(0, initialCapitalMillion - rahnEquivalentMillion);
    rawWealth.RENT_AND_CAPITAL_SHIELD[reg.regimeId] = Math.round(rahnEquivalentMillion + investableAfterRahn * shieldMult);

    const arbPropertyCost = initialCapitalMillion * (1 - arbitrageSavingsRatio);
    const freedCapital = initialCapitalMillion * arbitrageSavingsRatio;
    rawWealth.PARETO_SPATIAL_ARBITRAGE[reg.regimeId] = Math.round(
      arbPropertyCost * propMult * Math.min(0.99, liqFactor + 0.025) + freedCapital * shieldMult,
    );
  }

  const bestInRegime: Record<MacroRegimeId, number> = {
    CURRENCY_SHOCK: Math.max(rawWealth.BUY_TARGET_NEGOTIATED.CURRENCY_SHOCK, rawWealth.RENT_AND_CAPITAL_SHIELD.CURRENCY_SHOCK, rawWealth.PARETO_SPATIAL_ARBITRAGE.CURRENCY_SHOCK),
    STAGFLATION_LOCK: Math.max(rawWealth.BUY_TARGET_NEGOTIATED.STAGFLATION_LOCK, rawWealth.RENT_AND_CAPITAL_SHIELD.STAGFLATION_LOCK, rawWealth.PARETO_SPATIAL_ARBITRAGE.STAGFLATION_LOCK),
    REAL_YIELD_DISINFLATION: Math.max(rawWealth.BUY_TARGET_NEGOTIATED.REAL_YIELD_DISINFLATION, rawWealth.RENT_AND_CAPITAL_SHIELD.REAL_YIELD_DISINFLATION, rawWealth.PARETO_SPATIAL_ARBITRAGE.REAL_YIELD_DISINFLATION),
  };

  const strategyMeta: Array<{ id: DecisionStrategyId; titleFa: string; subtitleFa: string }> = [
    {
      id: 'BUY_TARGET_NEGOTIATED', titleFa: `خرید قطعی در ${hoodName} (با نرخ مدل v6.4)`,
      subtitleFa: `تخصیص ۱۰۰٪ سرمایه (${toPersianNum(initialCapitalMillion)} م.ت) به خرید ملک در همین محله`,
    },
    {
      id: 'RENT_AND_CAPITAL_SHIELD', titleFa: `رهن کامل در ${hoodName} + سپر سرمایه‌ای نقدشونده`,
      subtitleFa: `تخصیص ${toPersianNum(rahnEquivalentMillion)} م.ت به رهن و سرمایه‌گذاری مازاد در سبد ضدتورمی`,
    },
    {
      id: 'PARETO_SPATIAL_ARBITRAGE',
      titleFa: bestArbitrage ? `آربیتراژ مکانی پارتو: خرید در «${bestArbitrage.hoodName}» + سپر نقدینگی` : 'آربیتراژ مکانی پارتو: خرید در محله هم‌تراز زیر ارزش ذاتی + سپر نقدینگی',
      subtitleFa: `حفظ کیفیت سکونتی همراه با آزادسازی ${toPersianNum(Math.round(arbitrageSavingsRatio * 100))}٪ سرمایه برای بازده مرکب و نقدشوندگی`,
    },
  ];

  const rows: EvaluatedStrategyRow[] = strategyMeta.map((meta) => {
    const cells = {} as Record<MacroRegimeId, StrategyRegimeCell>;
    let maxRegret = 0, sumWealth = 0, minW = Infinity, maxW = -Infinity;
    for (const reg of MACRO_REGIMES_3Y) {
      const w = rawWealth[meta.id][reg.regimeId];
      const regret = Math.max(0, bestInRegime[reg.regimeId] - w);
      if (regret > maxRegret) maxRegret = regret;
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
      sumWealth += w;
      cells[reg.regimeId] = {
        regimeId: reg.regimeId, terminalWealthMillion: w,
        terminalWealthIntlText: formatMillionTomanAsIntlCurrency(w, intlCurrency, 'fa'), regretMillion: regret,
      };
    }
    const hurwiczScoreMillion = Math.round(optimismAlpha * maxW + (1 - optimismAlpha) * minW);
    return {
      strategyId: meta.id, titleFa: meta.titleFa, subtitleFa: meta.subtitleFa, cells,
      maxRegretMillion: maxRegret, expectedWealthMillion: Math.round(sumWealth / MACRO_REGIMES_3Y.length),
      hurwiczScoreMillion, isMinimaxOptimal: false, isHurwiczOptimal: false,
    };
  });

  let minimaxWinner = rows[0], hurwiczWinner = rows[0];
  for (const r of rows) {
    if (r.maxRegretMillion < minimaxWinner.maxRegretMillion || (r.maxRegretMillion === minimaxWinner.maxRegretMillion && r.expectedWealthMillion > minimaxWinner.expectedWealthMillion)) {
      minimaxWinner = r;
    }
    if (r.hurwiczScoreMillion > hurwiczWinner.hurwiczScoreMillion) hurwiczWinner = r;
  }
  minimaxWinner.isMinimaxOptimal = true;
  hurwiczWinner.isHurwiczOptimal = true;

  return {
    cityId: safeCity, hoodId: targetHood.id, hoodName, targetSqm, horizonYears, optimismAlpha, targetUtilityScore,
    regimes: [...MACRO_REGIMES_3Y], strategies: rows, minimaxWinnerId: minimaxWinner.strategyId,
    minimaxSummaryFa: `بر اساس معیار «کمینه‌سازی حداکثر پشیمانی ساواج» (Savage Minimax Regret)، راهبرد «${minimaxWinner.titleFa}» کمترین ریسک پشیمانی (${toPersianNum(minimaxWinner.maxRegretMillion)} م.ت در بدترین سناریوی کلان) و میانگین ثروت ۳ ساله ${toPersianNum(minimaxWinner.expectedWealthMillion)} م.ت را ایجاد می‌کند.`,
    paretoAlternatives: candidates,
  };
}

/**
 * @file urbanAffordabilityIsochroneEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Urban Affordability Stress, Alonso-Muth-Mills Total Cost of Housing (TCOH),
 * and Commute-vs-Rent Arbitrage Indifference Isochrone Engine.
 */

import { calcDistanceKm, INITIAL_NEIGHBORHOODS, Neighborhood, toPersianNum, WORK_HUBS, WorkHub } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';

export interface UrbanAffordabilityStressMetrics {
  priceToIncomeRatio: number; rentToIncomeRatioPct: number;
  affordabilityTier: 'AFFORDABLE' | 'MODERATE_STRESS' | 'SEVERE_STRESS' | 'CRITICAL_UNREACHABLE';
  affordabilityTierFa: string; monthlyMedianIncomeMillion: number;
}

export interface CommuteOpportunityCostBreakdown {
  workHubId: string; workHubName: string; distanceKm: number; estimatedOneWayMinutes: number;
  monthlyCommuteHours: number; monthlyTimeOpportunityCostMillion: number;
  monthlyDirectTransitCostMillion: number; monthlyAqiHealthBurdenMillion: number;
  totalMonthlyFrictionCostMillion: number;
}

export interface CommuteRentArbitrageIndifference {
  monthlyHousingDirectCostMillion: number; totalCostOfHousingMillion: number;
  arbitrageVerdict: 'URBAN_CORE_SUPERIOR' | 'SUBURB_ARBITRAGE_VIABLE' | 'INDIFFERENCE_EQUILIBRIUM';
  arbitrageVerdictFa: string; breakEvenCommuteMinutes: number;
  netMonthlyArbitrageSurplusMillion: number; strategicAdviceFa: string;
}

export interface IsochroneArbitrageSubstitute {
  hoodId: number; hoodName: string; zone: string; distanceKm: number;
  estimatedOneWayMinutes: number; oneWayMinutes: number; monthlyRentMillion: number;
  totalCostOfHousingMillion: number; monthlyTcohSavingsMillion: number;
  capitalFreed80mMillion: number; rationaleFa: string;
}

export interface CasperUrbanAffordabilityReport {
  hoodId: number; hoodName: string; cityId: string; basePriceSqm: number; rahn80m: number;
  effectiveRentPerMonthMillion: number; affordability: UrbanAffordabilityStressMetrics;
  commute: CommuteOpportunityCostBreakdown; arbitrage: CommuteRentArbitrageIndifference;
  optimalIsochroneSubstitute: IsochroneArbitrageSubstitute | null; generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  return hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName)) ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

function resolveWorkHub(cityId: string, hubId?: string): WorkHub {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hubs = MULTI_CITY_CONFIGS[safeCity]?.workHubs ?? WORK_HUBS;
  return hubs.find((h) => h.id === hubId) ?? hubs[0] ?? WORK_HUBS[0];
}

export function computeAffordabilityStress(
  pricePerSqm: number, rahn80m: number, monthlyMedianIncomeMillion: number = 42
): UrbanAffordabilityStressMetrics {
  const safeIncome = Math.max(10, monthlyMedianIncomeMillion);
  const annualIncome = safeIncome * 12;
  const totalBuyPrice80m = pricePerSqm * 80;
  const priceToIncomeRatio = Math.min(60, Math.max(5, Number((totalBuyPrice80m / annualIncome).toFixed(1))));
  const monthlyRentEquivalent = rahn80m * 0.03;
  const rentToIncomeRatioPct = Math.min(400, Math.max(10, Number(((monthlyRentEquivalent / safeIncome) * 100).toFixed(1))));

  let affordabilityTier: UrbanAffordabilityStressMetrics['affordabilityTier'] = 'MODERATE_STRESS';
  let affordabilityTierFa = 'فشار استطاعت متوسط (قابل مدیریت)';
  if (priceToIncomeRatio <= 9 && rentToIncomeRatioPct <= 30) {
    affordabilityTier = 'AFFORDABLE';
    affordabilityTierFa = 'استطاعت‌پذیری مطلوب و سالم';
  } else if (priceToIncomeRatio <= 16 && rentToIncomeRatioPct <= 45) {
    affordabilityTier = 'MODERATE_STRESS';
    affordabilityTierFa = 'فشار متوسط استطاعت (نیازمند انضباط مالی)';
  } else if (priceToIncomeRatio <= 25 || rentToIncomeRatioPct <= 60) {
    affordabilityTier = 'SEVERE_STRESS';
    affordabilityTierFa = 'تنش شدید استطاعت مسکن (بحران تاب‌آوری)';
  } else {
    affordabilityTier = 'CRITICAL_UNREACHABLE';
    affordabilityTierFa = 'بحران بحرانی و خارج از دسترس درآمد عادی';
  }
  return { priceToIncomeRatio, rentToIncomeRatioPct, affordabilityTier, affordabilityTierFa, monthlyMedianIncomeMillion: safeIncome };
}

export function computeCommuteOpportunityCost(
  hoodLat: number | null, hoodLng: number | null, hub: WorkHub,
  trafficScore: number = 7, airQualityAqi: number = 110, monthlyMedianIncomeMillion: number = 42
): CommuteOpportunityCostBreakdown {
  const distanceKm = hoodLat !== null && hoodLng !== null && hub.lat !== null && hub.lng !== null
    ? calcDistanceKm(hoodLat, hoodLng, hub.lat, hub.lng) : 8.5;
  const trafficFactor = Math.max(0.7, 1.4 - (trafficScore / 10) * 0.6);
  const estimatedOneWayMinutes = Math.max(10, Math.round(distanceKm * 2.5 * trafficFactor));
  const monthlyCommuteHours = Number(((estimatedOneWayMinutes * 2 * 22) / 60).toFixed(1));
  const valueOfTimePerHour = (monthlyMedianIncomeMillion / 160) * 0.5;
  const monthlyTimeOpportunityCostMillion = Number((monthlyCommuteHours * valueOfTimePerHour).toFixed(2));
  const monthlyDirectTransitCostMillion = Number(((0.075 + distanceKm * 0.005) * 22).toFixed(2));
  const monthlyAqiHealthBurdenMillion = Number(((Math.max(0, airQualityAqi - 50) / 100) * 0.65).toFixed(2));
  const totalMonthlyFrictionCostMillion = Number(
    (monthlyTimeOpportunityCostMillion + monthlyDirectTransitCostMillion + monthlyAqiHealthBurdenMillion).toFixed(2)
  );
  return {
    workHubId: hub.id, workHubName: hub.name, distanceKm: Number(distanceKm.toFixed(1)),
    estimatedOneWayMinutes, monthlyCommuteHours, monthlyTimeOpportunityCostMillion,
    monthlyDirectTransitCostMillion, monthlyAqiHealthBurdenMillion, totalMonthlyFrictionCostMillion,
  };
}

export function computeCommuteRentArbitrage(
  rahn80m: number, commute: CommuteOpportunityCostBreakdown, hubCoreRahn80m: number = 2200
): CommuteRentArbitrageIndifference {
  const monthlyHousingDirectCostMillion = Number((rahn80m * 0.03).toFixed(2));
  const hubCoreMonthlyRentMillion = Number((hubCoreRahn80m * 0.03).toFixed(2));
  const totalCostOfHousingMillion = Number((monthlyHousingDirectCostMillion + commute.totalMonthlyFrictionCostMillion).toFixed(2));
  const monthlyRentSavingsMillion = hubCoreMonthlyRentMillion - monthlyHousingDirectCostMillion;
  const netMonthlyArbitrageSurplusMillion = Number((monthlyRentSavingsMillion - commute.totalMonthlyFrictionCostMillion).toFixed(2));
  const minutesCostPerMonth = commute.monthlyTimeOpportunityCostMillion / Math.max(1, commute.estimatedOneWayMinutes);
  const breakEvenCommuteMinutes = Math.round(
    Math.max(15, (monthlyRentSavingsMillion - commute.monthlyDirectTransitCostMillion) / Math.max(0.01, minutesCostPerMonth))
  );

  let arbitrageVerdict: CommuteRentArbitrageIndifference['arbitrageVerdict'] = 'SUBURB_ARBITRAGE_VIABLE';
  let arbitrageVerdictFa = 'آربیتراژ مثبت سکونت پیرامونی';
  let strategicAdviceFa = '';
  if (netMonthlyArbitrageSurplusMillion >= 1.5) {
    arbitrageVerdict = 'SUBURB_ARBITRAGE_VIABLE';
    arbitrageVerdictFa = 'صرفه‌جویی خالص مثبت سکونت پیرامونی (آربیتراژ برتر)';
    strategicAdviceFa = `صرفه‌جویی اجاره‌بها نسبت به مرکز قطب کار، هزینه زمان تردد و استهلاک را کاملاً پوشش داده و ماهانه ${toPersianNum(netMonthlyArbitrageSurplusMillion)} میلیون تومان مازاد خالص ایجاد می‌کند.`;
  } else if (netMonthlyArbitrageSurplusMillion <= -1.0) {
    arbitrageVerdict = 'URBAN_CORE_SUPERIOR';
    arbitrageVerdictFa = 'برتری اقتصادی سکونت در هسته شهری (نزدیک محل کار)';
    strategicAdviceFa = 'هزینه استهلاک بدنی، اتلاف ساعات کاری در ترافیک و آلودگی هوا، صرفه‌جویی ناچیز اجاره را می‌بلعد؛ سکونت نزدیک‌تر به قطب کار به‌صرفه‌تر است.';
  } else {
    arbitrageVerdict = 'INDIFFERENCE_EQUILIBRIUM';
    arbitrageVerdictFa = 'تعادل بی‌تفاوتی هزینه سکونت-تردد (Isochrone Equilibrium)';
    strategicAdviceFa = 'مجموع هزینه‌های مسکن و رفت‌وآمد در نقطه سربه‌سر قرار دارد؛ ترجیحات آرامش محله، متراژ و هوای پاک‌تر تعیین‌کننده نهایی است.';
  }
  return {
    monthlyHousingDirectCostMillion, totalCostOfHousingMillion, arbitrageVerdict,
    arbitrageVerdictFa, breakEvenCommuteMinutes, netMonthlyArbitrageSurplusMillion, strategicAdviceFa,
  };
}

export function generateCasperUrbanAffordabilityReport(
  hoodId: number, hoodName?: string, cityId: string = 'tehran',
  basePriceSqm?: number, workHubId?: string, monthlyIncomeMillion: number = 42
): CasperUrbanAffordabilityReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const hub = resolveWorkHub(cityId, workHubId);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const resolvedRahn = Math.round((resolvedPrice / Math.max(1, hood.buyPerSqm)) * (hood.rahn80m || Math.round(hood.buyPerSqm * 80 * 0.18)));
  const effectiveRent = resolvedRahn * 0.03;
  const transitAccessibilityScore = hood.metro ?? 7;
  const rawAirScore = hood.air ?? 6;
  const estimatedAqi = rawAirScore <= 10 ? Math.round(185 - rawAirScore * 13) : rawAirScore;

  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const nearestToHub = [...cityHoods]
    .filter((h) => h.lat !== null && h.lng !== null && hub.lat !== null && hub.lng !== null)
    .sort((a, b) => calcDistanceKm(a.lat!, a.lng!, hub.lat!, hub.lng!) - calcDistanceKm(b.lat!, b.lng!, hub.lat!, hub.lng!))
    .slice(0, 3);
  const hubCoreRahn80m = nearestToHub.length > 0
    ? Math.round(nearestToHub.reduce((acc, h) => acc + h.rahn80m, 0) / nearestToHub.length) : 2400;

  const affordability = computeAffordabilityStress(resolvedPrice, resolvedRahn, monthlyIncomeMillion);
  const commute = computeCommuteOpportunityCost(hood.lat, hood.lng, hub, transitAccessibilityScore, estimatedAqi, monthlyIncomeMillion);
  const arbitrage = computeCommuteRentArbitrage(resolvedRahn, commute, hubCoreRahn80m);

  // Socio-spatially realistic TCOH Isochrone Arbitrage Substitute
  let optimalIsochroneSubstitute: IsochroneArbitrageSubstitute | null = null;
  let bestTcoh = arbitrage.totalCostOfHousingMillion;
  const targetQuality = (hood.metro ?? 6) + (hood.air ?? 6);
  for (const cand of cityHoods) {
    if (cand.id === hood.id || cand.lat === null || cand.lng === null) continue;
    if (cand.buyPerSqm >= resolvedPrice || cand.buyPerSqm < resolvedPrice * 0.40 || (cand.metro ?? 6) + (cand.air ?? 6) < targetQuality - 4) continue;
    const candAqi = (cand.air ?? 6) <= 10 ? Math.round(185 - (cand.air ?? 6) * 13) : (cand.air ?? 110);
    const candCommute = computeCommuteOpportunityCost(cand.lat, cand.lng, hub, cand.metro ?? 7, candAqi, monthlyIncomeMillion);
    if (candCommute.estimatedOneWayMinutes > Math.min(42, commute.estimatedOneWayMinutes + 8)) continue;
    const candRahn = cand.rahn80m || Math.round(cand.buyPerSqm * 80 * 0.18);
    const candRent = Number((candRahn * 0.03).toFixed(2));
    const candTcoh = Number((candRent + candCommute.totalMonthlyFrictionCostMillion).toFixed(2));
    if (candTcoh < bestTcoh - 1.0) {
      bestTcoh = candTcoh;
      const savings = Number((arbitrage.totalCostOfHousingMillion - candTcoh).toFixed(1));
      const capitalFreed80mMillion = Math.max(80, Math.round((resolvedPrice - cand.buyPerSqm) * 80));
      optimalIsochroneSubstitute = {
        hoodId: cand.id, hoodName: cand.name, zone: cand.zone || 'منطقه شهری',
        distanceKm: candCommute.distanceKm, estimatedOneWayMinutes: candCommute.estimatedOneWayMinutes,
        oneWayMinutes: candCommute.estimatedOneWayMinutes,
        monthlyRentMillion: candRent, totalCostOfHousingMillion: candTcoh, monthlyTcohSavingsMillion: savings,
        capitalFreed80mMillion,
        rationaleFa: `سکونت در «${cand.name}» با فاصله ${toPersianNum(candCommute.estimatedOneWayMinutes)} دقیقه تا ${hub.name}، هزینه جامع ماهانه (اجاره + تردد) را ${toPersianNum(savings)} م.ت کاهش می‌دهد.`,
      };
    }
  }

  return {
    hoodId: hood.id, hoodName: hood.name, cityId, basePriceSqm: resolvedPrice, rahn80m: resolvedRahn,
    effectiveRentPerMonthMillion: Number(effectiveRent.toFixed(2)), affordability, commute, arbitrage,
    optimalIsochroneSubstitute, generatedAtIso: new Date().toISOString(),
  };
}

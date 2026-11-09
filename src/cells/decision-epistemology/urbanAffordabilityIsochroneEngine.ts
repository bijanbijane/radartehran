/**
 * @file urbanAffordabilityIsochroneEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Urban Affordability Stress, Alonso-Muth-Mills Total Cost of Housing (TCOH),
 * and Commute-vs-Rent Arbitrage Indifference Isochrone Engine.
 */

import { calcDistanceKm, INITIAL_NEIGHBORHOODS, Neighborhood, WORK_HUBS, WorkHub } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';

export interface UrbanAffordabilityStressMetrics {
  priceToIncomeRatio: number; // PIR: Years of annual income to buy 80m²
  rentToIncomeRatioPct: number; // RIR: % of monthly income consumed by rent
  affordabilityTier: 'AFFORDABLE' | 'MODERATE_STRESS' | 'SEVERE_STRESS' | 'CRITICAL_UNREACHABLE';
  affordabilityTierFa: string;
  monthlyMedianIncomeMillion: number;
}

export interface CommuteOpportunityCostBreakdown {
  workHubId: string;
  workHubName: string;
  distanceKm: number;
  estimatedOneWayMinutes: number;
  monthlyCommuteHours: number;
  monthlyTimeOpportunityCostMillion: number;
  monthlyDirectTransitCostMillion: number;
  monthlyAqiHealthBurdenMillion: number;
  totalMonthlyFrictionCostMillion: number;
}

export interface CommuteRentArbitrageIndifference {
  monthlyHousingDirectCostMillion: number;
  totalCostOfHousingMillion: number; // TCOH = Housing + Commute Time + Fuel/Metro + AQI Health
  arbitrageVerdict: 'URBAN_CORE_SUPERIOR' | 'SUBURB_ARBITRAGE_VIABLE' | 'INDIFFERENCE_EQUILIBRIUM';
  arbitrageVerdictFa: string;
  breakEvenCommuteMinutes: number; // Maximum commute minutes before rent savings evaporate
  netMonthlyArbitrageSurplusMillion: number; // Positive if living here beats work-hub core
  strategicAdviceFa: string;
}

export interface CasperUrbanAffordabilityReport {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  rahn80m: number;
  effectiveRentPerMonthMillion: number;
  affordability: UrbanAffordabilityStressMetrics;
  commute: CommuteOpportunityCostBreakdown;
  arbitrage: CommuteRentArbitrageIndifference;
  generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const match = hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName));
  return match ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

function resolveWorkHub(cityId: string, hubId?: string): WorkHub {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hubs = MULTI_CITY_CONFIGS[safeCity]?.workHubs ?? WORK_HUBS;
  const match = hubs.find((h) => h.id === hubId);
  return match ?? hubs[0] ?? WORK_HUBS[0];
}

/**
 * Computes PIR (Price-to-Income) and RIR (Rent-to-Income) affordability stress indices.
 */
export function computeAffordabilityStress(
  pricePerSqm: number,
  rahn80m: number,
  monthlyMedianIncomeMillion: number = 42
): UrbanAffordabilityStressMetrics {
  const safeIncome = Math.max(10, monthlyMedianIncomeMillion);
  const annualIncome = safeIncome * 12;
  const totalBuyPrice80m = pricePerSqm * 80;

  // Years of gross household income to purchase standard 80m² home
  const priceToIncomeRatio = Number((totalBuyPrice80m / annualIncome).toFixed(1));

  // Monthly rent equivalent of rahn (3% per month standard conversion)
  const monthlyRentEquivalent = rahn80m * 0.03;
  const rentToIncomeRatioPct = Number(((monthlyRentEquivalent / safeIncome) * 100).toFixed(1));

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

  return {
    priceToIncomeRatio,
    rentToIncomeRatioPct,
    affordabilityTier,
    affordabilityTierFa,
    monthlyMedianIncomeMillion: safeIncome,
  };
}

/**
 * Computes commute time opportunity cost (Alonso-Muth-Mills Value of Travel Time).
 */
export function computeCommuteOpportunityCost(
  hoodLat: number | null,
  hoodLng: number | null,
  hub: WorkHub,
  trafficScore: number = 7,
  airQualityAqi: number = 110,
  monthlyMedianIncomeMillion: number = 42
): CommuteOpportunityCostBreakdown {
  let distanceKm = 8.5;
  if (hoodLat !== null && hoodLng !== null && hub.lat !== null && hub.lng !== null) {
    distanceKm = calcDistanceKm(hoodLat, hoodLng, hub.lat, hub.lng);
  }

  // Estimated one-way commute duration in minutes
  // Base velocity: 2.2 min/km in congested urban corridors adjusted by trafficScore
  const trafficFactor = Math.max(0.7, 1.4 - (trafficScore / 10) * 0.6);
  const estimatedOneWayMinutes = Math.max(10, Math.round(distanceKm * 2.5 * trafficFactor));

  // 22 working days per month, 2 trips per day
  const monthlyCommuteHours = Number(((estimatedOneWayMinutes * 2 * 22) / 60).toFixed(1));

  // Value of Travel Time (VOT): 50% of hourly wage (160 working hours/month)
  const hourlyWageMillion = monthlyMedianIncomeMillion / 160;
  const valueOfTimePerHour = hourlyWageMillion * 0.5;
  const monthlyTimeOpportunityCostMillion = Number((monthlyCommuteHours * valueOfTimePerHour).toFixed(2));

  // Direct transit expenses (Fuel/wear or Metro/Taxi combo) ~ 75,000 Toman/day + distance variable
  const dailyTransitCostMillion = (0.075 + distanceKm * 0.005);
  const monthlyDirectTransitCostMillion = Number((dailyTransitCostMillion * 22).toFixed(2));

  // AQI Health burden: particulate matter exposure cost above WHO AQI 50
  const excessAqi = Math.max(0, airQualityAqi - 50);
  const monthlyAqiHealthBurdenMillion = Number(((excessAqi / 100) * 0.65).toFixed(2));

  const totalMonthlyFrictionCostMillion = Number(
    (monthlyTimeOpportunityCostMillion + monthlyDirectTransitCostMillion + monthlyAqiHealthBurdenMillion).toFixed(2)
  );

  return {
    workHubId: hub.id,
    workHubName: hub.name,
    distanceKm: Number(distanceKm.toFixed(1)),
    estimatedOneWayMinutes,
    monthlyCommuteHours,
    monthlyTimeOpportunityCostMillion,
    monthlyDirectTransitCostMillion,
    monthlyAqiHealthBurdenMillion,
    totalMonthlyFrictionCostMillion,
  };
}

/**
 * Computes Commute-vs-Rent Arbitrage Indifference Frontier (Alonso-Muth-Mills TCOH).
 */
export function computeCommuteRentArbitrage(
  rahn80m: number,
  commute: CommuteOpportunityCostBreakdown,
  hubCoreRahn80m: number = 2200
): CommuteRentArbitrageIndifference {
  // Monthly housing direct cost (3% monthly rent equivalent of rahn)
  const monthlyHousingDirectCostMillion = Number((rahn80m * 0.03).toFixed(2));
  const hubCoreMonthlyRentMillion = Number((hubCoreRahn80m * 0.03).toFixed(2));

  const totalCostOfHousingMillion = Number(
    (monthlyHousingDirectCostMillion + commute.totalMonthlyFrictionCostMillion).toFixed(2)
  );

  // Net monthly arbitrage surplus: (Hub Rent - Local Rent) - Commute Friction
  const monthlyRentSavingsMillion = hubCoreMonthlyRentMillion - monthlyHousingDirectCostMillion;
  const netMonthlyArbitrageSurplusMillion = Number(
    (monthlyRentSavingsMillion - commute.totalMonthlyFrictionCostMillion).toFixed(2)
  );

  // Break-even commute minutes where rent savings are completely cancelled out
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
    strategicAdviceFa = `صرفه‌جویی اجاره‌بها نسبت به مرکز قطب کار، هزینه زمان تردد و استهلاک را کاملاً پوشش داده و ماهانه ${netMonthlyArbitrageSurplusMillion.toLocaleString('fa-IR')} میلیون تومان مازاد خالص ایجاد می‌کند.`;
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
    monthlyHousingDirectCostMillion,
    totalCostOfHousingMillion,
    arbitrageVerdict,
    arbitrageVerdictFa,
    breakEvenCommuteMinutes,
    netMonthlyArbitrageSurplusMillion,
    strategicAdviceFa,
  };
}

/**
 * Master generator for CASPER Urban Affordability & Isochrone Report.
 */
export function generateCasperUrbanAffordabilityReport(
  hoodId: number,
  hoodName?: string,
  cityId: string = 'tehran',
  basePriceSqm?: number,
  workHubId?: string,
  monthlyIncomeMillion: number = 42
): CasperUrbanAffordabilityReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const hub = resolveWorkHub(cityId, workHubId);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const resolvedRahn = hood.rahn80m ?? (resolvedPrice * 80 * 0.2);
  const effectiveRent = resolvedRahn * 0.03;

  const trafficScore = hood.trafficInfo?.trafficScore ?? 7;
  const airQuality = hood.air ?? 115;

  const affordability = computeAffordabilityStress(resolvedPrice, resolvedRahn, monthlyIncomeMillion);
  const commute = computeCommuteOpportunityCost(hood.lat, hood.lng, hub, trafficScore, airQuality, monthlyIncomeMillion);
  const arbitrage = computeCommuteRentArbitrage(resolvedRahn, commute, 2400);

  return {
    hoodId: hood.id,
    hoodName: hood.name,
    cityId,
    basePriceSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    effectiveRentPerMonthMillion: Number(effectiveRent.toFixed(2)),
    affordability,
    commute,
    arbitrage,
    generatedAtIso: new Date().toISOString(),
  };
}

import crypto from 'crypto';
import type {
  ComparablePropertyCandidate,
  HedonicFactorAdjustment,
  InternalValuationDiagnostics,
  PropertyValuationInput,
  PropertyValuationResult,
  PublicValuationExplanation,
  ValuationConfidenceLevel,
  ValuationMethodology,
  ValuationModelConfiguration,
} from './types';
import { computeMissingImportantInputs, computeReproducibleInputHash } from './validation';
import { computeMedian, computeTemporalAdjustmentPct } from './evidenceAndComparableEngine';
import { calculateLandValuationAdjustments } from './rentalAndLandEngine';

const CURRENT_JALALI_YEAR = 1405;
const FAST_SALE_FACTOR = 0.945;

export function computeHedonicValuationCore(params: {
  input: PropertyValuationInput;
  hoodName: string;
  basePricePerSqmMillion: number;
  baseRahn80mMillion: number;
  geographicFallbackLevel: PublicValuationExplanation['geographicFallbackLevel'];
  comparables: ComparablePropertyCandidate[];
  includedComparables: ComparablePropertyCandidate[];
  outlierExcludedIds: string[];
  duplicateExcludedIds: string[];
  config: ValuationModelConfiguration;
  nowIso: string;
  includeDiagnostics?: boolean;
}): PropertyValuationResult {
  const {
    input,
    hoodName,
    basePricePerSqmMillion,
    baseRahn80mMillion,
    geographicFallbackLevel,
    comparables,
    includedComparables,
    outlierExcludedIds,
    duplicateExcludedIds,
    config,
    nowIso,
  } = params;

  const valuationDateIso = input.valuationDateIso ?? nowIso;
  const transactionType = input.transactionType ?? 'sale';
  const purpose =
    input.purpose ?? (transactionType === 'rent' ? 'estimated_rental_value' : 'estimated_market_value');

  const rawAdjustments: Array<{ factorId: string; labelFa: string; weightPct: number }> = [];

  if (input.propertyCategory === 'land') {
    const landAdj = calculateLandValuationAdjustments(input, basePricePerSqmMillion);
    for (const item of landAdj.adjustments) {
      rawAdjustments.push({
        factorId: item.factorId,
        labelFa: item.factorLabelFa,
        weightPct: item.impactPercent,
      });
    }
  }

  // 1. Property Category Adjustment
  const catMult = config.categoryMultipliers[input.propertyCategory] ?? 1.0;
  if (Math.abs(catMult - 1.0) > 0.001) {
    const pct = Number(((catMult - 1.0) * 100).toFixed(1));
    const catLabels: Record<string, string> = {
      commercial: 'ضریب کاربری تجاری (موقعیت کسب‌وکار)',
      office: 'ضریب کاربری اداری',
      detached_house: 'ضریب خانه ویلایی و قدرالسهم عرصه',
      villa_garden: 'ضریب ویلا-باغ و محوطه اختصاصی',
      industrial: 'ضریب کاربری صنعتی / کارگاهی',
      land_development: 'ضریب زمین و کلنگی قابل ساخت',
      agricultural: 'ضریب اراضی کشاورزی / باغی',
      mixed_use: 'ضریب کاربری مختلط (تجاری-مسکونی)',
      entire_building: 'ضریب مستغلات و ساختمان یکجا',
    };
    const factorIdMap: Record<string, string> = {
      commercial: 'category_commercial',
      office: 'category_office',
    };
    rawAdjustments.push({
      factorId: factorIdMap[input.propertyCategory] ?? `category_${input.propertyCategory}`,
      labelFa: catLabels[input.propertyCategory] ?? 'ضریب نوع ملک',
      weightPct: pct,
    });
  }

  // 2. Building Age Adjustment (except pure land/agricultural)
  if (
    input.buildYear !== undefined &&
    input.propertyCategory !== 'land' &&
    input.propertyCategory !== 'land_development' &&
    input.propertyCategory !== 'agricultural'
  ) {
    const age = Math.max(0, CURRENT_JALALI_YEAR - input.buildYear);
    let agePct = 0;
    if (age === 0) agePct = 6.5;
    else if (age <= 3) agePct = 4.0;
    else if (age <= 7) agePct = 1.0;
    else if (age <= 12) agePct = -3.5;
    else if (age <= 18) agePct = -8.0;
    else agePct = -13.5;

    rawAdjustments.push({
      factorId: 'building_age',
      labelFa: age === 0 ? 'نوساز (کلیدنخورده)' : `سن بنا (${age} سال ساخت)`,
      weightPct: agePct,
    });
  }

  // 3. Floor Level & Interaction with Elevator
  if (input.floor !== undefined) {
    let floorPct = 0;
    if (input.floor <= 0) floorPct = -5.0;
    else if (input.floor === 1) floorPct = -2.0;
    else if (input.floor <= 3) floorPct = 1.0;
    else if (input.floor <= 6) floorPct = 3.0;
    else floorPct = 5.5;

    rawAdjustments.push({
      factorId: 'floor_level',
      labelFa: `طبقه ${input.floor}`,
      weightPct: floorPct,
    });

    // Interaction effect: High floor without elevator penalty
    if (input.floor >= 3 && input.hasElevator === false) {
      rawAdjustments.push({
        factorId: 'interaction_high_floor_no_elevator',
        labelFa: `کسر طبقه بالا (${input.floor}) بدون آسانسور`,
        weightPct: config.noElevatorHighFloorPenaltyPct,
      });
    }
  }

  // 4. Elevator, Parking, Storage
  if (input.hasElevator !== undefined) {
    rawAdjustments.push({
      factorId: 'amenity_elevator',
      labelFa: input.hasElevator ? 'دارای آسانسور' : 'فاقد آسانسور',
      weightPct: input.hasElevator ? config.elevatorWeightPct : -6.0,
    });
  }

  if (input.hasParking !== undefined) {
    const extraSpacesBonus = input.parkingSpaces && input.parkingSpaces > 1 ? Math.min(6.0, (input.parkingSpaces - 1) * 2.5) : 0;
    rawAdjustments.push({
      factorId: 'amenity_parking',
      labelFa: input.hasParking ? 'دارای پارکینگ سندی' : 'فاقد پارکینگ',
      weightPct: input.hasParking ? config.parkingWeightPct + extraSpacesBonus : -6.5,
    });
  }

  if (input.hasStorage !== undefined) {
    rawAdjustments.push({
      factorId: 'amenity_storage',
      labelFa: input.hasStorage ? 'دارای انباری' : 'فاقد انباری',
      weightPct: input.hasStorage ? config.storageWeightPct : -1.5,
    });
  }

  // 5. Renovation Condition
  if (input.renovationCondition) {
    const rw = config.renovationWeightsPct[input.renovationCondition] ?? 0;
    const labels: Record<string, string> = {
      luxury_renovated: 'بازسازی لوکس و مدرن',
      renovated: 'بازسازی شده',
      standard: 'وضعیت استاندارد',
      needs_renovation: 'نیازمند بازسازی',
    };
    if (rw !== 0) {
      rawAdjustments.push({
        factorId: 'renovation_condition',
        labelFa: labels[input.renovationCondition] ?? 'وضعیت بازسازی',
        weightPct: rw,
      });
    }
  }

  // 6. Construction Quality, Orientation, View, Deed, Commercial Frontage, Land FAR, Metro Accessibility
  if (input.constructionQuality && input.constructionQuality !== 'standard') {
    const qMap = { luxury: 8.5, grade_a: 4.0, standard: 0, economy: -4.5 };
    rawAdjustments.push({
      factorId: 'construction_quality',
      labelFa: `کیفیت ساخت (${input.constructionQuality})`,
      weightPct: qMap[input.constructionQuality],
    });
  }

  if (input.unitOrientation === 'south' || input.unitOrientation === 'two_sided') {
    rawAdjustments.push({
      factorId: 'unit_orientation',
      labelFa: input.unitOrientation === 'two_sided' ? 'نورگیر دوکله / جنوبی-شمالی' : 'نورگیر جنوبی',
      weightPct: input.unitOrientation === 'two_sided' ? 3.0 : 2.0,
    });
  }

  if (input.viewQuality === 'panoramic' || input.viewQuality === 'obstructed') {
    rawAdjustments.push({
      factorId: 'view_quality',
      labelFa: input.viewQuality === 'panoramic' ? 'دید و ویو ابدی / پانوراما' : 'دید مسدود / پاسیو',
      weightPct: input.viewQuality === 'panoramic' ? 4.5 : -2.5,
    });
  }

  if (input.deedType === 'single_page') {
    rawAdjustments.push({
      factorId: 'deed_type',
      labelFa: 'سند تک‌برگ شش‌دانگ',
      weightPct: config.deedSinglePageWeightPct,
    });
  } else if (input.deedType === 'promissory' || input.deedType === 'endowment') {
    rawAdjustments.push({
      factorId: 'deed_type',
      labelFa: input.deedType === 'endowment' ? 'سند اوقافی' : 'قولنامه‌ای / وکالتی',
      weightPct: input.deedType === 'endowment' ? -8.0 : config.deedPromissoryPenaltyPct,
    });
  }

  if (input.propertyCategory === 'commercial' && input.commercialFrontageMeters !== undefined) {
    if (input.commercialFrontageMeters >= 6) {
      rawAdjustments.push({
        factorId: 'commercial_frontage',
        labelFa: `بر تجاری عالی (${input.commercialFrontageMeters} متر)`,
        weightPct: Math.min(15.0, (input.commercialFrontageMeters - 4) * 1.8),
      });
    } else if (input.commercialFrontageMeters < 3) {
      rawAdjustments.push({
        factorId: 'commercial_frontage',
        labelFa: `بر تجاری محدود (${input.commercialFrontageMeters} متر)`,
        weightPct: -6.0,
      });
    }
  }

  if (input.propertyCategory === 'land_development' && input.floorAreaRatio !== undefined) {
    const farBonus = (input.floorAreaRatio - 3.0) * 4.5;
    if (Math.abs(farBonus) >= 1.0) {
      rawAdjustments.push({
        factorId: 'land_floor_area_ratio',
        labelFa: `تراکم ساختمانی مجاز (${input.floorAreaRatio})`,
        weightPct: Number(farBonus.toFixed(1)),
      });
    }
  }

  if (input.distanceToMetroMeters !== undefined && input.distanceToMetroMeters <= 500) {
    rawAdjustments.push({
      factorId: 'transit_proximity',
      labelFa: `دسترسی عالی به ایستگاه مترو (${input.distanceToMetroMeters} متر)`,
      weightPct: 2.5,
    });
  }

  if (input.buildingAmenities && input.buildingAmenities.length > 0) {
    const luxurySet = ['pool', 'gym', 'lobby_man', 'rooftop_garden', 'smart_home'];
    const matchCount = input.buildingAmenities.filter((a) => luxurySet.includes(a)).length;
    if (matchCount > 0) {
      rawAdjustments.push({
        factorId: 'luxury_building_amenities',
        labelFa: `مشاعات ویژه (${matchCount} مورد)`,
        weightPct: Math.min(10.0, matchCount * 2.5),
      });
    }
  }

  // Rental-specific adjustments
  if (transactionType === 'rent') {
    if (input.furnishedStatus === 'furnished') {
      rawAdjustments.push({
        factorId: 'rental_furnished',
        labelFa: 'اجاره به‌صورت مبله کامل (Furnished)',
        weightPct: config.furnishedRentalPremiumPct,
      });
    } else if (input.furnishedStatus === 'semi_furnished') {
      rawAdjustments.push({
        factorId: 'rental_semi_furnished',
        labelFa: 'نیمه‌مبله',
        weightPct: Number((config.furnishedRentalPremiumPct * 0.5).toFixed(1)),
      });
    }

    if (input.leaseDurationMonths !== undefined) {
      if (input.leaseDurationMonths < 6) {
        rawAdjustments.push({
          factorId: 'lease_duration_short',
          labelFa: `قرارداد کوتاه‌مدت (${input.leaseDurationMonths} ماهه)`,
          weightPct: config.shortTermLeasePremiumPct,
        });
      } else if (input.leaseDurationMonths >= 24) {
        rawAdjustments.push({
          factorId: 'lease_duration_long',
          labelFa: `قرارداد بلندمدت (${input.leaseDurationMonths} ماهه)`,
          weightPct: config.longTermLeaseDiscountPct,
        });
      }
    }
  }

  // Apply single-factor and total-adjustment contribution caps
  const adjustments: HedonicFactorAdjustment[] = [];
  let rawTotalPct = 0;

  for (const r of rawAdjustments) {
    rawTotalPct += r.weightPct;
    const isCategoryOrLandFactor = r.factorId.startsWith('category_') || input.propertyCategory === 'land';
    const maxCap = isCategoryOrLandFactor ? 120.0 : config.maxSingleFactorContributionPct;
    const cappedWeightPct = Math.max(-maxCap, Math.min(maxCap, r.weightPct));
    const capped = Math.abs(cappedWeightPct - r.weightPct) > 0.01;
    const impact = Number(((basePricePerSqmMillion * cappedWeightPct) / 100).toFixed(2));
    const normPct = Number(cappedWeightPct.toFixed(2));
    adjustments.push({
      factorId: r.factorId,
      labelFa: r.labelFa,
      weightPct: normPct,
      impactPercent: normPct,
      impactMillionPerSqm: impact,
      direction: cappedWeightPct > 0 ? 'positive' : cappedWeightPct < 0 ? 'negative' : 'neutral',
      capped: capped || undefined,
    });
  }

  const sumAdjustedPct = adjustments.reduce((acc, a) => acc + a.weightPct, 0);
  const nonCategoryCap = input.propertyCategory === 'commercial' ? 120.0 : config.maxTotalAdjustmentPct;
  const boundedTotalPct = Math.max(-55.0, Math.min(nonCategoryCap, sumAdjustedPct));

  const rawHedonicMultiplier = 1 + rawTotalPct / 100;
  const cappedHedonicMultiplier = Math.max(0.45, 1 + boundedTotalPct / 100);
  const hedonicPsm = basePricePerSqmMillion * cappedHedonicMultiplier;

  // Blend with comparable properties if available
  let comparableWeightedPsm: number | null = null;
  let hedonicWeight = 1.0;
  let comparableWeight = 0.0;

  if (includedComparables.length > 0) {
    let wSum = 0;
    let wTotal = 0;
    for (const c of includedComparables) {
      const w = Math.max(10, c.similarityScore) * (c.isVerifiedTransaction ? 1.25 : 1.0);
      const psmToUse = c.adjustedPricePerSqmMillion ?? c.pricePerSqmMillion;
      wSum += psmToUse * w;
      wTotal += w;
    }
    if (wTotal > 0) {
      comparableWeightedPsm = Number((wSum / wTotal).toFixed(2));
      comparableWeight = includedComparables.length >= config.minComparableSampleCount ? 0.3 : 0.18;
      hedonicWeight = Number((1 - comparableWeight).toFixed(2));
    }
  }

  const blendedNominalPsm =
    comparableWeightedPsm !== null
      ? hedonicPsm * hedonicWeight + comparableWeightedPsm * comparableWeight
      : hedonicPsm;

  // Temporal adjustment when asOfHistoricalDateIso vs valuationDateIso is specified
  const temporalTrendPct = input.asOfHistoricalDateIso
    ? computeTemporalAdjustmentPct(input.asOfHistoricalDateIso, valuationDateIso, config.monthlyInflationTrendPct)
    : 0;

  const estimatedPricePerSqmMillion = Number(
    (blendedNominalPsm * (1 + temporalTrendPct / 100)).toFixed(2),
  );
  const nominalTotalMillion = Number((blendedNominalPsm * input.sqm).toFixed(1));
  const estimatedTotalMillion = Number((estimatedPricePerSqmMillion * input.sqm).toFixed(1));

  // Missing inputs & confidence classification
  const missingImportantInputs = computeMissingImportantInputs(input);
  let confidenceScore = 58;
  if (includedComparables.length >= 3) confidenceScore += 22;
  else if (includedComparables.length >= 1) confidenceScore += 12;
  if (includedComparables.some((c) => c.isVerifiedTransaction)) confidenceScore += 8;
  if (input.buildYear !== undefined) confidenceScore += 6;
  if (input.floor !== undefined) confidenceScore += 4;
  if (input.renovationCondition !== undefined) confidenceScore += 4;
  if (geographicFallbackLevel !== 'neighborhood' && geographicFallbackLevel !== 'sub_neighborhood') {
    confidenceScore -= 12;
  }
  confidenceScore -= Math.min(12, missingImportantInputs.length * 3);
  confidenceScore = Math.max(25, Math.min(98, confidenceScore));

  const confidenceLevel: ValuationConfidenceLevel =
    confidenceScore >= 80 ? 'high' : confidenceScore >= 60 ? 'medium' : 'low';

  // Uncertainty interval widens when confidence is lower or fallback was triggered
  const bandHalfWidth =
    confidenceLevel === 'high' ? 0.05 : confidenceLevel === 'medium' ? 0.08 : 0.13;
  const lowEstimateTotalMillion = Number((estimatedTotalMillion * (1 - bandHalfWidth)).toFixed(1));
  const highEstimateTotalMillion = Number((estimatedTotalMillion * (1 + bandHalfWidth)).toFixed(1));

  // Asking price range vs estimated market value
  const askingPriceLowMillion = Number((estimatedTotalMillion * 0.98).toFixed(1));
  const askingPriceHighMillion = Number((estimatedTotalMillion * 1.07).toFixed(1));

  // Rental valuation metrics
  let estimatedDepositMillion: number | undefined;
  let estimatedMonthlyRentMillion: number | undefined;
  let fullRahnEquivalentMillion: number | undefined;
  let rentalPricePerSqmThousandToman: number | undefined;

  if (input.transactionType === 'rent') {
    const baseRahnPerSqm = baseRahn80mMillion / 80;
    const adjustedRahnPerSqm = baseRahnPerSqm * cappedHedonicMultiplier;
    fullRahnEquivalentMillion = Number((adjustedRahnPerSqm * input.sqm).toFixed(1));

    const rahnRate = config.rahnToRentMonthlyRatePct / 100;
    if (input.requestedDepositMillion !== undefined && input.requestedDepositMillion < fullRahnEquivalentMillion) {
      estimatedDepositMillion = Number(input.requestedDepositMillion.toFixed(1));
      const remainingRahn = Math.max(0, fullRahnEquivalentMillion - estimatedDepositMillion);
      estimatedMonthlyRentMillion = Number((remainingRahn * rahnRate).toFixed(2));
    } else {
      estimatedDepositMillion = Number((fullRahnEquivalentMillion * 0.6).toFixed(1));
      estimatedMonthlyRentMillion = Number(((fullRahnEquivalentMillion * 0.4) * rahnRate).toFixed(2));
    }
    const monthlyEquivalentTotalMillion = fullRahnEquivalentMillion * rahnRate;
    rentalPricePerSqmThousandToman = Number(((monthlyEquivalentTotalMillion * 1000) / input.sqm).toFixed(1));
  }

  let sellerPriceDiffPct: number | undefined;
  let sellerPriceEvaluation: 'fair' | 'overpriced' | 'underpriced_bargain' | undefined;
  if (input.sellerAskingTotalMillion) {
    sellerPriceDiffPct = Number(
      (((input.sellerAskingTotalMillion - estimatedTotalMillion) / estimatedTotalMillion) * 100).toFixed(1),
    );
    if (sellerPriceDiffPct <= -6) sellerPriceEvaluation = 'underpriced_bargain';
    else if (sellerPriceDiffPct >= 7) sellerPriceEvaluation = 'overpriced';
    else sellerPriceEvaluation = 'fair';
  }

  const methodology: ValuationMethodology =
    input.propertyCategory === 'land'
      ? 'land_residual'
      : geographicFallbackLevel === 'district' || geographicFallbackLevel === 'city'
        ? 'neighborhood_baseline_fallback'
        : 'hedonic_regression';

  const positiveDriversFa = adjustments
    .filter((a) => a.direction === 'positive')
    .map((a) => `${a.labelFa} (+${a.weightPct}%)`);
  const negativeDriversFa = adjustments
    .filter((a) => a.direction === 'negative')
    .map((a) => `${a.labelFa} (${a.weightPct}%)`);

  const summaryExplanationFa =
    `برآورد ارزش ملک ${input.sqm} متری در محله ${hoodName} بر اساس قیمت پایه هر متر ${basePricePerSqmMillion} میلیون تومان، ` +
    `${adjustments.length} ضریب هدونیک ویژگی‌های ملک و ${includedComparables.length} نمونه مشابه تاییدشده انجام شد.`;

  const compPsms = includedComparables.map((c) => c.pricePerSqmMillion);
  const confirmedTransactionCount = comparables.filter(
    (c) => c.isVerifiedTransaction || c.evidenceType === 'confirmed_transaction',
  ).length;
  const askingPriceCount = comparables.length - confirmedTransactionCount;

  const explanation: PublicValuationExplanation = {
    summaryExplanationFa,
    neighborhoodBaselinePricePerSqmMillion: basePricePerSqmMillion,
    geographicFallbackLevel,
    positiveDriversFa,
    negativeDriversFa,
    comparableSummary: {
      includedCount: includedComparables.length,
      verifiedTransactionCount: includedComparables.filter((c) => c.isVerifiedTransaction).length,
      activeListingCount: includedComparables.filter((c) => !c.isVerifiedTransaction).length,
      medianComparablePricePerSqmMillion: compPsms.length > 0 ? Number(computeMedian(compPsms).toFixed(2)) : null,
    },
    confidenceExplanationFa:
      confidenceLevel === 'high'
        ? 'اطمینان بالا به دلیل کفایت نمونه‌های مشابه و تکمیل بودن ویژگی‌های کلیدی ملک'
        : confidenceLevel === 'medium'
          ? 'اطمینان متوسط بر پایه شاخص محله و نمونه‌های محدود'
          : 'اطمینان پایین به دلیل کمبود شواهد معاملاتی مستقیم در این زیربخش',
    missingImportantInputs,
    uncertaintyReasonFa:
      missingImportantInputs.length > 0
        ? `عدم ورود ویژگی‌های (${missingImportantInputs.join(', ')}) بازه عدم قطعیت را افزایش داده است.`
        : 'بازه قیمتی متناسب با پراکندگی معاملات اخیر محله محاسبه شده است.',
    modelVersion: config.modelVersion,
    configVersion: config.configVersion,
  };

  const diagnostics: InternalValuationDiagnostics | undefined = params.includeDiagnostics
    ? {
        rawHedonicMultiplier: Number(rawHedonicMultiplier.toFixed(4)),
        cappedHedonicMultiplier: Number(cappedHedonicMultiplier.toFixed(4)),
        hedonicPricePerSqmMillion: Number(hedonicPsm.toFixed(2)),
        comparableWeightedPricePerSqmMillion: comparableWeightedPsm,
        blendWeights: { hedonicWeight, comparableWeight },
        temporalAdjustmentPct: temporalTrendPct,
        outlierExcludedIds,
        duplicateExcludedIds,
        fallbackTriggered: geographicFallbackLevel !== 'neighborhood' && geographicFallbackLevel !== 'sub_neighborhood',
        reproducibleInputHash: computeReproducibleInputHash(input),
      }
    : undefined;

  return {
    id: `val_${crypto.randomBytes(8).toString('hex')}`,
    cityId: input.cityId,
    hoodId: input.hoodId,
    hoodName,
    propertyCategory: input.propertyCategory,
    transactionType,
    purpose,
    sqm: input.sqm,
    basePricePerSqmMillion,
    estimatedPricePerSqmMillion,
    estimatedTotalMillion,
    lowEstimateTotalMillion,
    highEstimateTotalMillion,
    askingPriceLowMillion,
    askingPriceHighMillion,
    fastSaleTotalMillion:
      transactionType === 'sale'
        ? Number((estimatedTotalMillion * FAST_SALE_FACTOR).toFixed(1))
        : undefined,
    estimatedDepositMillion,
    estimatedMonthlyRentMillion,
    fullRahnEquivalentMillion,
    rentalPricePerSqmThousandToman,
    nominalTotalMillion,
    inflationAdjustedTotalMillion: estimatedTotalMillion,
    temporalTrendPct,
    adjustments,
    comparables,
    dataQuality: {
      evidenceCount: comparables.length,
      confirmedTransactionCount,
      askingPriceCount,
    },
    confidenceLevel,
    confidenceScore,
    methodology,
    summaryExplanationFa,
    sellerPriceDiffPct,
    sellerPriceEvaluation,
    modelVersion: config.modelVersion,
    configVersion: config.configVersion,
    missingImportantInputs,
    explanation,
    diagnostics,
    calculatedAtIso: nowIso,
    valuationDateIso,
  };
}

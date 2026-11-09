import type {
  LandZoningCategory,
  PropertyValuationInput,
  RentalConversionAnalysis,
  ValuationFactorAdjustment,
} from './types';

export const CANONICAL_RENTAL_CONVERSION_VERSION = 'v2.0-tehran-rahn-ejareh';

/**
 * Calculates rental deposit and monthly rent equivalence without hardcoding a universal ratio.
 * Preserves original deposit, original monthly rent, conversion convention, and calculation version.
 * Standard Tehran convention is typically 2.5% to 3.0% per month (25,000 - 30,000 Toman per 1 Million Toman Rahn).
 */
export function calculateRentalDepositEquivalence(params: {
  originalDepositMillion: number;
  originalMonthlyRentMillion: number;
  monthlyConversionRatePercent?: number; // e.g. 3.0 = 3% per month
  nowIso: string;
}): RentalConversionAnalysis {
  const ratePercent = params.monthlyConversionRatePercent ?? 3.0;
  const rateFraction = ratePercent / 100;

  // Equivalent Full Rahn (رهن کامل): Deposit + (Rent / monthlyRate)
  const capitalizedRent = params.originalMonthlyRentMillion / rateFraction;
  const equivalentFullRahnMillion = Math.round(params.originalDepositMillion + capitalizedRent);

  // Equivalent Full Monthly Rent (اجاره کامل بدون رهن): Rent + (Deposit * monthlyRate)
  const convertedDepositRent = params.originalDepositMillion * rateFraction;
  const equivalentFullMonthlyRentMillion = Math.round((params.originalMonthlyRentMillion + convertedDepositRent) * 10) / 10;

  return {
    originalDepositMillion: params.originalDepositMillion,
    originalMonthlyRentMillion: params.originalMonthlyRentMillion,
    currency: 'IRT_MILLION',
    conversionConvention: `تبدیل عرف بازار (${ratePercent}٪ ماهانه / هر میلیون رهن معادل ${Math.round(ratePercent * 10000)} تومان اجاره)`,
    monthlyConversionRatePercent: ratePercent,
    equivalentFullRahnMillion,
    equivalentFullMonthlyRentMillion,
    calculationVersion: CANONICAL_RENTAL_CONVERSION_VERSION,
    calculatedAtIso: params.nowIso,
  };
}

/**
 * Specialized Land Valuation Strategy.
 * Accounts for plot frontage, corner plot orientation, density permit, and zoning classification.
 */
export function calculateLandValuationAdjustments(
  input: PropertyValuationInput,
  baseLandPricePerSqm: number,
): { adjustments: ValuationFactorAdjustment[]; netAdjustmentPercent: number } {
  const adjustments: ValuationFactorAdjustment[] = [];
  let netPercent = 0;

  // 1. Zoning classification adjustment
  const zoning = input.landZoning ?? 'residential';
  let zoningImpact = 0;
  let zoningDesc = '';

  if (zoning === 'commercial') {
    zoningImpact = 35.0;
    zoningDesc = 'پهنه تجاری؛ پتانسیل ارزش‌افزوده و درآمدزایی کسب‌وکار.';
  } else if (zoning === 'mixed') {
    zoningImpact = 18.0;
    zoningDesc = 'پهنه مختلط مسکونی-اداری-تجاری؛ انعطاف کاربری بالا.';
  } else if (zoning === 'agricultural') {
    zoningImpact = -50.0;
    zoningDesc = 'کاربری کشاورزی/باغ؛ محدودیت شدید ساخت‌وساز و تغییر کاربری.';
  } else {
    zoningDesc = 'کاربری مسکونی استاندارد مصوب طرح تفصیلی.';
  }

  if (zoningImpact !== 0) {
    const amount = Math.round((baseLandPricePerSqm * (zoningImpact / 100)) * input.sqm);
    adjustments.push({
      factorId: 'zoning',
      factorLabelFa: 'پهنه و کاربری زمین',
      impactPercent: zoningImpact,
      impactAmountMillion: amount,
      descriptionFa: zoningDesc,
    });
    netPercent += zoningImpact;
  }

  // 2. Corner plot orientation (زمین دونبش/سه‌نبش)
  if (input.isCornerPlot === true) {
    const cornerImpact = 8.5;
    const amount = Math.round((baseLandPricePerSqm * (cornerImpact / 100)) * input.sqm);
    adjustments.push({
      factorId: 'corner_plot',
      factorLabelFa: 'موقعیت نبش (دوکله/دونبش)',
      impactPercent: cornerImpact,
      impactAmountMillion: amount,
      descriptionFa: 'ملک دونبش با دسترسی دوطرفه و پتانسیل نورگیری عالی (+۸.۵٪).',
    });
    netPercent += cornerImpact;
  }

  // 3. Frontage width (بر ملک)
  if (input.frontageMeters !== undefined) {
    let frontageImpact = 0;
    let frontageDesc = '';
    if (input.frontageMeters < 8) {
      frontageImpact = -10.0;
      frontageDesc = 'بر باریک (کمتر از ۸ متر)؛ افت کیفیت نقشه و محدودیت تامین پارکینگ.';
    } else if (input.frontageMeters >= 15) {
      frontageImpact = 6.0;
      frontageDesc = 'بر عریض (بیش از ۱۵ متر)؛ پتانسیل معماری لوکس و پارکینگ‌دهی بهینه.';
    }
    if (frontageImpact !== 0) {
      const amount = Math.round((baseLandPricePerSqm * (frontageImpact / 100)) * input.sqm);
      adjustments.push({
        factorId: 'frontage',
        factorLabelFa: 'عرض بر ملک',
        impactPercent: frontageImpact,
        impactAmountMillion: amount,
        descriptionFa: frontageDesc,
      });
      netPercent += frontageImpact;
    }
  }

  // 4. Density permit (تراکم ساختمانی مجاز)
  if (input.densityPermitPercent !== undefined) {
    const standardDensity = 240; // 4 طبقه ۶۰٪
    const diff = input.densityPermitPercent - standardDensity;
    if (Math.abs(diff) >= 30) {
      const densityImpact = Math.round((diff / 60) * 4.5 * 10) / 10;
      const amount = Math.round((baseLandPricePerSqm * (densityImpact / 100)) * input.sqm);
      adjustments.push({
        factorId: 'density_permit',
        factorLabelFa: 'تراکم ساختمانی مجاز',
        impactPercent: densityImpact,
        impactAmountMillion: amount,
        descriptionFa: `تراکم مصوب ${input.densityPermitPercent}٪ نسبت به تراکم پایه ۲۴۰٪.`,
      });
      netPercent += densityImpact;
    }
  }

  return { adjustments, netAdjustmentPercent: Math.round(netPercent * 10) / 10 };
}

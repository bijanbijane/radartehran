import { Neighborhood, EvaluatedNeighborhood, toPersianNum } from './neighborhoods'; import { clampNumber } from '../utils/security'; import { formatAreaShort, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from '../utils/areaUnit';
export { computeQualityMultiplier, type QualityMultiplierSpecs } from './realMarketPriceAggregator';
export type HedonicRenovationStatus = 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation'; export const FAST_SALE_FACTOR = 0.88; export interface HedonicRenovationOption { id: HedonicRenovationStatus; label: string; shortLabel: string; baseImpactPercent: number; ageOffsetFactor: number; description: string; }
export const HEDONIC_RENOVATION_OPTIONS: HedonicRenovationOption[] = [ { id: 'luxury_renovated', label: 'بازسازی کامل لوکس / متریال برند', shortLabel: 'فول بازسازی لوکس', baseImpactPercent: 8.5, ageOffsetFactor: 0.45, description: 'نوسازی کامل تاسیسات، کابینت، کف و مشاعات با متریال درجه یک؛ جبران ۴۵٪ استهلاک سنی بنا.', }, { id: 'renovated', label: 'بازسازی‌شده تمیز و به‌روز', shortLabel: 'بازسازی‌شده', baseImpactPercent: 4.5, ageOffsetFactor: 0.25, description: 'بازسازی نقاشی، کابینت و سرویس‌ها بدون هزینه تعمیرات بدو ورود؛ جبران ۲۵٪ استهلاک سنی.', }, { id: 'standard', label: 'سالم و قابل سکونت (فابریک)', shortLabel: 'سالم و معمولی', baseImpactPercent: 0, ageOffsetFactor: 0, description: 'وضعیت استاندارد و متعارف متناسب با سال ساخت بدون بازسازی اساسی.', }, { id: 'needs_renovation', label: 'نیازمند بازسازی اساسی / فرسوده', shortLabel: 'نیازمند بازسازی', baseImpactPercent: -9.5, ageOffsetFactor: 0, description: 'نیازمند تعویض لوله‌کشی، کابینت، کف و سرویس‌ها؛ کسر هزینه بازسازی از قیمت پایه.', }, ]; export interface HedonicInputParams { neighborhood: Neighborhood | EvaluatedNeighborhood; sqm: number; buildYear: number; renovationStatus: HedonicRenovationStatus; floor: number; totalFloors?: number; hasElevator?: boolean;
  hasParking?: boolean; hasStorage?: boolean; parkingAdjustmentPercent?: number; sellerAskingTotalMillion?: number; currentJalaliYear?: number; } export interface HedonicFactorImpact {
  id: 'age' | 'renovation' | 'floor' | 'sqm' | 'amenities'; label: string; valueLabel: string; impactPercent: number; impactPerSqmMillion: number; impactTotalMillion: number; explanation: string; }
export interface HedonicValuationResult { hoodId: number; hoodName: string; hoodZone: string; sqm: number; buildYear: number; buildingAgeYears: number; floor: number; renovationStatus: HedonicRenovationStatus; renovationLabel: string; hoodBasePerSqm: number; hedonicPerSqm: number; hedonicTotalMillion: number; hedonicTotalBillion: number;
  hoodAverageTotalMillion: number; hoodAverageTotalBillion: number; diffPerSqmMillion: number; diffTotalMillion: number; diffFromHoodAvgPercent: number; comparisonStatus: 'above_average' | 'at_average' | 'below_average'; sensitivityRangeMillion: { min: number; max: number };
  confidenceRangeMillion: { min: number; max: number }; fastSaleTotalMillion: number; estimatedRahnMillion: number; factors: HedonicFactorImpact[]; netAdjustmentPercent: number; expertSummaryText: string; sellerPriceEvaluation?: {
    askingTotalMillion: number; askingPerSqm: number; gapMillion: number; gapPercent: number; verdict: 'bargain' | 'fair' | 'overpriced'; verdictLabel: string; verdictDescription: string; }; }
export function getCurrentJalaliYear(referenceDate: Date = new Date()): number { try { const formatted = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' }).format(referenceDate); const parsed = Number.parseInt(formatted.replace(/[^\d]/g, ''), 10);
    if (Number.isInteger(parsed) && parsed >= 1400 && parsed <= 1500) return parsed; } catch { /* fallback */ }
  return 1405; }
export function calculateHedonicValuation(params: HedonicInputParams): HedonicValuationResult { const currentYear = params.currentJalaliYear ?? getCurrentJalaliYear(); const safeSqm = clampNumber(params.sqm, 30, 600, 85); const safeBuildYear = clampNumber(params.buildYear, 1365, currentYear, 1400); const areaUnit = getStoredAreaUnit(), intlCurrency = getStoredIntlCurrency();
  const buildingAge = Math.max(0, currentYear - safeBuildYear); const safeFloor = clampNumber(params.floor, -1, 30, 3);
  const safeTotalFloors = clampNumber(params.totalFloors ?? 5, 1, 40, 5); const hasElevator = params.hasElevator ?? true;
  const hasParking = params.hasParking ?? true; const hasStorage = params.hasStorage ?? true;
  const hoodBasePerSqm = Math.max(15, Number((params.neighborhood as any)?.baseBuyPerSqm ?? params.neighborhood?.buyPerSqm) || 120); const hoodBaseRahn80m = Math.max(100, Number(params.neighborhood?.rahn80m) || 1200);
  let rawAgeImpactPercent = 0;
  if (buildingAge === 0) {
    rawAgeImpactPercent = 6.5; // نوساز کلیدنخورده ۱۴۰۵
  } else if (buildingAge === 1) {
    rawAgeImpactPercent = 4.5; // یک‌ساله در حد نوساز
  } else if (buildingAge <= 4) {
    rawAgeImpactPercent = 2.0 - (buildingAge - 2) * 0.8; // ۲ تا ۴ سال ساخت
  } else if (buildingAge <= 10) {
    rawAgeImpactPercent = -(buildingAge - 4) * 1.1; // ۵ تا ۱۰ سال ساخت
  } else if (buildingAge <= 20) {
    rawAgeImpactPercent = -6.6 - (buildingAge - 10) * 1.25; // ۱۱ تا ۲۰ سال ساخت
  } else {
    rawAgeImpactPercent = Math.max(-26.0, -19.1 - (buildingAge - 20) * 0.7);
  }
  const renoOption =
    HEDONIC_RENOVATION_OPTIONS.find((r) => r.id === params.renovationStatus) ||
    HEDONIC_RENOVATION_OPTIONS[2];
  let effectiveRenovationPercent = renoOption.baseImpactPercent;
  if (buildingAge <= 2 && (params.renovationStatus === 'renovated' || params.renovationStatus === 'luxury_renovated')) {
    effectiveRenovationPercent = params.renovationStatus === 'luxury_renovated' ? 3.5 : 1.0;
  } else if (buildingAge > 5 && rawAgeImpactPercent < 0 && renoOption.ageOffsetFactor > 0) {
    const recoveredDepreciation = Math.abs(rawAgeImpactPercent) * renoOption.ageOffsetFactor;
    effectiveRenovationPercent = Math.round((renoOption.baseImpactPercent * 0.65 + recoveredDepreciation) * 10) / 10;
  }
  let floorImpactPercent = 0;
  let floorExplanation = '';
  if (safeFloor < 0) {
    floorImpactPercent = -8.5;
    floorExplanation = 'واحد زیرهمکف؛ افت نورگیری و دید نسبت به طبقات استاندارد.';
  } else if (safeFloor === 0) {
    floorImpactPercent = -5.5;
    floorExplanation = 'طبقه همکف؛ مجاورت با لابی/حیاط و کاهش نسبی حریم صوتی.';
  } else if (safeFloor === 1) {
    floorImpactPercent = -1.8;
    floorExplanation = 'طبقه اول (روی پیلوت/پارکینگ)؛ کمی سردتر در زمستان نسبت به طبقات میانی.';
  } else if (safeFloor === 2) {
    floorImpactPercent = 0;
    floorExplanation = 'طبقه دوم؛ طبقه مرجع و استاندارد قیمت‌گذاری در بازار مسکن.';
  } else if (!hasElevator && safeFloor >= 3) {
    floorImpactPercent = -3.5 * (safeFloor - 1);
    floorExplanation = `طبقه ${toPersianNum(safeFloor)} بدون آسانسور؛ افت تقاضا به دلیل پله‌خور بودن.`;
  } else if (safeFloor <= 5) {
    floorImpactPercent = (safeFloor - 2) * 1.5;
    floorExplanation = `طبقه ${toPersianNum(safeFloor)}؛ نورگیری مطلوب‌تر و فاصله از سر و صدای گذر (+۱.۵٪ به ازای هر طبقه).`;
  } else {
    floorImpactPercent = Math.min(10.5, 4.5 + (safeFloor - 5) * 0.75);
    floorExplanation = `طبقه ${toPersianNum(safeFloor)}؛ دید باز، نور عالی و آرامش صوتی طبقات بالا.`;
  }
  if (safeFloor === safeTotalFloors && buildingAge >= 15 && safeTotalFloors >= 4) {
    floorImpactPercent -= 1.0;
  }
  let sqmImpactPercent = 0;
  let sqmExplanation = '';
  if (safeSqm < 55) {
    sqmImpactPercent = 4.0;
    sqmExplanation = 'متراژ نقلی و پرمتقاضی؛ نقدشوندگی بسیار بالا و قیمت متری بالاتر از میانگین.';
  } else if (safeSqm <= 70) {
    sqmImpactPercent = 2.0;
    sqmExplanation = 'متراژ اقتصادی محبوب زوج‌های جوان و سرمایه‌گذاران؛ تقاضای بالا.';
  } else if (safeSqm <= 115) {
    sqmImpactPercent = 0;
    sqmExplanation = 'متراژ استاندارد و مرجع معاملات محله (بدون انحراف متراژی).';
  } else if (safeSqm <= 165) {
    sqmImpactPercent = hoodBasePerSqm >= 160 ? 2.5 : -1.5;
    sqmExplanation =
      hoodBasePerSqm >= 160
        ? 'متراژ خانوادگی استاندارد در بافت مرغوب با تقاضای مصرفی بالا.'
        : 'متراژ بالاتر از عرف بودجه منطقه؛ کاهش جزئی سرعت نقدشوندگی.';
  } else {
    sqmImpactPercent = hoodBasePerSqm >= 180 ? 5.0 : -4.0;
    sqmExplanation =
      hoodBasePerSqm >= 180
        ? 'واحد بزرگ‌متراژ لوکس / برج‌باغ با مشاعات اختصاصی در منطقه اعیانی.'
        : 'متراژ بزرگ‌تر از کشش نقدینگی عرف محله؛ تعدیل نرخ هر متر مربع.';
  }
  let amenitiesImpactPercent = 0;
  const missingAmenities: string[] = [];
  if (typeof params.parkingAdjustmentPercent === 'number' && Number.isFinite(params.parkingAdjustmentPercent)) {
    amenitiesImpactPercent += params.parkingAdjustmentPercent;
    if (params.parkingAdjustmentPercent < 0) {
      missingAmenities.push(`تعدیل پارکینگ (${toPersianNum(params.parkingAdjustmentPercent)}٪)`);
    }
  } else if (!hasParking) {
    amenitiesImpactPercent -= 7.5;
    missingAmenities.push('بدون پارکینگ سندی (-۷.۵٪)');
  }
  if (!hasElevator) {
    if (safeFloor === 2) {
      amenitiesImpactPercent -= 3.5;
      missingAmenities.push('بدون آسانسور در طبقه دوم (-۳.۵٪)');
    } else if (safeFloor >= 3) {
      missingAmenities.push(`بدون آسانسور در طبقه ${toPersianNum(safeFloor)}`);
    } else {
      missingAmenities.push('فاقد آسانسور');
    }
  }
  if (!hasStorage) {
    amenitiesImpactPercent -= 1.5;
    missingAmenities.push('بدون انباری (-۱.۵٪)');
  }
  if (hasParking && hasElevator && hasStorage && params.parkingAdjustmentPercent === undefined) {
    amenitiesImpactPercent = 1.5;
  }
  const rawNetPercent =
    rawAgeImpactPercent +
    effectiveRenovationPercent +
    floorImpactPercent +
    sqmImpactPercent +
    amenitiesImpactPercent;
  const netAdjustmentPercent = Math.round(clampNumber(rawNetPercent, -42, 35, 0) * 10) / 10;
  const hedonicPerSqm = Math.max(
    10,
    Math.round(hoodBasePerSqm * (1 + netAdjustmentPercent / 100) * 10) / 10
  );
  const hedonicTotalMillion = Math.round(hedonicPerSqm * safeSqm);
  const hedonicTotalBillion = Math.round((hedonicTotalMillion / 1000) * 100) / 100;
  const hoodAverageTotalMillion = Math.round(hoodBasePerSqm * safeSqm);
  const hoodAverageTotalBillion = Math.round((hoodAverageTotalMillion / 1000) * 100) / 100;
  const diffPerSqmMillion = Math.round((hedonicPerSqm - hoodBasePerSqm) * 10) / 10;
  const diffTotalMillion = hedonicTotalMillion - hoodAverageTotalMillion;
  const diffFromHoodAvgPercent =
    Math.round(((hedonicPerSqm - hoodBasePerSqm) / Math.max(1, hoodBasePerSqm)) * 1000) / 10;
  let comparisonStatus: 'above_average' | 'at_average' | 'below_average' = 'at_average';
  if (diffFromHoodAvgPercent > 1.5) {
    comparisonStatus = 'above_average';
  } else if (diffFromHoodAvgPercent < -1.5) {
    comparisonStatus = 'below_average';
  }
  const sensitivityRangeMillion = {
    min: Math.round(hedonicTotalMillion * 0.965),
    max: Math.round(hedonicTotalMillion * 1.035),
  };
  const confidenceRangeMillion = sensitivityRangeMillion;
  const fastSaleTotalMillion = Math.round(hedonicTotalMillion * FAST_SALE_FACTOR);
  const rahnAdjustmentMultiplier = Math.max(
    0.72,
    Math.min(1.25, 1 + (netAdjustmentPercent * 0.65) / 100)
  );
  const estimatedRahnMillion = Math.round(
    hoodBaseRahn80m * (safeSqm / 80) * rahnAdjustmentMultiplier
  );
  const makeFactor = (
    id: HedonicFactorImpact['id'],
    label: string,
    valueLabel: string,
    pct: number,
    explanation: string
  ): HedonicFactorImpact => {
    const roundedPct = Math.round(pct * 10) / 10;
    const perSqm = Math.round(((hoodBasePerSqm * roundedPct) / 100) * 10) / 10;
    const totalM = Math.round(perSqm * safeSqm);
    return {
      id,
      label,
      valueLabel,
      impactPercent: roundedPct,
      impactPerSqmMillion: perSqm,
      impactTotalMillion: totalM,
      explanation,
    };
  };
  const factors: HedonicFactorImpact[] = [
    makeFactor(
      'age',
      'سال ساخت و سن بنا',
      buildingAge === 0
        ? `نوساز (${toPersianNum(safeBuildYear)})`
        : `ساخت ${toPersianNum(safeBuildYear)} (${toPersianNum(buildingAge)} ساله)`,
      rawAgeImpactPercent,
      buildingAge <= 1
        ? 'پریمیوم واحد نوساز و استانداردهای روز سازه و مشاعات.'
        : `استهلاک طبیعی سال ساخت (${toPersianNum(buildingAge)} سال) با حفظ ارزش پایه قدرالسهم زمین.`
    ),
    makeFactor(
      'renovation',
      'وضعیت نوسازی و متریال',
      renoOption.shortLabel,
      effectiveRenovationPercent,
      renoOption.description
    ),
    makeFactor(
      'floor',
      'طبقه و تراز ارتفاعی',
      safeFloor === 0
        ? 'طبقه همکف'
        : safeFloor < 0
        ? 'زیرهمکف'
        : `طبقه ${toPersianNum(safeFloor)} از ${toPersianNum(safeTotalFloors)}`,
      floorImpactPercent,
      floorExplanation
    ),
    makeFactor(
      'sqm',
      'کشش متراژ در محله',
      areaUnit === 'sqft' ? formatAreaShort(safeSqm, areaUnit) : `${toPersianNum(safeSqm)} متر مربع`,
      sqmImpactPercent,
      sqmExplanation
    ),
    makeFactor(
      'amenities',
      'امکانات سندی (پارکینگ/آسانسور/انباری)',
      missingAmenities.length === 0 ? 'فول امکانات سندی' : missingAmenities.join('، '),
      amenitiesImpactPercent,
      missingAmenities.length === 0
        ? 'دارای پارکینگ، آسانسور و انباری کامل مطابق عرف بالای بازار.'
        : 'کسر ارزش به دلیل کسری امکانات سندی واحد.'
    ),
  ];
  const comparisonWord =
    comparisonStatus === 'above_average'
      ? `${toPersianNum(Math.abs(diffFromHoodAvgPercent))}٪ بالاتر از میانگین محله`
      : comparisonStatus === 'below_average'
      ? `${toPersianNum(Math.abs(diffFromHoodAvgPercent))}٪ پایین‌تر از میانگین محله`
      : 'منطبق با میانگین عرف محله';
  const intlSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hedonicTotalMillion, intlCurrency)})` : '';
  const expertSummaryText = `بر اساس الگوریتم هدونیک در محله ${params.neighborhood.name}، ارزش کارشناسی این واحد ${toPersianNum(safeSqm)} متری (ساخت ${toPersianNum(safeBuildYear)}، ${renoOption.shortLabel}، ${
    safeFloor === 0 ? 'همکف' : `طبقه ${toPersianNum(safeFloor)}`
  }) معادل متری ${toPersianNum(hedonicPerSqm)} میلیون تومان و جمعاً ${toPersianNum(hedonicTotalBillion)} میلیارد تومان${intlSuffix} برآورد می‌شود که ${comparisonWord} (${toPersianNum(hoodBasePerSqm)} میلیون/متر) قرار دارد.`;
  let sellerPriceEvaluation: HedonicValuationResult['sellerPriceEvaluation'] = undefined;
  if (
    typeof params.sellerAskingTotalMillion === 'number' &&
    params.sellerAskingTotalMillion > 100
  ) {
    const askingTotal = Math.round(params.sellerAskingTotalMillion);
    const askingPerSqm = Math.round((askingTotal / safeSqm) * 10) / 10;
    const gapMillion = askingTotal - hedonicTotalMillion;
    const gapPercent =
      Math.round(((askingTotal - hedonicTotalMillion) / Math.max(1, hedonicTotalMillion)) * 1000) /
      10;
    let verdict: 'bargain' | 'fair' | 'overpriced' = 'fair';
    let verdictLabel = 'به قیمت و منصفانه (محدوده کارشناسی)';
    let verdictDescription = `قیمت اعلامی فروشنده تنها ${toPersianNum(Math.abs(gapPercent))}٪ با ارزش کارشناسی هدونیک فاصله دارد و در بازه منطقی معامله است.`;
    if (gapPercent <= -5.0) {
      verdict = 'bargain';
      verdictLabel = `شکار و خوش‌قیمت (${toPersianNum(Math.abs(gapPercent))}٪ زیر کارشناسی)`;
      verdictDescription = `قیمت فروشنده ${toPersianNum(Math.abs(gapMillion))} میلیون تومان کمتر از ارزش واقعی هدونیک این واحد در ${params.neighborhood.name} است و گزینه ارزنده‌ای برای خرید محسوب می‌شود.`;
    } else if (gapPercent >= 5.5) {
      verdict = 'overpriced';
      verdictLabel = `دارای حباب قیمتی (+${toPersianNum(gapPercent)}٪ بالاتر از کارشناسی)`;
      verdictDescription = `قیمت پیشنهادی مالک ${toPersianNum(gapMillion)} میلیون تومان بالاتر از ارزش کارشناسی هدونیک است؛ توصیه می‌شود در مذاکره تا سقف ${toPersianNum(hedonicTotalBillion)} میلیارد تومان چانه‌زنی کنید.`;
    }
    sellerPriceEvaluation = {
      askingTotalMillion: askingTotal,
      askingPerSqm,
      gapMillion,
      gapPercent,
      verdict,
      verdictLabel,
      verdictDescription,
    };
  }
  return {
    hoodId: params.neighborhood.id,
    hoodName: params.neighborhood.name,
    hoodZone: params.neighborhood.zone,
    sqm: safeSqm,
    buildYear: safeBuildYear,
    buildingAgeYears: buildingAge,
    floor: safeFloor,
    renovationStatus: params.renovationStatus,
    renovationLabel: renoOption.label,
    hoodBasePerSqm,
    hedonicPerSqm,
    hedonicTotalMillion,
    hedonicTotalBillion,
    hoodAverageTotalMillion,
    hoodAverageTotalBillion,
    diffPerSqmMillion,
    diffTotalMillion,
    diffFromHoodAvgPercent,
    comparisonStatus, sensitivityRangeMillion, confidenceRangeMillion, fastSaleTotalMillion, estimatedRahnMillion, factors, netAdjustmentPercent, expertSummaryText, sellerPriceEvaluation, }; }
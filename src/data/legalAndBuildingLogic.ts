import { toPersianNum } from './neighborhoods'; import { CityId, MULTI_CITY_CONFIGS } from './multiCityData'; import { formatAreaShort, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export interface PropertyTaxParams { monthlyRentMillion: number; rahnMillion: number; sqm: number; city: CityId; vacantMonths?: number; vacantYear?: 1 | 2 | 3; imputedRahnAnnualRatePercent?: number; qualifiesForAreaExemption?: boolean; qualifiesForAnnualIncomeExemption?: boolean; officialTaxableRentalBaseMillion?: number; }
export interface PropertyTaxResult { taxableRentalIncomeAnnualMillion: number; isAreaExempt: boolean; annualRentalTaxMillion: number | null; vacantHomeTaxAnnualMillion: number | null; explanation: string; } export function calculatePropertyTaxes(params: PropertyTaxParams): PropertyTaxResult { const monthlyRentMillion = Math.max(0, Number(params.monthlyRentMillion) || 0); const rahnMillion = Math.max(0, Number(params.rahnMillion) || 0); const sqm = Math.max(1, Number(params.sqm) || 80); const city = params.city; const vacantMonths = Math.min(12, Math.max(0, Number(params.vacantMonths) || 0)); const imputedRate = Math.max(0, Math.min(100, Number(params.imputedRahnAnnualRatePercent ?? 18))) / 100; const annualGrossRentMillion = (monthlyRentMillion * 12) + (rahnMillion * imputedRate); const netTaxableRentMillion = annualGrossRentMillion * 0.75; const exemptLimitSqm = city === 'tehran' ? 150 : 200; const isAreaExempt = Boolean( (params.qualifiesForAreaExemption && sqm <= exemptLimitSqm) || (params.qualifiesForAnnualIncomeExemption && netTaxableRentMillion <= 144) ); let annualRentalTaxMillion: number | null = 0; if (!isAreaExempt) { const taxableSqmRatio = params.qualifiesForAreaExemption ? Math.max(0, (sqm - exemptLimitSqm) / sqm) : 1; const incomeDeduction = params.qualifiesForAnnualIncomeExemption ? 144 : 0; const taxablePortion = Math.max(0, netTaxableRentMillion * taxableSqmRatio - incomeDeduction);
    annualRentalTaxMillion = taxablePortion <= 200 ? taxablePortion * 0.15 : (200 * 0.15) + ((taxablePortion - 200) * 0.20); annualRentalTaxMillion = Math.round(annualRentalTaxMillion * 10) / 10; } const vacantMultiplier = params.vacantYear === 2 ? 12 : params.vacantYear === 3 ? 18 : 6; let vacantHomeTaxAnnualMillion: number | null = 0; if (vacantMonths > 4) { vacantHomeTaxAnnualMillion = typeof params.officialTaxableRentalBaseMillion === 'number' && params.officialTaxableRentalBaseMillion > 0
      ? Math.round(params.officialTaxableRentalBaseMillion * 0.15 * vacantMultiplier * ((vacantMonths - 4) / 12) * 10) / 10
      : null; } return { taxableRentalIncomeAnnualMillion: Math.round(netTaxableRentMillion), isAreaExempt, annualRentalTaxMillion, vacantHomeTaxAnnualMillion, explanation: 'برآورد آموزشی بر اساس فروض ورودی است؛ معافیت ماده ۵۳ و مالیات خانه خالی ماده ۵۴ مکرر وابسته به مجموع متراژ املاک مالک، ثبت در سامانه املاک و اسکان، و ضرایب رسمی اداره مالیات است.', }; } export interface InheritanceParams { propertyTotalValueMillion: number; hasSpouse: boolean; spouseType: 'wife' | 'husband';
  sonsCount: number; daughtersCount: number; hasMother: boolean; hasFather: boolean; officialTaxableEstateValueMillion?: number; estateTaxRatePercent?: number; deathAfter1395?: boolean; }
export interface InheritanceShareItem { relation: string; count: number; fractionText: string; sharePercent: number; totalValueMillion: number; perPersonValueMillion: number; }
export interface InheritanceResult { shares: InheritanceShareItem[]; estateTaxEstimateMillion: number | null; legalScopeNotice?: string; }
export function calculateInheritanceShares(params: InheritanceParams): InheritanceResult { const propertyTotalValueMillion = Math.max(0, Number(params.propertyTotalValueMillion) || 0); const sonsCount = Math.max(0, Math.floor(Number(params.sonsCount) || 0)); const daughtersCount = Math.max(0, Math.floor(Number(params.daughtersCount) || 0)); const { hasSpouse, spouseType, hasMother, hasFather } = params; const shares: InheritanceShareItem[] = [];
  let remainingRatio = 1.0; const hasChildren = sonsCount > 0 || daughtersCount > 0; if (hasSpouse) { const spouseRatio = spouseType === 'wife' ? (hasChildren ? 1 / 8 : 1 / 4) : (hasChildren ? 1 / 4 : 1 / 2); const fractionText = spouseType === 'wife'
      ? (hasChildren ? '۱/۸ (یک‌هشتم - صرفاً از قیمت ابنیه و اشجار، ماده ۹۴۶ ق.م)' : '۱/۴ (یک‌چهارم - صرفاً از قیمت ابنیه و اشجار، ماده ۹۴۶ ق.م)')
      : (hasChildren ? '۱/۴ (یک‌چهارم)' : '۱/۲ (نصف)'); remainingRatio -= spouseRatio;
    const val = Math.round(propertyTotalValueMillion * spouseRatio * 10) / 10; shares.push({ relation: spouseType === 'wife' ? 'همسر (زوجه)' : 'همسر (زوج)', count: 1, fractionText, sharePercent: Math.round(spouseRatio * 1000) / 10, totalValueMillion: val, perPersonValueMillion: val }); }
  if (hasMother) { const motherRatio = hasChildren ? 1 / 6 : 1 / 3; remainingRatio -= motherRatio;
    const val = Math.round(propertyTotalValueMillion * motherRatio * 10) / 10; shares.push({ relation: 'مادر متوفی', count: 1, fractionText: hasChildren ? '۱/۶ (یک‌ششم)' : '۱/۳ (یک‌سوم فرض اولیه؛ قابل تغییر در صورت حاجب اخوه)', sharePercent: Math.round(motherRatio * 1000) / 10, totalValueMillion: val, perPersonValueMillion: val }); }
  if (hasFather) { const fatherRatio = 1 / 6; remainingRatio -= fatherRatio; const val = Math.round(propertyTotalValueMillion * fatherRatio * 10) / 10; shares.push({ relation: 'پدر متوفی', count: 1, fractionText: '۱/۶ (یک‌ششم)', sharePercent: Math.round(fatherRatio * 1000) / 10, totalValueMillion: val, perPersonValueMillion: val }); }
  const safeRemaining = Math.max(0, remainingRatio); const totalChildUnits = (sonsCount * 2) + daughtersCount; if (totalChildUnits > 0) { const perUnitRatio = safeRemaining / totalChildUnits; if (sonsCount > 0) {
      const sonTotalRatio = perUnitRatio * 2 * sonsCount; const totalVal = Math.round(propertyTotalValueMillion * sonTotalRatio * 10) / 10; const perSonValue = Math.round((totalVal / sonsCount) * 10) / 10; shares.push({
        relation: 'پسران', count: sonsCount,
        fractionText: `${toPersianNum(sonsCount)} سهم دوبرابری (${toPersianNum(Math.round(sonTotalRatio * 100))}٪)`,
        sharePercent: Math.round(sonTotalRatio * 1000) / 10, totalValueMillion: totalVal, perPersonValueMillion: perSonValue,
      });
    }
    if (daughtersCount > 0) {
      const daughterTotalRatio = perUnitRatio * daughtersCount;
      const totalVal = Math.round(propertyTotalValueMillion * daughterTotalRatio * 10) / 10;
      const perDaughterValue = Math.round((totalVal / daughtersCount) * 10) / 10;
      shares.push({
        relation: 'دختران', count: daughtersCount,
        fractionText: `${toPersianNum(daughtersCount)} سهم یک‌برابری (${toPersianNum(Math.round(daughterTotalRatio * 100))}٪)`,
        sharePercent: Math.round(daughterTotalRatio * 1000) / 10,
        totalValueMillion: totalVal, perPersonValueMillion: perDaughterValue,
      });
    }
  } else if (safeRemaining > 0.001) {
    if (hasFather) {
      const idx = shares.findIndex((s) => s.relation.includes('پدر'));
      const newRatio = (1 / 6) + safeRemaining;
      const valM = Math.round(propertyTotalValueMillion * newRatio * 10) / 10;
      shares[idx] = {
        ...shares[idx],
        fractionText: 'باقیمانده به قرابت پس از فرض همسر/مادر (ماده ۹۰۶ ق.م)',
        sharePercent: Math.round(newRatio * 1000) / 10,
        totalValueMillion: valM, perPersonValueMillion: valM,
      };
    } else if (hasMother) {
      const idx = shares.findIndex((s) => s.relation.includes('مادر'));
      const newRatio = (1 / 3) + safeRemaining;
      const valM = Math.round(propertyTotalValueMillion * newRatio * 10) / 10;
      shares[idx] = {
        ...shares[idx],
        fractionText: '۱/۳ به فرض + باقیمانده به رد (در فرض نبود حاجب، ماده ۹۰۵ ق.م)',
        sharePercent: Math.round(newRatio * 1000) / 10,
        totalValueMillion: valM, perPersonValueMillion: valM,
      };
    } else if (hasSpouse) {
      const idx = shares.findIndex((s) => s.relation.includes('همسر'));
      const valM = Math.round(propertyTotalValueMillion * safeRemaining * 10) / 10;
      shares.push({
        relation: 'مازاد ترکه (نیازمند بررسی وراث طبقات بعدی یا رد به زوج در نبود کل وراث)',
        count: 1,
        fractionText: `${toPersianNum(Math.round(safeRemaining * 1000) / 10)}٪ مستلزم بررسی گواهی انحصار وراثت`,
        sharePercent: Math.round(safeRemaining * 1000) / 10,
        totalValueMillion: valM, perPersonValueMillion: valM,
      });
      if (idx >= 0) shares[idx].fractionText = `${shares[idx].fractionText} (رد مازاد به زوجه فقط در شرایط خاص قانونی بررسی می‌شود)`;
    } else {
      const valM = Math.round(propertyTotalValueMillion * 10) / 10;
      shares.push({
        relation: 'سایر وراث قانونی (طبقه دوم/سوم)', count: 1,
        fractionText: 'کل ترکه به قرابت (۱۰۰٪)', sharePercent: 100,
        totalValueMillion: valM, perPersonValueMillion: valM,
      });
    }
  }
  const estateTaxEstimateMillion =
    params.deathAfter1395 !== false &&
    typeof params.officialTaxableEstateValueMillion === 'number' &&
    params.officialTaxableEstateValueMillion > 0 &&
    typeof params.estateTaxRatePercent === 'number' &&
    params.estateTaxRatePercent >= 0
      ? Math.round(params.officialTaxableEstateValueMillion * (params.estateTaxRatePercent / 100) * 10) / 10
      : null;
  return {
    shares,
    estateTaxEstimateMillion,
    legalScopeNotice: 'این محاسبه صرفاً تخمین اولیه برای طبقه اول وراث بدون احتساب دیون، وصیت تا ثلث، مهریه، حاجب اخوه و ارزش معاملاتی ماده ۱۷ ق.م.م است.',
  };
}
export interface BuildingBillParams {
  buildingName: string; monthName: string; totalCleaningThousand: number;
  totalElevatorServiceThousand: number; totalSharedWaterPowerThousand: number;
  totalReserveFundThousand: number; totalUnits: number; unitNumber: number;
  unitOccupants: number; totalBuildingOccupants: number; unitSqm: number; totalBuildingSqm: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}
export interface BuildingBillResult {
  isValid: boolean; validationError?: string; totalBuildingExpensesThousand: number;
  unitFixedShareThousand: number; unitOccupantShareThousand: number;
  unitSqmShareThousand: number; unitTotalBillThousand: number; whatsappMessageText: string;
}
function formatTomanFromThousandToman(valueThousand: number): string {
  const toman = Math.round(valueThousand * 1000);
  return `${toPersianNum(toman.toLocaleString('en-US'))} تومان`;
}
export function generateBuildingChargeBill(params: BuildingBillParams): BuildingBillResult {
  const buildingName = (params.buildingName || 'ساختمان').trim();
  const monthName = (params.monthName || 'جاری').trim();
  const totalCleaningThousand = Number(params.totalCleaningThousand);
  const totalElevatorServiceThousand = Number(params.totalElevatorServiceThousand);
  const totalSharedWaterPowerThousand = Number(params.totalSharedWaterPowerThousand);
  const totalReserveFundThousand = Number(params.totalReserveFundThousand);
  const totalUnits = Number(params.totalUnits);
  const unitNumber = Number(params.unitNumber);
  const unitOccupants = Number(params.unitOccupants);
  const totalBuildingOccupants = Number(params.totalBuildingOccupants);
  const unitSqm = Number(params.unitSqm);
  const totalBuildingSqm = Number(params.totalBuildingSqm);
  const expensesValid = [totalCleaningThousand, totalElevatorServiceThousand, totalSharedWaterPowerThousand, totalReserveFundThousand]
    .every((n) => Number.isFinite(n) && n >= 0);
  if (
    !expensesValid ||
    !Number.isInteger(totalUnits) || totalUnits < 1 ||
    !Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > totalUnits ||
    !Number.isInteger(unitOccupants) || unitOccupants < 0 ||
    !Number.isInteger(totalBuildingOccupants) || totalBuildingOccupants < Math.max(1, unitOccupants) ||
    !Number.isFinite(unitSqm) || unitSqm <= 0 ||
    !Number.isFinite(totalBuildingSqm) || totalBuildingSqm < unitSqm
  ) {
    return {
      isValid: false,
      validationError: 'ورودی‌های شارژ ساختمان نامعتبر است؛ تعداد کل نفرات و زیربنای کل نباید کمتر از مقادیر همان واحد باشد.',
      totalBuildingExpensesThousand: 0, unitFixedShareThousand: 0, unitOccupantShareThousand: 0,
      unitSqmShareThousand: 0, unitTotalBillThousand: 0, whatsappMessageText: '',
    };
  }
  const totalBuildingExpensesThousand =
    totalCleaningThousand + totalElevatorServiceThousand + totalSharedWaterPowerThousand + totalReserveFundThousand;
  const unitFixedShareThousand = Math.round((totalCleaningThousand + totalElevatorServiceThousand) / totalUnits);
  const unitOccupantShareThousand = Math.round(totalSharedWaterPowerThousand * (unitOccupants / totalBuildingOccupants));
  const unitSqmShareThousand = Math.round(totalReserveFundThousand * (unitSqm / totalBuildingSqm));
  const unitTotalBillThousand = unitFixedShareThousand + unitOccupantShareThousand + unitSqmShareThousand;
  const areaLabel = params.areaUnit === 'sqft' ? formatAreaShort(unitSqm, 'sqft') : `${toPersianNum(unitSqm)} متر`;
  const intlSuffix = params.intlCurrency && params.intlCurrency !== 'IRT' ? ` • ${formatMillionTomanAsIntlCurrency(unitTotalBillThousand / 1000, params.intlCurrency)}` : '';
  const whatsappMessageText = `📋 *برگ اعلام شارژ ساختمان ${buildingName} - ماه ${monthName}*
واحد: ${toPersianNum(unitNumber)} | متراژ: ${areaLabel} | نفرات: ${toPersianNum(unitOccupants)} نفر
----------------------------------------
🔹 سهم ثابت (نظافت و آسانسور): ${formatTomanFromThousandToman(unitFixedShareThousand)} (${toPersianNum(unitFixedShareThousand.toLocaleString('en-US'))} هزار تومان)
🔹 سهم آب و انرژی مشترک (نفراتی): ${formatTomanFromThousandToman(unitOccupantShareThousand)} (${toPersianNum(unitOccupantShareThousand.toLocaleString('en-US'))} هزار تومان)
🔹 سهم اندوخته عمرانی (متراژی): ${formatTomanFromThousandToman(unitSqmShareThousand)} (${toPersianNum(unitSqmShareThousand.toLocaleString('en-US'))} هزار تومان)
----------------------------------------
💰 *مبلغ قابل پرداخت:* ${formatTomanFromThousandToman(unitTotalBillThousand)} (${toPersianNum(unitTotalBillThousand.toLocaleString('en-US'))} هزار تومان)${intlSuffix}
شماره کارت/حساب مدیر ساختمان: [توسط مدیر ساختمان تکمیل شود]`;
  return {
    isValid: true, totalBuildingExpensesThousand, unitFixedShareThousand, unitOccupantShareThousand,
    unitSqmShareThousand, unitTotalBillThousand, whatsappMessageText,
  };
}
export const SANA_LEGAL_NOTICES = {
  depositRefund: {
    title: 'پیش‌نویس اظهارنامه مستأجر به موجر جهت مطالبه ودیعه مسکن (نیازمند ثبت در دفاتر خدمات الکترونیک قضایی)',
    template: (tenantName: string, landlordName: string, hoodName: string, depositMillion: number, expireDate: string) =>
      `[پیش‌نویس غیررسمی - این متن تا زمان ثبت در سامانه ثنا یا دفاتر خدمات الکترونیک قضایی ثبت یا ابلاغ رسمی نشده است]\nمخاطب محترم جناب آقای/خانم ${landlordName}\nبا سلام و احترام؛\nبه استحضار می‌رساند اینجانب ${tenantName} طبق قرارداد اجاره، مستأجر آپارتمان مسکونی واقع در محله ${hoodName} بوده‌ام. با توجه به انقضای مدت قرارداد در تاریخ ${expireDate} و اعلام آمادگی جهت تخلیه و تحویل کلید، خواهشمند است نسبت به هماهنگی تخلیه و استرداد مبلغ ${toPersianNum(depositMillion)} میلیون تومان ودیعه اقدام فرمایید.`,
  },
  evacuationNotice: {
    title: 'پیش‌نویس اظهارنامه موجر به مستأجر جهت تخلیه به علت انقضای مدت (نیازمند بررسی حقوقی)',
    template: (landlordName: string, tenantName: string, hoodName: string, expireDate: string) =>
      `[پیش‌نویس غیررسمی - این متن ثبت یا ابلاغ رسمی نشده است]\nمخاطب محترم جناب آقای/خانم ${tenantName}\nبا سلام و احترام؛\nنظر به انقضای مدت اجاره واحد واقع در محله ${hoodName} در تاریخ ${expireDate} و عدم توافق بر تمدید، خواهشمند است نسبت به هماهنگی تخلیه و تسویه‌حساب طبق مفاد قرارداد و قوانین حاکم اقدام فرمایید.`,
  },
  keyHandoverReceipt: {
    title: 'پیش‌نویس صورت‌جلسه تحویل کلید، تخلیه و تسویه‌حساب نهایی',
    template: (landlordName: string, tenantName: string, hoodName: string, depositPaidMillion: number) =>
      `[پیش‌نویس صورت‌جلسه خصوصی - نیازمند تکمیل مشخصات دقیق و امضای طرفین]\nدر تاریخ .................... واحد مسکونی واقع در محله ${hoodName} توسط مستأجر آقای/خانم ${tenantName} تخلیه و کلیدها تحویل موجر آقای/خانم ${landlordName} گردید.\nوضعیت تسویه ودیعه به مبلغ ${toPersianNum(depositPaidMillion)} میلیون تومان و فهرست کنتورها/تأسیسات پس از بررسی طرفین در این برگه درج و امضا می‌شود.\nامضای موجر: ........................   امضای مستأجر: ........................   امضای دو شاهد: ........................`,
  },
};
export interface LobbyUpgradeParams {
  totalBuildingUnits: number; currentUnitAvgPriceBillion: number; renovationBudgetMillion: number;
}
export interface LobbyUpgradeResult {
  perUnitCostMillion: number; expectedPriceUpliftPercent: number; perUnitValueGainMillion: number; roiMultiple: number;
}
export function calculateLobbyUpgradeRoi(params: LobbyUpgradeParams): LobbyUpgradeResult {
  const { totalBuildingUnits, currentUnitAvgPriceBillion, renovationBudgetMillion } = params;
  const perUnitCostMillion = Math.round(renovationBudgetMillion / Math.max(1, totalBuildingUnits));
  const expectedPriceUpliftPercent = 6;
  const perUnitValueGainMillion = Math.round((currentUnitAvgPriceBillion * 1000) * (expectedPriceUpliftPercent / 100));
  const roiMultiple = Math.round((perUnitValueGainMillion / Math.max(1, perUnitCostMillion)) * 10) / 10;
  return { perUnitCostMillion, expectedPriceUpliftPercent, perUnitValueGainMillion, roiMultiple };
}
export const ARTICLE_55_OFFICE_PERMITTED_JOBS = [
  { title: 'مطب پزشکان و دندانپزشکان', status: 'conditional' as const, permitted: true, rule: 'استفاده در ملک مسکونی تابع تبصره ذیل بند ۲۴ ماده ۵۵، ضوابط طرح تفصیلی، مالکیت یا اذن قانونی و مقررات نظام پزشکی است و باید از شهرداری منطقه استعلام شود.' },
  { title: 'دفتر وکالت دادگستری', status: 'conditional' as const, permitted: true, rule: 'مشروط به داشتن پروانه وکالت معتبر، رعایت ضوابط انتظامی و عدم ایجاد مزاحمت یا تغییر کاربری تجاری.' },
  { title: 'دفتر مهندسی و محاسبات', status: 'conditional' as const, permitted: true, rule: 'مشروط به پروانه اشتغال به کار مهندسی، فعالیت غیرتجاری و ضوابط شهرداری محل.' },
  { title: 'دفتر اسناد رسمی و ازدواج/طلاق', status: 'conditional' as const, permitted: true, rule: 'تابع مجوز سازمان ثبت اسناد و املاک و ضوابط استقرار شهری است.' },
  { title: 'شرکت‌های بازرگانی، فروشگاهی و کارگاهی', status: 'prohibited' as const, permitted: false, rule: 'در پهنه مسکونی بدون کاربری یا موقعیت اداری مجاز، مشمول رسیدگی کمیسیون ماده ۱۰۰ و بند ۲۴ ماده ۵۵ قانون شهرداری است.' },
];
export interface ChitgarCoopParams {
  baseInstallmentsPaidMillion: number; transferRightFeeMillion: number;
  promisedRemainingCostPerSqmMillion: number; unitSqm: number; deliveryMonths: number;
  costOverrunReservePercent?: number; benchmarkFinishedPricePerSqmMillion?: number;
}
export interface ChitgarCoopResult {
  cashNeededTodayMillion: number; estimatedTotalFinishedCostMillion: number;
  estimatedFinishedPricePerSqmMillion: number; neighborhoodFinishedAvgPriceMillion: number | null;
  projectedProfitPercent: number | null; riskNotice: string;
}
export function calculateChitgarCoopScore(params: ChitgarCoopParams): ChitgarCoopResult {
  const baseInstallmentsPaidMillion = Math.max(0, Number(params.baseInstallmentsPaidMillion) || 0);
  const transferRightFeeMillion = Math.max(0, Number(params.transferRightFeeMillion) || 0);
  const promisedRemainingCostPerSqmMillion = Math.max(0, Number(params.promisedRemainingCostPerSqmMillion) || 0);
  const unitSqm = Math.max(1, Number(params.unitSqm) || 100);
  const deliveryMonths = Math.max(1, Number(params.deliveryMonths) || 24);
  const overrunMultiplier = 1 + Math.max(0, Math.min(200, Number(params.costOverrunReservePercent ?? 25))) / 100;
  const cashNeededTodayMillion = baseInstallmentsPaidMillion + transferRightFeeMillion;
  const remainingInstallmentsMillion = Math.round(promisedRemainingCostPerSqmMillion * overrunMultiplier * unitSqm);
  const estimatedTotalFinishedCostMillion = cashNeededTodayMillion + remainingInstallmentsMillion;
  const estimatedFinishedPricePerSqmMillion = Math.max(1, Math.round(estimatedTotalFinishedCostMillion / unitSqm));
  const benchmark = typeof params.benchmarkFinishedPricePerSqmMillion === 'number' && params.benchmarkFinishedPricePerSqmMillion > 0
    ? params.benchmarkFinishedPricePerSqmMillion
    : null;
  const projectedProfitPercent = benchmark !== null ? Math.round(((benchmark - estimatedFinishedPricePerSqmMillion) / estimatedFinishedPricePerSqmMillion) * 100) : null;
  const riskNotice = deliveryMonths > 36
    ? 'هشدار ریسک: پروژه‌های پیش‌فروش تعاونی فاقد قیمت قطعی بوده و تابع ضریب تعدیل، پیشرفت فیزیکی، جواز ساخت و اهلیت حقوقی تعاونی هستند.'
    : 'پیش از هر پرداخت، پلاک ثبتی، پروانه ساختمانی، قرارداد تیپ وزارت تعاون و تعهدات ضریب تعدیل باید استعلام شود.';
  return {
    cashNeededTodayMillion, estimatedTotalFinishedCostMillion, estimatedFinishedPricePerSqmMillion,
    neighborhoodFinishedAvgPriceMillion: benchmark, projectedProfitPercent, riskNotice,
  };
}
export interface InterCityMigrationResult {
  targetCityNameFa: string; targetCitySqmPriceMillion: number; tehran80mUnitValueBillion: number;
  targetCityAffordableSqm: number; target120mCostMillion?: number; remainingCashBufferMillion: number;
  lifestyleVerdict: string;
}
export function calculateInterCityMigration(tehranSqmPriceMillion: number, targetCity: CityId): InterCityMigrationResult {
  const safeTehranSqm = Math.max(0, Number(tehranSqmPriceMillion) || 0);
  const cityConfig = MULTI_CITY_CONFIGS[targetCity] || MULTI_CITY_CONFIGS.karaj;
  const sortedPrices = cityConfig.neighborhoods.map((n) => n.buyPerSqm).sort((a, b) => a - b);
  const midIdx = Math.floor(sortedPrices.length / 2);
  const targetCitySqmPriceMillion =
    sortedPrices.length === 0 ? 65 : sortedPrices.length % 2 === 1 ? sortedPrices[midIdx] : Math.round((sortedPrices[midIdx - 1] + sortedPrices[midIdx]) / 2);
  const tehran80mUnitValueMillion = safeTehranSqm * 80;
  const tehran80mUnitValueBillion = Math.round((tehran80mUnitValueMillion / 1000) * 10) / 10;
  const target120mCostMillion = targetCitySqmPriceMillion * 120;
  const remainingCashBufferMillion = Math.round(tehran80mUnitValueMillion - target120mCostMillion);
  const targetCityAffordableSqm = Math.round(tehran80mUnitValueMillion / Math.max(1, targetCitySqmPriceMillion));
  const lifestyleVerdict =
    remainingCashBufferMillion >= 0
      ? `بر اساس قیمت نمونه، فروش واحد ۸۰ متری (${toPersianNum(tehran80mUnitValueBillion)} میلیارد تومان) تکافوی خرید حدود ${toPersianNum(120)} متر در ${cityConfig.nameFa} و مانده ناخالص حدود ${toPersianNum(remainingCashBufferMillion)} میلیون تومان (قبل از کسر کمیسیون و هزینه انتقال) را می‌دهد.`
      : `هشدار کسری بودجه: ارزش واحد ۸۰ متری (${toPersianNum(tehran80mUnitValueBillion)} میلیارد تومان) برای خرید واحد ۱۲۰ متری در محله شاخص ${cityConfig.nameFa} حدود ${toPersianNum(Math.abs(remainingCashBufferMillion))} میلیون تومان کسری دارد و متراژ قابل خرید حدود ${toPersianNum(targetCityAffordableSqm)} متر است.`;
  return {
    targetCityNameFa: cityConfig.nameFa, targetCitySqmPriceMillion, tehran80mUnitValueBillion,
    targetCityAffordableSqm, target120mCostMillion, remainingCashBufferMillion, lifestyleVerdict,
  };
}
export interface NeighborhoodInfrastructureFacts {
  waterTdsPpm: number | null; waterSource: string; noiseLevelDb: number | null; noiseSource: string;
  hasMehrabadFlightPath: boolean; futureMetroLines: string; futureMetroStationBonusPercent: number | null;
  subsidenceRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'; qanatAlert: string;
  sourceStatus: 'verified' | 'unavailable';
}
export function getNeighborhoodInfraData(hoodName: string): NeighborhoodInfrastructureFacts {
  const isFlightZone = /صادقیه|مرزداران|اکباتان|آزادی|بیمه|آپادانا/i.test(hoodName);
  return {
    waterTdsPpm: null,
    waterSource: 'دادهٔ آزمایشگاهی تاییدشده برای TDS آب این محله در سامانه ثبت نشده است؛ معیار معتبر، قبض و گزارش شرکت آبفای منطقه است.',
    noiseLevelDb: null,
    noiseSource: isFlightZone
      ? 'مجاورت احتمالی با کریدور پروازی مهرآباد/شریان‌های غربی؛ نیازمند سنجش میدانی در ساعات اوج.'
      : 'سنسور تراز صوتی (dB) در این محله متصل نیست؛ بازدید میدانی در ساعات شب و اوج ترافیک توصیه می‌شود.',
    hasMehrabadFlightPath: isFlightZone,
    futureMetroLines: 'وضعیت خطوط مصوب یا در دست احداث مترو باید از شرکت راه‌آهن شهری مربوطه استعلام شود.',
    futureMetroStationBonusPercent: null,
    subsidenceRisk: 'UNKNOWN',
    qanatAlert: 'اطلاعات ژئوتکنیک، قنات و فرونشست صرفاً با استعلام شهرداری و آزمایش مکانیک خاک پلاک ثبتی قابل تایید است.',
    sourceStatus: 'unavailable',
  };
}
export interface MovingTruckParams { truckType: 'van' | 'khavar' | 'isuzu_large'; workerCount: number; hours: number; heavyItemsCount: number; hasElevatorOrigin: boolean; hasElevatorDest: boolean; floorsCount: number; }
export interface MovingTruckResult { truckBaseFeeThousand: number; workersFeeThousand: number; heavyItemsFeeThousand: number; totalMovingCostThousand: number; housingRegistryChecklist: string[]; }
export function calculateMovingCost(params: MovingTruckParams): MovingTruckResult {
  const { truckType, hasElevatorOrigin, hasElevatorDest } = params;
  const workerCount = Math.max(0, Math.floor(Number(params.workerCount) || 0)), hours = Math.max(1, Number(params.hours) || 1);
  const heavyItemsCount = Math.max(0, Math.floor(Number(params.heavyItemsCount) || 0)), floorsCount = Math.max(0, Math.floor(Number(params.floorsCount) || 0));
  let truckBaseFeeThousand = truckType === 'van' ? 850 : truckType === 'isuzu_large' ? 1850 : 1400;
  if (hours > 3) truckBaseFeeThousand += (hours - 3) * 450;
  const perWorker = 450 + Math.max(0, hours - 3) * 150;
  const workersFeeThousand = workerCount * perWorker; let heavyItemsFeeThousand = heavyItemsCount * 250; if (!hasElevatorOrigin || !hasElevatorDest) heavyItemsFeeThousand += heavyItemsCount * floorsCount * 90; const totalMovingCostThousand = truckBaseFeeThousand + workersFeeThousand + heavyItemsFeeThousand; const housingRegistryChecklist = [
    '۱. پس از اسباب‌کشی، وضعیت اقامتگاه اصلی را در سامانه ملی املاک و اسکان (amlak.mrud.ir) بررسی و به‌روزرسانی کنید.', '۲. تطابق کد پستی ۱۰ رقمی با نشانی جدید را برای خدمات پستی، بانکی و اداری کنترل کنید.', '۳. در صورت نیاز به ثبت‌نام مدارس یا خدمات محلی، مدارک سکونت و کد رهگیری قرارداد را آماده داشته باشید.', '۴. قرائت کنتور آب، برق و گاز و تسویه شارژ ساختمان تا روز تحویل را در صورت‌جلسه قید کنید.', ]; return { truckBaseFeeThousand, workersFeeThousand, heavyItemsFeeThousand, totalMovingCostThousand, housingRegistryChecklist }; }
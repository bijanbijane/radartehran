import { EvaluatedNeighborhood, toPersianNum } from './neighborhoods'; import { calculateHedonicValuation, FAST_SALE_FACTOR, getCurrentJalaliYear, type HedonicRenovationStatus } from './hedonicPricingEngine'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export * from './legalAndBuildingLogic'; export type DeedType = 'single_deed' | 'endowment' | 'informal_contract' | 'probate_coop'; export interface DeedTypeOption { id: DeedType; label: string; multiplier: number; badge: string; badgeColor: string; legalNotice: string; } export const DEED_TYPE_OPTIONS: DeedTypeOption[] = [
  { id: 'single_deed', label: 'سند رسمی ششدانگ تک‌برگ (عرصه و اعیان)', multiplier: 1.0, badge: '۱۰۰٪ ارزش رسمی و بالاترین نقدشوندگی', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200', legalNotice: 'مطابق قانون جدید الزام به ثبت رسمی معاملات، مطمئن‌ترین نوع سند با امکان دریافت فوری وام مسکن و استعلام برخط ثبت اسناد.' }, { id: 'endowment', label: 'سند اوقافی (عرصه وقف، اعیان طلق)', multiplier: 0.88, badge: '۱۲٪ ارزان‌تر از سند تک‌برگ', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200', legalNotice: 'شرایط وقف عام یا خاص، میزان اجاره‌بهای عرصه، حق پذیره و نیاز به موافقت متولی یا اداره اوقاف باید پیش از معامله استعلام شود.' }, { id: 'informal_contract', label: 'قولنامه‌ای / وکالتی معتبر با کد رهگیری', multiplier: 0.82, badge: '۱۸٪ زیر قیمت سنددار', badgeColor: 'bg-rose-50 text-rose-800 border-rose-200', legalNotice: 'هشدار حقوقی: اسناد عادی و وکالتی ریسک معامله معارض، محدودیت دریافت تسهیلات و الزامات ثبت رسمی دارند؛ استعلام ثبتی و بررسی وکیل ضروری است.' }, { id: 'probate_coop', label: 'تعاونی‌ساز معتبر / ورثه‌ای در جریان پایان‌کار', multiplier: 0.92, badge: '۸٪ زیر قیمت روز', badgeColor: 'bg-sky-50 text-sky-800 border-sky-200', legalNotice: 'نقل‌وانتقال در دفتر تعاونی یا با رضایت تمامی وراث طبق گواهی حصر وراثت معتبر انجام می‌شود.' }, ]; export type ParkingType = 'dedicated' | 'tandem' | 'none'; export interface ParkingOption { id: ParkingType; label: string; multiplier: number; } export const PARKING_OPTIONS: ParkingOption[] = [ { id: 'dedicated', label: 'پارکینگ سندی غیرمزاحم اختصاصی (+۵٪)', multiplier: 0.05 }, { id: 'tandem', label: 'پارکینگ سندی مزاحم (پایه)', multiplier: 0.0 }, { id: 'none', label: 'فاقد پارکینگ سندی (-۸٪)', multiplier: -0.08 }, ];
export interface DetailedValuationParams { hood: EvaluatedNeighborhood; sqm: number; age: number; floor: number; totalFloors?: number; bedrooms: number; deedType: DeedType; parkingType: ParkingType; hasElevator: boolean; hasStorage: boolean; renovation: 'renovated' | 'standard' | 'needs_work'; light: 'south' | 'normal' | 'dim'; gold18kTomanPrice?: number; usdTomanPrice?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; } export interface DetailedValuationResult { fairTotalMillion: number; fairPerSqm: number; fastSaleTotalMillion: number; fastSalePerSqm: number; fullRahnMillion: number; equivMonthlyRentMillion: number; multiplierPercent: number; goldGramPricePerSqm: number; goldGramPriceTotal: number; usdPricePerSqm: number;
  usdPriceTotal: number; deedInfo: DeedTypeOption; unitLabelFa?: string; fairTotalIntlText?: string; }
export const GOLD_18K_TOMAN_PRICE = 4500000; export const USD_TOMAN_PRICE = 70000; export const GOLD_COIN_EMAMI_PRICE_MILLION = 54; export function calculateDetailedValuation(params: DetailedValuationParams): DetailedValuationResult {
  const { hood, sqm, age, floor, totalFloors = 5, bedrooms, deedType, parkingType, hasElevator, hasStorage, renovation, light, gold18kTomanPrice = GOLD_18K_TOMAN_PRICE, usdTomanPrice = USD_TOMAN_PRICE, areaUnit = getStoredAreaUnit(), intlCurrency = getStoredIntlCurrency(),
  } = params; const currentYear = getCurrentJalaliYear(); const safeAge = Math.max(0, Math.min(40, Number(age) || 0)); const safeSqm = Math.max(10, Number(sqm) || 80); const mappedRenovation: HedonicRenovationStatus = renovation === 'renovated' ? 'renovated' : renovation === 'needs_work' ? 'needs_renovation' : 'standard'; const parkingOpt = PARKING_OPTIONS.find((p) => p.id === parkingType) || PARKING_OPTIONS[0];
  const hedonicBase = calculateHedonicValuation({ neighborhood: hood, sqm: safeSqm, buildYear: currentYear - safeAge, renovationStatus: mappedRenovation, floor, totalFloors, hasElevator, hasParking: parkingType !== 'none', hasStorage,
    parkingAdjustmentPercent: Math.round(parkingOpt.multiplier * 1000) / 10, currentJalaliYear: currentYear, }); const deedOption = DEED_TYPE_OPTIONS.find((d) => d.id === deedType) || DEED_TYPE_OPTIONS[0];
  let secondaryModifier = deedOption.multiplier; if (light === 'south') secondaryModifier += 0.03; if (light === 'dim') secondaryModifier -= 0.03; if (safeSqm >= 90 && bedrooms === 1) secondaryModifier -= 0.04;
  else if (safeSqm >= 95 && safeSqm <= 135 && bedrooms >= 3) secondaryModifier += 0.035; else if (safeSqm >= 60 && safeSqm <= 85 && bedrooms === 2) secondaryModifier += 0.02;
  else if (safeSqm < 65 && bedrooms >= 3) secondaryModifier -= 0.03; const baseBuyPerSqm = Math.max(10, Number((hood as any)?.baseBuyPerSqm ?? hood?.buyPerSqm) || 100);
  const fairPerSqm = Math.max(10, Math.round(hedonicBase.hedonicPerSqm * secondaryModifier * 10) / 10); const fairTotalMillion = Math.round(fairPerSqm * safeSqm); const fastSalePerSqm = Math.round(fairPerSqm * FAST_SALE_FACTOR * 10) / 10; const fastSaleTotalMillion = Math.round(fastSalePerSqm * safeSqm);
  const fullRahnMillion = Math.max(50, Math.round(hedonicBase.estimatedRahnMillion * secondaryModifier)); const equivMonthlyRentMillion = Math.round(((fullRahnMillion * 0.30) / 12) * 10) / 10; const multiplierPercent = Math.round(((fairPerSqm - baseBuyPerSqm) / baseBuyPerSqm) * 100);
  const tomanPerSqm = fairPerSqm * 1000000; const tomanTotal = fairTotalMillion * 1000000;
  const safeGoldRate = Math.max(100000, Number(gold18kTomanPrice) || GOLD_18K_TOMAN_PRICE); const safeUsdRate = Math.max(1000, Number(usdTomanPrice) || USD_TOMAN_PRICE);
  return { fairTotalMillion, fairPerSqm, fastSaleTotalMillion, fastSalePerSqm,
    fullRahnMillion, equivMonthlyRentMillion, multiplierPercent, goldGramPricePerSqm: Math.round((tomanPerSqm / safeGoldRate) * 10) / 10,
    goldGramPriceTotal: Math.round(tomanTotal / safeGoldRate),
    usdPricePerSqm: Math.round(tomanPerSqm / safeUsdRate),
    usdPriceTotal: Math.round(tomanTotal / safeUsdRate),
    deedInfo: deedOption, unitLabelFa: formatAreaUnitLabel(areaUnit), fairTotalIntlText: intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(fairTotalMillion, intlCurrency) : undefined,
  };
}
export interface LandShareParams {
  totalPlotSqm: number; totalBuildingUnits: number; unitSqm: number;
  totalBuildingFloorSqm: number; neighborhoodLandPerSqmMillion: number;
  postConstructionTotalResidentialSqm?: number; ownerParticipationSharePercent?: number;
  registeredLandShareSqm?: number;
}
export interface LandShareResult {
  isValid?: boolean; validationError?: string; exactLandShareSqm: number;
  landSharePercent: number; pureLandValueMillion: number;
  postConsolidationNewSqmEstimate: number | null; consolidationProfitPercent: number | null;
  landShareMethod?: 'REGISTERED' | 'ESTIMATED'; registeredLandShareSqm?: number;
}
export function calculateLandShare(params: LandShareParams): LandShareResult {
  const totalPlotSqm = Number(params.totalPlotSqm), unitSqm = Number(params.unitSqm);
  const totalBuildingFloorSqm = Number(params.totalBuildingFloorSqm), neighborhoodLandPerSqmMillion = Number(params.neighborhoodLandPerSqmMillion);
  if (!Number.isFinite(totalPlotSqm) || totalPlotSqm <= 0 || !Number.isFinite(unitSqm) || unitSqm <= 0 || !Number.isFinite(totalBuildingFloorSqm) || totalBuildingFloorSqm < unitSqm || !Number.isFinite(neighborhoodLandPerSqmMillion) || neighborhoodLandPerSqmMillion <= 0) {
    return {
      isValid: false, validationError: 'مقادیر عرصه، متراژ واحد، زیربنای کل و قیمت زمین باید اعداد مثبت معتبر باشند و زیربنای کل نمی‌تواند کمتر از متراژ واحد باشد.',
      exactLandShareSqm: 0, landSharePercent: 0, pureLandValueMillion: 0, postConsolidationNewSqmEstimate: 0, consolidationProfitPercent: 0, landShareMethod: 'ESTIMATED',
    };
  }
  const shareRatio = unitSqm / totalBuildingFloorSqm;
  const landSharePercent = Math.round(shareRatio * 1000) / 10;
  const hasRegistered = typeof params.registeredLandShareSqm === 'number' && Number.isFinite(params.registeredLandShareSqm) && params.registeredLandShareSqm > 0;
  const exactLandShareSqm = hasRegistered ? Math.round(Number(params.registeredLandShareSqm) * 10) / 10 : Math.round(totalPlotSqm * shareRatio * 10) / 10;
  const pureLandValueMillion = Math.round(exactLandShareSqm * neighborhoodLandPerSqmMillion);
  const postTotalSqm = Number(params.postConstructionTotalResidentialSqm), ownerSharePct = Number(params.ownerParticipationSharePercent ?? 55);
  let postConsolidationNewSqmEstimate = Math.round(unitSqm * 1.15), consolidationProfitPercent = Math.round(((postConsolidationNewSqmEstimate - unitSqm) / unitSqm) * 100);
  if (Number.isFinite(postTotalSqm) && postTotalSqm > 0 && Number.isFinite(ownerSharePct) && ownerSharePct > 0 && ownerSharePct <= 100) {
    postConsolidationNewSqmEstimate = Math.round(postTotalSqm * (ownerSharePct / 100) * shareRatio * 10) / 10;
    consolidationProfitPercent = Math.round(((postConsolidationNewSqmEstimate - unitSqm) / unitSqm) * 100);
  }
  return {
    isValid: true, exactLandShareSqm, landSharePercent, pureLandValueMillion, postConsolidationNewSqmEstimate, consolidationProfitPercent,
    landShareMethod: hasRegistered ? 'REGISTERED' : 'ESTIMATED', registeredLandShareSqm: hasRegistered ? exactLandShareSqm : undefined,
  };
}
export interface FloorplanParams {
  totalSqm: number; corridorSqm: number; irregularCorners: number;
  balconySqm: number; currentBedrooms: number; buyPerSqmMillion: number;
}
export interface FloorplanResult {
  deadSpacePercent: number; usableSqm: number; canAddBedroom: boolean;
  valueUpliftMillion: number; recommendation: string;
}
export function calculateFloorplanOptimization(params: FloorplanParams): FloorplanResult {
  const totalSqm = Number(params.totalSqm), corridorSqm = Number(params.corridorSqm);
  const balconySqm = Number(params.balconySqm), irregularCorners = Number(params.irregularCorners);
  const currentBedrooms = Number(params.currentBedrooms), buyPerSqmMillion = Number(params.buyPerSqmMillion);
  if (!Number.isFinite(totalSqm) || totalSqm <= 0 || !Number.isFinite(corridorSqm) || corridorSqm < 0 || !Number.isFinite(balconySqm) || balconySqm < 0 || !Number.isFinite(irregularCorners) || irregularCorners < 0 || corridorSqm + balconySqm >= totalSqm) {
    return { deadSpacePercent: 0, usableSqm: 0, canAddBedroom: false, valueUpliftMillion: 0, recommendation: 'ورودی‌های متراژ نامعتبر است؛ مجموع راهرو و بالکن باید کمتر از متراژ کل واحد باشد.' };
  }
  const cornerDeadSqm = Math.min(totalSqm * 0.25, irregularCorners * 1.5);
  const totalDeadSpace = Math.min(totalSqm - 1, corridorSqm + cornerDeadSqm);
  const deadSpacePercent = Math.min(95, Math.round((totalDeadSpace / totalSqm) * 100));
  const usableSqm = Math.max(0, Math.round((totalSqm - totalDeadSpace - balconySqm * 0.5) * 10) / 10);
  const canAddBedroom = (currentBedrooms === 1 && usableSqm >= 60) || (currentBedrooms === 2 && usableSqm >= 88);
  const safeBuyPerSqm = Number.isFinite(buyPerSqmMillion) && buyPerSqmMillion > 0 ? buyPerSqmMillion : 0;
  const valueUpliftMillion = canAddBedroom ? Math.round(totalSqm * safeBuyPerSqm * 0.06) : 0;
  let recommendation = 'نقشه واحد در محدوده معمول است؛ پیش از هر تغییر، دیوارهای باربر و تأسیسات باید توسط مهندس بررسی شوند.';
  if (deadSpacePercent > 18) recommendation = `نسبت فضای غیرمفید برآوردی ${toPersianNum(deadSpacePercent)}٪ است. بازطراحی پلان نیازمند بررسی سازه‌ای دیوارهای غیرباربر است.`;
  else if (canAddBedroom) recommendation = `بر اساس متراژ مفید برآوردی (${toPersianNum(usableSqm)} متر)، امکان‌سنجی معماری برای افزودن اتاق خواب قابل بررسی است.`;
  return { deadSpacePercent, usableSqm, canAddBedroom, valueUpliftMillion, recommendation };
}
export interface NegotiationCoachParams {
  askingPriceMillion: number; neighborhoodAvgPriceMillion: number;
  buyerReadyCashMillion: number; propertyAge: number; daysOnMarket?: number;
}
export interface NegotiationCoachResult {
  isValid?: boolean; validationError?: string; anchorOfferMillion: number;
  targetClosingPriceMillion: number; expectedDiscountPercent: number;
  discountTomansMillion: number; scriptLines: string[];
}
export function calculateNegotiationStrategy(params: NegotiationCoachParams): NegotiationCoachResult {
  const askingPriceMillion = Number(params.askingPriceMillion), neighborhoodAvgPriceMillion = Number(params.neighborhoodAvgPriceMillion);
  const buyerReadyCashMillion = Number(params.buyerReadyCashMillion), propertyAge = Number(params.propertyAge);
  if (!Number.isFinite(askingPriceMillion) || askingPriceMillion <= 0 || !Number.isFinite(neighborhoodAvgPriceMillion) || neighborhoodAvgPriceMillion <= 0 || !Number.isFinite(buyerReadyCashMillion) || buyerReadyCashMillion < 0 || !Number.isFinite(propertyAge) || propertyAge < 0 || propertyAge > 100) {
    return { isValid: false, validationError: 'قیمت پیشنهادی، میانگین محله، نقدینگی و سن بنا باید اعداد معتبر باشند.', anchorOfferMillion: 0, targetClosingPriceMillion: 0, expectedDiscountPercent: 0, discountTomansMillion: 0, scriptLines: [] };
  }
  let discountPct = 5;
  if (askingPriceMillion > neighborhoodAvgPriceMillion) discountPct += 4;
  if (propertyAge > 15) discountPct += 3;
  if (buyerReadyCashMillion >= askingPriceMillion * 0.7) discountPct += 2;
  discountPct = Math.min(18, Math.max(3, discountPct));
  const targetClosingPriceMillion = Math.round(askingPriceMillion * (1 - discountPct / 100));
  const anchorOfferMillion = Math.round(targetClosingPriceMillion * 0.96);
  const discountTomansMillion = Math.max(0, askingPriceMillion - targetClosingPriceMillion);
  const scriptLines = [
    `۱. پیشنهاد آغاز مذاکره (سناریوی تحلیلی): ${toPersianNum(anchorOfferMillion)} میلیون تومان با برنامه پرداخت شفاف.`,
    `۲. سقف هدف خریدار در این مدل: ${toPersianNum(targetClosingPriceMillion)} میلیون تومان (حدود ${toPersianNum(discountTomansMillion)} میلیون تومان کمتر از قیمت اعلامی).`,
    `۳. پیش از توافق، تطابق متراژ سندی، وضعیت بازداشت یا رهن، و بدهی‌های ملک استعلام شود.`,
  ];
  return { isValid: true, anchorOfferMillion, targetClosingPriceMillion, expectedDiscountPercent: discountPct, discountTomansMillion, scriptLines };
}
export interface AuctionParams {
  retailMarketValueMillion: number; auctionBasePriceMillion: number;
  transactionCostsMillion?: number; renovationCostsMillion?: number;
  financingCostsMillion?: number; debtAndClearanceCostsMillion?: number;
}
export interface AuctionResult {
  discountFromRetailPercent: number; required10PercentDepositMillion: number;
  optimalBidEnvelopeMillion: number; netProfitPotentialMillion: number;
}
export function calculateAuctionBidding(params: AuctionParams): AuctionResult {
  const retailMarketValueMillion = Number(params.retailMarketValueMillion);
  const auctionBasePriceMillion = Number(params.auctionBasePriceMillion);
  const additionalCosts =
    Math.max(0, Number(params.transactionCostsMillion) || 0) +
    Math.max(0, Number(params.renovationCostsMillion) || 0) +
    Math.max(0, Number(params.financingCostsMillion) || 0) +
    Math.max(0, Number(params.debtAndClearanceCostsMillion) || 0);
  if (!Number.isFinite(retailMarketValueMillion) || retailMarketValueMillion <= 0 || !Number.isFinite(auctionBasePriceMillion) || auctionBasePriceMillion <= 0) {
    return { discountFromRetailPercent: 0, required10PercentDepositMillion: 0, optimalBidEnvelopeMillion: 0, netProfitPotentialMillion: 0 };
  }
  const discountFromRetailPercent = Math.round(((retailMarketValueMillion - auctionBasePriceMillion) / retailMarketValueMillion) * 100);
  const required10PercentDepositMillion = Math.round(auctionBasePriceMillion * 0.1);
  const optimalBidEnvelopeMillion = Math.round(auctionBasePriceMillion * 1.05);
  const netProfitPotentialMillion = Math.round(retailMarketValueMillion - optimalBidEnvelopeMillion - additionalCosts);
  return { discountFromRetailPercent, required10PercentDepositMillion, optimalBidEnvelopeMillion, netProfitPotentialMillion };
}
export interface SeasonalMonthGuide {
  month: string; season: 'بهار' | 'تابستان' | 'پاییز' | 'زمستان';
  buyerAdvantageScore: number; marketStatus: string; advice: string;
}
export const IRAN_SEASONAL_MARKET_CALENDAR: SeasonalMonthGuide[] = [
  { month: 'فروردین', season: 'بهار', buyerAdvantageScore: 6, marketStatus: 'نیمه‌تعطیل و بلاتکلیفی بودجه', advice: 'فروشندگان بلاتکلیف هستند؛ بهترین زمان برای شکار املاکی که از اسفند مانده‌اند.' },
  { month: 'اردیبهشت', season: 'بهار', buyerAdvantageScore: 5, marketStatus: 'شروع رونق و تعیین نرخ جدید', advice: 'فایل‌های جدید با قیمت‌های افزایشی وارد بازار می‌شوند؛ چانه‌زنی سخت‌تر است.' },
  { month: 'خرداد', season: 'بهار', buyerAdvantageScore: 4, marketStatus: 'ورود متقاضیان جابجایی مدارس', advice: 'تقاضای خرید خانواده‌ها اوج می‌گیرد؛ رقابت خریداران بالاست.' },
  { month: 'تیر', season: 'تابستان', buyerAdvantageScore: 3, marketStatus: 'اوج فصل نقل‌وانتقال و حباب اجاره', advice: 'بدترین زمان برای خرید ارزان؛ بالاترین قیمت‌های پیشنهادی مالکان.' },
  { month: 'مرداد', season: 'تابستان', buyerAdvantageScore: 3, marketStatus: 'ترافیک سنگین معاملات اجاره', advice: 'مالکان حاضر به تخفیف نیستند چون تقاضای موازی بالاست.' },
  { month: 'شهریور', season: 'تابستان', buyerAdvantageScore: 5, marketStatus: 'شتاب برای نهایی کردن پیش از مهر', advice: 'مالکانی که عجله دارند در ۱۰ روز پایانی تخفیف‌های خوبی می‌دهند.' },
  { month: 'مهر', season: 'پاییز', buyerAdvantageScore: 7, marketStatus: 'افت محسوس تقاضای فصلی', advice: 'آرامش بازار پس از بازگشایی مدارس؛ زمان مناسب برای بازدیدهای بدون عجله.' },
  { month: 'آبان', season: 'پاییز', buyerAdvantageScore: 8, marketStatus: 'رکود معاملاتی و چانه‌زنی بالا', advice: 'یکی از بهترین ماه‌های سال برای خریداران نقدی جهت دریافت تخفیف‌های ۱۰ تا ۱۵ درصدی.' },
  { month: 'آذر', season: 'پاییز', buyerAdvantageScore: 9, marketStatus: 'فرصت طلایی خریدار نقدی', advice: 'بهترین ماه سال برای خرید با بالاترین قدرت چانه‌زنی و کمترین رقابت مشتری.' },
  { month: 'دی', season: 'زمستان', buyerAdvantageScore: 8, marketStatus: 'شروع خرید سرمایه‌ای زمستانه', advice: 'فرصت نهایی خرید پیش از تب و تاب تورمی پایان سال.' },
  { month: 'بهمن', season: 'زمستان', buyerAdvantageScore: 5, marketStatus: 'ورود نقدینگی شب عید و رشد دلار', advice: 'مالکان قیمت‌ها را متناسب با افزایش نرخ ارز اصلاح می‌کنند.' },
  { month: 'اسفند', season: 'زمستان', buyerAdvantageScore: 4, marketStatus: 'تب تند معاملات شب عید', advice: 'بیشترین حجم قراردادها، عجله برای تبدیل ریال به ملک پیش از سال جدید.' },
];
export interface CombinedBuyingPowerParams {
  cashSavingsMillion: number; carSaleBudgetMillion: number;
  goldCoinBudgetMillion: number; housingLoanMillion: number; targetHoodRahn80mMillion: number;
}
export interface CombinedBuyingPowerResult {
  totalEquityBeforeRahnMillion: number; totalPurchasingPowerWithRahnMillion: number;
  rahnContributionPercent: number; unlockedBudgetBoostPercent: number;
  maxAffordablePricePerSqmAt75m: number; maxAffordableSqmAt75m?: number;
  tenantDepositBridgeMillion?: number; grossPurchaseHeadlineWithRahnMillion?: number; liabilityNotice?: string;
}
export function calculateCombinedBuyingPower(params: CombinedBuyingPowerParams): CombinedBuyingPowerResult {
  const cashSavingsMillion = Math.max(0, Number(params.cashSavingsMillion) || 0);
  const carSaleBudgetMillion = Math.max(0, Number(params.carSaleBudgetMillion) || 0);
  const goldCoinBudgetMillion = Math.max(0, Number(params.goldCoinBudgetMillion) || 0);
  const housingLoanMillion = Math.max(0, Number(params.housingLoanMillion) || 0);
  const targetHoodRahn80mMillion = Math.max(0, Number(params.targetHoodRahn80mMillion) || 0);
  const totalEquityBeforeRahnMillion = cashSavingsMillion + carSaleBudgetMillion + goldCoinBudgetMillion + housingLoanMillion;
  const maxAffordableSqmAt75m = Math.floor(totalEquityBeforeRahnMillion / 75);
  const maxAffordablePricePerSqmAt75m = Math.round((totalEquityBeforeRahnMillion / 75) * 10) / 10;
  return {
    totalEquityBeforeRahnMillion, totalPurchasingPowerWithRahnMillion: totalEquityBeforeRahnMillion,
    rahnContributionPercent: 0, unlockedBudgetBoostPercent: 0,
    maxAffordablePricePerSqmAt75m, maxAffordableSqmAt75m,
    tenantDepositBridgeMillion: targetHoodRahn80mMillion,
    grossPurchaseHeadlineWithRahnMillion: totalEquityBeforeRahnMillion + targetHoodRahn80mMillion,
    liabilityNotice: 'رهن مستأجر بدهی قابل استرداد در پایان قرارداد است، فقط در صورت اجاره دادن ملک به ثالث وجه نقد موقت ایجاد می‌کند و بخشی از آورده خالص خریدار محسوب نمی‌شود.',
  };
}
export interface DepositInflationParams {
  depositMillion: number;
  annualInflationPercent?: number;
}
export interface DepositInflationResult {
  realValue1YrMillion: number;
  realValue2YrMillion: number;
  purchasingPowerLossPercent1Yr: number;
  monthlyGoldHedgeSavingMillion: number;
}
export function calculateDepositInflationLoss(params: DepositInflationParams): DepositInflationResult {
  const deposit = Number(params.depositMillion);
  if (!Number.isFinite(deposit) || deposit < 0) {
    throw new RangeError('depositMillion must be a finite non-negative number');
  }
  const inflation = params.annualInflationPercent === undefined ? 40 : Number(params.annualInflationPercent);
  if (!Number.isFinite(inflation) || inflation <= -100 || inflation > 1000) {
    throw new RangeError('annualInflationPercent must be greater than -100 and no greater than 1000');
  }
  if (deposit === 0) {
    return { realValue1YrMillion: 0, realValue2YrMillion: 0, purchasingPowerLossPercent1Yr: 0, monthlyGoldHedgeSavingMillion: 0 };
  }
  const rate = inflation / 100;
  const realValue1 = deposit / (1 + rate);
  const realValue2 = deposit / Math.pow(1 + rate, 2);
  return {
    realValue1YrMillion: Math.round(realValue1 * 10) / 10,
    realValue2YrMillion: Math.round(realValue2 * 10) / 10,
    purchasingPowerLossPercent1Yr: Math.round(((deposit - realValue1) / deposit) * 1000) / 10,
    monthlyGoldHedgeSavingMillion: Math.round(((deposit - realValue1) / 12) * 10) / 10,
  };
}
export interface RahnVsFundArbitrageParams {
  rahnDifferenceMillion: number;
  monthlyRentDifferenceMillion: number;
  fundAnnualYieldPercent?: number;
}
export interface RahnVsFundArbitrageResult {
  fundMonthlyEarningMillion: number;
  rentSavingsMonthlyMillion: number;
  betterOption: 'full_rahn' | 'rent_and_invest';
  monthlyAdvantageMillion: number;
  annualAdvantageMillion: number;
  explanation: string;
}
export function calculateRahnArbitrage(params: RahnVsFundArbitrageParams): RahnVsFundArbitrageResult {
  const rahnDifferenceMillion = Number(params.rahnDifferenceMillion);
  const monthlyRentDifferenceMillion = Number(params.monthlyRentDifferenceMillion);
  const fundAnnualYieldPercent = params.fundAnnualYieldPercent === undefined ? 32 : Number(params.fundAnnualYieldPercent);
  if (
    !Number.isFinite(rahnDifferenceMillion) || rahnDifferenceMillion < 0 ||
    !Number.isFinite(monthlyRentDifferenceMillion) || monthlyRentDifferenceMillion < 0 ||
    !Number.isFinite(fundAnnualYieldPercent) || fundAnnualYieldPercent < 0 || fundAnnualYieldPercent > 1000
  ) {
    throw new RangeError('Rahn arbitrage inputs must be finite non-negative values within the supported range');
  } const fundMonthlyEarningMillion = Math.round(((rahnDifferenceMillion * (fundAnnualYieldPercent / 100)) / 12) * 100) / 100; const rentSavingsMonthlyMillion = monthlyRentDifferenceMillion; const monthlyAdvantageMillion = Math.round(Math.abs(fundMonthlyEarningMillion - rentSavingsMonthlyMillion) * 100) / 100; const annualAdvantageMillion = Math.round(monthlyAdvantageMillion * 12 * 100) / 100; const betterOption: 'full_rahn' | 'rent_and_invest' =
    fundMonthlyEarningMillion > rentSavingsMonthlyMillion ? 'rent_and_invest' : 'full_rahn'; const explanation =
    betterOption === 'rent_and_invest'
      ? `با فرض بازده اسمی سالانهٔ ${toPersianNum(fundAnnualYieldPercent)}٪، درآمد ماهانهٔ سناریوی سرمایه‌گذاری حدود ${toPersianNum(fundMonthlyEarningMillion)} میلیون تومان است؛ این مقدار از صرفه‌جویی اجارهٔ ${toPersianNum(rentSavingsMonthlyMillion)} میلیون تومان بیشتر است.`
      : `در این سناریوی ساده، صرفه‌جویی اجارهٔ ${toPersianNum(rentSavingsMonthlyMillion)} میلیون تومان در ماه از درآمد ماهانهٔ فرضی (${toPersianNum(fundMonthlyEarningMillion)} میلیون تومان) بیشتر یا برابر است.`;
  return { fundMonthlyEarningMillion, rentSavingsMonthlyMillion, betterOption, monthlyAdvantageMillion, annualAdvantageMillion, explanation, }; }
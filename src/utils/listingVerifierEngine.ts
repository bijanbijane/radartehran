/**
 * @file src/utils/listingVerifierEngine.ts
 * @description Instant Real Estate Listing Verifier, Bubble Scanner, and Red-Flag Trap Diagnostic Engine.
 */

import { INITIAL_NEIGHBORHOODS, toPersianNum as toPersianDigits, type Neighborhood } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';

export type TitleDeedCategory = 'PERSONAL_SINGLE' | 'COOPERATIVE_ENDOWMENT' | 'UNDIVIDED_SHARE' | 'PROMISES_OF_SALE' | 'UNKNOWN';
export type RedFlagSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export interface ListingRedFlag {
  id: string;
  severity: RedFlagSeverity;
  title: string;
  explanation: string;
  financialImpactMillionToman?: number;
}

export interface ListingParsedData {
  areaSqm: number;
  askingPriceTotalMillion: number;
  askingPricePerSqm: number;
  buildingAgeYears: number;
  floor: number;
  hasElevator: boolean | null;
  hasParking: boolean | null;
  hasStorage: boolean | null;
  deedCategory: TitleDeedCategory;
  detectedHoodName?: string;
}

export interface ListingDiagnosisResult {
  parsed: ListingParsedData;
  hoodId: number;
  hoodName: string;
  fairDealPricePerSqm: number;
  bubbleGapPct: number;
  totalBubbleMillion: number;
  recommendedDiscountMillion: number;
  dealVerdict: 'FAIR_OPPORTUNITY' | 'NEGOTIATION_REQUIRED' | 'HEAVY_BUBBLE' | 'SUSPICIOUS_BAIT';
  verdictLabelFa: string;
  redFlags: ListingRedFlag[];
  negotiationScript: {
    firstCallQuestions: string[];
    openingOfferMillion: number;
    closingMeetingTactic: string;
  };
}

const STORAGE_QUOTA_KEY = 'radar_listing_verifier_quota_v1';
export const FREE_QUOTA_MAX = 3;

export function getRemainingVerificationQuota(): number {
  if (typeof window === 'undefined') return FREE_QUOTA_MAX;
  try {
    const raw = localStorage.getItem(STORAGE_QUOTA_KEY);
    if (!raw) return FREE_QUOTA_MAX;
    const used = parseInt(raw, 10);
    return Math.max(0, FREE_QUOTA_MAX - (Number.isFinite(used) ? used : 0));
  } catch {
    return FREE_QUOTA_MAX;
  }
}

export function consumeVerificationQuota(): number {
  if (typeof window === 'undefined') return FREE_QUOTA_MAX;
  try {
    const remaining = getRemainingVerificationQuota();
    const nextUsed = FREE_QUOTA_MAX - Math.max(0, remaining - 1);
    localStorage.setItem(STORAGE_QUOTA_KEY, String(nextUsed));
    return Math.max(0, remaining - 1);
  } catch {
    return 0;
  }
}

export function parseListingNarrativeText(rawText: string, defaultHood?: string): ListingParsedData {
  const text = (rawText || '').replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));

  // 1. Area extraction
  let area = 80;
  const areaMatch = text.match(/(?:متراژ|مساحت|زیربنا)?\s*(\d{2,3})\s*(?:متر|متری|مترمربع|م\b)/);
  if (areaMatch) area = Math.max(30, Math.min(600, parseInt(areaMatch[1], 10)));

  // 2. Price extraction (total or per sqm)
  let totalMillion = 0;
  const compositeBillionMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:میلیارد|ملیارد)(?:\s*(?:و\s*)?(\d{1,4})\s*(?:میلیون|ملیون))?/);
  const millionMatch = text.match(/(\d{3,6})\s*(?:میلیون|ملیون|م\.ت)/);
  const perSqmBillionMatch = text.match(/(?:متری|هر متر)\s*(\d+(?:[.,]\d+)?)\s*(?:میلیارد|ملیارد)/);
  const perSqmMillionMatch = text.match(/(?:متری|هر متر)\s*(\d{2,4})\s*(?:میلیون|ملیون)/);

  if (compositeBillionMatch) {
    const bil = parseFloat(compositeBillionMatch[1].replace(',', '.'));
    const mil = compositeBillionMatch[2] ? parseInt(compositeBillionMatch[2], 10) : 0;
    totalMillion = Math.round(bil * 1000 + mil);
  } else if (millionMatch) {
    totalMillion = parseInt(millionMatch[1], 10);
  } else if (perSqmMillionMatch) {
    totalMillion = Math.round(parseInt(perSqmMillionMatch[1], 10) * area);
  } else if (perSqmBillionMatch) {
    totalMillion = Math.round(parseFloat(perSqmBillionMatch[1].replace(',', '.')) * 1000 * area);
  }

  // 3. Building age extraction
  let age = 5;
  if (/نوساز|کلیدنخورده|صفر/.test(text)) age = 0;
  else {
    const ageMatch = text.match(/(\d{1,2})\s*(?:سال|ساله|سال ساخت)/);
    if (ageMatch) age = Math.min(50, parseInt(ageMatch[1], 10));
  }

  // 4. Floor extraction
  let floor = 2;
  const floorMatch = text.match(/طبقه\s*(\d+|همکف|اول|دوم|سوم|چهارم|پنجم|ششم)/);
  if (floorMatch) {
    const fStr = floorMatch[1];
    if (fStr === 'همکف') floor = 0;
    else if (fStr === 'اول') floor = 1;
    else if (fStr === 'دوم') floor = 2;
    else if (fStr === 'سوم') floor = 3;
    else if (fStr === 'چهارم') floor = 4;
    else if (fStr === 'پنجم') floor = 5;
    else if (fStr === 'ششم') floor = 6;
    else floor = Math.min(35, parseInt(fStr, 10) || 2);
  }

  // 5. Amenities (negative check must precede affirmative)
  const hasElevator = /بدون آسانسور|فاقد آسانسور|پله\s*رو|بدون\s*اسانسور/.test(text) ? false : /آسانسور|اسانسور|لاین آسانسور/.test(text) ? true : null;
  const hasParking = /بدون پارکینگ|فاقد پارکینگ|پارکینگ مزاحم|پارکینگ\s*ندارد/.test(text) ? false : /پارکینگ|پارکنیگ/.test(text) ? true : null;
  const hasStorage = /بدون انباری|فاقد انباری|انباری\s*ندارد/.test(text) ? false : /انباری/.test(text) ? true : null;

  // 6. Deed category
  let deedCategory: TitleDeedCategory = 'PERSONAL_SINGLE';
  if (/اوقاف|اوقافی|آستان|عرصه و اعیان اوقاف/.test(text)) deedCategory = 'COOPERATIVE_ENDOWMENT';
  else if (/قولنامه|قولنامه‌ای|وکالتی|مبایعه‌نامه بدون سند/.test(text)) deedCategory = 'PROMISES_OF_SALE';
  else if (/مشاع|مشاعی|سند مادر|تفکیک نشده/.test(text)) deedCategory = 'UNDIVIDED_SHARE';
  else if (!/تک برگ|تک‌برگ|شش دانگ|ششدانگ|شخصی/.test(text)) deedCategory = 'UNKNOWN';

  const pricePerSqm = totalMillion > 0 ? Math.round(totalMillion / Math.max(1, area)) : 0;

  return {
    areaSqm: area,
    askingPriceTotalMillion: totalMillion,
    askingPricePerSqm: pricePerSqm,
    buildingAgeYears: age,
    floor,
    hasElevator,
    hasParking,
    hasStorage,
    deedCategory,
    detectedHoodName: defaultHood,
  };
}

export function diagnoseListingDeal(
  parsed: ListingParsedData,
  cityKey = 'tehran',
  targetHoodId?: number
): ListingDiagnosisResult {
  const cityCfg = MULTI_CITY_CONFIGS[cityKey as keyof typeof MULTI_CITY_CONFIGS] || MULTI_CITY_CONFIGS.tehran;
  const allHoods = cityCfg?.neighborhoods || INITIAL_NEIGHBORHOODS;
  const hood = allHoods.find((h) => h.id === targetHoodId) || allHoods.find((h) => h.name === parsed.detectedHoodName) || allHoods[0];
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood));
  const fairDealPricePerSqm = agg.estimatedDealPricePerSqm || Math.round(hood.buyPerSqm * 0.88);

  const effectiveAskPerSqm = parsed.askingPricePerSqm > 0 ? parsed.askingPricePerSqm : hood.buyPerSqm;
  const effectiveAskTotal = parsed.askingPriceTotalMillion > 0 ? parsed.askingPriceTotalMillion : Math.round(effectiveAskPerSqm * parsed.areaSqm);

  const bubbleGapPct = Math.round(((effectiveAskPerSqm - fairDealPricePerSqm) / Math.max(1, fairDealPricePerSqm)) * 100);
  const totalBubbleMillion = Math.max(0, Math.round((effectiveAskPerSqm - fairDealPricePerSqm) * parsed.areaSqm));
  const recommendedDiscountMillion = Math.max(Math.round(effectiveAskTotal * 0.05), totalBubbleMillion);

  const redFlags: ListingRedFlag[] = [];

  // Red Flag 1: High floor walk-up
  if (parsed.floor >= 3 && parsed.hasElevator === false) {
    redFlags.push({
      id: 'rf_no_elevator',
      severity: 'CRITICAL',
      title: 'خطر طبقه بالا بدون آسانسور (پله‌روی شدید)',
      explanation: `طبقه ${toPersianDigits(parsed.floor)} بدون آسانسور در بافت مسکونی، افت حداقل ۱۲٪ تا ۱۵٪ در ارزش و نقدشوندگی بسیار دشوار در آینده دارد.`,
      financialImpactMillionToman: Math.round(effectiveAskTotal * 0.12),
    });
  } else if (parsed.floor >= 3 && parsed.hasElevator === null) {
    redFlags.push({
      id: 'rf_elevator_silent',
      severity: 'WARNING',
      title: 'ابهام در آسانسور برای طبقه بالا',
      explanation: 'در متن آگهی به آسانسور اشاره نشده؛ عدم ذکر آسانسور در طبقات ۳ به بالا معمولاً نشانه فقدان آن است.',
    });
  }

  // Red Flag 2: Missing parking in larger units
  if (parsed.areaSqm >= 70 && parsed.hasParking === false) {
    const parkingVal = Math.round(Math.min(900, Math.max(350, fairDealPricePriceScale(hood.buyPerSqm))));
    redFlags.push({
      id: 'rf_no_parking',
      severity: 'CRITICAL',
      title: 'فقدان پارکینگ سندی در متراژ بالای ۷۰ متر',
      explanation: `عدم پارکینگ سندی در این متراژ کسر ثمن سنگین به همراه دارد و خریدار را با چالش پارک در معبر مواجه می‌کند.`,
      financialImpactMillionToman: parkingVal,
    });
  }

  // Red Flag 3: Title deed vulnerabilities
  if (parsed.deedCategory === 'COOPERATIVE_ENDOWMENT') {
    redFlags.push({
      id: 'rf_endowment',
      severity: 'CRITICAL',
      title: 'سند اوقافی یا آستان قدس',
      explanation: 'سند اوقافی باید به طور عرفی ۱۵٪ تا ۲۵٪ زیر قیمت سند تک‌برگ شخصی معامله شود و اخذ تسهیلات بانکی نیازمند مجوز اوقاف است.',
      financialImpactMillionToman: Math.round(effectiveAskTotal * 0.18),
    });
  } else if (parsed.deedCategory === 'PROMISES_OF_SALE' || parsed.deedCategory === 'UNDIVIDED_SHARE') {
    redFlags.push({
      id: 'rf_promissory',
      severity: 'CRITICAL',
      title: 'سند غیررسمی / قولنامه‌ای / مشاعی',
      explanation: 'ریسک حقوقی معارض ثبتی و عدم امکان صدور کد رهگیری رسمی کاداستر. معامله بدون وکیل توصیه نمی‌شود.',
    });
  }

  // Red Flag 4: Suspicious price bait
  if (bubbleGapPct <= -22) {
    redFlags.push({
      id: 'rf_bait_price',
      severity: 'WARNING',
      title: 'قیمت به‌شدت پایین‌تر از عرف محله (مشکوک به آگهی طعمه)',
      explanation: 'قیمت اعلامی بیش از ۲۰٪ زیر کف بازار است؛ معمولاً مشاوران از این فایل‌ها برای زنگ‌خور و پیشنهاد فایل‌های دیگر استفاده می‌کنند.',
    });
  }

  let dealVerdict: ListingDiagnosisResult['dealVerdict'] = 'NEGOTIATION_REQUIRED';
  let verdictLabelFa = 'نیازمند چانه‌زنی و اصلاح ثمن معامله';

  if (bubbleGapPct > 15) {
    dealVerdict = 'HEAVY_BUBBLE';
    verdictLabelFa = `حباب سنگین (+${toPersianDigits(bubbleGapPct)}٪ بالاتر از کف منصفانه)`;
  } else if (bubbleGapPct <= -5 && redFlags.filter((r) => r.severity === 'CRITICAL').length === 0) {
    dealVerdict = 'FAIR_OPPORTUNITY';
    verdictLabelFa = 'قیمت مناسب و فرصت خرید منصفانه';
  } else if (bubbleGapPct <= -22) {
    dealVerdict = 'SUSPICIOUS_BAIT';
    verdictLabelFa = 'مشکوک به قیمت فیک و طعمه آگهی';
  }

  const openingOffer = Math.max(Math.round(effectiveAskTotal * 0.8), effectiveAskTotal - recommendedDiscountMillion);

  return {
    parsed,
    hoodId: hood.id,
    hoodName: hood.name,
    fairDealPricePerSqm,
    bubbleGapPct,
    totalBubbleMillion,
    recommendedDiscountMillion,
    dealVerdict,
    verdictLabelFa,
    redFlags,
    negotiationScript: {
      firstCallQuestions: [
        'وضعیت سند دقیقاً چگونه است؟ آیا سند تک‌برگ شخصی و بدون رهن بانک است؟',
        parsed.hasElevator === null ? 'آیا واحد آسانسور فعال دارد یا راه‌پله است؟' : 'تعداد کل واحدهای ساختمان و سهم طبقه از مشاعات چند واحد است؟',
        parsed.hasParking === null ? 'پارکینگ سندی بدون مزاحم دارد یا خیر؟' : 'پارکینگ در طبقه همکف است یا منفی و رمپ؟',
        'علت فروش و انگیزه مالک چیست و تا چه مبلغی برای نشست قطعی راه می‌آید؟',
      ],
      openingOfferMillion: openingOffer,
      closingMeetingTactic: `در جلسه اعلام کنید: «با بررسی معاملات ثبت‌شده اخیر در ${hood.name} و ارزیابی عینی امکانات، پیشنهاد ما ${toPersianDigits(openingOffer)} م.ت نقدی بدون معطلی وام است.»`,
    },
  };
}

function fairDealPricePriceScale(buyPerSqm: number): number {
  if (buyPerSqm >= 180) return 800;
  if (buyPerSqm >= 120) return 600;
  if (buyPerSqm >= 80) return 450;
  return 350;
}

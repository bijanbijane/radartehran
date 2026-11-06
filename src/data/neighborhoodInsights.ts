/** @file src/data/neighborhoodInsights.ts — موتور تحلیل عمیق محله‌ها (Micro-Hoods، مترو مستقیم، خرید/اجاره و معاوضه ملک) */
import { EvaluatedNeighborhood, Neighborhood, toPersianNum } from './neighborhoods';
import { TEHRAN_REMAINING_INSIGHTS_BY_ID } from './tehranExtendedInsights';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';
export interface MicroHoodTier { tier: 'luxury' | 'balanced' | 'economic'; label: string; streets: string; priceMultiplier: number; }
export interface NeighborhoodDeepInsight { hoodId: number; winterSnowRisk: 'HIGH' | 'MEDIUM' | 'LOW'; futureGrowthScore: number; monthlyChargeEstimateThousand: number; costOfLivingLevel: string; nightParkingScore: number; microHoods: MicroHoodTier[]; vibeTags: string[]; hiddenTraps: string[]; futureCatalyst?: string; metroLines?: number[]; nearestMetroStations?: string[]; topSchools: string[]; }
export interface RentVsBuyVerdict { recommendation: 'BUY_NOW' | 'RENT_AND_INVEST' | 'BALANCED'; capitalRequired80mMillion: number; rahn80mMillion: number; prRatio: number; freedCapitalForGoldMillion: number; annualRentYieldPercent: number; buy3YrWealthBillion: number; rentInvest3YrWealthBillion: number; title: string; explanation: string; }
export interface TradeUpOptionsParams { currentHood: EvaluatedNeighborhood; currentSqm: number; currentAgeYears: number; extraCashMillion?: number; useLoanBooster?: boolean; useTenantRahnDeduction?: boolean; targetNewSqm: number; targetAgeSegment: 'new' | 'mid' | 'older'; allNeighborhoods: EvaluatedNeighborhood[]; }
export interface TradeUpCandidate { hood: EvaluatedNeighborhood; targetUnitTotalPriceMillion: number; surplusOrDeficitMillion: number; isAffordable: boolean; }
export interface TradeUpResult { currentHomeSaleValueMillion: number; netProceedsFromSaleMillion: number; totalBaseCapitalMillion: number; matchingHoods: TradeUpCandidate[]; }
export const COMPLETE_INSIGHTS_BY_ID: Record<number, NeighborhoodDeepInsight> = { 1: { hoodId: 1, winterSnowRisk: 'HIGH', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 6500, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.0, vibeTags: ['💎 پایتخت برج‌باغ‌های مدرن', '🍃 کوهپایه البرز با هوای ناب', '🏛️ دیپلمات‌نشین و آرام'], hiddenTraps: ['شیب تند خیابان‌های شمالی در برف و یخبندان', 'شارژهای فوق‌سنگین مشاعات برج‌ها'], futureCatalyst: 'نوسازی املاک قدیمی آصف و پروژه‌های پنت‌هاوس', metroLines: [1], nearestMetroStations: ['مترو تجریش (خط ۱)'], topSchools: ['مدرسه بین‌الملل شهید مهدوی', 'دبیرستان علامه طباطبایی'], microHoods: [
      { tier: 'luxury', label: 'خیابان‌های فوق‌اعیانی آصف و بهزادی', streets: 'خیابان آصف، بهزادی، ماکویی پور', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل زعفرانیه', streets: 'ثارالله، حیدرعلی، سیمین', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فرعی‌های پایین مقدس اردبیلی', priceMultiplier: 0.86 }, ], }, 2: { hoodId: 2, winterSnowRisk: 'HIGH', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 5800, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.2, vibeTags: ['👑 همسایه کاخ و بوستان نیاوران', '🌲 هوای پاک کوهستانی', '🏡 ویلایی و برج‌های مشجر'], hiddenTraps: ['ترافیک باهنر در ایام تعطیل', 'دسترسی ضعیف به شبکه مترو'], futureCatalyst: 'توسعه خدمات شهری و گردشگری محور کاخ نیاوران', metroLines: [1], nearestMetroStations: ['مترو تجریش (خط ۱)'], topSchools: ['مجتمع آموزشی نگین نیاوران', 'دبیرستان روشنگر'], microHoods: [
      { tier: 'luxury', label: 'جماران و کامرانیه شمالی', streets: 'یاسر، جماران، فیضیه', priceMultiplier: 1.16 }, { tier: 'balanced', label: 'متعادل نیاوران', streets: 'خیابان باهنر، مژده، منظریه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'کاشانک و مرز دارآباد', priceMultiplier: 0.85 }, ], }, 3: { hoodId: 3, winterSnowRisk: 'LOW', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 4800, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 7.0, vibeTags: ['🏙️ قطب نوساز غرب تهران', '🛍️ مراکز خرید لوکس و کافه‌ها', '🌐 پوشش کامل فیبر نوری'], hiddenTraps: ['ترافیک میدان کاج و فرهنگ', 'کمبود پارک حاشیه‌ای در ساعات عصر'], futureCatalyst: 'افتتاح کامل ایستگاه‌های خط ۱۰ مترو در محور سرو و کتاب', metroLines: [7], nearestMetroStations: ['مترو میدان کتاب (خط ۷)'], topSchools: ['دبیرستان مفید سعادت‌آباد', 'مجتمع آموزشی علامه حلی'], microHoods: [
      { tier: 'luxury', label: 'بالای میدان کاج و بهزاد', streets: 'مروارید، صرافها شمالی، بهزاد', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'بلوار شهرداری و فرهنگ', streets: 'سرو غربی و شرقی، علامه شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'کوی فراز و فرعی‌های پایین نیایش', priceMultiplier: 0.86 }, ], }, 4: { hoodId: 4, winterSnowRisk: 'LOW', futureGrowthScore: 8.8, monthlyChargeEstimateThousand: 5200, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 8.2, vibeTags: ['📐 شهرسازی مدرن شطرنجی', '🌳 بوستان‌های وسیع و محوطه‌های سبز', '💎 بالاترین تقاضای ملکی'], hiddenTraps: ['شلوغی بلوار دادمان و پاکنژاد در ساعات پیک'], futureCatalyst: 'تقاطع خط ۷ و خط ۱۰ مترو در میدان صنعت', metroLines: [7], nearestMetroStations: ['مترو میدان صنعت (خط ۷)', 'مترو دادمان (خط ۷)'], topSchools: ['مجتمع آموزشی ابوریحان', 'دبیرستان فرزانگان'], microHoods: [
      { tier: 'luxury', label: 'فاز ۱ و ۲ ویلایی', streets: 'خیابان ایران‌زمین، گلستان، مهستان', priceMultiplier: 1.20 }, { tier: 'balanced', label: 'فاز ۳ و ۴ آپارتمانی', streets: 'بلوار دادمان، زرافشان، درختی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فاز ۶ و مرز فرحزاد', priceMultiplier: 0.85 }, ], }, 5: { hoodId: 5, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 2200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.8, vibeTags: ['🏡 بورس خوش‌قیمت غرب تهران', '🛍️ مراکز خرید بوستان و تیراژه', '🌳 پارک نهج‌البلاغه'], hiddenTraps: ['ترافیک میدان پونک و میرزابابایی در غروب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور پونک و اشرفی اصفهانی', metroLines: [6], nearestMetroStations: ['مترو شهید ستاری (خط ۶)', 'مترو اشرفی اصفهانی (خط ۶)'], topSchools: ['دبیرستان نمونه دولتی رشد', 'مجتمع آموزشی دانشمند'], microHoods: [
      { tier: 'luxury', label: 'پونک شمالی و همیلا', streets: 'بلوار همیلا، پارک نهج‌البلاغه، استاد نظری', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل پونک', streets: 'میرزابابایی، عدل، سردار جنگل', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پونک جنوبی و حاشیه بزرگراه اشرفی', priceMultiplier: 0.86 }, ], }, 6: { hoodId: 6, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 2300, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.4, vibeTags: ['🌬️ هوای مطبوع دامنه‌های البرز غربی', '🛍️ مجتمع‌های تجاری نیایش و سمرقند', '🛣️ دسترسی سریع همت و نیایش'], hiddenTraps: ['شیب خیابان‌ها در جنت‌آباد شمالی در یخبندان زمستان'], futureCatalyst: 'اتصال ایستگاه جنت‌آباد به خط ۶ مترو', metroLines: [6], nearestMetroStations: ['مترو شهران (خط ۶)', 'مترو شهید ستاری (خط ۶)'], topSchools: ['مجتمع آموزشی سلام جنت‌آباد', 'دبیرستان فرزانگان ۵'], microHoods: [
      { tier: 'luxury', label: 'جنت‌آباد جنوبی و گلستان', streets: 'چهارباغ، خیابان گلستان، پژوهنده', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'جنت‌آباد مرکزی', streets: 'بلوار بعثت، مخبری، شاهین شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'جنت‌آباد شمالی', streets: 'میدان انصار، کوروش، سیمون بولیوار', priceMultiplier: 0.86 }, ], }, 7: { hoodId: 7, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1950, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.5, vibeTags: ['🚇 قطب حمل‌ونقل غرب (مترو خط ۲ و ۵)', '🛍️ بازارهای سنتی و مدرن صادقیه', '🏢 آپارتمان‌های نقدشونده و خوش‌مسیر'], hiddenTraps: ['ترافیک فلکه دوم صادقیه در ساعات صبح و غروب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور بزرگراه اشرفی و جناح', metroLines: [2, 5], nearestMetroStations: ['مترو صادقیه (خط ۲ و ۵)', 'مترو طرشت (خط ۲)'], topSchools: ['دبیرستان نمونه دولتی رشد ۵', 'مجتمع آموزشی احسان صادقیه'], microHoods: [
      { tier: 'luxury', label: 'بلوار فردوس و سازمان آب بالا', streets: 'بلوار فردوس شرق، گلناز، سازمان آب', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل صادقیه', streets: 'فلکه اول و دوم صادقیه، بلوار اباذر، خسرو شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'اطراف میدان صادقیه و بزرگراه جناح', priceMultiplier: 0.86 }, ], }, 8: { hoodId: 8, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2900, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.5, vibeTags: ['🌳 پارک شفق و فرهنگ اصیل محله', '🏢 پلاک‌های ویلایی نوسازی‌شده', '🚗 خیابان‌های عریض بیستون و جهان‌آرا'], hiddenTraps: ['قرارگیری در محدوده کنترل آلودگی هوا (زوج و فرد سابق)'], futureCatalyst: 'ایستگاه‌های جدید خط ۶ و توسعه نوسازی پلاک‌های تجمیعی', metroLines: [6], nearestMetroStations: ['مترو بوستان لاله (خط ۶)', 'مترو میدان جهاد (خط ۳)'], topSchools: ['دبیرستان البرز یوسف‌آباد', 'مجتمع آموزشی مهر هشتم'], microHoods: [
      { tier: 'luxury', label: 'بالای یوسف‌آباد و جهان‌آرا', streets: 'خیابان جهان‌آرا، مهرام، خیابان‌های ۶۰ به بالا', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل یوسف‌آباد', streets: 'میدان کلانتری، خیابان سیدجمال‌الدین، ابن‌سینا', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فتح‌آبادی و حاشیه بزرگراه همت', priceMultiplier: 0.85 }, ], }, 9: { hoodId: 9, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2700, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.2, vibeTags: ['🎓 قطب دانشگاهی تهران', '🌳 پارک لاله و موزه هنرهای معاصر', '🚇 خط ۶ مترو کارگر'], hiddenTraps: ['شلوغی مراکز دانشجویی و کمبود پارکینگ در امیرآباد جنوبی'], futureCatalyst: 'احداث ایستگاه‌های جدید خط ۶ مترو در محور کارگر شمالی', metroLines: [6], nearestMetroStations: ['مترو کارگر (خط ۶)', 'مترو بوستان لاله (خط ۶)'], topSchools: ['دبیرستان علامه حلی ۱', 'دبیرستان فرزانگان مرکز'], microHoods: [
      { tier: 'luxury', label: 'امیرآباد شمالی و جانبازان', streets: 'کارگر شمالی، خیابان بیستم به بالا، فرشی‌مقدم', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل امیرآباد', streets: 'خیابان نصرت، فرصت شیرازی، جلال آل احمد', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'امیرآباد جنوبی و حاشیه فاطمی', priceMultiplier: 0.86 }, ], }, 10: { hoodId: 10, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 3800, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 5.2, vibeTags: ['💼 پایتخت شرکت‌ها و ادارات', '🌳 بافت دنج ملاصدرا و شیراز', '🛍️ مراکز تجاری ونک و گاندی'], hiddenTraps: ['ترافیک سنگین میدان ونک و خیابان ملاصدرا در عصرها'], futureCatalyst: 'توسعه ایستگاه‌های خط ۱۰ مترو در محور ملاصدرا و ونک', metroLines: [1], nearestMetroStations: ['مترو شهید حقانی (خط ۱)'], topSchools: ['مجتمع آموزشی روزبه', 'دبیرستان فرزانگان ۳'], microHoods: [
      { tier: 'luxury', label: 'شیراز جنوبی و خدامی', streets: 'خیابان خدامی، شیراز جنوبی، عطار', priceMultiplier: 1.16 }, { tier: 'balanced', label: 'ملاصدرا و سئول', streets: 'خیابان ملاصدرا، پردیس، زاینده‌رود', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ده ونک و حاشیه بزرگراه چمران', priceMultiplier: 0.85 }, ], }, 11: { hoodId: 11, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 4500, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.4, vibeTags: ['🌳 چنارهای کهنسال خیابان پاسداران', '💎 برج‌های اعیانی بوستان‌ها و گلستان‌ها', '🛍️ مراکز خرید لوکس'], hiddenTraps: ['ترافیک سنگین چهارراه پاسداران و احتشامیه در غروب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور نوبنیاد و پاسداران شمال', metroLines: [3], nearestMetroStations: ['مترو نوبنیاد (خط ۳)', 'مترو شهید زین‌الدین (خط ۳)'], topSchools: ['مجتمع آموزشی شهید مهدوی', 'دبیرستان علامه طباطبایی پاسداران'], microHoods: [
      { tier: 'luxury', label: 'گلستان‌ها و بوستان‌ها', streets: 'گلستان دوم تا پنجم، بوستان دوم، بوستان هفتم', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل پاسداران', streets: 'خیابان دولت، اختیاریه شمالی، پایدارفر', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پاسداران پایین‌تر از ضرابخانه و حاشیه صیاد', priceMultiplier: 0.85 }, ], }, 12: { hoodId: 12, winterSnowRisk: 'LOW', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 3200, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 7.2, vibeTags: ['🚇 ایستگاه مترو اختصاصی هروی (خط ۳)', '🛍️ مرکز خرید الماس و مایسا هروی', '🏢 نوسازهای مدرن با طراحی مهندسی'], hiddenTraps: ['ترافیک میدان هروی در ساعات پایانی شب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور نوبنیاد و میدان هروی', metroLines: [3], nearestMetroStations: ['مترو هروی (خط ۳)', 'مترو حسین‌آباد (خط ۳)'], topSchools: ['مجتمع آموزشی سلاله', 'دبیرستان رشد هروی'], microHoods: [
      { tier: 'luxury', label: 'بلوار پناهی‌نیا و وفامنش', streets: 'خیابان وفامنش، گلزار، ساقدوش شمالی', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل هروی', streets: 'میدان هروی، خیابان موسوی، مکران شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مبارک‌آباد و مرز بزرگراه صیاد', priceMultiplier: 0.86 }, ], }, 13: { hoodId: 13, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1500, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.2, vibeTags: ['🌳 ۱۰۰ میدان سرسبز و آرامش‌بخش نارمک', '🚇 دسترسی مستقیم خط ۲ مترو', '🏡 بافت خانوادگی اصیل شرق تهران'], hiddenTraps: ['طرح تردد یک‌طرفه در برخی خیابان‌های منتهی به آیت و رسالت'], futureCatalyst: 'نوسازی پلاک‌های تجمیعی پیرامون میدان‌های نارمک', metroLines: [2], nearestMetroStations: ['مترو سرسبز (خط ۲)', 'مترو دانشگاه علم و صنعت (خط ۲)'], topSchools: ['دبیرستان نمونه دولتی دانشمند', 'مجتمع آموزشی کمال نارمک'], microHoods: [
      { tier: 'luxury', label: 'میدان‌های ۱ تا ۳۰ نارمک', streets: 'میدان هلال احمر، میدان ۴۲، میدان ۴۷', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل نارمک', streets: 'چهارراه تلفنخانه، فرجام غربی، دردشت', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'خیابان سمنگان و مرز بزرگراه رسالت', priceMultiplier: 0.86 }, ], }, 14: { hoodId: 14, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.8, vibeTags: ['📐 فلکه‌های چهارگانه منظم و شطرنجی', '🚇 مترو خط ۲ مستقیم', '🛍️ مراکز خرید سپید و پارسیان'], hiddenTraps: ['ترافیک فلکه اول و دوم در ساعات خرید عصرگاهی'], futureCatalyst: 'توسعه شرقی خط ۲ و اتصال به خط ۱۰ مترو', metroLines: [2], nearestMetroStations: ['مترو تهرانپارس (خط ۲)', 'مترو فرهنگسرا (خط ۲)'], topSchools: ['دبیرستان کمال تهرانپارس', 'مجتمع آموزشی اسوه'], microHoods: [
      { tier: 'luxury', label: 'بین فلکه دوم و سوم', streets: 'خیابان رشید، خیابان زرین، خیابان‌های ۱۶۰ تا ۱۸۰', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'تهرانپارس غربی', streets: 'فلکه اول، خیابان بهار، بلوار شاهد', priceMultiplier: 1.0 }, { tier: 'economic', label: 'تهرانپارس شرقی', streets: 'خیابان‌های شرقی بالای خیابان ۱۹۶', priceMultiplier: 0.86 }, ], }, 15: { hoodId: 15, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.8, vibeTags: ['🚇 خط ۴ مترو پیروزی با ۵ ایستگاه', '🛒 دسترسی عالی به امکانات روزمره', '⚡ نقدشوندگی بسیار بالا'], hiddenTraps: ['گذرهای باریک در فرعی‌های قدیمی و کمبود پارکینگ'], futureCatalyst: 'نوسازی پلاک‌های فرسوده در شمال خیابان پیروزی', metroLines: [4], nearestMetroStations: ['مترو پیروزی (خط ۴)', 'مترو نبرد (خط ۴)', 'مترو ابن‌سینا (خط ۴)'], topSchools: ['دبیرستان اندیشه پیروزی', 'هنرستان فنی شهید باهنر'], microHoods: [
      { tier: 'luxury', label: 'صددستگاه و چهارصددستگاه', streets: 'خیابان دهم فروردین، صددستگاه، شکوفه', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل پیروزی', streets: 'خیابان پیروزی، نبرد شمالی، پرستار', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'بلوار ابوذر و فرعی‌های منتهی به امام علی', priceMultiplier: 0.86 }, ], }, 16: { hoodId: 16, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1400, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.8, vibeTags: ['📐 خیابان‌بندی مهندسی نیروهوایی', '🌳 بوستان پیروزی و فلکه لوزی', '🚇 دو ایستگاه خط ۴ مترو'], hiddenTraps: ['ترافیک فلکه اول و دوم در ساعات عصرگاهی'], futureCatalyst: 'آزادسازی پادگان ۰۶ و احداث پهنه بزرگ سبز-فرهنگی شرق', metroLines: [4], nearestMetroStations: ['مترو کلاهدوز (خط ۴)', 'مترو نیروهوایی (خط ۴)'], topSchools: ['دبیرستان نمونه دولتی فجر', 'مجتمع آموزشی علوی نیروهوایی'], microHoods: [
      { tier: 'luxury', label: 'خیابان‌های اول تا سوم نیروهوایی', streets: 'خیابان یکم تا سوم، فلکه لوزی، سی‌متری نیروهوایی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'خیابان‌های چهارم تا ششم', streets: 'خیابان چهارم، پنجم و ششم نیروهوایی، فلکه دوم', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'خیابان هفتم و هشتم و انتهای پیروزی', priceMultiplier: 0.86 }, ], }, 17: { hoodId: 17, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1450, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.0, vibeTags: ['🛍️ اصلی‌ترین قطب خرید شرق تهران (میدان نبوت)', '🚇 مترو سرسبز و خطوط بی‌آرتی رسالت', '🏬 پاساژها و مراکز تجاری گلبرگ و آیت'], hiddenTraps: ['شلوغی پیاده‌روها و ترافیک میدان نبوت (هفت‌حوض) در عصرها'], futureCatalyst: 'بهسازی پیاده‌راه‌های تجاری میدان نبوت و توسعه پارکینگ طبقاتی', metroLines: [2], nearestMetroStations: ['مترو سرسبز (خط ۲)', 'مترو فدک (خط ۲)'], topSchools: ['دبیرستان کمال هفت‌حوض', 'دبیرستان نمونه دولتی نبوت'], microHoods: [
      { tier: 'luxury', label: 'جانبازان (گلبرگ) و رضوان', streets: 'جانبازان غربی و شرقی (گلبرگ)، خیابان رضوان', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل هفت‌حوض', streets: 'خیابان آیت، خیابان مدائن، عظیمی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فرعی‌های نزدیک بزرگراه رسالت و چمن', priceMultiplier: 0.86 }, ], }, 18: { hoodId: 18, winterSnowRisk: 'LOW', futureGrowthScore: 8.3, monthlyChargeEstimateThousand: 1250, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 4.8, vibeTags: ['🎓 قلب دانشگاهی و فرهنگی ایران (انقلاب)', '🚇 تقاطع طلایی مترو خط ۳ و ۴ و بی‌آرتی', '📚 راسته کتابفروشی‌ها، کافه‌ها و سینماها'], hiddenTraps: ['قرارگیری در محدوده طرح ترافیک اصلی و شلوغی روزانه'], futureCatalyst: 'توسعه پردیس‌های فناوری و نوآوری اطراف دانشگاه تهران', metroLines: [3, 4], nearestMetroStations: ['مترو میدان انقلاب (خط ۴)', 'مترو تئاتر شهر (خط ۳ و ۴)'], topSchools: ['دبیرستان ماندگار البرز', 'دبیرستان علامه حلی مرکز'], microHoods: [
      { tier: 'luxury', label: 'بلوار کشاورز و جمالزاده شمالی', streets: 'بلوار کشاورز، جمالزاده شمالی، خیابان نصرت', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل انقلاب', streets: 'کارگر شمالی، شانزده آذر، خیابان قدس', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'کارگر جنوبی و جمالزاده جنوبی', priceMultiplier: 0.85 }, ], }, 19: { hoodId: 19, winterSnowRisk: 'LOW', futureGrowthScore: 8.2, monthlyChargeEstimateThousand: 950, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 5.2, vibeTags: ['🚇 ۳ ایستگاه مترو خط ۲ و ۷ و خط بی‌آرتی نواب', '⚡ نقدشوندگی فوق‌سریع با بودجه اقتصادی', '🛣️ شریان مستقیم شمال به جنوب مرکز تهران'], hiddenTraps: ['آلودگی صوتی در واحدهای برِ بزرگراه نواب و تراکم مجتمع‌ها'], futureCatalyst: 'نوسازی بافت پیرامونی بریانک و بهسازی فضای سبز محور نواب', metroLines: [2, 7], nearestMetroStations: ['مترو نواب صفوی (خط ۲ و ۷)', 'مترو کمیل (خط ۷)', 'مترو بریانک (خط ۷)'], topSchools: ['دبیرستان نمونه دولتی نواب', 'هنرستان فنی انقلاب اسلامی'], microHoods: [
      { tier: 'luxury', label: 'آذربایجان و بریانک شرقی نوساز', streets: 'خیابان آذربایجان، بریانک شرقی، خوش جنوبی', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل نواب و کمیل', streets: 'خیابان کمیل، مرتضوی، محبوب مجاز', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مجتمع‌های بر بزرگراه نواب فاز ۱ تا ۳', priceMultiplier: 0.85 }, ], }, 20: { hoodId: 20, winterSnowRisk: 'LOW', futureGrowthScore: 8.3, monthlyChargeEstimateThousand: 1100, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 4.9, vibeTags: ['🛍️ بورس تجاری مرکز تهران و خیابان جمهوری', '🚇 احاطه‌شده با ایستگاه‌های مترو خط ۲، ۳، ۴ و ۷', '🏡 محله اصیل و پررونق رودکی (سلسبیل) و خوش'], hiddenTraps: ['کوچه‌های باریک در بخش‌های قدیمی و کمبود پارکینگ مهمان'], futureCatalyst: 'نوسازی پلاک‌های تجمیعی در محور رودکی، خوش و قصرالدشت', metroLines: [2, 3, 4, 7], nearestMetroStations: ['مترو میدان جمهوری (خط ۲)', 'مترو رودکی (خط ۷)', 'مترو شادمان (خط ۲ و ۴)'], topSchools: ['دبیرستان دارالفنون', 'دبیرستان نمونه دولتی رودکی'], microHoods: [
      { tier: 'luxury', label: 'رودکی شمالی و خوش شمالی', streets: 'خیابان رودکی (سلسبیل) شمالی، خوش شمالی، دامپزشکی', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل جمهوری', streets: 'خیابان جمهوری، قصرالدشت، هاشمی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'اسکندری جنوبی و مرز بزرگراه نواب', priceMultiplier: 0.85 }, ], }, 21: { hoodId: 21, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 850, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 6.6, vibeTags: ['🛋️ پایتخت بازار مبل و دکوراسیون ایران', '🏡 آپارتمان‌های نوساز و خوش‌قیمت بلوار معلم', '🛣️ دسترسی مستقیم به بزرگراه سعیدی و فتح'], hiddenTraps: ['فاصله نسبی از ایستگاه مترو و ترافیک چهارراه یافت‌آباد در عصرها'], futureCatalyst: 'توسعه خط مترو جنوب‌غرب در محور بلوار معلم و چهارراه یافت‌آباد', metroLines: [3], nearestMetroStations: ['مترو آزادگان (خط ۳)', 'مترو نعمت‌آباد (خط ۳)'], topSchools: ['دبیرستان نمونه دولتی الغدیر', 'مجتمع آموزشی معلم یافت‌آباد'], microHoods: [
      { tier: 'luxury', label: 'بلوار معلم و میدان الغدیر', streets: 'بلوار معلم، میدان الغدیر، شهرک ولیعصر شمالی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل یافت‌آباد', streets: 'چهارراه یافت‌آباد، خیابان زندیه، حیدری', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ابراهیم‌آباد و حاشیه بزرگراه سعیدی', priceMultiplier: 0.86 }, ], }, 22: { hoodId: 22, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1050, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 6.4, vibeTags: ['🛍️ پویاترین محله جنوب تهران (بازار دوم نازی‌آباد)', '📐 خیابان‌بندی منظم هزاردستگاه و مدائن', '🚇 دسترسی سریع به مترو علی‌آباد و جوادیه'], hiddenTraps: ['شلوغی و ترافیک خیابان مدائن و بازار دوم در ساعات خرید شبانه'], futureCatalyst: 'نوسازی پلاک‌های ویلایی هزاردستگاه و توسعه مراکز خرید مدرن', metroLines: [1, 3], nearestMetroStations: ['مترو علی‌آباد (خط ۱)', 'مترو جوادیه (خط ۳)'], topSchools: ['دبیرستان نمونه دولتی رجایی نازی‌آباد', 'مجتمع آموزشی خوارزمی جنوب'], microHoods: [
      { tier: 'luxury', label: 'هزاردستگاه و بازار دوم', streets: 'هزاردستگاه، میدان بازار دوم، خیابان مدائن شمالی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل نازی‌آباد', streets: 'خیابان شیرمحمدی، اکبر مشهدی، بهمنیار', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'خانی‌آباد نو و حاشیه بزرگراه رجایی', priceMultiplier: 0.86 }, ], }, 23: { hoodId: 23, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 900, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 7.2, vibeTags: ['🏛️ کهن‌ترین شهر تاریخ تهران با محله اصیل دولت‌آباد', '🚇 پوشش همزمان خط ۱ و خط ۶ مترو', '🌳 بلوارهای مشجر قدس و فدائیان اسلام'], hiddenTraps: ['مسافت طولانی تا مناطق شمالی تهران'], futureCatalyst: 'تکمیل ایستگاه‌های توسعه جنوبی خط ۶ مترو در دولت‌آباد و حرم', metroLines: [1, 6], nearestMetroStations: ['مترو شهرری (خط ۱)', 'مترو جوانمرد قصاب (خط ۱)', 'مترو دولت‌آباد (خط ۶)'], topSchools: ['دبیرستان استعدادهای درخشان شهرری', 'مجتمع آموزشی دولت‌آباد'], microHoods: [
      { tier: 'luxury', label: 'فلکه اول تا سوم دولت‌آباد', streets: 'بلوار قدس دولت‌آباد، فلکه اول و دوم، پارک دولت‌آباد', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل شهرری', streets: 'جوانمرد قصاب، خیابان فدائیان اسلام، میدان نماز', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'سه‌راه ورامین و دیلمان جنوبی', priceMultiplier: 0.85 }, ], }, 24: { hoodId: 24, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 980, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 7.0, vibeTags: ['📐 خیابان‌های ۱۵ متری کاملاً شطرنجی و منظم', '🛣️ دسترسی مستقیم به بزرگراه بسیج، محلاتی و آزادگان', '🏢 آپارتمان‌های نوساز و خوش‌نقشه شرق-جنوب'], hiddenTraps: ['ترافیک صبحگاهی در سه‌راه افسریه (تختی) و ورودی بزرگراه محلاتی'], futureCatalyst: 'توسعه خط ۷ و خط جدید مترو در محور بزرگراه بسیج و افسریه', metroLines: [4, 7], nearestMetroStations: ['مترو بسیج (خط ۷)', 'مترو کلاهدوز (خط ۴)'], topSchools: ['دبیرستان نمونه دولتی افسریه', 'مجتمع آموزشی بعثت شرق'], microHoods: [
      { tier: 'luxury', label: 'افسریه شمالی و قصر فیروزه', streets: '۱۵ متری اول و دوم افسریه شمالی، شهرک قصر فیروزه', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل افسریه', streets: '۲۰ متری افسریه، ۱۵ متری سوم، خیابان رحیمی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'افسریه جنوبی و مسعودیه', priceMultiplier: 0.86 }, ], }, 25: { hoodId: 25, winterSnowRisk: 'LOW', futureGrowthScore: 9.1, monthlyChargeEstimateThousand: 3200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 8.8, vibeTags: ['🌊 نگین گردشگری دریاچه شهدای خلیج‌فارس', '🛍️ قطب ایران‌مال و باملند', '🏗️ بلندمرتبه‌سازی‌های مدرن ضدزلزله'], hiddenTraps: ['شارژ ماهانه برج‌های لاکچری و شلوغی آخر هفته‌های باملند'], futureCatalyst: 'تکمیل ایستگاه‌های خط ۱۰ مترو در محور رینگ دریاچه و کوهک', metroLines: [5], nearestMetroStations: ['مترو چیتگر (خط ۵)', 'مترو ایران‌خودرو (خط ۵)'], topSchools: ['دبیرستان شهدای چیتگر', 'مجتمع آموزشی بین‌الملل دریاچه'], microHoods: [
      { tier: 'luxury', label: 'رینگ اول دریاچه و کوهک بالا', streets: 'بلوار صیاد شیرازی، میدان ساحل، کوهک', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'شهرک گلستان (راه‌آهن)', streets: 'بلوار امیرکبیر، هوانیروز، بنفشه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پروژه‌های مسکونی مروارید شهر', priceMultiplier: 0.84 }, ], }, 26: { hoodId: 26, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2800, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.8, vibeTags: ['🗼 همسایه برج میلاد و پارک گفت‌وگو', '🛍️ بازارچه و بوتیک‌های کوی نصر (گیشا)', '📐 کوچه‌های زوج و فرد منظم'], hiddenTraps: ['کمبود شدید جای پارک در خیابان‌های زوج و فرد گیشا'], futureCatalyst: 'تکمیل تقاطع خط ۶ و ۷ مترو در دانشگاه تربیت مدرس و بوستان گفتگو', metroLines: [6, 7], nearestMetroStations: ['مترو دانشگاه تربیت مدرس (خط ۶ و ۷)', 'مترو بوستان گفتگو (خط ۷)'], topSchools: ['دبیرستان علامه طباطبایی گیشا', 'مجتمع آموزشی سوده'], microHoods: [
      { tier: 'luxury', label: 'کوچه‌های بالای گیشا و پارک گفتگو', streets: 'خیابان بلوچستان، فاضل شمالی، ضلع شرقی پارک گفتگو', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل گیشا (کوی نصر)', streets: 'کوی نصر میانی، خیابان‌های ۱۰ تا ۲۸', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ابتدای کوی نصر و مرز جلال آل احمد', priceMultiplier: 0.86 }, ], }, 27: { hoodId: 27, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 2600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.2, vibeTags: ['🛣️ شاهراه ارتباطی غرب تهران (بلوار مرزداران)', '🌳 شهرک ژاندارمری و پارک پردیسان', '🚇 ایستگاه اختصاصی خط ۶ مترو'], hiddenTraps: ['ترافیک عصرگاهی در تقاطع اشرفی اصفهانی و یادگار امام'], futureCatalyst: 'توسعه ایستگاه‌های جدید خط ۶ و ۱۰ مترو در محور مرزداران و اشرفی', metroLines: [6], nearestMetroStations: ['مترو یادگار امام (خط ۶)', 'مترو مرزداران (خط ۶)'], topSchools: ['دبیرستان انرژی اتمی غرب', 'مجتمع آموزشی راه رشد'], microHoods: [
      { tier: 'luxury', label: 'شهرک ژاندارمری و سپهر', streets: 'خیابان ابوالفضل، خیابان سپهر، ناهید و سرسبز شمالی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل مرزداران', streets: 'بلوار اصلی مرزداران، ابراهیمی، اطاعتی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فرعی‌های پایین مرزداران و مرز جلال', priceMultiplier: 0.86 }, ], }, 28: { hoodId: 28, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2100, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.2, vibeTags: ['🏡 اصالت بالای محله‌های دریان نو و تهران‌ویلا', '🛣️ دسترسی عالی به بزرگراه یادگار امام و شیخ فضل‌الله', '🚇 خط ۲ مترو طرشت و دانشگاه شریف'], hiddenTraps: ['ترافیک عصرگاهی خیابان ستارخان و پل ستارخان'], futureCatalyst: 'نوسازی پلاک‌های ویلایی دریان نو و توسعه دسترسی‌های یادگار امام', metroLines: [2], nearestMetroStations: ['مترو طرشت (خط ۲)', 'مترو دانشگاه شریف (خط ۲)', 'مترو توحید (خط ۲ و ۴)'], topSchools: ['دبیرستان نمونه دولتی علامه طباطبایی', 'مجتمع آموزشی مفید طرشت'], microHoods: [
      { tier: 'luxury', label: 'پاتریس لومومبا و دریان نو', streets: 'پاتریس لومومبا، دریان نو، شهرآرا بالا', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل ستارخان', streets: 'تهران‌ویلا، خیابان خسرو، باقرخان', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'شادمان و زنجان شمالی', priceMultiplier: 0.86 }, ], }, 29: { hoodId: 29, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 3900, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 5.6, vibeTags: ['🚇 دسترسی مستقیم مترو میرداماد و شریعتی', '🌳 فرعی‌های مشجر نفت شمالی و داوودیه', '💼 قلب مالی، بانکی و تجاری شمال پایتخت'], hiddenTraps: ['قفل ترافیکی بلوار میرداماد و میدان مادر در ساعات عصر'], futureCatalyst: 'نوسازی ساختمان‌های اداری-مسکونی و خط ۱۰ مترو', metroLines: [1], nearestMetroStations: ['مترو میرداماد (خط ۱)', 'مترو دکتر شریعتی (خط ۱)'], topSchools: ['دبیرستان رازی', 'دبیرستان خرد'], microHoods: [
      { tier: 'luxury', label: 'نفت شمالی و میدان مادر', streets: 'نفت شمالی، وزیری‌پور، شاه‌نظری', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل میرداماد', streets: 'بلوار میرداماد، میدان کتابی، حصاری', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'میرداماد غربی و حاشیه بزرگراه مدرس', priceMultiplier: 0.85 }, ], }, 30: { hoodId: 30, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 4400, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.2, vibeTags: ['🌳 همسایه بوستان بزرگ و تاریخی قیطریه', '🚇 مترو قیطریه و دسترسی سریع صدر و کاوه', '☕ کافه‌ها و پاتوق‌های مشهور بلوار اندرزگو'], hiddenTraps: ['شلوغی پارک قیطریه در آخر هفته و ترافیک شبانه بلوار اندرزگو'], futureCatalyst: 'بهسازی محور بلوار اندرزگو و خطوط دسترسی بزرگراه صدر', metroLines: [1], nearestMetroStations: ['مترو قیطریه (خط ۱)', 'مترو شهید صدر (خط ۱)'], topSchools: ['دبیرستان سروش شمیران', 'مجتمع آموزشی دکتر هشترودی'], microHoods: [
      { tier: 'luxury', label: 'اطراف پارک قیطریه و سهیل', streets: 'خیابان روشنایی، خیابان سهیل، بلوار صبا', priceMultiplier: 1.16 }, { tier: 'balanced', label: 'بلوار کاوه و اندرزگو', streets: 'بلوار کاوه، خیابان قلندری، سلیمانی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'چیذر پایین و مرز بزرگراه صدر', priceMultiplier: 0.85 }, ], }, 31: { hoodId: 31, winterSnowRisk: 'HIGH', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 6200, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.8, vibeTags: ['💎 پایتخت برج‌باغ‌های دیپلمات‌نشین فرمانیه', '🛍️ مراکز خرید روشا، سانا و عرش آجودانیه', '🍃 هوای کوهستانی شمیرانات'], hiddenTraps: ['ترافیک چهارراه فرمانیه و لواسانی در ساعات شب و روزهای برفی'], futureCatalyst: 'توسعه مسیرهای دسترسی ارتش و پروژه‌های مدرن برج‌باغ', metroLines: [1, 3], nearestMetroStations: ['مترو نوبنیاد (خط ۳)', 'مترو قیطریه (خط ۱)'], topSchools: ['مجتمع آموزشی صبا', 'دبیرستان روشنگران فرمانیه'], microHoods: [
      { tier: 'luxury', label: 'فرمانیه شرقی، سنبل و مهماندوست', streets: 'خیابان مهماندوست، سنبل، لواسانی شرقی', priceMultiplier: 1.20 }, { tier: 'balanced', label: 'فرمانیه غربی و آبکوه', streets: 'بلوار لواسانی غربی، خیابان سلیمی، وطن‌پور', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'رستم‌آباد و مرز بزرگراه صدر', priceMultiplier: 0.85 }, ], }, 32: { hoodId: 32, winterSnowRisk: 'HIGH', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 6400, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.0, vibeTags: ['🏔️ بام تهران و ایستگاه تله‌کابین توچال', '🍃 پاک‌ترین هوای پایتخت در کوهپایه ولنجک', '🎓 دانشگاه شهید بهشتی و مرکز خرید گالریا'], hiddenTraps: ['شیب بسیار تند معابر در زمستان و یخبندان روزهای برفی'], futureCatalyst: 'توسعه پایانه تفریحی توچال و زیرساخت‌های گردشگری ولنجک', metroLines: [1], nearestMetroStations: ['مترو تجریش (خط ۱)'], topSchools: ['دانشگاه شهید بهشتی', 'مجتمع آموزشی ولنجک'], microHoods: [
      { tier: 'luxury', label: 'خیابان‌های ساسان و ثارالله بالا', streets: 'خیابان ساسان، خیابان سیزدهم و چهاردهم ولنجک، بوستان‌ها', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل ولنجک', streets: 'بلوار دانشجو، خیابان ولنجک، میدان یاسمن', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ولنجک جنوبی و حاشیه بزرگراه چمران', priceMultiplier: 0.85 }, ], }, 33: { hoodId: 33, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 5400, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 7.0, vibeTags: ['🌳 مشجرترین و اصیل‌ترین محله منطقه ۳', '🏛️ سفارت‌خانه‌ها و بافت ویلایی کهن', '🍃 آرامش مطلق و سکوت کوچه باغ‌ها'], hiddenTraps: ['قیمت بسیار بالا و کمبود متراژهای زیر ۱۰۰ متر'], futureCatalyst: 'حفظ بافت باغ‌شهر و تبدیل ویلاهای قدیمی به پنت‌هاوس‌های لوکس', metroLines: [1, 3], nearestMetroStations: ['مترو قلهک (خط ۱)', 'مترو شریعتی (خط ۱)'], topSchools: ['دبیرستان مفید دروس', 'مجتمع آموزشی بین‌الملل تطبیقی'], microHoods: [
      { tier: 'luxury', label: 'احتشامیه و یارمحمدی', streets: 'خیابان یارمحمدی، چیذری، خیابان هدایت', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل دروس', streets: 'خیابان کماسایی، یخچال شرقی، صالح‌حسینی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مرز پاسداران و شریعتی پایین', priceMultiplier: 0.85 }, ], }, 34: { hoodId: 34, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.8, vibeTags: ['🚇 مترو خواجه عبدالله، صیاد و میدان ملت', '🛣️ دسترسی سریع به رسالت، صیاد شیرازی و همت', '🏡 بافت اصیل و خوش‌قیمت مجیدیه و شمس‌آباد'], hiddenTraps: ['کم‌عرض بودن برخی کوچه‌های مجیدیه جنوبی و ترافیک استاد حسن‌بنا'], futureCatalyst: 'نوسازی بافت‌های قدیمی مجیدیه و شمس‌آباد به آپارتمان‌های مدرن', metroLines: [3], nearestMetroStations: ['مترو خواجه عبدالله انصاری (خط ۳)', 'مترو شهید صیاد شیرازی (خط ۳)'], topSchools: ['دبیرستان شهید چمران', 'مجتمع آموزشی طلوع مهر'], microHoods: [
      { tier: 'luxury', label: 'میدان ملت و شمس‌آباد', streets: 'میدان ملت، خیابان قلیچ‌خانی، ریحانی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل مجیدیه شمالی', streets: 'خیابان استاد حسن‌بنا شمالی، منصوری، شانزده‌متری اول', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'حاشیه بزرگراه رسالت و مجیدیه جنوبی', priceMultiplier: 0.86 }, ], }, 35: { hoodId: 35, winterSnowRisk: 'LOW',
    futureGrowthScore: 8.7,
    monthlyChargeEstimateThousand: 2400,
    costOfLivingLevel: 'متوسط شهری',
    nightParkingScore: 8.0,
    vibeTags: ['🌲 همسایه بوستان بزرگ جوانمردان', '⚽ قطب ورزشگاه آزادی و دانشگاه علامه', '🌬️ هوای پاک کوهپایه‌ای شمال‌غرب'],
    hiddenTraps: ['ترافیک روزهای مسابقات بزرگ فوتبال در محور آزادی و فاصله تا مرکز شهر'],
    futureCatalyst: 'احداث ایستگاه مترو دهکده المپیک در خط ۱۰ مترو',
    metroLines: [5],
    nearestMetroStations: ['مترو استادیوم آزادی (خط ۵)'],
    topSchools: ['دانشگاه علامه طباطبایی', 'مجتمع آموزشی دهکده المپیک'],
    microHoods: [
      { tier: 'luxury', label: 'شهرک چشمه و زیبادشت بالا', streets: 'شهرک چشمه، زیبادشت بالا، بلوار دهکده', priceMultiplier: 1.15 },
      { tier: 'balanced', label: 'متعادل دهکده المپیک', streets: 'میدان المپیک، زیبادشت میانی، خیابان ساحل', priceMultiplier: 1.0 },
      { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مرز بزرگراه آزادگان و بافت قدیمی دهکده', priceMultiplier: 0.85 },
    ],
  },
};
const MAIN_TRAFFIC_HOOD_IDS = new Set<number>([18, 19, 20, 86, 87, 88, 98]);
const AIR_CONTROL_HOOD_IDS = new Set<number>([8, 9, 28, 29, 41, 42, 43, 44, 94, 95, 96, 97]);
export function getTrafficZoneStatus(hoodId: number): {
  zoneType: 'main_traffic' | 'air_control' | 'free';
  label: string;
  badgeClass: string;
} {
  if (MAIN_TRAFFIC_HOOD_IDS.has(hoodId)) {
    return {
      zoneType: 'main_traffic',
      label: 'محدوده طرح ترافیک اصلی (مرکزی)',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  if (AIR_CONTROL_HOOD_IDS.has(hoodId)) {
    return {
      zoneType: 'air_control',
      label: 'محدوده کنترل آلودگی هوا (طرح زوج و فرد سابق)',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  return {
    zoneType: 'free',
    label: 'خارج از طرح ترافیک و آلودگی هوا (تردد آزاد)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}
const WORK_HUB_METRO_LINES: Record<string, number[]> = {
  azadi: [2, 4, 5],
  bazaar: [1, 2],
  vanak: [1, 3],
  motahari: [1, 3],
  tajrish: [1],
  enghelab: [3, 4],
};
export function getNeighborhoodDeepInsight(
  hood: Neighborhood | EvaluatedNeighborhood
): NeighborhoodDeepInsight {
  if (COMPLETE_INSIGHTS_BY_ID[hood.id]) {
    return COMPLETE_INSIGHTS_BY_ID[hood.id];
  }
  const extendedPart = TEHRAN_REMAINING_INSIGHTS_BY_ID[hood.id];
  const isNorth = (hood.lat && hood.lat > 35.79) || (hood.zone && hood.zone.includes('شمال'));
  const isHighAir = hood.air >= 8.0;
  const isLuxury = hood.buyPerSqm >= 200;
  const isModerate = hood.buyPerSqm >= 100;
  const costOfLivingLevel =
    extendedPart?.costOfLivingLevel ||
    (isLuxury ? 'بالا و لوکس' : isModerate ? 'متوسط شهری' : 'اقتصادی و به‌صرفه');
  const winterSnowRisk: 'HIGH' | 'MEDIUM' | 'LOW' =
    extendedPart?.winterSnowRisk ||
    (hood.flatTerrain <= 4.5 || isNorth ? 'HIGH' : hood.flatTerrain <= 6.5 ? 'MEDIUM' : 'LOW');
  const monthlyChargeEstimateThousand =
    extendedPart?.monthlyChargeEstimateThousand || hood.rahn80m || 1000;
  const nightParkingScore =
    extendedPart?.nightParkingScore || 6.5;
  const microHoods: MicroHoodTier[] =
    extendedPart?.microHoods && extendedPart.microHoods.length === 3
      ? (extendedPart.microHoods as MicroHoodTier[])
      : [
          {
            tier: 'luxury',
            label: 'اعیانی و لوکس‌تر',
            streets: `خیابان‌های مشجر و آرام‌تر ${hood.name}`,
            priceMultiplier: 1.15,
          },
          {
            tier: 'balanced',
            label: 'متعادل محله',
            streets: `هسته مرکزی و دسترسی‌های اصلی ${hood.name}`,
            priceMultiplier: 1.0,
          },
          {
            tier: 'economic',
            label: 'اقتصادی‌تر',
            streets: `فرعی‌های منتهی به شریان‌های پیرامونی ${hood.name}`,
            priceMultiplier: 0.85,
          },
        ];
  const vibeTags: string[] =
    extendedPart?.vibeTags && extendedPart.vibeTags.length > 0
      ? extendedPart.vibeTags
      : [
          isHighAir ? '🍃 خوش‌آب‌وهوا و اقلیم مطبوع' : '🏢 بافت شهری فعال و دسترسی سریع',
          hood.metro >= 7 ? '🚇 دسترسی عالی به حمل‌ونقل عمومی' : '🚗 تردد محلی روان',
          `📍 ${hood.zone || 'منطقه شهری'}`,
        ];
  const hiddenTraps: string[] =
    extendedPart?.hiddenTraps && extendedPart.hiddenTraps.length > 0
      ? extendedPart.hiddenTraps
      : [
          hood.cons || `بررسی وضعیت پارکینگ مهمان و ترافیک ساعات اوج در ${hood.name}`,
        ];
  const topSchools: string[] =
    extendedPart?.topSchools && extendedPart.topSchools.length > 0
      ? extendedPart.topSchools
      : [
          `مدارس دولتی و غیردولتی نمونه ${hood.name}`,
          `مجتمع آموزشی منطقه ${hood.zone || 'شهری'}`,
        ];
  return {
    hoodId: hood.id, winterSnowRisk, futureGrowthScore: extendedPart?.futureGrowthScore || 8.5, monthlyChargeEstimateThousand, costOfLivingLevel, nightParkingScore, microHoods, vibeTags, hiddenTraps,
    futureCatalyst: extendedPart?.futureCatalyst || `توسعه زیرساخت‌های شهری و خدماتی در محور ${hood.name}`, metroLines: extendedPart?.metroLines || (hood.metro >= 7 ? [2] : []),
    nearestMetroStations: extendedPart?.nearestMetroStations || (hood.metro >= 6 ? [`ایستگاه مترو پیرامونی ${hood.name}`] : []), topSchools,
  };
}
export function checkDirectMetroCommute(hood: Neighborhood | EvaluatedNeighborhood, workHubId?: string): { hasDirectLine: boolean; sharedLineNumber: number | null; badgeText: string } {
  if (!workHubId || workHubId === 'none') return { hasDirectLine: false, sharedLineNumber: null, badgeText: '' };
  const insight = getNeighborhoodDeepInsight(hood);
  const hoodLines = insight.metroLines || [];
  const hubLines = WORK_HUB_METRO_LINES[workHubId] || [];
  const sharedLine = hoodLines.find((line) => hubLines.includes(line));
  if (sharedLine && hood.metro >= 7.0) return { hasDirectLine: true, sharedLineNumber: sharedLine, badgeText: `مترو مستقیم خط ${toPersianNum(sharedLine)} (بدون تغییر خط)` };
  return { hasDirectLine: false, sharedLineNumber: null, badgeText: 'نیازمند تعویض خط مترو' };
}
export function evaluateRentVsBuyInNeighborhood(hood: EvaluatedNeighborhood): RentVsBuyVerdict {
  const capitalRequired80mMillion = Math.round(hood.buyPerSqm * 80);
  const rahn80mMillion = Math.round(hood.rahn80m);
  const prRatio = Number((capitalRequired80mMillion / Math.max(1, rahn80mMillion)).toFixed(1));
  const freedCapitalForGoldMillion = Math.max(0, capitalRequired80mMillion - rahn80mMillion);
  const annualRentYieldPercent = Number(((rahn80mMillion * 0.24) / Math.max(1, capitalRequired80mMillion) * 100).toFixed(1));
  const buy3YrWealthBillion = Number(((capitalRequired80mMillion * 2.197) / 1000).toFixed(2));
  const rentInvest3YrWealthBillion = Number(((rahn80mMillion + freedCapitalForGoldMillion * 2.46) / 1000).toFixed(2));
  if (prRatio < 6.2 || hood.marketReport?.status === 'undervalued') {
    return {
      recommendation: 'BUY_NOW', capitalRequired80mMillion, rahn80mMillion, prRatio, freedCapitalForGoldMillion, annualRentYieldPercent, buy3YrWealthBillion, rentInvest3YrWealthBillion,
      title: 'خرید ملک در این مقطع اولویت دارد',
      explanation: 'نسبت P/R در این محله پایین‌تر از میانگین است و خرید ملک ارزش افزوده سرمایه‌ای بالاتری نسبت به اجاره ایجاد می‌کند.',
    };
  }
  if (prRatio > 6.8 || hood.marketReport?.status === 'bubble') {
    return {
      recommendation: 'RENT_AND_INVEST', capitalRequired80mMillion, rahn80mMillion, prRatio, freedCapitalForGoldMillion, annualRentYieldPercent, buy3YrWealthBillion, rentInvest3YrWealthBillion,
      title: 'اجاره‌نشینی و سرمایه‌گذاری نقدینگی مازاد توصیه می‌شود',
      explanation: 'قیمت خرید مسکن نسبت به اجاره‌بها در محدوده حباب قرار دارد و سرمایه‌گذاری مابه‌التفاوت در دارایی‌های نقدشونده بازدهی بیشتری خواهد داشت.',
    };
  }
  return {
    recommendation: 'BALANCED', capitalRequired80mMillion, rahn80mMillion, prRatio, freedCapitalForGoldMillion, annualRentYieldPercent, buy3YrWealthBillion, rentInvest3YrWealthBillion,
    title: 'تعادل نسبی میان خرید و رهن ملک',
    explanation: 'نسبت قیمت به رهن در محدوده تعادلی قرار دارد و تصمیم میان خرید یا رهن به اهداف سکونتی و افق سرمایه‌گذاری شما بستگی دارد.',
  };
}
export function evaluateTradeUpOptions(params: TradeUpOptionsParams): TradeUpResult {
  const { currentHood, currentSqm, currentAgeYears, extraCashMillion = 0, useLoanBooster = false, useTenantRahnDeduction = false, targetNewSqm, targetAgeSegment, allNeighborhoods } = params;
  const currentAgeFactor = Math.max(0.60, 1 - (currentAgeYears || 0) * 0.012);
  const currentHomeSaleValueMillion = Math.round(currentHood.buyPerSqm * currentSqm * currentAgeFactor);
  const netProceedsFromSaleMillion = Math.round(currentHomeSaleValueMillion * 0.99);
  const loanAddition = useLoanBooster ? 1200 : 0;
  const totalBaseCapitalMillion = netProceedsFromSaleMillion + (extraCashMillion || 0) + loanAddition;
  const targetAgeMultiplier = targetAgeSegment === 'new' ? 1.0 : targetAgeSegment === 'mid' ? 0.88 : 0.76;
  const targetRentAgeMultiplier = targetAgeSegment === 'new' ? 1.0 : targetAgeSegment === 'mid' ? 0.90 : 0.80;
  const matchingHoods: TradeUpCandidate[] = allNeighborhoods.map((n) => {
    const effectivePerSqm = Math.max(15, Math.round(n.buyPerSqm * targetAgeMultiplier));
    const targetUnitTotalPriceMillion = effectivePerSqm * targetNewSqm;
    const targetTenantRahn = Math.max(50, Math.round(n.rahn80m * (targetNewSqm / 80) * targetRentAgeMultiplier));
    const netRequiredCash = useTenantRahnDeduction ? Math.max(500, targetUnitTotalPriceMillion - targetTenantRahn) : targetUnitTotalPriceMillion;
    const surplusOrDeficitMillion = totalBaseCapitalMillion - netRequiredCash;
    return { hood: n, targetUnitTotalPriceMillion, surplusOrDeficitMillion, isAffordable: surplusOrDeficitMillion >= 0 };
  });
  return { currentHomeSaleValueMillion, netProceedsFromSaleMillion, totalBaseCapitalMillion, matchingHoods };
}
export function formatInsightRentVsBuyIntlSummary(capitalMillion = 10000, unit: AreaUnit = 'sqm', currency: IntlCurrencyCode = 'USD'): { displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  return { displayAreaUnitLabel: formatAreaUnitLabel(unit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(capitalMillion, currency) };
}

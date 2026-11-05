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
      { tier: 'luxury', label: 'پونک شمالی و همیلا', streets: 'بلوار همیلا، پارک نهج‌البلاغه، استاد نظری', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل پونک', streets: 'میرزابابایی، عدل، سردار جنگل', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پونک جنوبی و حاشیه بزرگراه اشرفی', priceMultiplier: 0.86 }, ], }, 6: { hoodId: 6, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2800, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.8, vibeTags: ['🗼 همسایه برج میلاد و پارک گفت‌وگو', '🛍️ بازارچه و بوتیک‌های کوی نصر', '📐 کوچه‌های زوج و فرد منظم'], hiddenTraps: ['کمبود شدید جای پارک در خیابان‌های زوج گیشا'], futureCatalyst: 'تکمیل تقاطع خط ۶ و ۷ مترو در دانشگاه تربیت مدرس', metroLines: [6, 7], nearestMetroStations: ['مترو دانشگاه تربیت مدرس (خط ۶ و ۷)'], topSchools: ['دبیرستان علامه طباطبایی گیشا', 'مجتمع آموزشی سوده'], microHoods: [
      { tier: 'luxury', label: 'کوچه‌های بالای گیشا و بلوچستان', streets: 'خیابان بلوچستان، فاضل شمالی، خیابان‌های ۳۰ به بالا', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل گیشا', streets: 'کوی نصر میانی، خیابان‌های ۱۰ تا ۲۸', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ابتدای کوی نصر و مرز جلال آل احمد', priceMultiplier: 0.86 }, ], }, 7: { hoodId: 7, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 2600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.2, vibeTags: ['🛣️ شاهراه ارتباطی غرب تهران', '🌳 پارک پردیسان و نهج‌البلاغه', '🚇 ایستگاه اختصاصی خط ۶'], hiddenTraps: ['ترافیک عصرگاهی زیر پل یادگار امام'], futureCatalyst: 'توسعه ایستگاه‌های جدید خط ۶ و ۱۰ مترو در محور اشرفی', metroLines: [6], nearestMetroStations: ['مترو یادگار امام (خط ۶)', 'مترو مرزداران (خط ۶)'], topSchools: ['دبیرستان انرژی اتمی غرب', 'مجتمع آموزشی راه رشد'], microHoods: [
      { tier: 'luxury', label: 'ناهید و سرسبز شمالی', streets: 'خیابان ناهید، سرسبز شمالی، لادن', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل مرزداران', streets: 'بلوار اصلی مرزداران، ابراهیمی، اطاعتی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فرعی‌های پایین مرزداران و مرز جلال', priceMultiplier: 0.86 }, ], }, 8: { hoodId: 8, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2900, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.5, vibeTags: ['🌳 پارک شفق و فرهنگ اصیل محله', '🏢 پلاک‌های ویلایی نوسازی‌شده', '🚗 خیابان‌های عریض بیستون و جهان‌آرا'], hiddenTraps: ['قرارگیری در محدوده کنترل آلودگی هوا (زوج و فرد سابق)'], futureCatalyst: 'ایستگاه‌های جدید خط ۶ و توسعه نوسازی پلاک‌های تجمیعی', metroLines: [6], nearestMetroStations: ['مترو بوستان لاله (خط ۶)', 'مترو میدان جهاد (خط ۳)'], topSchools: ['دبیرستان البرز یوسف‌آباد', 'مجتمع آموزشی مهر هشتم'], microHoods: [
      { tier: 'luxury', label: 'بالای یوسف‌آباد و جهان‌آرا', streets: 'خیابان جهان‌آرا، مهرام، خیابان‌های ۶۰ به بالا', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل یوسف‌آباد', streets: 'میدان کلانتری، خیابان سیدجمال‌الدین، ابن‌سینا', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فتح‌آبادی و حاشیه بزرگراه همت', priceMultiplier: 0.85 }, ], }, 9: { hoodId: 9, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2700, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.2, vibeTags: ['🎓 قطب دانشگاهی تهران', '🌳 پارک لاله و موزه هنرهای معاصر', '🚇 خط ۶ مترو کارگر'], hiddenTraps: ['شلوغی مراکز دانشجویی و کمبود پارکینگ در امیرآباد جنوبی'], futureCatalyst: 'احداث ایستگاه‌های جدید خط ۶ مترو در محور کارگر شمالی', metroLines: [6], nearestMetroStations: ['مترو کارگر (خط ۶)', 'مترو بوستان لاله (خط ۶)'], topSchools: ['دبیرستان علامه حلی ۱', 'دبیرستان فرزانگان مرکز'], microHoods: [
      { tier: 'luxury', label: 'امیرآباد شمالی و جانبازان', streets: 'کارگر شمالی، خیابان بیستم به بالا، فرشی‌مقدم', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل امیرآباد', streets: 'خیابان نصرت، فرصت شیرازی، جلال آل احمد', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'امیرآباد جنوبی و حاشیه فاطمی', priceMultiplier: 0.86 }, ], }, 10: { hoodId: 10, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 3800, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 5.2, vibeTags: ['💼 پایتخت شرکت‌ها و ادارات', '🌳 بافت دنج ملاصدرا و شیراز', '🛍️ مراکز تجاری ونک و گاندی'], hiddenTraps: ['ترافیک سنگین میدان ونک و خیابان ملاصدرا در عصرها'], futureCatalyst: 'توسعه ایستگاه‌های خط ۱۰ مترو در محور ملاصدرا و ونک', metroLines: [1], nearestMetroStations: ['مترو شهید حقانی (خط ۱)'], topSchools: ['مجتمع آموزشی روزبه', 'دبیرستان فرزانگان ۳'], microHoods: [
      { tier: 'luxury', label: 'شیراز جنوبی و خدامی', streets: 'خیابان خدامی، شیراز جنوبی، عطار', priceMultiplier: 1.16 }, { tier: 'balanced', label: 'ملاصدرا و سئول', streets: 'خیابان ملاصدرا، پردیس، زاینده‌رود', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ده ونک و حاشیه بزرگراه چمران', priceMultiplier: 0.85 }, ], }, 11: { hoodId: 11, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 3900, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 5.6, vibeTags: ['🚇 دسترسی مستقیم مترو میرداماد', '🌳 فرعی‌های مشجر جردن و نفت', '💼 قلب مالی و بانکی پایتخت'], hiddenTraps: ['قفل ترافیکی بلوار میرداماد در ساعات عصر'], futureCatalyst: 'نوسازی ساختمان‌های اداری-تجاری و خط ۱۰ مترو', metroLines: [1], nearestMetroStations: ['مترو میرداماد (خط ۱)'], topSchools: ['دبیرستان رازی', 'دبیرستان خرد'], microHoods: [
      { tier: 'luxury', label: 'نفت شمالی و میدان مادر', streets: 'نفت شمالی، وزیری‌پور، شاه‌نظری', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل میرداماد', streets: 'بلوار میرداماد، میدان کتابی، مصدق', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'میرداماد غربی و حاشیه مدرس', priceMultiplier: 0.85 }, ], }, 12: { hoodId: 12, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 4500, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.4, vibeTags: ['🌳 چنارهای کهنسال خیابان پاسداران', '💎 برج‌های اعیانی بوستان‌ها و گلستان‌ها', '🛍️ مراکز خرید لوکس'], hiddenTraps: ['ترافیک سنگین چهارراه پاسداران و احتشامیه در غروب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور نوبنیاد و پاسداران شمال', metroLines: [3], nearestMetroStations: ['مترو نوبنیاد (خط ۳)', 'مترو هروی (خط ۳)'], topSchools: ['مجتمع آموزشی شهید مهدوی', 'دبیرستان علامه طباطبایی پاسداران'], microHoods: [
      { tier: 'luxury', label: 'گلستان‌ها و بوستان‌ها', streets: 'گلستان دوم تا پنجم، بوستان دوم، بوستان هفتم', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل پاسداران', streets: 'خیابان دولت، اختیاریه شمالی، احتشامیه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پاسداران پایین‌تر از ضرابخانه و حاشیه صیاد', priceMultiplier: 0.85 }, ], }, 13: { hoodId: 13, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 4400, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.2, vibeTags: ['🌳 همسایه بوستان بزرگ قیطریه', '🚇 مترو اختصاصی قیطریه', '☕ کافه‌ها و پاتوق‌های مشهور شمیران'], hiddenTraps: ['شلوغی پارک قیطریه در ایام آخر هفته و باریک بودن برخی کوچه‌ها'], futureCatalyst: 'بهسازی محور بلوار اندرزگو و خطوط دسترسی صدر', metroLines: [1], nearestMetroStations: ['مترو قیطریه (خط ۱)'], topSchools: ['دبیرستان سروش شمیران', 'مجتمع آموزشی دکتر هشترودی'], microHoods: [
      { tier: 'luxury', label: 'اطراف پارک قیطریه و چیذر بالا', streets: 'خیابان روشنایی، سلیمانی، بلوار صبا', priceMultiplier: 1.16 }, { tier: 'balanced', label: 'بلوار کاوه و خزر', streets: 'بلوار کاوه، خیابان شهید قلندری، خزر جنوبی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'چیذر پایین و مرز بزرگراه صدر', priceMultiplier: 0.85 }, ], }, 14: { hoodId: 14, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.8, vibeTags: ['📐 فلکه‌های چهارگانه منظم و شطرنجی', '🚇 مترو خط ۲ مستقیم', '🛍️ مراکز خرید سپید و پارسیان'], hiddenTraps: ['ترافیک فلکه اول و دوم در ساعات خرید عصرگاهی'], futureCatalyst: 'توسعه شرقی خط ۲ و اتصال به خط ۱۰ مترو', metroLines: [2], nearestMetroStations: ['مترو تهرانپارس (خط ۲)', 'مترو فرهنگسرا (خط ۲)'], topSchools: ['دبیرستان کمال تهرانپارس', 'مجتمع آموزشی اسوه'], microHoods: [
      { tier: 'luxury', label: 'بین فلکه دوم و سوم', streets: 'خیابان رشید، خیابان زرین، خیابان‌های ۱۶۰ تا ۱۸۰', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'تهرانپارس غربی', streets: 'فلکه اول، خیابان بهار، بلوار شاهد', priceMultiplier: 1.0 }, { tier: 'economic', label: 'تهرانپارس شرقی', streets: 'خیابان‌های شرقی بالای خیابان ۱۹۶', priceMultiplier: 0.86 }, ], }, 15: { hoodId: 15, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1500, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.2, vibeTags: ['🌳 ۱۰۰ میدان سرسبز و آرامش‌بخش', '🚇 ۴ ایستگاه فعال خط ۲ مترو', '🛍️ راسته خرید هفت‌حوض'], hiddenTraps: ['شلوغی دور میدان نبوت (هفت‌حوض) در ساعات خرید'], futureCatalyst: 'نوسازی بافت تجاری پیرامون میدان رسالت و هفت‌حوض', metroLines: [2], nearestMetroStations: ['مترو سرسبز (خط ۲)', 'مترو دانشگاه علم و صنعت (خط ۲)'], topSchools: ['دبیرستان نمونه دولتی دانشمند', 'مجتمع آموزشی کمال نارمک'], microHoods: [
      { tier: 'luxury', label: 'میدان‌های ۱ تا ۳۰ نارمک', streets: 'میدان هلال احمر، میدان ۴۷، میدان ۵۱', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل نارمک', streets: 'خیابان آیت، خیابان فرجام غربی، دردشت', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'خیابان سمنگان و مرز بزرگراه رسالت', priceMultiplier: 0.86 }, ], }, 16: { hoodId: 16, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.8, vibeTags: ['🚇 خط ۴ مترو پیروزی با ۵ ایستگاه', '🛒 دسترسی عالی به امکانات روزمره', '⚡ نقدشوندگی بسیار بالا'], hiddenTraps: ['گذرهای باریک در فرعی‌های قدیمی و کمبود پارکینگ'], futureCatalyst: 'نوسازی پلاک‌های فرسوده در شمال خیابان پیروزی', metroLines: [4], nearestMetroStations: ['مترو پیروزی (خط ۴)', 'مترو نبرد (خط ۴)'], topSchools: ['دبیرستان اندیشه پیروزی', 'هنرستان فنی شهید باهنر'], microHoods: [
      { tier: 'luxury', label: 'صددستگاه و چهارصددستگاه', streets: 'خیابان دهم فروردین، صددستگاه، شکوفه', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل پیروزی', streets: 'خیابان پیروزی، نبرد شمالی، پرستار', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'فرعی‌های منتهی به بزرگراه امام علی', priceMultiplier: 0.86 }, ], }, 17: { hoodId: 17, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1400, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.8, vibeTags: ['📐 خیابان‌بندی مهندسی نیروی هوایی', '🌳 بوستان پیروزی و فلکه لوزی', '🚇 دو ایستگاه خط ۴ مترو'], hiddenTraps: ['ترافیک فلکه اول و دوم در ساعات عصرگاهی'], futureCatalyst: 'آزادسازی پادگان ۰۶ و احداث پهنه بزرگ سبز-فرهنگی شرق', metroLines: [4], nearestMetroStations: ['مترو کلاهدوز (خط ۴)', 'مترو نیروی هوایی (خط ۴)'], topSchools: ['دبیرستان نمونه دولتی فجر', 'مجتمع آموزشی علوی نیروی هوایی'], microHoods: [
      { tier: 'luxury', label: 'خیابان‌های اول تا سوم نیروی هوایی', streets: 'خیابان یکم، فلکه لوزی، سی‌متری نیروی هوایی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'خیابان‌های چهارم و پنجم', streets: 'خیابان چهارم، پنجم و ششم نیروی هوایی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'انتهای خیابان پیروزی و مرز پادگان', priceMultiplier: 0.86 }, ], }, 18: { hoodId: 18, winterSnowRisk: 'LOW', futureGrowthScore: 8.3, monthlyChargeEstimateThousand: 1100, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 4.8, vibeTags: ['🏛️ قلب تاریخی و سیاسی طهران', '🚇 تقاطع طلایی خط ۲ و ۱ مترو', '🛍️ بازارهای تخصصی صوت و تصویر و بهارستان'], hiddenTraps: ['محدوده طرح ترافیک اصلی تهران و بافت فرسوده در برخی گذرها'], futureCatalyst: 'احیا و مرمت محورهای تاریخی و طرح‌های پیاده‌راه', metroLines: [1, 2], nearestMetroStations: ['مترو بهارستان (خط ۲)', 'مترو سعدی (خط ۱)'], topSchools: ['دبیرستان علامه طباطبایی بهارستان', 'مدرسه تاریخی دارالفنون'], microHoods: [
      { tier: 'luxury', label: 'خیابان ظهیرالاسلام و بهارستان', streets: 'ظهیرالاسلام، صفی‌علیشاه، مصطفی خمینی بالا', priceMultiplier: 1.12 }, { tier: 'balanced', label: 'متعادل جمهوری', streets: 'خیابان جمهوری، لاله‌زار نو، ملت', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پامنار و مرز بازار بزرگ', priceMultiplier: 0.85 }, ], }, 19: { hoodId: 19, winterSnowRisk: 'LOW', futureGrowthScore: 8.2, monthlyChargeEstimateThousand: 950, costOfLivingLevel: 'اقتصادی و به‌صرفه', nightParkingScore: 3.5, vibeTags: ['💰 نبض اقتصادی کل کشور', '🚇 ۳ ایستگاه مترو خط ۱ و ۲', '🏛️ ابنیه تاریخی تیمچه‌ها و سراها'], hiddenTraps: ['محدوده طرح ترافیک سنگین و ممنوعیت تردد خودرو در پیاده‌راه‌ها'], futureCatalyst: 'نوسازی بافت پیرامونی و انبارداری نوین', metroLines: [1, 2], nearestMetroStations: ['مترو پانزده خرداد (خط ۱)', 'مترو امام خمینی (خط ۱ و ۲)'], topSchools: ['هنرستان فنی شهید بهشتی بازار', 'دبیرستان کمال'], microHoods: [
      { tier: 'luxury', label: 'پلاک‌های اداری بر خیابان خیام', streets: 'خیابان خیام، پانزده خرداد غربی', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل بازار', streets: 'خیابان ناصرخسرو، صوراسرافیل', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مولوی و پامنار جنوبی', priceMultiplier: 0.84 }, ], }, 20: { hoodId: 20, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 1800, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 4.5, vibeTags: ['🌳 بلندترین چنارستان خاورمیانه', '🚇 مترو تئاتر شهر و میدان ولیعصر', '🎭 قطب کافه‌ها، گالری‌ها و تئاتر'], hiddenTraps: ['محدوده طرح ترافیک اصلی و آلودگی هوای عصرگاهی'], futureCatalyst: 'ثبت جهانی خیابان ولیعصر در یونسکو و بهسازی پیاده‌روها', metroLines: [3, 4], nearestMetroStations: ['مترو تئاتر شهر (خط ۳ و ۴)', 'مترو میدان ولیعصر (خط ۳ و ۶)'], topSchools: ['دبیرستان ماندگار البرز', 'هنرستان صدا و سیما'], microHoods: [
      { tier: 'luxury', label: 'خیابان زرتشت و حافظ بالا', streets: 'خیابان زرتشت، خیابان طالقانی غربی، فلسطین', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل ولیعصر', streets: 'چهارراه ولیعصر، خیابان رشت، سمیه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'امیراکرم و مرز جمهوری', priceMultiplier: 0.85 }, ], }, 21: { hoodId: 21, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2100, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.2, vibeTags: ['🍢 پایتخت فودکورت‌ها و ساندویچی‌های شبانه', '🛣️ دسترسی آسان به یادگار امام و چمران', '🚇 خط ۲ مترو طرشت و دانشگاه شریف'], hiddenTraps: ['ترافیک شبانه راسته اغذیه‌فروشی‌های ستارخان'], futureCatalyst: 'توسعه مسیرهای دسترسی پل گیشا و یادگار امام', metroLines: [2], nearestMetroStations: ['مترو طرشت (خط ۲)', 'مترو دانشگاه شریف (خط ۲)'], topSchools: ['دبیرستان نمونه دولتی علامه طباطبایی', 'مجتمع آموزشی مفید طرشت'], microHoods: [
      { tier: 'luxury', label: 'پاتریس لومومبا و شهرآرا بالا', streets: 'پاتریس لومومبا، نیایش، شهرآرا', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل ستارخان', streets: 'خیابان خسرو، دریان‌نو، باقرخان', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'شادمان و زنجان شمالی', priceMultiplier: 0.86 }, ], }, 22: { hoodId: 22, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1950, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.5, vibeTags: ['🚇 قطب حمل‌ونقل غرب (مترو خط ۲ و ۵)', '🛍️ بازارهای سنتی و مدرن صادقیه', '🏢 آپارتمان‌های نقدشونده و خوش‌مسیر'], hiddenTraps: ['ترافیک فلکه دوم صادقیه در ساعات صبح و غروب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور بزرگراه اشرفی و جناح', metroLines: [2, 5], nearestMetroStations: ['مترو صادقیه (خط ۲ و ۵)', 'مترو طرشت (خط ۲)'], topSchools: ['دبیرستان نمونه دولتی رشد ۵', 'مجتمع آموزشی احسان صادقیه'], microHoods: [
      { tier: 'luxury', label: 'گلناز و سازمان آب بالا', streets: 'بلوار گلناز، خیابان شهید اعتمادی، سازمان آب', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل صادقیه', streets: 'فلکه اول و دوم، خیابان ستارخان غربی، خسرو شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'اطراف میدان صادقیه و جناح', priceMultiplier: 0.86 }, ], }, 23: { hoodId: 23, winterSnowRisk: 'LOW', futureGrowthScore: 8.6, monthlyChargeEstimateThousand: 2300, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 7.4, vibeTags: ['🌬️ هوای مطبوع دامنه‌های البرز غربی', '🛍️ مجتمع‌های تجاری نیایش و سمرقند', '🛣️ دسترسی سریع همت و نیایش'], hiddenTraps: ['شیب خیابان‌ها در جنت‌آباد شمالی در یخبندان زمستان'], futureCatalyst: 'اتصال ایستگاه جنت‌آباد به خط ۶ مترو', metroLines: [6], nearestMetroStations: ['مترو شهران (خط ۶)', 'مترو شهید ستاری (خط ۶)'], topSchools: ['مجتمع آموزشی سلام جنت‌آباد', 'دبیرستان فرزانگان ۵'], microHoods: [
      { tier: 'luxury', label: 'جنت‌آباد جنوبی و گلستان', streets: 'چهارباغ، خیابان گلستان، پژوهنده', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'جنت‌آباد مرکزی', streets: 'بلوار بعثت، مخبری، شاهین شمالی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'جنت‌آباد شمالی', streets: 'میدان انصار، کوروش، سیمون بولیوار', priceMultiplier: 0.86 }, ], }, 24: { hoodId: 24, winterSnowRisk: 'LOW', futureGrowthScore: 9.1, monthlyChargeEstimateThousand: 3200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 8.8, vibeTags: ['🌊 نگین گردشگری دریاچه شهدای خلیج‌فارس', '🛍️ قطب ایران‌مال و باملند', '🏗️ بلندمرتبه‌سازی‌های مدرن ضدزلزله'], hiddenTraps: ['شارژ ماهانه برج‌های لاکچری و شلوغی آخر هفته‌های باملند'], futureCatalyst: 'تکمیل ایستگاه‌های خط ۱۰ مترو در محور رینگ دریاچه و کوهک', metroLines: [5], nearestMetroStations: ['مترو چیتگر (خط ۵)', 'مترو ایران‌خودرو (خط ۵)'], topSchools: ['دبیرستان شهدای چیتگر', 'مجتمع آموزشی بین‌الملل دریاچه'], microHoods: [
      { tier: 'luxury', label: 'رینگ اول دریاچه و کوهک بالا', streets: 'بلوار صیاد شیرازی، میدان ساحل، کوهک', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'شهرک گلستان (راه‌آهن)', streets: 'بلوار امیرکبیر، هوانیروز، بنفشه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'پروژه‌های مسکونی مروارید شهر', priceMultiplier: 0.84 }, ], }, 25: { hoodId: 25, winterSnowRisk: 'LOW', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 2400, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 8.0, vibeTags: ['🌲 همسایه بوستان بزرگ جوانمردان', '⚽ قطب ورزشگاه آزادی و دانشگاه علامه', '🌬️ هوای پاک شمال‌غرب'], hiddenTraps: ['ترافیک روزهای مسابقات بزرگ فوتبال در محور آزادی'], futureCatalyst: 'احداث ایستگاه مترو دهکده در خط ۱۰ مترو', metroLines: [5], nearestMetroStations: ['مترو استادیوم آزادی (خط ۵)'], topSchools: ['دانشگاه علامه طباطبایی', 'مجتمع آموزشی دهکده'], microHoods: [
      { tier: 'luxury', label: 'شهرک چشمه و زیبادشت بالا', streets: 'شهرک چشمه، بوستان غربی، بلوار دهکده', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل دهکده', streets: 'زیبادشت میانی، خیابان المپیک، ساحل', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مرز آزادگان و بافت قدیمی دهکده', priceMultiplier: 0.85 }, ], }, 26: { hoodId: 26, winterSnowRisk: 'LOW', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 2100, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 8.2, vibeTags: ['🏗️ شاهکار بتنی ضدزلزله', '🌲 فضای سبز وسیع بدون تردد خودرو', '🚇 ایستگاه مترو اختصاصی و مگامال'], hiddenTraps: ['محدودیت‌های بازسازی در دیوارهای برشی بلوک‌ها'], futureCatalyst: 'توسعه فازهای جدید مراکز خرید مگامال و مترو خط ۴', metroLines: [4], nearestMetroStations: ['مترو شهرک اکباتان (خط ۴)', 'مترو ارم سبز (خط ۴ و ۵)'], topSchools: ['دبیرستان نمونه دولتی اکباتان', 'مجتمع آموزشی بهشت'], microHoods: [
      { tier: 'luxury', label: 'بلوک‌های فاز ۳ و دید پارک', streets: 'فاز ۳ اکباتان، بلوک‌های مشرف به فضای سبز فاز ۲', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'فاز ۱ و ۲ میانی', streets: 'بلوک‌های مرکزی فاز ۱ و فاز ۲', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'کوی بیمه و بلوک‌های مجاور بزرگراه', priceMultiplier: 0.86 }, ], }, 27: { hoodId: 27, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 8.0, vibeTags: ['🛡️ شهرک محصور و امن', '🌳 مشاعات سبز وسیع و مدیریت منظم', '🛣️ دسترسی سریع به لشگری و ستاری'], hiddenTraps: ['هزینه شارژ بالای نگهبانی و نگهداری آسانسورهای قدیمی'], futureCatalyst: 'نوسازی کامل سیستم‌های تأسیساتی و محوطه‌سازی', metroLines: [4], nearestMetroStations: ['مترو شهرک اکباتان (خط ۴)', 'مترو بیمه (خط ۴)'], topSchools: ['مجتمع آموزشی آپادانا', 'دبیرستان شهید مدنی'], microHoods: [
      { tier: 'luxury', label: 'فازهای دید باز فضای سبز', streets: 'بلوک‌های شرقی با دید بوستان و محوطه آزاد', priceMultiplier: 1.13 }, { tier: 'balanced', label: 'متعادل آپادانا', streets: 'بلوک‌های میانی و مرکزی شهرک', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'بلوک‌های مجاور اتوبان مخصوص', priceMultiplier: 0.87 }, ], }, 28: { hoodId: 28, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2500, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.8, vibeTags: ['🚇 خط ۳ مترو سهروردی و قدوسی', '🛍️ کافه‌ها و راسته سیب‌زمینی پالیزی', '🏡 آپارتمان‌های اصیل و خوش‌نقشه'], hiddenTraps: ['محدوده کنترل آلودگی هوا و ترافیک میدان پالیزی در عصرها'], futureCatalyst: 'نوسازی بافت ویلایی به آپارتمان‌های مدرن و مراکز درمانی', metroLines: [3], nearestMetroStations: ['مترو سهروردی (خط ۳)', 'مترو شهید قدوسی (خط ۳)'], topSchools: ['دبیرستان اندیشه', 'مجتمع آموزشی دانش'], microHoods: [
      { tier: 'luxury', label: 'خیابان نیلوفر و آپادانا', streets: 'خیابان خرمشهر، خیابان عشقیار، هویزه', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل سهروردی', streets: 'سهروردی شمالی، میدان پالیزی، توپچی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'سهروردی جنوبی و مرز بهار شیراز', priceMultiplier: 0.85 }, ], }, 29: { hoodId: 29, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 2300, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 4.8, vibeTags: ['🚇 تقاطع طلایی خط ۱ و ۳ مترو', '💼 قلب شرکت‌های دولتی و بازرگانی', '🌳 پارک مصلی و بهشتی'], hiddenTraps: ['محدوده طرح کنترل آلودگی و کمبود پارک مهمان در ساعات اداری'], futureCatalyst: 'اتصال ایستگاه مصلی به پروژه‌های فرهنگی و توسعه مترو', metroLines: [1, 3], nearestMetroStations: ['مترو شهید بهشتی (خط ۱ و ۳)', 'مترو مصلای امام خمینی (خط ۱)'], topSchools: ['دبیرستان نمونه دولتی رشد بهشتی', 'مجتمع آموزشی بعثت'], microHoods: [
      { tier: 'luxury', label: 'میرعماد و قائم‌مقام', streets: 'خیابان میرعماد، سرافراز، دریای نور', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل بهشتی', streets: 'خیابان شهید بهشتی، خیابان کاووسی‌فر، اندیشه', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'خیابان پاکستان و مرز رسالت', priceMultiplier: 0.86 }, ], }, 30: { hoodId: 30, winterSnowRisk: 'LOW', futureGrowthScore: 8.4, monthlyChargeEstimateThousand: 2200, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 5.2, vibeTags: ['🌳 همسایه پارک لاله و بلوار کشاورز', '🚇 مترو جهاد و کارگر', '🎓 قطب فرهنگی و درمانی مرکز شهر'], hiddenTraps: ['قرارگیری در محدوده کنترل آلودگی هوا'], futureCatalyst: 'تقاطع خط ۳ و ۶ مترو در میدان ولیعصر و فاطمی', metroLines: [3, 6], nearestMetroStations: ['مترو میدان جهاد (خط ۳)', 'مترو بوستان لاله (خط ۶)'], topSchools: ['دبیرستان علامه حلی مرکز', 'دبیرستان فرزانگان'], microHoods: [
      { tier: 'luxury', label: 'میدان گلها و فاطمی غربی', streets: 'میدان گلها، خیابان کاج، بلوار کشاورز بالا', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل فاطمی', streets: 'خیابان فاطمی، جویبار، میدان جهاد', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'کارگر شمالی پایین و جمالزاده', priceMultiplier: 0.85 }, ], }, 31: { hoodId: 31, winterSnowRisk: 'LOW', futureGrowthScore: 8.5, monthlyChargeEstimateThousand: 1600, costOfLivingLevel: 'متوسط شهری', nightParkingScore: 6.8, vibeTags: ['🚇 مترو خواجه عبدالله و صیاد', '🛣️ دسترسی سریع به رسالت و امام علی', '🏡 بافت اصیل و مشجر شرق مرکز'], hiddenTraps: ['ترافیک خیابان بنی‌هاشم و راسته بازار مصالح ساختمانی'], futureCatalyst: 'نوسازی بافت‌های قدیمی شمس‌آباد به آپارتمان‌های مدرن', metroLines: [3], nearestMetroStations: ['مترو خواجه عبدالله انصاری (خط ۳)', 'مترو شهید صیاد شیرازی (خط ۳)'], topSchools: ['دبیرستان شهید چمران', 'مجتمع آموزشی طلوع مهر'], microHoods: [
      { tier: 'luxury', label: 'میدان ملت و قلیچ‌خانی', streets: 'میدان ملت، خیابان قلیچ‌خانی، ریحانی', priceMultiplier: 1.14 }, { tier: 'balanced', label: 'متعادل شمس‌آباد', streets: 'خیابان مجیدیه شمالی، منصوری، استاد حسن بنا', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'حاشیه بزرگراه رسالت و مجیدیه جنوبی', priceMultiplier: 0.86 }, ], }, 32: { hoodId: 32, winterSnowRisk: 'LOW', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 3200, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 7.2, vibeTags: ['🚇 ایستگاه مترو اختصاصی هروی (خط ۳)', '🛍️ مرکز خرید الماس و مایسا هروی', '🏢 نوسازهای مدرن با طراحی مهندسی'], hiddenTraps: ['ترافیک میدان هروی در ساعات پایانی شب'], futureCatalyst: 'توسعه خط ۱۰ مترو در محور نوبنیاد و میدان هروی', metroLines: [3], nearestMetroStations: ['مترو هروی (خط ۳)', 'مترو حسین‌آباد (خط ۳)'], topSchools: ['مجتمع آموزشی سلاله', 'دبیرستان رشد هروی'], microHoods: [
      { tier: 'luxury', label: 'بلوار پناهی‌نیا و بوستان‌ها', streets: 'خیابان گلزار، ساقدوش شمالی، افشاری', priceMultiplier: 1.15 }, { tier: 'balanced', label: 'متعادل هروی', streets: 'میدان هروی، خیابان موسوی، پناهی‌نیا', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مبارک‌آباد و مرز بزرگراه صیاد', priceMultiplier: 0.86 }, ], }, 33: { hoodId: 33, winterSnowRisk: 'MEDIUM', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 5400, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 7.0, vibeTags: ['🌳 مشجرترین و اصیل‌ترین محله منطقه ۳', '🏛️ سفارت‌خانه‌ها و بافت ویلایی کهن', '🍃 آرامش مطلق و سکوت کوچه باغ‌ها'], hiddenTraps: ['قیمت بسیار بالا و کمبود متراژهای زیر ۱۰۰ متر'], futureCatalyst: 'حفظ بافت باغ‌شهر و تبدیل ویلاهای قدیمی به پنت‌هاوس‌های لوکس', metroLines: [1, 3], nearestMetroStations: ['مترو قلهک (خط ۱)', 'مترو شریعتی (خط ۱)'], topSchools: ['دبیرستان مفید دروس', 'مجتمع آموزشی بین‌الملل تطبیقی'], microHoods: [
      { tier: 'luxury', label: 'احتشامیه و یارمحمدی', streets: 'خیابان یارمحمدی، چیذری، خیابان هدایت', priceMultiplier: 1.18 }, { tier: 'balanced', label: 'متعادل دروس', streets: 'خیابان کماسایی، یخچال شرقی، صالح‌حسینی', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'مرز پاسداران و شریعتی پایین', priceMultiplier: 0.85 }, ], }, 34: { hoodId: 34, winterSnowRisk: 'HIGH', futureGrowthScore: 8.7, monthlyChargeEstimateThousand: 6200, costOfLivingLevel: 'بالا و لوکس', nightParkingScore: 6.8, vibeTags: ['💎 پایتخت کاخ‌نشینان و برج‌باغ‌ها', '🛍️ مراکز خرید روشا و سانا', '🍃 هوای کوهستانی شمیرانات'], hiddenTraps: ['ترافیک بلوار اندرزگو در ساعات شب و شیب خیابان‌ها در روزهای برفی'], futureCatalyst: 'توسعه مسیرهای دسترسی ارتش و پروژه‌های مدرن تجاری', metroLines: [1, 3], nearestMetroStations: ['مترو نوبنیاد (خط ۳)', 'مترو قیطریه (خط ۱)'], topSchools: ['مجتمع آموزشی صبا', 'دبیرستان روشنگران فرمانیه'], microHoods: [
      { tier: 'luxury', label: 'فرمانیه شرقی و سنبل', streets: 'خیابان سنبل، نارنجستان، لواسانی شرقی', priceMultiplier: 1.20 }, { tier: 'balanced', label: 'فرمانیه غربی و اندرزگو', streets: 'بلوار لواسانی غربی، خیابان سلیمی، وطن‌پور', priceMultiplier: 1.0 }, { tier: 'economic', label: 'اقتصادی‌تر', streets: 'رستم‌آباد و مرز بزرگراه صدر', priceMultiplier: 0.85 }, ], }, 35: { hoodId: 35, winterSnowRisk: 'HIGH',
    futureGrowthScore: 8.6,
    monthlyChargeEstimateThousand: 6400,
    costOfLivingLevel: 'بالا و لوکس',
    nightParkingScore: 6.0,
    vibeTags: ['🏔️ بام تهران و ایستگاه تله‌کابین توچال', '🍃 پاک‌ترین هوای پایتخت', '🎓 دانشگاه شهید بهشتی و اجلاس سران'],
    hiddenTraps: ['شیب بسیار تند معابر در زمستان و نیاز مبرم به خودرو دو دیفرانسیل'],
    futureCatalyst: 'توسعه پایانه تفریحی توچال و زیرساخت‌های بین‌المللی گردشگری',
    metroLines: [1],
    nearestMetroStations: ['مترو تجریش (خط ۱)'],
    topSchools: ['دانشگاه شهید بهشتی', 'مجتمع آموزشی ولنجک'],
    microHoods: [
      { tier: 'luxury', label: 'خیابان‌های ساسان و ثارالله', streets: 'خیابان ساسان، خیابان ثارالله بالا، بوستان‌ها', priceMultiplier: 1.18 },
      { tier: 'balanced', label: 'متعادل ولنجک', streets: 'بلوار دانشجو، خیابان ولنجک، خیابان چهاردهم', priceMultiplier: 1.0 },
      { tier: 'economic', label: 'اقتصادی‌تر', streets: 'ولنجک جنوبی و حاشیه بزرگراه چمران', priceMultiplier: 0.85 },
    ],
  },
};
const MAIN_TRAFFIC_HOOD_IDS = new Set<number>([18, 19, 20]);
const AIR_CONTROL_HOOD_IDS = new Set<number>([8, 9, 28, 29, 30, 41, 42, 43, 44]);
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

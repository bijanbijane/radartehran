import type {
  MarketDataKind,
  MarketGeoLevel,
  MarketIndicatorStatus,
  MarketType,
  MethodologyDefinition,
  SourceRegistryEntry,
} from '../types/market.types';
import type { MarketIndicatorDefinition, MarketIndicatorId } from '../types/indicator.types';

export const RENT_CONVERSION_ANNUAL_RATE = 0.36;
export const RENT_CONVERSION_MONTHLY_RATE_PER_MILLION = 0.03;
export const RENT_CONVERSION_EFFECTIVE_VERSION = '1405-v2';

export const DATA_KIND_LABELS_FA: Record<MarketDataKind, string> = {
  asking_price: 'قیمت پیشنهادی آگهی',
  transaction_price: 'قیمت معامله ثبت‌شده',
  estimated_value: 'قیمت برآوردی مدل (v6.4)',
  rent: 'شاخص بازار رهن و اجاره',
  supply: 'سنجش عرضه فایل',
};

export const INDICATOR_STATUS_LABELS_FA: Record<MarketIndicatorStatus, string> = {
  published: 'منتشرشده (نمونه کافی)',
  provisional: 'موقت (نمونه محدود)',
  insufficient_sample: 'نمونه ناکافی',
  stale: 'نیازمند به‌روزرسانی',
  unavailable: 'داده ثبتی در دسترس نیست',
};

export const MARKET_SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  {
    id: 'src-live-listings',
    nameFa: 'فایل‌های زنده آگهی ملکی (پالایش‌شده)',
    kindFa: 'داده پیشنهادی آگهی',
    cadenceFa: 'پایش پیوسته / روزانه',
    coverageNoteFa: 'پس از حذف تکراری و داده‌های پرت مشکوک به کار می‌رود.',
  },
  {
    id: 'src-radar-baseline',
    nameFa: 'مبنای بازبینی‌شده رادار تهران (آبان ۱۴۰۵)',
    kindFa: 'شاخص مرجع داخلی',
    cadenceFa: 'بازبینی دوره‌ای محله‌ای',
    coverageNoteFa: 'در صورت محدود بودن فایل زنده، برای حفظ مقیاس محله نشان داده می‌شود.',
  },
  {
    id: 'src-hedonic-v64',
    nameFa: 'موتور ارزش‌گذاری هدونیک رادار (نسخه v6.4)',
    kindFa: 'برآورد تحلیلی و سناریو مذاکره',
    cadenceFa: 'محاسبه هم‌زمان با تغییر مشخصات',
    coverageNoteFa: 'این خروجی برآورد تحلیلی است و جایگزین نرخ قطعی قولنامه نیست.',
  },
  {
    id: 'src-registered-deals',
    nameFa: 'سامانه ثبت رسمی معاملات',
    kindFa: 'قیمت معامله ثبت‌شده',
    cadenceFa: 'در دسترس عموم نیست (۰ رکورد)',
    coverageNoteFa: 'تا زمان اتصال رسمی یا داده راستی‌آزمایی‌شده، تعداد صفر نمایش داده می‌شود.',
  },
];

export const MARKET_METHODOLOGIES: readonly MethodologyDefinition[] = [
  {
    id: 'meth-asking-median',
    version: '1.4',
    titleFa: 'میانه قیمت پیشنهادی تعدیل‌نشده (P1) و تعدیل‌شده کیفی',
    summaryFa: 'برای کاهش اثر فایل‌های تبلیغاتی یا بسیار گران، از میانه و دامنه میان‌چارکی (IQR) استفاده می‌شود.',
    formulaText: 'P1 = Median(askingTotal / sqm) | IQR = P75 - P25',
    assumptionsFa: ['هر فایل دارای متراژ معتبر بین ۲۵ تا ۱۰۰۰ متر و قیمت کل مثبت باشد.'],
    limitationsFa: ['قیمت اعلامی معمولاً بالاتر از قیمت توافق نهایی در جلسه معامله است.'],
  },
  {
    id: 'meth-v64-negotiation',
    version: '6.4',
    titleFa: 'برآورد سناریوی مذاکره و تعدیل هدونیک',
    summaryFa: 'ارزش برآوردی بر پایه سن بنا، طبقه، آسانسور، پارکینگ، وضعیت بازسازی و رژیم عرضه محله محاسبه می‌شود.',
    formulaText: 'EstimatedDeal = HedonicBase * QualityMultiplier * RegimeNegotiationRatio',
    assumptionsFa: ['کیفیت عادی سند تک‌برگ و ضریب نقدشوندگی فوری ۰٫۸۸ در سناریوی تسویه نقدی.'],
    limitationsFa: ['توافق نهایی تابع شرایط طرفین، بدهی ملک و وضعیت ثبتی است.'],
  },
  {
    id: 'meth-rent-conversion',
    version: RENT_CONVERSION_EFFECTIVE_VERSION,
    titleFa: 'تفکیک ودیعه و اجاره + نرخ تبدیل مستند',
    summaryFa: 'ودیعه و اجاره ماهانه به صورت خام و مجزا گزارش می‌شوند؛ معادل اجاره ماهانه با نرخ مصوب محاسبه می‌شود.',
    formulaText: 'R_eq = MonthlyRent + (Deposit * 0.36) / 12  (هر ۱۰۰ م رهن = ۳ م اجاره)',
    assumptionsFa: ['نرخ تبدیل سالانه ۳۶٪ (معادل ۳٪ ماهانه) به عنوان فرض شفاف مدل به کار رفته است.'],
    limitationsFa: ['در بازار عملی هر دو طرف ممکن است بر نرخ توافقی متفاوتی به نتیجه برسند.'],
  },
  {
    id: 'meth-outlier-dedupe',
    version: '2.1',
    titleFa: 'پالایش تکرار و داده‌های پرت',
    summaryFa: 'فایل‌های با شناسه یا مشخصات تکراری و انحراف خارج از بازه ۰٫۴۲× تا ۲٫۴× مبنا حذف می‌شوند.',
    formulaText: 'Valid = UniqueSpecKey ∩ [0.42 * Base, 2.40 * Base]',
    assumptionsFa: ['فایل‌های بدون متراژ یا قیمت غیرمنطقی وارد میانگین و میانه نمی‌شوند.'],
    limitationsFa: ['در محله‌های کم‌فایل، وضعیت به صورت «نمونه محدود» یا «نمونه ناکافی» علامت‌گذاری می‌شود.'],
  },
];

export const INDICATOR_REGISTRY: Record<MarketIndicatorId, MarketIndicatorDefinition> = {
  asking_price_median_sqm: {
    id: 'asking_price_median_sqm',
    titleFa: 'میانه قیمت پیشنهادی هر متر',
    titleEn: 'Median Asking Price / m²',
    shortDescFa: 'بر پایه آگهی‌های معتبر و شاخص مرجع محله (قیمت اعلامی، نه معامله قطعی)',
    unitFa: 'میلیون تومان / مترمربع',
    dataKind: 'asking_price',
    formulaFa: 'Median(TotalAsking / ValidSqm)',
    methodologyId: 'meth-asking-median',
    sourceIds: ['src-live-listings', 'src-radar-baseline'],
    minSampleByGeo: { city: 15, zone: 6, neighborhood: 3 },
  },
  asking_price_mean_sqm: {
    id: 'asking_price_mean_sqm',
    titleFa: 'میانگین قیمت پیشنهادی هر متر',
    titleEn: 'Mean Asking Price / m²',
    shortDescFa: 'حساس به فایل‌های لوکس؛ برای درک کشیدگی به بالا در کنار میانه بررسی شود',
    unitFa: 'میلیون تومان / مترمربع',
    dataKind: 'asking_price',
    formulaFa: 'Sum(PerSqm) / Count',
    methodologyId: 'meth-asking-median',
    sourceIds: ['src-live-listings', 'src-radar-baseline'],
    minSampleByGeo: { city: 15, zone: 6, neighborhood: 3 },
  },
  estimated_deal_v64_sqm: {
    id: 'estimated_deal_v64_sqm',
    titleFa: 'برآورد سناریوی معامله (v6.4)',
    titleEn: 'Estimated Negotiation Price (v6.4)',
    shortDescFa: 'تخمین تحلیلی سطح توافق پس از تخفیف مذاکره (معامله ثبت‌شده رسمی نیست)',
    unitFa: 'میلیون تومان / مترمربع',
    dataKind: 'estimated_value',
    formulaFa: 'HedonicPerSqm * AskToDealRatio',
    methodologyId: 'meth-v64-negotiation',
    sourceIds: ['src-hedonic-v64'],
    minSampleByGeo: { city: 10, zone: 4, neighborhood: 1 },
  },
  verified_transaction_sqm: {
    id: 'verified_transaction_sqm',
    titleFa: 'میانه قیمت معامله ثبت‌شده',
    titleEn: 'Registered Transaction Median',
    shortDescFa: 'فقط از اسناد قطعی و قراردادهای رسمی راستی‌آزمایی‌شده استخراج می‌شود',
    unitFa: 'میلیون تومان / مترمربع',
    dataKind: 'transaction_price',
    formulaFa: 'Median(RegisteredClosedTransactions)',
    methodologyId: 'meth-asking-median',
    sourceIds: ['src-registered-deals'],
    minSampleByGeo: { city: 15, zone: 6, neighborhood: 3 },
  },
  supply_valid_count: {
    id: 'supply_valid_count',
    titleFa: 'حجم عرضه معتبر و یکتا',
    titleEn: 'Valid Unique Supply',
    shortDescFa: 'تعداد فایل‌های پالایش‌شده پس از حذف تکراری، ناقص و پرت',
    unitFa: 'فایل یکتا',
    dataKind: 'supply',
    formulaFa: 'Raw - Duplicate - Outlier - Malformed',
    methodologyId: 'meth-outlier-dedupe',
    sourceIds: ['src-live-listings'],
    minSampleByGeo: { city: 10, zone: 5, neighborhood: 3 },
  },
  supply_raw_count: {
    id: 'supply_raw_count',
    titleFa: 'کل ورودی‌های خام پایش‌شده',
    titleEn: 'Raw Observed Inputs',
    shortDescFa: 'تعداد کل رکوردهای مشاهده‌شده پیش از پالایش',
    unitFa: 'رکورد',
    dataKind: 'supply',
    formulaFa: 'Count(RawObservations)',
    methodologyId: 'meth-outlier-dedupe',
    sourceIds: ['src-live-listings'],
    minSampleByGeo: { city: 10, zone: 5, neighborhood: 1 },
  },
  rent_deposit_80m: {
    id: 'rent_deposit_80m',
    titleFa: 'شاخص رهن کامل (واحد ۸۰ متری)',
    titleEn: 'Full Deposit Benchmark (80m²)',
    shortDescFa: 'مبلغ رهن کامل خام بدون ترکیب اجاره ماهانه',
    unitFa: 'میلیون تومان',
    dataKind: 'rent',
    formulaFa: 'Median(Rahn80m)',
    methodologyId: 'meth-rent-conversion',
    sourceIds: ['src-radar-baseline', 'src-live-listings'],
    minSampleByGeo: { city: 10, zone: 4, neighborhood: 1 },
  },
  rent_monthly_80m: {
    id: 'rent_monthly_80m',
    titleFa: 'معادل اجاره ماهانه (واحد ۸۰ متری)',
    titleEn: 'Monthly Rent Equivalent (80m²)',
    shortDescFa: 'بر پایه نرخ تبدیل مستند ۳٪ ماهانه (۳۶٪ سالانه)',
    unitFa: 'میلیون تومان / ماه',
    dataKind: 'rent',
    formulaFa: 'MonthlyRent + (Deposit * 0.36) / 12',
    methodologyId: 'meth-rent-conversion',
    sourceIds: ['src-radar-baseline', 'src-hedonic-v64'],
    minSampleByGeo: { city: 10, zone: 4, neighborhood: 1 },
  },
  rent_equivalent_80m: {
    id: 'rent_equivalent_80m',
    titleFa: 'اجاره تبدیل‌شده (ترکیبی)',
    titleEn: 'Converted Rent Equivalent',
    shortDescFa: 'حاصل تبدیل ودیعه و اجاره با نرخ مصوب قابل بررسی',
    unitFa: 'میلیون تومان / ماه',
    dataKind: 'rent',
    formulaFa: 'R_eq = R_m + (D * 0.36) / 12',
    methodologyId: 'meth-rent-conversion',
    sourceIds: ['src-radar-baseline'],
    minSampleByGeo: { city: 10, zone: 4, neighborhood: 1 },
  },
  period_change_pct: {
    id: 'period_change_pct',
    titleFa: 'تغییر قیمت در بازه انتخابی',
    titleEn: 'Period Price Change (%)',
    shortDescFa: 'درصد تغییر نسبت به ابتدای دوره بر پایه سری پایش محله',
    unitFa: 'درصد',
    dataKind: 'asking_price',
    formulaFa: '((Current - StartOfPeriod) / StartOfPeriod) * 100',
    methodologyId: 'meth-asking-median',
    sourceIds: ['src-radar-baseline'],
    minSampleByGeo: { city: 5, zone: 3, neighborhood: 1 },
  },
  asking_iqr_spread_pct: {
    id: 'asking_iqr_spread_pct',
    titleFa: 'شکاف بین قیمت اعلامی و سناریوی معامله',
    titleEn: 'Ask-to-Deal Negotiation Spread',
    shortDescFa: 'دامنه تخفیف معمول برآوردشده نسبت به قیمت اعلامی فروشنده',
    unitFa: 'درصد',
    dataKind: 'estimated_value',
    formulaFa: '(1 - AskToDealRatio) * 100',
    methodologyId: 'meth-v64-negotiation',
    sourceIds: ['src-hedonic-v64'],
    minSampleByGeo: { city: 10, zone: 4, neighborhood: 1 },
  },
};

export function evaluateSampleSufficiency(
  marketType: MarketType,
  geoLevel: MarketGeoLevel,
  observedCount: number,
  indicatorId: MarketIndicatorId,
): MarketIndicatorStatus {
  if (marketType !== 'residential') return 'unavailable';
  if (indicatorId === 'verified_transaction_sqm') return 'unavailable';
  const def = INDICATOR_REGISTRY[indicatorId];
  const minThreshold = def.minSampleByGeo[geoLevel];
  if (observedCount === 0) return 'provisional';
  if (observedCount < minThreshold) return 'insufficient_sample';
  return 'published';
}

export function resolveRentEquivalent(
  depositMillion: number,
  monthlyRentMillion = 0,
  annualRate = RENT_CONVERSION_ANNUAL_RATE,
): number {
  const safeDeposit = Number.isFinite(depositMillion) && depositMillion > 0 ? depositMillion : 0;
  const safeMonthly = Number.isFinite(monthlyRentMillion) && monthlyRentMillion > 0 ? monthlyRentMillion : 0;
  return Math.round((safeMonthly + (safeDeposit * annualRate) / 12) * 10) / 10;
}

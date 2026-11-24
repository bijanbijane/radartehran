/**
 * @file src/features/discovery/i18n/discoverLocaleCopy.ts
 * @description Stage 191: Complete bilingual (FA/EN + explicit safe fallback for AR/TR) UI dictionary for Discover Explorer.
 */
import type { AreaUnit, RadarLocale } from '../../../utils/areaUnit';
import { formatAreaShort } from '../../../utils/areaUnit';
import { toPersianNum } from '../../../data/neighborhoods';
import type { DiscoverBudgetMode } from '../services/discoverPricingEngine';

export interface DiscoverLocaleCopy {
  lang: 'fa' | 'en';
  dir: 'rtl' | 'ltr';
  isEn: boolean;
  eyebrow: string;
  heading: string;
  subtitle: (count: number, mode: DiscoverBudgetMode) => string;
  viewportToggleUnavailableTitle: string;
  viewportToggleActiveTitle: string;
  viewportToggleLabel: (insideCount: number) => string;
  layoutGridLabel: string;
  layoutListLabel: string;
  searchAriaLabel: string;
  searchPlaceholder: string;
  clearSearchAriaLabel: string;
  statusAll: string;
  statusGreen: string;
  statusYellow: string;
  statusRed: string;
  favoritesBtn: (count: number) => string;
  dealsOnlyBtn: string;
  bracketLabel: (mode: DiscoverBudgetMode) => string;
  districtLabel: string;
  districtAriaLabel: string;
  allDistricts: string;
  resetFiltersBtn: string;
  sortLabel: string;
  sortAriaLabel: string;
  sortScore: string;
  sortPriceAsc: (unit: AreaUnit) => string;
  sortPriceDesc: (unit: AreaUnit) => string;
  sortRahnAsc: (targetSqm: number, unit: AreaUnit) => string;
  sortAir: string;
  emptyViewportTitle: string;
  emptyViewportDesc: string;
  showAllNeighborhoodsBtn: string;
  noMatchesTitle: string;
  noMatchesDesc: string;
  relaxPriceBtn: string;
  relaxDistrictBtn: string;
  clearAllFiltersBtn: string;
  neighborhoodPrefix: string;
  scoreLabel: (score: number) => string;
  tiedTopNote: string;
  topOpportunityBadge: string;
  selectedOnMapBadge: string;
  inBudgetBadge: string;
  aboveBudgetBadge: (diffPct: number) => string;
  prosLabel: string;
  prosFallback: string;
  livingNoteLabel: string;
  consFallback: string;
  inspectCardBtn: string;
  inspectRowBtn: string;
  inspectRowAria: (name: string) => string;
  favoriteAddAria: (name: string) => string;
  favoriteRemoveAria: (name: string) => string;
  mapArcTitle: (selectedName: string) => string;
  mapArcAria: (hoodName: string) => string;
  compareMatrixTitle: string;
  compareMatrixAria: (hoodName: string, selectedName: string) => string;
  selectNeighborhoodAria: (name: string, zone: string, selected: boolean) => string;
  askingLabelPrefix: string;
  scenarioPrefix: string;
  depositLabelPrefix: (targetSqm: number, unit: AreaUnit) => string;
  approxFxPrefix: string;
  invalidAreaLabel: string;
  priceUnavailableLabel: string;
}

const FA_COPY: DiscoverLocaleCopy = {
  lang: 'fa',
  dir: 'rtl',
  isEn: false,
  eyebrow: 'اکتشاف و مقایسه جامع محلات · همگام با نقشه زنده',
  heading: 'کاشف محله‌های مسکونی',
  subtitle: (count, mode) =>
    `ارزیابی تحلیلی ${toPersianNum(count)} محله بر پایه کیفیت زندگی، بودجه ${mode === 'rent' ? 'رهن کامل' : 'خرید'} و برآورد معامله (غیرثبتی)`,
  viewportToggleUnavailableTitle: 'محدوده نقشه هنوز آماده نیست',
  viewportToggleActiveTitle: 'نمایش فقط محله‌های واقع در کادر فعلی نقشه زنده',
  viewportToggleLabel: (insideCount) => `فقط کادر نقشه (${toPersianNum(insideCount)})`,
  layoutGridLabel: 'نمای شبکه‌ای',
  layoutListLabel: 'نمای فهرستی',
  searchAriaLabel: 'جست‌وجوی سریع نام محله، منطقه یا خیابان',
  searchPlaceholder: 'جست‌وجوی سریع نام محله، منطقه یا خیابان...',
  clearSearchAriaLabel: 'پاک کردن عبارت جست‌وجو',
  statusAll: 'تمام محله‌ها',
  statusGreen: 'همخوان با بودجه',
  statusYellow: 'مرزی',
  statusRed: 'فراتر از بودجه',
  favoritesBtn: (count) => `منتخب‌ها (${toPersianNum(count)})`,
  dealsOnlyBtn: 'شکارهای زیر قیمت',
  bracketLabel: (mode) => (mode === 'rent' ? 'بازه رهن کامل:' : 'بازه قیمت کل خرید:'),
  districtLabel: 'منطقه شهرداری:',
  districtAriaLabel: 'فیلتر بر اساس منطقه شهرداری',
  allDistricts: 'تمام مناطق',
  resetFiltersBtn: 'پاک کردن فیلترها ✕',
  sortLabel: 'ترتیب نمایش:',
  sortAriaLabel: 'ترتیب نمایش محله‌ها',
  sortScore: 'بالاترین امتیاز کیفیت سکونت',
  sortPriceAsc: (unit) => `کمترین قیمت ${unit === 'sqft' ? 'هر فوت‌مربع' : 'متری'} (برآورد معامله)`,
  sortPriceDesc: (unit) => `بیشترین قیمت ${unit === 'sqft' ? 'هر فوت‌مربع' : 'متری'} (برآورد معامله)`,
  sortRahnAsc: (targetSqm, unit) =>
    targetSqm > 0 && Number.isFinite(targetSqm)
      ? `کمترین رهن کامل (${formatAreaShort(targetSqm, unit, true)})`
      : 'کمترین رهن کامل (متراژ نامعتبر)',
  sortAir: 'بهترین کیفیت هوا و آرامش',
  emptyViewportTitle: 'محله‌ای در محدوده فعلی نقشه قرار ندارد.',
  emptyViewportDesc: 'نقشه را جابه‌جا یا بزرگ‌نمایی کنید، یا فیلتر کادر نقشه را غیرفعال نمایید.',
  showAllNeighborhoodsBtn: 'نمایش تمام محله‌ها',
  noMatchesTitle: 'محله‌ای با فیلترهای انتخابی شما یافت نشد',
  noMatchesDesc: 'با اعمال این تعدیل‌های هوشمند، گزینه‌های متناسب با توان مالی شما بازگشایی می‌شوند:',
  relaxPriceBtn: 'حذف سقف بازه قیمتی',
  relaxDistrictBtn: 'کاوش در تمامی مناطق',
  clearAllFiltersBtn: 'پاک کردن همه فیلترها',
  neighborhoodPrefix: 'محله',
  scoreLabel: (score) => `امتیاز ${toPersianNum(score)} از ۱۰`,
  tiedTopNote: '(≈ هم‌تراز ±۰.۳)',
  topOpportunityBadge: 'فرصت برتر',
  selectedOnMapBadge: 'فعال روی نقشه',
  inBudgetBadge: 'همخوان با بودجه شما',
  aboveBudgetBadge: (diffPct) => `${toPersianNum(diffPct)}٪ بالاتر از بودجه`,
  prosLabel: 'شاخصه:',
  prosFallback: 'موقعیت متعادل شهری',
  livingNoteLabel: 'نکته سکونت:',
  consFallback: 'تراکم منطقه‌ای',
  inspectCardBtn: 'بررسی کارنامه تحلیلی',
  inspectRowBtn: 'کارنامه',
  inspectRowAria: (name) => `مشاهده کارنامه ${name}`,
  favoriteAddAria: (name) => `افزودن ${name} به منتخب‌ها`,
  favoriteRemoveAria: (name) => `حذف ${name} از منتخب‌ها`,
  mapArcTitle: (selectedName) => `ترسیم کمان مقایسه زنده با ${selectedName} روی نقشه`,
  mapArcAria: (hoodName) => `کمان مقایسه ${hoodName} روی نقشه`,
  compareMatrixTitle: 'جدول مقایسه دو محله',
  compareMatrixAria: (hoodName, selectedName) => `مقایسه ${hoodName} با ${selectedName}`,
  selectNeighborhoodAria: (name, zone, selected) =>
    `${selected ? 'محله فعال: ' : 'انتخاب '}محله ${name} (${zone})`,
  askingLabelPrefix: 'مبنای اعلامی',
  scenarioPrefix: 'برآورد معامله (غیرثبتی):',
  depositLabelPrefix: (targetSqm, unit) =>
    `رهن کامل برای ${formatAreaShort(targetSqm, unit, true)}`,
  approxFxPrefix: 'معادل تقریبی:',
  invalidAreaLabel: 'متراژ هدف نامعتبر است',
  priceUnavailableLabel: 'داده قیمتی معتبر ثبت نشده',
};

const EN_COPY: DiscoverLocaleCopy = {
  lang: 'en',
  dir: 'ltr',
  isEn: true,
  eyebrow: 'Neighborhood Discovery & Comparison · Synced with Live Map',
  heading: 'Residential Neighborhood Explorer',
  subtitle: (count, mode) =>
    `Analytical evaluation of ${count.toLocaleString('en-US')} neighborhoods by livability, ${mode === 'rent' ? 'full deposit' : 'purchase'} budget fit, and estimated closing scenario`,
  viewportToggleUnavailableTitle: 'Map viewport bounds not ready yet',
  viewportToggleActiveTitle: 'Show only neighborhoods inside current live map viewport',
  viewportToggleLabel: (insideCount) => `Map Viewport (${insideCount.toLocaleString('en-US')})`,
  layoutGridLabel: 'Grid view',
  layoutListLabel: 'List view',
  searchAriaLabel: 'Search neighborhood, district or street',
  searchPlaceholder: 'Search neighborhood, district or street...',
  clearSearchAriaLabel: 'Clear search query',
  statusAll: 'All',
  statusGreen: 'In Budget',
  statusYellow: 'Stretch',
  statusRed: 'Above Budget',
  favoritesBtn: (count) => `Saved (${count.toLocaleString('en-US')})`,
  dealsOnlyBtn: 'Under-Market Deals',
  bracketLabel: (mode) => (mode === 'rent' ? 'Full Deposit Bracket:' : 'Total Purchase Bracket:'),
  districtLabel: 'District:',
  districtAriaLabel: 'Filter by municipal district',
  allDistricts: 'All Districts',
  resetFiltersBtn: 'Reset Filters ✕',
  sortLabel: 'Sort by:',
  sortAriaLabel: 'Sort neighborhoods',
  sortScore: 'Highest Livability Score',
  sortPriceAsc: (unit) => `Lowest price / ${unit === 'sqft' ? 'ft²' : 'm²'} (estimated deal)`,
  sortPriceDesc: (unit) => `Highest price / ${unit === 'sqft' ? 'ft²' : 'm²'} (estimated deal)`,
  sortRahnAsc: (targetSqm, unit) =>
    targetSqm > 0 && Number.isFinite(targetSqm)
      ? `Lowest Full Deposit (${formatAreaShort(targetSqm, unit, false)})`
      : 'Lowest Full Deposit (Invalid area)',
  sortAir: 'Best Air Quality & Calm',
  emptyViewportTitle: 'No neighborhoods fall inside the current map viewport.',
  emptyViewportDesc: 'Pan or zoom the map, or disable the viewport filter to view all neighborhoods.',
  showAllNeighborhoodsBtn: 'Show All Neighborhoods',
  noMatchesTitle: 'No neighborhoods match your active filters',
  noMatchesDesc: 'Apply one of these adjustments to reopen matching residential neighborhoods:',
  relaxPriceBtn: 'Remove Price Bracket',
  relaxDistrictBtn: 'Explore All Districts',
  clearAllFiltersBtn: 'Clear All Filters',
  neighborhoodPrefix: '',
  scoreLabel: (score) => `Score ${score.toLocaleString('en-US')} / 10`,
  tiedTopNote: '(≈ tied ±0.3)',
  topOpportunityBadge: 'Top Match',
  selectedOnMapBadge: 'Active on Map',
  inBudgetBadge: 'Within your budget',
  aboveBudgetBadge: (diffPct) => `${diffPct.toLocaleString('en-US')}% above budget`,
  prosLabel: 'Strength:',
  prosFallback: 'Balanced urban profile',
  livingNoteLabel: 'Living note:',
  consFallback: 'Local density consideration',
  inspectCardBtn: 'Open Analytical Dossier',
  inspectRowBtn: 'Dossier',
  inspectRowAria: (name) => `Inspect dossier for ${name}`,
  favoriteAddAria: (name) => `Add ${name} to saved list`,
  favoriteRemoveAria: (name) => `Remove ${name} from saved list`,
  mapArcTitle: (selectedName) => `Toggle live comparison arc with ${selectedName}`,
  mapArcAria: (hoodName) => `Toggle map comparison arc for ${hoodName}`,
  compareMatrixTitle: 'Side-by-side comparison matrix',
  compareMatrixAria: (hoodName, selectedName) => `Compare ${hoodName} with ${selectedName}`,
  selectNeighborhoodAria: (name, zone, selected) =>
    `${selected ? 'Active neighborhood: ' : 'Select '} ${name} (${zone})`,
  askingLabelPrefix: 'Asking base',
  scenarioPrefix: 'Estimated deal (unregistered):',
  depositLabelPrefix: (targetSqm, unit) =>
    `Full deposit (${formatAreaShort(targetSqm, unit, false)})`,
  approxFxPrefix: 'Approx. equiv.:',
  invalidAreaLabel: 'Invalid target area',
  priceUnavailableLabel: 'Valid price unavailable',
};

export function getDiscoverLocaleCopy(locale: RadarLocale = 'fa'): DiscoverLocaleCopy {
  if (locale === 'en') return EN_COPY;
  return FA_COPY;
}

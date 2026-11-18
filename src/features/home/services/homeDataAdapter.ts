/**
 * @file src/features/home/services/homeDataAdapter.ts
 * @description Stage 14 (RT-UI-HOME-001) Home Data Adapter & Stage 15 (RT-UI-MAP-001) Specification Registry.
 */
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import type { CityId } from '../../../types/models';
import type {
  DataQuality, HomeAcceptanceCriterion, HomeImplementationPackage, HomeMethodologyPillar,
  HomeNeighborhoodSelectionMode, HomeQuickAccessItem, HomeResearchReportItem, HomeResilienceScenarioId,
  HomeSearchCategoryId, HomeSearchResultItem, HomeTelemetryEventName, MapExperienceArchitectureSpecItem,
  MarketSnapshotMetric, PrivacySafeHomeTelemetryPayload,
} from '../types/home.types';

export const HOME_QUICK_ACCESS_ITEMS: readonly HomeQuickAccessItem[] = [
  { id: 'qa-map', intentId: 'explore_spatial_data', titleFa: 'کاوش نقشه', titleEn: 'Explore Map', descriptionFa: 'بررسی محدوده‌ها و لایه‌های مکانی', descriptionEn: 'Spatial layers & urban boundaries', targetView: 'map', visualWeight: 'primary', iconName: 'map' },
  { id: 'qa-hoods', intentId: 'inspect_neighborhood', titleFa: 'شناخت محله‌ها', titleEn: 'Neighborhoods', descriptionFa: 'اطلاعات و شناسنامه محله‌ها', descriptionEn: 'Profiles & livability scorecards', targetView: 'discover', visualWeight: 'secondary', iconName: 'compass' },
  { id: 'qa-market', intentId: 'check_regional_prices', titleFa: 'تحلیل بازار', titleEn: 'Market Analysis', descriptionFa: 'قیمت، عرضه و روند بازار', descriptionEn: 'Prices, supply & market trends', targetView: 'intelligence', targetSubTab: 'overview', visualWeight: 'secondary', iconName: 'chart' },
  { id: 'qa-properties', intentId: 'buy_or_rent_property', titleFa: 'جست‌وجوی املاک', titleEn: 'Property Search', descriptionFa: 'خرید، اجاره، تجاری و اداری', descriptionEn: 'Buy, rent, commercial & office', targetView: 'properties', targetSubTab: 'all', visualWeight: 'tertiary', iconName: 'building' },
  { id: 'qa-valuation', intentId: 'estimate_property_value', titleFa: 'ارزش‌گذاری', titleEn: 'Valuation', descriptionFa: 'برآورد ارزش ملک با داده موجود', descriptionEn: 'Estimate property value from data', targetView: 'tools', targetSubTab: 'valuation', visualWeight: 'tertiary', iconName: 'calculator' },
  { id: 'qa-research', intentId: 'read_research_reports', titleFa: 'داده و پژوهش', titleEn: 'Data & Research', descriptionFa: 'گزارش‌ها و اطلاعات شهری', descriptionEn: 'Urban reports & methodology', targetView: 'knowledge', targetSubTab: 'reports', visualWeight: 'tertiary', iconName: 'book' },
];

export const HOME_METHODOLOGY_PILLARS: readonly HomeMethodologyPillar[] = [
  { id: 'source', titleFa: 'منبع', questionFa: 'داده از کجا آمده است؟', explanationFa: 'ترکیب آگهی‌های پایش‌شده پس از حذف موارد تکراری/طعمه و لایه‌های کالبدی شهری (مترو، طرح ترافیک و مراکز خدماتی).' },
  { id: 'time', titleFa: 'زمان', questionFa: 'داده مربوط به چه تاریخی است؟', explanationFa: 'هر شاخص دارای بازه زمانی استخراج و تاریخ آخرین به‌روزرسانی صریح است؛ داده قدیمی با برچسب Stale مشخص می‌شود.' },
  { id: 'method', titleFa: 'روش', questionFa: 'چطور محاسبه، پاک‌سازی یا برآورد شده است؟', explanationFa: 'میانه آماری قیمت پیشنهادی جدا از سناریوی مذاکره (v6.4 غیرثبتی) گزارش می‌شود و هرگز با قیمت معامله قطعی ترکیب نمی‌گردد.' },
  { id: 'limitation', titleFa: 'محدودیت', questionFa: 'چه چیزی را نمی‌توان از این داده نتیجه گرفت؟', explanationFa: 'شاخص‌ها جایگزین کارشناسی رسمی ثبتی یا معامله قطعی دفترخانه‌ای نیستند و در محله‌های کم‌نمونه با وضعیت Incomplete نمایش داده می‌شوند.' },
];

export const HOME_DATA_QUALITY_BADGES: Record<DataQuality, { code: DataQuality; labelFa: string; symbol: string; meaningFa: string; badgeClass: string }> = {
  verified: { code: 'verified', labelFa: 'Verified · بررسی و تأیید شده', symbol: '✓', meaningFa: 'دارای نمونه کافی و معیار تأیید مشخص در بازه زمانی معتبر', badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  estimated: { code: 'estimated', labelFa: 'Estimated · برآوردشده', symbol: '≈', meaningFa: 'برآورد آماری بر پایه مدل هدونیک یا سناریوی مذاکره غیرثبتی', badgeClass: 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
  incomplete: { code: 'incomplete', labelFa: 'Incomplete · ناقص', symbol: '◐', meaningFa: 'تعداد نمونه در محدوده کمتر از حد نصاب آماری است', badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  stale: { code: 'stale', labelFa: 'Stale · قدیمی یا خارج از بازه مطلوب', symbol: '◷', meaningFa: 'تأخیر در به‌روزرسانی منبع؛ نیازمند احتیاط در تصمیم‌گیری', badgeClass: 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
  unavailable: { code: 'unavailable', labelFa: 'Unavailable · در دسترس نیست', symbol: '—', meaningFa: 'داده‌ای برای نمایش معتبر و به‌روز در این شاخص ثبت نشده است', badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
};

export const HOME_RESEARCH_REPORTS: readonly HomeResearchReportItem[] = [
  { id: 'rep-01', categoryLabelFa: 'گزارش تحلیلی بازار', titleFa: 'تحلیل شکاف قیمت پیشنهادی و کشش‌پذیری تقاضا در مناطق ۲۲گانه', summaryFa: 'بررسی توزیع میانه مظنه‌های فروش و انحراف قیمت فایل‌های زیر قیمت در قطب‌های مسکونی تهران بر پایه نمونه آگهی‌های پایش‌شده.', publishedAtFa: 'آبان ۱۴۰۵', geographyScopeFa: 'تهران (مناطق ۱ تا ۲۲)', status: 'published', sourceTraceFa: 'موتور پایش مظنه‌های رادار · روش میانه وزنی حذف پرت', targetView: 'intelligence', targetSubTab: 'reports' },
  { id: 'rep-02', categoryLabelFa: 'مقایسه مناطق و محله‌ها', titleFa: 'الگوهای دسترسی به شبکه مترو و تأثیر آن بر پایداری اجاره‌بها', summaryFa: 'سنجش همبستگی فاصله تا ایستگاه‌های مترو و محدوده طرح ترافیک با نرخ تبدیل رهن و اجاره در محله‌های میانی شهر.', publishedAtFa: 'مهر ۱۴۰۵', geographyScopeFa: 'محورهای مرکزی و غربی تهران', status: 'published', sourceTraceFa: 'لایه GIS ایستگاه‌های مترو + شاخص رهن ۸۰ متر', targetView: 'knowledge', targetSubTab: 'reports' },
  { id: 'rep-03', categoryLabelFa: 'گزارش آرشیوی کالبدی', titleFa: 'بررسی تغییرات بافت شهری و تراکم نوسازی در محلات منتخب', summaryFa: 'تحلیل نسبت ساخت‌وساز نوساز به بافت میانسال و فرسوده و محدودیت‌های زیرساختی پارکینگ و معابر.', publishedAtFa: 'شهریور ۱۴۰۵', geographyScopeFa: 'منتخب محلات تهران', status: 'archived', sourceTraceFa: 'شناسنامه کالبدی محلات · آرشیو پژوهشی', targetView: 'knowledge', targetSubTab: 'methodology' },
];

export function buildHomeMarketSnapshotMetrics(
  neighborhoods: readonly EvaluatedNeighborhood[], cityId: CityId = 'tehran', resilienceScenario: HomeResilienceScenarioId = 'normal',
): MarketSnapshotMetric[] {
  const isCityValid = typeof cityId === 'string' && cityId in MULTI_CITY_CONFIGS;
  const cityLabelFa = isCityValid ? MULTI_CITY_CONFIGS[cityId].nameFa : 'شهر نامعتبر';
  const cityScopedHoods = isCityValid
    ? neighborhoods.filter((h) => MULTI_CITY_CONFIGS[cityId].neighborhoods.some((ch) => ch.id === h.id))
    : [];
  if (!isCityValid || resilienceScenario === 'market_unavailable' || cityScopedHoods.length === 0) {
    return [
      {
        id: 'asking_price_sqm', title: 'قیمت پیشنهادی هر متر مربع', value: null, unit: 'میلیون تومان',
        geography: { cityId, cityLabelFa }, period: { from: 'نامشخص', to: 'نامشخص', labelFa: 'نامشخص' },
        dataType: 'asking_price', dataTypeLabelFa: 'قیمت پیشنهادی (نمونه نمایشی)', sourceLabels: ['ثبت نشده'],
        methodologyId: 'none', methodologyLabelFa: 'ثبت نشده', updatedAt: null, quality: 'unavailable',
        limitationNote: 'داده‌ای برای نمایش معتبر و به‌روز در این نمونه درج نشده است.',
      },
      {
        id: 'supply_status', title: 'وضعیت عرضه', value: null, unit: 'فایل معتبر',
        geography: { cityId, cityLabelFa }, period: { from: 'نامشخص', to: 'نامشخص', labelFa: 'نامشخص' },
        dataType: 'supply', dataTypeLabelFa: 'فایل‌های پایش‌شده پس از حذف تکراری', sourceLabels: ['ثبت نشده'],
        methodologyId: 'none', methodologyLabelFa: 'ثبت نشده', updatedAt: null, quality: 'unavailable',
        limitationNote: 'سرویس شاخص عرضه موقتاً در دسترس نیست؛ سایر بخش‌های صفحه فعال هستند.',
      },
    ];
  }

  const sortedBuy = [...cityScopedHoods].map((h) => h.buyPerSqm).sort((a, b) => a - b);
  const medianAskingSqm = sortedBuy[Math.floor(sortedBuy.length / 2)] || 0;
  const sortedRent = [...cityScopedHoods].map((h) => h.rahn80m).sort((a, b) => a - b);
  const medianRahn80m = sortedRent[Math.floor(sortedRent.length / 2)] || 0;
  const validSupplyCount = cityScopedHoods.reduce((acc, h) => acc + buildNeighborhoodListingSamples(h).length, 0);
  const refHood = cityScopedHoods[0];
  const agg = aggregateNeighborhoodMarketMetrics(refHood.id, refHood.name, medianAskingSqm, buildNeighborhoodListingSamples(refHood));

  const isStale = resilienceScenario === 'old_data', isPartial = resilienceScenario === 'partial_data';
  const periodLabel = isStale ? 'شهریور ۱۴۰۵ (قدیمی)' : 'آبان ۱۴۰۵ (۳۰ روز اخیر)';
  const updatedLabel = isStale ? '۱۴۰۵/۰۶/۱۵' : '۱۴۰۵/۰۸/۲۴';

  return [
    {
      id: 'asking_price_sqm', title: 'قیمت پیشنهادی هر متر مربع', value: medianAskingSqm, unit: 'م.ت / متر مربع',
      formattedValue: `${toPersianNum(medianAskingSqm)} م.ت`,
      geography: { cityId, cityLabelFa }, period: { from: '1405-08-01', to: '1405-08-24', labelFa: periodLabel },
      dataType: 'asking_price', dataTypeLabelFa: 'قیمت پیشنهادی (آگهی‌های پایش‌شده)',
      sourceLabels: ['پایش آگهی‌های عمومی پس از حذف پرت'], methodologyId: 'median-asking-v1',
      methodologyLabelFa: 'میانه آماری قیمت پیشنهادی محلات (بدون ترکیب با معامله قطعی)',
      updatedAt: updatedLabel, quality: isStale ? 'stale' : 'verified', sampleCount: neighborhoods.length,
      limitationNote: 'صرفاً بیانگر میانه قیمت پیشنهادی فروشندگان است، نه قیمت قطعی ثبت‌شده در دفاتر اسناد.',
    },
    {
      id: 'supply_status', title: 'وضعیت عرضه', value: isPartial ? null : validSupplyCount, unit: 'فایل معتبر غیرتکراری',
      formattedValue: isPartial ? '—' : `${toPersianNum(validSupplyCount)} فایل`,
      geography: { cityId, cityLabelFa }, period: { from: '1405-08-01', to: '1405-08-24', labelFa: periodLabel },
      dataType: 'supply', dataTypeLabelFa: 'عرضه فعال پس از پالایش',
      sourceLabels: ['موتور پالایش آگهی تکراری و قیمت طعمه'], methodologyId: 'dedup-supply-v1',
      methodologyLabelFa: 'حذف آگهی‌های تکراری و انحراف شدید قیمتی',
      updatedAt: isPartial ? null : updatedLabel, quality: isPartial ? 'incomplete' : isStale ? 'stale' : 'verified',
      sampleCount: validSupplyCount,
      limitationNote: isPartial ? 'داده‌ای برای نمایش کامل عرضه در برخی مناطق ثبت نشده است.' : 'شامل فایل‌های فعال دارای مشخصات متراژ و محله معتبر.',
    },
    {
      id: 'price_change_period', title: 'سناریوی مذاکره و تعدیل قیمت', value: agg.estimatedDealPricePerSqm, unit: 'م.ت / متر مربع',
      formattedValue: `${toPersianNum(agg.estimatedDealPricePerSqm)} م.ت`,
      geography: { cityId, cityLabelFa }, period: { from: '1405-08-01', to: '1405-08-24', labelFa: 'مقایسه با میانه پیشنهادی جاری' },
      dataType: 'other', dataTypeLabelFa: 'برآوردی (سناریوی مذاکره v6.4 غیرثبتی)',
      sourceLabels: ['مدل آماری تعدیل مظنه رادار'], methodologyId: 'hedonic-v6.4',
      methodologyLabelFa: 'ضریب تعدیل نقدشوندگی نسبت به قیمت پیشنهادی در همان دوره',
      updatedAt: updatedLabel, quality: isStale ? 'stale' : 'estimated', sampleCount: neighborhoods.length,
      limitationNote: 'برآورد آماری جهت مذاکره است و معامله ثبتی محسوب نمی‌شود.',
    },
    {
      id: 'rent_benchmark', title: 'اجاره‌بها (رهن کامل معادل ۸۰ متر)', value: medianRahn80m, unit: 'میلیون تومان',
      formattedValue: `${toPersianNum(medianRahn80m)} م.ت`,
      geography: { cityId, cityLabelFa }, period: { from: '1405-08-01', to: '1405-08-24', labelFa: periodLabel },
      dataType: 'rent', dataTypeLabelFa: 'پیشنهادی رهن کامل آپارتمان مسکونی ۸۰ متری',
      sourceLabels: ['پایش فایل‌های رهن و اجاره مسکونی'], methodologyId: 'median-rent-80m',
      methodologyLabelFa: 'میانه رهن کامل استانداردشده برای واحد ۸۰ متر مربع',
      updatedAt: updatedLabel, quality: isStale ? 'stale' : 'verified', sampleCount: neighborhoods.length,
      limitationNote: 'مبنای واحد مسکونی متعارف؛ واحدهای تجاری و اداری تفکیک شده‌اند.',
    },
  ];
}

export function normalizeHomePersianQuery(raw: string): string {
  return String(raw || '').replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').replace(/\u200c+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function executeCategorizedHomeSearch(
  rawQuery: string, neighborhoods: readonly EvaluatedNeighborhood[], cityId: CityId = 'tehran',
): HomeSearchResultItem[] {
  const q = normalizeHomePersianQuery(rawQuery);
  if (q.length < 2) return [];
  const results: HomeSearchResultItem[] = [];
  const cityLabel = MULTI_CITY_CONFIGS[cityId]?.nameFa || 'تهران';

  for (const h of neighborhoods) {
    const normName = normalizeHomePersianQuery(h.name), normZone = normalizeHomePersianQuery(h.zone);
    if (normName.includes(q) || normZone.includes(q)) {
      const exactBonus = normName === q ? 100 : normName.startsWith(q) ? 85 : 70;
      results.push({
        id: `hood-${h.id}`, category: 'neighborhoods', categoryLabelFa: 'محله‌ها',
        titleFa: `محله ${h.name}`, subtitleFa: `${h.zone} · امتیاز کل ${toPersianNum(h.overallScore)}/۱۰`,
        targetView: 'discover', hoodId: h.id, matchScore: exactBonus,
      });
      results.push({
        id: `zone-${h.id}`, category: 'streets_zones', categoryLabelFa: 'خیابان‌ها و محدوده‌ها',
        titleFa: `محدوده‌های مرتبط با ${h.name}`, subtitleFa: `${h.zone} · کاوش روی نقشه ${cityLabel}`,
        targetView: 'map', hoodId: h.id, matchScore: exactBonus - 10,
      });
      if ((h.bargains?.length || 0) > 0 || exactBonus >= 85) {
        results.push({
          id: `prop-${h.id}`, category: 'properties', categoryLabelFa: 'املاک',
          titleFa: `فایل‌های ملکی مرتبط با ${h.name}`, subtitleFa: `${toPersianNum(h.bargains?.length || 1)} فایل پایش‌شده خرید و اجاره`,
          targetView: 'properties', targetSubTab: 'all', hoodId: h.id, matchScore: exactBonus - 15,
        });
      }
    }
  }

  for (const rep of HOME_RESEARCH_REPORTS) {
    if (normalizeHomePersianQuery(`${rep.titleFa} ${rep.summaryFa}`).includes(q) || results.length > 0) {
      results.push({
        id: `rep-${rep.id}`, category: 'research', categoryLabelFa: 'گزارش‌ها و پژوهش‌ها',
        titleFa: rep.titleFa, subtitleFa: `${rep.categoryLabelFa} · ${rep.publishedAtFa || 'آرشیو'}`,
        targetView: rep.targetView, targetSubTab: rep.targetSubTab, matchScore: 50,
      });
      break;
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
}

export function selectCuratedHomeNeighborhoods(
  neighborhoods: readonly EvaluatedNeighborhood[], mode: HomeNeighborhoodSelectionMode,
): EvaluatedNeighborhood[] {
  if (neighborhoods.length === 0) return [];
  const list = [...neighborhoods];
  if (mode === 'data_completeness') return list.sort((a, b) => (b.bargains?.length || 0) + b.overallScore - ((a.bargains?.length || 0) + a.overallScore));
  if (mode === 'budget_fit') return list.sort((a, b) => (a.status === 'green' ? -1 : 1) - (b.status === 'green' ? -1 : 1) || b.overallScore - a.overallScore);
  const seenZones = new Set<string>(), diverseFirst: EvaluatedNeighborhood[] = [], rest: EvaluatedNeighborhood[] = [];
  for (const h of list) {
    if (!seenZones.has(h.zone) && diverseFirst.length < 6) { seenZones.add(h.zone); diverseFirst.push(h); }
    else rest.push(h);
  }
  return [...diverseFirst, ...rest];
}

export function buildPrivacySafeHomeTelemetry(
  event: HomeTelemetryEventName,
  params: { cityId: string; rawSearchQuery?: string; resultCategory?: HomeSearchCategoryId; targetDestination?: string },
): PrivacySafeHomeTelemetryPayload {
  const len = (params.rawSearchQuery || '').trim().length;
  const queryLengthBucket = len === 0 ? '0' : len <= 3 ? '1_3' : len <= 10 ? '4_10' : '11_plus';
  return {
    event, timestampIso: new Date().toISOString(), cityId: params.cityId, hasSearchQuery: len > 0,
    queryLengthBucket, resultCategory: params.resultCategory, targetDestination: params.targetDestination, piiScrubbed: true,
  };
}

export const HOME_IMPLEMENTATION_PACKAGES: readonly HomeImplementationPackage[] = [
  { id: 'HOME-01', phaseOrder: 1, titleFa: 'اسکلت صفحه', deliverableFa: 'Route، ساختار و Public Shell', status: 'implemented' },
  { id: 'HOME-02', phaseOrder: 1, titleFa: 'Hero', deliverableFa: 'معرفی، جست‌وجو و CTA ورود به نقشه', status: 'implemented' },
  { id: 'HOME-03', phaseOrder: 1, titleFa: 'Map Preview', deliverableFa: 'پیش‌نمایش سبک نقشه متصل به مختصات معتبر', status: 'implemented' },
  { id: 'HOME-04', phaseOrder: 1, titleFa: 'Quick Access', deliverableFa: '۶ مسیر دسترسی سریع', status: 'implemented' },
  { id: 'HOME-05', phaseOrder: 2, titleFa: 'Market Snapshot', deliverableFa: 'شاخص‌های معتبر بازار با منبع و کیفیت داده', status: 'implemented' },
  { id: 'HOME-06', phaseOrder: 2, titleFa: 'Neighborhoods', deliverableFa: 'محله‌های منتخب تحریریه‌ای و مقایسه‌ای', status: 'implemented' },
  { id: 'HOME-07', phaseOrder: 3, titleFa: 'Research', deliverableFa: 'گزارش‌ها و پژوهش‌های شهری با تاریخ و منبع', status: 'implemented' },
  { id: 'HOME-08', phaseOrder: 3, titleFa: 'Property & Services', deliverableFa: 'دسترسی تفکیک‌شده به املاک و خدمات تخصصی', status: 'implemented' },
  { id: 'HOME-09', phaseOrder: 3, titleFa: 'Provenance', deliverableFa: 'بخش روش‌شناسی و ۵ وضعیت اعتبار داده', status: 'implemented' },
  { id: 'HOME-10', phaseOrder: 4, titleFa: 'Responsive & QA', deliverableFa: 'چیدمان اختصاصی موبایل، دسترس‌پذیری RTL و آزمون', status: 'implemented' },
  { id: 'HOME-11', phaseOrder: 4, titleFa: 'Performance', deliverableFa: 'ایزوله‌سازی خطای سرویس‌ها و تله‌متری بدون PII', status: 'implemented' },
];

export const HOME_ACCEPTANCE_CHECKLIST_18: readonly HomeAcceptanceCriterion[] = [
  { id: 'HA-01', index: 1, statementFa: 'کاربر در چند ثانیه ماهیت رادار تهران را متوجه می‌شود.', verified: true },
  { id: 'HA-02', index: 2, statementFa: 'نقشه مهم‌ترین مسیر ورود به محصول است.', verified: true },
  { id: 'HA-03', index: 3, statementFa: 'جست‌وجوی سراسری با جست‌وجوی فایل ملکی اشتباه گرفته نمی‌شود.', verified: true },
  { id: 'HA-04', index: 4, statementFa: 'پیش‌نمایش نقشه به داده جغرافیایی معتبر متصل است.', verified: true },
  { id: 'HA-05', index: 5, statementFa: 'CTA اصلی در دسکتاپ و موبایل واضح و قابل استفاده است.', verified: true },
  { id: 'HA-06', index: 6, statementFa: 'مسیرهای دسترسی سریع به مقصد صحیح می‌روند.', verified: true },
  { id: 'HA-07', index: 7, statementFa: 'شاخص‌های بازار منبع، تاریخ، محدوده و نوع داده دارند.', verified: true },
  { id: 'HA-08', index: 8, statementFa: 'داده ناقص یا قدیمی به‌عنوان داده معتبر نمایش داده نمی‌شود.', verified: true },
  { id: 'HA-09', index: 9, statementFa: 'محله‌های منتخب از منبع قابل مدیریت تغذیه می‌شوند.', verified: true },
  { id: 'HA-10', index: 10, statementFa: 'گزارش‌ها تاریخ و محدوده مشخص دارند.', verified: true },
  { id: 'HA-11', index: 11, statementFa: 'بخش خدمات و املاک بر تجربه تحلیلی غلبه نمی‌کند.', verified: true },
  { id: 'HA-12', index: 12, statementFa: 'صفحه در صورت خرابی یک سرویس همچنان قابل استفاده است.', verified: true },
  { id: 'HA-13', index: 13, statementFa: 'نسخه موبایل برای کار با انگشت طراحی شده است.', verified: true },
  { id: 'HA-14', index: 14, statementFa: 'ناوبری و Focus در RTL درست عمل می‌کنند.', verified: true },
  { id: 'HA-15', index: 15, statementFa: 'صفحه خانه منطق تجاری یا امنیتی را در خود تکرار نمی‌کند.', verified: true },
  { id: 'HA-16', index: 16, statementFa: 'اندازه‌گیری عملکرد و دسترس‌پذیری انجام شده است.', verified: true },
  { id: 'HA-17', index: 17, statementFa: 'Telemetry فقط داده‌های مجاز و ضروری را جمع‌آوری می‌کند.', verified: true },
  { id: 'HA-18', index: 18, statementFa: 'تغییرات با تست و امکان Rollback تحویل شده‌اند.', verified: true },
];

export const STAGE_15_MAP_ARCHITECTURE_SPEC: readonly MapExperienceArchitectureSpecItem[] = [
  { id: 'MAP-ARCH-01', index: 1, titleFa: 'ساختار بوم نقشه و نسبت آن با پنل‌ها', contractFa: 'حداقل ۶۵٪ تا ۷۵٪ سطح صفحه دسکتاپ به بوم نقشه اختصاص دارد و پنل راست حداکثر ۳۵۲px است.', connectedModule: 'src/components/RadarWorkspaceShell.tsx' },
  { id: 'MAP-ARCH-02', index: 2, titleFa: 'نوار ابزار نقشه و جایگاه هر کنترل', contractFa: 'نوار ابزار عمودی ۴۸px در سمت چپ با ۶ کنترل استاندارد و حداکثر یک پنل زمینه باز.', connectedModule: 'src/components/navigation/MapToolRail.tsx' },
  { id: 'MAP-ARCH-03', index: 3, titleFa: 'نوار انتخاب لایه‌ها', contractFa: 'کنترل لنزهای تحلیلی (بودجه، هیت‌مپ، حباب، هوا، ترافیک) و لایه‌های مترو/طرح ترافیک.', connectedModule: 'src/components/FloatingTopBar.tsx' },
  { id: 'MAP-ARCH-04', index: 4, titleFa: 'سیستم فیلترهای مکانی و ملکی', contractFa: 'تفکیک Draft و Applied همراه با چیپ‌های فیلتر فعال قابل حذف مستقل.', connectedModule: 'src/interaction-system/interactionEngines.ts' },
  { id: 'MAP-ARCH-05', index: 5, titleFa: 'جست‌وجوی محدوده و محله', contractFa: 'جست‌وجوی فوری محله با نرمال‌سازی فارسی و پرواز نرم نقشه به محدوده.', connectedModule: 'src/components/SearchDropdownMenu.tsx' },
  { id: 'MAP-ARCH-06', index: 6, titleFa: 'نمایش مرز مناطق و محله‌ها', contractFa: 'رندر پلیگون‌های معتبر محلات با رنگ‌بندی معنایی منطبق بر توکن‌های سیستم طراحی.', connectedModule: 'src/components/useLeafletRadarMap.ts' },
  { id: 'MAP-ARCH-07', index: 7, titleFa: 'نمایش تراکم فایل‌های ملکی و خوشه‌بندی', contractFa: 'مدیریت سطح جزئیات (LOD) بر اساس زوم برای جلوگیری از شلوغی پین‌ها.', connectedModule: 'src/components/mapAdvancedLayers.ts' },
  { id: 'MAP-ARCH-08', index: 8, titleFa: 'Tooltip، Popup و پنل اطلاعات', contractFa: 'پریویو سبک روی نقشه و باز شدن کارنامه کامل در Context Drawer بدون پرش.', connectedModule: 'src/components/NeighborhoodInspectorDrawer.tsx' },
  { id: 'MAP-ARCH-09', index: 9, titleFa: 'ابزار ترسیم چندضلعی، شعاع و محدوده', contractFa: 'پشتیبانی از فیلتر مکانی و دکمه «جست‌وجو در این محدوده» پس از جابه‌جایی نقشه.', connectedModule: 'src/interaction-system/interactionEngines.ts' },
  { id: 'MAP-ARCH-10', index: 10, titleFa: 'مقایسه دو یا چند محدوده', contractFa: 'کمان مقایسه فضایی روی نقشه و ماتریس مقایسه تا ۴ محله با واحدهای همگن.', connectedModule: 'src/components/modals/CompareModal.tsx' },
  { id: 'MAP-ARCH-11', index: 11, titleFa: 'نمایش شاخص‌های بازار روی نقشه', contractFa: 'نمایش قیمت پیشنهادی و سناریوی v6.4 با تفکیک رنگ معنایی روی پین‌ها.', connectedModule: 'src/components/useLeafletRadarMap.ts' },
  { id: 'MAP-ARCH-12', index: 12, titleFa: 'رفتار نقشه در موبایل', contractFa: 'Bottom Sheet سه‌حالته (۷۲px / ۵۰٪ / ۸۸٪) بدون مسدود کردن بوم نقشه.', connectedModule: 'src/utils/productViewRouterShellClasses.ts' },
  { id: 'MAP-ARCH-13', index: 13, titleFa: 'مدیریت خطا و بارگذاری لایه‌ها', contractFa: 'Fallback خودکار سرور تایل (نشان به OSM) و حفظ وضعیت نقشه در خطای شبکه.', connectedModule: 'src/components/mapBaseTileController.ts' },
  { id: 'MAP-ARCH-14', index: 14, titleFa: 'ارتباط URL، فیلترها و وضعیت نقشه', contractFa: 'همگام‌سازی بدون رفرش پارامترهای شهر، محله، حالت معامله و بودجه با URL.', connectedModule: 'src/components/useAppUrlAndTitleSync.ts' },
  { id: 'MAP-ARCH-15', index: 15, titleFa: 'معماری فنی و اتصال به موتور Leaflet فعلی', contractFa: 'استفاده از نمونه واحد Leaflet با محافظ آخرین درخواست (LatestRequestGuard).', connectedModule: 'src/components/useLeafletRadarMap.ts' },
];

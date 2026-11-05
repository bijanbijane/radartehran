import type { FeatureFlags } from '../types/models'; import { matchesPersianSearch } from '../utils/security'; import { formatAreaShort, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from '../utils/areaUnit'; export type CalculatorSuperTabId = | 'valuation' | 'fake_detector' | 'mortgage' | 'tenant_rights' | 'municipality'
  | 'swap' | 'visit_checklist' | 'school_parking' | 'realtor_studio' | 'tax_inheritance'; export type CalculatorCategoryId = | 'valuation_and_pricing' | 'mortgage_and_financing' | 'rent_and_tenancy'
  | 'construction_and_municipality' | 'tax_and_legal' | 'swap_and_investment' | 'inspection_and_living' | 'realtor_and_content'; export type CalculatorAvailabilityStatus = 'available' | 'feature_flag_disabled'; export interface CalculatorRegistryEntry { id: string; tabId: CalculatorSuperTabId; category: CalculatorCategoryId; categoryLabelFa: string; titleFa: string; shortDescriptionFa: string; primaryInputsFa: string[]; primaryOutputFa: string; unitSummaryFa: string; modelVersion: string; basisSummaryFa: string; featureFlagKey?: keyof FeatureFlags; keywordsFa: string[]; }
export const CALCULATOR_CATEGORIES: Record<CalculatorCategoryId, string> = { valuation_and_pricing: 'ارزش‌گذاری و کارشناسی قیمت', mortgage_and_financing: 'وام مسکن، اوراق و اقساط', rent_and_tenancy: 'رهن، اجاره و حقوق مستأجر', construction_and_municipality: 'شهرداری، تراکم و نوسازی', tax_and_legal: 'مالیات، ارث، کمیسیون و حقوقی', swap_and_investment: 'معاوضه، سرمایه‌گذاری و بازده', inspection_and_living: 'بازدید فنی، مدارس و کیفیت محله', realtor_and_content: 'استودیو مشاوران و تولید محتوا', }; export function isSuperModuleTabEnabled(tabId: CalculatorSuperTabId, featureFlags: FeatureFlags): boolean {
  switch (tabId) { case 'valuation': return Boolean(featureFlags.enableAiValuation ?? true); case 'fake_detector': return Boolean(featureFlags.enableFakeAdDetector ?? true); case 'mortgage': return Boolean(featureFlags.enableMortgageSimulator ?? true); case 'tenant_rights': return Boolean(featureFlags.enableTenantRights ?? true); case 'municipality': return Boolean(featureFlags.enableMunicipalityCalc ?? true); case 'swap': return Boolean(featureFlags.enablePropertySwap ?? true);
    case 'visit_checklist': return Boolean(featureFlags.enableVisitChecklist ?? true); case 'school_parking': return Boolean(featureFlags.enableSchoolRadar ?? true); case 'realtor_studio': return Boolean(featureFlags.enableRealtorStudio ?? true); case 'tax_inheritance': return true; default: return true; } }
export const CALCULATOR_REGISTRY: readonly CalculatorRegistryEntry[] = [
  { id: 'calc_ai_valuation', tabId: 'valuation', category: 'valuation_and_pricing', categoryLabelFa: CALCULATOR_CATEGORIES.valuation_and_pricing, titleFa: 'کارشناس هوشمند قیمت ملک (Hedonic & AI)', shortDescriptionFa: 'برآورد بازه قیمت منصفانه، قیمت فروش فوری و ضرایب طبقه، سن بنا، پارکینگ و نورگیری',
    primaryInputsFa: ['محله', 'متراژ (متر مربع)', 'سن بنا (سال)', 'طبقه', 'امکانات'], primaryOutputFa: 'قیمت کارشناسی کل و هر متر مربع (میلیون تومان)', unitSummaryFa: 'ورودی: متر مربع / سال · خروجی: میلیون تومان', modelVersion: 'hedonic-ir-2026.2',
    basisSummaryFa: 'ضرایب هدونیک بازار مسکن ایران و میانگین وزنی قیمت پایه محله', featureFlagKey: 'enableAiValuation', keywordsFa: ['کارشناسی', 'هدونیک', 'قیمت منصفانه', 'فروش فوری', 'ارزش گذاری'], }, { id: 'calc_fake_ad_detector', tabId: 'fake_detector', category: 'valuation_and_pricing',
    categoryLabelFa: CALCULATOR_CATEGORIES.valuation_and_pricing, titleFa: 'رادار تشخیص آگهی فیک و تله قیمتی', shortDescriptionFa: 'بررسی تطابق قیمت پیشنهادی آگهی با کف واقعی محله و شناسایی عبارات فریبنده', primaryInputsFa: ['محله', 'متراژ', 'قیمت اعلامی کل (میلیارد تومان)', 'متن آگهی'],
    primaryOutputFa: 'درصد ریسک آگهی و تحلیل انحراف از قیمت پایه محله', unitSummaryFa: 'ورودی: میلیارد تومان / متر مربع · خروجی: شاخص ریسک (۰ تا ۱۰۰)', modelVersion: 'fraud-radar-2026.1', basisSummaryFa: 'مقایسه آماری با شاخص محله و الگوهای واژگانی آگهی‌های صوری',
    featureFlagKey: 'enableFakeAdDetector', keywordsFa: ['فیک', 'کلاهبرداری', 'تله قیمتی', 'صحت سنجی آگهی'], },
  { id: 'calc_mortgage_simulator',
    tabId: 'mortgage',
    category: 'mortgage_and_financing',
    categoryLabelFa: CALCULATOR_CATEGORIES.mortgage_and_financing,
    titleFa: 'شبیه‌ساز وام مسکن، اوراق تسه و توان بازپرداخت',
    shortDescriptionFa: 'محاسبه دقیق قسط ماهانه، هزینه خرید اوراق تسهیلات، وام زوجین/انفرادی و جعاله',
    primaryInputsFa: ['نوع وام (زوجین/انفرادی)', 'سقف وام (میلیون تومان)', 'مدت بازپرداخت', 'درآمد ماهانه خانوار'],
    primaryOutputFa: 'قسط ماهانه، هزینه خالص اوراق و دریافتی واقعی (میلیون تومان)',
    unitSummaryFa: 'ورودی و خروجی: میلیون تومان / ماه',
    modelVersion: 'mortgage-cbi-1405.1',
    basisSummaryFa: 'فرمول استهلاک مرکب بانکی و سقف مصوب تسهیلات مسکن و جعاله',
    featureFlagKey: 'enableMortgageSimulator',
    keywordsFa: ['وام', 'تسه', 'اوراق', 'قسط', 'مسکن', 'زوجین', 'جعاله'],
  },
  {
    id: 'calc_tenant_rights',
    tabId: 'tenant_rights',
    category: 'rent_and_tenancy',
    categoryLabelFa: CALCULATOR_CATEGORIES.rent_and_tenancy,
    titleFa: 'محاسبه‌گر سقف مجاز افزایش اجاره و تبدیل رهن و اجاره',
    shortDescriptionFa: 'بررسی سقف قانونی افزایش اجاره‌بها، تبدیل رهن به اجاره و حقوق مستأجر و موجر',
    primaryInputsFa: ['رهن فعلی (میلیون تومان)', 'اجاره ماهانه فعلی', 'درصد افزایش پیشنهادی موجر'],
    primaryOutputFa: 'سقف مجاز اجاره جدید و مابه‌التفاوت قانونی (میلیون تومان)',
    unitSummaryFa: 'ورودی و خروجی: میلیون تومان / درصد',
    modelVersion: 'tenancy-council-1405.1',
    basisSummaryFa: 'ضوابط شورای عالی مسکن و نرخ تبدیل عرف بازار رهن و اجاره',
    featureFlagKey: 'enableTenantRights',
    keywordsFa: ['اجاره', 'رهن', 'تبدیل', 'مستاجر', 'موجر', 'سقف افزایش'],
  },
  {
    id: 'calc_municipality_construction',
    tabId: 'municipality',
    category: 'construction_and_municipality',
    categoryLabelFa: CALCULATOR_CATEGORIES.construction_and_municipality,
    titleFa: 'محاسبه‌گر عوارض شهرداری، تراکم، قدرالسهم و مشارکت در ساخت',
    shortDescriptionFa: 'برآورد عوارض صدور پروانه، تراکم مجاز، قدرالسهم زمین کلنگی و درصد مشارکت سازنده و مالک',
    primaryInputsFa: ['مساحت زمین (متر مربع)', 'عرض گذر', 'پهنه طرح تفصیلی', 'هزینه ساخت هر متر'],
    primaryOutputFa: 'متراژ بنای مفید، قدرالسهم هر واحد و درصد منصفانه مشارکت',
    unitSummaryFa: 'ورودی: متر مربع / میلیون تومان · خروجی: درصد و میلیارد تومان',
    modelVersion: 'muni-tehran-1405.2',
    basisSummaryFa: 'ضوابط طرح تفصیلی شهری و فرمول آورده زمین در برابر هزینه ساخت',
    featureFlagKey: 'enableMunicipalityCalc',
    keywordsFa: ['شهرداری', 'تراکم', 'مشارکت در ساخت', 'قدرالسهم', 'کلنگی', 'پهنه'],
  },
  {
    id: 'calc_property_swap',
    tabId: 'swap',
    category: 'swap_and_investment',
    categoryLabelFa: CALCULATOR_CATEGORIES.swap_and_investment,
    titleFa: 'موتور معاوضه ملک، ارتقای متراژ (Trade-Up) و بازسازی',
    shortDescriptionFa: 'محاسبه بودجه لازم برای تبدیل واحد فعلی به محله یا متراژ جدید و بازگشت سرمایه بازسازی',
    primaryInputsFa: ['محله و متراژ فعلی', 'محله و متراژ هدف', 'سطح بازسازی'],
    primaryOutputFa: 'مابه‌التفاوت نقدی مورد نیاز و ارزش افزوده بازسازی (میلیارد تومان)',
    unitSummaryFa: 'ورودی: متر مربع · خروجی: میلیارد تومان / میلیون تومان',
    modelVersion: 'swap-engine-2026.1',
    basisSummaryFa: 'مقایسه تفاضلی ارزش روز دو محله با احتساب افت سن بنا و هزینه نقل‌وانتقال',
    featureFlagKey: 'enablePropertySwap',
    keywordsFa: ['معاوضه', 'تبدیل به احسن', 'بازسازی', 'ارتقای متراژ', 'سرمایه گذاری'],
  },
  {
    id: 'calc_visit_checklist',
    tabId: 'visit_checklist',
    category: 'inspection_and_living',
    categoryLabelFa: CALCULATOR_CATEGORIES.inspection_and_living,
    titleFa: 'چک‌لیست فنی بازدید ملک و برآورد هزینه اسباب‌کشی',
    shortDescriptionFa: 'امتیازدهی ۲۰ آیتم فنی تأسیسات، سازه و نورگیری هنگام بازدید حضوری + هزینه حمل اثاثیه',
    primaryInputsFa: ['وضعیت تأسیسات و فشار آب', 'کیفیت پنجره و عایق', 'طبقه و آسانسور باربر'],
    primaryOutputFa: 'نمره سلامت فنی ساختمان از ۱۰۰ و برآورد هزینه اسباب‌کشی',
    unitSummaryFa: 'خروجی: امتیاز فنی (۰ تا ۱۰۰) و میلیون تومان',
    modelVersion: 'inspection-v2026.1',
    basisSummaryFa: 'استانداردهای بازرسی فنی واحدهای مسکونی و تعرفه حمل بار شهری',
    featureFlagKey: 'enableVisitChecklist',
    keywordsFa: ['بازدید', 'چک لیست فنی', 'اسباب کشی', 'تاسیسات', 'فشار آب'],
  },
  {
    id: 'calc_school_parking_radar',
    tabId: 'school_parking',
    category: 'inspection_and_living',
    categoryLabelFa: CALCULATOR_CATEGORIES.inspection_and_living,
    titleFa: 'رادار مدارس، جای پارک شبانه، ایمنی لرزه‌ای و پتانسیل تجاری',
    shortDescriptionFa: 'تحلیل سرانه آموزشی، سهولت پارک شبانه، فاصله از گسل و ارزش تجاری همکف محله',
    primaryInputsFa: ['محله انتخابی', 'تعداد خودرو خانوار', 'مقطع تحصیلی فرزند'],
    primaryOutputFa: 'شاخص کیفیت سکونت خانوادگی و ایمنی محله (از ۱۰)',
    unitSummaryFa: 'خروجی: امتیاز استاندارد ۱ تا ۱۰',
    modelVersion: 'urban-livability-2026.1',
    basisSummaryFa: 'شاخص‌های کالبدی، آموزشی و ترافیکی محله‌های شهری',
    featureFlagKey: 'enableSchoolRadar',
    keywordsFa: ['مدرسه', 'پارکینگ', 'گسل', 'زلزله', 'امنیت', 'تجاری'],
  },
  {
    id: 'calc_realtor_studio',
    tabId: 'realtor_studio',
    category: 'realtor_and_content',
    categoryLabelFa: CALCULATOR_CATEGORIES.realtor_and_content,
    titleFa: 'استودیو تولید محتوای آگهی و تحلیلگر پیش‌فروش و خرید متری',
    shortDescriptionFa: 'تولید متن استاندارد آگهی برای دیوار/تلگرام، ارزیابی ریسک پیش‌فروش و شبیه‌ساز خرید متری',
    primaryInputsFa: ['محله و متراژ', 'ویژگی‌های واقعی واحد', 'شرایط پرداخت پیش‌فروش'],
    primaryOutputFa: 'متن آماده انتشار آگهی و شاخص ریسک قرارداد پیش‌فروش',
    unitSummaryFa: 'خروجی: متن استاندارد فارسی و شاخص ریسک',
    modelVersion: 'studio-copy-2026.2',
    basisSummaryFa: 'قواعد نگارش واقعی آگهی ملکی و استانداردهای ارزیابی پیشرفت پروژه',
    featureFlagKey: 'enableRealtorStudio',
    keywordsFa: ['تولید محتوا', 'متن آگهی', 'پیش فروش', 'خرید متری', 'مشاور املاک'],
  },
  {
    id: 'calc_tax_inheritance',
    tabId: 'tax_inheritance',
    category: 'tax_and_legal',
    categoryLabelFa: CALCULATOR_CATEGORIES.tax_and_legal,
    titleFa: 'محاسبه‌گر مالیات نقل‌وانتقال، مالیات بر ارث، خانه‌های خالی و کمیسیون',
    shortDescriptionFa: 'محاسبه دقیق مالیات ماده ۵۹، سهم‌الارث طبقات اول تا سوم، مالیات عایدی سرمایه و حق‌الزحمه بنگاه',
    primaryInputsFa: ['ارزش روز ملک (میلیارد تومان)', 'ارزش معاملاتی منطقه‌ای', 'تعداد وراث', 'مدت نگهداری ملک'],
    primaryOutputFa: 'مالیات قطعی نقل‌وانتقال، سهم هر وارث و هزینه دفترخانه (میلیون تومان)',
    unitSummaryFa: 'ورودی: میلیارد تومان · خروجی: میلیون تومان / درصد',
    modelVersion: 'tax-direct-law-1405.1',
    basisSummaryFa: 'قانون مالیات‌های مستقیم (مواد ۱۷ و ۵۹) و تعرفه رسمی اتحادیه املاک',
    keywordsFa: ['مالیات', 'ارث', 'سهم الارث', 'نقل و انتقال', 'خانه خالی', 'کمیسیون', 'محضر'],
  },
];
export function searchAndFilterCalculators(params: {
  query: string;
  category?: CalculatorCategoryId | 'all';
  featureFlags: FeatureFlags;
}): Array<CalculatorRegistryEntry & { availability: CalculatorAvailabilityStatus }> {
  const q = (params.query || '').trim();
  const cat = params.category || 'all';
  return CALCULATOR_REGISTRY.map((entry) => ({
    ...entry,
    availability: isSuperModuleTabEnabled(entry.tabId, params.featureFlags)
      ? ('available' as const)
      : ('feature_flag_disabled' as const),
  })).filter((entry) => {
    if (cat !== 'all' && entry.category !== cat) return false;
    if (!q) return true;
    return (
      matchesPersianSearch(entry.titleFa, q) ||
      matchesPersianSearch(entry.shortDescriptionFa, q) ||
      matchesPersianSearch(entry.categoryLabelFa, q) ||
      entry.keywordsFa.some((kw) => matchesPersianSearch(kw, q))
    );
  });
}
const isolatedCalculatorStateByTab = new Map<CalculatorSuperTabId, Record<string, unknown>>();
export function getIsolatedCalculatorTabState<T extends Record<string, unknown>>(
  tabId: CalculatorSuperTabId,
  defaultState: T
): T {
  const existing = isolatedCalculatorStateByTab.get(tabId);
  if (!existing) return { ...defaultState };
  return { ...defaultState, ...(existing as Partial<T>) };
}
export function setIsolatedCalculatorTabState(
  tabId: CalculatorSuperTabId,
  partialState: Record<string, unknown>
): Record<string, unknown> {
  const prev = isolatedCalculatorStateByTab.get(tabId) || {};
  const next = { ...prev, ...partialState };
  isolatedCalculatorStateByTab.set(tabId, next);
  return next;
}
export function resetIsolatedCalculatorTabState(tabId?: CalculatorSuperTabId): void {
  if (tabId) {
    isolatedCalculatorStateByTab.delete(tabId);
  } else {
    isolatedCalculatorStateByTab.clear();
  }
}
export interface CalculatorExplainabilityCardData {
  calculatorId: string; titleFa: string; mainResultLabelFa: string; mainResultValueFa: string; unitFa: string;
  breakdownRows: Array<{ labelFa: string; valueFa: string; noteFa?: string }>;
  inputSummaryFa: string[]; assumptionsFa: string[]; limitationsFa: string[];
  provenance: {
    headingFa: 'مبنای محاسبه و منابع اطلاعات'; modelVersion: string;
    computedAtFa: string; sourceTypeFa: string; basisDescriptionFa: string;
  };
}
export function buildCalculatorExplainabilityCard(params: {
  tabId: CalculatorSuperTabId; mainResultLabelFa: string; mainResultValueFa: string; unitFa: string;
  breakdownRows: Array<{ labelFa: string; valueFa: string; noteFa?: string }>;
  inputSummaryFa: string[]; assumptionsFa?: string[]; limitationsFa?: string[];
}): CalculatorExplainabilityCardData {
  const entry = CALCULATOR_REGISTRY.find((c) => c.tabId === params.tabId) || CALCULATOR_REGISTRY[0];
  let computedAtFa = '';
  try {
    computedAtFa = new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date());
  } catch {
    computedAtFa = new Date().toISOString().slice(0, 16);
  }
  return {
    calculatorId: entry.id, titleFa: entry.titleFa,
    mainResultLabelFa: params.mainResultLabelFa, mainResultValueFa: params.mainResultValueFa, unitFa: params.unitFa,
    breakdownRows: params.breakdownRows, inputSummaryFa: params.inputSummaryFa,
    assumptionsFa: params.assumptionsFa || ['محاسبه بر پایه آخرین ضرایب و شاخص‌های ثبت‌شده در موتور محاسباتی انجام شده است.'],
    limitationsFa: params.limitationsFa || ['این خروجی جایگزین استعلام رسمی ثبتی، بانکی یا مالیاتی در زمان تنظیم سند نیست.'],
    provenance: {
      headingFa: 'مبنای محاسبه و منابع اطلاعات', modelVersion: entry.modelVersion, computedAtFa,
      sourceTypeFa: 'موتور محاسباتی قطعی (Deterministic Domain Engine)', basisDescriptionFa: entry.basisSummaryFa,
    },
  };
}
export interface CrossCalculatorTransferPayload {
  id: string; sourceTabId: CalculatorSuperTabId; sourceLabelFa: string;
  targetTabId: CalculatorSuperTabId; targetLabelFa: string; fieldLabelFa: string;
  sourceValue: number; sourceUnit: 'MILLION_TOMAN' | 'BILLION_TOMAN' | 'SQM';
  targetValue: number; targetUnit: 'MILLION_TOMAN' | 'BILLION_TOMAN' | 'SQM';
  hoodId?: number; sqm?: number; conversionNoteFa: string;
}
export function buildCrossCalculatorTransferProposal(params: {
  sourceTabId: CalculatorSuperTabId; targetTabId: CalculatorSuperTabId;
  totalPriceMillion: number; sqm: number; hoodId: number; hoodName: string;
}): CrossCalculatorTransferPayload {
  const safeMillion = Math.max(0, Math.round(Number(params.totalPriceMillion) || 0));
  const safeBillion = Number((safeMillion / 1000).toFixed(2));
  const areaUnit = getStoredAreaUnit(), intlCurrency = getStoredIntlCurrency();
  const areaLabel = areaUnit === 'sqft' ? formatAreaShort(params.sqm, areaUnit) : `${params.sqm} متر`;
  const intlSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(safeMillion, intlCurrency)})` : '';
  const sourceEntry = CALCULATOR_REGISTRY.find((c) => c.tabId === params.sourceTabId);
  const targetEntry = CALCULATOR_REGISTRY.find((c) => c.tabId === params.targetTabId);
  const usesBillionInTarget = params.targetTabId === 'tax_inheritance' || params.targetTabId === 'fake_detector';
  return {
    id: `xfer-${params.sourceTabId}-to-${params.targetTabId}-${Date.now()}`,
    sourceTabId: params.sourceTabId, sourceLabelFa: sourceEntry?.titleFa || params.sourceTabId,
    targetTabId: params.targetTabId, targetLabelFa: targetEntry?.titleFa || params.targetTabId,
    fieldLabelFa: `ارزش کل ملک (${params.hoodName} · ${areaLabel})`,
    sourceValue: safeMillion, sourceUnit: 'MILLION_TOMAN',
    targetValue: usesBillionInTarget ? safeBillion : safeMillion,
    targetUnit: usesBillionInTarget ? 'BILLION_TOMAN' : 'MILLION_TOMAN',
    hoodId: params.hoodId, sqm: params.sqm,
    conversionNoteFa: usesBillionInTarget
      ? `تبدیل خودکار واحد با تایید شما: ${safeMillion.toLocaleString('fa-IR')} میلیون تومان ← ${safeBillion} میلیارد تومان${intlSuffix}`
      : `انتقال مستقیم با واحد یکسان: ${safeMillion.toLocaleString('fa-IR')} میلیون تومان${intlSuffix}`,
  };
}
export interface CalculatorScenarioSnapshot {
  scenarioId: string; scenarioName: string; tabId: CalculatorSuperTabId; calculatorTitleFa: string;
  createdAtIso: string; createdAtFa: string; inputsSummaryFa: Record<string, string>;
  primaryMetricLabelFa: string; primaryMetricNumericValue: number; primaryMetricUnitFa: string;
  secondaryMetricsFa: Record<string, string>;
}
export interface ScenarioComparisonResult {
  compatible: boolean; incompatibilityReasonFa?: string;
  scenarioA: CalculatorScenarioSnapshot; scenarioB: CalculatorScenarioSnapshot;
  deltaNumeric: number | null; deltaPercent: number | null; deltaSummaryFa: string;
}
export function createCalculatorScenarioSnapshot(params: {
  scenarioName: string; tabId: CalculatorSuperTabId; inputsSummaryFa: Record<string, string>;
  primaryMetricLabelFa: string; primaryMetricNumericValue: number; primaryMetricUnitFa: string;
  secondaryMetricsFa?: Record<string, string>;
}): CalculatorScenarioSnapshot {
  const entry = CALCULATOR_REGISTRY.find((c) => c.tabId === params.tabId);
  const now = new Date();
  return {
    scenarioId: `scen-${params.tabId}-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    scenarioName: (params.scenarioName || '').trim() || `سناریوی ${entry?.titleFa || params.tabId}`,
    tabId: params.tabId, calculatorTitleFa: entry?.titleFa || params.tabId,
    createdAtIso: now.toISOString(), createdAtFa: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    inputsSummaryFa: { ...params.inputsSummaryFa }, primaryMetricLabelFa: params.primaryMetricLabelFa,
    primaryMetricNumericValue: Number(params.primaryMetricNumericValue) || 0,
    primaryMetricUnitFa: params.primaryMetricUnitFa, secondaryMetricsFa: { ...(params.secondaryMetricsFa || {}) },
  };
}
export function compareCalculatorScenarios(scenarioA: CalculatorScenarioSnapshot, scenarioB: CalculatorScenarioSnapshot): ScenarioComparisonResult {
  if (scenarioA.tabId !== scenarioB.tabId || scenarioA.primaryMetricUnitFa !== scenarioB.primaryMetricUnitFa) {
    return { compatible: false, incompatibilityReasonFa: 'مقایسه مستقیم فقط بین سناریوهای یک ابزار با واحد خروجی یکسان مجاز است.',
      scenarioA, scenarioB, deltaNumeric: null, deltaPercent: null, deltaSummaryFa: 'غیرقابل مقایسه به دلیل تفاوت نوع محاسبه‌گر یا واحد خروجی', }; }
  const valA = scenarioA.primaryMetricNumericValue, valB = scenarioB.primaryMetricNumericValue, deltaNumeric = Math.round((valB - valA) * 100) / 100;
  const deltaPercent = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : null, sign = deltaNumeric > 0 ? '+' : '';
  const pctText = deltaPercent !== null ? ` (${deltaPercent > 0 ? '+' : ''}${deltaPercent}٪)` : '';
  return { compatible: true, scenarioA, scenarioB, deltaNumeric, deltaPercent, deltaSummaryFa: deltaNumeric === 0
      ? `هر دو سناریو مقدار یکسان (${valA.toLocaleString('fa-IR')} ${scenarioA.primaryMetricUnitFa}) دارند.`
      : `تفاوت سناریوی دوم نسبت به اول: ${sign}${deltaNumeric.toLocaleString('fa-IR')} ${scenarioA.primaryMetricUnitFa}${pctText}`, }; }
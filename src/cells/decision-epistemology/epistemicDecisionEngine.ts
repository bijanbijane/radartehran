/**
 * @file src/cells/decision-epistemology/epistemicDecisionEngine.ts
 * @description CASPER Epistemic Architecture, 12-Layer Data Provenance Taxonomy,
 * Confidence Score Mathematical Decomposition, Behavioral & Cognitive Bias Shield,
 * and Algorithmic Accountability Engine.
 */
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS, type Neighborhood } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { clampNumber, validateCityParam } from '../../utils/security';

export type EpistemicStatementClass =
  | 'FACT' | 'EVIDENCE' | 'INFERENCE' | 'HYPOTHESIS' | 'ASSUMPTION' | 'UNKNOWN' | 'RECOMMENDATION';

export type RadarDataProvenanceLayerId =
  | 'OBSERVED_DATA' | 'USER_PROVIDED_DATA' | 'ADVERTISER_CLAIM' | 'VERIFIED_DATA'
  | 'THIRD_PARTY_DATA' | 'ESTIMATED_DATA' | 'INFERRED_DATA' | 'PREDICTED_DATA'
  | 'MISSING_DATA' | 'CONFLICTING_DATA' | 'OUTDATED_DATA' | 'UNKNOWN_DATA';

export type DataProvenanceLayer = RadarDataProvenanceLayerId;
export type CognitiveBiasId = 'ANCHORING_BIAS' | 'FOMO_HERD_CONTAGION' | 'LIQUIDITY_LOCK_ILLUSION' | 'NOMINAL_MONEY_ILLUSION';

export const ALL_EPISTEMIC_STATEMENT_CLASSES: readonly EpistemicStatementClass[] = ['FACT', 'EVIDENCE', 'INFERENCE', 'HYPOTHESIS', 'ASSUMPTION', 'UNKNOWN', 'RECOMMENDATION'];
export const ALL_DATA_PROVENANCE_LAYERS: readonly RadarDataProvenanceLayerId[] = ['OBSERVED_DATA', 'ADVERTISER_CLAIM', 'VERIFIED_DATA', 'USER_PROVIDED_DATA', 'THIRD_PARTY_DATA', 'ESTIMATED_DATA', 'INFERRED_DATA', 'PREDICTED_DATA', 'CONFLICTING_DATA', 'OUTDATED_DATA', 'MISSING_DATA', 'UNKNOWN_DATA'];

export interface EpistemicProvenanceLayerEntry {
  layerId: RadarDataProvenanceLayerId;
  order: number;
  titleFa: string;
  epistemicClass: EpistemicStatementClass;
  currentValueSummaryFa: string;
  sourceFa: string;
  verificationMethodFa: string;
  confidencePct: number | null;
  limitationFa: string;
  statusTone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
}

export interface CognitiveBiasDiagnostic {
  biasId: CognitiveBiasId;
  titleFa: string;
  severity: 'HIGH' | 'MODERATE' | 'LOW';
  riskScore: number;
  metricSummaryFa: string;
  mechanismFa: string;
  debiasingActionFa: string;
}

export interface ConfidenceScoreDecomposition {
  totalConfidencePct: number;
  marginOfErrorPct: number;
  sampleSufficiencyPoints: number;
  maxSampleSufficiencyPoints: 35;
  iqrConsistencyPoints: number;
  maxIqrConsistencyPoints: 30;
  fraudFilterPoints: number;
  maxFraudFilterPoints: 20;
  temporalFreshnessPoints: number;
  maxTemporalFreshnessPoints: 14;
  formulaText: string;
  statisticalMeaningFa: string;
  epistemicWarningFa: string;
}

export interface AlgorithmicAccountabilityManifest {
  algorithmId: string;
  version: string;
  purposeFa: string;
  inputVariablesFa: string[];
  assumptionsFa: string[];
  knownLimitationsFa: string[];
  biasRisksFa: string[];
  humanAgencyPrincipleFa: string;
}

export interface NeighborhoodEpistemicDossier {
  cityId: CityId;
  hoodId: number;
  hoodName: string;
  generatedAtIso: string;
  askingPricePerSqm: number;
  estimatedDealPricePerSqm: number;
  estimatedDealPriceIntlText: string;
  iqrLowPerSqm: number;
  iqrHighPerSqm: number;
  grossRentalYieldPct: number;
  estimatedExitDays: number;
  confidenceDecomposition: ConfidenceScoreDecomposition;
  provenanceLayers: EpistemicProvenanceLayerEntry[];
  cognitiveBiases: CognitiveBiasDiagnostic[];
  accountabilityManifest: AlgorithmicAccountabilityManifest;
}

export interface CounterfactualScenarioInput {
  askingPricePerSqm: number;
  estimatedDealPricePerSqm: number;
  targetSqm: number;
  buyerProposedDiscountPct: number;
  expectedAnnualInflationPct?: number;
  intlCurrency?: IntlCurrencyCode;
}

export interface CounterfactualScenarioResult {
  askingTotalMillion: number;
  modelFairTotalMillion: number;
  buyerOfferTotalMillion: number;
  buyerOfferIntlText: string;
  capitalPreservedMillion: number;
  acceptanceProbabilityPct: number;
  epistemicClassification: EpistemicStatementClass;
  consequenceSummaryFa: string;
  uncertaintyNoteFa: string;
}

export function computeConfidenceScoreDecomposition(input: {
  validSampleCount: number; rejectedFraudCount: number; askingPricePerSqm: number;
  iqrLowPerSqm: number; iqrHighPerSqm: number; recencyDays?: number;
}): ConfidenceScoreDecomposition {
  const validCount = Math.max(1, Math.trunc(input.validSampleCount || 1));
  const fraudCount = Math.max(0, Math.trunc(input.rejectedFraudCount || 0));
  const median = Math.max(1, Number(input.askingPricePerSqm) || 100);
  const iqrSpreadRatio = Math.max(0.02, (input.iqrHighPerSqm - input.iqrLowPerSqm) / median);
  const recencyDays = clampNumber(input.recencyDays ?? 3, 0, 90, 3);

  const sampleSufficiencyPoints = Math.min(35, Math.round(12 + Math.log2(validCount + 1) * 5.2));
  const iqrConsistencyPoints = Math.round(clampNumber(30 * (1 - Math.min(0.45, iqrSpreadRatio) / 0.55), 10, 30, 24));
  const totalObserved = validCount + fraudCount;
  const noiseRatio = totalObserved > 0 ? fraudCount / totalObserved : 0;
  const fraudFilterPoints = Math.round(clampNumber(20 * (1 - noiseRatio * 0.65), 8, 20, 17));
  const temporalFreshnessPoints = Math.round(clampNumber(14 * Math.pow(0.5, recencyDays / 30), 4, 14, 13));

  const totalConfidencePct = clampNumber(
    sampleSufficiencyPoints + iqrConsistencyPoints + fraudFilterPoints + temporalFreshnessPoints, 35, 99, 85,
  );
  const marginOfErrorPct = Number(
    clampNumber((iqrSpreadRatio * 50) / Math.sqrt(Math.max(1, validCount)), 1.2, 12.5, 3.5).toFixed(1),
  );

  return {
    totalConfidencePct, marginOfErrorPct, sampleSufficiencyPoints, maxSampleSufficiencyPoints: 35,
    iqrConsistencyPoints, maxIqrConsistencyPoints: 30, fraudFilterPoints, maxFraudFilterPoints: 20,
    temporalFreshnessPoints, maxTemporalFreshnessPoints: 14,
    formulaText: 'C = S_sample(35) + S_iqr(30) + S_filter(20) + S_freshness(14)',
    statisticalMeaningFa: `درصد اطمینان (${totalConfidencePct}٪) بیانگر پایداری نمونه پس از حذف داده‌های پرت با حاشیه خطای برآوردی ±${marginOfErrorPct}٪ در سطح محله است؛ نه قطعیت قیمت یک ملک خاص.`,
    epistemicWarningFa: 'خروجی مدل جایگزین کارشناسی حضوری، بررسی سند ثبتی و رؤیت فیزیکی بنا نیست.',
  };
}

export function evaluateCognitiveDecisionBiases(input: {
  askingPricePerSqm: number; estimatedDealPricePerSqm: number; iqrLowPerSqm: number;
  rahn80m: number; marketRegime: 'HOT' | 'BALANCED' | 'FROZEN'; intlCurrency?: IntlCurrencyCode;
}): { biases: CognitiveBiasDiagnostic[]; grossRentalYieldPct: number; estimatedExitDays: number } {
  const ask = Math.max(10, input.askingPricePerSqm);
  const deal = Math.max(10, input.estimatedDealPricePerSqm);
  const askMarkupPct = Number((((ask - deal) / deal) * 100).toFixed(1));
  const annualRent80m = Math.max(50, input.rahn80m * 0.30);
  const grossRentalYieldPct = Number(clampNumber((annualRent80m / (deal * 80)) * 100, 1.5, 14, 4.2).toFixed(1));
  const estimatedExitDays = input.marketRegime === 'HOT' ? 35 : input.marketRegime === 'FROZEN' ? 115 : 65;
  const dealIntl = formatMillionTomanAsIntlCurrency(deal, input.intlCurrency ?? 'USD', 'fa');

  const biases: CognitiveBiasDiagnostic[] = [
    {
      biasId: 'ANCHORING_BIAS', titleFa: '۱. سوگیری لنگر قیمتی فروشنده (Anchoring Trap)',
      severity: askMarkupPct >= 9 ? 'HIGH' : askMarkupPct >= 5 ? 'MODERATE' : 'LOW',
      riskScore: clampNumber(Math.round(askMarkupPct * 8.5), 18, 95, 64),
      metricSummaryFa: `شکاف لنگر آگهی نسبت به معامله قطعی: +${askMarkupPct}٪ (متری ${ask - deal} م.ت حاشیه کاذب)`,
      mechanismFa: 'ذهن انسان اولین عدد دیده‌شده در آگهی را به‌عنوان «ارزش مرجع» می‌پذیرد.',
      debiasingActionFa: `مذاکره را از کف میان‌چارکی (${input.iqrLowPerSqm} م.ت) آغاز کنید و نرخ قطعی مدل (${deal} م.ت) را سقف توافق قرار دهید.`,
    },
    {
      biasId: 'FOMO_HERD_CONTAGION', titleFa: '۲. تله ترس از جاماندن و هیجان گله‌ای (FOMO)',
      severity: input.marketRegime === 'HOT' || grossRentalYieldPct < 3.6 ? 'HIGH' : 'MODERATE',
      riskScore: input.marketRegime === 'HOT' ? 84 : grossRentalYieldPct < 3.8 ? 72 : 48,
      metricSummaryFa: `بازده اجاره به قیمت: ${grossRentalYieldPct}٪ سالانه (نسبت P/R ~${Math.round(100 / grossRentalYieldPct)} سال)`,
      mechanismFa: 'فشار روانی «اگر امروز نخرم فردا گران‌تر می‌شود» باعث چشم‌پوشی از عیوب حقوقی و فنی ملک می‌شود.',
      debiasingActionFa: 'قاعده توقف ۲۴ ساعته: پیش از هر بیعانه، استعلام ثبتی و چک‌لیست ۵۰ نقطه‌ای بازدید را تکمیل کنید.',
    },
    {
      biasId: 'LIQUIDITY_LOCK_ILLUSION', titleFa: '۳. توهم نقدشوندگی و ریسک قفل سرمایه (Illiquidity Risk)',
      severity: estimatedExitDays >= 90 ? 'HIGH' : estimatedExitDays >= 60 ? 'MODERATE' : 'LOW',
      riskScore: clampNumber(Math.round(estimatedExitDays * 0.78), 25, 92, 58),
      metricSummaryFa: `زمان انتظار فروش متعارف: ~${estimatedExitDays} روز (هزینه خروج فوری: ۱۲٪ کسر قیمت)`,
      mechanismFa: 'خریداران تصور می‌کنند ملک در هر لحظه به قیمت تابلو قابل تبدیل به پول نقد است.',
      debiasingActionFa: 'حداقل ۶ ماه نقدینگی احتیاطی خارج از ملک نگه دارید تا مجبور به فروش فوری با ضریب ۰٫۸۸ نشوید.',
    },
    {
      biasId: 'NOMINAL_MONEY_ILLUSION', titleFa: '۴. توهم پولی اسمی در برابر ارزش واقعی (Money Illusion)',
      severity: 'MODERATE', riskScore: 66,
      metricSummaryFa: `ارزش ارزی هر متر معامله: ${dealIntl} • بازده واقعی نیازمند تعدیل تورمی است`,
      mechanismFa: 'رشد اسمی قیمت ریالی اغلب با سود واقعی سرمایه‌گذاری اشتباه گرفته می‌شود.',
      debiasingActionFa: 'بازده ملک را همواره بر مبنای قدرت خرید دلاری/طلا و پس از کسر استهلاک سالانه بنا بسنجید.',
    },
  ];
  return { biases, grossRentalYieldPct, estimatedExitDays };
}

export function buildNeighborhoodEpistemicDossier(input: {
  cityId?: string; hoodId: number; hoodName?: string; buyPerSqm?: number; rahn80m?: number;
  bargainsCount?: number; votesCount?: number; intlCurrency?: IntlCurrencyCode; customHood?: Neighborhood;
}): NeighborhoodEpistemicDossier {
  const safeCity = validateCityParam(input.cityId, 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const found = (input.customHood && input.customHood.id === input.hoodId) ? input.customHood : (cityHoods.find((h) => h.id === input.hoodId) ?? INITIAL_NEIGHBORHOODS[0]);
  const hoodName = input.hoodName || found?.name || `محله ${input.hoodId}`;
  const buyPerSqm = input.buyPerSqm && input.buyPerSqm > 0 ? input.buyPerSqm : found?.buyPerSqm || 120;
  const rahn80m = input.rahn80m && input.rahn80m > 0 ? input.rahn80m : found?.rahn80m || 1200;
  const samples = buildNeighborhoodListingSamples({ id: input.hoodId, name: hoodName, buyPerSqm, bargains: found?.bargains });
  const agg = aggregateNeighborhoodMarketMetrics(input.hoodId, hoodName, buyPerSqm, samples);
  const resolvedValidCount = Math.max(1, agg.validSampleCount || samples.length || 1);
  const resolvedIqrLow = agg.iqrLowPerSqm > 0 ? agg.iqrLowPerSqm : Math.round(agg.estimatedDealPricePerSqm * 0.94);
  const resolvedIqrHigh = agg.iqrHighPerSqm > resolvedIqrLow ? agg.iqrHighPerSqm : Math.round(agg.askingPricePerSqm * 1.05);
  const decomp = computeConfidenceScoreDecomposition({
    validSampleCount: resolvedValidCount, rejectedFraudCount: agg.rejectedFraudCount,
    askingPricePerSqm: agg.askingPricePerSqm, iqrLowPerSqm: resolvedIqrLow, iqrHighPerSqm: resolvedIqrHigh, recencyDays: 2,
  });
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';
  const dealIntl = formatMillionTomanAsIntlCurrency(agg.estimatedDealPricePerSqm, intlCurrency, 'fa');
  const votesCount = input.votesCount ?? 4;
  const regimeFa = agg.marketRegime === 'HOT' ? 'داغ (تخفیف ~۲.۵٪)' : agg.marketRegime === 'FROZEN' ? 'رکودی (شکاف ~۱۰٪)' : 'متعادل (تخفیف ~۷٪)';
  const { biases, grossRentalYieldPct, estimatedExitDays } = evaluateCognitiveDecisionBiases({
    askingPricePerSqm: agg.askingPricePerSqm, estimatedDealPricePerSqm: agg.estimatedDealPricePerSqm,
    iqrLowPerSqm: resolvedIqrLow, rahn80m, marketRegime: agg.marketRegime, intlCurrency,
  });

  const provenanceLayers: EpistemicProvenanceLayerEntry[] = [
    { layerId: 'OBSERVED_DATA', order: 1, titleFa: '۱. داده مشاهده‌شده (Observed Data)', epistemicClass: 'EVIDENCE', currentValueSummaryFa: `${resolvedValidCount} نمونه پالایش‌شده در دامنه ${resolvedIqrLow} تا ${resolvedIqrHigh} م.ت/متر`, sourceFa: 'پایش آگهی‌های عمومی و مشاهدات بازار محله', verificationMethodFa: 'فیلتر آماری دامنه بین‌چارکی (IQR) و میانه انحراف مطلق (MAD)', confidencePct: decomp.totalConfidencePct, limitationFa: 'مبتنی بر نمونه قابل مشاهده بازار است و معاملات خصوصی غیررسانه‌ای را شامل نمی‌شود.', statusTone: 'emerald' },
    { layerId: 'ADVERTISER_CLAIM', order: 2, titleFa: '۲. ادعای آگهی‌دهنده (Advertiser Claim)', epistemicClass: 'HYPOTHESIS', currentValueSummaryFa: `میانه قیمت پیشنهادی (تابلو): متری ${agg.askingPricePerSqm} م.ت`, sourceFa: 'اظهار اولیه فروشندگان و مشاوران در آگهی‌ها', verificationMethodFa: 'مقایسه با توزیع هدانیک محله و تشخیص کلیدواژه‌های تبلیغاتی', confidencePct: 62, limitationFa: 'قیمت پیشنهادی دارای لنگر ذهنی (Anchoring) فروشنده است و قیمت معامله قطعی نیست.', statusTone: 'amber' },
    { layerId: 'VERIFIED_DATA', order: 3, titleFa: '۳. داده تأییدشده (Verified Data)', epistemicClass: 'FACT', currentValueSummaryFa: `مختصات جغرافیایی، مرز محله و ضوابط پایه شهری ${hoodName}`, sourceFa: 'لایه مرجع مکانی GIS و گزارش‌های دارای اجماع وزنی (VERIFIED_REFERENCE)', verificationMethodFa: 'کنترل هندسی چندضلعی محله و حد نصاب اجماع کارشناسی (≥ ۳.۰)', confidencePct: 96, limitationFa: 'وضعیت ثبتی و پایان‌کار هر پلاک باید جداگانه در دفتر اسناد رسمی استعلام شود.', statusTone: 'emerald' },
    { layerId: 'USER_PROVIDED_DATA', order: 4, titleFa: '۴. داده ارائه‌شده توسط کاربر (User-Provided)', epistemicClass: 'EVIDENCE', currentValueSummaryFa: `${votesCount} امتیاز و تجربه زیسته ساکنان درباره آرامش، پارک و زیرساخت`, sourceFa: 'مشارکت مستقیم شهروندان و ساکنان محله در رادار', verificationMethodFa: 'وزن‌دهی شهرت مشارکت‌کننده و اعتبارسنجی موقعیت مکانی (Geolocation)', confidencePct: 78, limitationFa: 'بازتاب ادراک ذهنی مشارکت‌کنندگان است و ممکن است بین کوچه‌ها متفاوت باشد.', statusTone: 'blue' },
    { layerId: 'THIRD_PARTY_DATA', order: 5, titleFa: '۵. داده منبع ثالث (Third-Party Data)', epistemicClass: 'EVIDENCE', currentValueSummaryFa: 'نقشه‌های پایه، ایستگاه‌های مترو، شریان‌های ترافیکی و شاخص کیفیت هوا (AQI)', sourceFa: 'سرویس‌های نقشه نشان، OpenStreetMap و ایستگاه‌های پایش محیطی', verificationMethodFa: 'اعتبارسنجی طرح‌واره (Schema Bounds) و تطبیق مختصات ایستگاه‌ها', confidencePct: 90, limitationFa: 'وابسته به دقت و زمان به‌روزرسانی سرویس‌دهندگان بیرونی است.', statusTone: 'blue' },
    { layerId: 'ESTIMATED_DATA', order: 6, titleFa: '۶. داده تخمینی مدل (Estimated Data v6.4)', epistemicClass: 'INFERENCE', currentValueSummaryFa: `تخمین قیمت قطعی معامله: متری ${agg.estimatedDealPricePerSqm} م.ت (${dealIntl}) · رهن ۸۰متر: ${rahn80m} م.ت`, sourceFa: 'موتور قیمت‌گذاری هدانیک v6.4 و ضریب شکاف معامله (Ask-to-Deal Spread)', verificationMethodFa: 'بنچمارک ۱۵ سناریوی کنترلی و تعدیل سن بنا، طبقه، آسانسور، پارکینگ و بازسازی', confidencePct: decomp.totalConfidencePct, limitationFa: `تخمین آماری با حاشیه خطای ±${decomp.marginOfErrorPct}٪ برای واحد استاندارد ۵ سال ساخت است.`, statusTone: 'emerald' },
    { layerId: 'INFERRED_DATA', order: 7, titleFa: '۷. داده استنباطی (Inferred Data)', epistemicClass: 'INFERENCE', currentValueSummaryFa: `رژیم بازار محله: ${regimeFa} · دوره خروج متعارف: ~${estimatedExitDays} روز`, sourceFa: 'تحلیل نسبت قیمت به اجاره (P/R) و پراکندگی پیشنهادها', verificationMethodFa: 'استنباط از کشش قیمتی توجه و سرعت جذب فایل‌ها در محله', confidencePct: 82, limitationFa: 'استنباط ساختاری از رفتار بازار است و شرایط اضطراری فروشنده خاص را پیش‌بینی نمی‌کند.', statusTone: 'blue' },
    { layerId: 'PREDICTED_DATA', order: 8, titleFa: '۸. داده پیش‌بینی‌شده (Predicted Data)', epistemicClass: 'HYPOTHESIS', currentValueSummaryFa: 'چشم‌انداز ۳ تا ۶ ماهه قیمت و مقایسه بازده خرید در برابر رهن + سرمایه‌گذاری', sourceFa: 'مدل سناریونگاری روند کلان و همبستگی تاریخی محله با میانگین شهر', verificationMethodFa: 'آزمون پس‌نگری (Backtesting) روی بازه‌های زمانی قبلی', confidencePct: 68, limitationFa: 'به تکانه‌های کلان ارزی، سیاست‌های پولی و ریسک‌های سیستماتیک حساس است.', statusTone: 'amber' },
    { layerId: 'CONFLICTING_DATA', order: 9, titleFa: '۹. داده‌های متناقض و پرت (Conflicting / Outliers)', epistemicClass: 'EVIDENCE', currentValueSummaryFa: `${agg.rejectedFraudCount} آگهی با انحراف شدید قیمتی یا ادعای متناقض قرنطینه شد`, sourceFa: 'موتور تشخیص آگهی فیک/طعمه و فیلتر |P_i - M| > 2.5 × MAD', verificationMethodFa: 'حذف خودکار از میانگین محله برای جلوگیری از مسمومیت آماری (Data Poisoning)', confidencePct: 91, limitationFa: 'املاک بسیار خاص ممکن است به‌عنوان داده پرت فیلتر شوند.', statusTone: 'rose' },
    { layerId: 'OUTDATED_DATA', order: 10, titleFa: '۱۰. داده قدیمی و زوال زمانی (Outdated / Decayed)', epistemicClass: 'ASSUMPTION', currentValueSummaryFa: 'اعمال ضریب زوال نمایی با نیمه‌عمر ۳۰ روزه روی مشاهدات قدیمی‌تر', sourceFa: 'تابع وزن‌دهی زمانی W_time = 0.5^(ageDays / 30)', verificationMethodFa: 'کاهش خودکار وزن مشاهدات بیش از ۱۴ روز در محاسبه قیمت مرجع', confidencePct: 88, limitationFa: 'در جهش‌های ناگهانی بازار، داده‌های بیش از ۷ روز ممکن است با تأخیر همراه باشند.', statusTone: 'slate' },
    { layerId: 'MISSING_DATA', order: 11, titleFa: '۱۱. داده ناموجود (Missing Data)', epistemicClass: 'UNKNOWN', currentValueSummaryFa: 'جزئیات ریزمعاملات ثبت‌شده در سامانه رسمی املاک که عمومی نشده‌اند', sourceFa: 'محدودیت دسترسی عمومی به پایگاه داده‌های حاکمیتی معاملات', verificationMethodFa: 'جبران نسبی از طریق تقاطع آگهی‌های تاییدشده، گزارش‌های مردمی و ضریب Ask-to-Deal', confidencePct: null, limitationFa: 'نبود داده عمومی به‌معنای نبود معامله در واقعیت نیست (تمایز فقدان داده و فقدان پدیده).', statusTone: 'slate' },
    { layerId: 'UNKNOWN_DATA', order: 12, titleFa: '۱۲. وضعیت نامعلوم ملک هدف (Property Unknowns)', epistemicClass: 'UNKNOWN', currentValueSummaryFa: 'سلامت سازه، تأسیسات پنهان، بدهی شارژ، رهن بانک یا معارض حقوقی پلاک مشخص', sourceFa: 'نیازمند ممیزی فیزیکی و حقوقی پیش از امضای قرارداد', verificationMethodFa: 'چک‌لیست ضدتقلب قولنامه و کارشناسی حضوری ساختمان در جعبه ابزار رادار', confidencePct: null, limitationFa: 'هیچ الگوریتمی بدون بازدید میدانی و استعلام ثبتی قادر به تایید سلامت حقوقی واحد خاص نیست.', statusTone: 'rose' },
  ];

  const accountabilityManifest: AlgorithmicAccountabilityManifest = {
    algorithmId: 'RADAR-HEDONIC-MAD-V6.4', version: '6.4.3-CASPER',
    purposeFa: 'کاهش عدم تقارن اطلاعاتی میان خریدار/مستأجر و فروشنده/موجر از طریق تفکیک قیمت تابلو از تخمین معامله قطعی.',
    inputVariablesFa: ['میانه قیمت پایه محله (فیلتر MAD)', 'متراژ، سن بنا، طبقه، آسانسور، پارکینگ و انباری', 'کیفیت بازسازی، نورگیری و نوع سند', 'رژیم نقدشوندگی محله (HOT / BALANCED / FROZEN) و نسبت P/R'],
    assumptionsFa: ['بنای مرجع محله بر اساس واحد استاندارد ۸۰ تا ۱۰۰ متری، ۵ سال ساخت با امکانات کامل سنجیده شده است.', `شکاف متعارف قیمت اعلامی تا معامله قطعی در وضعیت فعلی محله ${Math.max(1, Math.round((1 - agg.askToDealRatio) * 100))}٪ فرض شده است.`],
    knownLimitationsFa: ['ویژگی‌های میکرو-مکانی خاص (مجاورت با بزرگراه یا دید ابدی) نیاز به تنظیم دستی در ماشین‌حساب هدانیک دارند.', 'در شرایط تکانه شدید ارزی، ضریب تبدیل قیمت پیشنهادی به معامله قطعی دستخوش نوسان کوتاه‌مدت می‌شود.'],
    biasRisksFa: ['سوگیری بقا (Survivorship Bias): آگهی‌های خوش‌قیمت سریع‌تر جذب می‌شوند و فایل‌های گران مدت بیشتری در فهرست‌ها می‌مانند.', 'سوگیری انتخاب (Selection Bias): املاک نوساز یا لوکس ممکن است سهم بیشتری در آگهی‌های آنلاین داشته باشند.'],
    humanAgencyPrincipleFa: 'رادار برای فروش ملک به شما طراحی نشده است؛ مأموریت رادار آشکارسازی حقیقت پشت داده‌های ملک، شبیه‌سازی پیامد انتخاب‌ها و حفظ کامل اختیار تصمیم‌گیری در دستان شماست.',
  };

  return {
    cityId: safeCity, hoodId: input.hoodId, hoodName, generatedAtIso: new Date().toISOString(),
    askingPricePerSqm: agg.askingPricePerSqm, estimatedDealPricePerSqm: agg.estimatedDealPricePerSqm,
    estimatedDealPriceIntlText: dealIntl, iqrLowPerSqm: resolvedIqrLow, iqrHighPerSqm: resolvedIqrHigh,
    grossRentalYieldPct, estimatedExitDays, confidenceDecomposition: decomp,
    provenanceLayers, cognitiveBiases: biases, accountabilityManifest,
  };
}

export function evaluateCounterfactualDecisionScenario(input: CounterfactualScenarioInput): CounterfactualScenarioResult {
  const sqm = clampNumber(input.targetSqm, 25, 1000, 85);
  const askingSqm = Math.max(10, Number(input.askingPricePerSqm) || 120);
  const dealSqm = Math.max(10, Number(input.estimatedDealPricePerSqm) || Math.round(askingSqm * 0.93));
  const discountPct = clampNumber(input.buyerProposedDiscountPct, 0, 25, 7);
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';

  const askingTotalMillion = Math.round(askingSqm * sqm);
  const modelFairTotalMillion = Math.round(dealSqm * sqm);
  const buyerOfferTotalMillion = Math.round(askingTotalMillion * (1 - discountPct / 100));
  const capitalPreservedMillion = Math.max(0, askingTotalMillion - buyerOfferTotalMillion);

  const fairDiscountPct = ((askingSqm - dealSqm) / askingSqm) * 100;
  const deltaFromFair = discountPct - fairDiscountPct;
  const acceptanceProbabilityPct = Math.round(clampNumber(78 - deltaFromFair * 4.8, 8, 96, 65));

  const consequenceSummaryFa = deltaFromFair <= -2
    ? `پیشنهاد شما (${discountPct}٪ تخفیف) بالاتر از تخمین معامله قطعی مدل است؛ احتمال پذیرش فروشنده بالاست (${acceptanceProbabilityPct}٪) اما بخشی از حاشیه چانه‌زنی را واگذار می‌کنید.`
    : deltaFromFair <= 3.5
      ? `پیشنهاد شما (${discountPct}٪ تخفیف) در هسته تعادلی معامله قطعی قرار دارد؛ حفظ سرمایه ${capitalPreservedMillion.toLocaleString('fa-IR')} م.ت همراه با شانس توافق متعادل (${acceptanceProbabilityPct}٪).`
      : `پیشنهاد شما (${discountPct}٪ تخفیف) تهاجمی‌تر از عرف فعلی محله است؛ در صورت پذیرش، ${capitalPreservedMillion.toLocaleString('fa-IR')} م.ت صرفه‌جویی می‌کنید اما شانس توافق فروشنده عادی ~${acceptanceProbabilityPct}٪ است.`;

  return {
    askingTotalMillion, modelFairTotalMillion, buyerOfferTotalMillion,
    buyerOfferIntlText: formatMillionTomanAsIntlCurrency(buyerOfferTotalMillion, intlCurrency, 'fa'),
    capitalPreservedMillion, acceptanceProbabilityPct, epistemicClassification: 'INFERENCE',
    consequenceSummaryFa,
    uncertaintyNoteFa: 'این شبیه‌سازی یک تحلیل خلاف واقع (Counterfactual Inference) بر پایه توزیع تخفیف‌های محله است و به انگیزه نقدشوندگی فروشنده خاص بستگی دارد.',
  };
}

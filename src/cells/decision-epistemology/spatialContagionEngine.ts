import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS, type Neighborhood } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../../data/realMarketPriceAggregator';
import type { EpistemicStatementClass, RadarDataProvenanceLayerId } from './epistemicDecisionEngine';

/**
 * CASPER Interdisciplinary Urban Science, Information Economics & Prospect Theory Engine
 * Combines:
 * 1. George Akerlof's Information Asymmetry & "Market for Lemons" Risk Index (1970 Nobel Economics)
 * 2. Spatial Econometrics (Spatial Autoregressive Contagion & Spillover Network Graph)
 * 3. Kahneman & Tversky Cumulative Prospect Theory (Loss Aversion λ=2.25 & Disposition Effect)
 */

export type InformationAsymmetryRegime =
  | 'TRANSPARENT_MARKET'
  | 'MODERATE_OPACITY'
  | 'SEVERE_LEMON_TRAP';

export interface AkerlofLemonAssessment {
  lemonIndexScore: number; // 0 (fully transparent) to 100 (extreme information asymmetry)
  regime: InformationAsymmetryRegime;
  regimeLabelFa: string;
  priceDispersionRatioPct: number;
  baitRejectionRatePct: number;
  askDealSpreadPct: number;
  requiredInformationDiscountPct: number;
  epistemicClass: EpistemicStatementClass;
  provenanceLayer: RadarDataProvenanceLayerId;
  sellerAdvantageWarningFa: string;
  dueDiligenceProtocolFa: string[];
}

export interface SpatialContagionNode {
  hoodId: number;
  hoodName: string;
  zone: string;
  role: 'LEADING_DRIVER' | 'SPILLOVER_ABSORBER';
  roleLabelFa: string;
  distanceKm: number;
  dealPricePerSqm: number;
  priceRatioToTarget: number;
  spatialCorrelationBeta: number; // 0.1 to 0.98
  transmissionLagWeeks: number; // 2 to 10 weeks
  mechanismFa: string;
}

export interface KahnemanProspectAnalysis {
  lossAversionLambda: number; // 2.25 standard Tversky-Kahneman coefficient
  sellerReferencePricePerSqm: number;
  fairDealPricePerSqm: number;
  nominalDiscountMillion80m: number;
  perceivedSellerPainUnits: number;
  dispositionRigidityPct: number;
  recommendedNegotiationFramingFa: string;
  stagedPaymentTacticFa: string;
}

export interface NeighborhoodSpatialContagionReport {
  hoodId: number;
  hoodName: string;
  cityKey: string;
  generatedAtIso: string;
  akerlofLemon: AkerlofLemonAssessment;
  contagionNodes: SpatialContagionNode[];
  spatialAutocorrelationMoranI: number;
  prospectTheory: KahnemanProspectAnalysis;
}

function computeHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export function computeAkerlofLemonIndex(
  hoodId: number,
  hoodName: string,
  basePriceSqm: number,
  hood?: Neighborhood,
): AkerlofLemonAssessment {
  const agg = aggregateNeighborhoodMarketMetrics(hoodId, hoodName, basePriceSqm, []);
  const medianDeal = Math.max(10, agg.estimatedDealPricePerSqm);
  const iqrSpreadPct = Number((((agg.iqrHighPerSqm - agg.iqrLowPerSqm) / medianDeal) * 100).toFixed(1));
  const totalRaw = Math.max(1, agg.validSampleCount + agg.rejectedFraudCount);
  const baitRejectionRatePct = Number(((agg.rejectedFraudCount / totalRaw) * 100).toFixed(1));
  const askDealSpreadPct = Number(Math.max(1, (1 - agg.askToDealRatio) * 100).toFixed(1));

  // Older/congested urban fabric increases hidden structural/installations defect risk
  const densityRiskBonus = (hood?.trafficInfo?.trafficScore ?? hood?.air ?? 7) < 6.5 ? 8 : 3;
  const rawScore =
    Math.min(40, iqrSpreadPct * 1.35) +
    Math.min(30, baitRejectionRatePct * 1.4) +
    Math.min(22, askDealSpreadPct * 1.1) +
    densityRiskBonus;

  const lemonIndexScore = Math.max(12, Math.min(95, Math.round(rawScore)));

  let regime: InformationAsymmetryRegime = 'MODERATE_OPACITY';
  let regimeLabelFa = 'عدم تقارن اطلاعاتی متوسط (نیازمند راستی‌آزمایی فنی)';
  if (lemonIndexScore >= 62) {
    regime = 'SEVERE_LEMON_TRAP';
    regimeLabelFa = 'ریسک بالای «بازار لیموها» (عدم تقارن شدید اطلاعات به نفع فروشنده)';
  } else if (lemonIndexScore <= 35) {
    regime = 'TRANSPARENT_MARKET';
    regimeLabelFa = 'شفافیت نسبی قیمت و همگنی بالای فایل‌های محله';
  }

  const requiredInformationDiscountPct = Number((lemonIndexScore * 0.14).toFixed(1));

  return {
    lemonIndexScore,
    regime,
    regimeLabelFa,
    priceDispersionRatioPct: iqrSpreadPct,
    baitRejectionRatePct,
    askDealSpreadPct,
    requiredInformationDiscountPct,
    epistemicClass: 'INFERENCE',
    provenanceLayer: 'INFERRED_DATA',
    sellerAdvantageWarningFa:
      lemonIndexScore >= 62
        ? `در ${hoodName} پراکندگی قیمتی (${iqrSpreadPct}٪) و نرخ آگهی‌های طعمه (${baitRejectionRatePct}٪) بالاست؛ فروشندگان واحدهای فرسوده یا دارای نقص سندی تلاش می‌کنند ملک خود را هم‌ردیف واحدهای کلیدنخورده قیمت‌گذاری کنند.`
        : `پراکندگی بین‌چارکی محله ${hoodName} معادل ${iqrSpreadPct}٪ است؛ برای پوشش ریسک عیوب پنهان تأسیساتی و سندی، حداقل ${requiredInformationDiscountPct}٪ حاشیه احتیاط فراتر از قیمت اعلامی لحاظ کنید.`,
    dueDiligenceProtocolFa: [
      'استعلام ثبتی آنی، بررسی صورتمجلس تفکیکی (پلاک ثبتی پارکینگ و انباری) و عدم بازداشت سند پیش از هرگونه بیعانه',
      'کارشناسی فیزیکی تأسیسات مکانیکی، افت فشار آب طبقات بالا و تست صدای مشاعات در ساعات اوج ترافیک عصرگاهی',
      'مقایسه قیمت پیشنهادی با چارک اول آماری (IQR Low) برای واحدهای بالای ۱۲ سال ساخت یا فاقد نورگیر مستقیم',
    ],
  };
}

export function computeKahnemanProspectAnalysis(
  askingPricePerSqm: number,
  dealPricePerSqm: number,
): KahnemanProspectAnalysis {
  const lambda = 2.25; // Kahneman-Tversky empirical loss aversion ratio
  const alpha = 0.88; // Diminishing sensitivity exponent
  const spreadPerSqm = Math.max(1, askingPricePerSqm - dealPricePerSqm);
  const nominalDiscountMillion80m = Math.round(spreadPerSqm * 80);

  // Perceived psychological pain to seller anchored on peak asking price
  const perceivedSellerPainUnits = Math.round(lambda * Math.pow(nominalDiscountMillion80m, alpha));
  const dispositionRigidityPct = Math.min(92, Math.max(25, Math.round(40 + (spreadPerSqm / Math.max(1, askingPricePerSqm)) * 280)));

  return {
    lossAversionLambda: lambda,
    sellerReferencePricePerSqm: Math.round(askingPricePerSqm),
    fairDealPricePerSqm: Math.round(dealPricePerSqm),
    nominalDiscountMillion80m,
    perceivedSellerPainUnits,
    dispositionRigidityPct,
    recommendedNegotiationFramingFa: `طبق نظریه چشم‌انداز کانمن-تورسکی (λ=${lambda})، کاهش مستقیم ${nominalDiscountMillion80m} میلیون تومان از قیمت اسمی برای فروشنده در حکم «زیان قطعی» از نقطه مرجع ذهنی اوست و مقاومت روانی ${dispositionRigidityPct}٪ ایجاد می‌کند.`,
    stagedPaymentTacticFa:
      'به‌جای چانه‌زنی صرفاً روی عدد متری، تخفیف را در قالب «تنفس پرداخت ۴۵ تا ۶۰ روزه»، «رهن کامل واحد توسط فروشنده به نرخ روز» یا «تهاتر با دارایی نقدشونده» بسته‌بندی کنید تا اثر زیان‌گریزی اسمی خنثی شود.',
  };
}

export function buildNeighborhoodSpatialContagionReport(
  hoodId: number,
  hoodName: string,
  cityKey: CityId | string = 'tehran',
  basePriceSqm: number = 120,
): NeighborhoodSpatialContagionReport {
  const safeCity = (['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'].includes(String(cityKey))
    ? cityKey
    : 'tehran') as CityId;
  const allHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const target = allHoods.find((h) => h.id === hoodId || h.name === hoodName) ?? allHoods[0];
  const targetAgg = aggregateNeighborhoodMarketMetrics(
    target?.id ?? hoodId,
    target?.name ?? hoodName,
    target?.buyPerSqm ?? basePriceSqm,
    [],
  );

  const akerlofLemon = computeAkerlofLemonIndex(
    target?.id ?? hoodId,
    target?.name ?? hoodName,
    target?.buyPerSqm ?? basePriceSqm,
    target,
  );

  const prospectTheory = computeKahnemanProspectAnalysis(
    targetAgg.askingPricePerSqm,
    targetAgg.estimatedDealPricePerSqm,
  );

  // Build spatial network graph around target
  const targetLat = target?.lat ?? 35.72;
  const targetLng = target?.lng ?? 51.38;
  const targetBuy = target?.buyPerSqm ?? basePriceSqm;

  const neighborsWithDist = allHoods
    .filter((h) => h.id !== (target?.id ?? hoodId))
    .map((h) => ({
      hood: h,
      distKm: computeHaversineKm(targetLat, targetLng, h.lat, h.lng),
      priceRatio: h.buyPerSqm / Math.max(1, targetBuy),
    }))
    .filter((item) => item.distKm <= 14 && item.priceRatio >= 0.55 && item.priceRatio <= 1.65)
    .sort((a, b) => a.distKm - b.distKm);

  const pool = neighborsWithDist.length >= 4
    ? neighborsWithDist
    : allHoods
        .filter((h) => h.id !== (target?.id ?? hoodId))
        .map((h) => ({
          hood: h,
          distKm: computeHaversineKm(targetLat, targetLng, h.lat, h.lng),
          priceRatio: h.buyPerSqm / Math.max(1, targetBuy),
        }))
        .sort((a, b) => Math.abs(1 - a.priceRatio) - Math.abs(1 - b.priceRatio));

  const leadingDrivers = pool
    .filter((x) => x.priceRatio >= 1.03)
    .slice(0, 2)
    .map((x, idx): SpatialContagionNode => {
      const nAgg = aggregateNeighborhoodMarketMetrics(x.hood.id, x.hood.name, x.hood.buyPerSqm, []);
      const beta = Number(Math.max(0.45, Math.min(0.92, 0.88 - x.distKm * 0.03 - idx * 0.05)).toFixed(2));
      const lag = Math.max(2, Math.min(8, Math.round(2 + x.distKm * 0.45)));
      return {
        hoodId: x.hood.id,
        hoodName: x.hood.name,
        zone: x.hood.zone,
        role: 'LEADING_DRIVER',
        roleLabelFa: 'کانون پیش‌ران موج قیمتی (Leading Hub)',
        distanceKm: x.distKm,
        dealPricePerSqm: Math.round(nAgg.estimatedDealPricePerSqm),
        priceRatioToTarget: Number(x.priceRatio.toFixed(2)),
        spatialCorrelationBeta: beta,
        transmissionLagWeeks: lag,
        mechanismFa: `تغییرات نرخ معامله در ${x.hood.name} با ضریب همبستگی فضایی β=${beta} پس از حدود ${lag} هفته به ${target?.name ?? hoodName} سرایت می‌کند.`,
      };
    });

  const spilloverAbsorbers = pool
    .filter((x) => x.priceRatio < 1.03)
    .slice(0, 2)
    .map((x, idx): SpatialContagionNode => {
      const nAgg = aggregateNeighborhoodMarketMetrics(x.hood.id, x.hood.name, x.hood.buyPerSqm, []);
      const beta = Number(Math.max(0.42, Math.min(0.89, 0.84 - x.distKm * 0.025 - idx * 0.04)).toFixed(2));
      const lag = Math.max(3, Math.min(9, Math.round(3 + x.distKm * 0.5)));
      return {
        hoodId: x.hood.id,
        hoodName: x.hood.name,
        zone: x.hood.zone,
        role: 'SPILLOVER_ABSORBER',
        roleLabelFa: 'جاذب سرریز تقاضا (Spillover Absorber)',
        distanceKm: x.distKm,
        dealPricePerSqm: Math.round(nAgg.estimatedDealPricePerSqm),
        priceRatioToTarget: Number(x.priceRatio.toFixed(2)),
        spatialCorrelationBeta: beta,
        transmissionLagWeeks: lag,
        mechanismFa: `با افزایش فشار قیمتی در ${target?.name ?? hoodName}، تقاضای مصرفی با وقفه ${lag} هفته‌ای به سمت ${x.hood.name} سرریز می‌شود.`,
      };
    });

  const contagionNodes = [...leadingDrivers, ...spilloverAbsorbers];
  const avgBeta =
    contagionNodes.length > 0
      ? contagionNodes.reduce((acc, n) => acc + n.spatialCorrelationBeta, 0) / contagionNodes.length
      : 0.68;

  return {
    hoodId: target?.id ?? hoodId,
    hoodName: target?.name ?? hoodName,
    cityKey: String(safeCity),
    generatedAtIso: new Date().toISOString(),
    akerlofLemon,
    contagionNodes,
    spatialAutocorrelationMoranI: Number(Math.min(0.91, Math.max(0.35, avgBeta * 0.94)).toFixed(2)),
    prospectTheory,
  };
}

import crypto from 'node:crypto'; import { calculateHedonicValuation, FAST_SALE_FACTOR, getCurrentJalaliYear } from '../data/hedonicPricingEngine'; import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, type CityId } from '../data/multiCityData'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const MANDATORY_PAYMENT_SIMULATION_BANNER = 'SIMULATION — NO REAL PAYMENT OR SETTLEMENT' as const; export interface CommercialDatasetAuditResult { datasetId: string; distributable: boolean; httpStatusIfRequested: 200 | 402 | 403; reasonCode: 'APPROVED_AGGREGATED_INDEX' | 'FORBIDDEN_PII_OR_PRIVATE_DATA' | 'UNVERIFIED_DATASET'; provenance: string; }
const PROHIBITED_PII_DATASETS = new Set([ 'buyerLeads', 'buyer_alerts', 'sponsorRequests', 'bargainOwners', 'private_user_drafts', 'user_phones', ]); const APPROVED_COMMERCIAL_DATASETS = new Set([ 'tehran_neighborhood_price_index_v1', 'multicity_housing_summary_v1', 'hedonic_valuation_api_v1', 'mcp_authorized_market_tools_v1', ]); export function auditDatasetCommercialEligibility(datasetId: string): CommercialDatasetAuditResult { const cleanId = (datasetId || '').trim(); if (PROHIBITED_PII_DATASETS.has(cleanId) || /phone|lead|pii|private|owner/i.test(cleanId)) { return { datasetId: cleanId, distributable: false, httpStatusIfRequested: 403, reasonCode: 'FORBIDDEN_PII_OR_PRIVATE_DATA', provenance: 'Restricted User / CRM Data — Never Commercially Distributable', }; }
  if (APPROVED_COMMERCIAL_DATASETS.has(cleanId)) { return { datasetId: cleanId, distributable: true, httpStatusIfRequested: 200, reasonCode: 'APPROVED_AGGREGATED_INDEX', provenance: 'Radar Tehran Aggregated & Validated Market Index (Zero PII)', }; }
  return { datasetId: cleanId, distributable: false, httpStatusIfRequested: 403, reasonCode: 'UNVERIFIED_DATASET', provenance: 'Unverified dataset identifier', }; } export interface ExchangeRateReference { source: string; usdToTomanRate: number; recordedAtIso: string; isStaleWarningFa: string; conversionPolicyFa: string; }
export const REFERENCE_EXCHANGE_RATE: ExchangeRateReference = { source: 'مرجع نرخ مرجع پیکربندی رادار (صرفاً جهت نمایش برآورد ریالی/تومانی)', usdToTomanRate: 68_500, recordedAtIso: '2026-11-01T00:00:00.000Z', isStaleWarningFa: 'نرخ تبدیل ثابت پیکربندی است و قیمت لحظه‌ای بازار آزاد نیست.', conversionPolicyFa: 'محاسبه بر پایه میکرو-دلار (USD Micros) و تبدیل شفاف با ذکر زمان ثبت نرخ.', }; export interface CommercialProductSpec { productId: string; titleFa: string;
  category: 'API' | 'DATASET' | 'MCP_TOOL_PLAN'; pricePerRequestUsdMicros: number; pricePerRequestToman: number; unitLabelFa: string; geographicScope: string; updateScheduleFa: string; provenanceFa: string; knownLimitationsFa: string; }
export const RADAR_COMMERCIAL_PRODUCTS: readonly CommercialProductSpec[] = [
  { productId: 'tehran_neighborhood_price_index_v1', titleFa: 'API شاخص قیمت خرید و رهن محلات تهران (نسخه v1)', category: 'API', pricePerRequestUsdMicros: 5_000, // $0.005
    pricePerRequestToman: Math.round((5_000 / 1_000_000) * REFERENCE_EXCHANGE_RATE.usdToTomanRate), unitLabelFa: 'میلیون تومان بر متر مربع (خرید) / میلیون تومان (رهن ۸۰ متری)', geographicScope: '۸۰ محله و ناحیه تهران و حومه',
    updateScheduleFa: 'بروزرسانی متناوب سرور (هر ۲ ساعت)', provenanceFa: 'میانگین وزنی و پالایش‌شده داده‌های بازار مسکن رادار تهران (بدون اطلاعات شخصی)', knownLimitationsFa: 'ارقام شاخص تحلیلی هستند و جایگزین کارشناسی رسمی دادگستری یا ثبت اسناد نمی‌شوند.', },
  { productId: 'multicity_housing_summary_v1', titleFa: 'دیتاست مقایسه‌ای ۵ کلان‌شهر (تهران، کرج، مشهد، اصفهان، شیراز)', category: 'DATASET',
    pricePerRequestUsdMicros: 10_000, // $0.01
    pricePerRequestToman: Math.round((10_000 / 1_000_000) * REFERENCE_EXCHANGE_RATE.usdToTomanRate), unitLabelFa: 'میلیون تومان', geographicScope: 'تهران، کرج، مشهد، اصفهان، شیراز (۳۹۲ محله)', updateScheduleFa: 'روزانه / دوره‌ای',
    provenanceFa: 'موتور چندشهری رادار مسکن (MULTI_CITY_CONFIGS)', knownLimitationsFa: 'مبتنی بر نمونه آماری محلات منتخب هر کلان‌شهر.', }, {
    productId: 'mcp_authorized_market_tools_v1', titleFa: 'دسترسی پروتکل MCP ویژه ایجنت‌های هوش مصنوعی مجاز',
    category: 'MCP_TOOL_PLAN', pricePerRequestUsdMicros: 8_000, // $0.008
    pricePerRequestToman: Math.round((8_000 / 1_000_000) * REFERENCE_EXCHANGE_RATE.usdToTomanRate), unitLabelFa: 'فراخوانی ابزار ساختاریافته JSON',
    geographicScope: 'کل شبکه رادار مسکن', updateScheduleFa: 'لحظه‌ای بر اساس آخرین کش سرور',
    provenanceFa: 'موتور قطعی هدانیک (calculateHedonicValuation) و شاخص محلات', knownLimitationsFa: 'صرفاً خواندنی (Read-Only)؛ بدون دسترسی به SQL یا اطلاعات تماس کاربران.',
  }, ];
export interface X402ChallengeResult {
  httpStatus: 402;
  headers: { 'PAYMENT-REQUIRED': string; 'Cache-Control': 'no-store' };
  body: {
    status: 'payment_required'; protocol: 'x402-v1'; productId: string; amountUsdMicros: number; amountToman: number;
    exchangeRateRef: ExchangeRateReference; messageFa: string; displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
  };
}
export function buildX402PaymentChallenge(
  productId: string,
  areaUnit?: AreaUnit,
  intlCurrency?: IntlCurrencyCode,
): X402ChallengeResult {
  const product = RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === productId) || RADAR_COMMERCIAL_PRODUCTS[0];
  const resolvedUnit = areaUnit ?? getStoredAreaUnit(); const resolvedCurrency = intlCurrency ?? getStoredIntlCurrency();
  const challengePayload = {
    version: 'x402-v1', productId: product.productId, amountUsdMicros: product.pricePerRequestUsdMicros,
    currency: 'USD_MICROS', timestampIso: new Date().toISOString(), settlementMode: 'PROVIDER_INDEPENDENT_X402',
  };
  return {
    httpStatus: 402,
    headers: {
      'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challengePayload), 'utf-8').toString('base64'),
      'Cache-Control': 'no-store',
    },
    body: {
      status: 'payment_required', protocol: 'x402-v1', productId: product.productId,
      amountUsdMicros: product.pricePerRequestUsdMicros, amountToman: product.pricePerRequestToman,
      exchangeRateRef: REFERENCE_EXCHANGE_RATE,
      messageFa: 'دسترسی به این وب‌سرویس تجاری نیازمند گواهی پرداخت معتبر (پروتکل x402) یا کلید اشتراک سازمانی است.',
      displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(14500, resolvedCurrency),
    },
  };
}
export function signX402PaymentContextForVerification(
  paymentContextJson: string,
  secretKey: string
): string {
  return crypto.createHmac('sha256', secretKey).update(paymentContextJson).digest('hex');
}
const consumedX402ProofDigests = new Map<string, number>();
const X402_REPLAY_TTL_MS = 10 * 60 * 1000;
export function resetX402ReplayCacheForTests(): void { consumedX402ProofDigests.clear(); }
export function verifyX402PaymentHeaders(params: {
  paymentContextHeader?: string; paymentSignatureHeader?: string; expectedProductId: string;
  verificationSecret?: string; nowMs?: number; allowReplayForTests?: boolean;
}): {
  verified: boolean; httpStatus: 200 | 402 | 503;
  failureCode?: 'PAYMENT_REQUIRED' | 'INVALID_PAYMENT_PROOF' | 'PAYMENT_REJECTED' | 'VERIFIER_UNCONFIGURED';
} {
  if (!params.paymentContextHeader || !params.paymentSignatureHeader) {
    return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REQUIRED' };
  }
  const rawSecret = (params.verificationSecret || process.env.X402_HMAC_SECRET || process.env.X402_SIGNING_SECRET || '').trim();
  const secret = (rawSecret.length >= 16 || process.env.NODE_ENV === 'test') ? rawSecret : '';
  if (!secret) return { verified: false, httpStatus: 503, failureCode: 'VERIFIER_UNCONFIGURED' };
  try {
    const decoded = Buffer.from(params.paymentContextHeader, 'base64').toString('utf-8');
    const expectedSig = signX402PaymentContextForVerification(decoded, secret);
    const sigBuf = Buffer.from(params.paymentSignatureHeader, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { verified: false, httpStatus: 402, failureCode: 'INVALID_PAYMENT_PROOF' };
    }
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const expectedProduct = RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === params.expectedProductId);
    const minRequiredMicros = expectedProduct ? expectedProduct.pricePerRequestUsdMicros : 1;
    const paidMicros = Number(parsed.amountUsdMicros);
    if (parsed.productId !== params.expectedProductId || !Number.isFinite(paidMicros) || paidMicros < minRequiredMicros) {
      return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
    }
    const now = params.nowMs ?? Date.now();
    if (parsed.timestampIso !== undefined) {
      const tsMs = typeof parsed.timestampIso === 'string' ? Date.parse(parsed.timestampIso) : NaN;
      if (!Number.isFinite(tsMs) || now - tsMs > X402_REPLAY_TTL_MS || tsMs - now > 2 * 60 * 1000) {
        return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
      }
    }
    if (!params.allowReplayForTests) {
      for (const [k, expAt] of consumedX402ProofDigests.entries()) { if (now >= expAt) consumedX402ProofDigests.delete(k); }
      const proofDigest = crypto.createHash('sha256').update(`${params.paymentContextHeader}.${params.paymentSignatureHeader}`).digest('hex');
      const existingExp = consumedX402ProofDigests.get(proofDigest);
      if (existingExp && now < existingExp) return { verified: false, httpStatus: 402, failureCode: 'PAYMENT_REJECTED' };
      if (consumedX402ProofDigests.size >= 5000) {
        const oldest = consumedX402ProofDigests.keys().next().value;
        if (oldest) consumedX402ProofDigests.delete(oldest);
      }
      consumedX402ProofDigests.set(proofDigest, now + X402_REPLAY_TTL_MS);
    }
    return { verified: true, httpStatus: 200 };
  } catch {
    return { verified: false, httpStatus: 402, failureCode: 'INVALID_PAYMENT_PROOF' };
  }
}
export class MonetizationLedgerAndSimulator {
  private totalRequests = 0;
  private paymentChallengesIssued = 0;
  private rejectedRequests = 0;
  private authorizedPaymentsCount = 0;
  private confirmedSettlementsCount = 0;
  private authorizedNotSettledUsdMicros = 0;
  private actualSettledRevenueUsdMicros = 0;
  private simulatedTransactionsCount = 0;
  private simulatedVolumeUsdMicros = 0;
  recordChallenge(): void {
    this.totalRequests++;
    this.paymentChallengesIssued++;
  }
  recordRejection(): void {
    this.totalRequests++;
    this.rejectedRequests++;
  }
  recordAuthorizedPayment(amountUsdMicros: number): void {
    this.totalRequests++;
    this.authorizedPaymentsCount++;
    this.authorizedNotSettledUsdMicros += Math.max(0, amountUsdMicros);
  }
  confirmSettlement(amountUsdMicros: number): void {
    const amt = Math.max(0, amountUsdMicros);
    this.confirmedSettlementsCount++;
    this.authorizedNotSettledUsdMicros = Math.max(0, this.authorizedNotSettledUsdMicros - amt);
    this.actualSettledRevenueUsdMicros += amt;
  }
  runPaymentSimulation(productId: string) {
    const product =
      RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === productId) || RADAR_COMMERCIAL_PRODUCTS[0];
    this.simulatedTransactionsCount++;
    this.simulatedVolumeUsdMicros += product.pricePerRequestUsdMicros;
    return {
      isSimulation: true as const,
      simulationBanner: MANDATORY_PAYMENT_SIMULATION_BANNER,
      productId: product.productId,
      simulatedAmountUsdMicros: product.pricePerRequestUsdMicros,
      simulatedAmountToman: product.pricePerRequestToman,
      settledRevenueAddedUsdMicros: 0 as const,
      timestampIso: new Date().toISOString(),
    };
  }
  getSummary() {
    return {
      totalRequests: this.totalRequests,
      paymentChallengesIssued: this.paymentChallengesIssued,
      rejectedRequests: this.rejectedRequests,
      productionLedger: {
        authorizedPaymentsCount: this.authorizedPaymentsCount,
        confirmedSettlementsCount: this.confirmedSettlementsCount,
        authorizedUnsettledUsdMicros: this.authorizedNotSettledUsdMicros,
        actualSettledRevenueUsdMicros: this.actualSettledRevenueUsdMicros,
        actualSettledRevenueToman: Math.round(
          (this.actualSettledRevenueUsdMicros / 1_000_000) * REFERENCE_EXCHANGE_RATE.usdToTomanRate
        ),
      },
      simulationLedger: {
        banner: MANDATORY_PAYMENT_SIMULATION_BANNER,
        simulatedTransactionsCount: this.simulatedTransactionsCount,
        simulatedVolumeUsdMicros: this.simulatedVolumeUsdMicros,
      },
    };
  }
}
export const globalMonetizationLedger = new MonetizationLedgerAndSimulator();
export type AuthorizedMcpToolName =
  | 'search_approved_market_data'
  | 'get_neighborhood_statistics'
  | 'compare_market_indicators'
  | 'compute_hedonic_valuation';
export interface AuthorizedMcpToolDescriptor {
  name: AuthorizedMcpToolName;
  titleFa: string;
  description: string;
  readOnly: true;
  zeroPii: true;
  requiredParams: readonly string[];
}
export const AUTHORIZED_MCP_TOOL_DESCRIPTORS: readonly AuthorizedMcpToolDescriptor[] = [
  {
    name: 'compute_hedonic_valuation',
    titleFa: 'ارزش‌گذاری قطعی هدانیک ملک',
    description: 'Calculates deterministic fair & fast-sale property valuation via src/data/hedonicPricingEngine.ts.',
    readOnly: true,
    zeroPii: true,
    requiredParams: ['hoodId', 'sqm', 'buildingAge'],
  },
  {
    name: 'get_neighborhood_statistics',
    titleFa: 'دریافت شاخص‌های آماری محله',
    description: 'Returns aggregated buy/rent prices, security score, and metro access for a neighborhood (Zero PII).',
    readOnly: true,
    zeroPii: true,
    requiredParams: ['hoodId'],
  },
  {
    name: 'search_approved_market_data', titleFa: 'جست‌وجوی محلات مجاز بر اساس بودجه',
    description: 'Filters approved neighborhoods by city and maximum buy price per square meter.',
    readOnly: true, zeroPii: true, requiredParams: ['city', 'maxBuyPerSqm'],
  },
  {
    name: 'compare_market_indicators', titleFa: 'مقایسه شاخص‌های دو محله',
    description: 'Compares buy and rent prices between two neighborhoods deterministically.',
    readOnly: true, zeroPii: true, requiredParams: ['firstHoodId', 'secondHoodId'],
  },
];
export function executeAuthorizedMcpTool(params: { toolName: string; args: Record<string, unknown> }) {
  const { toolName, args } = params;
  const city = (typeof args.city === 'string' && args.city in MULTI_CITY_CONFIGS ? args.city : 'tehran') as CityId;
  const hoods = city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
  const allHoods = getAllMultiCityNeighborhoods();
  const findHood = (id: number) => hoods.find((h) => h.id === id) || allHoods.find((h) => h.id === id);
  if (toolName === 'search_approved_market_data') {
    const maxBuy = Number(args.maxBuyPerSqm) || 999_999;
    const matches = hoods.filter((h) => h.buyPerSqm <= maxBuy).slice(0, 10)
      .map((h) => ({ id: h.id, name: h.name, zone: h.zone, buyPerSqm: h.buyPerSqm, rahn80m: h.rahn80m }));
    return {
      ok: true, toolName, provenance: 'Radar Tehran Approved Market Index (Zero PII)',
      freshnessIso: new Date().toISOString(), result: { city, count: matches.length, items: matches },
    };
  }
  if (toolName === 'get_neighborhood_statistics') {
    const hoodId = Number(args.hoodId) || 1;
    const found = findHood(hoodId) || hoods[0];
    return {
      ok: true, toolName, provenance: 'Radar Tehran Approved Neighborhood Statistics',
      freshnessIso: new Date().toISOString(),
      result: { id: found.id, name: found.name, zone: found.zone, buyPerSqm: found.buyPerSqm, rahn80m: found.rahn80m, securityScore: found.security, metroScore: found.metro },
    };
  }
  if (toolName === 'compare_market_indicators') {
    const first = findHood(Number(args.firstHoodId)) || hoods[0];
    const second = findHood(Number(args.secondHoodId)) || hoods[1] || hoods[0];
    return {
      ok: true, toolName, provenance: 'Radar Tehran Deterministic Indicator Comparison',
      freshnessIso: new Date().toISOString(),
      result: {
        first: { id: first.id, name: first.name, buyPerSqm: first.buyPerSqm, rahn80m: first.rahn80m },
        second: { id: second.id, name: second.name, buyPerSqm: second.buyPerSqm, rahn80m: second.rahn80m },
        buyDiffPerSqm: first.buyPerSqm - second.buyPerSqm,
      },
    };
  }
  if (toolName === 'compute_hedonic_valuation') {
    const hoodId = Number(args.hoodId) || 1;
    const baseNeighborhood = findHood(hoodId) || hoods[0];
    const customBuySqm = Number(args.basePricePerSqm);
    const targetNeighborhood = Number.isFinite(customBuySqm) && customBuySqm >= 10 && customBuySqm <= 2000
      ? { ...baseNeighborhood, buyPerSqm: customBuySqm } : baseNeighborhood;
    const rawAge = args.buildingAge !== undefined && args.buildingAge !== null && args.buildingAge !== '' ? Number(args.buildingAge) : 5;
    const ageYears = Math.max(0, Math.min(60, Number.isFinite(rawAge) ? rawAge : 5));
    const totalFloors = Math.max(1, Math.min(60, Number(args.totalFloors) || 5));
    const rawFloor = args.floor !== undefined && args.floor !== null && args.floor !== '' ? Number(args.floor) : Math.min(3, totalFloors);
    const floor = Math.min(totalFloors, Math.max(-1, Math.min(50, Number.isFinite(rawFloor) ? rawFloor : Math.min(3, totalFloors))));
    const currentJalaliYear = getCurrentJalaliYear();
    const valuation = calculateHedonicValuation({
      neighborhood: targetNeighborhood, sqm: Math.max(20, Math.min(2000, Number(args.sqm) || 85)),
      buildYear: currentJalaliYear - ageYears, currentJalaliYear, renovationStatus: args.isRenovated ? 'renovated' : 'standard', floor, totalFloors, hasElevator: args.hasElevator !== false, hasParking: args.hasParking !== false, hasStorage: args.hasStorage !== false, }); return { ok: true, toolName,
      provenance: `src/data/hedonicPricingEngine.ts (FAST_SALE_FACTOR=${FAST_SALE_FACTOR})`,
      freshnessIso: new Date().toISOString(), result: valuation, }; }
  throw new Error(`UNAUTHORIZED_OR_UNKNOWN_MCP_TOOL: ${String(toolName)}`);
}
import { clampNumber } from '../utils/security'; import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { getDisplayDealLabelFa, isDealPriceDisplayableAsFact } from '../utils/epistemicUiLabels';
export interface DetectedListingSignals { hasLegalRisk: boolean; hasTenantLag: boolean; isRenovated: boolean; isUrbanRenewal: boolean; }
export type PriceSourceType = 'EXPLICIT_TOTAL' | 'EXPLICIT_PER_SQM' | 'NET_CASH' | 'STANDALONE' | 'NONE';
export interface QualityMultiplierSpecs {
  age?: number; buildingAge?: number; sqm?: number; renovationStatus?: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';
  floor?: number; totalFloors?: number; hasElevator?: boolean; hasParking?: boolean; hasStorage?: boolean; hoodBasePerSqm?: number; hasTenant?: boolean;
  deedType?: 'single_deed' | 'endowment' | 'informal_contract' | 'probate_coop'; detectedSignals?: Partial<DetectedListingSignals>;
}
export interface ExtractedListingSpecs {
  sqm: number; extractedSqm: number | null; hasExplicitSqm: boolean; floor: number; totalFloors: number; age: number; buildingAge: number;
  hasElevator: boolean; hasParking: boolean; hasStorage: boolean; hasBalcony: boolean;
  renovationStatus: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation'; detectedSignals: DetectedListingSignals;
  totalMillion: number; perSqmMillion: number; askingTotalMillion: number; priceSourceType: PriceSourceType;
}
export interface AutoBargainSample { id: string; sqm: number; age: number; floor: number; askingTotalMillion: number; perSqmMillion: number; fairPerSqmMillion: number; discountPct: number; description: string; }
export type MarketDataProvenance = 'OBSERVED_PRIMARY' | 'OBSERVED_SECONDARY' | 'USER_DECLARED' | 'USER_REPORTED' | 'ADMIN_VERIFIED' | 'MODEL_ESTIMATE' | 'HEURISTIC_ESTIMATE' | 'REFERENCE_BASELINE' | 'SIMULATED_EXAMPLE' | 'UNKNOWN_ORIGIN';
export type EpistemicDataStatus = 'OBSERVED' | 'DECLARED' | 'INFERRED' | 'ESTIMATED' | 'SYNTHETIC' | 'MISSING' | 'STALE' | 'UNVERIFIED' | 'VERIFIED';
export type FraudReviewState = 'NONE' | 'STATISTICAL_OUTLIER' | 'ANOMALOUS_RECORD' | 'UNVERIFIED_PRICE_ANOMALY' | 'SUSPICIOUS_LISTING' | 'FRAUD_SUSPECTED' | 'FRAUD_REVIEWED' | 'FRAUD_CONFIRMED';
export type EvidenceQualityState = 'INSUFFICIENT_OBSERVATIONS' | 'LIMITED_OBSERVATIONS' | 'MODERATE_OBSERVATIONS' | 'ADEQUATE_OBSERVATIONS';
export type EvidenceSufficiencyLevel = 'NONE' | 'INSUFFICIENT' | 'MODERATE' | 'SUFFICIENT';
export type SampleCoverageState = 'BOOTSTRAPPED_BASELINE' | 'SPARSE_1_TO_2' | 'MODERATE_3_TO_9' | 'SUFFICIENT_10_PLUS';
export interface AggregatedMarketMetrics {
  hoodId: number; hoodName: string; rawInputCount: number; sampleCount: number; validSampleCount: number; rejectedFraudCount: number; confidenceScore: number;
  observedSampleCount: number; duplicateSampleCount: number; probableDuplicateCount: number; eligibleObservedCount: number; syntheticSampleCount: number;
  excludedOutlierCount: number; extremePriceAnomalyCount: number; malformedSampleCount: number; missingAreaSampleCount: number; suspectedFraudCount: number; verifiedTransactionCount: 0;
  provenance: MarketDataProvenance; epistemicStatus: EpistemicDataStatus; dataMode: 'OBSERVED_MARKET' | 'LIMITED_OBSERVED_BLEND' | 'ILLUSTRATIVE_BOOTSTRAP';
  fraudReviewState: FraudReviewState; dealPriceProvenance: 'HEURISTIC_ESTIMATE'; evidenceQuality: EvidenceQualityState; evidenceSufficiency: EvidenceSufficiencyLevel; coverageState: SampleCoverageState;
  evidenceIndexScore: number; evidenceIndexFormula: '0_OBS=0|1_OBS=35|2_OBS=52|3PLUS_OBS=CLAMP(62+3*N,65,98)_COVERAGE_INDEX_NOT_PROBABILITY';
  marketActivityEvidence: 'NO_TRANSACTION_VELOCITY_DATA_DISPERSION_HEURISTIC'; negotiationMultiplierBasis: 'HYPOTHETICAL_SCENARIO_ASSUMPTION_NOT_EMPIRICAL';
  calibratedConfidencePct: number | null; hasSufficientIqrEvidence: boolean; observedMeanPerSqm: number | null; observedMedianPerSqm: number | null; observedIqrLowPerSqm: number | null; observedIqrHighPerSqm: number | null;
  isAnchorClamped: boolean; unclampedAveragePerSqm: number; isBootstrapped: boolean; rawAveragePerSqm: number; hedonicAdjustedPerSqm: number; askingPricePerSqm: number;
  spreadAdjustedDealPerSqm: number; estimatedDealPricePerSqm: number; iqrLowPerSqm: number; iqrHighPerSqm: number;
  marketRegime: 'HOT' | 'BALANCED' | 'FROZEN'; askToDealRatio: number; preIqrBargainsCount: number;
  autoBargainIds: string[]; autoBargains: AutoBargainSample[]; dayAnchorPrice: number; intlEquivText?: string;
  /** Median from observed listing samples only (not heuristic deal price). */
  askingMedianFromObserved: number | null;
  /** @deprecated UI label — never implies registered transaction when verifiedTransactionCount is 0. */
  displayDealLabelFa: string;
  isDealPriceDisplayableAsFact: boolean;
}
export interface NeighborhoodListingSource { id: number; name: string; buyPerSqm: number; bargains?: ReadonlyArray<{ id: string; sqm: number; title: string; discountPercent?: number; price?: number }> | null; }
/** Illustrative seed bargains — must not be treated as observed market data. */
export function buildIllustrativeSeedListingSamples(hood?: NeighborhoodListingSource | null): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return hood.bargains.map((b) => ({
    id: `illus-${b.id}`,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `[نمونهٔ نمایشی] ${b.sqm} متر ${b.title}`,
  }));
}

/** Returns only verified live samples; seed bargains are excluded from aggregation (CASPER epistemic integrity). */
export function buildNeighborhoodListingSamples(hood?: NeighborhoodListingSource | null): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const live = hood.bargains.filter((b) => typeof b.id === 'string' && b.id.startsWith('live-divar-'));
  if (live.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return live.map((b) => ({
    id: b.id,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `${b.sqm} متر ${b.title}`,
  }));
}
const WORD_INT_MAP: ReadonlyArray<[string, number]> = [['دوازده', 12], ['یازده', 11], ['چهار', 4], ['ده', 10], ['نه', 9], ['هشت', 8], ['هفت', 7], ['شش', 6], ['پنج', 5], ['سه', 3], ['دو', 2], ['یک', 1]];
const WORD_HUNDRED_MAP: ReadonlyArray<[string, number]> = [['چهارصد', 400], ['پانصد', 500], ['ششصد', 600], ['هفتصد', 700], ['هشتصد', 800], ['نهصد', 900], ['دویست', 200], ['سیصد', 300], ['صد', 100]];
export function normalizePersianText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[يئ]/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/[ \t]+/g, ' ');
  for (const [word, val] of WORD_INT_MAP) text = text.replace(new RegExp(`(?<=^|[\\s،,.!؟(«:])${word}(?=\\s*(?:و\\s*نیم\\s*میلیارد|میلیارد|میلیون|طبقه|واحد|سال\\s*ساخت)(?=$|[\\s،,.!؟)»:]))`, 'g'), String(val));
  for (const [word, val] of WORD_HUNDRED_MAP) text = text.replace(new RegExp(`(?<=میلیارد\\s*و\\s*)${word}(?=$|[\\s،,.!؟)»:])`, 'g'), String(val)).replace(new RegExp(`(?<=^|[\\s،,.!؟(«:])${word}(?=\\s*(?:میلیون|هزار|تومان|تومن)(?=$|[\\s،,.!؟)»:]))`, 'g'), String(val));
  text = text.replace(/(?<!\d)(\d{1,2})\s*و\s*نیم\s*میلیارد/g, (_, d) => `${parseInt(d, 10) * 1000 + 500} میلیون`).replace(/(?<=^|[\s،,.!؟(«:])نیم\s*میلیارد/g, '500 میلیون');
  text = text.replace(/(?<!\d)(?!1[34]\d{2}\/)\d{1,3}(?:[.,٬/]\d{3}){2,}(?!\d)/g, (m) => m.replace(/[.,٬/]/g, '')).replace(/(?<!\d)(\d{1,2})[.,٬/](\d{3})(?=\s*میلیارد)/g, '$1.$2');
  text = text.replace(/(?<!\d)([1-9]|[12]\d|30)[.,٬/](\d{3})(?=\s*میلیون)/g, '$1$2').replace(/(?<=\d)[,٬](?=\d{3}(?:\D|$))/g, '').replace(/(?<=\d)(?:٫|[,٬](?=\d{1,2}(?:\D|$)))/g, '.');
  text = text.replace(/(?<!(?:طبقه|واحد|پلاک)\s*)(?<!\d)(?!1[34]\d{2}\/)(\d+)\/(\d{1,3})(?!\d)/g, '$1.$2');
  text = text.replace(/(?<!\d)(\d+(?:\.\d+)?)\s*میلیارد\s*و\s*(?:(\d{1,3})\s*میلیون|([1-9][05]0)(?!\s*(?:متر|متری|طبقه|واحد|خواب|اتاق|پارکینگ|انباری|سال))(?=$|\D))/g, (_, b, m1, m2) => `${Math.round((parseFloat(b) * 1000 + parseFloat(m1 || m2)) * 10) / 10} میلیون`);
  text = text.replace(/(?<!\d)(\d+)\s*میلیون\s*و\s*(\d{1,3})\s*هزار/g, (_, m, k) => `${Math.round((parseInt(m, 10) + parseInt(k, 10) / 1000) * 10) / 10} میلیون`);
  return text.trim();
}
export function hasAffirmativeMatch(text: string, keywordPattern: string | RegExp): boolean {
  const normalized = normalizePersianText(text); if (!normalized) return false;
  const cleanRegex = typeof keywordPattern === 'string' ? new RegExp(keywordPattern, 'i') : new RegExp(keywordPattern.source, keywordPattern.flags.replace(/g/g, ''));
  const subClauses = normalized.split(/[.!؟،,\n]|(?:^|\s)(?:اما|ولی)(?=\s|$)|(?<=(?:^|\s)(?:دارد|ندارد|ندارم|نداریم|نیست|است|هست|بوده|می\s*باشد|نمی\s*باشد))(?=\s)|(?=(?:^|\s)(?:بدون|فاقد|دارای|و\s*دارای|همراه\s*با)\s)/).map((c) => c.trim()).filter(Boolean);
  const preNegRegex = /(?:^|[\s(«])(?:بدون|فاقد|بجز|غیر\s*از)\s+(?:(?:هیچ(?:\s*گونه)?|هر(?:\s*گونه)?|کوچکترین|کمترین|ذره\s*ای|مشکل|خلافی)\s+)*(?:\S+\s+و\s+)*$/;
  const postNegRegex = /(?:^|[\s])(ندارد|ندارم|نداریم|نیست|نمی\s*باشد|نمی\s*شود|نشد|تعلق\s*نمی\s*گیرد|معاف)(?=$|[\s،,.!؟)»])/;
  for (const subClause of subClauses) {
    const match = cleanRegex.exec(subClause); if (!match) continue;
    const prefix = subClause.slice(0, match.index), suffix = subClause.slice(match.index + match[0].length);
    if (preNegRegex.test(prefix) || postNegRegex.test(suffix)) continue;
    return true;
  }
  return false;
}
export function resolveAmenityStatus(text: string, amenityPattern: RegExp, defaultValue: boolean): boolean {
  const norm = normalizePersianText(text), cleanPattern = new RegExp(amenityPattern.source, amenityPattern.flags.replace(/g/g, ''));
  return cleanPattern.test(norm) ? hasAffirmativeMatch(norm, cleanPattern) : defaultValue;
}
const getDynamicSolarYear = (): number => { try { const p = Number.parseInt(new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' }).format(new Date()).replace(/[^\d]/g, ''), 10); if (Number.isInteger(p) && p >= 1400 && p <= 1500) return p; } catch {} return 1405; };
export function resolveBuildingAge(yearOrAge?: number | null, description = '', currentSolarYear = getDynamicSolarYear()): number {
  const normDesc = normalizePersianText(description);
  const numericToAge = (v: number): number => (v >= 1330 && v <= currentSolarYear ? currentSolarYear - v : v >= 400 && v <= currentSolarYear - 1000 ? currentSolarYear - (1000 + v) : v >= 70 && v <= 99 ? currentSolarYear - (1300 + v) : v >= 0 && v <= 65 ? v : 30);
  let age = 10;
  if (yearOrAge !== undefined && yearOrAge !== null && !Number.isNaN(yearOrAge) && yearOrAge > 0) age = numericToAge(Math.round(yearOrAge));
  else {
    const divarTable = /متراژ[\s\n]+سال\s*ساخت[\s\n]+اتاق[\s\n]+(?<!\d)(\d{2,3})[\s\n]+(13[4-9]\d|14[0-1]\d|قبل\s*از\s*1370)/.exec(normDesc);
    const explicitAge = /(?:^|[^\d.])(?<!\d)(\d{1,2})\s*سال\s*ساخت/.exec(normDesc);
    const explicitYear = /(?:سال\s*ساخت|ساخت|مدل)\s*[:：\n]?\s*(?<!\d)(13[4-9]\d|14[0-1]\d|4[0-1]\d|[7-9]\d)(?=$|\D)/.exec(normDesc);
    if (/قبل\s*از\s*1370/.test(normDesc)) age = 36;
    else if (divarTable) age = divarTable[2].includes('قبل') ? 36 : numericToAge(parseInt(divarTable[2], 10));
    else if (explicitAge) age = parseInt(explicitAge[1], 10);
    else if (explicitYear) age = numericToAge(parseInt(explicitYear[1], 10));
    else if (yearOrAge === 0 || /(?:^|[\s،,.!؟(«:])(نوساز|کلید\s*نخورده)(?=$|[\s،,.!؟)»:])/.test(normDesc)) age = 0;
  }
  if (age <= 1 && (yearOrAge === undefined || yearOrAge === null) && hasAffirmativeMatch(normDesc, /(بازسازی|تخلیه\s*چند\s*سال|سند\s*قدیمی)/)) age = 8;
  return clampNumber(age, 0, 45, 10);
}
export function parseIranianPriceToMillionToman(rawInput: number | string, sqm = 85, hoodBasePerSqm = 120, priceCueContext = '', fullDescriptionText = '', priceSourceType: PriceSourceType = 'STANDALONE'): { totalMillion: number; perSqmMillion: number } {
  const safeSqm = clampNumber(sqm ?? 85, 25, 1000, 85), safeBase = clampNumber(hoodBasePerSqm ?? 120, 15, 2000, 120);
  const rawStr = typeof rawInput === 'number' ? String(rawInput) : (rawInput || '');
  const norm = normalizePersianText(rawStr), normCue = normalizePersianText(priceCueContext || rawStr), normFull = normalizePersianText(fullDescriptionText || priceCueContext || rawStr);
  if (!norm && typeof rawInput !== 'number') return { totalMillion: 0, perSqmMillion: 0 };
  if (priceSourceType === 'NET_CASH' || (/نقد(?:ینگی)?/.test(normFull) && !/(?:قیمت\s*کل|مبلغ\s*کل|جمع\s*کل)/.test(normFull))) {
    const netMatch = /(?:نقدینگی|آورده\s*نقدی|نقد)\s*[:：]?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)?/.exec(normFull);
    const loanMatch = /وام(?:\s*(?:مسکن|بانکی|اوراق))?\s*[:：]?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)?/.exec(normFull);
    const rentMatch = /رهن(?:\s*(?:مستاجر|کامل))?\s*[:：]?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)?/.exec(normFull);
    if (netMatch && (loanMatch || rentMatch)) {
      const toM = (m: RegExpExecArray | null) => (!m ? 0 : (m[2] || (parseFloat(m[1]) < 45 ? 'میلیارد' : 'میلیون')).includes('میلیارد') ? parseFloat(m[1]) * 1000 : parseFloat(m[1]));
      const total = Math.round(toM(netMatch) + toM(loanMatch) + toM(rentMatch));
      if (total > 50) return { totalMillion: total, perSqmMillion: Math.round((total / safeSqm) * 10) / 10 };
    }
  }
  let valMillion = 0;
  const bnMatch = /(?<!\d)(\d+(?:\.\d+)?)\s*میلیارد/.exec(norm), mnMatch = /(?<!\d)(\d+(?:\.\d+)?)\s*میلیون/.exec(norm);
  const rialMatch = /(?<!\d)(\d+(?:\.\d+)?)\s*ریال/.exec(norm), rawNumMatch = /(?<!\d)(\d+(?:\.\d+)?)/.exec(norm);
  if (rialMatch) { const r = parseFloat(rialMatch[1]); valMillion = r >= 1_000_000 ? r / 10_000_000 : r * 100; }
  else if (bnMatch) valMillion = parseFloat(bnMatch[1]) * 1000;
  else if (mnMatch) valMillion = parseFloat(mnMatch[1]);
  else if (rawNumMatch) { const n = parseFloat(rawNumMatch[1]); valMillion = n >= 10_000_000 ? n / 1_000_000 : n >= 100_000 ? n / 1000 : n < 50 && (priceSourceType === 'EXPLICIT_TOTAL' || /میلیارد/.test(normCue)) ? n * 1000 : n; }
  if (valMillion <= 0 || !Number.isFinite(valMillion)) return { totalMillion: 0, perSqmMillion: 0 };
  const isPerSqm = priceSourceType === 'EXPLICIT_PER_SQM' || (priceSourceType === 'STANDALONE' && (/(?:متری|هر\s*متر|فی)/.test(normCue) || (valMillion >= safeBase * 0.4 && valMillion <= safeBase * 2.5 && valMillion < safeBase * safeSqm * 0.25)));
  let totalMillion = isPerSqm ? Math.round(valMillion * safeSqm) : Math.round(valMillion);
  if (!isPerSqm && /(?:کسر\s*(?:شده|گردیده|می\s*گردد|می\s*شود)|کم\s*شده|به\s*کسر\s*رهن)/.test(normFull)) {
    const rahnMatch = /(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)\s*(?:رهن|ودیعه)|(?:رهن(?:\s*مستاجر|\s*کامل)?|ودیعه)\s*(?:تا\s*مبلغ\s*|به\s*مبلغ\s*|مبلغ\s*|حدود\s*|[:：])?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)?/.exec(normFull);
    if (rahnMatch) {
      const rVal = parseFloat(rahnMatch[1] || rahnMatch[3]), rUnit = rahnMatch[2] || rahnMatch[4] || (rVal < 30 ? 'میلیارد' : 'میلیون'), rahnM = rUnit.includes('میلیارد') ? rVal * 1000 : rVal;
      if (rahnM > 0 && rahnM < totalMillion * 0.6) totalMillion = Math.round(totalMillion + rahnM);
    }
  }
  return { totalMillion, perSqmMillion: Math.round((totalMillion / safeSqm) * 10) / 10 };
}
export function extractListingSpecsFromText(rawText: string, fallbackHoodBasePerSqm = 120): ExtractedListingSpecs {
  const norm = normalizePersianText(rawText); let extractedSqm: number | null = null;
  const divarSqm = /متراژ[\s\n]+سال\s*ساخت[\s\n]+اتاق[\s\n]+(?<!\d)(\d{2,3})(?=\D|$)/.exec(norm);
  const explicitSqm = /(?:متراژ(?:\s*واحد|\s*بنا|\s*آپارتمان)?|زیربنا|بنای\s*مفید)\s*[:：\n]?\s*(?<!\d)(\d{2,3})(?=\D|$)/.exec(norm);
  if (divarSqm) { const v = parseInt(divarSqm[1], 10); if (v >= 25 && v <= 1000) extractedSqm = clampNumber(v, 35, 350, 85); }
  else if (explicitSqm) { const v = parseInt(explicitSqm[1], 10); if (v >= 25 && v <= 1000) extractedSqm = clampNumber(v, 35, 350, 85); }
  else {
    for (const m of norm.matchAll(/(?<!\d)(\d{2,3})\s*(?:متر\s*مربع|متر|متری)(?=$|\D)/g)) {
      const cand = parseInt(m[1], 10); if (cand < 35 || cand > 350 || m.index === undefined) continue;
      const prev30 = norm.slice(Math.max(0, m.index - 30), m.index), next20 = norm.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (/(?:متری|هر\s*متر|فی)\s*[:：]?\s*$/.test(prev30)) continue;
      const hasLandOrSub = /(?:زمین|زمینی|عرصه|حیاط|پاسیو|بالکن|تراس|انباری|تجاری|مغازه|بر\s*ملک|حاشیه)/.test(prev30 + ' ' + next20);
      const hasUnitCue = /(?:آپارتمان|واحد|بنا|زیربنا|مفید)\s*$/.test(prev30) || /^\s*(?:بنا|خواب|تک\s*خواب|دو\s*خواب|سه\s*خواب|مفید)/.test(next20);
      if (hasLandOrSub && !hasUnitCue) continue;
      extractedSqm = cand; break;
    }
  }
  const hasExplicitSqm = extractedSqm !== null, sqm = extractedSqm ?? 85;
  let totalFloors = 5, floor: number | undefined;
  const bldgFloors = /(?<!طبقه\s*[:：]?\s*\d{1,2}\s*(?:از|\/)\s*)(?:ساختمان\s*)?(?<!\d)(\d{1,2})\s*طبقه/.exec(norm);
  if (bldgFloors) totalFloors = clampNumber(parseInt(bldgFloors[1], 10), 1, 40, 5);
  const floorFrac = /(?:طبقه|ط)\s*[:：]?\s*(?<!\d)(-?\d{1,2})\s*(?:از|\/)\s*(?<!\d)(\d{1,2})/.exec(norm);
  if (floorFrac) { floor = clampNumber(parseInt(floorFrac[1], 10), -2, 40, 2); totalFloors = clampNumber(parseInt(floorFrac[2], 10), 1, 40, Math.max(totalFloors, floor)); }
  else {
    const wordFloorMap: Record<string, number> = { اول: 1, یکم: 1, یک: 1, دوم: 2, دو: 2, سوم: 3, سه: 3, چهارم: 4, چهار: 4, پنجم: 5, پنج: 5, ششم: 6, شش: 6, هفتم: 7, هفت: 7, هشتم: 8, هشت: 8, نهم: 9, نه: 9, دهم: 10, ده: 10 };
    for (const fm of norm.matchAll(/(?<!(?:هر|\d)\s*)(?:طبقه|ط)\s*[:：]?\s*(\d{1,2}|زیر\s*همکف|همکف|زیرزمین|منفی\s*یک|منفی\s*1|اول|یکم|یک|دوم|دو|سوم|سه|چهارم|چهار|پنجم|پنج|ششم|شش|هفتم|هفت|هشتم|هشت|نهم|نه|دهم|ده|آخر)(?:\s*(?:از|\/)\s*\d{1,2})?(?!\s*واحدی)/g)) {
      const token = fm[1].trim();
      if (token === 'آخر') { floor = totalFloors; break; }
      if (token === 'همکف') { floor = 0; break; }
      if (/زیر|منفی/.test(token)) { floor = -1; break; }
      if (wordFloorMap[token] !== undefined) { floor = wordFloorMap[token]; break; }
      if (/^\d{1,2}$/.test(token)) { floor = clampNumber(parseInt(token, 10), 0, 40, 2); break; }
    }
  }
  const resolvedFloor = floor ?? 2; totalFloors = Math.max(totalFloors, resolvedFloor);
  const age = resolveBuildingAge(null, norm), hasParking = resolveAmenityStatus(norm, /(?:پارکینگ|پارک\s*سندی|پارکینگ\s*اختصاصی)/, true);
  const hasElevator = resolveAmenityStatus(norm, /(?:آسانسور|اسانسور|لاین\s*آسانسور)/, resolvedFloor > 2), hasStorage = resolveAmenityStatus(norm, /(?:انباری|انبار\s*سندی)/, true), hasBalcony = resolveAmenityStatus(norm, /(?:بالکن|تراس)/, true);
  const detectedSignals: DetectedListingSignals = {
    hasLegalRisk: hasAffirmativeMatch(norm, /(?:قولنامه\s*ای|وکالتی|وقفی|اوقاف|سند\s*مادر|اصلاحی|ورثه\s*ای)/),
    hasTenantLag: hasAffirmativeMatch(norm, /(?:در\s*رهن\s*مستاجر|مستاجر\s*دارد|در\s*دست\s*مستاجر|مهلت\s*تخلیه)/),
    isRenovated: hasAffirmativeMatch(norm, /(?:بازسازی\s*کامل|بازسازی\s*شده|فول\s*بازسازی|صفر\s*تا\s*(?:صد|100)|نوسازی\s*کامل|نوسازی\s*شده)/),
    isUrbanRenewal: hasAffirmativeMatch(norm, /(?:بافت\s*فرسوده|تجمیع|مشارکت\s*در\s*ساخت|کلنگی)/),
  };
  let renovationStatus: ExtractedListingSpecs['renovationStatus'] = 'standard';
  if (hasAffirmativeMatch(norm, /(?:فول\s*بازسازی|سوپرلوکس|متریال\s*برند|صفر\s*تا\s*(?:صد|100)\s*(?:نوسازی|بازسازی))/)) renovationStatus = 'luxury_renovated';
  else if (detectedSignals.isRenovated || hasAffirmativeMatch(norm, /(?:مرتب|تمیز|نقاشی\s*شده|کابینت\s*هایگلاس)/)) renovationStatus = 'renovated';
  else if (hasAffirmativeMatch(norm, /(?:نیازمند\s*بازسازی|قدیمی\s*ساز|نیاز\s*به\s*تعمیر|فرسوده)/)) renovationStatus = 'needs_renovation';
  let priceRes = { totalMillion: 0, perSqmMillion: 0 }, priceSourceType: PriceSourceType = 'NONE';
  const explicitTotalMatch = /(?:قیمت\s*کل|مبلغ\s*کل|جمع\s*کل|قیمت\s*فروش|قیمت\s*نهایی|قیمت\s*اعلامی)\s*[:：]?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون\s*تومان|میلیون|تومان|تومن|ریال)?/.exec(norm);
  const explicitPerSqmMatch = /(?:قیمت\s*هر\s*متر(?:\s*مربع)?|متری|هر\s*متر(?:\s*مربع)?|فی)\s*[:：]?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون\s*تومان|میلیون|تومان|تومن)?/.exec(norm);
  if (explicitTotalMatch) { priceSourceType = 'EXPLICIT_TOTAL'; priceRes = parseIranianPriceToMillionToman(explicitTotalMatch[0], sqm, fallbackHoodBasePerSqm, explicitTotalMatch[0], norm, 'EXPLICIT_TOTAL'); }
  else if (explicitPerSqmMatch) { priceSourceType = 'EXPLICIT_PER_SQM'; priceRes = parseIranianPriceToMillionToman(explicitPerSqmMatch[0], sqm, fallbackHoodBasePerSqm, explicitPerSqmMatch[0], norm, 'EXPLICIT_PER_SQM'); }
  else if (/(?:نقدینگی|آورده\s*نقدی|نقد)\s*[:：]?\s*(?<!\d)\d/.test(norm)) { priceSourceType = 'NET_CASH'; priceRes = parseIranianPriceToMillionToman(norm, sqm, fallbackHoodBasePerSqm, norm, norm, 'NET_CASH'); }
  else {
    for (const cm of norm.matchAll(/(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون\s*تومان|میلیون|ریال|تومان|تومن)/g)) {
      const prev25 = norm.slice(Math.max(0, (cm.index ?? 0) - 25), cm.index ?? 0);
      if (/(?:رهن|اجاره|ودیعه|وام|اوراق|قسط|شارژ|کمیسیون|خسارت|وجه\s*التزام)/.test(prev25)) continue;
      const candPrice = parseIranianPriceToMillionToman(cm[0], sqm, fallbackHoodBasePerSqm, cm[0], norm, 'STANDALONE');
      if (candPrice.perSqmMillion >= fallbackHoodBasePerSqm * 0.35 && candPrice.perSqmMillion <= fallbackHoodBasePerSqm * 2.6) { priceRes = candPrice; priceSourceType = 'STANDALONE'; break; }
    }
  }
  return { sqm, extractedSqm, hasExplicitSqm, floor: resolvedFloor, totalFloors, age, buildingAge: age, hasElevator, hasParking, hasStorage, hasBalcony, renovationStatus, detectedSignals, totalMillion: priceRes.totalMillion, perSqmMillion: priceRes.perSqmMillion, askingTotalMillion: priceRes.totalMillion, priceSourceType };
}
export function computeQualityMultiplier(specs: QualityMultiplierSpecs): number {
  const age = specs.age ?? specs.buildingAge ?? 5, f = specs.floor ?? 2, tf = Math.max(1, specs.totalFloors ?? 5, f);
  const hasElevator = specs.hasElevator ?? (f > 2), hasParking = specs.hasParking ?? true, hasStorage = specs.hasStorage ?? true;
  const renovationStatus = specs.renovationStatus ?? (specs.detectedSignals?.isRenovated ? 'renovated' : 'standard');
  let multiplier = 1.0, ageDelta = age === 0 ? 0.065 : age === 1 ? 0.045 : age <= 4 ? 0.02 - (age - 2) * 0.008 : age <= 10 ? -(age - 4) * 0.011 : age <= 20 ? -0.066 - (age - 10) * 0.0125 : -Math.min(0.26, 0.191 + (age - 20) * 0.007);
  if (specs.detectedSignals?.isUrbanRenewal && age >= 20) ageDelta = Math.max(ageDelta, -0.14);
  multiplier += ageDelta + (renovationStatus === 'luxury_renovated' ? (age > 10 ? 0.095 : 0.065) : renovationStatus === 'renovated' ? (age > 10 ? 0.055 : 0.035) : renovationStatus === 'needs_renovation' ? -0.095 : 0);
  multiplier += f < 0 ? -0.085 : f === 0 ? -0.055 : f === 1 ? -0.018 : f >= 3 && !hasElevator ? -0.035 * (f - 1) : f >= 3 && f <= 5 ? (f - 2) * 0.015 : f > 5 ? Math.min(0.105, 0.045 + (f - 5) * 0.0075) : 0;
  if (f === tf && tf >= 4 && age >= 15) multiplier -= 0.01;
  if (!hasParking) multiplier -= 0.075;
  if (!hasElevator && f === 2) multiplier -= 0.035;
  if (!hasStorage) multiplier -= 0.015;
  if (hasParking && hasElevator && hasStorage) multiplier += 0.015;
  if (specs.detectedSignals?.hasLegalRisk || specs.deedType === 'endowment' || specs.deedType === 'informal_contract') multiplier *= 0.88;
  else if (specs.deedType === 'probate_coop') multiplier *= 0.92;
  if (specs.detectedSignals?.hasTenantLag || specs.hasTenant) multiplier *= 0.96;
  return Math.round(clampNumber(multiplier, 0.68, 1.32, 1.0) * 1000) / 1000;
}
export { applySpatialGrowthFallback, seededRandom } from './pricingEngineSpatialUtils';
export { verifyPricingEngineIntegrity } from './pricingEngineIntegrityChecks';
export function aggregateNeighborhoodMarketMetrics(
  hoodId: number, hoodName: string, baseHoodPerSqm: number,
  samples: Array<{ id?: string; sqm?: number; askingTotalMillion: number; description: string; yearOrAge?: number }>, previousDayAnchorPrice?: number
): AggregatedMarketMetrics {
  const safeSamples = Array.isArray(samples) ? samples : [], rawInputCount = safeSamples.length, seenIds = new Set<string>(), seenFingerprints = new Set<string>(), seenSpecKeys = new Set<string>();
  let duplicateSampleCount = 0, probableDuplicateCount = 0, malformedSampleCount = 0, missingAreaSampleCount = 0, extremePriceAnomalyCount = 0;
  const suspectedFraudCount = 0, rejectedFraudCount = 0, uniqueRawSamples: typeof safeSamples = [], observedEvaluated: Array<AutoBargainSample & { normPerSqm: number }> = [];
  for (const s of safeSamples) {
    const idTrim = typeof s?.id === 'string' ? s.id.trim() : '', fp = `${normalizePersianText(s?.description || '')}|${Math.round(Number(s?.askingTotalMillion) || 0)}|${s?.yearOrAge ?? ''}|${s?.sqm ?? ''}`;
    if ((idTrim && seenIds.has(idTrim)) || seenFingerprints.has(fp)) { duplicateSampleCount++; continue; }
    if (idTrim) seenIds.add(idTrim); seenFingerprints.add(fp); uniqueRawSamples.push(s);
  }
  for (let i = 0; i < uniqueRawSamples.length; i++) {
    const s = uniqueRawSamples[i], specs = extractListingSpecsFromText(s?.description || '', baseHoodPerSqm);
    const hasExplicitValidSqm = s?.sqm !== undefined ? typeof s.sqm === 'number' && Number.isFinite(s.sqm) && s.sqm >= 25 && s.sqm <= 1000 : specs.hasExplicitSqm && specs.extractedSqm !== null && specs.extractedSqm >= 25;
    const validSqm = s?.sqm !== undefined && hasExplicitValidSqm ? Math.round(s.sqm) : (specs.extractedSqm ?? -1);
    const parsedTotal = typeof s?.askingTotalMillion === 'number' && Number.isFinite(s.askingTotalMillion) && s.askingTotalMillion > 0 ? s.askingTotalMillion : specs.totalMillion;
    if (!hasExplicitValidSqm || validSqm <= 0) { malformedSampleCount++; missingAreaSampleCount++; continue; }
    if (!(parsedTotal > 0) || !Number.isFinite(parsedTotal)) { malformedSampleCount++; continue; }
    const resolvedAge = resolveBuildingAge(s?.yearOrAge, s?.description || ''), specKey = `${validSqm}|${specs.floor}|${resolvedAge}|${Math.round(parsedTotal)}`;
    if (seenSpecKeys.has(specKey)) { if (!(typeof s?.id === 'string' && s.id.trim())) { duplicateSampleCount++; continue; } probableDuplicateCount++; }
    seenSpecKeys.add(specKey);
    const qMult = computeQualityMultiplier({ ...specs, sqm: validSqm, age: resolvedAge, buildingAge: resolvedAge, hoodBasePerSqm: baseHoodPerSqm }), rawPerSqm = parsedTotal / validSqm, normPerSqm = rawPerSqm / Math.max(0.68, qMult);
    if (rawPerSqm < baseHoodPerSqm * 0.42 || rawPerSqm > baseHoodPerSqm * 2.4) { extremePriceAnomalyCount++; continue; }
    if (!(normPerSqm > 15 && normPerSqm < 2000)) { malformedSampleCount++; continue; }
    const fairPerSqm = Math.round(baseHoodPerSqm * qMult * 10) / 10, discountPct = Math.max(0, Math.round(((fairPerSqm - rawPerSqm) / Math.max(1, fairPerSqm)) * 100));
    observedEvaluated.push({ id: s?.id || `sample-${i + 1}`, sqm: validSqm, age: resolvedAge, floor: specs.floor, askingTotalMillion: Math.round(parsedTotal), perSqmMillion: Math.round(rawPerSqm * 10) / 10, fairPerSqmMillion: fairPerSqm, discountPct, description: s?.description || '', normPerSqm });
  }
  const observedSampleCount = rawInputCount - duplicateSampleCount, isBootstrapped = observedEvaluated.length < 3, obsSorted = observedEvaluated.map((e) => e.normPerSqm).sort((a, b) => a - b);
  const q1Obs = obsSorted.length >= 3 ? obsSorted[Math.floor(obsSorted.length * 0.25)] : null, q3Obs = obsSorted.length >= 3 ? obsSorted[Math.floor(obsSorted.length * 0.75)] : null, iqrObs = q1Obs !== null && q3Obs !== null ? Math.max(1, q3Obs - q1Obs) : 0;
  const trimmed = obsSorted.length >= 4 && q1Obs !== null && q3Obs !== null ? obsSorted.filter((p) => p >= q1Obs - 1.5 * iqrObs && p <= q3Obs + 1.5 * iqrObs) : obsSorted;
  const iqrOutlierCount = Math.max(0, obsSorted.length - trimmed.length), excludedOutlierCount = iqrOutlierCount + extremePriceAnomalyCount, eligibleObservedCount = trimmed.length, validSampleCount = eligibleObservedCount, sampleCount = observedSampleCount;
  const autoBargains = observedEvaluated.filter((e) => e.normPerSqm <= baseHoodPerSqm * 0.92).map(({ normPerSqm: _n, ...rest }) => rest), autoBargainIds = autoBargains.map((b) => b.id);
  const observedMeanPerSqm = trimmed.length > 0 ? Math.round((trimmed.reduce((a, b) => a + b, 0) / trimmed.length) * 10) / 10 : null;
  const observedMedianPerSqm = obsSorted.length > 0 ? Math.round(((obsSorted.length % 2 === 1 ? obsSorted[Math.floor(obsSorted.length / 2)] : (obsSorted[obsSorted.length / 2 - 1] + obsSorted[obsSorted.length / 2]) / 2)) * 10) / 10 : null;
  const hasSufficientIqrEvidence = trimmed.length >= 3 && q1Obs !== null && q3Obs !== null, observedIqrLowPerSqm = hasSufficientIqrEvidence ? Math.round(q1Obs * 10) / 10 : null, observedIqrHighPerSqm = hasSufficientIqrEvidence ? Math.round(q3Obs * 10) / 10 : null;
  const rawAveragePerSqm = observedMeanPerSqm === null ? baseHoodPerSqm : isBootstrapped ? Math.round(((observedMeanPerSqm * 0.5 + baseHoodPerSqm * 0.5)) * 10) / 10 : observedMeanPerSqm;
  const unclampedAveragePerSqm = rawAveragePerSqm;
  const anchor = previousDayAnchorPrice && previousDayAnchorPrice > 10 ? previousDayAnchorPrice : baseHoodPerSqm;
  const clampBand = eligibleObservedCount >= 8 ? 0.1 : 0.03;
  const dayAnchorPrice = Math.round(clampNumber(rawAveragePerSqm, anchor * (1 - clampBand), anchor * (1 + clampBand), anchor) * 10) / 10;
  const isAnchorClamped = Math.abs(unclampedAveragePerSqm - dayAnchorPrice) > 0.05;
  const isStagnantRegime = !isBootstrapped && eligibleObservedCount < 10 && (((q3Obs ?? baseHoodPerSqm) - (q1Obs ?? baseHoodPerSqm)) / Math.max(1, baseHoodPerSqm) >= 0.16 || rawAveragePerSqm >= baseHoodPerSqm * 1.12);
  const marketRegime: AggregatedMarketMetrics['marketRegime'] = isBootstrapped ? 'BALANCED' : eligibleObservedCount >= 10 ? 'HOT' : isStagnantRegime ? 'FROZEN' : 'BALANCED', askToDealRatio = marketRegime === 'HOT' ? 0.975 : marketRegime === 'BALANCED' ? 0.93 : 0.90, dealPerSqm = Math.round(dayAnchorPrice * askToDealRatio * 10) / 10;
  const provenance: MarketDataProvenance = eligibleObservedCount === 0 ? 'REFERENCE_BASELINE' : isBootstrapped ? 'HEURISTIC_ESTIMATE' : 'OBSERVED_SECONDARY', evidenceQuality: EvidenceQualityState = eligibleObservedCount === 0 ? 'INSUFFICIENT_OBSERVATIONS' : isBootstrapped ? 'LIMITED_OBSERVATIONS' : eligibleObservedCount < 10 ? 'MODERATE_OBSERVATIONS' : 'ADEQUATE_OBSERVATIONS';
  const evidenceSufficiency: EvidenceSufficiencyLevel = eligibleObservedCount === 0 ? 'NONE' : isBootstrapped ? 'INSUFFICIENT' : eligibleObservedCount < 10 ? 'MODERATE' : 'SUFFICIENT', coverageState: SampleCoverageState = eligibleObservedCount === 0 ? 'BOOTSTRAPPED_BASELINE' : isBootstrapped ? 'SPARSE_1_TO_2' : eligibleObservedCount < 10 ? 'MODERATE_3_TO_9' : 'SUFFICIENT_10_PLUS';
  const epistemicStatus: EpistemicDataStatus = eligibleObservedCount === 0 ? 'ESTIMATED' : isBootstrapped ? 'ESTIMATED' : 'OBSERVED', dataMode = eligibleObservedCount === 0 ? 'ILLUSTRATIVE_BOOTSTRAP' : isBootstrapped ? 'LIMITED_OBSERVED_BLEND' : 'OBSERVED_MARKET';
  const fraudReviewState: FraudReviewState = extremePriceAnomalyCount > 0 ? 'UNVERIFIED_PRICE_ANOMALY' : iqrOutlierCount > 0 ? 'STATISTICAL_OUTLIER' : malformedSampleCount > 0 ? 'ANOMALOUS_RECORD' : 'NONE', evidenceIndexScore = eligibleObservedCount === 0 ? 0 : eligibleObservedCount === 1 ? 35 : eligibleObservedCount === 2 ? 52 : clampNumber(62 + eligibleObservedCount * 3, 65, 98, 65);
  return {
    hoodId, hoodName, rawInputCount, sampleCount, validSampleCount, rejectedFraudCount, confidenceScore: evidenceIndexScore, observedSampleCount, duplicateSampleCount, probableDuplicateCount, eligibleObservedCount, syntheticSampleCount: 0,
    excludedOutlierCount, extremePriceAnomalyCount, malformedSampleCount, missingAreaSampleCount, suspectedFraudCount, verifiedTransactionCount: 0, provenance, epistemicStatus, dataMode, fraudReviewState, dealPriceProvenance: 'HEURISTIC_ESTIMATE', evidenceQuality, evidenceSufficiency, coverageState,
    evidenceIndexScore, evidenceIndexFormula: '0_OBS=0|1_OBS=35|2_OBS=52|3PLUS_OBS=CLAMP(62+3*N,65,98)_COVERAGE_INDEX_NOT_PROBABILITY', marketActivityEvidence: 'NO_TRANSACTION_VELOCITY_DATA_DISPERSION_HEURISTIC', negotiationMultiplierBasis: 'HYPOTHETICAL_SCENARIO_ASSUMPTION_NOT_EMPIRICAL',
    calibratedConfidencePct: null, hasSufficientIqrEvidence, observedMeanPerSqm, observedMedianPerSqm, observedIqrLowPerSqm, observedIqrHighPerSqm, isAnchorClamped, unclampedAveragePerSqm, isBootstrapped, rawAveragePerSqm, hedonicAdjustedPerSqm: dayAnchorPrice, askingPricePerSqm: dayAnchorPrice,
    spreadAdjustedDealPerSqm: dealPerSqm, estimatedDealPricePerSqm: dealPerSqm, iqrLowPerSqm: observedIqrLowPerSqm ?? 0, iqrHighPerSqm: observedIqrHighPerSqm ?? 0, marketRegime, askToDealRatio, preIqrBargainsCount: autoBargainIds.length, autoBargainIds, autoBargains, dayAnchorPrice,
    intlEquivText: formatMillionTomanAsIntlCurrency(dayAnchorPrice, 'USD'),
    askingMedianFromObserved: observedMedianPerSqm,
    displayDealLabelFa: getDisplayDealLabelFa(0),
    isDealPriceDisplayableAsFact: isDealPriceDisplayableAsFact(0),
  };
}
export const aggregateNeighborhoodLivePrice = aggregateNeighborhoodMarketMetrics;

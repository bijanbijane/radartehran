import { clampNumber } from '../utils/security'; import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
export interface DetectedListingSignals { hasLegalRisk: boolean; hasTenantLag: boolean; isRenovated: boolean; isUrbanRenewal: boolean; }
export type PriceSourceType = 'EXPLICIT_TOTAL' | 'EXPLICIT_PER_SQM' | 'NET_CASH' | 'STANDALONE' | 'NONE';
export interface QualityMultiplierSpecs {
  age?: number; buildingAge?: number; sqm?: number; renovationStatus?: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';
  floor?: number; totalFloors?: number; hasElevator?: boolean; hasParking?: boolean; hasStorage?: boolean; hoodBasePerSqm?: number; hasTenant?: boolean;
  deedType?: 'single_deed' | 'endowment' | 'informal_contract' | 'probate_coop'; detectedSignals?: Partial<DetectedListingSignals>;
}
export interface ExtractedListingSpecs {
  sqm: number; floor: number; totalFloors: number; age: number; buildingAge: number; hasElevator: boolean; hasParking: boolean; hasStorage: boolean; hasBalcony: boolean;
  renovationStatus: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation'; detectedSignals: DetectedListingSignals;
  totalMillion: number; perSqmMillion: number; askingTotalMillion: number; priceSourceType: PriceSourceType;
}
export interface AutoBargainSample {
  id: string; sqm: number; age: number; floor: number; askingTotalMillion: number; perSqmMillion: number; fairPerSqmMillion: number; discountPct: number; description: string;
}
export interface AggregatedMarketMetrics {
  hoodId: number; hoodName: string; sampleCount: number; validSampleCount: number; rejectedFraudCount: number; confidenceScore: number;
  isBootstrapped: boolean; rawAveragePerSqm: number; hedonicAdjustedPerSqm: number; askingPricePerSqm: number;
  spreadAdjustedDealPerSqm: number; estimatedDealPricePerSqm: number; iqrLowPerSqm: number; iqrHighPerSqm: number;
  marketRegime: 'HOT' | 'BALANCED' | 'FROZEN'; askToDealRatio: number; preIqrBargainsCount: number;
  autoBargainIds: string[]; autoBargains: AutoBargainSample[]; dayAnchorPrice: number; intlEquivText?: string;
}
const WORD_INT_MAP: ReadonlyArray<[string, number]> = [['دوازده', 12], ['یازده', 11], ['چهار', 4], ['ده', 10], ['نه', 9], ['هشت', 8], ['هفت', 7], ['شش', 6], ['پنج', 5], ['سه', 3], ['دو', 2], ['یک', 1]];
const WORD_HUNDRED_MAP: ReadonlyArray<[string, number]> = [['چهارصد', 400], ['پانصد', 500], ['ششصد', 600], ['هفتصد', 700], ['هشتصد', 800], ['نهصد', 900], ['دویست', 200], ['سیصد', 300], ['صد', 100]];

export function normalizePersianText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[يئ]/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/[ \t]+/g, ' ');
  for (const [word, val] of WORD_INT_MAP) {
    text = text.replace(new RegExp(`(?<=^|[\\s،,.!؟(«:])${word}(?=\\s*(?:و\\s*نیم\\s*میلیارد|میلیارد|میلیون|طبقه|واحد|سال\\s*ساخت)(?=$|[\\s،,.!؟)»:]))`, 'g'), String(val));
  }
  for (const [word, val] of WORD_HUNDRED_MAP) {
    text = text.replace(new RegExp(`(?<=میلیارد\\s*و\\s*)${word}(?=$|[\\s،,.!؟)»:])`, 'g'), String(val)).replace(new RegExp(`(?<=^|[\\s،,.!؟(«:])${word}(?=\\s*(?:میلیون|هزار|تومان|تومن)(?=$|[\\s،,.!؟)»:]))`, 'g'), String(val));
  }
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

export function resolveBuildingAge(yearOrAge?: number | null, description = '', currentSolarYear = 1405): number {
  const normDesc = normalizePersianText(description);
  const numericToAge = (v: number): number => (v >= 1330 && v <= currentSolarYear ? currentSolarYear - v : v >= 400 && v <= currentSolarYear - 1000 ? currentSolarYear - (1000 + v) : v >= 70 && v <= 99 ? currentSolarYear - (1300 + v) : v >= 0 && v <= 65 ? v : 30);
  let age = 10;
  if (yearOrAge !== undefined && yearOrAge !== null && !Number.isNaN(yearOrAge) && yearOrAge > 0) {
    age = numericToAge(Math.round(yearOrAge));
  } else {
    const divarTable = /متراژ[\s\n]+سال\s*ساخت[\s\n]+اتاق[\s\n]+(?<!\d)(\d{2,3})[\s\n]+(13[4-9]\d|140[0-6]|قبل\s*از\s*1370)/.exec(normDesc);
    const explicitAge = /(?:^|[^\d.])(?<!\d)(\d{1,2})\s*سال\s*ساخت/.exec(normDesc);
    const explicitYear = /(?:سال\s*ساخت|ساخت|مدل)\s*[:：\n]?\s*(?<!\d)(13[4-9]\d|140[0-6]|40[0-6]|[7-9]\d)(?=$|\D)/.exec(normDesc);
    if (/قبل\s*از\s*1370/.test(normDesc)) age = 36;
    else if (divarTable) age = divarTable[2].includes('قبل') ? 36 : numericToAge(parseInt(divarTable[2], 10));
    else if (explicitAge) age = parseInt(explicitAge[1], 10);
    else if (explicitYear) age = numericToAge(parseInt(explicitYear[1], 10));
    else if (yearOrAge === 0 || /(?:^|[\s،,.!؟(«:])(نوساز|کلید\s*نخورده)(?=$|[\s،,.!؟)»:])/.test(normDesc)) age = 0;
  }
  if (age <= 1 && (yearOrAge === undefined || yearOrAge === null) && hasAffirmativeMatch(normDesc, /(بازسازی|تخلیه\s*چند\s*سال|سند\s*قدیمی)/)) age = 8;
  return clampNumber(age, 0, 45, 10);
}

export function parseIranianPriceToMillionToman(
  rawInput: number | string, sqm = 85, hoodBasePerSqm = 120, priceCueContext = '', fullDescriptionText = '', priceSourceType: PriceSourceType = 'STANDALONE'
): { totalMillion: number; perSqmMillion: number } {
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
  else if (rawNumMatch) {
    const n = parseFloat(rawNumMatch[1]);
    valMillion = n >= 10_000_000 ? n / 1_000_000 : n >= 100_000 ? n / 1000 : n < 50 && (priceSourceType === 'EXPLICIT_TOTAL' || /میلیارد/.test(normCue)) ? n * 1000 : n;
  }
  if (valMillion <= 0 || !Number.isFinite(valMillion)) return { totalMillion: 0, perSqmMillion: 0 };
  const isPerSqm = priceSourceType === 'EXPLICIT_PER_SQM' || (priceSourceType === 'STANDALONE' && (/(?:متری|هر\s*متر|فی)/.test(normCue) || (valMillion >= safeBase * 0.4 && valMillion <= safeBase * 2.5 && valMillion < safeBase * safeSqm * 0.25)));
  let totalMillion = isPerSqm ? Math.round(valMillion * safeSqm) : Math.round(valMillion);
  if (!isPerSqm && /(?:کسر\s*(?:شده|گردیده|می\s*گردد|می\s*شود)|کم\s*شده|به\s*کسر\s*رهن)/.test(normFull)) {
    const rahnMatch = /(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)\s*(?:رهن|ودیعه)|(?:رهن(?:\s*مستاجر|\s*کامل)?|ودیعه)\s*(?:تا\s*مبلغ\s*|به\s*مبلغ\s*|مبلغ\s*|حدود\s*|[:：])?\s*(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)?/.exec(normFull);
    if (rahnMatch) {
      const rVal = parseFloat(rahnMatch[1] || rahnMatch[3]), rUnit = rahnMatch[2] || rahnMatch[4] || (rVal < 30 ? 'میلیارد' : 'میلیون');
      const rahnM = rUnit.includes('میلیارد') ? rVal * 1000 : rVal;
      if (rahnM > 0 && rahnM < totalMillion * 0.6) totalMillion = Math.round(totalMillion + rahnM);
    }
  }
  return { totalMillion, perSqmMillion: Math.round((totalMillion / safeSqm) * 10) / 10 };
}

export function extractListingSpecsFromText(rawText: string, fallbackHoodBasePerSqm = 120): ExtractedListingSpecs {
  const norm = normalizePersianText(rawText); let sqm = 85;
  const divarSqm = /متراژ[\s\n]+سال\s*ساخت[\s\n]+اتاق[\s\n]+(?<!\d)(\d{2,3})(?=\D|$)/.exec(norm);
  const explicitSqm = /(?:متراژ(?:\s*واحد|\s*بنا|\s*آپارتمان)?|زیربنا|بنای\s*مفید)\s*[:：\n]?\s*(?<!\d)(\d{2,3})(?=\D|$)/.exec(norm);
  if (divarSqm) sqm = clampNumber(parseInt(divarSqm[1], 10), 35, 350, 85);
  else if (explicitSqm) sqm = clampNumber(parseInt(explicitSqm[1], 10), 35, 350, 85);
  else {
    for (const m of norm.matchAll(/(?<!\d)(\d{2,3})\s*(?:متر\s*مربع|متر|متری)(?=$|\D)/g)) {
      const cand = parseInt(m[1], 10); if (cand < 35 || cand > 350 || m.index === undefined) continue;
      const prev30 = norm.slice(Math.max(0, m.index - 30), m.index), next20 = norm.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (/(?:متری|هر\s*متر|فی)\s*[:：]?\s*$/.test(prev30)) continue;
      const hasLandOrSub = /(?:زمین|زمینی|عرصه|حیاط|پاسیو|بالکن|تراس|انباری|تجاری|مغازه|بر\s*ملک|حاشیه)/.test(prev30 + ' ' + next20);
      const hasUnitCue = /(?:آپارتمان|واحد|بنا|زیربنا|مفید)\s*$/.test(prev30) || /^\s*(?:بنا|خواب|تک\s*خواب|دو\s*خواب|سه\s*خواب|مفید)/.test(next20);
      if (hasLandOrSub && !hasUnitCue) continue;
      sqm = cand; break;
    }
  }
  let totalFloors = 5, floor: number | undefined;
  const bldgFloors = /(?<!طبقه\s*[:：]?\s*\d{1,2}\s*(?:از|\/)\s*)(?:ساختمان\s*)?(?<!\d)(\d{1,2})\s*طبقه/.exec(norm);
  if (bldgFloors) totalFloors = clampNumber(parseInt(bldgFloors[1], 10), 1, 40, 5);
  const floorFrac = /(?:طبقه|ط)\s*[:：]?\s*(?<!\d)(-?\d{1,2})\s*(?:از|\/)\s*(?<!\d)(\d{1,2})/.exec(norm);
  if (floorFrac) {
    floor = clampNumber(parseInt(floorFrac[1], 10), -2, 40, 2); totalFloors = clampNumber(parseInt(floorFrac[2], 10), 1, 40, Math.max(totalFloors, floor));
  } else {
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
  const age = resolveBuildingAge(null, norm);
  const hasParking = resolveAmenityStatus(norm, /(?:پارکینگ|پارک\s*سندی|پارکینگ\s*اختصاصی)/, true);
  const hasElevator = resolveAmenityStatus(norm, /(?:آسانسور|اسانسور|لاین\s*آسانسور)/, resolvedFloor > 2);
  const hasStorage = resolveAmenityStatus(norm, /(?:انباری|انبار\s*سندی)/, true);
  const hasBalcony = resolveAmenityStatus(norm, /(?:بالکن|تراس)/, true);
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
  if (explicitTotalMatch) {
    priceSourceType = 'EXPLICIT_TOTAL'; priceRes = parseIranianPriceToMillionToman(explicitTotalMatch[0], sqm, fallbackHoodBasePerSqm, explicitTotalMatch[0], norm, 'EXPLICIT_TOTAL');
  } else if (explicitPerSqmMatch) {
    priceSourceType = 'EXPLICIT_PER_SQM'; priceRes = parseIranianPriceToMillionToman(explicitPerSqmMatch[0], sqm, fallbackHoodBasePerSqm, explicitPerSqmMatch[0], norm, 'EXPLICIT_PER_SQM');
  } else if (/(?:نقدینگی|آورده\s*نقدی|نقد)\s*[:：]?\s*(?<!\d)\d/.test(norm)) {
    priceSourceType = 'NET_CASH'; priceRes = parseIranianPriceToMillionToman(norm, sqm, fallbackHoodBasePerSqm, norm, norm, 'NET_CASH');
  } else {
    for (const cm of norm.matchAll(/(?<!\d)(\d+(?:\.\d+)?)\s*(میلیارد|میلیون\s*تومان|میلیون|ریال|تومان|تومن)/g)) {
      const prev25 = norm.slice(Math.max(0, (cm.index ?? 0) - 25), cm.index ?? 0);
      if (/(?:رهن|اجاره|ودیعه|وام|اوراق|قسط|شارژ|کمیسیون|خسارت|وجه\s*التزام)/.test(prev25)) continue;
      const candPrice = parseIranianPriceToMillionToman(cm[0], sqm, fallbackHoodBasePerSqm, cm[0], norm, 'STANDALONE');
      if (candPrice.perSqmMillion >= fallbackHoodBasePerSqm * 0.35 && candPrice.perSqmMillion <= fallbackHoodBasePerSqm * 2.6) { priceRes = candPrice; priceSourceType = 'STANDALONE'; break; }
    }
  }
  return {
    sqm, floor: resolvedFloor, totalFloors, age, buildingAge: age, hasElevator, hasParking, hasStorage, hasBalcony,
    renovationStatus, detectedSignals, totalMillion: priceRes.totalMillion, perSqmMillion: priceRes.perSqmMillion, askingTotalMillion: priceRes.totalMillion, priceSourceType,
  };
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

export function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function applySpatialGrowthFallback(targetHood: { id: number; lat: number; lng: number; buyPerSqm: number }, allHoods: ReadonlyArray<{ id: number; lat: number; lng: number; buyPerSqm: number; growthPct?: number }>): number {
  let weightedSum = 0, weightTotal = 0;
  for (const h of allHoods) {
    if (h.id === targetHood.id || typeof h.growthPct !== 'number') continue;
    const distKm = Math.hypot((targetHood.lat - h.lat) * 111, (targetHood.lng - h.lng) * 90); if (distKm > 12) continue;
    const w = 1 / Math.pow(Math.max(0.3, distKm), 2); weightedSum += h.growthPct * w; weightTotal += w;
  }
  return weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : 0;
}

export function aggregateNeighborhoodMarketMetrics(
  hoodId: number, hoodName: string, baseHoodPerSqm: number,
  samples: Array<{ id?: string; askingTotalMillion: number; description: string; yearOrAge?: number }>, previousDayAnchorPrice?: number
): AggregatedMarketMetrics {
  const isBootstrapped = samples.length < 3, rand = seededRandom(hoodId * 997 + Math.floor(Date.now() / 86_400_000));
  const effectiveSamples = isBootstrapped
    ? [0.86, 0.89, 0.91, 0.96, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04, 1.06].map((factor, idx) => ({ id: `boot-${hoodId}-${idx + 1}`, askingTotalMillion: Math.round(baseHoodPerSqm * factor * (80 + Math.round(rand() * 20)) * 10) / 10, description: `${80 + Math.round(rand() * 20)} متر طبقه 2 از 5 با پارکینگ و آسانسور ساخت 1400`, yearOrAge: 1400 }))
    : samples;
  const evaluated: Array<AutoBargainSample & { normPerSqm: number }> = [];
  for (let i = 0; i < effectiveSamples.length; i++) {
    const s = effectiveSamples[i], specs = extractListingSpecsFromText(s.description, baseHoodPerSqm), resolvedAge = resolveBuildingAge(s.yearOrAge, s.description);
    const qMult = computeQualityMultiplier({ ...specs, age: resolvedAge, buildingAge: resolvedAge, hoodBasePerSqm: baseHoodPerSqm });
    const parsedTotal = s.askingTotalMillion > 0 ? s.askingTotalMillion : specs.totalMillion, rawPerSqm = parsedTotal > 0 && specs.sqm > 20 ? parsedTotal / specs.sqm : baseHoodPerSqm, normPerSqm = rawPerSqm / Math.max(0.68, qMult);
    if (normPerSqm > 15 && normPerSqm < 2000) {
      const fairPerSqm = Math.round(baseHoodPerSqm * qMult * 10) / 10, discountPct = Math.max(0, Math.round(((fairPerSqm - rawPerSqm) / Math.max(1, fairPerSqm)) * 100));
      evaluated.push({ id: s.id || `sample-${i + 1}`, sqm: specs.sqm, age: resolvedAge, floor: specs.floor, askingTotalMillion: Math.round(parsedTotal), perSqmMillion: Math.round(rawPerSqm * 10) / 10, fairPerSqmMillion: fairPerSqm, discountPct, description: s.description, normPerSqm });
    }
  }
  const autoBargains = evaluated.filter((e) => e.normPerSqm <= baseHoodPerSqm * 0.92).map(({ normPerSqm: _n, ...rest }) => rest), autoBargainIds = autoBargains.map((b) => b.id);
  const sortedPrices = evaluated.map((e) => e.normPerSqm).sort((a, b) => a - b);
  const q1 = sortedPrices[Math.floor(sortedPrices.length * 0.25)] ?? baseHoodPerSqm * 0.94, q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)] ?? baseHoodPerSqm * 1.06, iqr = Math.max(1, q3 - q1);
  const trimmed = sortedPrices.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  const rawAveragePerSqm = trimmed.length > 0 ? Math.round((trimmed.reduce((a, b) => a + b, 0) / trimmed.length) * 10) / 10 : baseHoodPerSqm;
  const anchor = previousDayAnchorPrice && previousDayAnchorPrice > 10 ? previousDayAnchorPrice : baseHoodPerSqm, dayAnchorPrice = Math.round(clampNumber(rawAveragePerSqm, anchor * 0.97, anchor * 1.03, anchor) * 10) / 10;
  const marketRegime: AggregatedMarketMetrics['marketRegime'] = isBootstrapped ? 'BALANCED' : samples.length >= 10 ? 'HOT' : samples.length >= 3 ? 'BALANCED' : 'FROZEN';
  const askToDealRatio = marketRegime === 'HOT' ? 0.975 : marketRegime === 'BALANCED' ? 0.93 : 0.90, dealPerSqm = Math.round(dayAnchorPrice * askToDealRatio * 10) / 10;
  const validSampleCount = trimmed.length, rejectedFraudCount = Math.max(0, effectiveSamples.length - trimmed.length), confidenceScore = isBootstrapped ? 74 : clampNumber(62 + validSampleCount * 3, 65, 98, 82);
  return {
    hoodId, hoodName, sampleCount: effectiveSamples.length, validSampleCount, rejectedFraudCount, confidenceScore, isBootstrapped, rawAveragePerSqm, hedonicAdjustedPerSqm: dayAnchorPrice, askingPricePerSqm: dayAnchorPrice,
    spreadAdjustedDealPerSqm: dealPerSqm, estimatedDealPricePerSqm: dealPerSqm, iqrLowPerSqm: Math.round(q1 * 10) / 10, iqrHighPerSqm: Math.round(q3 * 10) / 10, marketRegime, askToDealRatio, preIqrBargainsCount: autoBargainIds.length, autoBargainIds, autoBargains, dayAnchorPrice, intlEquivText: formatMillionTomanAsIntlCurrency(dayAnchorPrice, 'USD'),
  };
}
export const aggregateNeighborhoodLivePrice = aggregateNeighborhoodMarketMetrics;

export function verifyPricingEngineIntegrity(): { passed: boolean; failures: string[] } {
  const failures: string[] = [], check = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };
  check(parseIranianPriceToMillionToman('۱۱ و نیم میلیارد', 100, 115).totalMillion === 11500, 'Case 1: 11.5B word fold failed');
  check(parseIranianPriceToMillionToman('۱۲ میلیارد و پانصد', 100, 125).totalMillion === 12500, 'Case 2: 12B + 500M compound failed');
  const c3 = extractListingSpecsFromText('قیمت ۱۰ میلیارد و ۱۰۰ متر بنا', 100), c14 = extractListingSpecsFromText('بدون پارکینگ آسانسور دارد', 100);
  check(c3.totalMillion === 10000 && c3.sqm === 100, 'Case 3: 10B + 100 sqm collision failed');
  check(extractListingSpecsFromText('قیمت کل ۶.۵ میلیارد، ۸۰۰ میلیون رهن مستاجر کسر شده است', 100).totalMillion === 7300, 'Case 4: Rahn deduction addition failed');
  check(parseIranianPriceToMillionToman('۱۲.۵۰۰.۰۰۰.۰۰۰ تومان', 100, 125).totalMillion === 12500, 'Case 5: Multi-dot thousands separator failed');
  check(extractListingSpecsFromText('قیمت هر متر: ۶۵٬۰۰۰٬۰۰۰ تومان', 65).perSqmMillion === 65, 'Case 6: Explicit per-sqm Toman price failed');
  check(extractListingSpecsFromText('۵ طبقه ۲ واحدی، طبقه چهارم', 100).floor === 4, 'Case 7: 5-floor 2-unit floor=4 extraction failed');
  check(extractListingSpecsFromText('طبقه ۲ واحد جنوبی', 100).floor === 2, 'Case 8: Floor 2 south unit extraction failed');
  check(extractListingSpecsFromText('ساختمان ۵ طبقه، طبقه آخر', 100).floor === 5, 'Case 9: Top floor (طبقه آخر) resolution failed');
  check(extractListingSpecsFromText('طبقه همکف', 100).floor === 0, 'Case 10: Ground floor (طبقه همکف = 0) failed');
  check(extractListingSpecsFromText('در زمینی به مساحت ۳۰۰ متر، واحد ۹۵ متری', 100).sqm === 95, 'Case 11: Land vs unit area disambiguation failed');
  check(hasAffirmativeMatch('معاوضه با خودرو ندارم', /معاوضه/) === false, 'Case 12: Post-negation ندارم failed');
  check(hasAffirmativeMatch('بدون هیچ گونه اصلاحی', /اصلاحی/) === false, 'Case 13: Pre-negation بدون هیچ گونه اصلاحی failed');
  check(c14.hasParking === false && c14.hasElevator === true, 'Case 14: Sub-clause parking=false elevator=true failed');
  check(extractListingSpecsFromText('صفر تا صد بازسازی شده', 100).detectedSignals.isRenovated === true && normalizePersianText('صفر تا صد بازسازی شده').includes('صفر تا صد'), 'Case 15: Idiom صفر تا صد renovation signal failed');
  return { passed: failures.length === 0, failures };
}

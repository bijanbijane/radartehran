import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { escapeHtmlAttr } from './security'; export type ComparisonValueState = 'known' | 'unknown' | 'not_applicable' | 'invalid_source' | 'unavailable_listing'; export interface ComparablePropertyRecord { listingId: string; cityId: string; neighborhoodId: number; neighborhoodName: string; title: string; dealType: 'خرید' | 'اجاره'; askingPurchaseMillions?: number | null; depositMillions?: number | null; monthlyRentMillions?: number | null; areaSqm?: number | null; roomsCount?: number | null; floorNumber?: number | null; buildingAgeYears?: number | null; hasParking?: boolean | null; hasElevator?: boolean | null; hasStorage?: boolean | null; lat?: number | null; lng?: number | null; publishedAtMs?: number | null; status?: 'published' | 'sold' | 'rented' | 'expired' | 'withdrawn' | 'deleted'; }
export interface NormalizedPropertyComparisonCell { state: ComparisonValueState; numericValue: number | null; formattedFa: string; unitFa: string; intlCurrencyText?: string; } export interface NormalizedPropertyComparisonColumn { listingId: string; title: string; neighborhoodName: string; dealType: 'خرید' | 'اجاره'; isAvailable: boolean; purchasePriceTotal: NormalizedPropertyComparisonCell; pricePerSqm: NormalizedPropertyComparisonCell; depositAmount: NormalizedPropertyComparisonCell; monthlyRentAmount: NormalizedPropertyComparisonCell; areaSqm: NormalizedPropertyComparisonCell; roomsCount: NormalizedPropertyComparisonCell; amenitiesSummaryFa: string; }
export interface MultiPropertyComparisonWorkspaceResult { columns: NormalizedPropertyComparisonColumn[]; hasMixedTransactionModes: boolean; comparisonWarningFa: string | null; lowestPurchasePricePerSqmListingId: string | null; displayAreaUnitLabel?: string; } const DECIMAL_SCALE = 10_000; export function addMonetaryExact(a: number, b: number): number { return (!Number.isFinite(a) || !Number.isFinite(b)) ? NaN : (Math.round(a * DECIMAL_SCALE) + Math.round(b * DECIMAL_SCALE)) / DECIMAL_SCALE; } export function subtractMonetaryExact(a: number, b: number): number { return (!Number.isFinite(a) || !Number.isFinite(b)) ? NaN : (Math.round(a * DECIMAL_SCALE) - Math.round(b * DECIMAL_SCALE)) / DECIMAL_SCALE; } export function multiplyMonetaryExact(amount: number, factor: number, decimals = 2): number { if (!Number.isFinite(amount) || !Number.isFinite(factor)) return NaN; const raw = amount * factor, p = 10 ** Math.max(0, Math.min(6, decimals));
  return raw === 0 ? 0 : (raw < 0 ? -1 : 1) * Math.round((Math.abs(raw) + Number.EPSILON) * p) / p; } export function divideMonetaryExact(numerator: number, denominator: number, decimals = 2): number | null { if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null; const raw = numerator / denominator, p = 10 ** Math.max(0, Math.min(6, decimals)); return raw === 0 ? 0 : (raw < 0 ? -1 : 1) * Math.round((Math.abs(raw) + Number.EPSILON) * p) / p; } export function convertCurrencyExplicit( value: number, fromUnit: 'rial' | 'toman' | 'million_toman' | 'billion_toman', toUnit: 'rial' | 'toman' | 'million_toman' | 'billion_toman',
): number | null { if (!Number.isFinite(value) || value < 0) return null; const toTomanFactor: Record<typeof fromUnit, number> = { rial: 0.1, toman: 1, million_toman: 1_000_000, billion_toman: 1_000_000_000 }; const result = (value * toTomanFactor[fromUnit]) / toTomanFactor[toUnit]; return Math.round((result + Number.EPSILON) * 10_000) / 10_000; }
export function computeFullDepositEquivalentMillions( depositMillions: number | null | undefined, monthlyRentMillions: number | null | undefined, annualConversionRatePercent = 30, ): { valid: boolean; fullDepositEquivalentMillions: number | null; formulaExplanationFa: string } { const dep = depositMillions ?? 0; const rent = monthlyRentMillions ?? 0;
  if (!Number.isFinite(dep) || !Number.isFinite(rent) || dep < 0 || rent < 0 || (dep === 0 && rent === 0) || annualConversionRatePercent <= 0) { return { valid: false, fullDepositEquivalentMillions: null, formulaExplanationFa: 'مقادیر ودیعه یا اجاره ماهانه برای محاسبه رهن کامل معتبر نیست.' }; }
  const monthlyRate = annualConversionRatePercent / 100 / 12; const total = addMonetaryExact(dep, rent / monthlyRate); return { valid: true, fullDepositEquivalentMillions: Math.round(total * 10) / 10,
    formulaExplanationFa: `برآورد رهن کامل معادل با نرخ تبدیل سالانه ${annualConversionRatePercent}٪ (این عدد برآورد تحلیلی است، نه قیمت قطعی درج‌شده).`,
  }; }
export function buildNormalizedPropertyComparisonWorkspace( records: ComparablePropertyRecord[], maxColumns = 4, areaUnit: AreaUnit = getStoredAreaUnit(), referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency() ): MultiPropertyComparisonWorkspaceResult { const seenIds = new Set<string>(); const deduped: ComparablePropertyRecord[] = []; for (const r of records) { const id = String(r.listingId || '').trim();
    if (!id || seenIds.has(id)) continue; seenIds.add(id); deduped.push(r); if (deduped.length >= maxColumns) break;
  }
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit); const dealTypes = new Set(deduped.map((d) => d.dealType)); const hasMixedTransactionModes = dealTypes.size > 1; let lowestPurchasePerSqm = Number.POSITIVE_INFINITY;
  let lowestPurchasePricePerSqmListingId: string | null = null; const columns: NormalizedPropertyComparisonColumn[] = deduped.map((r) => {
    const isAvailable = !r.status || r.status === 'published';
    const validArea = r.areaSqm !== null && r.areaSqm !== undefined && Number.isFinite(r.areaSqm) && r.areaSqm > 0 ? Number(r.areaSqm) : null;
    let purchasePriceTotal: NormalizedPropertyComparisonCell = {
      state: r.dealType === 'اجاره' ? 'not_applicable' : 'unknown',
      numericValue: null,
      formattedFa: r.dealType === 'اجاره' ? 'غیرمرتبط (آگهی اجاره)' : 'ثبت نشده',
      unitFa: 'میلیون تومان',
    };
    let pricePerSqm: NormalizedPropertyComparisonCell = {
      state: r.dealType === 'اجاره' ? 'not_applicable' : 'unknown',
      numericValue: null,
      formattedFa: r.dealType === 'اجاره' ? 'غیرمرتبط (آگهی اجاره)' : 'نامشخص',
      unitFa: 'میلیون تومان/مترمربع',
    };
    if (r.dealType === 'خرید' && r.askingPurchaseMillions !== null && r.askingPurchaseMillions !== undefined && Number.isFinite(r.askingPurchaseMillions) && r.askingPurchaseMillions > 0) {
      const total = Number(r.askingPurchaseMillions);
      purchasePriceTotal = { state: 'known', numericValue: total, formattedFa: `${total.toLocaleString('fa-IR')} م.ت`, unitFa: 'میلیون تومان', intlCurrencyText: formatMillionTomanAsIntlCurrency(total, referenceCurrency) };
      if (validArea !== null) {
        const perSqm = divideMonetaryExact(total, validArea, 1);
        if (perSqm !== null) {
          pricePerSqm = { state: 'known', numericValue: perSqm, formattedFa: `${perSqm.toLocaleString('fa-IR')} م.ت/متر`, unitFa: 'میلیون تومان/مترمربع', intlCurrencyText: formatMillionTomanAsIntlCurrency(perSqm, referenceCurrency) };
          if (isAvailable && perSqm < lowestPurchasePerSqm) {
            lowestPurchasePerSqm = perSqm;
            lowestPurchasePricePerSqmListingId = r.listingId;
          }
        }
      }
    }
    const depositCell: NormalizedPropertyComparisonCell =
      r.dealType === 'خرید'
        ? { state: 'not_applicable', numericValue: null, formattedFa: 'غیرمرتبط (خرید)', unitFa: 'میلیون تومان' }
        : r.depositMillions !== null && r.depositMillions !== undefined && Number.isFinite(r.depositMillions) && r.depositMillions >= 0
          ? { state: 'known', numericValue: Number(r.depositMillions), formattedFa: `${Number(r.depositMillions).toLocaleString('fa-IR')} م.ت`, unitFa: 'میلیون تومان', intlCurrencyText: formatMillionTomanAsIntlCurrency(Number(r.depositMillions), referenceCurrency) }
          : { state: 'unknown', numericValue: null, formattedFa: 'ثبت نشده', unitFa: 'میلیون تومان' };
    const rentCell: NormalizedPropertyComparisonCell =
      r.dealType === 'خرید'
        ? { state: 'not_applicable', numericValue: null, formattedFa: 'غیرمرتبط (خرید)', unitFa: 'میلیون تومان/ماه' }
        : r.monthlyRentMillions !== null && r.monthlyRentMillions !== undefined && Number.isFinite(r.monthlyRentMillions) && r.monthlyRentMillions >= 0
          ? {
              state: 'known', numericValue: Number(r.monthlyRentMillions),
              formattedFa: Number(r.monthlyRentMillions) === 0 ? 'رهن کامل (اجاره ۰)' : `${Number(r.monthlyRentMillions).toLocaleString('fa-IR')} م.ت/ماه`,
              unitFa: 'میلیون تومان/ماه',
            }
          : { state: 'unknown', numericValue: null, formattedFa: 'ثبت نشده', unitFa: 'میلیون تومان/ماه' };
    const areaCell: NormalizedPropertyComparisonCell =
      validArea !== null
        ? { state: 'known', numericValue: validArea, formattedFa: `${validArea.toLocaleString('fa-IR')} متر`, unitFa: 'مترمربع' }
        : { state: 'unknown', numericValue: null, formattedFa: 'ثبت نشده', unitFa: 'مترمربع' };
    const roomsCell: NormalizedPropertyComparisonCell =
      r.roomsCount !== null && r.roomsCount !== undefined && Number.isFinite(r.roomsCount) && r.roomsCount >= 0
        ? { state: 'known', numericValue: Number(r.roomsCount), formattedFa: `${Number(r.roomsCount).toLocaleString('fa-IR')} خواب`, unitFa: 'اتاق' }
        : { state: 'unknown', numericValue: null, formattedFa: 'نامشخص', unitFa: 'اتاق' };
    const amenities: string[] = [];
    if (r.hasParking === true) amenities.push('پارکینگ');
    if (r.hasElevator === true) amenities.push('آسانسور');
    if (r.hasStorage === true) amenities.push('انباری');
    return {
      listingId: r.listingId, title: r.title || 'بدون عنوان', neighborhoodName: r.neighborhoodName || 'نامشخص',
      dealType: r.dealType, isAvailable, purchasePriceTotal, pricePerSqm,
      depositAmount: depositCell, monthlyRentAmount: rentCell, areaSqm: areaCell, roomsCount: roomsCell,
      amenitiesSummaryFa: amenities.length > 0 ? amenities.join('، ') : 'مشخص نشده',
    };
  });
  return {
    columns, hasMixedTransactionModes,
    comparisonWarningFa: hasMixedTransactionModes
      ? 'توجه: فهرست مقایسه شامل هر دو نوع «خرید» و «اجاره» است. مبالغ خرید و اجاره ماهانه قابل مقایسه مستقیم با یکدیگر نیستند.'
      : null,
    lowestPurchasePricePerSqmListingId, displayAreaUnitLabel,
  };
}
export interface ComparableMatchExplanation {
  candidate: ComparablePropertyRecord;
  similarityScore: number;
  comparabilityTier: 'strong' | 'moderate' | 'weak';
  matchingReasonsFa: string[];
}
export function selectComparableProperties(
  subject: ComparablePropertyRecord,
  pool: ComparablePropertyRecord[],
  limit = 5,
): {
  matches: ComparableMatchExplanation[];
  sampleQuality: 'robust' | 'limited' | 'insufficient';
  referenceAskingMedianPerSqm: number | null;
  disclaimerFa: string;
} {
  const matches: ComparableMatchExplanation[] = [], seenIds = new Set<string>();
  for (const cand of pool) {
    const cid = String(cand.listingId || '').trim();
    if (!cid || cid === subject.listingId || seenIds.has(cid)) continue;
    if (cand.cityId !== subject.cityId || cand.dealType !== subject.dealType) continue;
    if (cand.status && cand.status !== 'published') continue;
    if (!cand.areaSqm || !Number.isFinite(cand.areaSqm) || cand.areaSqm <= 0) continue;
    seenIds.add(cid);
    let score = 0;
    const reasons: string[] = [];
    if (cand.neighborhoodId === subject.neighborhoodId) {
      score += 45;
      reasons.push(`هم‌محله (${cand.neighborhoodName})`);
    } else {
      score += 15;
      reasons.push('محله همجوار در همان شهر');
    }
    if (subject.areaSqm && subject.areaSqm > 0) {
      const areaDiffRatio = Math.abs(cand.areaSqm - subject.areaSqm) / subject.areaSqm;
      if (areaDiffRatio <= 0.15) {
        score += 35;
        reasons.push(`متراژ بسیار مشابه (${cand.areaSqm} متر)`);
      } else if (areaDiffRatio <= 0.3) {
        score += 20;
        reasons.push(`متراژ نزدیک (${cand.areaSqm} متر)`);
      }
    }
    if (
      subject.roomsCount !== null &&
      subject.roomsCount !== undefined &&
      cand.roomsCount === subject.roomsCount
    ) {
      score += 20;
      reasons.push(`تعداد اتاق یکسان (${cand.roomsCount} خواب)`);
    }
    if (score >= 40) {
      matches.push({
        candidate: cand,
        similarityScore: score,
        comparabilityTier: score >= 75 ? 'strong' : score >= 55 ? 'moderate' : 'weak',
        matchingReasonsFa: reasons,
      });
    }
  }
  matches.sort((a, b) => b.similarityScore - a.similarityScore);
  const topMatches = matches.slice(0, Math.max(1, limit));
  const perSqmList = topMatches
    .map((m) =>
      m.candidate.askingPurchaseMillions && m.candidate.areaSqm
        ? divideMonetaryExact(m.candidate.askingPurchaseMillions, m.candidate.areaSqm, 1)
        : null,
    )
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(perSqmList.length / 2);
  const referenceAskingMedianPerSqm =
    perSqmList.length === 0
      ? null
      : perSqmList.length % 2 === 1
        ? perSqmList[mid]
        : divideMonetaryExact(perSqmList[mid - 1] + perSqmList[mid], 2, 1);
  return {
    matches: topMatches,
    sampleQuality:
      topMatches.length >= 4 ? 'robust' : topMatches.length >= 2 ? 'limited' : 'insufficient',
    referenceAskingMedianPerSqm,
    disclaimerFa:
      'قیمت‌های مرجع بر پایه «قیمت پیشنهادی آگهی‌های مشابه فعال» محاسبه شده‌اند و به معنای قیمت قطعی معاملات ثبت‌شده در دفترخانه نیستند.',
  };
}
export function buildCanonicalPublicUrl(
  baseOrigin: string,
  params: {
    cityId?: string | null;
    neighborhoodId?: number | null;
    listingId?: string | null;
    isPrivateRoute?: boolean;
  },
): { canonicalUrl: string; robotsDirective: 'index, follow' | 'noindex, nofollow' } {
  const cleanOrigin = String(baseOrigin || 'https://tehranradar.ir').replace(/\/+$/, '');
  if (params.isPrivateRoute) {
    return { canonicalUrl: `${cleanOrigin}/`, robotsDirective: 'noindex, nofollow' };
  }
  const query = new URLSearchParams();
  const city = String(params.cityId || 'tehran').trim().toLowerCase();
  if (city && city !== 'tehran') {
    query.set('city', city);
  }
  if (params.neighborhoodId && Number.isInteger(params.neighborhoodId) && params.neighborhoodId > 0) {
    query.set('hood', String(params.neighborhoodId));
  }
  if (params.listingId && String(params.listingId).trim()) {
    query.set('listing', String(params.listingId).trim());
  }
  const qs = query.toString();
  return {
    canonicalUrl: qs ? `${cleanOrigin}/?${qs}` : `${cleanOrigin}/`,
    robotsDirective: 'index, follow',
  };
}
export function buildPublicStructuredDataJsonLd(input: {
  baseOrigin: string;
  cityNameFa: string;
  neighborhoodNameFa?: string | null;
  avgBuyPriceMillions?: number | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  const schemaObj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.neighborhoodNameFa ? 'Place' : 'WebApplication',
    name: input.neighborhoodNameFa
      ? `محله ${escapeHtmlAttr(input.neighborhoodNameFa)} (${escapeHtmlAttr(input.cityNameFa)}) — رادار مسکن`
      : `رادار هوشمند مسکن ${escapeHtmlAttr(input.cityNameFa)}`,
    description: input.neighborhoodNameFa
      ? `شاخص‌های قیمت پیشنهادی مسکن، کیفیت هوا و دسترسی محله ${escapeHtmlAttr(input.neighborhoodNameFa)} در ${escapeHtmlAttr(input.cityNameFa)}.`
      : 'سامانه تحلیل مکانی بازار مسکن، مقایسه محلات و ۵۲ ابزار محاسباتی خرید و اجاره.',
    url: input.baseOrigin || 'https://tehranradar.ir/',
  };
  if (
    input.neighborhoodNameFa &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng)
  ) {
    schemaObj.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.lat,
      longitude: input.lng,
    };
  }
  return JSON.stringify(schemaObj).replace(/</g, '\\u003c');
}
export function generateDynamicSitemapXml(
  baseOrigin: string,
  entries: Array<{ cityId: string; neighborhoodId?: number; lastModIso?: string }>,
): string {
  const cleanOrigin = String(baseOrigin || 'https://tehranradar.ir').replace(/\/+$/, '');
  const seenUrls = new Set<string>();
  const urlBlocks: string[] = [];
  const pushUrl = (loc: string, lastMod?: string) => {
    if (seenUrls.has(loc)) return;
    seenUrls.add(loc);
    const modTag = lastMod && /^\d{4}-\d{2}-\d{2}/.test(lastMod) ? `<lastmod>${lastMod.slice(0, 10)}</lastmod>` : '';
    urlBlocks.push(`  <url><loc>${escapeHtmlAttr(loc)}</loc>${modTag}<changefreq>daily</changefreq></url>`);
  };
  pushUrl(`${cleanOrigin}/`);
  for (const e of entries.slice(0, 2000)) {
    const { canonicalUrl } = buildCanonicalPublicUrl(cleanOrigin, {
      cityId: e.cityId,
      neighborhoodId: e.neighborhoodId ?? null,
    });
    pushUrl(canonicalUrl, e.lastModIso);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlBlocks,
    '</urlset>',
  ].join('\n');
}
export function generateRobotsTxt(baseOrigin: string): string {
  const cleanOrigin = String(baseOrigin || 'https://tehranradar.ir').replace(/\/+$/, '');
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/admin/', 'Disallow: /api/my-bargains', 'Disallow: /api/buyer-leads', `Sitemap: ${cleanOrigin}/sitemap.xml`].join('\n');
}
export interface ReproducibleCalculationSnapshot {
  snapshotId: string; calculatorId: string; formulaVersion: string; inputs: Record<string, number | string | boolean>;
  currencyUnit: 'million_toman' | 'toman' | 'percent'; computedOutputs: Record<string, number | string>; createdAtIso: string; sourceEntityId?: string | null;
}
export function createReproducibleCalculationSnapshot(input: {
  calculatorId: string; formulaVersion?: string; inputs: Record<string, number | string | boolean>;
  currencyUnit?: 'million_toman' | 'toman' | 'percent'; computedOutputs: Record<string, number | string>; sourceEntityId?: string | null;
}): ReproducibleCalculationSnapshot {
  return {
    snapshotId: `calc_snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    calculatorId: input.calculatorId, formulaVersion: input.formulaVersion || '2.0.0', inputs: { ...input.inputs }, currencyUnit: input.currencyUnit || 'million_toman', computedOutputs: { ...input.computedOutputs }, createdAtIso: new Date().toISOString(), sourceEntityId: input.sourceEntityId ?? null,
  };
}
/** Canonical listing samples and the dated Tehran reference table. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { clampNumber } from '../utils/security';
import {
  parseListingPriceInput,
  type ListingPriceInput,
  type ParsedRentPrice,
  type ParsedSalePrice,
  type PriceSourceType,
} from './parsers/listingPriceParser';

export {
  parseListingPriceInput,
  type ListingPriceInput,
  type ParsedRentPrice,
  type ParsedSalePrice,
  type PriceSourceType,
};

export interface NeighborhoodListingSource {
  id: number;
  name: string;
  buyPerSqm: number;
  bargains?: ReadonlyArray<{
    id: string;
    sqm: number;
    title: string;
    priceText?: string;
    discountPercent?: number;
    price?: number;
    type?: 'خرید' | 'اجاره';
    createdAtIso?: string;
    street?: string;
  }> | null;
}

export interface NeighborhoodMarketSample {
  id: string;
  sqm: number;
  askingTotalMillion: number;
  perSqmMillion?: number | null;
  depositMillion?: number | null;
  monthlyRentMillion?: number | null;
  transactionType: 'sale' | 'rent';
  priceSourceType: string;
  description: string;
  createdAtIso?: string;
  street?: string;
}

export interface TehranReferencePriceRow {
  hoodId: number;
  nameFa: string;
  millionTomanPerSqm: number;
  asOfJalali: string;
  sourceFa: string;
  unitFa: string;
}

/** Internal editorial baselines dated Aban 1405. Not registered transactions and not a central-bank district release. */
export const TEHRAN_REFERENCE_SOURCE_FA = 'بازبینی داخلی رادار در آبان ۱۴۰۵؛ آمار رسمی معاملات نیست';
export const TEHRAN_REFERENCE_UNIT_FA = 'میلیون تومان بر مترمربع';
const AS_OF = '۱۴۰۵/۰۸';

export const TEHRAN_DATED_REFERENCE_PRICES: readonly TehranReferencePriceRow[] = [
  { hoodId: 1, nameFa: 'زعفرانیه', millionTomanPerSqm: 780, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 2, nameFa: 'نیاوران', millionTomanPerSqm: 720, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 3, nameFa: 'سعادت‌آباد', millionTomanPerSqm: 620, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 4, nameFa: 'شهرک غرب', millionTomanPerSqm: 580, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 5, nameFa: 'پونک', millionTomanPerSqm: 400, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 6, nameFa: 'جنت‌آباد', millionTomanPerSqm: 385, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 7, nameFa: 'صادقیه', millionTomanPerSqm: 342, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 8, nameFa: 'یوسف‌آباد', millionTomanPerSqm: 540, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 9, nameFa: 'امیرآباد', millionTomanPerSqm: 490, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 10, nameFa: 'ونک', millionTomanPerSqm: 560, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 11, nameFa: 'پاسداران', millionTomanPerSqm: 640, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 12, nameFa: 'هروی', millionTomanPerSqm: 500, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 13, nameFa: 'نارمک', millionTomanPerSqm: 305, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 14, nameFa: 'تهرانپارس', millionTomanPerSqm: 318, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 15, nameFa: 'پیروزی', millionTomanPerSqm: 235, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 16, nameFa: 'نیروهوایی', millionTomanPerSqm: 310, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 17, nameFa: 'هفت‌حوض', millionTomanPerSqm: 360, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 18, nameFa: 'انقلاب', millionTomanPerSqm: 250, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 19, nameFa: 'نواب', millionTomanPerSqm: 145, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
  { hoodId: 20, nameFa: 'جمهوری', millionTomanPerSqm: 200, asOfJalali: AS_OF, sourceFa: TEHRAN_REFERENCE_SOURCE_FA, unitFa: TEHRAN_REFERENCE_UNIT_FA },
];

export function lookupTehranReferencePrice(hoodId: number): TehranReferencePriceRow | undefined {
  return TEHRAN_DATED_REFERENCE_PRICES.find((row) => row.hoodId === hoodId);
}

export function lookupMatchingDatedReferencePrice(
  cityId: string,
  hoodId: number,
  displayedPricePerSqm?: number,
): TehranReferencePriceRow | undefined {
  if (cityId !== 'tehran') return undefined;
  const row = lookupTehranReferencePrice(hoodId);
  if (!row) return undefined;
  if (displayedPricePerSqm !== undefined && row.millionTomanPerSqm !== displayedPricePerSqm) return undefined;
  return row;
}

function faDigits(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
}

/** Map bubble and inspector: internal reference, date or none, live ads, zero registered deals. */
export function formatNeighborhoodPriceTruthFa(
  hoodId: number,
  liveListingCount: number,
  cityId?: string,
  displayedPricePerSqm?: number,
): string {
  const row = cityId !== undefined || displayedPricePerSqm !== undefined
    ? lookupMatchingDatedReferencePrice(cityId ?? 'tehran', hoodId, displayedPricePerSqm)
    : lookupTehranReferencePrice(hoodId);
  const when = row ? `به‌روزرسانی ${row.asOfJalali}` : 'بدون تاریخ به‌روزرسانی';
  return `مرجع داخلی · ${when} · ${faDigits(liveListingCount)} آگهی زنده · ۰ معامله ثبت‌شده`;
}

export function isLiveDivarBargainId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('live-divar-');
}

/** Illustrative seed bargains — must not be treated as observed market data. */
export function buildIllustrativeSeedListingSamples(
  hood?: NeighborhoodListingSource | null,
  transactionType: 'sale' | 'rent' = 'sale',
): NeighborhoodMarketSample[] {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  const filtered = hood.bargains.filter((b) =>
    !isLiveDivarBargainId(b.id) && (transactionType === 'rent' ? b.type === 'اجاره' : b.type !== 'اجاره'),
  );
  return filtered.map((b) => {
    const parsed = parseListingPriceInput({ priceText: b.priceText, explicitTotalMillion: b.price, sqm: b.sqm, transactionType });
    const fallbackTotal = Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100));
    const askingTotalMillion =
      transactionType === 'sale'
        ? Math.round((parsed as ParsedSalePrice).totalMillion ?? fallbackTotal)
        : Math.round((parsed as ParsedRentPrice).depositMillion ?? fallbackTotal);
    return {
      id: `illus-${b.id}`,
      sqm: b.sqm,
      askingTotalMillion,
      perSqmMillion: transactionType === 'sale' ? ((parsed as ParsedSalePrice).perSqmMillion ?? Math.round((askingTotalMillion / Math.max(20, b.sqm)) * 10) / 10) : null,
      depositMillion: transactionType === 'rent' ? (parsed as ParsedRentPrice).depositMillion : null,
      monthlyRentMillion: transactionType === 'rent' ? (parsed as ParsedRentPrice).monthlyRentMillion : null,
      transactionType,
      priceSourceType: 'ILLUSTRATIVE_SEED',
      description: `[نمونهٔ نمایشی] ${b.sqm} متر ${b.title}`,
      createdAtIso: b.createdAtIso,
      street: b.street,
    };
  });
}

type ListingBargainRecord = NonNullable<NeighborhoodListingSource['bargains']>[number];
type ListingTransactionType = 'sale' | 'rent';

/**
 * Parsed samples are reused while the immutable bargains array identity is stable.
 * WeakMap keys let obsolete neighborhood snapshots be garbage-collected.
 */
const neighborhoodListingSampleCache = new WeakMap<
  ReadonlyArray<ListingBargainRecord>,
  Map<ListingTransactionType, readonly NeighborhoodMarketSample[]>
>();

/**
 * Market samples are only live `live-divar-*` rows with real extracted prices.
 * Seed catalog bargains stay out of the mean, IQR, and coverage index.
 */
export function buildNeighborhoodListingSamples(
  hood?: NeighborhoodListingSource | null,
  transactionType: ListingTransactionType = 'sale',
): NeighborhoodMarketSample[] {
  const bargains = hood?.bargains;
  if (!Array.isArray(bargains) || bargains.length === 0) return [];

  let byTransactionType = neighborhoodListingSampleCache.get(bargains);
  if (!byTransactionType) {
    byTransactionType = new Map<ListingTransactionType, readonly NeighborhoodMarketSample[]>();
    neighborhoodListingSampleCache.set(bargains, byTransactionType);
  }

  const cached = byTransactionType.get(transactionType);
  if (cached) {
    // Never expose the cached array: callers retain the historical mutable return contract.
    return cached.slice();
  }

  const live = bargains.filter(
    (b) => isLiveDivarBargainId(b.id) && (transactionType === 'rent' ? b.type === 'اجاره' : b.type !== 'اجاره'),
  );
  if (live.length === 0) {
    byTransactionType.set(transactionType, Object.freeze([]));
    return [];
  }

  const out: NeighborhoodMarketSample[] = [];
  for (const b of live) {
    if (!(typeof b.sqm === 'number' && Number.isFinite(b.sqm) && b.sqm > 0)) continue;
    const parsed = parseListingPriceInput({
      priceText: b.priceText,
      explicitTotalMillion: b.price,
      sqm: b.sqm,
      transactionType,
    });
    if (transactionType === 'sale') {
      const sale = parsed as ParsedSalePrice;
      if ((sale.priceSourceType === 'EXPLICIT_PER_SQM' || sale.priceSourceType === 'EXPLICIT_TOTAL') && sale.totalMillion !== null && sale.totalMillion > 0) {
        out.push({
          id: b.id,
          sqm: b.sqm,
          askingTotalMillion: Math.round(sale.totalMillion),
          perSqmMillion: sale.perSqmMillion,
          depositMillion: null,
          monthlyRentMillion: null,
          transactionType: 'sale',
          priceSourceType: sale.priceSourceType,
          description: `${b.sqm} متر ${b.title}`,
          createdAtIso: b.createdAtIso,
          street: b.street,
        });
      }
    } else {
      const rent = parsed as ParsedRentPrice;
      if ((rent.priceSourceType === 'FULL_DEPOSIT' || rent.priceSourceType === 'EXPLICIT_RENT') && (rent.depositMillion !== null || rent.monthlyRentMillion !== null)) {
        out.push({
          id: b.id,
          sqm: b.sqm,
          askingTotalMillion: Math.round(rent.depositMillion ?? 0),
          perSqmMillion: null,
          depositMillion: rent.depositMillion,
          monthlyRentMillion: rent.monthlyRentMillion,
          transactionType: 'rent',
          priceSourceType: rent.priceSourceType,
          description: `${b.sqm} متر ${b.title}`,
          createdAtIso: b.createdAtIso,
          street: b.street,
        });
      }
    }
  }

  byTransactionType.set(transactionType, out);
  return out.slice();
}

const PUBLIC_HOODS: ReadonlyArray<readonly [number, string]> = [
  [1, 'zaferanieh'], [2, 'niavaran'], [3, 'saadat-abad'], [4, 'shahrak-gharb'], [5, 'punak'],
  [6, 'janat-abad'], [7, 'sadeghieh'], [8, 'yousef-abad'], [9, 'amirabad'], [10, 'vanak'],
  [11, 'pasdaran'], [12, 'heravi'], [13, 'narmak'], [14, 'tehranpars'], [15, 'piroozi'],
  [16, 'niroohavayi'], [17, 'haft-howz'], [18, 'enghelab'], [19, 'navab'], [20, 'jomhuri'],
];

const PUBLIC_COMPARES: ReadonlyArray<readonly [string, number, number]> = [
  ['punak-vs-sadeghie', 5, 7],
  ['saadat-abad-vs-shahrak-gharb', 3, 4],
  ['vanak-vs-yousef-abad', 10, 8],
];

export const HONEST_ASKING_SENTENCE_FA = 'این ارقام مرجع داخلی یا برآورد هستند و معادل معامله ثبت‌شده نیستند؛ تاریخ هر مرجع فقط در صورت ثبت صریح برای همان داده نمایش داده می‌شود.';

export interface PublicSeoCard { path: string; title: string; description: string }
export type BudgetFitKind = 'fits' | 'tight' | 'over';
export interface BudgetFitLine {
  hoodId: number; nameFa: string; fit: BudgetFitKind; fitLabelFa: string; referenceLabelFa: string; truthFa: string;
}

const FIT_LABEL: Record<BudgetFitKind, string> = {
  fits: 'با این بودجه جا می‌شود', tight: 'فشار است', over: 'جا نمی‌شود',
};

export function tehranPublicPathForHood(hoodId: number): string | null {
  const hit = PUBLIC_HOODS.find((row) => row[0] === hoodId);
  return hit ? `/tehran/${hit[1]}` : null;
}

export function tehranPublicPathForCompare(leftId: number, rightId: number): string | null {
  const hit = PUBLIC_COMPARES.find((row) => (row[1] === leftId && row[2] === rightId) || (row[1] === rightId && row[2] === leftId));
  return hit ? `/tehran/${hit[0]}` : null;
}

export function parseTehranPublicPath(pathname: string): { kind: 'hood'; hoodId: number } | { kind: 'compare'; leftId: number; rightId: number } | null {
  const slug = pathname.replace(/\/+$/, '').match(/^\/tehran\/([a-z0-9-]+)$/)?.[1];
  if (!slug) return null;
  const hood = PUBLIC_HOODS.find((row) => row[1] === slug);
  if (hood) return { kind: 'hood', hoodId: hood[0] };
  const compare = PUBLIC_COMPARES.find((row) => row[0] === slug);
  return compare ? { kind: 'compare', leftId: compare[1], rightId: compare[2] } : null;
}

export function tehranSitemapEntries(baseUrl: string): Array<{ loc: string; priority: string; changefreq: string }> {
  const root = baseUrl.replace(/\/$/, '');
  return [
    { loc: `${root}/`, priority: '1.0', changefreq: 'daily' },
    ...PUBLIC_HOODS.map((row) => ({ loc: `${root}/tehran/${row[1]}`, priority: '0.9', changefreq: 'weekly' })),
    ...PUBLIC_COMPARES.map((row) => ({ loc: `${root}/tehran/${row[0]}`, priority: '0.8', changefreq: 'weekly' })),
  ];
}

function seoCard(path: string, title: string, detail: string): PublicSeoCard {
  return { path, title, description: `${detail} ${HONEST_ASKING_SENTENCE_FA}` };
}

export function seoForDatedHood(hoodId: number): PublicSeoCard | null {
  const row = lookupTehranReferencePrice(hoodId);
  const path = tehranPublicPathForHood(hoodId);
  if (!row || !path) return null;
  return seoCard(path, `قیمت خرید خانه در ${row.nameFa} | مرجع داخلی ${row.asOfJalali} | رادار تهران`, `متری ${faDigits(row.millionTomanPerSqm)} میلیون تومان (تاریخ مرجع ${row.asOfJalali}).`);
}

export function seoForDatedCompare(leftId: number, rightId: number): PublicSeoCard | null {
  const path = tehranPublicPathForCompare(leftId, rightId);
  const left = lookupTehranReferencePrice(leftId);
  const right = lookupTehranReferencePrice(rightId);
  if (!path || !left || !right) return null;
  const sameDate = left.asOfJalali === right.asOfJalali;
  const titleDate = sameDate ? ` | مرجع داخلی ${left.asOfJalali}` : '';
  const detail = sameDate
    ? `${left.nameFa} متری ${faDigits(left.millionTomanPerSqm)} و ${right.nameFa} متری ${faDigits(right.millionTomanPerSqm)} میلیون تومان (تاریخ مرجع ${left.asOfJalali}).`
    : `${left.nameFa} متری ${faDigits(left.millionTomanPerSqm)} (${left.asOfJalali}) و ${right.nameFa} متری ${faDigits(right.millionTomanPerSqm)} میلیون تومان (${right.asOfJalali}).`;
  return seoCard(path, `قیمت خانه ${left.nameFa} یا ${right.nameFa}${titleDate} | رادار تهران`, detail);
}

export function seoFromPublicPath(pathname: string): PublicSeoCard | null {
  const parsed = parseTehranPublicPath(pathname);
  if (!parsed) return null;
  return parsed.kind === 'hood' ? seoForDatedHood(parsed.hoodId) : seoForDatedCompare(parsed.leftId, parsed.rightId);
}

export function buildBudgetFitVerdict(
  hoods: ReadonlyArray<{ id: number; rahn80m: number }>,
  mode: 'buy' | 'rent',
  budgetMillion: number,
  targetSqm: number,
): BudgetFitLine[] {
  const sqm = targetSqm > 0 ? targetSqm : 80;
  const budget = budgetMillion > 0 ? budgetMillion : 1;
  const rahnById = new Map(hoods.map((hood) => [hood.id, hood.rahn80m]));
  const ranked = TEHRAN_DATED_REFERENCE_PRICES.map((row) => {
    const cost = mode === 'rent' ? (rahnById.get(row.hoodId) ?? 0) * (sqm / 80) : row.millionTomanPerSqm * sqm;
    const ratio = cost / budget;
    const fit: BudgetFitKind = ratio <= 1 ? 'fits' : ratio <= 1.15 ? 'tight' : 'over';
    const referenceLabelFa = mode === 'rent'
      ? `رهن حدود ${faDigits(Math.round(cost))} میلیون برای ${faDigits(Math.round(sqm))} متر`
      : `متری ${faDigits(row.millionTomanPerSqm)} میلیون · کل حدود ${faDigits(Math.round(cost))} میلیون`;
    return { hoodId: row.hoodId, nameFa: row.nameFa, fit, fitLabelFa: FIT_LABEL[fit], referenceLabelFa, truthFa: formatNeighborhoodPriceTruthFa(row.hoodId, 0), ratio, rank: fit === 'fits' ? 0 : fit === 'tight' ? 1 : 2 };
  });
  ranked.sort((a, b) => a.rank - b.rank || Math.abs(1 - a.ratio) - Math.abs(1 - b.ratio));
  return ranked.slice(0, 3).map(({ ratio: _ratio, rank: _rank, ...line }) => line);
}

export function budgetVerdictShareUrl(lines: readonly { hoodId: number }[]): string {
  const path = lines[0] ? tehranPublicPathForHood(lines[0].hoodId) : null;
  return path ? `https://radartehran.ir${path}` : 'https://radartehran.ir';
}

export function formatBudgetVerdictShareText(
  lines: readonly BudgetFitLine[],
  mode: 'buy' | 'rent',
  budgetMillion: number,
  targetSqm: number,
  placeFa?: string,
): string {
  const scope = placeFa ? ` در ${placeFa}` : '';
  const head = `با بودجه ${faDigits(Math.round(budgetMillion))} میلیون تومان برای ${mode === 'rent' ? 'رهن کامل' : 'خرید'}${scope}، حدود ${faDigits(Math.round(targetSqm || 80))} متر:`;
  const body = lines.map((line, index) => `${faDigits(index + 1)}. ${line.nameFa}: ${line.fitLabelFa}. ${line.referenceLabelFa}. ${line.truthFa}`).join('\n');
  return `${head}\n${body}\n${HONEST_ASKING_SENTENCE_FA}\n${budgetVerdictShareUrl(lines)}`;
}

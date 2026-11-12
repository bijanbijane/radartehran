/** Canonical listing samples and the dated Tehran reference table. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { clampNumber } from '../utils/security';

export interface NeighborhoodListingSource {
  id: number;
  name: string;
  buyPerSqm: number;
  bargains?: ReadonlyArray<{
    id: string;
    sqm: number;
    title: string;
    discountPercent?: number;
    price?: number;
    type?: 'خرید' | 'اجاره';
  }> | null;
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

function faDigits(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
}

/** Map bubble and inspector: internal reference, date or none, live ads, zero registered deals. */
export function formatNeighborhoodPriceTruthFa(hoodId: number, liveListingCount: number): string {
  const row = lookupTehranReferencePrice(hoodId);
  const when = row ? `به‌روزرسانی ${row.asOfJalali}` : 'بدون تاریخ به‌روزرسانی';
  return `مرجع داخلی · ${when} · ${faDigits(liveListingCount)} آگهی زنده · ۰ معامله ثبت‌شده`;
}

export function isLiveDivarBargainId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('live-divar-');
}

/** Illustrative seed bargains — must not be treated as observed market data. */
export function buildIllustrativeSeedListingSamples(
  hood?: NeighborhoodListingSource | null,
): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return hood.bargains.map((b) => ({
    id: `illus-${b.id}`,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `[نمونهٔ نمایشی] ${b.sqm} متر ${b.title}`,
  }));
}

/**
 * Market samples are only live `live-divar-*` rows.
 * Seed catalog bargains stay out of the mean, IQR, and coverage index.
 */
export function buildNeighborhoodListingSamples(
  hood?: NeighborhoodListingSource | null,
): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const live = hood.bargains.filter((b) => isLiveDivarBargainId(b.id));
  if (live.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return live.map((b) => ({
    id: b.id,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `${b.sqm} متر ${b.title}`,
  }));
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

export const HONEST_ASKING_SENTENCE_FA = 'این عدد آگهی میانگین داخلی است، معامله ثبت‌شده نیست، تاریخ به‌روزرسانی آبان ۱۴۰۵ است.';

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
  return seoCard(path, `قیمت خرید خانه در ${row.nameFa} | مرجع داخلی آبان ۱۴۰۵ | رادار تهران`, `متری ${faDigits(row.millionTomanPerSqm)} میلیون تومان.`);
}

export function seoForDatedCompare(leftId: number, rightId: number): PublicSeoCard | null {
  const path = tehranPublicPathForCompare(leftId, rightId);
  const left = lookupTehranReferencePrice(leftId);
  const right = lookupTehranReferencePrice(rightId);
  if (!path || !left || !right) return null;
  return seoCard(path, `قیمت خانه ${left.nameFa} یا ${right.nameFa} | مرجع داخلی آبان ۱۴۰۵ | رادار تهران`, `${left.nameFa} متری ${faDigits(left.millionTomanPerSqm)} و ${right.nameFa} متری ${faDigits(right.millionTomanPerSqm)} میلیون تومان.`);
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

export function formatBudgetVerdictShareText(lines: readonly BudgetFitLine[], mode: 'buy' | 'rent', budgetMillion: number, targetSqm: number): string {
  const head = `با بودجه ${faDigits(Math.round(budgetMillion))} میلیون برای ${mode === 'rent' ? 'رهن' : 'خرید'}، حدود ${faDigits(Math.round(targetSqm || 80))} متر:`;
  const body = lines.map((line, index) => `${faDigits(index + 1)}. ${line.nameFa}: ${line.fitLabelFa}. ${line.referenceLabelFa}. ${line.truthFa}`).join('\n');
  return `${head}\n${body}\n${HONEST_ASKING_SENTENCE_FA}\n${budgetVerdictShareUrl(lines)}`;
}

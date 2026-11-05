import type { EvaluatedNeighborhood, ResidentVoteDoc } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode, type RadarLocale } from '../../utils/areaUnit';
import { sanitizeInput } from '../../utils/security';

export type ResidentResidencyType = 'owner' | 'tenant' | 'business';
export type ResidentDurationCode = 'under_1y' | '1_to_3y' | 'over_3y';
export type ReviewFilterMode = 'all' | 'verified' | 'high_score' | 'owners' | 'tenants';

export interface ResidentQoLRatings {
  air: number; powerWater: number; internet: number; metro: number; security: number; flatTerrain: number;
}

export interface ResidentReviewItem extends ResidentQoLRatings {
  id: string; hoodId: number; hoodName: string; authorName: string;
  residencyType: ResidentResidencyType; residencyDuration: ResidentDurationCode;
  overallQoLScore: number; comment: string; prosTags: string[]; consTags: string[];
  locationVerified: boolean; helpfulCount: number; createdAtLabelFa: string; createdAtMs: number;
  isLocalSubmission?: boolean;
}

export interface ResidentReviewDraftInput extends ResidentQoLRatings {
  authorName?: string; residencyType: ResidentResidencyType; residencyDuration: ResidentDurationCode;
  comment: string; prosTags: string[]; consTags: string[];
}

export interface NeighborhoodQoLSummary {
  compositeScore: number; totalReviewsCount: number; verifiedReviewsCount: number;
  recommendPercent: number; averages: ResidentQoLRatings; housingCostNote: string;
}

export const RESIDENT_REVIEWS_STORAGE_KEY = 'tehran_radar_resident_reviews_v1';
export const RESIDENT_HELPFUL_STORAGE_KEY = 'tehran_radar_resident_helpful_v1';

export const QUICK_PROS_TAGS = [
  'همسایگان آرام و فرهنگی', 'دسترسی عالی به مترو و BRT', 'فشار آب و پایداری برق',
  'پوشش فیبر نوری پرسرعت', 'امنیت بالای تردد شبانه', 'دسترسی عالی به نانوایی و تره‌بار',
] as const;

export const QUICK_CONS_TAGS = [
  'کمبود جای پارک شبانه', 'ترافیک عصرگاهی معابر اصلی', 'شیب معابر در روزهای برفی',
  'کمبود فضای سبز محلی', 'ساخت‌وساز و صدای کوبش روزانه',
] as const;

export function clampScore(val: number): number {
  if (!Number.isFinite(val)) return 7;
  return Math.min(10, Math.max(1, Math.round(val * 10) / 10));
}

export function computeCompositeQoLScore(ratings: ResidentQoLRatings): number {
  const weighted =
    clampScore(ratings.air) * 0.16 + clampScore(ratings.powerWater) * 0.17 +
    clampScore(ratings.internet) * 0.14 + clampScore(ratings.metro) * 0.2 +
    clampScore(ratings.security) * 0.21 + clampScore(ratings.flatTerrain) * 0.12;
  return Math.round(weighted * 10) / 10;
}

export function getResidencyLabelFa(residencyType: ResidentResidencyType, duration: ResidentDurationCode): string {
  const roleLabel = residencyType === 'owner' ? 'مالک ساکن' : residencyType === 'tenant' ? 'مستاجر ساکن' : 'کاسب و شاغل محله';
  const durLabel = duration === 'over_3y' ? 'بیش از ۳ سال سابقه سکونت' : duration === '1_to_3y' ? '۱ تا ۳ سال سکونت' : 'کمتر از ۱ سال سکونت';
  return `${roleLabel} · ${durLabel}`;
}

export function buildNeighborhoodSeedReviews(hood: EvaluatedNeighborhood): ResidentReviewItem[] {
  const baseAir = clampScore(hood.air ?? 7.5), basePower = clampScore(hood.powerWater ?? 8);
  const baseNet = clampScore(hood.internet ?? 8), baseMetro = clampScore(hood.metro ?? 7.8);
  const baseSec = clampScore(hood.security ?? 8.2), baseFlat = clampScore(hood.flatTerrain ?? 7.6);
  const firstPro = String(hood.pros || 'دسترسی مناسب به شریان‌های اصلی').split('،')[0]?.trim() || 'محیط آرام مسکونی';
  const firstCon = String(hood.cons || 'ترافیک در ساعات اوج').split('،')[0]?.trim() || 'کمبود جای پارک شبانه';

  const r1: ResidentQoLRatings = { air: clampScore(baseAir + 0.4), powerWater: clampScore(basePower + 0.3), internet: clampScore(baseNet + 0.5), metro: baseMetro, security: clampScore(baseSec + 0.4), flatTerrain: baseFlat };
  const r2: ResidentQoLRatings = { air: clampScore(baseAir - 0.3), powerWater: basePower, internet: clampScore(baseNet - 0.2), metro: clampScore(baseMetro + 0.5), security: baseSec, flatTerrain: clampScore(baseFlat - 0.4) };
  const r3: ResidentQoLRatings = { air: baseAir, powerWater: clampScore(basePower + 0.2), internet: clampScore(baseNet + 0.3), metro: clampScore(baseMetro - 0.3), security: clampScore(baseSec + 0.2), flatTerrain: clampScore(baseFlat + 0.3) };

  return [
    {
      id: `seed-${hood.id}-1`, hoodId: hood.id, hoodName: hood.name, authorName: 'مهندس رضایی',
      residencyType: 'owner', residencyDuration: 'over_3y', ...r1, overallQoLScore: computeCompositeQoLScore(r1),
      comment: `بیش از ۴ سال است در فرعی‌های ${hood.name} ساکن هستم. از نظر بافت همسایگی، پایداری فشار آب و آرامش شبانه بسیار رضایت‌بخش است و مزیت اصلی محله «${firstPro}» محسوب می‌شود.`,
      prosTags: ['همسایگان آرام و فرهنگی', 'فشار آب و پایداری برق'], consTags: [firstCon.slice(0, 38)],
      locationVerified: true, helpfulCount: 14 + (hood.id % 7), createdAtLabelFa: '۳ روز پیش', createdAtMs: 1762000000000 - hood.id * 1000,
    },
    {
      id: `seed-${hood.id}-2`, hoodId: hood.id, hoodName: hood.name, authorName: 'سارا محمدی',
      residencyType: 'tenant', residencyDuration: '1_to_3y', ...r2, overallQoLScore: computeCompositeQoLScore(r2),
      comment: `به عنوان مستاجر، دسترسی روزانه از ${hood.name} به مراکز کاری و خریدهای روزمره بسیار راحت است. تنها نکته مهم در بازدید شبانه، بررسی وضعیت پارکینگ ساختمان و ترافیک ساعت ۱۸ تا ۲۰ است.`,
      prosTags: ['دسترسی عالی به مترو و BRT', 'امنیت بالای تردد شبانه'], consTags: ['کمبود جای پارک شبانه'],
      locationVerified: true, helpfulCount: 9 + (hood.id % 5), createdAtLabelFa: '۱ هفته پیش', createdAtMs: 1761500000000 - hood.id * 1000,
    },
    {
      id: `seed-${hood.id}-3`, hoodId: hood.id, hoodName: hood.name, authorName: 'امیرحسین کاظمی',
      residencyType: 'business', residencyDuration: 'over_3y', ...r3, overallQoLScore: computeCompositeQoLScore(r3),
      comment: `پوشش اینترنت ثابت و آنتن‌دهی موبایل در اغلب بلوک‌های ${hood.name} وضعیت پایداری دارد و امنیت معابر تا ساعات پایانی شب برای خانواده‌ها مناسب ارزیابی می‌شود.`,
      prosTags: ['پوشش فیبر نوری پرسرعت', 'دسترسی عالی به نانوایی و تره‌بار'], consTags: ['ترافیک عصرگاهی معابر اصلی'],
      locationVerified: false, helpfulCount: 6 + (hood.id % 4), createdAtLabelFa: '۲ هفته پیش', createdAtMs: 1761000000000 - hood.id * 1000,
    },
  ];
}

export function mergeCloudAndSeedReviews(
  hood: EvaluatedNeighborhood, cloudVotes: ResidentVoteDoc[], localReviews: ResidentReviewItem[]
): ResidentReviewItem[] {
  const hoodLocal = localReviews.filter((r) => r.hoodId === hood.id);
  const hoodCloud: ResidentReviewItem[] = cloudVotes.filter((v) => v.hoodId === hood.id).map((v, idx) => {
    const ratings: ResidentQoLRatings = {
      air: clampScore(v.air), powerWater: clampScore(v.powerWater), internet: clampScore(v.internet),
      metro: clampScore(v.metro), security: clampScore(v.security), flatTerrain: clampScore(v.flatTerrain),
    };
    return {
      id: v.id || `cloud-${hood.id}-${idx}`, hoodId: hood.id, hoodName: hood.name,
      authorName: v.userDisplayName || 'ساکن محله', residencyType: idx % 2 === 0 ? 'owner' : 'tenant',
      residencyDuration: '1_to_3y', ...ratings, overallQoLScore: computeCompositeQoLScore(ratings),
      comment: v.comment || 'ثبت امتیاز شاخص‌های کیفیت زندگی در کارنامه محله.',
      prosTags: ratings.security >= 8 ? ['امنیت بالای تردد شبانه'] : ['همسایگان آرام و فرهنگی'],
      consTags: ratings.flatTerrain < 7 ? ['شیب معابر در روزهای برفی'] : [],
      locationVerified: Boolean(v.locationVerified), helpfulCount: v.locationVerified ? 5 : 2,
      createdAtLabelFa: 'ثبت‌شده در ابر', createdAtMs: 1762500000000 - idx * 5000,
    };
  });
  return [...hoodLocal, ...hoodCloud, ...buildNeighborhoodSeedReviews(hood)];
}

export function summarizeNeighborhoodQoL(
  hood: EvaluatedNeighborhood, reviews: ResidentReviewItem[],
  intlCurrency: IntlCurrencyCode = 'IRT', locale: RadarLocale = 'fa'
): NeighborhoodQoLSummary {
  const safeList = reviews.length > 0 ? reviews : buildNeighborhoodSeedReviews(hood);
  let totalWeight = 0, verifiedCount = 0, recommendedCount = 0;
  const sums: ResidentQoLRatings = { air: 0, powerWater: 0, internet: 0, metro: 0, security: 0, flatTerrain: 0 };

  for (const r of safeList) {
    const w = r.locationVerified ? 2 : 1;
    totalWeight += w;
    sums.air += r.air * w; sums.powerWater += r.powerWater * w; sums.internet += r.internet * w;
    sums.metro += r.metro * w; sums.security += r.security * w; sums.flatTerrain += r.flatTerrain * w;
    if (r.locationVerified) verifiedCount += 1;
    if (r.overallQoLScore >= 7.0) recommendedCount += 1;
  }

  const div = Math.max(1, totalWeight);
  const averages: ResidentQoLRatings = {
    air: Math.round((sums.air / div) * 10) / 10, powerWater: Math.round((sums.powerWater / div) * 10) / 10,
    internet: Math.round((sums.internet / div) * 10) / 10, metro: Math.round((sums.metro / div) * 10) / 10,
    security: Math.round((sums.security / div) * 10) / 10, flatTerrain: Math.round((sums.flatTerrain / div) * 10) / 10,
  };
  const fxText = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hood.rahn80m, intlCurrency, locale)})` : '';

  return {
    compositeScore: computeCompositeQoLScore(averages),
    totalReviewsCount: Math.max(hood.votesCount || 12, safeList.length),
    verifiedReviewsCount: verifiedCount,
    recommendPercent: Math.min(99, Math.max(68, Math.round((recommendedCount / safeList.length) * 100))),
    averages,
    housingCostNote: `رهن معیار ۸۰ متری: ${hood.rahn80m.toLocaleString('fa-IR')} میلیون تومان${fxText}`,
  };
}

export function filterAndSortResidentReviews(
  reviews: ResidentReviewItem[], filterMode: ReviewFilterMode, searchQuery: string
): ResidentReviewItem[] {
  const q = sanitizeInput(searchQuery, 80).trim().toLowerCase();
  const filtered = reviews.filter((item) => {
    if (filterMode === 'verified' && !item.locationVerified) return false;
    if (filterMode === 'owners' && item.residencyType !== 'owner') return false;
    if (filterMode === 'tenants' && item.residencyType !== 'tenant') return false;
    if (!q) return true;
    return (
      item.comment.toLowerCase().includes(q) || item.authorName.toLowerCase().includes(q) ||
      item.prosTags.some((t) => t.toLowerCase().includes(q)) || item.consTags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return [...filtered].sort((a, b) => {
    if (filterMode === 'high_score') return b.overallQoLScore - a.overallQoLScore || b.helpfulCount - a.helpfulCount;
    if (Boolean(a.isLocalSubmission) !== Boolean(b.isLocalSubmission)) return a.isLocalSubmission ? -1 : 1;
    if (a.locationVerified !== b.locationVerified) return a.locationVerified ? -1 : 1;
    return b.createdAtMs - a.createdAtMs;
  });
}

export function validateResidentReviewDraft(
  draft: ResidentReviewDraftInput
): { valid: boolean; errorFa?: string; sanitizedComment: string; sanitizedAuthor: string } {
  const sanitizedComment = sanitizeInput(draft.comment, 500).trim();
  const sanitizedAuthor = (sanitizeInput(draft.authorName || '', 60).trim() || 'ساکن محله').slice(0, 60);
  if (sanitizedComment.length < 10) {
    return {
      valid: false,
      errorFa: 'لطفاً تجربه سکونت خود را در حداقل ۱۰ کاراکتر بنویسید تا برای سایر خریداران و مستاجران مفید باشد.',
      sanitizedComment, sanitizedAuthor,
    };
  }
  return { valid: true, sanitizedComment, sanitizedAuthor };
}

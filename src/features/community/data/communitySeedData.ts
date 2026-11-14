/** @file src/features/community/data/communitySeedData.ts — Stage 25 Seed Profiles, Corrections, Discussions & Local Persistence */
import type {
  CommunityDiscussionPost,
  CommunityTrustBadgeProfile,
  DataCorrectionProposal,
  ResearchTopicProposal,
} from '../types/community.types';

export const COMMUNITY_SEED_PROFILES: Record<string, CommunityTrustBadgeProfile> = {
  user_resident_1: {
    userId: 'user_resident_1',
    username: 'punak_steward',
    displayNameFa: 'آرش کریمی (ساکن تأییدشده پونک)',
    identityStatus: 'verified_phone',
    participationScore: 68,
    participationTierFa: 'مشارکت‌کننده فعال',
    verifiedCredentialFa: null,
    reputation: { data: 68, community: 45, research: 22, sources: 18, professional: 0 },
  },
  user_expert_1: {
    userId: 'user_expert_1',
    username: 'm_kazemi_expert',
    displayNameFa: 'مریم کاظمی (کارشناس رسمی دادگستری)',
    identityStatus: 'verified_phone',
    participationScore: 24,
    participationTierFa: 'همکار محله',
    verifiedCredentialFa: 'کارشناس رسمی راه و ساختمان · کد ممیزی ۰۴۱۲',
    reputation: { data: 24, community: 54, research: 38, sources: 62, professional: 92 },
  },
  user_urbanist_1: {
    userId: 'user_urbanist_1',
    username: 'a_sharifi_urban',
    displayNameFa: 'دکتر امین شریفی',
    identityStatus: 'verified_phone',
    participationScore: 15,
    participationTierFa: 'همکار محله',
    verifiedCredentialFa: 'پژوهشگر شهرسازی و حمل‌ونقل شهری',
    reputation: { data: 19, community: 41, research: 75, sources: 84, professional: 88 },
  },
};

export const COMMUNITY_SEED_CORRECTIONS: DataCorrectionProposal[] = [
  {
    id: 'corr-seed-1',
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    category: 'metro_transit',
    titleFa: 'به‌روزرسانی فاصله پیاده تا خط بی‌آرتی اشرفی',
    currentValueFa: 'امتیاز دسترسی حمل‌ونقل عمومی: ۷.۲ از ۱۰',
    evidenceSummaryFa: 'ایستگاه جدید میدان پونک زمان دسترسی پیاده بخش شمالی را حدود ۵ دقیقه کاهش داده است.',
    suggestedValueFa: 'امتیاز دسترسی پیاده حمل‌ونقل عمومی: ۸ از ۱۰',
    observedDateFa: '۱۴۰۵/۰۱/۱۲',
    evidenceAttachments: [
      { id: 'ev-1', fileName: 'punak-brt-walk-map.png', kind: 'image', observedDateFa: '۱۴۰۵/۰۱/۱۲', summaryFa: 'نقشه مسیر پیاده از میدان پونک به خط ۱' },
    ],
    ownerUserId: 'user_resident_1',
    authorProfile: COMMUNITY_SEED_PROFILES.user_resident_1,
    status: 'applied',
    appliedDataVersionId: 'canon-ver-2026.04.02',
    moderatorNoteFa: 'با نقشه معابر و خطوط اتوبوسرانی منطقه ۵ تطبیق داده و در نسخه داده رسمی اعمال شد.',
    createdAtIso: '2026-04-02T09:15:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۳',
  },
  {
    id: 'corr-seed-2',
    neighborhoodId: 3,
    neighborhoodNameFa: 'جنت‌آباد',
    category: 'price_anomaly',
    titleFa: 'گزارش آگهی‌های تکرارشونده با قیمت مصنوعی پایین',
    currentValueFa: 'متوسط قیمت اعلامی نمونه: ۲۱۵ میلیون تومان',
    evidenceSummaryFa: 'سه فایل با عکس یکسان و متراژ ۹۵ متر زیر نرخ واقعی منطقه برای جذب تماس ثبت شده‌اند.',
    suggestedValueFa: 'علامت‌گذاری جهت بررسی تحریریه مچ‌گیر قیمت',
    observedDateFa: '۱۴۰۵/۰۱/۱۶',
    evidenceAttachments: [
      { id: 'ev-2', fileName: 'duplicate-listing-note.txt', kind: 'field_note', observedDateFa: '۱۴۰۵/۰۱/۱۶', summaryFa: 'شماره‌های متفاوت با تصویر تکراری در محدوده جنت‌آباد مرکزی' },
    ],
    ownerUserId: 'user_resident_1',
    authorProfile: COMMUNITY_SEED_PROFILES.user_resident_1,
    status: 'under_review',
    createdAtIso: '2026-04-05T11:30:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۶',
  },
];

export const COMMUNITY_SEED_DISCUSSIONS: CommunityDiscussionPost[] = [
  {
    id: 'post-seed-1',
    track: 'social_discussion',
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    topicId: 'topic-neighborhoods',
    tags: ['فشار-آب', 'پارکینگ', 'پونک'],
    entityLink: { type: 'neighborhood', id: '1', labelFa: 'کارنامه محله پونک' },
    pinned: true,
    followerIds: ['user_resident_1'],
    revisionHistory: [],
    titleFa: 'تجربه فشار آب و پارکینگ کوچه ۳۵ متری گلستان',
    bodyFa: 'در ساعت‌های اوج عصر پیدا کردن جای پارک سخت است و ساختمان‌های بدون پمپ در طبقه چهارم افت فشار دارند؛ با این حال دسترسی محلی عالی است.',
    ownerUserId: 'user_resident_1',
    authorProfile: COMMUNITY_SEED_PROFILES.user_resident_1,
    helpfulCount: 14,
    helpfulVoterIds: [],
    reactionCounts: { helpful: 14, agree: 6, needs_source: 1, disagree: 0 },
    reactionsByUser: {},
    replies: [
      {
        id: 'rep-seed-1',
        parentReplyId: null,
        depth: 1,
        authorProfile: COMMUNITY_SEED_PROFILES.user_urbanist_1,
        bodyFa: 'برای ساختمان‌های بالای ۴ طبقه حتماً مخزن ذخیره و پمپ بی‌سر‌و‌صدا را در بازدید بررسی کنید.',
        createdAtFa: '۱۴۰۵/۰۱/۱۵',
        reactionCounts: { helpful: 5, agree: 2, needs_source: 0, disagree: 0 },
        reactionsByUser: {},
        status: 'visible',
      },
      {
        id: 'rep-seed-2',
        parentReplyId: 'rep-seed-1',
        depth: 2,
        authorProfile: COMMUNITY_SEED_PROFILES.user_resident_1,
        bodyFa: 'ممنون بابت یادآوری؛ در ساختمان‌های بعد از سال ۱۳۹۸ معمولاً مخزن ۱۰۰۰ لیتری نصب شده است.',
        createdAtFa: '۱۴۰۵/۰۱/۱۵',
        reactionCounts: { helpful: 2, agree: 1, needs_source: 0, disagree: 0 },
        reactionsByUser: {},
        status: 'visible',
      },
    ],
    status: 'published',
    createdAtIso: '2026-04-03T14:20:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۴',
  },
  {
    id: 'post-seed-2',
    track: 'expert_qa',
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    topicId: 'topic-valuation',
    tags: ['قدراسهم', 'تجمیع', 'بلوار-عدل'],
    entityLink: { type: 'market', id: 'tehran-z5', labelFa: 'شاخص منطقه ۵' },
    pinned: false,
    followerIds: [],
    revisionHistory: [],
    titleFa: 'تفاوت قدرالسهم زمین در بلوک‌های شمالی و جنوبی بلوار عدل',
    bodyFa: 'برای محاسبه ارزش تجمیع در قطعات ۲۵۰ متری بافت متوسط، نسبت سطح اشغال ۶۰ درصد و عرض گذر ۸ متری ملاک جواز نوسازی است.',
    ownerUserId: 'user_expert_1',
    authorProfile: COMMUNITY_SEED_PROFILES.user_expert_1,
    helpfulCount: 19,
    helpfulVoterIds: [],
    reactionCounts: { helpful: 19, agree: 9, needs_source: 0, disagree: 0 },
    reactionsByUser: {},
    replies: [],
    status: 'published',
    createdAtIso: '2026-04-04T16:10:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۵',
  },
];

export const COMMUNITY_SEED_RESEARCH_PROPOSALS: ResearchTopicProposal[] = [
  {
    id: 'rprop-seed-1',
    titleFa: 'اثر بازگشایی بزرگراه‌های جدید غرب بر فاصله قیمتی پونک و چیتگر',
    questionFa: 'آیا کاهش زمان سفر خودرویی شکاف قیمت هر متر مربع بین منطقه ۵ و ۲۲ را در ۱۸ ماه گذشته کم کرده است؟',
    neighborhoodNameFa: 'پونک و منطقه ۲۲',
    authorProfile: COMMUNITY_SEED_PROFILES.user_resident_1,
    votesCount: 27,
    voterIds: [],
    linkedKnowledgeTab: 'reports',
    status: 'queued_for_research',
    createdAtFa: '۱۴۰۵/۰۱/۱۲',
  },
  {
    id: 'rprop-seed-2',
    titleFa: 'نسبت رهن کامل به قیمت کل در واحدهای ریزمتراژ مرکز تهران',
    questionFa: 'ضریب تبدیل واقعی رهن به اجاره در آپارتمان‌های زیر ۶۰ متر چه تفاوتی با عرف بانکی دارد؟',
    neighborhoodNameFa: 'تهران مرکزی',
    authorProfile: COMMUNITY_SEED_PROFILES.user_urbanist_1,
    votesCount: 18,
    voterIds: [],
    linkedKnowledgeTab: 'methodology',
    status: 'open',
    createdAtFa: '۱۴۰۵/۰۱/۱۵',
  },
];

const memoryFallback = new Map<string, string>();

export function readCommunityJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    const mem = memoryFallback.get(key);
    return mem ? (JSON.parse(mem) as T) : fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCommunityJson<T>(key: string, val: T): void {
  const raw = JSON.stringify(val);
  if (typeof window === 'undefined') {
    memoryFallback.set(key, raw);
    return;
  }
  try {
    window.localStorage.setItem(key, raw);
  } catch { /* ignore quota issues */ }
}

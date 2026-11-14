/** @file src/features/community/data/communityTopicsAndSeeds.ts — 14 Official Topics, Public Member Profiles, Structured Q&A & Appeals Seeds */
import type {
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTrustBadgeProfile,
  ModerationActionRecord,
  ModerationAppeal,
  ReputationEvent,
  TopicItem,
} from '../types/community.types';

export const COMMUNITY_TOPICS_REGISTRY: TopicItem[] = [
  { id: 'topic-tehran-market', slug: 'tehran-market', titleFa: 'بازار مسکن تهران', categoryFa: 'بازار', descriptionFa: 'تحلیل رفتار عرضه، تقاضا و شکاف قیمت پیشنهادی و معامله در مناطق ۲۲گانه.', followersCount: 412, activeThreadsCount: 28 },
  { id: 'topic-neighborhoods', slug: 'neighborhoods-living', titleFa: 'محله‌ها و زیست‌پذیری', categoryFa: 'مکانی', descriptionFa: 'تجربه ساکنان از ترافیک، فشار آب، امنیت، فضاهای سبز و دسترسی‌های روزمره.', followersCount: 389, activeThreadsCount: 44 },
  { id: 'topic-buy-sell', slug: 'buy-and-sell', titleFa: 'خرید و فروش', categoryFa: 'معاملات', descriptionFa: 'چالش‌های قیمت‌گذاری، بررسی سند و مذاکره خرید در بازار فعلی.', followersCount: 315, activeThreadsCount: 21 },
  { id: 'topic-rent-deposit', slug: 'rent-and-deposit', titleFa: 'رهن و اجاره', categoryFa: 'معاملات', descriptionFa: 'نسبت تبدیل رهن و اجاره، تمدید سالانه و حقوق مستأجر و موجر.', followersCount: 298, activeThreadsCount: 19 },
  { id: 'topic-valuation', slug: 'property-valuation', titleFa: 'ارزش‌گذاری و قیمت‌گذاری', categoryFa: 'تحلیلی', descriptionFa: 'بررسی ضرایب هدونیک، قدرالسهم زمین و تفاوت طبقه و نورگیر.', followersCount: 264, activeThreadsCount: 16 },
  { id: 'topic-legal-contracts', slug: 'legal-contracts', titleFa: 'قراردادها و مسائل حقوقی', categoryFa: 'حقوقی', descriptionFa: 'شرایط فسخ، وجه التزام، تحویل سند، کد رهگیری و مبایعه‌نامه.', followersCount: 342, activeThreadsCount: 33 },
  { id: 'topic-zoning-urban', slug: 'zoning-and-urban-plans', titleFa: 'شهرسازی، تراکم و ضوابط', categoryFa: 'فنی', descriptionFa: 'پهنه R122، عرض گذر، جواز ساخت و طرح تفصیلی تهران.', followersCount: 178, activeThreadsCount: 14 },
  { id: 'topic-transit-infra', slug: 'transit-infrastructure', titleFa: 'حمل‌ونقل و زیرساخت شهری', categoryFa: 'زیرساخت', descriptionFa: 'ایستگاه‌های جدید مترو، بی‌آرتی، پارکینگ محله و پروژه‌های بزرگراهی.', followersCount: 205, activeThreadsCount: 12 },
  { id: 'topic-construction-quality', slug: 'construction-quality', titleFa: 'ساخت‌وساز و کیفیت بنا', categoryFa: 'فنی', descriptionFa: 'عایق صوتی، تأسیسات موتورخانه، اسکلت و استانداردهای مبحث ۱۹.', followersCount: 166, activeThreadsCount: 11 },
  { id: 'topic-property-services', slug: 'property-services', titleFa: 'خدمات ملکی و بازرسی فنی', categoryFa: 'خدمات', descriptionFa: 'تجربه و استانداردهای کارشناسی بازدید، وکالت و مهندسی ساختمان.', followersCount: 134, activeThreadsCount: 9 },
  { id: 'topic-finance-loans', slug: 'housing-finance', titleFa: 'تأمین مالی و وام مسکن', categoryFa: 'مالی', descriptionFa: 'هزینه اوراق مسکن، اقساط بانکی و مدل‌های رهن ترکیبی.', followersCount: 221, activeThreadsCount: 15 },
  { id: 'topic-commercial-office', slug: 'commercial-office', titleFa: 'املاک تجاری و اداری', categoryFa: 'کاربری', descriptionFa: 'موقعیت‌سنجی مغازه، دفتر کار اداری و بازدهی سرمایه‌گذاری تجاری.', followersCount: 112, activeThreadsCount: 7 },
  { id: 'topic-data-quality', slug: 'data-correction-feedback', titleFa: 'گزارش خطای داده و اصلاح نقشه‌ها', categoryFa: 'داده', descriptionFa: 'اصلاح مرز محله، خطای موقعیت مترو و رصد آگهی‌های پرت و ساختگی.', followersCount: 194, activeThreadsCount: 24 },
  { id: 'topic-research-analytics', slug: 'research-and-reports', titleFa: 'پژوهش و گزارش‌های تحلیلی', categoryFa: 'پژوهش', descriptionFa: 'پیشنهاد موضوعات پژوهشی و نقد متدولوژی گزارش‌های رادار تهران.', followersCount: 151, activeThreadsCount: 10 },
];

export const COMMUNITY_MEMBER_PROFILES: CommunityProfile[] = [
  {
    userId: 'user_resident_1',
    username: 'punak_steward',
    displayNameFa: 'آرش کریمی',
    bioFa: 'ساکن منطقه ۵ و پیگیر داده‌های حمل‌ونقل و زیست‌پذیری محله پونک و جنت‌آباد.',
    visibility: 'public',
    showBadges: true,
    showContributions: true,
    showFollowedTopics: true,
    identityStatus: 'verified_phone',
    reputation: { data: 68, community: 45, research: 22, sources: 18, professional: 0 },
    badges: [
      { id: 'bdg-1', code: 'verified_identity', titleFa: 'هویت تأییدشده', scopeFa: 'احراز شماره حساب', authorityFa: 'سیستم احراز هویت', criteriaFa: 'تکمیل احراز هویت پایه', reviewedAtFa: '۱۴۰۴/۱۱/۲۰', expiresAtIso: '2027-02-10T00:00:00.000Z', status: 'active' },
      { id: 'bdg-2', code: 'local_steward', titleFa: 'همیار فعال داده‌های محله', scopeFa: 'گزارش‌های مکانی منطقه ۵', authorityFa: 'شورای ممیزی داده رادار', criteriaFa: 'حداقل ۵ اصلاح داده تأییدشده با شواهد میدانی', reviewedAtFa: '۱۴۰۵/۰۱/۱۰', expiresAtIso: '2027-04-01T00:00:00.000Z', status: 'active' },
    ],
    followedTopicIds: ['topic-neighborhoods', 'topic-data-quality', 'topic-transit-infra'],
    memberSinceFa: 'آذر ۱۴۰۴',
    recentPublicSummaryFa: ['تأیید اصلاح فاصله ایستگاه بی‌آرتی پونک', 'ثبت گزارش آگهی‌های تکراری در جنت‌آباد'],
    verifiedCredentialFa: null,
  },
  {
    userId: 'user_expert_1',
    username: 'm_kazemi_expert',
    displayNameFa: 'مریم کاظمی',
    bioFa: 'کارشناس رسمی راه و ساختمان و تحلیلگر ضوابط شهرسازی و قدرالسهم زمین.',
    visibility: 'public',
    showBadges: true,
    showContributions: true,
    showFollowedTopics: true,
    identityStatus: 'verified_phone',
    reputation: { data: 24, community: 54, research: 38, sources: 62, professional: 92 },
    badges: [
      { id: 'bdg-3', code: 'domain_specialist', titleFa: 'کارشناس ممیزی‌شده حقوق و ساختمان', scopeFa: 'پهنه R122 و قدرالسهم', authorityFa: 'کمیسیون احراز صلاحیت تخصصی', criteriaFa: 'تطبیق پروانه کارشناسی معتبر با مدت اعتبار ۱ ساله', reviewedAtFa: '۱۴۰۵/۰۱/۰۵', expiresAtIso: '2027-03-25T00:00:00.000Z', status: 'active' },
    ],
    followedTopicIds: ['topic-legal-contracts', 'topic-zoning-urban', 'topic-valuation'],
    memberSinceFa: 'دی ۱۴۰۴',
    recentPublicSummaryFa: ['پاسخ مستند به ضابطه قدرالسهم بلوار عدل', 'بررسی چک‌لیست تحویل سند تک‌برگ'],
    verifiedCredentialFa: 'کارشناس رسمی راه و ساختمان · کد ممیزی ۰۴۱۲',
  },
  {
    userId: 'user_urbanist_1',
    username: 'a_sharifi_urban',
    displayNameFa: 'دکتر امین شریفی',
    bioFa: 'پژوهشگر اقتصاد مسکن و حمل‌ونقل شهری؛ تمرکز بر نقد متدولوژی شاخص‌های قیمتی.',
    visibility: 'public',
    showBadges: true,
    showContributions: true,
    showFollowedTopics: false,
    identityStatus: 'verified_phone',
    reputation: { data: 19, community: 41, research: 75, sources: 84, professional: 88 },
    badges: [
      { id: 'bdg-4', code: 'research_contributor', titleFa: 'همکار پژوهش‌های شهری', scopeFa: 'متدولوژی قیمت و رهن', authorityFa: 'تحریریه پایگاه دانش رادار', criteriaFa: 'انتشار حداقل ۲ نقد روشی ارجاع‌دار', reviewedAtFa: '۱۴۰۵/۰۱/۱۲', expiresAtIso: '2027-04-12T00:00:00.000Z', status: 'active' },
    ],
    followedTopicIds: ['topic-research-analytics', 'topic-tehran-market'],
    memberSinceFa: 'بهمن ۱۴۰۴',
    recentPublicSummaryFa: ['پیشنهاد پژوهش ضریب واقعی تبدیل رهن به اجاره'],
    verifiedCredentialFa: 'پژوهشگر شهرسازی و حمل‌ونقل شهری',
  },
];

export const COMMUNITY_SEED_QUESTIONS: CommunityQuestionItem[] = [
  {
    id: 'q-seed-1',
    titleFa: 'در پهنه‌بندی R122 گذر ۸ متری، بیشینه طبقات مجاز با پارکینگ تأمین‌شده چند طبقه است؟',
    bodyFa: 'قطعه ۲۴۰ متری شمالی در محله پونک داریم. می‌خواهیم بدانیم پیش از خرید، سقف طبقه مجاز و سطح اشغال قانونی بر اساس طرح تفصیلی چگونه محاسبه می‌شود.',
    neighborhoodId: 1,
    neighborhoodNameFa: 'پونک',
    topicId: 'topic-zoning-urban',
    tags: ['R122', 'جواز-ساخت', 'پونک'],
    ownerUserId: 'user_resident_1',
    authorProfile: { userId: 'user_resident_1', username: 'punak_steward', displayNameFa: 'آرش کریمی', identityStatus: 'verified_phone', participationScore: 68, participationTierFa: 'مشارکت‌کننده فعال', verifiedCredentialFa: null },
    status: 'resolved',
    followerIds: ['user_resident_1'],
    createdAtIso: '2026-04-03T10:00:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۴',
    answers: [
      {
        id: 'ans-seed-1',
        questionId: 'q-seed-1',
        authorProfile: { userId: 'user_expert_1', username: 'm_kazemi_expert', displayNameFa: 'مریم کاظمی', identityStatus: 'verified_phone', participationScore: 24, participationTierFa: 'همکار محله', verifiedCredentialFa: 'کارشناس رسمی راه و ساختمان · کد ممیزی ۰۴۱۲' },
        bodyFa: 'در زیرپهنه R122 با عرض گذر ۸ متر و مساحت ۲۴۰ مترمربع، طبق ضابطه طرح تفصیلی تراکم پایه ۴ طبقه روی پیلوت با سطح اشغال حداکثر ۶۰ درصد است؛ اعطای طبقه پنجم منوط به مشوق‌های تجمیع و تأمین کامل پارکینگ خواهد بود.',
        sourceReferenceFa: 'ضوابط طرح تفصیلی شهر تهران — جدول پهنه‌بندی R122 (ماده ۶)',
        markers: { isAskerSelected: true, hasCredibleSource: true, isExpertReviewed: true, isOfficiallyVerified: true },
        reactionCounts: { helpful: 18, agree: 7, needs_source: 0, disagree: 0 },
        reactionsByUser: {},
        createdAtFa: '۱۴۰۵/۰۱/۱۴',
        status: 'visible',
      },
    ],
  },
  {
    id: 'q-seed-2',
    titleFa: 'اگر فروشنده تا زمان تنظیم سند رسمی در دفترخانه پایان‌کار نگیرد، وجه التزام روزانه چگونه محاسبه می‌شود؟',
    bodyFa: 'در مبایعه‌نامه قید شده فروشنده مکلف به ارائه پایان‌کار تا روز محضر است؛ آیا در صورت تأخیر بدون شرط صریح اسقاط کافه خیارات، خسارت روزانه قابل مطالبه است؟',
    neighborhoodId: 2,
    neighborhoodNameFa: 'سعادت‌آباد',
    topicId: 'topic-legal-contracts',
    tags: ['مبایعه‌نامه', 'پایان‌کار', 'وجه-التزام'],
    ownerUserId: 'user_resident_1',
    authorProfile: { userId: 'user_resident_1', username: 'punak_steward', displayNameFa: 'آرش کریمی', identityStatus: 'verified_phone', participationScore: 68, participationTierFa: 'مشارکت‌کننده فعال', verifiedCredentialFa: null },
    status: 'open',
    followerIds: [],
    createdAtIso: '2026-04-06T08:30:00.000Z',
    createdAtFa: '۱۴۰۵/۰۱/۱۷',
    answers: [],
  },
];

export const SEED_REPUTATION_EVENTS: ReputationEvent[] = [
  { id: 'rev-1', userId: 'current_local_user', axis: 'data', delta: 12, reasonFa: 'ثبت گزارش اصلاح فاصله پیاده مترو با مستند مکانی', sourceEntityId: 'corr-seed-1', createdAtIso: '2026-04-02T09:15:00.000Z', createdAtFa: '۱۴۰۵/۰۱/۱۳' },
  { id: 'rev-2', userId: 'current_local_user', axis: 'community', delta: 8, reasonFa: 'مشارکت سازنده در گفت‌وگوی زیست‌پذیری محله پونک', sourceEntityId: 'post-seed-1', createdAtIso: '2026-04-04T11:20:00.000Z', createdAtFa: '۱۴۰۵/۰۱/۱۵' },
  { id: 'rev-3', userId: 'current_local_user', axis: 'sources', delta: 5, reasonFa: 'ارجاع مستند به جدول طرح تفصیلی در پاسخ پرسش تخصصی', sourceEntityId: 'q-seed-1', createdAtIso: '2026-04-05T14:00:00.000Z', createdAtFa: '۱۴۰۵/۰۱/۱۶' },
];

export const SEED_MODERATION_ACTIONS: ModerationActionRecord[] = [
  { id: 'mod-act-1', targetType: 'data_correction', targetId: 'corr-seed-1', actionType: 'apply_data_version', reasonFa: 'تطبیق نقشه معابر و ثبت نسخه داده مکانی v2026.04', actorRole: 'data_analyst', createdAtIso: '2026-04-02T13:10:00.000Z' },
];

export const SEED_MODERATION_APPEALS: ModerationAppeal[] = [];

export function buildSeedTrustProfileCopy(): CommunityTrustBadgeProfile {
  return {
    userId: 'current_local_user',
    username: 'active_neighbor',
    displayNameFa: 'کاربر فعال محله',
    identityStatus: 'verified_phone',
    participationScore: 25,
    participationTierFa: 'همکار محله',
    verifiedCredentialFa: null,
    reputation: { data: 12, community: 8, research: 0, sources: 5, professional: 0 },
  };
}

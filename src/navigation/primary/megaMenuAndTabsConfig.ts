/** @file src/navigation/primary/megaMenuAndTabsConfig.ts — Mega Menu, Sub-Tabs & Account Sections (RT-UI-NAV-001) */
import type {
  AccountSubTabId,
  DiscoverSubTabId,
  KnowledgeSubTabId,
  MarketSubTabId,
  PropertiesSubTabId,
  RouteDestinationId,
  SecondaryTabDefinition,
  ServicesSubTabId,
  ToolsSubTabId,
} from '../registry/route.types';

export interface MegaMenuEntry {
  id: string;
  labelFa: string;
  labelEn: string;
  descFa: string;
  descEn: string;
  viewId?: RouteDestinationId;
  subTab?: string;
  actionId?: 'visited' | 'onboarding' | 'seo' | 'listing_verifier' | 'reverse_budget' | 'about';
  status: 'active' | 'beta';
}

export interface MegaMenuGroup {
  id: 'services' | 'knowledge' | 'contributions' | 'complementary';
  titleFa: string;
  titleEn: string;
  items: MegaMenuEntry[];
}

export const DESKTOP_MEGA_MENU_GROUPS: readonly MegaMenuGroup[] = [
  {
    id: 'services',
    titleFa: 'خدمات تخصصی',
    titleEn: 'Specialized Services',
    items: [
      {
        id: 'svc-valuation',
        labelFa: 'خدمات کارشناسی قیمت و ارزش‌گذاری',
        labelEn: 'Hedonic Valuation & Deal Desk',
        descFa: 'برآورد ارزش منصفانه و کشف حباب آگهی‌ها',
        descEn: 'Fair market estimate & listing bubble check',
        viewId: 'services',
        subTab: 'valuation',
        status: 'active',
      },
      {
        id: 'svc-consulting',
        labelFa: 'مشاوره معاملاتی و امنیت قرارداد',
        labelEn: 'Legal & Contract Shield',
        descFa: 'سپر اتاق قرارداد، چک‌ها و بررسی مبایعه‌نامه',
        descEn: 'Contract clauses, escrow timeline & audit',
        viewId: 'services',
        subTab: 'consulting',
        status: 'active',
      },
      {
        id: 'svc-inspection',
        labelFa: 'کارشناسی حضوری و ضوابط شهرداری',
        labelEn: 'Inspection & Zoning R122',
        descFa: 'چک‌لیست ۵۰ نقطه‌ای بازدید، گسل و تراکم',
        descEn: '50-point physical inspection & R122 rules',
        viewId: 'services',
        subTab: 'inspection',
        status: 'active',
      },
      {
        id: 'svc-agencies',
        labelFa: 'مشاوران و کارشناسان محله',
        labelEn: 'Verified Local Advisors',
        descFa: 'دسترسی به متخصصان هر محله و درخواست رزرو',
        descEn: 'Area specialists & verified sponsors',
        viewId: 'services',
        subTab: 'agencies',
        status: 'active',
      },
    ],
  },
  {
    id: 'knowledge',
    titleFa: 'دانش و اطلاعات',
    titleEn: 'Knowledge & Reports',
    items: [
      {
        id: 'know-reports',
        labelFa: 'گزارش‌های تحلیلی و نبض بازار',
        labelEn: 'Housing Cycle & Pulse Reports',
        descFa: 'چرخه رونق/رکود، شکاف معامله و مقایسه دارایی',
        descEn: 'Cycle analytics, closing spread & macro trends',
        viewId: 'knowledge',
        subTab: 'reports',
        status: 'active',
      },
      {
        id: 'know-guide',
        labelFa: 'راهنمای منطقه و بودجه مسکن',
        labelEn: 'Area & Budget Guides',
        descFa: 'راهنمای انتخاب محله متناسب با محل کار و بودجه',
        descEn: 'Commute & affordability neighborhood guide',
        viewId: 'knowledge',
        subTab: 'guide',
        status: 'active',
      },
      {
        id: 'know-methodology',
        labelFa: 'روش‌شناسی داده و شفافیت مدل',
        labelEn: 'Data Epistemics & Methodology',
        descFa: 'تفکیک نرخ اعلامی آگهی از معامله و IQR',
        descEn: 'How asking vs scenario deal & IQR work',
        viewId: 'knowledge',
        subTab: 'methodology',
        status: 'active',
      },
      {
        id: 'know-glossary',
        labelFa: 'واژه‌نامه و اصطلاحات بازار',
        labelEn: 'Real Estate Glossary',
        descFa: 'تعریف دقیق شاخص‌ها، قدرالسهم، رهن کامل و مبایعه‌نامه',
        descEn: 'Clear definitions for indices, deposits & contracts',
        viewId: 'knowledge',
        subTab: 'glossary',
        status: 'active',
      },
    ],
  },
  {
    id: 'contributions',
    titleFa: 'جامعه کاربران و مشارکت',
    titleEn: 'Community & Contributions',
    items: [
      {
        id: 'contrib-overview',
        labelFa: 'خانه جامعه و موضوعات تخصصی',
        labelEn: 'Community Home & Topics',
        descFa: 'ورود یکپارچه به گفت‌وگوها، موضوعات و محله‌ها',
        descEn: 'Explore specialized discussions, topics & neighborhoods',
        viewId: 'contributions',
        subTab: 'overview',
        status: 'active',
      },
      {
        id: 'contrib-questions',
        labelFa: 'پرسش و پاسخ تخصصی حقوقی و فنی',
        labelEn: 'Expert Q&A',
        descFa: 'طرح پرسش و دریافت پاسخ‌های منبع‌دار کارشناسان',
        descEn: 'Ask structured legal, zoning & valuation questions',
        viewId: 'contributions',
        subTab: 'questions',
        status: 'active',
      },
      {
        id: 'contrib-submit',
        labelFa: 'گزارش خطای داده و قیمت معامله',
        labelEn: 'Data Corrections & Price Claims',
        descFa: 'اصلاح نقشه، مترو و پالایش آگهی‌های پرت',
        descEn: 'Contribute verified data fixes and deals',
        viewId: 'contributions',
        subTab: 'submit',
        status: 'active',
      },
      {
        id: 'contrib-members',
        labelFa: 'اعضا، اعتبار چندمحوری و آیین‌نامه',
        labelEn: 'Members & Guidelines',
        descFa: 'شفافیت ۵ محور اعتبار، نشان‌ها و اصول رفتار',
        descEn: '5-axis reputation breakdown & community guidelines',
        viewId: 'contributions',
        subTab: 'members',
        status: 'beta',
      },
    ],
  },
];

export const DISCOVER_SECONDARY_TABS: readonly SecondaryTabDefinition<DiscoverSubTabId>[] = [
  { id: 'results', labelFa: 'محله‌های بازار', labelEn: 'Market Areas', path: '/areas' },
  { id: 'registry', labelFa: 'شاخص جغرافیایی استان‌ها', labelEn: 'Geographic Registry', path: '/areas/registry' },
];

export const COMMUNITY_SECONDARY_TABS: readonly SecondaryTabDefinition<string>[] = [
  { id: 'overview', labelFa: 'خانه جامعه', labelEn: 'Community Home', path: '/community' },
  { id: 'topics', labelFa: 'موضوعات', labelEn: 'Topics', path: '/community/topics' },
  { id: 'questions', labelFa: 'پرسش و پاسخ', labelEn: 'Q&A', path: '/community/questions' },
  { id: 'discussions', labelFa: 'گفت‌وگوها', labelEn: 'Discussions', path: '/community/discussions' },
  { id: 'submit', labelFa: 'ثبت مشارکت', labelEn: 'Contribute', path: '/community/contribute' },
  { id: 'members', labelFa: 'اعضا و آیین‌نامه', labelEn: 'Members', path: '/community/members' },
];

export const MARKET_SECONDARY_TABS: readonly SecondaryTabDefinition<MarketSubTabId>[] = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', path: '/market' },
  { id: 'prices', labelFa: 'قیمت خرید', labelEn: 'Sale Prices', path: '/market/prices' },
  { id: 'rent', labelFa: 'اجاره و رهن', labelEn: 'Rent & Deposit', path: '/market/rent' },
  { id: 'supply', labelFa: 'عرضه و آگهی', labelEn: 'Supply', path: '/market/supply' },
  { id: 'compare', labelFa: 'مقایسه بازار', labelEn: 'Compare', path: '/market/compare' },
  { id: 'reports', labelFa: 'گزارش‌ها', labelEn: 'Reports', path: '/market/reports' },
];

export const PROPERTIES_SECONDARY_TABS: readonly SecondaryTabDefinition<PropertiesSubTabId>[] = [
  { id: 'all', labelFa: 'همه املاک', labelEn: 'All', path: '/properties' },
  { id: 'buy', labelFa: 'خرید و فروش', labelEn: 'Buy', path: '/properties/buy' },
  { id: 'rent', labelFa: 'رهن و اجاره', labelEn: 'Rent', path: '/properties/rent' },
  { id: 'commercial', labelFa: 'تجاری', labelEn: 'Commercial', path: '/properties/commercial' },
  { id: 'office', labelFa: 'اداری', labelEn: 'Office', path: '/properties/office' },
];

export const TOOLS_SECONDARY_TABS: readonly SecondaryTabDefinition<ToolsSubTabId>[] = [
  { id: 'all', labelFa: 'همه ابزارها', labelEn: 'All Tools', path: '/tools' },
  { id: 'valuation', labelFa: 'ارزش‌گذاری ملک', labelEn: 'Valuation', path: '/tools/valuation' },
  { id: 'budget_fit', labelFa: 'تطبیق بودجه', labelEn: 'Budget Fit', path: '/tools/budget-fit' },
  { id: 'verifier', labelFa: 'سنجش آگهی', labelEn: 'Listing Verifier', path: '/tools/verifier' },
  { id: 'compare_props', labelFa: 'مقایسه املاک', labelEn: 'Compare Properties', path: '/tools/compare-properties' },
  { id: 'compare_areas', labelFa: 'مقایسه محله‌ها', labelEn: 'Compare Areas', path: '/tools/compare-areas' },
  { id: 'calculators', labelFa: 'محاسبه‌گرها', labelEn: 'Calculators', path: '/tools/calculators' },
];

export const SERVICES_SECONDARY_TABS: readonly SecondaryTabDefinition<ServicesSubTabId>[] = [
  { id: 'all', labelFa: 'همه خدمات', labelEn: 'All Services', path: '/services' },
  { id: 'valuation', labelFa: 'کارشناسی قیمت', labelEn: 'Valuation', path: '/services/valuation' },
  { id: 'consulting', labelFa: 'مشاوره حقوقی', labelEn: 'Consulting', path: '/services/consulting' },
  { id: 'inspection', labelFa: 'کارشناسی فنی', labelEn: 'Inspection', path: '/services/inspection' },
  { id: 'agencies', labelFa: 'مشاوران محله', labelEn: 'Agencies', path: '/services/agencies' },
];

export const KNOWLEDGE_SECONDARY_TABS: readonly SecondaryTabDefinition<KnowledgeSubTabId>[] = [
  { id: 'reports', labelFa: 'گزارش‌ها و پژوهش‌ها', labelEn: 'Reports', path: '/knowledge' },
  { id: 'guide', labelFa: 'راهنمای کاربردی', labelEn: 'Guide', path: '/knowledge/guide' },
  { id: 'methodology', labelFa: 'روش‌شناسی داده', labelEn: 'Methodology', path: '/knowledge/methodology' },
  { id: 'glossary', labelFa: 'فرهنگ‌نامه تخصصی', labelEn: 'Glossary', path: '/knowledge/glossary' },
];

export const ACCOUNT_NAVIGATION_TABS: readonly SecondaryTabDefinition<AccountSubTabId>[] = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', path: '/account' },
  { id: 'profile', labelFa: 'پروفایل', labelEn: 'Profile', path: '/account/profile' },
  { id: 'favorites', labelFa: 'علاقه‌مندی‌ها', labelEn: 'Favorites', path: '/account/favorites' },
  { id: 'saved_searches', labelFa: 'جست‌وجوهای ذخیره‌شده', labelEn: 'Saved Searches', path: '/account/saved-searches' },
  { id: 'saved_views', labelFa: 'نماهای نقشه', labelEn: 'Saved Map Views', path: '/account/saved-views' },
  { id: 'activity', labelFa: 'بازدیدها و فعالیت', labelEn: 'Activity', path: '/account/activity' },
  { id: 'contributions', labelFa: 'مشارکت‌ها', labelEn: 'Contributions', path: '/account/contributions' },
  { id: 'community', labelFa: 'جامعه من', labelEn: 'My Community', path: '/account/community' },
  { id: 'notifications', labelFa: 'اعلان‌ها', labelEn: 'Notifications', path: '/account/notifications' },
  { id: 'settings', labelFa: 'تنظیمات و حریم خصوصی', labelEn: 'Settings', path: '/account/settings' },
];

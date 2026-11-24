/** @file src/navigation/registry/public.routes.ts — Canonical Public Route Registry */
import type { RouteDefinition } from './route.types';

export const PUBLIC_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'home', viewId: 'home', path: '/', aliases: ['/home'],
    titleFa: 'خانه', titleEn: 'Home', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'خانه', breadcrumbEn: 'Home', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'map', viewId: 'map', path: '/map', aliases: ['/explore/map'], parentId: 'home',
    titleFa: 'نقشه', titleEn: 'Map', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'نقشه تعاملی', breadcrumbEn: 'Interactive Map', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'areas', viewId: 'discover', path: '/areas', aliases: ['/discover', '/search'], parentId: 'home',
    titleFa: 'محله‌ها', titleEn: 'Neighborhoods', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'محله‌ها', breadcrumbEn: 'Neighborhoods', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'areas.registry', viewId: 'discover', subTab: 'registry', path: '/areas/registry', aliases: ['/knowledge/methodology/geographic-registry'], parentId: 'areas',
    titleFa: 'رجیستری ملی جغرافیایی', titleEn: 'National Geographic Registry', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مرجع رسمی جغرافیایی', breadcrumbEn: 'Official Geographic Registry', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'market.overview', viewId: 'intelligence', subTab: 'overview', path: '/market', aliases: ['/intelligence', '/analytics', '/workspace/analytics'], parentId: 'home',
    titleFa: 'بازار', titleEn: 'Market', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'تحلیل بازار', breadcrumbEn: 'Market', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'market.prices', viewId: 'intelligence', subTab: 'prices', path: '/market/prices', parentId: 'market.overview',
    titleFa: 'قیمت خرید', titleEn: 'Sale Prices', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'قیمت خرید', breadcrumbEn: 'Sale Prices', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'market.rent', viewId: 'intelligence', subTab: 'rent', path: '/market/rent', parentId: 'market.overview',
    titleFa: 'اجاره و رهن', titleEn: 'Rent & Deposit', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'اجاره و رهن', breadcrumbEn: 'Rent', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'market.supply', viewId: 'intelligence', subTab: 'supply', path: '/market/supply', parentId: 'market.overview',
    titleFa: 'عرضه و فایل', titleEn: 'Market Supply', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'عرضه و آگهی', breadcrumbEn: 'Supply', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'market.compare', viewId: 'intelligence', subTab: 'compare', path: '/market/compare', parentId: 'market.overview',
    titleFa: 'مقایسه بازار', titleEn: 'Market Compare', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'مقایسه بازار', breadcrumbEn: 'Compare', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'market.reports', viewId: 'intelligence', subTab: 'reports', path: '/market/reports', parentId: 'market.overview',
    titleFa: 'گزارش‌های بازار', titleEn: 'Market Reports', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'گزارش‌ها', breadcrumbEn: 'Reports', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'properties.all', viewId: 'properties', subTab: 'all', path: '/properties', parentId: 'home',
    titleFa: 'املاک', titleEn: 'Properties', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'املاک', breadcrumbEn: 'Properties', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'properties.buy', viewId: 'properties', subTab: 'buy', path: '/properties/buy', parentId: 'properties.all',
    titleFa: 'خرید و فروش', titleEn: 'Buy', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'خرید و فروش', breadcrumbEn: 'Buy', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'properties.rent', viewId: 'properties', subTab: 'rent', path: '/properties/rent', parentId: 'properties.all',
    titleFa: 'رهن و اجاره', titleEn: 'Rent', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'رهن و اجاره', breadcrumbEn: 'Rent', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'properties.commercial', viewId: 'properties', subTab: 'commercial', path: '/properties/commercial', parentId: 'properties.all',
    titleFa: 'تجاری', titleEn: 'Commercial', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'تجاری', breadcrumbEn: 'Commercial', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'properties.office', viewId: 'properties', subTab: 'office', path: '/properties/office', parentId: 'properties.all',
    titleFa: 'اداری', titleEn: 'Office', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'اداری', breadcrumbEn: 'Office', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.all', viewId: 'tools', subTab: 'all', path: '/tools', parentId: 'home',
    titleFa: 'ابزارها', titleEn: 'Tools', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'ابزارها', breadcrumbEn: 'Tools', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'tools.valuation', viewId: 'tools', subTab: 'valuation', path: '/tools/valuation', parentId: 'tools.all',
    titleFa: 'ارزش‌گذاری ملک', titleEn: 'Valuation', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'ارزش‌گذاری', breadcrumbEn: 'Valuation', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.budget_fit', viewId: 'tools', subTab: 'budget_fit', path: '/tools/budget-fit', parentId: 'tools.all',
    titleFa: 'تطبیق بودجه و محله', titleEn: 'Budget Fit', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'تطبیق بودجه', breadcrumbEn: 'Budget Fit', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.verifier', viewId: 'tools', subTab: 'verifier', path: '/tools/verifier', parentId: 'tools.all',
    titleFa: 'سنجش قیمت آگهی', titleEn: 'Listing Verifier', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'سنجش آگهی', breadcrumbEn: 'Listing Verifier', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.compare_props', viewId: 'tools', subTab: 'compare_props', path: '/tools/compare-properties', parentId: 'tools.all',
    titleFa: 'مقایسه املاک', titleEn: 'Compare Properties', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'مقایسه املاک', breadcrumbEn: 'Compare Properties', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.compare_areas', viewId: 'tools', subTab: 'compare_areas', path: '/tools/compare-areas', parentId: 'tools.all',
    titleFa: 'مقایسه محله‌ها', titleEn: 'Compare Areas', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'مقایسه محله‌ها', breadcrumbEn: 'Compare Areas', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'tools.calculators', viewId: 'tools', subTab: 'calculators', path: '/tools/calculators', parentId: 'tools.all',
    titleFa: 'محاسبه‌گرها', titleEn: 'Calculators', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'محاسبه‌گرها', breadcrumbEn: 'Calculators', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'services', viewId: 'services', subTab: 'all', path: '/services', parentId: 'home',
    titleFa: 'خدمات تخصصی', titleEn: 'Services', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'خدمات تخصصی', breadcrumbEn: 'Services', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'services.valuation', viewId: 'services', subTab: 'valuation', path: '/services/valuation', parentId: 'services',
    titleFa: 'کارشناسی قیمت و ارزش‌گذاری', titleEn: 'Valuation Services', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'کارشناسی قیمت', breadcrumbEn: 'Valuation', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'services.consulting', viewId: 'services', subTab: 'consulting', path: '/services/consulting', aliases: ['/services/legal'], parentId: 'services',
    titleFa: 'مشاوره حقوقی و قرارداد', titleEn: 'Legal & Consulting', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مشاوره حقوقی', breadcrumbEn: 'Consulting', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'services.inspection', viewId: 'services', subTab: 'inspection', path: '/services/inspection', parentId: 'services',
    titleFa: 'کارشناسی فنی و بازدید', titleEn: 'Technical Inspection', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'کارشناسی فنی', breadcrumbEn: 'Inspection', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'services.agencies', viewId: 'services', subTab: 'agencies', path: '/services/agencies', parentId: 'services',
    titleFa: 'دفاتر و مشاوران محله', titleEn: 'Local Agencies', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مشاوران محله', breadcrumbEn: 'Agencies', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'knowledge', viewId: 'knowledge', subTab: 'reports', path: '/knowledge', parentId: 'home',
    aliases: ['/knowledge/reports', '/knowledge/search', '/research/workspace'],
    titleFa: 'دانش و گزارش‌ها', titleEn: 'Knowledge', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'دانش و اطلاعات', breadcrumbEn: 'Knowledge', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'knowledge.guide', viewId: 'knowledge', subTab: 'guide', path: '/knowledge/guide', parentId: 'knowledge',
    titleFa: 'راهنمای منطقه و بودجه', titleEn: 'Area & Budget Guide', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'راهنمای کاربردی', breadcrumbEn: 'Guide', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'knowledge.methodology', viewId: 'knowledge', subTab: 'methodology', path: '/knowledge/methodology', parentId: 'knowledge',
    titleFa: 'روش‌شناسی داده و شفافیت مدل', titleEn: 'Data Methodology & Transparency', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'روش‌شناسی داده', breadcrumbEn: 'Methodology', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'legal.privacy', viewId: 'knowledge', subTab: 'legal_privacy', path: '/legal/privacy', parentId: 'home',
    titleFa: 'سیاست حریم خصوصی و حفاظت از داده', titleEn: 'Privacy Policy', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'حریم خصوصی', breadcrumbEn: 'Privacy Policy', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'legal.terms', viewId: 'knowledge', subTab: 'legal_terms', path: '/legal/terms', parentId: 'home',
    titleFa: 'قوانین و شرایط استفاده از سامانه', titleEn: 'Terms of Use', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'قوانین استفاده', breadcrumbEn: 'Terms of Use', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'knowledge.glossary', viewId: 'knowledge', subTab: 'glossary', path: '/knowledge/glossary', parentId: 'knowledge',
    titleFa: 'فرهنگ‌نامه تخصصی املاک', titleEn: 'Real Estate Glossary', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'فرهنگ‌نامه', breadcrumbEn: 'Glossary', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'contributions', viewId: 'contributions', subTab: 'overview', path: '/community', parentId: 'home',
    aliases: ['/contributions', '/community/search'],
    titleFa: 'جامعه کاربران و مشارکت', titleEn: 'Community & Contributions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'جامعه و مشارکت', breadcrumbEn: 'Community', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'community.discussions', viewId: 'contributions', subTab: 'discussions', path: '/community/discussions', parentId: 'contributions',
    titleFa: 'گفت‌وگوهای جامعه', titleEn: 'Community Discussions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'گفت‌وگوها', breadcrumbEn: 'Discussions', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.questions', viewId: 'contributions', subTab: 'questions', path: '/community/questions', parentId: 'contributions',
    titleFa: 'پرسش و پاسخ تخصصی', titleEn: 'Expert Q&A', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'پرسش و پاسخ', breadcrumbEn: 'Questions', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.topics', viewId: 'contributions', subTab: 'topics', path: '/community/topics', parentId: 'contributions',
    titleFa: 'موضوعات جامعه', titleEn: 'Community Topics', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'موضوعات', breadcrumbEn: 'Topics', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.neighborhoods', viewId: 'contributions', subTab: 'neighborhoods', path: '/community/neighborhoods', parentId: 'contributions',
    titleFa: 'انجمن محله‌ها', titleEn: 'Neighborhood Discussions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'محله‌ها', breadcrumbEn: 'Neighborhoods', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.market', viewId: 'contributions', subTab: 'market', path: '/community/market', parentId: 'contributions',
    titleFa: 'تحلیل و گفت‌وگوی بازار', titleEn: 'Market Community', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'بازار', breadcrumbEn: 'Market', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.contributions', viewId: 'contributions', subTab: 'contributions', path: '/community/contributions', parentId: 'contributions',
    titleFa: 'مشارکت و اصلاح داده', titleEn: 'Data Contributions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مشارکت و اصلاح داده', breadcrumbEn: 'Contributions', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.reports', viewId: 'contributions', subTab: 'reports', path: '/community/reports', parentId: 'contributions',
    titleFa: 'گزارش‌های مردمی و تخلف', titleEn: 'Community Reports', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'گزارش‌ها', breadcrumbEn: 'Reports', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.research', viewId: 'contributions', subTab: 'research', path: '/community/research', parentId: 'contributions',
    titleFa: 'پیشنهاد پژوهش', titleEn: 'Research Proposals', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'پیشنهاد پژوهش', breadcrumbEn: 'Research', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.members', viewId: 'contributions', subTab: 'members', path: '/community/members', parentId: 'contributions',
    titleFa: 'اعضا و اعتبار', titleEn: 'Community Members', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'اعضا', breadcrumbEn: 'Members', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.guidelines', viewId: 'contributions', subTab: 'guidelines', path: '/community/guidelines', parentId: 'contributions',
    titleFa: 'آیین‌نامه جامعه', titleEn: 'Community Guidelines', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'آیین‌نامه', breadcrumbEn: 'Guidelines', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'community.help', viewId: 'contributions', subTab: 'help', path: '/community/help', parentId: 'contributions',
    titleFa: 'راهنمای جامعه', titleEn: 'Community Help', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'راهنما', breadcrumbEn: 'Help', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'contributions.submit', viewId: 'contributions', subTab: 'submit', path: '/community/contribute', aliases: ['/contributions/submit'], parentId: 'contributions',
    titleFa: 'ثبت گزارش داده و قیمت', titleEn: 'Submit Data Fix', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'ثبت مشارکت', breadcrumbEn: 'Contribute', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'contributions.points', viewId: 'contributions', subTab: 'points', path: '/contributions/points', parentId: 'contributions',
    titleFa: 'امتیاز و نشان‌های اعتبار', titleEn: 'Reputation Points', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'امتیازها', breadcrumbEn: 'Points', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'contributions.verify', viewId: 'contributions', subTab: 'verify', path: '/contributions/verify', parentId: 'contributions',
    titleFa: 'راستی‌آزمایی مشارکت‌ها', titleEn: 'Verify Contributions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'راستی‌آزمایی', breadcrumbEn: 'Verify', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.overview', viewId: 'userspace', subTab: 'overview', path: '/account', aliases: ['/userspace'], parentId: 'home',
    titleFa: 'حساب کاربری', titleEn: 'Account', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'حساب کاربری', breadcrumbEn: 'Account', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'account.profile', viewId: 'userspace', subTab: 'profile', path: '/account/profile', parentId: 'account.overview',
    titleFa: 'پروفایل کاربری', titleEn: 'Profile', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'پروفایل', breadcrumbEn: 'Profile', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.favorites', viewId: 'userspace', subTab: 'favorites', path: '/account/favorites',
    aliases: ['/account/saved', '/account/saved/properties', '/account/saved/neighborhoods', '/account/saved/knowledge'],
    parentId: 'account.overview',
    titleFa: 'علاقه‌مندی‌ها و ذخیره‌ها', titleEn: 'Saved Items', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'ذخیره‌های من', breadcrumbEn: 'Saved Items', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.saved_views', viewId: 'userspace', subTab: 'saved_views', path: '/account/saved-views',
    aliases: ['/account/saved/layers'],
    parentId: 'account.overview',
    titleFa: 'نماهای ذخیره‌شده نقشه', titleEn: 'Saved Views', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'نماهای ذخیره‌شده', breadcrumbEn: 'Saved Views', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.saved_searches', viewId: 'userspace', subTab: 'saved_searches', path: '/account/saved-searches',
    aliases: ['/account/search-history', '/account/saved/searches'],
    parentId: 'account.overview',
    titleFa: 'جست‌وجوهای ذخیره‌شده', titleEn: 'Saved Searches', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'جست‌وجوها', breadcrumbEn: 'Saved Searches', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.activity', viewId: 'userspace', subTab: 'activity', path: '/account/activity', parentId: 'account.overview',
    titleFa: 'بازدیدها و فعالیت', titleEn: 'Activity', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'بازدیدها و تاریخچه', breadcrumbEn: 'Activity', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.contributions', viewId: 'userspace', subTab: 'contributions', path: '/account/contributions', parentId: 'account.overview',
    titleFa: 'آگهی‌ها و درخواست‌های من', titleEn: 'Contributions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'آگهی‌ها و خدمات من', breadcrumbEn: 'Contributions', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.community', viewId: 'userspace', subTab: 'community', path: '/account/community', parentId: 'account.overview',
    titleFa: 'فعالیت و حریم جامعه من', titleEn: 'My Community', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'جامعه من', breadcrumbEn: 'My Community', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.notifications', viewId: 'userspace', subTab: 'notifications', path: '/account/notifications',
    aliases: ['/account/settings/notifications', '/account/inbox'], parentId: 'account.overview',
    titleFa: 'اعلان‌ها و پیام‌ها', titleEn: 'Notifications & Inbox', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'اعلان‌ها و پیام‌ها', breadcrumbEn: 'Notifications', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.settings', viewId: 'userspace', subTab: 'settings', path: '/account/settings',
    aliases: ['/account/preferences', '/account/preferences/display', '/account/preferences/map', '/account/preferences/search', '/account/privacy'],
    parentId: 'account.overview',
    titleFa: 'ترجیحات، شخصی‌سازی و حریم خصوصی', titleEn: 'Preferences & Privacy', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'تنظیمات و ترجیحات', breadcrumbEn: 'Settings', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'not_found', viewId: 'not_found', path: '/404', parentId: 'home',
    titleFa: 'مسیر یافت نشد', titleEn: 'Page Not Found', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مسیر نامعتبر', breadcrumbEn: 'Not Found', mobileVisibility: 'hidden', status: 'active',
  },
];

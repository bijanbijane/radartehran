/** @file src/navigation/registry/public.routes.ts — Canonical Public Route Registry */
import type { RouteDefinition } from './route.types';

export const PUBLIC_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'home', viewId: 'home', path: '/', aliases: ['/home'],
    titleFa: 'خانه', titleEn: 'Home', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'خانه', breadcrumbEn: 'Home', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'map', viewId: 'map', path: '/explore/map', aliases: ['/map'], parentId: 'home',
    titleFa: 'نقشه', titleEn: 'Map', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'نقشه تعاملی', breadcrumbEn: 'Interactive Map', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'areas', viewId: 'discover', path: '/areas', aliases: ['/discover'], parentId: 'home',
    titleFa: 'محله‌ها', titleEn: 'Neighborhoods', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'محله‌ها', breadcrumbEn: 'Neighborhoods', mobileVisibility: 'bottom_bar', status: 'active',
  },
  {
    id: 'market.overview', viewId: 'intelligence', subTab: 'overview', path: '/market', aliases: ['/intelligence'], parentId: 'home',
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
    navigationGroup: 'primary', breadcrumbFa: 'تجاری', breadcrumbEn: 'Commercial', mobileVisibility: 'hidden', status: 'beta',
  },
  {
    id: 'properties.office', viewId: 'properties', subTab: 'office', path: '/properties/office', parentId: 'properties.all',
    titleFa: 'اداری', titleEn: 'Office', shell: 'public', requiredPermissions: [],
    navigationGroup: 'primary', breadcrumbFa: 'اداری', breadcrumbEn: 'Office', mobileVisibility: 'hidden', status: 'beta',
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
    id: 'services', viewId: 'services', subTab: 'valuation', path: '/services', parentId: 'home',
    aliases: ['/services/valuation', '/services/consulting', '/services/inspection', '/services/agencies'],
    titleFa: 'خدمات تخصصی', titleEn: 'Services', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'خدمات تخصصی', breadcrumbEn: 'Services', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'knowledge', viewId: 'knowledge', subTab: 'reports', path: '/knowledge', parentId: 'home',
    aliases: ['/knowledge/reports', '/knowledge/guide', '/knowledge/methodology', '/knowledge/glossary'],
    titleFa: 'دانش و گزارش‌ها', titleEn: 'Knowledge', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'دانش و اطلاعات', breadcrumbEn: 'Knowledge', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'contributions', viewId: 'contributions', subTab: 'submit', path: '/contributions', parentId: 'home',
    aliases: ['/contributions/submit', '/contributions/points', '/contributions/verify'],
    titleFa: 'مشارکت کاربران', titleEn: 'Contributions', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مشارکت کاربران', breadcrumbEn: 'Contributions', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'account.overview', viewId: 'userspace', subTab: 'overview', path: '/account', aliases: ['/userspace'], parentId: 'home',
    titleFa: 'حساب کاربری', titleEn: 'Account', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'حساب کاربری', breadcrumbEn: 'Account', mobileVisibility: 'more_sheet', status: 'active',
  },
  {
    id: 'account.favorites', viewId: 'userspace', subTab: 'favorites', path: '/account/favorites', parentId: 'account.overview',
    titleFa: 'علاقه‌مندی‌ها', titleEn: 'Favorites', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'علاقه‌مندی‌ها', breadcrumbEn: 'Favorites', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.saved_views', viewId: 'userspace', subTab: 'saved_views', path: '/account/saved-views', parentId: 'account.overview',
    titleFa: 'نماهای ذخیره‌شده', titleEn: 'Saved Views', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'نماهای ذخیره‌شده', breadcrumbEn: 'Saved Views', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.saved_searches', viewId: 'userspace', subTab: 'saved_searches', path: '/account/saved-searches', parentId: 'account.overview',
    titleFa: 'جست‌وجوهای ذخیره‌شده', titleEn: 'Saved Searches', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'جست‌وجوها', breadcrumbEn: 'Saved Searches', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'account.notifications', viewId: 'userspace', subTab: 'notifications', path: '/account/notifications', parentId: 'account.overview',
    titleFa: 'اعلان‌ها', titleEn: 'Notifications', shell: 'public', requiredPermissions: [],
    navigationGroup: 'account', breadcrumbFa: 'اعلان‌ها', breadcrumbEn: 'Notifications', mobileVisibility: 'hidden', status: 'active',
  },
  {
    id: 'not_found', viewId: 'not_found', path: '/404', parentId: 'home',
    titleFa: 'مسیر یافت نشد', titleEn: 'Page Not Found', shell: 'public', requiredPermissions: [],
    navigationGroup: 'more', breadcrumbFa: 'مسیر نامعتبر', breadcrumbEn: 'Not Found', mobileVisibility: 'hidden', status: 'active',
  },
];

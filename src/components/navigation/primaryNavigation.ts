/** @file src/components/navigation/primaryNavigation.ts — Canonical RT-UI-NAV-001 Primary Nav Config (< 90 lines) [RULE-01] */
import type { ComponentType } from 'react';
import {
  Home, Compass, TrendingUp, Building2, SlidersHorizontal, User, Map, ShieldAlert,
} from 'lucide-react';
import {
  getRadarGlobalNavCopy,
  type PrimaryViewId,
  type RadarLocale,
} from '../../utils/areaUnit';
import {
  getCanonicalRouteForPrimaryView,
  PRIMARY_SHELL_VIEW_ORDER,
} from '../../navigation/registry/primaryNavigationMetadata';
import {
  canViewNavigationEntry,
  type NavigationVisibilityContext,
} from '../../navigation/registry/navigationVisibility';
import { guestNavigationVisibilityContext } from '../../navigation/registry/navigationPermissionBridge';

export type NavigationGroup = 'primary' | 'account' | 'administrative';

export interface ProductNavigationItem {
  id: PrimaryViewId;
  group: NavigationGroup;
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  description?: string;
  badge?: string;
  protected?: boolean;
}

const ICON_BY_REGISTRY_ID: Record<string, ProductNavigationItem['Icon']> = {
  home: Home,
  compass: Compass,
  map: Map,
  'trending-up': TrendingUp,
  'sliders-horizontal': SlidersHorizontal,
  user: User,
  'building-2': Building2,
  'shield-alert': ShieldAlert,
};

const NAV_GROUP_BY_VIEW: Record<PrimaryViewId, NavigationGroup> = {
  home: 'primary',
  discover: 'primary',
  map: 'primary',
  intelligence: 'primary',
  tools: 'primary',
  userspace: 'primary',
  properties: 'account',
  admin: 'administrative',
  services: 'primary',
  knowledge: 'primary',
  contributions: 'primary',
  not_found: 'primary',
};

const DESCRIPTION_FA: Partial<Record<PrimaryViewId, string>> = {
  home: 'خانه و چشم‌انداز سریع رادار',
  discover: 'کشف و کارنامه محله‌ها',
  map: 'اطلس مکانی و نقشه تهران',
  intelligence: 'روند قیمت و نبض بازار',
  tools: 'ارزش‌گذاری و ابزارهای محاسباتی',
  userspace: 'نشان‌شده‌ها و تنظیمات حساب',
  properties: 'جست‌وجوی املاک و فایل‌های شکار',
  admin: 'محیط مستقل مدیریت و پایش',
};

const DESCRIPTION_EN: Partial<Record<PrimaryViewId, string>> = {
  home: 'Radar Home & Quick Insights',
  discover: 'Explore Neighborhoods',
  map: 'Interactive Spatial Atlas',
  intelligence: 'Market Pulse & Price Metrics',
  tools: 'Calculators & Valuation',
  userspace: 'Saved Searches & Account',
  properties: 'Verified Deals & Listings',
  admin: 'System Monitoring & Security',
};

export function getProductNavigationItems(
  locale: RadarLocale,
  visibilityCtx: NavigationVisibilityContext = guestNavigationVisibilityContext(),
): ProductNavigationItem[] {
  const copy = getRadarGlobalNavCopy(locale);
  const isEn = locale === 'en';

  const labelByView: Record<string, string> = {
    home: copy.home,
    discover: copy.discover,
    map: copy.map,
    intelligence: copy.intelligence,
    tools: copy.tools,
    userspace: copy.userspace,
    properties: copy.properties,
    admin: copy.admin,
  };

  const items: ProductNavigationItem[] = [];

  for (const viewId of PRIMARY_SHELL_VIEW_ORDER) {
    const route = getCanonicalRouteForPrimaryView(viewId);
    if (!route || !canViewNavigationEntry(route, visibilityCtx)) continue;

    const id = viewId as PrimaryViewId;
    const Icon = ICON_BY_REGISTRY_ID[route.iconId ?? 'home'] ?? Home;

    items.push({
      id,
      group: NAV_GROUP_BY_VIEW[id] ?? 'primary',
      label: labelByView[viewId] ?? (isEn ? route.titleEn : route.titleFa),
      Icon,
      description: isEn ? DESCRIPTION_EN[id] : DESCRIPTION_FA[id],
      protected: route.requiredPermissions.length > 0,
    });
  }

  return items;
}
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

export function getProductNavigationItems(locale: RadarLocale): ProductNavigationItem[] {
  const copy = getRadarGlobalNavCopy(locale);

  return [
    {
      id: 'home',
      group: 'primary',
      label: copy.home,
      Icon: Home,
      description: locale === 'en' ? 'Radar Home & Quick Insights' : 'خانه و چشم‌انداز سریع رادار',
    },
    {
      id: 'discover',
      group: 'primary',
      label: copy.discover,
      Icon: Compass,
      description: locale === 'en' ? 'Explore Neighborhoods' : 'کشف و کارنامه محله‌ها',
    },
    {
      id: 'map',
      group: 'primary',
      label: copy.map,
      Icon: Map,
      description: locale === 'en' ? 'Interactive Spatial Atlas' : 'اطلس مکانی و نقشه تهران',
    },
    {
      id: 'intelligence',
      group: 'primary',
      label: copy.intelligence,
      Icon: TrendingUp,
      description: locale === 'en' ? 'Market Pulse & Price Metrics' : 'روند قیمت و نبض بازار',
    },
    {
      id: 'tools',
      group: 'primary',
      label: copy.tools,
      Icon: SlidersHorizontal,
      description: locale === 'en' ? 'Calculators & Valuation' : 'ارزش‌گذاری و ابزارهای محاسباتی',
    },
    {
      id: 'userspace',
      group: 'primary',
      label: copy.userspace,
      Icon: User,
      description: locale === 'en' ? 'Saved Searches & Account' : 'نشان‌شده‌ها و تنظیمات حساب',
    },
    {
      id: 'properties',
      group: 'account',
      label: copy.properties,
      Icon: Building2,
      description: locale === 'en' ? 'Verified Deals & Listings' : 'جست‌وجوی املاک و فایل‌های شکار',
    },
    {
      id: 'admin',
      group: 'administrative',
      label: copy.admin,
      Icon: ShieldAlert,
      protected: true,
      description: locale === 'en' ? 'System Monitoring & Security' : 'محیط مستقل مدیریت و پایش',
    },
  ];
}

/** @file src/components/navigation/primaryNavigation.ts — Primary Navigation Items (< 100 lines) [RULE-01] */
import type { ComponentType } from 'react';
import {
  Home, Compass, TrendingUp, SlidersHorizontal, User, Map, ShieldAlert,
} from 'lucide-react';
import {
  getRadarGlobalNavCopy,
  type PrimaryViewId,
  type RadarLocale,
} from '../../utils/areaUnit';

export type NavigationGroup = 'primary' | 'administrative';

export interface ProductNavigationItem {
  id: PrimaryViewId;
  group: NavigationGroup;
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  description?: string;
  badge?: string;
  /** Administrative entries require verified admin before navigation. */
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
      description: locale === 'en' ? 'Explore Neighborhoods' : 'کشف و تحلیل جامع محله‌ها',
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
      description: locale === 'en' ? 'Market Pulse & Price Metrics' : 'نبض بازار و شاخص‌های تورم مسکن',
    },
    {
      id: 'tools',
      group: 'primary',
      label: copy.tools,
      Icon: SlidersHorizontal,
      description: locale === 'en' ? 'Calculators & Valuation' : 'ابزارهای محاسباتی و قیمت‌گذاری',
    },
    {
      id: 'userspace',
      group: 'primary',
      label: copy.userspace,
      Icon: User,
      description: locale === 'en' ? 'Saved Searches & Shortlist' : 'فضای شخصی و نشان‌شده‌ها',
    },
    {
      id: 'admin',
      group: 'administrative',
      label: copy.admin,
      Icon: ShieldAlert,
      protected: true,
      description: locale === 'en' ? 'System Monitoring & Security' : 'مدیریت و پایش سیستم',
    },
  ];
}

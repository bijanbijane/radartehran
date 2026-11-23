/** @file src/components/navigation/viewRouterHelpers.ts — Sub-tab resolution & layout container helpers for ProductViewRouter */
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { ModuleSubTabId, SecondaryTabDefinition } from '../../navigation/registry/route.types';
import {
  ACCOUNT_NAVIGATION_TABS,
  DISCOVER_SECONDARY_TABS,
  MARKET_SECONDARY_TABS,
  PROPERTIES_SECONDARY_TABS,
  TOOLS_SECONDARY_TABS,
} from '../../navigation/primary/megaMenuAndTabsConfig';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';

export function resolveSecondaryTabsForView(viewId: PrimaryViewId): readonly SecondaryTabDefinition[] {
  if (viewId === 'discover') return DISCOVER_SECONDARY_TABS;
  if (viewId === 'intelligence') return MARKET_SECONDARY_TABS;
  if (viewId === 'properties') return PROPERTIES_SECONDARY_TABS;
  if (viewId === 'tools') return TOOLS_SECONDARY_TABS;
  if (viewId === 'userspace') return ACCOUNT_NAVIGATION_TABS;
  return [];
}

export function resolveEffectiveSubTab(
  viewId: PrimaryViewId,
  activeSubTab?: ModuleSubTabId,
): ModuleSubTabId | undefined {
  const tabs = resolveSecondaryTabsForView(viewId);
  if (tabs.length === 0) return activeSubTab;
  if (activeSubTab && tabs.some((t) => t.id === activeSubTab)) {
    return activeSubTab;
  }
  return tabs[0].id as ModuleSubTabId;
}

const CITY_NAME_EN: Record<CityId, string> = {
  tehran: 'Tehran',
  karaj: 'Karaj',
  mashhad: 'Mashhad',
  shiraz: 'Shiraz',
  isfahan: 'Isfahan',
};

export function resolveActiveCityDisplayName(activeCity: CityId, isEn: boolean): string {
  const cfg = MULTI_CITY_CONFIGS[activeCity];
  if (!cfg) return isEn ? 'Tehran' : 'تهران';
  return isEn ? CITY_NAME_EN[activeCity] || 'Tehran' : cfg.nameFa || 'تهران';
}

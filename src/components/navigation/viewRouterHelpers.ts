/** @file src/components/navigation/viewRouterHelpers.ts — Sub-tab resolution & layout container helpers for ProductViewRouter */
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { ModuleSubTabId, SecondaryTabDefinition } from '../../navigation/registry/route.types';
import {
  ACCOUNT_NAVIGATION_TABS,
  COMMUNITY_SECONDARY_TABS,
  DISCOVER_SECONDARY_TABS,
  KNOWLEDGE_SECONDARY_TABS,
  MARKET_SECONDARY_TABS,
  PROPERTIES_SECONDARY_TABS,
  SERVICES_SECONDARY_TABS,
  TOOLS_SECONDARY_TABS,
} from '../../navigation/primary/megaMenuAndTabsConfig';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';

export function resolveSecondaryTabsForView(viewId: PrimaryViewId): readonly SecondaryTabDefinition[] {
  if (viewId === 'discover') return DISCOVER_SECONDARY_TABS;
  if (viewId === 'intelligence') return MARKET_SECONDARY_TABS;
  if (viewId === 'properties') return PROPERTIES_SECONDARY_TABS;
  if (viewId === 'tools') return TOOLS_SECONDARY_TABS;
  if (viewId === 'services') return SERVICES_SECONDARY_TABS;
  if (viewId === 'knowledge') return KNOWLEDGE_SECONDARY_TABS;
  if (viewId === 'contributions') return COMMUNITY_SECONDARY_TABS;
  if (viewId === 'userspace') return ACCOUNT_NAVIGATION_TABS;
  return [];
}

const PRESERVED_COMMUNITY_SUBTABS = new Set<string>([
  'overview', 'discussions', 'questions', 'topics', 'neighborhoods',
  'submit', 'research', 'members', 'guidelines', 'market', 'contributions',
  'reports', 'help', 'points', 'verify',
]);

export function resolveEffectiveSubTab(
  viewId: PrimaryViewId,
  activeSubTab?: ModuleSubTabId,
): ModuleSubTabId | undefined {
  if (viewId === 'discover' && activeSubTab === 'registry') return 'registry';
  if (viewId === 'knowledge' && (activeSubTab === 'legal_privacy' || activeSubTab === 'legal_terms')) {
    return activeSubTab;
  }
  if (viewId === 'tools' && (activeSubTab === 'compare_props' || activeSubTab === 'lab')) {
    return activeSubTab;
  }
  if (viewId === 'contributions' && activeSubTab && PRESERVED_COMMUNITY_SUBTABS.has(activeSubTab)) {
    return activeSubTab;
  }
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

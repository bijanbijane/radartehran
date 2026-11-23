/** @file src/navigation/registry/route.types.ts — RT-UI-NAV-001 Navigation Domain Types */

export type NavigationShellType = 'public' | 'admin';

export type RouteAvailabilityStatus = 'active' | 'beta' | 'disabled';

export type RouteDestinationId =
  | 'home'
  | 'map'
  | 'discover'
  | 'intelligence'
  | 'properties'
  | 'tools'
  | 'userspace'
  | 'services'
  | 'knowledge'
  | 'contributions'
  | 'admin'
  | 'not_found';

export type NavGroupClassification = 'primary' | 'more' | 'account' | 'administrative';

export type DiscoverSubTabId = 'results' | 'registry';
export type MarketSubTabId = 'overview' | 'prices' | 'rent' | 'supply' | 'compare' | 'reports';
export type PropertiesSubTabId = 'all' | 'buy' | 'rent' | 'commercial' | 'office';
export type ToolsSubTabId = 'all' | 'valuation' | 'compare_props' | 'compare_areas' | 'calculators';
export type AccountSubTabId =
  | 'overview'
  | 'profile'
  | 'favorites'
  | 'saved_searches'
  | 'saved_views'
  | 'activity'
  | 'contributions'
  | 'community'
  | 'notifications'
  | 'settings';
export type ServicesSubTabId = 'valuation' | 'consulting' | 'inspection' | 'agencies';
export type KnowledgeSubTabId = 'reports' | 'guide' | 'methodology' | 'glossary';
export type ContributionsSubTabId =
  | 'overview'
  | 'discussions'
  | 'questions'
  | 'topics'
  | 'neighborhoods'
  | 'market'
  | 'contributions'
  | 'reports'
  | 'research'
  | 'members'
  | 'guidelines'
  | 'help'
  | 'submit'
  | 'points'
  | 'verify';
export type AdminSectionId = 'overview' | 'content' | 'data' | 'users' | 'operations' | 'security';

export type ModuleSubTabId =
  | DiscoverSubTabId
  | MarketSubTabId
  | PropertiesSubTabId
  | ToolsSubTabId
  | AccountSubTabId
  | ServicesSubTabId
  | KnowledgeSubTabId
  | ContributionsSubTabId
  | AdminSectionId;

export interface RouteDefinition {
  id: string;
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  path: string;
  aliases?: string[];
  titleFa: string;
  titleEn: string;
  parentId?: string;
  shell: NavigationShellType;
  requiredPermissions: string[];
  navigationGroup: NavGroupClassification;
  breadcrumbFa: string;
  breadcrumbEn: string;
  mobileVisibility: 'bottom_bar' | 'more_sheet' | 'drawer' | 'hidden';
  status: RouteAvailabilityStatus;
}

export interface BreadcrumbNode {
  id: string;
  label: string;
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  path: string;
  isCurrent: boolean;
  ellipsis?: boolean;
}

export interface SecondaryTabDefinition<T extends string = string> {
  id: T;
  labelFa: string;
  labelEn: string;
  path: string;
  status?: RouteAvailabilityStatus;
}

export type MapToolId = 'layers' | 'filters' | 'analysis' | 'locate' | 'compare' | 'save_view';
export type MapToolVisualState = 'default' | 'active' | 'open' | 'disabled';

export interface SavedMapViewItem {
  id: string;
  label: string;
  cityId: string;
  hoodId: number;
  hoodName: string;
  lens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';
  mode: 'rent' | 'buy';
  createdAt: string;
}

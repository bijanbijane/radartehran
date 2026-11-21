/** @file src/navigation/contextual/breadcrumb.ts — Contextual Breadcrumb Builder (RT-UI-NAV-001 Section 7) */
import { UNIFIED_NAVIGATION_ROUTES } from '../registry/unifiedNavigationRegistry';
import type { BreadcrumbNode, ModuleSubTabId, RouteDestinationId, RouteDefinition } from '../registry/route.types';

const ALL_ROUTES: readonly RouteDefinition[] = UNIFIED_NAVIGATION_ROUTES;

export interface BuildBreadcrumbsInput {
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  locale: 'fa' | 'en' | 'ar' | 'tr';
  cityName?: string;
  hoodName?: string;
  compactForMobile?: boolean;
}

function findMatchingRoute(viewId: RouteDestinationId, subTab?: ModuleSubTabId): RouteDefinition | undefined {
  if (subTab) {
    const exact = ALL_ROUTES.find((r) => r.viewId === viewId && r.subTab === subTab);
    if (exact) return exact;
  }
  return ALL_ROUTES.find((r) => r.viewId === viewId);
}

export function buildNavigationBreadcrumbs(input: BuildBreadcrumbsInput): BreadcrumbNode[] {
  const { viewId, subTab, locale, cityName, hoodName, compactForMobile = false } = input;
  const isEn = locale === 'en';
  const matched = findMatchingRoute(viewId, subTab);
  if (!matched) {
    return [
      { id: 'home', label: isEn ? 'Home' : 'خانه', viewId: 'home', path: '/', isCurrent: false },
      { id: 'unknown', label: isEn ? 'Not Found' : 'مسیر نامعتبر', viewId: 'not_found', path: '/404', isCurrent: true },
    ];
  }

  const chain: RouteDefinition[] = [];
  let cursor: RouteDefinition | undefined = matched;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? ALL_ROUTES.find((r) => r.id === cursor!.parentId) : undefined;
  }

  const nodes: BreadcrumbNode[] = chain.map((route) => ({
    id: route.id,
    label: isEn ? route.breadcrumbEn : route.breadcrumbFa,
    viewId: route.viewId,
    subTab: route.subTab,
    path: route.path,
    isCurrent: false,
  }));

  if (cityName && viewId !== 'admin' && viewId !== 'home' && viewId !== 'not_found') {
    nodes.splice(1, 0, {
      id: `city-${cityName}`,
      label: cityName,
      viewId: 'map',
      path: '/explore/map',
      isCurrent: false,
    });
  }

  if (hoodName && (viewId === 'discover' || viewId === 'intelligence' || viewId === 'properties' || viewId === 'tools')) {
    nodes.push({
      id: `hood-${hoodName}`,
      label: isEn ? hoodName : `محله ${hoodName}`,
      viewId,
      subTab,
      path: matched.path,
      isCurrent: true,
    });
  }

  if (nodes.length > 0) {
    nodes.forEach((n, i) => {
      n.isCurrent = i === nodes.length - 1;
    });
  }

  if (compactForMobile && nodes.length > 3) {
    return [
      nodes[0],
      { id: 'ellipsis', label: '…', viewId: nodes[1].viewId, path: nodes[1].path, isCurrent: false, ellipsis: true },
      nodes[nodes.length - 1],
    ];
  }

  return nodes;
}

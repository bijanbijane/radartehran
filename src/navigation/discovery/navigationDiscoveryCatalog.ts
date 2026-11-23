/**
 * RT-FE-NAVIGATION-ARCHITECTURE-014 — Registry-derived discovery for quick navigation (no fake entities).
 */
import type { GlobalSearchResult, NavigationCommand } from '../../features/onboarding/services/rtFeNavigation014Engine';
import { UNIFIED_NAVIGATION_ROUTES, type UnifiedRouteDefinition } from '../registry/unifiedNavigationRegistry';
import { canViewNavigationEntry, type NavigationVisibilityContext } from '../registry/navigationVisibility';

function normalizeFa(raw: string): string {
  return raw
    .replace(/\u200c/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function routeToDiscovery(route: UnifiedRouteDefinition): GlobalSearchResult {
  return {
    id: `nav-${route.id}`,
    type: route.viewId === 'tools' ? 'feature' : 'page',
    title: route.titleFa,
    href: route.path,
    sourceFeature: route.id,
  };
}

function routeToCommand(route: UnifiedRouteDefinition): NavigationCommand {
  return {
    id: `cmd-${route.id}`,
    label: `رفتن به ${route.titleFa}`,
    category: 'navigation',
    keywords: [...route.searchKeywordsFa, ...route.searchKeywordsEn, route.path],
    requiredPermissions: route.requiredPermissions.length ? [...route.requiredPermissions] : undefined,
    enabled: route.status !== 'disabled',
  };
}

const DISCOVERABLE_ROUTES = UNIFIED_NAVIGATION_ROUTES.filter(
  (r) => r.status !== 'disabled' && r.viewId !== 'not_found' && r.mobileVisibility !== 'hidden',
);

export function buildNavigationDiscoveryCatalog(ctx: NavigationVisibilityContext): {
  pages: GlobalSearchResult[];
  commands: NavigationCommand[];
} {
  const visible = DISCOVERABLE_ROUTES.filter((r) => canViewNavigationEntry(r, ctx));
  return {
    pages: visible.map(routeToDiscovery),
    commands: visible.slice(0, 24).map(routeToCommand),
  };
}

function dedupeDiscoveryPages(pages: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  return pages.filter((p) => {
    if (seen.has(p.href)) return false;
    seen.add(p.href);
    return true;
  });
}

export function searchNavigationDiscovery(
  query: string,
  ctx: NavigationVisibilityContext,
): { pages: GlobalSearchResult[]; commands: NavigationCommand[] } {
  const catalog = buildNavigationDiscoveryCatalog(ctx);
  const norm = normalizeFa(query);
  if (!norm) {
    return { ...catalog, pages: dedupeDiscoveryPages(catalog.pages) };
  }
  const pages = dedupeDiscoveryPages(catalog.pages.filter(
    (p) =>
      normalizeFa(p.title).includes(norm) ||
      UNIFIED_NAVIGATION_ROUTES.some(
        (r) => r.id === p.sourceFeature && r.searchKeywordsFa.some((k) => normalizeFa(k).includes(norm)),
      ),
  ));
  const commands = catalog.commands.filter(
    (c) =>
      !c.requiredPermissions?.length ||
      c.requiredPermissions.every((perm) => ctx.userPermissions.includes(perm)),
  ).filter(
    (c) =>
      normalizeFa(c.label).includes(norm) ||
      c.keywords.some((k) => normalizeFa(k).includes(norm)),
  );
  return { pages, commands };
}
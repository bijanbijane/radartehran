/**
 * @file src/platform/entity-detail/navigation/EntityDetailRoutes.ts
 * @description Canonical URL routing, deep-link parsing, and legacy slug/ID resolution for Entity Detail pages (Stage 7).
 */

import { buildCanonicalEntityDetailPath } from '../core/EntityDetailContract';
import type { EntityType } from '../core/EntityDetailTypes';
import type { DetailSectionId } from '../sections/SectionRegistry';

export interface ParsedEntityDetailRoute {
  isValid: boolean;
  entityType: EntityType | null;
  entityId: string | null;
  canonicalPath: string | null;
  activeTab?: DetailSectionId;
  returnUrl?: string;
}

const ROUTE_PREFIX_TO_TYPE: Record<string, EntityType> = {
  properties: 'property',
  property: 'property',
  listings: 'listing',
  listing: 'listing',
  buildings: 'building',
  building: 'building',
  neighborhoods: 'neighborhood',
  neighborhood: 'neighborhood',
};

export function parseEntityDetailPath(rawUrlOrPath: string): ParsedEntityDetailRoute {
  const trimmed = String(rawUrlOrPath || '').trim();
  if (!trimmed) {
    return { isValid: false, entityType: null, entityId: null, canonicalPath: null };
  }

  let pathname = trimmed;
  let search = '';
  const qIdx = trimmed.indexOf('?');
  if (qIdx >= 0) {
    pathname = trimmed.slice(0, qIdx);
    search = trimmed.slice(qIdx + 1);
  }

  const segments = pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return { isValid: false, entityType: null, entityId: null, canonicalPath: null };
  }

  const prefix = segments[0].toLowerCase();
  const entityType = ROUTE_PREFIX_TO_TYPE[prefix] ?? null;
  const rawId = decodeURIComponent(segments[1] || '').trim();

  if (!entityType || !rawId || rawId.length > 160 || /[<>'"\\]/.test(rawId)) {
    return { isValid: false, entityType: null, entityId: null, canonicalPath: null };
  }

  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') as DetailSectionId | null;
  const returnToParam = params.get('returnTo');

  const safeReturnUrl =
    returnToParam && returnToParam.startsWith('/') && !returnToParam.startsWith('//')
      ? returnToParam
      : undefined;

  return {
    isValid: true,
    entityType,
    entityId: rawId,
    canonicalPath: buildCanonicalEntityDetailPath(entityType, rawId),
    activeTab: tabParam || undefined,
    returnUrl: safeReturnUrl,
  };
}

export function buildEntityDetailUrlWithContext(
  entityType: EntityType,
  entityId: string,
  options: {
    tab?: DetailSectionId;
    returnUrl?: string;
  } = {}
): string {
  const basePath = buildCanonicalEntityDetailPath(entityType, entityId);
  const params = new URLSearchParams();
  if (options.tab) {
    params.set('tab', options.tab);
  }
  if (options.returnUrl && options.returnUrl.startsWith('/') && !options.returnUrl.startsWith('//')) {
    params.set('returnTo', options.returnUrl);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

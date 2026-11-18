/**
 * @file src/platform/search/cache/SearchCacheKey.ts
 * @description Canonical Workspace & Permission-isolated Search Cache Key builder.
 * Format: search:{userId}:{workspaceId}:{permissionVersion}:{queryHash}:{filterHash}:{viewportHash}:{page}
 */

import { computeDeterministicHash } from '../core/SearchQuery';
import type { SearchRequest } from '../core/SearchTypes';

export function buildSearchCacheKey(request: SearchRequest): string {
  const safeUser = (request.userId || 'guest').trim() || 'guest';
  const safeWorkspace = (request.workspaceId || 'personal').trim() || 'personal';
  const safePermVer = Number.isFinite(request.permissionVersion)
    ? Math.max(1, Math.floor(request.permissionVersion!))
    : 1;

  const queryHash = computeDeterministicHash({
    q: request.normalizedQuery,
    scope: request.scope,
    cityId: request.cityId || '',
    hoods: request.neighborhoodIds || [],
    sort: request.sort,
    pageSize: request.pagination.pageSize,
    cursor: request.pagination.cursor || '',
  });

  const sortedFilters = [...request.filters].sort((a, b) => a.id.localeCompare(b.id));
  const filterHash = computeDeterministicHash(
    sortedFilters.map((f) => ({ id: f.id, field: f.field, op: f.operator, val: f.value, unit: f.unit }))
  );

  const viewportHash = request.bounds
    ? computeDeterministicHash({
        n: Number(request.bounds.north.toFixed(4)),
        s: Number(request.bounds.south.toFixed(4)),
        e: Number(request.bounds.east.toFixed(4)),
        w: Number(request.bounds.west.toFixed(4)),
      })
    : 'nobounds';

  const page = Math.max(1, Math.floor(request.pagination.page));

  return `search:${safeUser}:${safeWorkspace}:${safePermVer}:${queryHash}:${filterHash}:${viewportHash}:${page}`;
}

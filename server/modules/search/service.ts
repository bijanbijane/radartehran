import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  requireSafeFirestoreId,
  runDurableTransaction,
  type AuthenticatedPrincipal,
} from '../core';
import type {
  DiscoverablePublicListing,
  SaveSearchConfigInput,
  SearchFilterQuery,
  SearchModuleDependencies,
  SearchResultPage,
  SearchSortOption,
  StoredSavedSearch,
} from './types';
import { parseSearchFilterQuery, validateSaveSearchInput } from './validation';

interface DecodedCursor {
  sortKey: string | number;
  id: string;
}

function encodeCursor(sortKey: string | number, id: string): string {
  const payload = JSON.stringify({ sortKey, id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursorStr: string): DecodedCursor | null {
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && parsed.sortKey !== undefined) {
      return { sortKey: parsed.sortKey, id: parsed.id };
    }
  } catch {
    // Malformed cursor
  }
  return null;
}

export function createSearchService(deps: SearchModuleDependencies) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());

  function requireSafeId(rawId: unknown, name: string): string {
    const res = requireSafeFirestoreId()(rawId, name);
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${name}.`, res.issues);
    return res.value;
  }

  function matchesKeyword(item: DiscoverablePublicListing, keyword?: string): boolean {
    if (!keyword) return true;
    const kw = keyword.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(kw);
    const streetMatch = item.street.toLowerCase().includes(kw);
    const hoodMatch = item.hoodName?.toLowerCase().includes(kw);
    const profitMatch = item.buyerProfitText.toLowerCase().includes(kw);
    return titleMatch || streetMatch || Boolean(hoodMatch) || profitMatch;
  }

  function matchesFilters(item: DiscoverablePublicListing, filters: SearchFilterQuery): boolean {
    if (filters.cityId && item.cityId !== filters.cityId) return false;
    if (filters.hoodIds && filters.hoodIds.length > 0 && !filters.hoodIds.includes(item.hoodId)) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.minSqm !== undefined && item.sqm < filters.minSqm) return false;
    if (filters.maxSqm !== undefined && item.sqm > filters.maxSqm) return false;
    if (filters.minDiscountPercent !== undefined && item.discountPercent < filters.minDiscountPercent) return false;

    if (filters.minPriceMillion !== undefined) {
      if (item.priceNumericMillion === undefined || item.priceNumericMillion < filters.minPriceMillion) return false;
    }
    if (filters.maxPriceMillion !== undefined) {
      if (item.priceNumericMillion === undefined || item.priceNumericMillion > filters.maxPriceMillion) return false;
    }
    if (filters.minRentMillion !== undefined) {
      if (item.rentNumericMillion === undefined || item.rentNumericMillion < filters.minRentMillion) return false;
    }
    if (filters.maxRentMillion !== undefined) {
      if (item.rentNumericMillion === undefined || item.rentNumericMillion > filters.maxRentMillion) return false;
    }

    return matchesKeyword(item, filters.keyword);
  }

  function sortListings(items: DiscoverablePublicListing[], sort: SearchSortOption): DiscoverablePublicListing[] {
    return [...items].sort((a, b) => {
      switch (sort) {
        case 'newest': {
          const timeA = a.approvedAtIso ?? a.createdAtIso;
          const timeB = b.approvedAtIso ?? b.createdAtIso;
          if (timeA !== timeB) return timeB.localeCompare(timeA);
          return b.id.localeCompare(a.id); // Deterministic tie-breaker
        }
        case 'oldest': {
          const timeA = a.approvedAtIso ?? a.createdAtIso;
          const timeB = b.approvedAtIso ?? b.createdAtIso;
          if (timeA !== timeB) return timeA.localeCompare(timeB);
          return a.id.localeCompare(b.id);
        }
        case 'price_asc': {
          const priceA = a.priceNumericMillion ?? 0;
          const priceB = b.priceNumericMillion ?? 0;
          if (priceA !== priceB) return priceA - priceB;
          return a.id.localeCompare(b.id);
        }
        case 'price_desc': {
          const priceA = a.priceNumericMillion ?? 0;
          const priceB = b.priceNumericMillion ?? 0;
          if (priceA !== priceB) return priceB - priceA;
          return b.id.localeCompare(a.id);
        }
        case 'sqm_desc': {
          if (a.sqm !== b.sqm) return b.sqm - a.sqm;
          return b.id.localeCompare(a.id);
        }
        case 'sqm_asc': {
          if (a.sqm !== b.sqm) return a.sqm - b.sqm;
          return a.id.localeCompare(b.id);
        }
      }
    });
  }

  function extractSortKey(item: DiscoverablePublicListing, sort: SearchSortOption): string | number {
    switch (sort) {
      case 'newest':
      case 'oldest':
        return item.approvedAtIso ?? item.createdAtIso;
      case 'price_asc':
      case 'price_desc':
        return item.priceNumericMillion ?? 0;
      case 'sqm_desc':
      case 'sqm_asc':
        return item.sqm;
    }
  }

  return {
    /**
     * 3, 4, 5, 6, 10. Search, Filter, Sort & Cursor-Paginate Public Approved Listings
     */
    async searchPublicListings(rawQuery: unknown): Promise<SearchResultPage> {
      const parsed = parseSearchFilterQuery(rawQuery);
      if (!parsed.ok || !parsed.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid search filter parameters.', parsed.issues);
      }
      const filter = parsed.value;
      const pageSize = filter.limit ?? 20;
      const appliedSort = filter.sort ?? 'newest';

      // 1. Fetch approved public listings via read adapter
      const sourceListings = await deps.listingDataSource.queryPublicApprovedListings({
        cityId: filter.cityId,
        hoodIds: filter.hoodIds,
        type: filter.type,
        limit: 1000, // Safe bounded query
      });

      // 2. Strict public projection safety: filter only approved and non-expired
      const nowMs = nowFn();
      const publicApproved = sourceListings.filter((item) => {
        if (item.expiresAtIso && Date.parse(item.expiresAtIso) <= nowMs) return false;
        return matchesFilters(item, filter);
      });

      // 3. Stable sorting with deterministic tie-breaking
      const sorted = sortListings(publicApproved, appliedSort);

      // 4. Cursor pagination handling
      let startIndex = 0;
      if (filter.cursor) {
        const decoded = decodeCursor(filter.cursor);
        if (!decoded) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid or malformed pagination cursor.');
        }
        const cursorIndex = sorted.findIndex((item) => item.id === decoded.id);
        if (cursorIndex !== -1) {
          startIndex = cursorIndex + 1;
        }
      }

      const paginatedItems = sorted.slice(startIndex, startIndex + pageSize);
      let nextCursor: string | undefined;

      if (startIndex + pageSize < sorted.length && paginatedItems.length > 0) {
        const lastItem = paginatedItems[paginatedItems.length - 1];
        nextCursor = encodeCursor(extractSortKey(lastItem, appliedSort), lastItem.id);
      }

      const { cursor: _c, limit: _l, ...cleanFilters } = filter;
      return {
        items: paginatedItems,
        nextCursor,
        totalEstimatedCount: sorted.length,
        appliedSort,
        appliedFilters: cleanFilters,
      };
    },

    /**
     * 8. Saved Search Support (User Stored Search Configurations)
     */
    async saveSearchConfig(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      rawBody: unknown;
    }): Promise<{ savedSearch: StoredSavedSearch; replayed: boolean }> {
      const authz = await authorizePrincipal(params.principal, { minimumRole: 'verified_user' });
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      const validation = validateSaveSearchInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid saved search configuration.', validation.issues);
      }
      const input = validation.value;

      try {
        const outcome = await executeIdempotentMutation<StoredSavedSearch>({
          store: idempotencyStore,
          actorUid: params.principal.uid,
          operation: 'search.save_config',
          idempotencyKey: params.idempotencyKey,
          requestPayload: input,
          nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowTs = normalizeFirestoreTimestamp(nowFn())!;
            const savedSearchId = `saved_srch_${crypto.randomBytes(6).toString('hex')}`;

            const doc: StoredSavedSearch = {
              id: savedSearchId,
              ownerUid: params.principal.uid,
              titleFa: input.titleFa,
              filterQuery: input.filterQuery,
              createdAt: nowTs,
              updatedAt: nowTs,
            };

            await runDurableTransaction(deps.txRunner, { operationName: 'search.save_config', maxAttempts: 3 }, async (tx) => {
              tx.set(`savedSearches/${savedSearchId}`, doc as unknown as Record<string, unknown>);
            });

            return { statusCode: 201, body: doc };
          },
        });

        return { savedSearch: outcome.body, replayed: outcome.replayed };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Failed to save search.');
      }
    },

    async getUserSavedSearches(params: {
      principal: AuthenticatedPrincipal;
    }): Promise<{ savedSearches: StoredSavedSearch[] }> {
      const authz = await authorizePrincipal(params.principal, { minimumRole: 'verified_user' });
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      return runDurableTransaction(deps.txRunner, { operationName: 'search.get_saved', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<{ items?: StoredSavedSearch[] }>(`userSavedSearchesIndex/${params.principal.uid}`);
        const items = snap.exists && snap.data?.items ? snap.data.items : [];
        const isolated = items.filter((s) => s.ownerUid === params.principal.uid);
        return { savedSearches: isolated };
      });
    },

    async deleteSavedSearch(params: {
      principal: AuthenticatedPrincipal;
      savedSearchId: string;
    }): Promise<{ deleted: boolean }> {
      const savedSearchId = requireSafeId(params.savedSearchId, 'savedSearchId');
      return runDurableTransaction(deps.txRunner, { operationName: 'search.delete_saved', maxAttempts: 3 }, async (tx) => {
        const path = `savedSearches/${savedSearchId}`;
        const snap = await tx.get<StoredSavedSearch>(path);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Saved search not found.');
        if (snap.data.ownerUid !== params.principal.uid) {
          throw new CoreApiError('FORBIDDEN', 403, 'Cannot delete another user’s saved search.');
        }
        tx.delete(path);
        return { deleted: true };
      });
    },
  };
}

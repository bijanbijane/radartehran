/**
 * @file src/features/search/hooks/useUnifiedSearch.ts
 * @description React hook for Stage 5 Unified Search & Discovery orchestration.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SearchCoordinator,
  buildQuerySuggestions,
  createCanonicalSearchRequest,
  deduplicateAndNormalizeFilters,
  globalWorkspaceSearchHistory,
  removeFilterIsolated,
  resetFiltersInContext,
  type AreaUnit,
  type SearchFilter,
  type SearchGeoBounds,
  type SearchRequest,
  type SearchScope,
  type SearchSort,
  type UnifiedSearchExecutionResponse,
} from '../../../platform/search';
import { createRealRadarSearchProviders } from '../adapters/searchBackendAdapter';

export interface UseUnifiedSearchOptions {
  initialCityId?: string;
  userId?: string | null;
  workspaceId?: string;
  permissionVersion?: number;
  areaUnit?: AreaUnit;
}

export function useUnifiedSearch(options: UseUnifiedSearchOptions = {}) {
  const coordinatorRef = useRef<SearchCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new SearchCoordinator({
      providers: createRealRadarSearchProviders(),
    });
  }

  const [request, setRequest] = useState<SearchRequest>(() =>
    createCanonicalSearchRequest({
      cityId: options.initialCityId || 'tehran',
      userId: options.userId ?? null,
      workspaceId: options.workspaceId ?? 'personal',
      permissionVersion: options.permissionVersion ?? 1,
    })
  );

  const [response, setResponse] = useState<UnifiedSearchExecutionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredResultId, setHoveredResultId] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const reqSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextUserId = options.userId ?? null;
    const nextWorkspaceId = options.workspaceId ?? 'personal';
    const nextPermVersion = options.permissionVersion ?? 1;
    setRequest((prev) => {
      if (
        prev.userId === nextUserId &&
        prev.workspaceId === nextWorkspaceId &&
        prev.permissionVersion === nextPermVersion
      ) {
        return prev;
      }
      return createCanonicalSearchRequest({
        ...prev,
        userId: nextUserId,
        workspaceId: nextWorkspaceId,
        permissionVersion: nextPermVersion,
      });
    });
  }, [options.userId, options.workspaceId, options.permissionVersion]);

  const execute = useCallback(async (nextReq: SearchRequest) => {
    const seq = ++reqSeqRef.current;
    setIsLoading(true);
    try {
      const res = await coordinatorRef.current!.executeSearch(nextReq);
      if (res && isMountedRef.current && seq === reqSeqRef.current) {
        setResponse(res);
      }
    } finally {
      if (isMountedRef.current && seq === reqSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void execute(request);
  }, [request, execute]);

  const setRawQuery = useCallback((rawQuery: string) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        rawQuery,
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const submitSearch = useCallback(
    (rawQuery: string) => {
      globalWorkspaceSearchHistory.recordSearch({
        userId: request.userId,
        workspaceId: request.workspaceId,
        rawQuery,
        scope: request.scope,
        cityId: request.cityId,
      });
      setRawQuery(rawQuery);
    },
    [request.userId, request.workspaceId, request.scope, request.cityId, setRawQuery]
  );

  const addOrUpdateFilter = useCallback((filter: SearchFilter) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        filters: deduplicateAndNormalizeFilters([...prev.filters, filter]),
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const removeFilter = useCallback((idOrField: string) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        filters: removeFilterIsolated(prev.filters, idOrField),
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const resetFilters = useCallback(() => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        filters: resetFiltersInContext(prev.filters, { scope: prev.scope }),
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const setScope = useCallback((scope: SearchScope) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        scope,
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const setSort = useCallback((sort: SearchSort) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        sort,
        pagination: { ...prev.pagination, page: 1, cursor: null },
      })
    );
  }, []);

  const setPage = useCallback((page: number) => {
    setRequest((prev) =>
      createCanonicalSearchRequest({
        ...prev,
        pagination: { ...prev.pagination, page },
      })
    );
  }, []);

  const switchCity = useCallback((nextCityId: string) => {
    setRequest((prev) => coordinatorRef.current!.switchCityContext(prev, nextCityId));
  }, []);

  const setMapBounds = useCallback((bounds: SearchGeoBounds | undefined) => {
    setRequest((prev) => coordinatorRef.current!.applyMapBoundsFilter(prev, bounds));
  }, []);

  const suggestions = useMemo(() => {
    const recent = globalWorkspaceSearchHistory
      .listRecent(request.userId, request.workspaceId)
      .map((r) => r.rawQuery);
    return buildQuerySuggestions({
      rawQuery: request.rawQuery,
      recentQueries: recent,
    });
  }, [request.rawQuery, request.userId, request.workspaceId]);

  return {
    request,
    response,
    isLoading,
    suggestions,
    hoveredResultId,
    selectedResultId,
    setHoveredResultId,
    setSelectedResultId,
    setRawQuery,
    submitSearch,
    addOrUpdateFilter,
    removeFilter,
    resetFilters,
    setScope,
    setSort,
    setPage,
    switchCity,
    setMapBounds,
  };
}

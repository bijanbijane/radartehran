/**
 * @file src/features/results/hooks/useResultsPresentation.ts
 * @description Stage 6 Hook managing Result Presentation Mode, Sort, Pagination, Selection, and Comparison without re-running Query on view switch.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RESULT_PAGE_SIZE,
  ResultComparisonController,
  ResultSelectionController,
  applySortChangeAndResetPage,
  buildResultPaginationModel,
  clampPageSize,
  sortResultItemsClientSide,
  type ResultEntityType,
  type ResultItem,
  type ResultPresentationMode,
  type ResultSortDirection,
  type ResultSortField,
  type ResultSortSpec,
} from '../../../platform/presentation';

export interface UseResultsPresentationOptions {
  initialItems: readonly ResultItem[];
  initialMode?: ResultPresentationMode;
  initialPageSize?: number;
  datasetContextKey?: string;
}

export function useResultsPresentation(options: UseResultsPresentationOptions) {
  const [mode, setMode] = useState<ResultPresentationMode>(options.initialMode ?? 'card-grid');
  const [sort, setSort] = useState<ResultSortSpec>({ field: 'totalPrice', direction: 'desc' });
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(() => clampPageSize(options.initialPageSize ?? DEFAULT_RESULT_PAGE_SIZE));
  const [, setVersionTick] = useState(0);

  const selectionControllerRef = useRef(new ResultSelectionController(options.datasetContextKey ?? 'default'));
  const comparisonControllerRef = useRef(new ResultComparisonController());

  // Sync dataset context so incompatible filter/city switches clear stale selections while renderer switches preserve them
  selectionControllerRef.current.syncWithDatasetContext(options.datasetContextKey ?? 'default');

  const sortedItems = useMemo(
    () => sortResultItemsClientSide(options.initialItems, sort),
    [options.initialItems, sort]
  );

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page, pageSize]);

  const paginationModel = useMemo(
    () =>
      buildResultPaginationModel({
        mode: 'offset',
        page,
        pageSize,
        receivedCount: pagedItems.length,
        totalCount: sortedItems.length,
      }),
    [page, pageSize, pagedItems.length, sortedItems.length]
  );

  const changePresentationMode = useCallback((nextMode: ResultPresentationMode) => {
    // Rule 4.4 & 7.2: Switching Card <-> Table preserves current page, selection, and dataset without re-running API query
    setMode(nextMode);
  }, []);

  const changeSort = useCallback(
    (field: ResultSortField, direction: ResultSortDirection) => {
      const next = applySortChangeAndResetPage(page, field, direction);
      setSort(next.sort);
      setPage(next.nextPage);
    },
    [page]
  );

  const changePageSize = useCallback((nextSize: number) => {
    setPageSize(clampPageSize(nextSize));
    setPage(1);
  }, []);

  const toggleSelectItem = useCallback((item: ResultItem) => {
    selectionControllerRef.current.toggleOne(item);
    setVersionTick((t) => t + 1);
  }, []);

  const selectCurrentPage = useCallback(() => {
    selectionControllerRef.current.selectCurrentPage(pagedItems);
    setVersionTick((t) => t + 1);
  }, [pagedItems]);

  const clearSelection = useCallback(() => {
    selectionControllerRef.current.clearSelection();
    setVersionTick((t) => t + 1);
  }, []);

  const addToComparison = useCallback((item: ResultItem) => {
    const res = comparisonControllerRef.current.addEntity(item);
    setVersionTick((t) => t + 1);
    return res;
  }, []);

  const removeFromComparison = useCallback((entityId: string) => {
    const res = comparisonControllerRef.current.removeEntity(entityId);
    setVersionTick((t) => t + 1);
    return res;
  }, []);

  const clearComparison = useCallback(() => {
    comparisonControllerRef.current.clearAll();
    setVersionTick((t) => t + 1);
  }, []);

  const selectedIdsSet = new Set(selectionControllerRef.current.getState().selectedIds);
  const comparisonItems = comparisonControllerRef.current.getItems();
  const primaryEntityType: ResultEntityType = options.initialItems[0]?.entityType ?? 'property';

  return {
    mode,
    sort,
    page,
    pageSize,
    sortedItems,
    pagedItems,
    paginationModel,
    selectedIdsSet,
    selectedCount: selectedIdsSet.size,
    comparisonItems,
    primaryEntityType,
    changePresentationMode,
    changeSort,
    setPage,
    changePageSize,
    toggleSelectItem,
    selectCurrentPage,
    clearSelection,
    addToComparison,
    removeFromComparison,
    clearComparison,
  };
}

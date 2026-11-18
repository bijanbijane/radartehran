/**
 * @file src/features/results/components/UnifiedResultsPresentationView.tsx
 * @description Unified Stage 6 Results Presentation View supporting Card Grid, List, Compact List, Data Table, and Comparison Workspace.
 */

import React from 'react';
import type { ResultActionId, ResultDataStatusState, ResultItem } from '../../../platform/presentation';
import {
  ResultCard,
  ResultEmptyState,
  ResultList,
  ResultPagination,
  ResultSelectionBar,
  ResultSkeleton,
  ResultTable,
  ResultToolbar,
} from '../../../shared/result-ui';
import { ComparisonWorkspace } from '../comparison/ComparisonWorkspace';
import { useResultsPresentation } from '../hooks/useResultsPresentation';

export interface UnifiedResultsPresentationViewProps {
  items: readonly ResultItem[];
  dataState?: ResultDataStatusState;
  datasetContextKey?: string;
  onOpenEntityDetail?: (item: ResultItem) => void;
  onShowOnMap?: (item: ResultItem) => void;
}

export const UnifiedResultsPresentationView: React.FC<UnifiedResultsPresentationViewProps> = ({
  items,
  dataState = 'Success',
  datasetContextKey = 'default',
  onOpenEntityDetail,
  onShowOnMap,
}) => {
  const {
    mode,
    sort,
    pagedItems,
    paginationModel,
    selectedIdsSet,
    selectedCount,
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
  } = useResultsPresentation({ initialItems: items, datasetContextKey });

  const handleItemAction = (actionId: ResultActionId, item: ResultItem) => {
    if (actionId === 'open-detail') {
      onOpenEntityDetail?.(item);
    } else if (actionId === 'add-to-compare') {
      addToComparison(item);
    } else if (actionId === 'show-on-map') {
      onShowOnMap?.(item);
    }
  };

  const handleBulkAction = (actionId: ResultActionId) => {
    if (actionId === 'add-to-compare') {
      for (const item of items) {
        if (selectedIdsSet.has(item.id)) {
          addToComparison(item);
        }
      }
      changePresentationMode('comparison');
    }
  };

  return (
    <section dir="rtl" aria-label="بخش نمایش یکپارچه نتایج" className="space-y-4 text-right">
      <ResultToolbar
        activeMode={mode}
        sortField={sort.field}
        sortDirection={sort.direction}
        comparisonCount={comparisonItems.length}
        onChangeMode={changePresentationMode}
        onChangeSort={changeSort}
      />

      <ResultSelectionBar
        selectedCount={selectedCount}
        canCompareSelected={true}
        onExecuteBulkAction={handleBulkAction}
        onClearSelection={clearSelection}
      />

      {dataState === 'Loading' ? (
        <ResultSkeleton mode={mode} />
      ) : mode === 'comparison' ? (
        <ComparisonWorkspace
          items={comparisonItems}
          onRemoveEntity={removeFromComparison}
          onClearAll={clearComparison}
        />
      ) : pagedItems.length === 0 ? (
        <ResultEmptyState state={dataState === 'Success' ? 'Empty' : dataState} />
      ) : mode === 'data-table' ? (
        <ResultTable
          items={pagedItems}
          entityType={primaryEntityType}
          selectedIds={selectedIdsSet}
          sortField={sort.field}
          sortDirection={sort.direction}
          onSortChange={changeSort}
          onToggleSelect={toggleSelectItem}
          onSelectPage={selectCurrentPage}
          onAction={handleItemAction}
        />
      ) : mode === 'list' || mode === 'compact-list' || mode === 'map-linked' ? (
        <ResultList
          items={pagedItems}
          compact={mode === 'compact-list'}
          selectedIds={selectedIdsSet}
          onToggleSelect={toggleSelectItem}
          onAction={handleItemAction}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pagedItems.map((item) => (
            <ResultCard
              key={`${item.entityType}:${item.id}`}
              item={item}
              isSelected={selectedIdsSet.has(item.id)}
              onToggleSelect={toggleSelectItem}
              onAction={handleItemAction}
            />
          ))}
        </div>
      )}

      {mode !== 'comparison' && pagedItems.length > 0 && (
        <ResultPagination
          model={paginationModel}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      )}
    </section>
  );
};

export default UnifiedResultsPresentationView;

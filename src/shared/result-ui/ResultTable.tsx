/**
 * @file src/shared/result-ui/ResultTable.tsx
 * @description Data Table Engine with Column Registry, Row Error Isolation, and Windowed Virtualization (> 100 rows, mandatory >= 500 rows).
 */

import React, { useMemo, useState } from 'react';
import {
  METRIC_STATUS_LABELS_FA,
  RESULT_TABLE_BENCHMARKS,
  getColumnsForEntity,
  type ResultActionId,
  type ResultEntityType,
  type ResultItem,
  type ResultSortDirection,
  type ResultSortField,
} from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultTableProps {
  items: readonly ResultItem[];
  entityType?: ResultEntityType;
  hiddenColumnIds?: readonly string[];
  selectedIds: ReadonlySet<string>;
  sortField?: ResultSortField;
  sortDirection?: ResultSortDirection;
  virtualWindowSize?: number;
  onSortChange?: (field: ResultSortField, direction: ResultSortDirection) => void;
  onToggleSelect?: (item: ResultItem) => void;
  onSelectPage?: () => void;
  onAction?: (actionId: ResultActionId, item: ResultItem) => void;
}

export const ResultTable: React.FC<ResultTableProps> = ({
  items,
  entityType = 'property',
  hiddenColumnIds = [],
  selectedIds,
  sortField,
  sortDirection = 'desc',
  virtualWindowSize = 50,
  onSortChange,
  onToggleSelect,
  onSelectPage,
  onAction,
}) => {
  const columns = useMemo(
    () => getColumnsForEntity(entityType, hiddenColumnIds),
    [entityType, hiddenColumnIds]
  );

  const isVirtualized = items.length >= RESULT_TABLE_BENCHMARKS.virtualizationOptionalThreshold;
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 52;

  const { visibleItems, startIndex } = useMemo(() => {
    if (!isVirtualized) {
      return { visibleItems: items, startIndex: 0 };
    }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight));
    const end = Math.min(items.length, start + virtualWindowSize);
    return {
      visibleItems: items.slice(start, end),
      startIndex: start,
    };
  }, [items, isVirtualized, scrollTop, virtualWindowSize]);

  const handleHeaderSort = (colId: string, sortable: boolean) => {
    if (!sortable || !onSortChange) return;
    const field = colId as ResultSortField;
    const nextDir: ResultSortDirection =
      sortField === field && sortDirection === 'desc' ? 'asc' : 'desc';
    onSortChange(field, nextDir);
  };

  return (
    <div
      dir="rtl"
      onScroll={(e) => {
        if (isVirtualized) {
          setScrollTop(e.currentTarget.scrollTop);
        }
      }}
      data-virtualized={isVirtualized ? 'true' : 'false'}
      className="max-h-[640px] w-full overflow-x-auto overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <table className="w-full border-collapse text-right text-xs">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
          <tr style={{ height: `${RESULT_TABLE_BENCHMARKS.headerHeightPx}px` }}>
            {columns.map((col) => (
              <th
                key={col.id}
                style={{ minWidth: `${col.minWidth}px` }}
                className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
              >
                {col.id === 'selection' ? (
                  <button
                    type="button"
                    onClick={onSelectPage}
                    aria-label="انتخاب تمام ردیف‌های صفحه جاری"
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] dark:border-slate-700"
                  >
                    همه
                  </button>
                ) : col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleHeaderSort(col.id, col.sortable)}
                    aria-label={`مرتب‌سازی بر اساس ${col.label}`}
                    className="inline-flex items-center gap-1 font-bold hover:text-slate-950 dark:hover:text-white"
                  >
                    <span>{col.label}</span>
                    {sortField === col.id && (
                      <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ) : (
                  <span>{col.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {visibleItems.map((item, idx) => {
            if (!item || !item.id) {
              // Rule 4.7 & 12: Row error must never crash the entire table
              return (
                <tr key={`err-row-${startIndex + idx}`} className="bg-amber-50/40 dark:bg-amber-900/10">
                  <td colSpan={columns.length} className="px-3 py-3 text-amber-700 dark:text-amber-300">
                    این ردیف دارای داده ناقص یا خطای ساختاری است و از نمایش جزئیات آن صرف‌نظر شد.
                  </td>
                </tr>
              );
            }

            const isSelected = selectedIds.has(item.id);
            return (
              <tr
                key={`${item.entityType}:${item.id}`}
                style={{ height: `${rowHeight}px` }}
                className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                  isSelected ? 'bg-slate-100/80 dark:bg-slate-800' : ''
                }`}
              >
                {columns.map((col) => {
                  if (col.id === 'selection') {
                    return (
                      <td key={col.id} className="px-3 py-2">
                        {item.permissions.canSelect && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect?.(item)}
                            aria-label={`انتخاب ردیف ${item.title}`}
                            className="h-4 w-4 cursor-pointer"
                          />
                        )}
                      </td>
                    );
                  }
                  if (col.id === 'id') {
                    return (
                      <td key={col.id} className="px-3 py-2 font-mono tabular-nums text-slate-500">
                        {item.id}
                      </td>
                    );
                  }
                  if (col.id === 'title') {
                    return (
                      <td key={col.id} className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </td>
                    );
                  }
                  if (col.id === 'neighborhood') {
                    return (
                      <td key={col.id} className="px-3 py-2">
                        {item.location?.neighborhoodId || 'نامشخص'}
                      </td>
                    );
                  }
                  if (col.id === 'status') {
                    const st = (item.status || 'verified') as keyof typeof METRIC_STATUS_LABELS_FA;
                    return (
                      <td key={col.id} className="px-3 py-2">
                        {METRIC_STATUS_LABELS_FA[st] || item.status || 'تأییدشده'}
                      </td>
                    );
                  }
                  if (col.id === 'actions') {
                    return (
                      <td key={col.id} className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {item.permissions.canOpen && (
                            <button
                              type="button"
                              onClick={() => onAction?.('open-detail', item)}
                              aria-label={`مشاهده ${item.title}`}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              جزئیات
                            </button>
                          )}
                          {item.permissions.canCompare && (
                            <button
                              type="button"
                              onClick={() => onAction?.('add-to-compare', item)}
                              aria-label={`مقایسه ${item.title}`}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              مقایسه
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  }

                  const m = item.metrics[col.id];
                  if (!m || m.value === null || m.value === undefined) {
                    return (
                      <td key={col.id} className="px-3 py-2 text-slate-400">
                        نامشخص
                      </td>
                    );
                  }

                  return (
                    <td key={col.id} className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                      {formatAsciiToPersianDigits(m.value)} {m.unit || ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/**
 * @file src/shared/search-ui/SearchSuggestions.tsx
 * @description Accessible suggestion dropdown with multi-intent branch support and keyboard focus highlight.
 */

import React from 'react';
import type { SearchQuerySuggestionItem } from '../../platform/search';

export interface SearchSuggestionsProps {
  suggestions: readonly SearchQuerySuggestionItem[];
  activeIndex: number;
  isOpen: boolean;
  onSelect: (suggestion: SearchQuerySuggestionItem) => void;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  suggestions,
  activeIndex,
  isOpen,
  onSelect,
}) => {
  if (!isOpen || suggestions.length === 0) return null;

  return (
    <ul
      dir="rtl"
      role="listbox"
      aria-label="پیشنهادهای جست‌وجو"
      className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:divide-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]"
    >
      {suggestions.map((item, idx) => {
        const isFocused = idx === activeIndex;
        return (
          <li key={item.id} role="option" aria-selected={isFocused}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2.5 text-right transition-colors ${
                isFocused
                  ? 'bg-slate-100 text-slate-900 dark:bg-[var(--color-bg-muted)] dark:text-white'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-[var(--color-text-primary)] dark:hover:bg-[var(--color-bg-elevated)]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.labelFa}</div>
                <div className="truncate text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
                  {item.subtitleFa}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-400 dark:text-[var(--color-text-muted)]">
                {item.kind === 'recent'
                  ? 'اخیر'
                  : item.kind === 'intent_branch'
                    ? 'مسیر پیشنهادی'
                    : 'تطبیق مستقیم'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

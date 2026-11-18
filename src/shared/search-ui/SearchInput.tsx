/**
 * @file src/shared/search-ui/SearchInput.tsx
 * @description Accessible RTL SearchInput with 300ms debounce, Escape/Enter/Arrow keyboard support, and focus restoration.
 */

import React, { useEffect, useRef, useState } from 'react';
import { SEARCH_TEXT_DEBOUNCE_MS, type SearchScope } from '../../platform/search';

export interface SearchInputProps {
  value: string;
  scope?: SearchScope;
  placeholderFa?: string;
  debounceMs?: number;
  isLoading?: boolean;
  onChange: (rawValue: string) => void;
  onDebouncedChange?: (rawValue: string) => void;
  onSubmit?: (rawValue: string) => void;
  onArrowMove?: (direction: 'up' | 'down') => void;
  onEscape?: () => void;
  onScopeChange?: (scope: SearchScope) => void;
}

const SCOPE_LABELS_FA: Record<SearchScope, string> = {
  all: 'همه بخش‌ها',
  neighborhoods: 'محله‌ها',
  listings: 'آگهی‌ها',
  properties: 'املاک',
  buildings: 'ساختمان‌ها',
  services: 'خدمات',
  'market-analytics': 'تحلیل بازار',
};

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  scope = 'all',
  placeholderFa = 'جست‌وجوی محله، ملک، آگهی، ساختمان یا تحلیل قیمت...',
  debounceMs = SEARCH_TEXT_DEBOUNCE_MS,
  isLoading = false,
  onChange,
  onDebouncedChange,
  onSubmit,
  onArrowMove,
  onEscape,
  onScopeChange,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [internalVal, setInternalVal] = useState(value);

  useEffect(() => {
    setInternalVal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleTextChange = (nextRaw: string) => {
    setInternalVal(nextRaw);
    onChange(nextRaw);
    if (onDebouncedChange) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onDebouncedChange(nextRaw);
      }, debounceMs);
    }
  };

  const handleClear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInternalVal('');
    onChange('');
    onDebouncedChange?.('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onEscape?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      onSubmit?.(internalVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onArrowMove?.('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onArrowMove?.('up');
    }
  };

  return (
    <div
      dir="rtl"
      role="search"
      aria-label="جست‌وجوی یکپارچه رادار تهران"
      className="flex w-full items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 shadow-sm transition-colors focus-within:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-slate-300"
    >
      {onScopeChange && (
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as SearchScope)}
          aria-label="دامنه جست‌وجو"
          className="min-h-[44px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
        >
          {(Object.keys(SCOPE_LABELS_FA) as SearchScope[]).map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS_FA[s]}
            </option>
          ))}
        </select>
      )}

      <input
        ref={inputRef}
        type="search"
        dir="auto"
        value={internalVal}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholderFa}
        aria-label={placeholderFa}
        aria-busy={isLoading}
        className="min-h-[44px] flex-1 bg-transparent px-2 text-right text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
      />

      {internalVal && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="پاک کردن عبارت جست‌وجو"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          پاک کردن
        </button>
      )}

      <button
        type="button"
        onClick={() => onSubmit?.(internalVal)}
        aria-label="اجرای جست‌وجو"
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {isLoading ? 'در حال جست‌وجو...' : 'جست‌وجو'}
      </button>
    </div>
  );
};

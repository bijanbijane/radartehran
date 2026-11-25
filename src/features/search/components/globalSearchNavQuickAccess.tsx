import React from 'react';
import type { GlobalSearchResult } from '../../onboarding/services/rtFeNavigation014Engine';

export interface GlobalSearchNavQuickAccessProps {
  items: GlobalSearchResult[];
  onSelectPath?: (path: string) => void;
  onCloseSuggestions?: () => void;
}

export const GlobalSearchNavQuickAccess: React.FC<GlobalSearchNavQuickAccessProps> = ({
  items,
  onSelectPath,
  onCloseSuggestions,
}) => {
  if (items.length === 0) return null;
  return (
    <div
      className="border-b border-slate-100 dark:border-[var(--color-border-subtle)] pb-2 mb-1 space-y-1"
      data-testid="global-search-nav-quick-access"
    >
      <p className="px-2 text-[10px] font-semibold text-slate-500">بخش‌های مرتبط در رادار</p>
      {items.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="option"
          className="w-full text-right px-2 py-1.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] cursor-pointer"
          onClick={() => {
            onCloseSuggestions?.();
            onSelectPath?.(entry.href);
          }}
        >
          {entry.title}
        </button>
      ))}
    </div>
  );
};
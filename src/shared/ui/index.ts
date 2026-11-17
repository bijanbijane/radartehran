/** @file src/shared/ui/index.ts — Shared UI State Primitives */
import React from 'react';

export interface SharedStatusNoticeProps {
  readonly titleFa: string;
  readonly descriptionFa?: string;
  readonly tone?: 'neutral' | 'warning' | 'danger' | 'success';
  readonly testId?: string;
}

export const SharedStatusNotice: React.FC<SharedStatusNoticeProps> = ({
  titleFa,
  descriptionFa,
  tone = 'neutral',
  testId = 'shared-status-notice',
}) => {
  const toneClass =
    tone === 'danger'
      ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100'
      : tone === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
        : tone === 'success'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100'
          : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100';
  return React.createElement(
    'div',
    {
      role: 'status',
      'data-testid': testId,
      className: `p-3 rounded-xl border text-xs ${toneClass}`,
    },
    React.createElement('div', { className: 'font-bold' }, titleFa),
    descriptionFa ? React.createElement('div', { className: 'mt-1 opacity-90' }, descriptionFa) : null
  );
};

/** @file src/design-system/classMaps.ts — Tailwind class bundles backed by CSS tokens (pure TS, no React) */

export const brandBg = 'bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] active:bg-[var(--color-brand-900)]';
export const brandText = 'text-[var(--color-brand-600)]';
export const brandSoftBg = 'bg-[var(--color-brand-50)]';

export const cardSurface =
  'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] shadow-sm';
export const canvasBg = 'bg-[var(--color-bg-canvas)]';

export const textPrimary = 'text-[var(--color-text-primary)]';
export const textSecondary = 'text-[var(--color-text-secondary)]';
export const textMuted = 'text-[var(--color-text-muted)]';

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-[var(--color-focus)] focus-visible:outline-offset-2';

export const semanticAlert = {
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border border-[var(--color-info-border)]',
} as const;

export const touchTargetMobile = 'max-sm:min-h-[44px] max-sm:min-w-[44px]';
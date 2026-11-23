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
  success: 'bg-[#EAF5EE] text-[#176B4C] border border-[#B9DEC8] dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  warning: 'bg-[#FFF4E5] text-[#875000] border border-[#F2D19B] dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  danger: 'bg-[#FDECEC] text-[#A61B1B] border border-[#F2B8B8] dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  info: 'bg-[#EAF3FB] text-[#155E9A] border border-[#B9D8F0] dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
} as const;

export const touchTargetMobile = 'max-sm:min-h-[44px] max-sm:min-w-[44px]';
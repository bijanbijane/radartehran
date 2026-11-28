/** @file src/components/ui/RadarPrimitives.tsx — Shared Design System UI Primitives (F-11) */
import React from 'react';
import { Search, X } from 'lucide-react';

import { RadarButton as CanonicalRadarButton } from '../common/RadarButton';
import { acquireDialogScrollLock, isTopmostModalDialogElement, shouldRestoreDialogFocus, syncDialogBackgroundIsolation } from '../../utils/interactions/dialogStack';

export type RadarButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type RadarButtonSize = 'sm' | 'md' | 'lg';

export interface RadarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: RadarButtonVariant;
  size?: RadarButtonSize;
  leadingIcon?: React.ReactNode;
}

/** Backward-compatible variant mapping; all button rendering is owned by common/RadarButton. */
export const RADAR_PRIMITIVE_BUTTON_VARIANT_MAP = {
  primary: 'primary',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'tertiary',
  danger: 'destructive',
} as const;

export const RADAR_PRIMITIVE_BUTTON_SIZE_MAP = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
} as const;

export interface RadarLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  onNavigate?: () => void;
}

/** Semantic SPA navigation anchor: renders real <a href> while preserving Ctrl/Cmd/Shift/Middle-click new-tab behavior. */
export const RadarLink = React.forwardRef<HTMLAnchorElement, RadarLinkProps>(
  ({ href, onNavigate, onClick, className = '', children, ...rest }, ref) => {
    const hasDisplay = /\b(flex|inline-flex|grid|inline-grid|block|inline-block)\b/.test(className);
    const mergedClass = hasDisplay
      ? className
      : `inline-flex items-center justify-center ${className}`.trim();
    return (
      <a
        ref={ref}
        href={href}
        className={mergedClass}
        onClick={(e) => {
          onClick?.(e);
          if (
            e.defaultPrevented ||
            !onNavigate ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            rest.target === '_blank'
          ) {
            return;
          }
          e.preventDefault();
          onNavigate();
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
);
RadarLink.displayName = 'RadarLink';

export const RadarPageHeader: React.FC<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, eyebrow, actions, className = '' }) => (
  <header className={`flex flex-col sm:flex-row sm:items-end justify-between gap-3 ${className}`}>
    <div className="space-y-1 min-w-0">
      {eyebrow && (
        <p className="text-xs font-bold text-[var(--color-brand-fg)]">{eyebrow}</p>
      )}
      <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] tracking-tight text-[var(--color-text-primary)]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed max-w-2xl">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

export const RadarButton: React.FC<RadarButtonProps> = ({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  className = '',
  children,
  type = 'button',
  ...rest
}) => (
  <CanonicalRadarButton
    type={type}
    variant={RADAR_PRIMITIVE_BUTTON_VARIANT_MAP[variant]}
    size={RADAR_PRIMITIVE_BUTTON_SIZE_MAP[size]}
    leadingIcon={leadingIcon}
    className={`whitespace-nowrap shrink-0 ${size === 'sm' ? 'min-w-[44px] md:min-w-[36px]' : ''} ${className}`}
    {...rest}
  >
    {children}
  </CanonicalRadarButton>
);

export type RadarBadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONE_STYLES: Record<RadarBadgeTone, string> = {
  neutral:
    'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]',
  brand:
    'bg-[var(--color-brand-soft)] text-[var(--color-brand-700)] border-[var(--color-brand-200)] dark:bg-[var(--color-brand-soft)] dark:text-[var(--color-brand-fg)] dark:border-[var(--color-brand-soft-border)]',
  success:
    'bg-[var(--color-success-bg)] text-[var(--color-success)] border-emerald-200 dark:border-emerald-800/60',
  warning:
    'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-amber-200 dark:border-amber-800/60',
  danger:
    'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-rose-200 dark:border-rose-800/60',
  info:
    'bg-[var(--color-info-bg)] text-[var(--color-info)] border-sky-200 dark:border-sky-800/60',
};

export const RadarBadge: React.FC<{
  tone?: RadarBadgeTone;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = 'neutral', className = '', children }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] border text-xs font-semibold leading-5 whitespace-nowrap ${BADGE_TONE_STYLES[tone]} ${className}`}
  >
    {children}
  </span>
);

export const RadarCard: React.FC<{
  className?: string;
  padded?: boolean;
  children: React.ReactNode;
}> = ({ className = '', padded = true, children }) => (
  <div
    className={`bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[12px] ${padded ? 'p-4 sm:p-5' : ''} ${className}`}
  >
    {children}
  </div>
);

export interface RadarTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function RadarTabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
  className = '',
}: {
  items: readonly RadarTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const tabListRef = React.useRef<HTMLDivElement | null>(null);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const isRtl =
      typeof document !== 'undefined' &&
      (document.documentElement.dir === 'rtl' || getComputedStyle(e.currentTarget).direction === 'rtl');
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = isRtl ? (idx - 1 + items.length) % items.length : (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') nextIdx = isRtl ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = items.length - 1;
    if (nextIdx >= 0) {
      e.preventDefault();
      onChange(items[nextIdx].id);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIdx]?.focus();
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 p-1 rounded-[10px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] overflow-x-auto no-scrollbar ${className}`}
    >
      {items.map((item, idx) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onClick={() => onChange(item.id)}
            className={`min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              active
                ? 'bg-[var(--color-bg-surface)] text-[var(--color-brand-fg)] shadow-xs border border-[var(--color-border-subtle)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span className="tabular-nums text-xs opacity-75">({item.count.toLocaleString('fa-IR')})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const RadarSearchInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
}> = ({ value, onChange, placeholder, ariaLabel, className = '' }) => (
  <div className={`relative flex items-center min-w-[220px] ${className}`}>
    <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 pointer-events-none" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      className="w-full min-h-[44px] md:min-h-[40px] ps-9 pe-10 rounded-[8px] bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-focus)]"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="پاک کردن جستجو"
        className="absolute end-1 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px] inline-flex items-center justify-center rounded-[6px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

export const RadarSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const releaseScrollLock = acquireDialogScrollLock(document.body);
    syncDialogBackgroundIsolation(document);
    const panel = panelRef.current;
    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    const first = getFocusable()[0];
    (first || panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      const openDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (!isTopmostModalDialogElement(panelRef.current, openDialogs)) return;
      if (e.key === 'Escape') {
        // Keep Escape owned by the visually/topologically topmost modal only.
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = getFocusable();
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      releaseScrollLock();
      syncDialogBackgroundIsolation(document);
      const remainingDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (shouldRestoreDialogFocus(previouslyFocused, remainingDialogs)) {
        previouslyFocused?.focus?.();
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/45 p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full md:max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-[20px] md:rounded-[16px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-5 shadow-xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--color-border-subtle)]">
          <h2 id={titleId} className="text-base font-bold text-[var(--color-text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

import { useEffect, useRef } from 'react';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { acquireDialogScrollLock, isTopmostModalDialogElement, shouldRestoreDialogFocus } from '../utils/interactions/dialogStack';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseDialogFocusOptions {
  escapeDisabled?: boolean;
}

function isElementFocusableVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * Lightweight WCAG 2.1 AA dialog focus & scroll-lock management hook.
 * Saves trigger element focus & document body overflow on open, focuses initial dialog target,
 * traps Tab / Shift+Tab cycling within the dialog, handles Escape, and restores state on close.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose?: () => void,
  options?: UseDialogFocusOptions,
) {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(onClose);
  const escapeDisabledRef = useRef<boolean>(Boolean(options?.escapeDisabled));
  onCloseRef.current = onClose;
  escapeDisabledRef.current = Boolean(options?.escapeDisabled);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    containerRef.current.setAttribute(
      'data-dialog-unit-context',
      `${formatAreaUnitLabel(areaUnit)}|${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(100, areaUnit), intlCurrency, locale)}`
    );
  }, [open, areaUnit, intlCurrency, locale]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = acquireDialogScrollLock(document.body);

    const container = containerRef.current;
    if (container) {
      const explicitInitial = container.querySelector<HTMLElement>('[data-dialog-initial-focus]');
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isElementFocusableVisible);
      if (explicitInitial && typeof explicitInitial.focus === 'function') {
        explicitInitial.focus();
      } else if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      const openDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (!isTopmostModalDialogElement(containerRef.current, openDialogs)) return;
      if (e.key === 'Escape') {
        // The topmost modal owns this Escape press; do not let the global window
        // listener dismiss unrelated overlays or lower modal state.
        e.preventDefault();
        e.stopPropagation();
        if (!escapeDisabledRef.current && onCloseRef.current) {
          onCloseRef.current();
        }
        return;
      }
      if (!containerRef.current) return;
      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(isElementFocusableVisible);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !containerRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !containerRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        releaseScrollLock();
        const prev = previousFocusRef.current;
        const remainingDialogs = Array.from(
          document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
        );
        if (shouldRestoreDialogFocus(prev, remainingDialogs) && prev && typeof prev.focus === 'function') {
          prev.focus();
        } else if (remainingDialogs.length === 0) {
          const fallbackTarget = document.querySelector<HTMLElement>('main, [role="main"], h1');
          if (fallbackTarget && typeof fallbackTarget.focus === 'function') {
            if (!fallbackTarget.hasAttribute('tabindex')) fallbackTarget.setAttribute('tabindex', '-1');
            fallbackTarget.focus();
          }
        }
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  return containerRef;
}


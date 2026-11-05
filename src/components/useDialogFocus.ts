import { useEffect, useRef } from 'react';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lightweight WCAG 2.1 AA dialog focus management hook.
 * Saves trigger element focus on open, focuses the first interactive control,
 * traps Tab / Shift+Tab cycling within the dialog, and restores focus on close.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void) {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (container) {
      container.setAttribute(
        'data-dialog-unit-context',
        `${formatAreaUnitLabel(areaUnit)}|${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(100, areaUnit), intlCurrency, locale)}`
      );
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;
      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);

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
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [open, areaUnit, intlCurrency, locale]);

  return containerRef;
}


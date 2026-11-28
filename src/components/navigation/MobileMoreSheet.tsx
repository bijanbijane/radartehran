/** @file src/components/navigation/MobileMoreSheet.tsx — Categorized Mobile Bottom Sheet for More Menu (RT-UI-NAV-001, Accessible Dialog Lifecycle) */
import React from 'react';
import {
  SlidersHorizontal, User, Briefcase, BookOpen, MessageSquarePlus, Home, Compass,
  X, Bookmark,
} from 'lucide-react';
import type { CityId } from '../../data/multiCityData';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';
import { buildCanonicalPathForDestination } from '../../navigation/url/navigationUrlContract';
import { AreaUnitToggle } from '../AreaUnitToggle';
import { RadarLink } from '../ui/RadarPrimitives';
import {
  acquireDialogScrollLock,
  isTopmostModalDialogElement,
  shouldRestoreDialogFocus,
} from '../../utils/interactions/dialogStack';

export interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  locale: RadarLocale;
  activeView: PrimaryViewId;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  appleTheme: 'light' | 'dark';
  onToggleAppleTheme: () => void;
  onSelectDestination: (viewId: PrimaryViewId) => void;
  onOpenOnboarding: () => void;
  onOpenVisitedLog: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getVisibleFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hasAttribute('disabled')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.getClientRects().length > 0
  ));
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  open,
  onClose,
  locale,
  activeView,
  onSelectDestination,
  onOpenOnboarding,
  onOpenVisitedLog,
}) => {
  const isEn = locale === 'en';
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  const destinations: {
    id: PrimaryViewId;
    labelFa: string;
    labelEn: string;
    descFa: string;
    descEn: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'tools', labelFa: 'ابزارها و محاسبه‌گرها', labelEn: 'Tools & Calculators', descFa: 'ارزش‌گذاری، وام و کمیسیون', descEn: 'Valuation, mortgage & fees', Icon: SlidersHorizontal },
    { id: 'userspace', labelFa: 'حساب کاربری و منتخب‌ها', labelEn: 'My Account', descFa: 'ذخیره‌شده‌ها و هشدارها', descEn: 'Saved items & alerts', Icon: User },
    { id: 'services', labelFa: 'خدمات تخصصی ملک', labelEn: 'Services', descFa: 'کارشناسی، قولنامه و بازدید', descEn: 'Inspection & legal review', Icon: Briefcase },
    { id: 'knowledge', labelFa: 'دانش و گزارش‌ها', labelEn: 'Knowledge', descFa: 'روش‌شناسی و تحلیل بازار', descEn: 'Methodology & guides', Icon: BookOpen },
    { id: 'contributions', labelFa: 'جامعه کاربران', labelEn: 'Community', descFa: 'پرسش‌وپاسخ و مشارکت داده', descEn: 'Q&A & verified contributions', Icon: MessageSquarePlus },
    { id: 'home', labelFa: 'صفحه نخست رادار', labelEn: 'Home', descFa: 'نمای خلاصه و ارزیابی آگهی', descEn: 'Overview & instant check', Icon: Home },
  ];

  React.useEffect(() => {
    if (!open) return undefined;

    const activeElement = document.activeElement;
    previouslyFocusedRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const releaseScrollLock = acquireDialogScrollLock(document.body);

    const initialFocusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getVisibleFocusableElements(dialog);
      (focusable[0] ?? dialog).focus();
    });

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const openDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (!isTopmostModalDialogElement(dialog, openDialogs)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getVisibleFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !dialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      releaseScrollLock();
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      const remainingDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (
        previouslyFocused?.isConnected
        && !previouslyFocused.hasAttribute('disabled')
        && shouldRestoreDialogFocus(previouslyFocused, remainingDialogs)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="md:hidden fixed inset-0 z-[39] bg-slate-950/40 backdrop-blur-[2px]"
      />
      <div
        ref={dialogRef}
        id="radar-mobile-more-menu"
        dir={isEn ? 'ltr' : 'rtl'}
        role="dialog"
        aria-modal="true"
        aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
        aria-describedby="radar-mobile-more-description"
        tabIndex={-1}
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom))' }}
        className="md:hidden fixed inset-x-3 z-[41] max-h-[72dvh] overflow-y-auto p-3.5 rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl space-y-3.5 transition-all duration-150 visible opacity-100 translate-y-0 pointer-events-auto"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
          <div className="min-w-0">
            <span className="text-sm font-bold text-[var(--color-text-primary)]">
              {isEn ? 'All Platform Modules' : 'سایر بخش‌ها و خدمات تخصصی'}
            </span>
            <span id="radar-mobile-more-description" className="sr-only">
              {isEn ? 'Choose a platform section. Keyboard focus stays inside this dialog until it closes.' : 'یک بخش از سامانه را انتخاب کنید. تا زمان بسته‌شدن پنجره، تمرکز صفحه‌کلید در همین پنجره باقی می‌ماند.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close menu' : 'بستن منو'}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[8px] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {destinations.map((item) => {
            const Icon = item.Icon;
            const isActive = activeView === item.id;
            return (
              <RadarLink
                key={item.id}
                href={buildCanonicalPathForDestination(item.id)}
                aria-current={isActive ? 'page' : undefined}
                onNavigate={() => {
                  onClose();
                  onSelectDestination(item.id);
                }}
                className={`min-h-[52px] flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-start border transition cursor-pointer ${
                  isActive
                    ? 'bg-[var(--color-brand-soft)] border-[var(--color-brand-soft-border)] text-[var(--color-brand-fg)]'
                    : 'bg-[var(--color-bg-muted)]/70 border-[var(--color-border-subtle)] text-[var(--color-text-primary)]'
                }`}
              >
                <Icon className="h-4 w-4 text-[var(--color-brand-fg)] shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-snug">{isEn ? item.labelEn : item.labelFa}</div>
                  <div className="text-[13px] text-[var(--color-text-muted)] leading-snug">{isEn ? item.descEn : item.descFa}</div>
                </div>
              </RadarLink>
            );
          })}
        </div>

        <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => { onClose(); onOpenVisitedLog(); }} className="min-h-[44px] px-3 py-1.5 rounded-[8px] bg-[var(--color-bg-muted)] text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer">
              <Bookmark className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" /><span>{isEn ? 'Visits Log' : 'دفترچه بازدید'}</span>
            </button>
            <button type="button" onClick={() => { onClose(); onOpenOnboarding(); }} className="min-h-[44px] px-3 py-1.5 rounded-[8px] bg-[var(--color-bg-muted)] text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer">
              <Compass className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" /><span>{isEn ? 'Guide' : 'راهنما'}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
          </div>
        </div>
      </div>
    </>
  );
};

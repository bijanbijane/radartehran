/** @file src/components/navigation/DesktopMegaMenu.tsx — Categorized Desktop Mega Menu (Stages 203, 205, 206, 207) */
import React, { useEffect, useId, useRef } from 'react';
import { Briefcase, BookOpen, MessageSquarePlus, Compass, Home } from 'lucide-react';
import { DESKTOP_MEGA_MENU_GROUPS, type MegaMenuEntry } from '../../navigation/primary/megaMenuAndTabsConfig';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';
import { focusMainDestinationAfterMegaMenuClose } from './useMegaMenuLifecycle';
import { RadarLink } from '../ui/RadarPrimitives';
import { buildCanonicalPathForDestination } from '../../navigation/url/navigationUrlContract';

export interface DesktopMegaMenuProps {
  open: boolean;
  onClose: () => void;
  onMouseEnterMenu?: () => void;
  onMouseLeaveMenu?: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  panelId?: string;
  locale: RadarLocale;
  activeView: PrimaryViewId;
  activeSubTab?: ModuleSubTabId;
  onSelectDestination: (viewId: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onTriggerAction: (actionId: NonNullable<MegaMenuEntry['actionId']>) => void;
}

const GROUP_ICONS = {
  services: Briefcase,
  knowledge: BookOpen,
  contributions: MessageSquarePlus,
  complementary: Compass,
} as const;

export const DesktopMegaMenu: React.FC<DesktopMegaMenuProps> = ({
  open,
  onClose,
  onMouseEnterMenu,
  onMouseLeaveMenu,
  triggerRef,
  panelId = 'desktop-mega-menu-panel',
  locale,
  activeView,
  activeSubTab,
  onSelectDestination,
  onTriggerAction,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingBaseId = useId();
  const isEn = locale === 'en';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef?.current?.focus();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const insideTrigger = Boolean(triggerRef?.current && target && triggerRef.current.contains(target));
      if (panelRef.current && target && !panelRef.current.contains(target) && !insideTrigger) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const handleCloseViaButton = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  return (
    <div
      ref={panelRef}
      id={panelId}
      dir={isEn ? 'ltr' : 'rtl'}
      role="region"
      aria-label={isEn ? 'More platform modules' : 'سایر بخش‌ها و خدمات تخصصی'}
      onMouseEnter={onMouseEnterMenu}
      onMouseLeave={onMouseLeaveMenu}
      className="absolute top-full inset-x-4 max-w-4xl mx-auto z-50 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl animate-fadeIn before:content-[''] before:absolute before:inset-x-0 before:-top-3 before:h-3"
    >
      <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto p-4 sm:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {DESKTOP_MEGA_MENU_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.id];
          const groupTitleId = `${headingBaseId}-${group.id}`;
          return (
            <section key={group.id} aria-labelledby={groupTitleId} className="space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 px-2 pb-1.5 border-b border-[var(--color-border-subtle)] text-sm font-bold text-[var(--color-text-muted)]">
                <GroupIcon className="w-4 h-4 text-[var(--color-brand-fg)] shrink-0" aria-hidden="true" />
                <p id={groupTitleId} role="presentation" className="leading-snug m-0">
                  {isEn ? group.titleEn : group.titleFa}
                </p>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = Boolean(item.viewId && activeView === item.viewId && (!item.subTab || activeSubTab === item.subTab));
                  const itemClasses = `w-full text-start px-2.5 py-2 rounded-[8px] transition cursor-pointer flex flex-col gap-0.5 group ${
                    isActive
                      ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]'
                      : 'hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)]'
                  }`;
                  const innerContent = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold leading-snug min-w-0 flex-1 group-hover:text-[var(--color-brand-fg)] transition">
                          {isEn ? item.labelEn : item.labelFa}
                        </span>
                        {item.status === 'beta' && (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-xs leading-4 font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shrink-0"
                            >
                              {isEn ? 'Beta' : 'آزمایشی'}
                            </span>
                            <span className="sr-only">
                              {isEn ? ' — Beta feature' : ' — نسخه آزمایشی'}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[13px] text-[var(--color-text-muted)] leading-snug line-clamp-2">
                        {isEn ? item.descEn : item.descFa}
                      </span>
                    </>
                  );
                  if (item.viewId) {
                    const href = buildCanonicalPathForDestination(item.viewId, item.subTab as ModuleSubTabId | undefined);
                    return (
                      <RadarLink
                        key={item.id}
                        href={href}
                        aria-current={isActive ? 'page' : undefined}
                        onNavigate={() => {
                          onClose();
                          onSelectDestination(item.viewId as PrimaryViewId, item.subTab as ModuleSubTabId | undefined);
                          focusMainDestinationAfterMegaMenuClose();
                        }}
                        className={itemClasses}
                      >
                        {innerContent}
                      </RadarLink>
                    );
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        if (item.actionId) onTriggerAction(item.actionId);
                      }}
                      className={itemClasses}
                    >
                      {innerContent}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-3 pt-2.5 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-text-muted)]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <RadarLink
            href="/"
            aria-current={activeView === 'home' ? 'page' : undefined}
            onNavigate={() => {
              onClose();
              onSelectDestination('home');
              focusMainDestinationAfterMegaMenuClose();
            }}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1 rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)]/60 hover:bg-[var(--color-bg-muted)] font-semibold text-[var(--color-text-primary)] cursor-pointer"
          >
            <Home className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
            <span>{isEn ? 'Home' : 'صفحه نخست'}</span>
          </RadarLink>
          <RadarLink
            href="/account/settings"
            onNavigate={() => {
              onClose();
              onSelectDestination('userspace', 'settings');
              focusMainDestinationAfterMegaMenuClose();
            }}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1 rounded-[8px] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-muted)] font-semibold text-[var(--color-text-secondary)] cursor-pointer"
          >
            <span>{isEn ? 'Display & Settings' : 'تنظیمات نمایش و حساب'}</span>
          </RadarLink>
        </div>
        <button
          type="button"
          onClick={handleCloseViaButton}
          className="min-h-[38px] px-3 py-1 rounded-md hover:bg-[var(--color-bg-muted)] font-semibold text-[var(--color-text-secondary)] cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          {isEn ? 'Close (Esc)' : 'بستن (Esc)'}
        </button>
      </div>
      </div>
    </div>
  );
};

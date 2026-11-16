/** @file src/components/navigation/DesktopMegaMenu.tsx — Categorized Desktop Mega Menu (RT-UI-NAV-001 Section 4.1) */
import React, { useEffect, useRef } from 'react';
import { Briefcase, BookOpen, MessageSquarePlus, Compass, Sparkles } from 'lucide-react';
import { DESKTOP_MEGA_MENU_GROUPS, type MegaMenuEntry } from '../../navigation/primary/megaMenuAndTabsConfig';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';

export interface DesktopMegaMenuProps {
  open: boolean;
  onClose: () => void;
  onMouseEnterMenu?: () => void;
  onMouseLeaveMenu?: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  topOffsetClass?: string;
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
  topOffsetClass = 'top-[56px] lg:top-[68px]',
  locale,
  activeView,
  activeSubTab,
  onSelectDestination,
  onTriggerAction,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isEn = locale === 'en';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  return (
    <div
      ref={panelRef}
      id="desktop-mega-menu-panel"
      role="region"
      aria-label={isEn ? 'More platform modules' : 'سایر بخش‌ها و خدمات تخصصی'}
      onMouseEnter={onMouseEnterMenu}
      onMouseLeave={onMouseLeaveMenu}
      className={`fixed ${topOffsetClass} inset-x-4 max-w-5xl mx-auto z-50 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl shadow-2xl p-4 sm:p-5 animate-fadeIn`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {DESKTOP_MEGA_MENU_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.id];
          return (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center gap-1.5 px-2 pb-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-black text-slate-500 dark:text-slate-400">
                <GroupIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span>{isEn ? group.titleEn : group.titleFa}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = Boolean(item.viewId && activeView === item.viewId && (!item.subTab || activeSubTab === item.subTab));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        if (item.viewId) {
                          onSelectDestination(item.viewId as PrimaryViewId, item.subTab as ModuleSubTabId | undefined);
                        } else if (item.actionId) {
                          onTriggerAction(item.actionId);
                        }
                      }}
                      className={`w-full text-start px-2.5 py-2 rounded-xl transition cursor-pointer flex flex-col gap-0.5 group focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-extrabold group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition truncate">
                          {isEn ? item.labelEn : item.labelFa}
                        </span>
                        {item.status === 'beta' && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 shrink-0">
                            {isEn ? 'Beta' : 'آزمایشی'}
                          </span>
                        )}
                      </div>
                      <span className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                        {isEn ? item.descEn : item.descFa}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>{isEn ? 'All modules remain synced with your selected city, neighborhood, and active budget context.' : 'تمام بخش‌ها با شهر، محله فعال و بودجه تنظیم‌شده شما همگام می‌مانند.'}</span>
        </span>
        <button type="button" onClick={onClose} className="px-2 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
          {isEn ? 'Close (Esc)' : 'بستن (Esc)'}
        </button>
      </div>
    </div>
  );
};

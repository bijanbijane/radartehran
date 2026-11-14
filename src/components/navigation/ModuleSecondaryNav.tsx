/** @file src/components/navigation/ModuleSecondaryNav.tsx — Breadcrumb + Secondary Sub-Navigation Bar (RT-UI-NAV-001 Sections 6 & 7) */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildNavigationBreadcrumbs } from '../../navigation/contextual/breadcrumb';
import type { ModuleSubTabId, SecondaryTabDefinition } from '../../navigation/registry/route.types';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';

export interface ModuleSecondaryNavProps {
  primaryView: PrimaryViewId;
  subTab?: ModuleSubTabId;
  tabs?: readonly SecondaryTabDefinition[];
  onSelectSubTab?: (tabId: ModuleSubTabId) => void;
  onNavigateView: (viewId: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  locale: RadarLocale;
  cityName?: string;
  hoodName?: string;
}

export const ModuleSecondaryNav: React.FC<ModuleSecondaryNavProps> = ({
  primaryView,
  subTab,
  tabs,
  onSelectSubTab,
  onNavigateView,
  locale,
  cityName,
  hoodName,
}) => {
  const isEn = locale === 'en';
  const Separator = isEn ? ChevronRight : ChevronLeft;

  const desktopCrumbs = buildNavigationBreadcrumbs({
    viewId: primaryView,
    subTab,
    locale,
    cityName,
    hoodName,
    compactForMobile: false,
  });

  const mobileCrumbs = buildNavigationBreadcrumbs({
    viewId: primaryView,
    subTab,
    locale,
    cityName,
    hoodName,
    compactForMobile: true,
  });

  const renderCrumbList = (items: ReturnType<typeof buildNavigationBreadcrumbs>) => (
    <ol className="flex items-center gap-1 text-[11px] min-w-0 overflow-hidden">
      {items.map((node, idx) => (
        <li key={`${node.id}-${idx}`} className="flex items-center gap-1 min-w-0">
          {idx > 0 && <Separator className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />}
          {node.isCurrent || node.ellipsis ? (
            <span
              aria-current={node.isCurrent ? 'page' : undefined}
              className={`truncate whitespace-nowrap ${node.isCurrent ? 'font-extrabold text-slate-900 dark:text-white' : 'text-slate-400 px-0.5'}`}
            >
              {node.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateView(node.viewId as PrimaryViewId, node.subTab)}
              className="text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 font-semibold transition truncate whitespace-nowrap cursor-pointer"
            >
              {node.label}
            </button>
          )}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="w-full border-b border-slate-200/75 dark:border-slate-800/80 bg-slate-50/75 dark:bg-slate-900/70 px-3 sm:px-4 py-1.5 space-y-1.5">
      <nav aria-label={isEn ? 'Breadcrumb' : 'مسیر ناوبری'} className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <div className="hidden sm:block min-w-0">{renderCrumbList(desktopCrumbs)}</div>
        <div className="sm:hidden min-w-0">{renderCrumbList(mobileCrumbs)}</div>
      </nav>
      {tabs && tabs.length > 0 && onSelectSubTab && (
        <div role="tablist" aria-label={isEn ? 'Module sections' : 'زیرصفحات بخش'} className="max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {tabs.map((tab) => {
            const active = subTab === tab.id || (!subTab && tab.id === tabs[0]?.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectSubTab(tab.id as ModuleSubTabId)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1 ${
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{isEn ? tab.labelEn : tab.labelFa}</span>
                {tab.status === 'beta' && (
                  <span className={`text-[9px] px-1 rounded ${active ? 'bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                    {isEn ? 'Beta' : 'آزمایشی'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

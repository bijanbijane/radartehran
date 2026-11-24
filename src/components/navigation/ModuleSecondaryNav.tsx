/** @file src/components/navigation/ModuleSecondaryNav.tsx — Breadcrumb + Secondary Sub-Navigation Bar (RT-UI-NAV-001 Sections 6 & 7) */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildNavigationBreadcrumbs } from '../../navigation/contextual/breadcrumb';
import { buildCanonicalPathForDestination } from '../../navigation/url/navigationUrlContract';
import type { ModuleSubTabId, SecondaryTabDefinition } from '../../navigation/registry/route.types';
import type { PrimaryViewId, RadarLocale } from '../../utils/areaUnit';
import { RadarLink } from '../ui/RadarPrimitives';

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
    <ol className="flex items-center gap-1 text-xs min-w-0 overflow-hidden">
      {items.map((node, idx) => (
        <li key={`${node.id}-${idx}`} className="flex items-center gap-1 min-w-0">
          {idx > 0 && <Separator className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />}
          {node.isCurrent || node.ellipsis ? (
            <span
              aria-current={node.isCurrent ? 'page' : undefined}
              className={`truncate whitespace-nowrap ${node.isCurrent ? 'font-bold text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] px-0.5'}`}
            >
              {node.label}
            </span>
          ) : (
            <RadarLink
              href={node.path || buildCanonicalPathForDestination(node.viewId, node.subTab)}
              onNavigate={() => onNavigateView(node.viewId as PrimaryViewId, node.subTab)}
              className="min-h-[44px] sm:min-h-[36px] px-1.5 inline-flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-brand-fg)] font-semibold transition truncate whitespace-nowrap cursor-pointer"
            >
              {node.label}
            </RadarLink>
          )}
        </li>
      ))}
    </ol>
  );

  // Account has its own adaptive AccountSidebarNav; skip single-item strips & dedicated legal docs
  const isDedicatedLegalDoc = subTab === 'legal_privacy' || subTab === 'legal_terms';
  const showModuleTabs = Boolean(tabs && tabs.length > 1 && onSelectSubTab && primaryView !== 'userspace' && !isDedicatedLegalDoc);

  if (primaryView === 'home' && !showModuleTabs) {
    return null;
  }

  return (
    <div className="w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 px-4 sm:px-6 py-2 space-y-1.5">
      <nav aria-label={isEn ? 'Breadcrumb' : 'مسیر ناوبری'} className="max-w-[1320px] mx-auto flex items-center justify-between gap-2">
        <div className="hidden sm:block min-w-0">{renderCrumbList(desktopCrumbs)}</div>
        <div className="sm:hidden min-w-0">{renderCrumbList(mobileCrumbs)}</div>
      </nav>
      {showModuleTabs && tabs && onSelectSubTab && (
        <nav
          aria-label={isEn ? 'Module sections' : 'زیرصفحات بخش'}
          className="max-w-[1320px] mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
        >
          {tabs.map((tab) => {
            const active = subTab === tab.id || (!subTab && tab.id === tabs[0]?.id);
            const communityTestId =
              primaryView === 'contributions'
                ? tab.id === 'research'
                  ? 'community-tab-research_proposals'
                  : tab.id === 'contributions'
                    ? 'community-tab-data_contribution'
                    : `community-tab-${tab.id}`
                : undefined;
            return (
              <RadarLink
                key={tab.id}
                href={tab.path}
                data-testid={communityTestId}
                aria-current={active ? 'page' : undefined}
                onNavigate={() => onSelectSubTab(tab.id as ModuleSubTabId)}
                className={`min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[var(--color-brand-600)] text-white shadow-2xs'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>{isEn ? tab.labelEn : tab.labelFa}</span>
                {tab.status === 'beta' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-[6px] leading-none ${active ? 'bg-white/20 text-white' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'}`}>
                    {isEn ? 'Beta' : 'آزمایشی'}
                  </span>
                )}
              </RadarLink>
            );
          })}
        </nav>
      )}
    </div>
  );
};

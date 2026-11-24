/** @file src/components/navigation/radarBottomNavParts.tsx — Strict 5-Destination Mobile Tab Bar Parts (RT-UI-NAV-001) */
import type { ProductNavigationItem } from './primaryNavigation';
import type { PrimaryViewId } from '../../utils/areaUnit';
import { buildCanonicalPathForDestination } from '../../navigation/url/navigationUrlContract';
import { RadarLink } from '../ui/RadarPrimitives';

// Strictly 4 direct primary destinations + 'بیشتر' button in RadarBottomNav = 5 mobile bottom items total
export const MOBILE_NAV_ORDER: PrimaryViewId[] = ['discover', 'intelligence', 'map', 'properties'];

export const tabIdle =
  'text-[var(--color-text-muted)] [@media(hover:hover)]:hover:text-[var(--color-text-primary)] [@media(hover:hover)]:hover:bg-[var(--color-bg-muted)]';
export const tabActive = 'text-[var(--color-brand-700)] dark:text-[#86d8cb]';

export function NavTabButton(props: {
  item: ProductNavigationItem;
  isActive: boolean;
  onSelect: () => void;
  testId: string;
}) {
  const { item, isActive, onSelect, testId } = props;
  const Icon = item.Icon;
  return (
    <RadarLink
      href={buildCanonicalPathForDestination(item.id)}
      data-testid={testId}
      aria-current={isActive ? 'page' : undefined}
      onNavigate={onSelect}
      className={`relative w-full h-full min-h-14 min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-xs font-bold transition active:scale-95 cursor-pointer touch-manipulation ${isActive ? tabActive : tabIdle}`}
    >
      {isActive && <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--color-brand-600)] dark:bg-emerald-400" aria-hidden="true" />}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate text-center leading-4">{item.label}</span>
    </RadarLink>
  );
}

export function MapCenterButton(props: { item: ProductNavigationItem; isActive: boolean; onSelect: () => void }) {
  const { item, isActive, onSelect } = props;
  const Icon = item.Icon;
  return (
    <div className="relative flex items-end justify-center pb-1 pointer-events-none">
      <RadarLink
        href={buildCanonicalPathForDestination(item.id)}
        data-testid="mobile-nav-map"
        aria-current={isActive ? 'page' : undefined}
        onNavigate={onSelect}
        className={`pointer-events-auto -translate-y-2.5 flex flex-col items-center justify-center gap-0.5 rounded-[14px] px-3.5 pt-2 pb-1.5 shadow-lg transition active:scale-95 cursor-pointer touch-manipulation min-w-[4.25rem] min-h-[48px] ${
          isActive
            ? 'bg-[var(--color-brand-600)] text-white shadow-emerald-600/30 ring-2 ring-emerald-300/70 dark:bg-emerald-500 dark:ring-emerald-400/40'
            : 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] shadow-slate-300/25'
        }`}
      >
        <Icon className={`shrink-0 ${isActive ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`} aria-hidden="true" />
        <span className="text-xs font-bold leading-none">{item.label}</span>
      </RadarLink>
    </div>
  );
}

/** @file src/components/navigation/radarBottomNavParts.tsx — Strict 5-Destination Mobile Tab Bar Parts (RT-UI-NAV-001) */
import type { ProductNavigationItem } from './primaryNavigation';
import type { PrimaryViewId } from '../../utils/areaUnit';

// Strictly 4 direct primary destinations + 'بیشتر' button in RadarBottomNav = 5 mobile bottom items total
export const MOBILE_NAV_ORDER: PrimaryViewId[] = ['discover', 'intelligence', 'map', 'properties'];

export const tabIdle =
  'text-slate-500 [@media(hover:hover)]:hover:text-slate-800 [@media(hover:hover)]:hover:bg-slate-100/80 dark:text-slate-400 dark:[@media(hover:hover)]:hover:text-slate-100 dark:[@media(hover:hover)]:hover:bg-slate-800/80';
export const tabActive = 'text-emerald-700 dark:text-emerald-300';

export function NavTabButton(props: {
  item: ProductNavigationItem;
  isActive: boolean;
  onSelect: () => void;
  testId: string;
}) {
  const { item, isActive, onSelect, testId } = props;
  const Icon = item.Icon;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={isActive ? 'page' : undefined}
      aria-pressed={isActive}
      onClick={onSelect}
      className={`relative min-h-14 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] font-bold transition active:scale-95 cursor-pointer touch-manipulation ${isActive ? tabActive : tabIdle}`}
    >
      {isActive && <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--color-brand-600)] dark:bg-emerald-400" aria-hidden="true" />}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate text-center leading-3.5">{item.label}</span>
    </button>
  );
}

export function MapCenterButton(props: { item: ProductNavigationItem; isActive: boolean; onSelect: () => void }) {
  const { item, isActive, onSelect } = props;
  const Icon = item.Icon;
  return (
    <div className="relative flex items-end justify-center pb-1 pointer-events-none">
      <button
        type="button"
        data-testid="mobile-nav-map"
        aria-current={isActive ? 'page' : undefined}
        aria-pressed={isActive}
        onClick={onSelect}
        className={`pointer-events-auto -translate-y-2.5 flex flex-col items-center gap-0.5 rounded-2xl px-3.5 pt-2 pb-1.5 shadow-lg transition active:scale-95 cursor-pointer touch-manipulation min-w-[4rem] ${
          isActive
            ? 'bg-[var(--color-brand-600)] text-white shadow-emerald-600/30 ring-2 ring-emerald-300/70 dark:bg-emerald-500 dark:ring-emerald-400/40'
            : 'bg-white text-slate-800 border border-slate-200/90 shadow-slate-300/25 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 [@media(hover:hover)]:hover:bg-slate-50'
        }`}
      >
        <Icon className={`shrink-0 ${isActive ? 'h-6 w-6' : 'h-5 w-5'}`} aria-hidden="true" />
        <span className="text-[10px] font-extrabold leading-none">{item.label}</span>
      </button>
    </div>
  );
}

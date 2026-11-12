import type { ProductNavigationItem } from './primaryNavigation';
import type { PrimaryViewId } from '../../utils/areaUnit';

export const MOBILE_NAV_ORDER: PrimaryViewId[] = ['home', 'discover', 'intelligence', 'map', 'tools', 'userspace'];

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
      className={`relative min-h-14 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-bold transition active:scale-95 cursor-pointer touch-manipulation ${isActive ? tabActive : tabIdle}`}
    >
      {isActive && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="line-clamp-2 text-center leading-3">{item.label}</span>
    </button>
  );
}

export function MapCenterButton(props: { item: ProductNavigationItem; isActive: boolean; onSelect: () => void }) {
  const { item, isActive, onSelect } = props;
  const Icon = item.Icon;
  return (
    <div className="relative flex items-end justify-center pb-0.5 pointer-events-none">
      <button
        type="button"
        data-testid="mobile-nav-map"
        aria-current={isActive ? 'page' : undefined}
        aria-pressed={isActive}
        onClick={onSelect}
        className={`pointer-events-auto -translate-y-3 flex flex-col items-center gap-0.5 rounded-2xl px-3 pt-2 pb-1.5 shadow-lg transition active:scale-95 cursor-pointer touch-manipulation min-w-[4.25rem] ${
          isActive
            ? 'bg-sky-600 text-white shadow-sky-600/35 ring-2 ring-sky-300/80 dark:bg-sky-500 dark:ring-sky-400/40'
            : 'bg-white text-sky-700 border border-sky-200/90 shadow-slate-300/25 dark:bg-slate-800 dark:text-sky-300 dark:border-sky-700/60 [@media(hover:hover)]:hover:bg-sky-50 dark:[@media(hover:hover)]:hover:bg-slate-700/80'
        }`}
      >
        <Icon className={`shrink-0 ${isActive ? 'h-7 w-7' : 'h-6 w-6'}`} aria-hidden="true" />
        <span className="text-[10px] font-extrabold leading-none">{item.label}</span>
      </button>
    </div>
  );
}

/**
 * @file MapExplorerResultsSidebar.tsx — Viewport-aware neighborhood list for map explorer mode (RT-UI-MAP-PILOT-001)
 */
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, List, Search, X } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { RadarBadge } from '../common/RadarBadge';
import { RadarCard } from '../common/RadarCard';
import { RadarInput } from '../common/RadarInput';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { matchesPersianSearch } from '../../utils/security';
import { type MapViewportBoundsState, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { listNeighborhoodsInMapViewport, resolveMapExplorerNeighborhoodList } from './mapViewportHoodFilter';

const SIDEBAR_STORAGE_KEY = 'radar_map_explorer_sidebar_open_v1';

export interface MapExplorerResultsSidebarProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHoodId: number;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  mode: 'rent' | 'buy';
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
};

type SidebarPanelProps = {
  filtered: EvaluatedNeighborhood[];
  viewportCount: number;
  filterRankingByViewport: boolean;
  viewportBounds: MapViewportBoundsState | null;
  localQuery: string;
  setLocalQuery: (v: string) => void;
  selectedHoodId: number;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  mode: 'rent' | 'buy';
  isEn: boolean;
  onClose?: () => void;
  showClose?: boolean;
};

const MapExplorerSidebarPanel: React.FC<SidebarPanelProps> = ({
  filtered,
  viewportCount,
  filterRankingByViewport,
  viewportBounds,
  localQuery,
  setLocalQuery,
  selectedHoodId,
  onSelectNeighborhood,
  mode,
  isEn,
  onClose,
  showClose,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] dark:border-slate-800 shrink-0">
        <div>
          <h2 className="text-xs font-black text-[var(--color-text-primary)] dark:text-slate-100">
            {isEn ? 'Map explorer' : 'کاوشگر نقشه'}
          </h2>
          <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
            {toPersianNum(filtered.length)} {isEn ? 'areas' : 'محله'}
            {viewportBounds ? ` · ${toPersianNum(viewportCount)} ${isEn ? 'in view' : 'در کادر'}` : ''}
          </p>
        </div>
        {showClose && onClose ? (
          <button type="button" onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={isEn ? 'Close' : 'بستن'}>
            <X className="w-4 h-4" />
          </button>
        ) : onClose ? (
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={isEn ? 'Collapse' : 'جمع کردن'}>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      <div className="px-3 pt-2 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
          <RadarInput
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={isEn ? 'Search in list…' : 'جست‌وجو در فهرست…'}
            aria-label={isEn ? 'Filter neighborhoods in sidebar' : 'فیلتر محله‌ها در نوار کناری'}
            className="pr-8"
            inputSize="sm"
          />
        </div>
        <button
          type="button"
          disabled={!viewportBounds}
          aria-pressed={filterRankingByViewport}
          onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })}
          className={`w-full text-[10px] font-bold py-2 min-h-[44px] rounded-lg border transition ${!viewportBounds ? 'opacity-50 cursor-not-allowed border-slate-200' : filterRankingByViewport ? 'bg-[var(--color-brand-600)] text-white border-emerald-700' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          {isEn ? 'Only neighborhoods in current map view' : 'فقط محله‌های داخل کادر نقشه'}
        </button>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2 pt-1 space-y-1.5" role="listbox" aria-label={isEn ? 'Neighborhood results' : 'فهرست محله‌ها'}>
        {filtered.length === 0 ? (
          <li className="text-[11px] text-center text-slate-500 py-6 px-2">
            {filterRankingByViewport
              ? (isEn ? 'No neighborhoods in the visible map area. Pan the map or disable viewport filter.' : 'محله‌ای در کادر فعلی نقشه نیست. نقشه را جابه‌جا کنید یا فیلتر کادر را خاموش کنید.')
              : (isEn ? 'No matching neighborhoods.' : 'محله‌ای با این جست‌وجو یافت نشد.')}
          </li>
        ) : (
          filtered.slice(0, 80).map((hood) => {
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const selected = hood.id === selectedHoodId;
            return (
              <li key={hood.id} role="option" aria-selected={selected}>
                <RadarCard
                  variant="action"
                  interactive
                  padding="sm"
                  className={`cursor-pointer transition ${selected ? 'ring-2 ring-[var(--color-brand-600)] bg-emerald-50/80 dark:bg-emerald-950/40' : ''}`}
                  onClick={() => onSelectNeighborhood(hood)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] dark:text-slate-100 truncate">{hood.name}</span>
                    <RadarBadge tone={STATUS_BADGE[hood.status] || 'neutral'} className="shrink-0 text-[9px]">
                      {toPersianNum(hood.overallScore)}
                    </RadarBadge>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-1">{hood.zone}</p>
                  <p className="text-[10px] font-semibold tabular-nums mt-1 text-slate-700 dark:text-slate-300">
                    {mode === 'buy'
                      ? `${isEn ? 'Buy' : 'خرید'}: ${toPersianNum(unitBuy)} ${intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale) : 'م/م²'}`
                      : `${isEn ? 'Rent ref' : 'رهن ref'}: ${toPersianNum(hood.rahn80m)} م`}
                    <span className="text-[9px] font-normal text-slate-400 block">
                      {isEn ? 'Index / estimate — not a live listing' : 'شاخص تخمینی — نه آگهی زنده'}
                    </span>
                  </p>
                </RadarCard>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
};

export const MapExplorerResultsSidebar: React.FC<MapExplorerResultsSidebarProps> = ({
  evaluatedNeighborhoods,
  selectedHoodId,
  onSelectNeighborhood,
  mode,
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';
  const { filterRankingByViewport, viewportBounds } = useMapAdvancedOverlayState();
  const [localQuery, setLocalQuery] = useState('');
  const [open, setOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw === '0') return false;
    } catch { /* ignore */ }
    return true;
  });

  const baseList = useMemo(
    () =>
      resolveMapExplorerNeighborhoodList({
        neighborhoods: evaluatedNeighborhoods,
        viewportBounds,
        restrictToViewport: filterRankingByViewport,
      }),
    [evaluatedNeighborhoods, viewportBounds, filterRankingByViewport],
  );

  const viewportCount = useMemo(
    () => listNeighborhoodsInMapViewport(evaluatedNeighborhoods, viewportBounds).length,
    [evaluatedNeighborhoods, viewportBounds],
  );

  const filtered = useMemo(() => {
    const q = localQuery.trim();
    if (!q) return baseList;
    return baseList.filter(
      (h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q),
    );
  }, [baseList, localQuery]);

  const persistOpen = (next: boolean) => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
  };

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      persistOpen(next);
      return next;
    });
  };

  const closePanel = () => {
    setOpen(false);
    persistOpen(false);
  };

  const handleSelect = (hood: EvaluatedNeighborhood) => {
    onSelectNeighborhood(hood);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      closePanel();
    }
  };

  const panelProps: SidebarPanelProps = {
    filtered,
    viewportCount,
    filterRankingByViewport,
    viewportBounds,
    localQuery,
    setLocalQuery,
    selectedHoodId,
    onSelectNeighborhood: handleSelect,
    mode,
    isEn,
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          data-testid="map-explorer-sidebar-reopen"
          onClick={toggleOpen}
          className="pointer-events-auto fixed z-[24] hidden lg:flex left-[4.25rem] top-[7.25rem] apple-vibrancy-bar rounded-r-xl border border-l-0 border-[var(--color-border-subtle)] dark:border-slate-700 px-2 py-3 shadow-md"
          aria-label={isEn ? 'Show map results' : 'نمایش نتایج نقشه'}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </button>
        <button
          type="button"
          data-testid="map-explorer-mobile-results"
          onClick={toggleOpen}
          className="pointer-events-auto fixed z-[23] lg:hidden left-3 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] min-h-[44px] min-w-[44px] px-3 py-2.5 rounded-full apple-vibrancy-bar border border-[var(--color-border-subtle)] dark:border-slate-700 shadow-lg flex items-center gap-2 text-[11px] font-bold text-[var(--color-text-primary)]"
          aria-label={isEn ? 'Open map results' : 'باز کردن نتایج نقشه'}
        >
          <List className="w-4 h-4 shrink-0" aria-hidden />
          <span className="tabular-nums">{toPersianNum(filtered.length)}</span>
        </button>
      </>
    );
  }

  return (
    <>
      <aside
        data-testid="map-explorer-results-sidebar"
        aria-label={isEn ? 'Map search results' : 'نتایج جست‌وجو در نقشه'}
        className="pointer-events-auto fixed z-[24] hidden lg:flex left-[4.25rem] top-[7rem] bottom-8 w-[min(calc(100vw-5rem),18.5rem)] flex-col apple-vibrancy-bar border border-[var(--color-border-subtle)] dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden"
      >
        <MapExplorerSidebarPanel {...panelProps} onClose={closePanel} />
      </aside>

      <div className="lg:hidden pointer-events-none fixed inset-0 z-[25]">
        <button
          type="button"
          className="pointer-events-auto absolute inset-0 bg-black/35 backdrop-blur-[1px]"
          aria-label={isEn ? 'Close results' : 'بستن نتایج'}
          onClick={closePanel}
        />
        <aside
          data-testid="map-explorer-results-sidebar-mobile"
          aria-label={isEn ? 'Map search results' : 'نتایج جست‌وجو در نقشه'}
          className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[min(58dvh,28rem)] flex flex-col apple-vibrancy-bar border-t border-[var(--color-border-subtle)] dark:border-slate-700 rounded-t-2xl shadow-2xl overflow-hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <MapExplorerSidebarPanel {...panelProps} onClose={closePanel} showClose />
        </aside>
      </div>
    </>
  );
};
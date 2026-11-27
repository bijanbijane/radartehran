/**
 * @file MapExplorerResultsSidebar.tsx — Unified right-panel neighborhood list (Desktop) & single-sheet mobile/tablet explorer
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, List, Search, SlidersHorizontal, X } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { RadarBadge } from '../common/RadarBadge';
import { RadarInput } from '../common/RadarInput';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { matchesPersianSearch } from '../../utils/security';
import { type MapViewportBoundsState, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { listNeighborhoodsInMapViewport, resolveMapExplorerNeighborhoodList, resolveMapExplorerSelectedNeighborhood } from './mapViewportHoodFilter';
import { formatPersianScore } from '../../utils/persianBidiFormat';
import { resolveInitialSidebarOpen, type DesktopMapPanelMode } from './mapSheetCoordinator';
import { calculateNeighborhoodMedianMetric } from './neighborhoodMedianMetric';

const SIDEBAR_STORAGE_KEY = 'radar_map_explorer_sidebar_open_v1';

export interface MapExplorerResultsSidebarProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHoodId: number;
  selectedHood?: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  mode: 'rent' | 'buy';
  desktopPanelMode?: DesktopMapPanelMode;
  onChangeDesktopPanelMode?: (mode: DesktopMapPanelMode) => void;
  mobileListOpen?: boolean;
  onChangeMobileListOpen?: (open: boolean) => void;
  onOpenInspector?: () => void;
  hideMobilePeekBar?: boolean;
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
};

type SidebarPanelProps = {
  filtered: EvaluatedNeighborhood[];
  viewportCount: number;
  medianMetric: number | null;
  filterRankingByViewport: boolean;
  viewportBounds: MapViewportBoundsState | null;
  localQuery: string;
  setLocalQuery: (v: string) => void;
  selectedHoodId: number;
  selectedHoodName?: string;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: () => void;
  mode: 'rent' | 'buy';
  isEn: boolean;
  onClose?: () => void;
  showClose?: boolean;
};

const MapExplorerSidebarPanel: React.FC<SidebarPanelProps> = ({
  filtered,
  viewportCount,
  medianMetric,
  filterRankingByViewport,
  viewportBounds,
  localQuery,
  setLocalQuery,
  selectedHoodId,
  selectedHoodName,
  onSelectNeighborhood,
  onOpenInspector,
  mode,
  isEn,
  onClose,
  showClose,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const displayMedian = medianMetric === null
    ? null
    : mode === 'buy' ? convertPricePerSqmToUnit(medianMetric, areaUnit) : medianMetric;

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] truncate">
            {isEn ? 'Neighborhoods' : 'فهرست محله‌ها'}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] tabular-nums truncate">
            {toPersianNum(filtered.length)} {isEn ? 'areas' : 'محله'}
            {viewportBounds ? ` · ${toPersianNum(viewportCount)} ${isEn ? 'in view' : 'در کادر'}` : ''}
            {displayMedian !== null
              ? ` · ${isEn ? 'Median' : 'میانه'}: ${toPersianNum(displayMedian)} ${mode === 'buy' ? 'م/م²' : 'م'}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!showClose && onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              className="px-2.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white text-xs font-bold hover:bg-[var(--color-brand-700)] transition cursor-pointer whitespace-nowrap"
            >
              {isEn ? 'Inspect' : selectedHoodName ? `جزئیات ${selectedHoodName}` : 'جزئیات محله'}
            </button>
          )}
          {showClose && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[8px] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] cursor-pointer"
              aria-label={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          ) : onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-[8px] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] cursor-pointer"
              aria-label={isEn ? 'Collapse' : 'جمع کردن'}
              title={isEn ? 'Collapse sidebar' : 'جمع کردن پنل'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-3 pt-2.5 pb-1.5 space-y-2 shrink-0">
        {showClose && (
          <div className="relative">
            <Search className="w-4 h-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" aria-hidden="true" />
            <RadarInput
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder={isEn ? 'Search in list…' : 'جست‌وجو در فهرست محله‌ها…'}
              aria-label={isEn ? 'Filter neighborhoods in sidebar' : 'فیلتر محله‌ها در نوار کناری'}
              className="ps-9 text-xs"
              inputSize="sm"
            />
          </div>
        )}
        <button
          type="button"
          disabled={!viewportBounds}
          aria-pressed={filterRankingByViewport}
          onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })}
          className={`w-full text-xs font-bold py-2 min-h-[44px] lg:min-h-[36px] rounded-[8px] border transition cursor-pointer ${
            !viewportBounds
              ? 'opacity-50 cursor-not-allowed border-[var(--color-border-subtle)]'
              : filterRankingByViewport
                ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-700)]'
                : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
          }`}
        >
          {isEn ? 'Only neighborhoods in current map view' : 'فقط محله‌های داخل کادر نقشه'}
        </button>
      </div>

      <ul
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 pb-3 pt-1 space-y-1.5"
        role="listbox"
        aria-label={isEn ? 'Neighborhood results' : 'فهرست محله‌ها'}
      >
        {filtered.length === 0 ? (
          <li className="text-xs text-center text-[var(--color-text-muted)] py-8 px-3">
            {filterRankingByViewport
              ? isEn
                ? 'No neighborhoods in the visible map area. Pan the map or disable viewport filter.'
                : 'محله‌ای در کادر فعلی نقشه نیست. نقشه را جابه‌جا کنید یا فیلتر کادر را خاموش کنید.'
              : isEn
                ? 'No matching neighborhoods.'
                : 'محله‌ای با این جست‌وجو یافت نشد.'}
          </li>
        ) : (
          filtered.slice(0, 80).map((hood) => {
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const selected = hood.id === selectedHoodId;
            return (
              <li key={hood.id} role="option" aria-selected={selected}>
                <div
                  className={`p-3 rounded-[12px] border transition ${
                    selected
                      ? 'border-[var(--color-brand-600)] ring-2 ring-[var(--color-brand-600)]/40 bg-[var(--color-brand-soft)] dark:bg-[#173530]'
                      : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNeighborhood(hood)}
                    className="w-full text-start cursor-pointer focus-visible:outline-none"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                        {hood.name}
                      </span>
                      <RadarBadge tone="brand" className="shrink-0 text-xs tabular-nums">
                        {isEn ? `${hood.overallScore.toFixed(1)} / 10` : formatPersianScore(hood.overallScore)}
                      </RadarBadge>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">{hood.zone}</p>
                      <RadarBadge tone={STATUS_BADGE[hood.status] || 'neutral'} className="shrink-0 text-[11px]">
                        {hood.status === 'green'
                          ? (isEn ? 'In Budget' : 'هم‌تراز بودجه')
                          : hood.status === 'yellow'
                            ? (isEn ? 'Near Budget' : 'نزدیک بودجه')
                            : (isEn ? 'Above Budget' : 'بالاتر از بودجه')}
                      </RadarBadge>
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="text-xs font-bold tabular-nums text-[var(--color-text-secondary)]">
                      {mode === 'buy'
                        ? `${isEn ? 'Buy' : 'خرید'}: ${toPersianNum(unitBuy)} ${
                            intlCurrency !== 'IRT'
                              ? formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)
                              : 'م/م²'
                          }`
                        : `${isEn ? 'Deposit' : 'رهن کامل'}: ${toPersianNum(hood.rahn80m)} م`}
                    </p>
                    {selected && onOpenInspector && (
                      <button
                        type="button"
                        onClick={onOpenInspector}
                        className="min-h-[44px] lg:min-h-[28px] inline-flex items-center text-xs font-bold text-[var(--color-brand-fg)] hover:underline cursor-pointer shrink-0"
                      >
                        {isEn ? 'Details ←' : 'جزئیات ←'}
                      </button>
                    )}
                  </div>
                </div>
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
  selectedHood,
  onSelectNeighborhood,
  mode,
  desktopPanelMode,
  onChangeDesktopPanelMode,
  mobileListOpen,
  onChangeMobileListOpen,
  onOpenInspector,
  hideMobilePeekBar = false,
}) => {
  const [locale] = useRadarLocale();
  const [areaUnit] = useAreaUnit();
  const isEn = locale === 'en';
  const { filterRankingByViewport, viewportBounds } = useMapAdvancedOverlayState();
  const [localQuery, setLocalQuery] = useState('');

  const [internalOpen, setInternalOpen] = useState(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return resolveInitialSidebarOpen(width, stored);
  });

  const isDesktopControlled = desktopPanelMode !== undefined && onChangeDesktopPanelMode !== undefined;
  const isMobileControlled = mobileListOpen !== undefined && onChangeMobileListOpen !== undefined;

  const desktopListVisible = isDesktopControlled ? desktopPanelMode === 'list' : internalOpen;
  const desktopCollapsed = isDesktopControlled ? desktopPanelMode === 'collapsed' : !internalOpen;
  const mobileSheetVisible = isMobileControlled ? mobileListOpen : internalOpen;

  useEffect(() => {
    if (!mobileSheetVisible) return undefined;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isMobileControlled) onChangeMobileListOpen?.(false);
      else setInternalOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [mobileSheetVisible, isMobileControlled, onChangeMobileListOpen]);

  const baseList = useMemo(
    () =>
      resolveMapExplorerNeighborhoodList({
        neighborhoods: evaluatedNeighborhoods,
        viewportBounds,
        restrictToViewport: filterRankingByViewport,
      }),
    [evaluatedNeighborhoods, viewportBounds, filterRankingByViewport],
  );

  const filtered = useMemo(() => {
    const q = localQuery.trim();
    if (!q) return baseList;
    return baseList.filter(
      (h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q),
    );
  }, [baseList, localQuery]);

  const viewportCount = useMemo(
    () => Math.min(filtered.length, listNeighborhoodsInMapViewport(filtered, viewportBounds).length),
    [filtered, viewportBounds],
  );

  const medianMetric = useMemo(() => calculateNeighborhoodMedianMetric(filtered, mode), [filtered, mode]);

  const persistOpen = (next: boolean) => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const openDesktopList = () => {
    if (isDesktopControlled) {
      onChangeDesktopPanelMode?.('list');
    } else {
      setInternalOpen(true);
    }
    persistOpen(true);
  };

  const collapseDesktopPanel = () => {
    if (isDesktopControlled) {
      onChangeDesktopPanelMode?.('collapsed');
    } else {
      setInternalOpen(false);
    }
    persistOpen(false);
  };

  const openMobileList = () => {
    if (isMobileControlled) {
      onChangeMobileListOpen?.(true);
    } else {
      setInternalOpen(true);
    }
  };

  const closeMobileList = () => {
    if (isMobileControlled) {
      onChangeMobileListOpen?.(false);
    } else {
      setInternalOpen(false);
    }
  };

  const handleSelect = (hood: EvaluatedNeighborhood) => {
    onSelectNeighborhood(hood);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      closeMobileList();
    }
  };

  const resolvedSelectedHood = resolveMapExplorerSelectedNeighborhood({
    neighborhoods: evaluatedNeighborhoods,
    selectedHoodId,
    selectedHood,
  });

  const panelProps: SidebarPanelProps = {
    filtered,
    viewportCount,
    medianMetric,
    filterRankingByViewport,
    viewportBounds,
    localQuery,
    setLocalQuery,
    selectedHoodId,
    selectedHoodName: resolvedSelectedHood?.name,
    onSelectNeighborhood: handleSelect,
    onOpenInspector,
    mode,
    isEn,
  };

  return (
    <>
      {/* Desktop Collapsed Reopen Trigger (Right Edge) */}
      {desktopCollapsed && (
        <button
          type="button"
          data-testid="map-explorer-sidebar-reopen"
          onClick={openDesktopList}
          className="pointer-events-auto fixed z-[24] hidden lg:flex right-4 top-[calc(var(--header-height)+8px)] items-center gap-1.5 apple-vibrancy-bar rounded-[12px] px-3 py-2.5 text-xs font-bold text-[var(--color-text-primary)] cursor-pointer hover:border-[var(--color-brand-600)] transition"
          aria-label={isEn ? 'Show map results' : 'نمایش نتایج نقشه'}
        >
          <List className="w-4 h-4 text-[var(--color-brand-600)]" aria-hidden="true" />
          <span>{isEn ? 'Neighborhoods' : 'فهرست محله‌ها'}</span>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      {/* Desktop Unified Right Panel (List Mode) */}
      {desktopListVisible && (
        <aside
          data-testid="map-explorer-results-sidebar"
          aria-label={isEn ? 'Map search results' : 'نتایج جست‌وجو در نقشه'}
          className="pointer-events-auto fixed z-[24] hidden lg:flex right-4 top-[calc(var(--header-height)+8px)] bottom-4 w-[356px] flex-col apple-inspector-panel rounded-[12px] overflow-hidden"
        >
          <MapExplorerSidebarPanel {...panelProps} onClose={collapseDesktopPanel} />
        </aside>
      )}

      {/* Mobile & Tablet Unified Single Bottom Peek Bar (shown ONLY when no sheet is open) */}
      {!mobileSheetVisible && !hideMobilePeekBar && (
        <div
          data-testid="map-mobile-peek-bar"
          className="pointer-events-auto fixed z-[23] lg:hidden inset-x-2.5 bottom-[calc(4.35rem+env(safe-area-inset-bottom))] md:bottom-4 apple-vibrancy-bar rounded-[12px] px-3 py-2 flex items-center justify-between gap-2 shadow-lg"
        >
          <button
            type="button"
            onClick={onOpenInspector}
            className="min-w-0 flex-1 text-start min-h-[44px] flex flex-col justify-center cursor-pointer"
          >
            <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
              {resolvedSelectedHood ? (isEn ? resolvedSelectedHood.name : `محله ${resolvedSelectedHood.name}`) : (isEn ? 'Select area' : 'انتخاب محله')}
            </span>
            {resolvedSelectedHood && (
              <span className="text-xs font-semibold text-[var(--color-text-muted)] tabular-nums truncate">
                {mode === 'buy'
                  ? `${toPersianNum(convertPricePerSqmToUnit(resolvedSelectedHood.buyPerSqm, areaUnit))} م`
                  : `رهن ${toPersianNum(resolvedSelectedHood.rahn80m)} م`}
                {' · '}
                {isEn ? `${resolvedSelectedHood.overallScore.toFixed(1)} / 10` : formatPersianScore(resolvedSelectedHood.overallScore)}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="map-explorer-mobile-results"
              onClick={openMobileList}
              className="min-h-[44px] px-2.5 rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer hover:bg-[var(--color-bg-subtle)] transition whitespace-nowrap"
              aria-label={isEn ? 'Open map results' : 'باز کردن فهرست محله‌ها'}
            >
              <List className="w-4 h-4 text-[var(--color-brand-600)] shrink-0" aria-hidden="true" />
              <span>{isEn ? 'List' : 'فهرست'}</span>
              <span className="tabular-nums text-[var(--color-text-muted)]">({toPersianNum(filtered.length)})</span>
            </button>
            {onOpenInspector && (
              <button
                type="button"
                onClick={onOpenInspector}
                className="min-h-[44px] px-2.5 rounded-[8px] bg-[var(--color-brand-600)] text-white text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-[var(--color-brand-700)] transition whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{isEn ? 'Details' : 'جزئیات'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile & Tablet Exclusive Results Sheet */}
      {mobileSheetVisible && (
        <div className="lg:hidden pointer-events-none fixed inset-0 z-[36]">
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            aria-label={isEn ? 'Close results' : 'بستن نتایج'}
            onClick={closeMobileList}
          />
          <aside
            data-testid="map-explorer-results-sidebar-mobile"
            aria-label={isEn ? 'Map search results' : 'نتایج جست‌وجو در نقشه'}
            className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[min(68dvh,32rem)] flex flex-col apple-inspector-panel border-t border-[var(--color-border-subtle)] rounded-t-[20px] shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <MapExplorerSidebarPanel {...panelProps} onClose={closeMobileList} showClose />
          </aside>
        </div>
      )}
    </>
  );
};
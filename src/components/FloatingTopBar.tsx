import React from 'react'; import { ChevronDown, Compass, Layers, Navigation, Search, SlidersHorizontal, Sparkles, TrafficCone, TrainFront, X } from 'lucide-react'; import type { AuthUserSnapshot as FirebaseUser } from '../platform/auth'; import { EvaluatedNeighborhood, FREE_KEYLESS_TILE_SERVERS, MapTileServerId, MarketPulseData, WorkHub, toPersianNum } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData'; import type { ExpansionModalType } from './ExpansionModulesModal'; import { getVisibleSuperModulesSummary, type SuperModuleTabId } from '../navigation/registry/superModulesRegistry'; import { matchesPersianSearch, type FeatureFlags } from '../utils/security'; import { normalizeFinancialInput, formatMillionToVerbalPersian } from '../utils/persianFinancials'; import { MapLegend } from './MapLegend'; import { BuyingPowerSummaryCard } from './BuyingPowerSummaryCard'; import { SearchDropdownMenu, recordRecentSearch, useGlobalSearchShortcut } from './SearchDropdownMenu'; import { ModeSwitcherSegmented } from './ModeSwitcherSegmented'; import { TopBarProvinceAndCityDirectoryControl } from './TopBarProvinceDirectoryControl'; import { MapQuickControlsStrip } from './map/MapQuickControlsStrip'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { useExchangeRateSnapshot } from '../features/commerce/services/exchangeRateClient'; import { convertAreaFromSqm, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getRadarTopBarCopy, type PrimaryViewId } from '../utils/areaUnit'; import { RadarLink } from './ui/RadarPrimitives'; export interface FloatingTopBarProps { activeCity: CityId; featureFlags: FeatureFlags; onSwitchCity: (cityId: CityId, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => void; onFlyToCityCenter: () => void; setShowNationwideProvinceModal?: (v: boolean) => void; searchQuery: string; setSearchQuery: (q: string) => void; showSearchDropdown: boolean; setShowSearchDropdown: (v: boolean) => void; evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood; selectedHoodId: number; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; setMobileSheetOpen: (v: boolean) => void; onLocateNearestHood: () => void; mobileFilterOpen: boolean; setMobileFilterOpen: React.Dispatch<React.SetStateAction<boolean>>; showToolsPopover: boolean; setShowToolsPopover: React.Dispatch<React.SetStateAction<boolean>>;
  onBeforeOpenFloatingPanel?: (panel: 'search' | 'filter' | 'tools' | 'legend') => void;
  counts: { green: number; yellow: number; red: number }; setShowOnboardingModal: (v: boolean) => void; mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void; deposit: number; setDeposit: (v: number) => void; monthlyRent: number; setMonthlyRent: (v: number) => void; buyTotalBudget: number; setBuyTotalBudget: (v: number) => void; targetSqm: number; setTargetSqm: (v: number) => void; buildingAgeSegment: 'new' | 'mid' | 'older'; setBuildingAgeSegment: (seg: 'new' | 'mid' | 'older') => void; deductTenantRahnInBuy: boolean; setDeductTenantRahnInBuy: (v: boolean) => void; useLoanBooster: boolean; setUseLoanBooster: React.Dispatch<React.SetStateAction<boolean>>; extraGreenWithLoan: number; workHubId: string; setWorkHubId: (id: string) => void; activeCityWorkHubs: WorkHub[]; statusFilter: 'all' | 'green' | 'yellow' | 'red'; setStatusFilter: (s: 'all' | 'green' | 'yellow' | 'red') => void; onlyOutsideTrafficZone: boolean; setOnlyOutsideTrafficZone: React.Dispatch<React.SetStateAction<boolean>>; onlyHighMetro: boolean; setOnlyHighMetro: React.Dispatch<React.SetStateAction<boolean>>; onSaveUserPreferences: () => void; savingPrefs: boolean;
  currentUser: FirebaseUser | null; onCopyBudgetShareLink: () => void; prefsMessage: string; mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; setMapLens: (l: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap') => void; setSuperModuleInitialTab: (t: SuperModuleTabId) => void; setShowSuperModulesModal: (v: boolean) => void; setShowHedonicModal: (v: boolean) => void; setShowSmartSuggestModal: (v: boolean) => void; setShowCompareModal: (v: boolean) => void; setExpansionModalType: (t: ExpansionModalType) => void;
  setBargainHoodId: (id: number) => void; setSponsorHoodId: (id: number) => void; setShowAgencyModal: (v: boolean) => void; totalLiveBargainsCount: number; setShowVisitedModal: (v: boolean) => void; visitedHomesCount: number; setTradeUpCurrentHoodId: (id: number) => void; setShowTradeUpModal: (v: boolean) => void; setAlertHoodId: (id: number) => void; setAlertSubmitMsg: (msg: string) => void; setShowBuyerAlertModal: (v: boolean) => void; setShowPulseModal: (v: boolean) => void; marketPulse: MarketPulseData | null; setShowSeoDrawer: (v: boolean) => void; mapTileStyle: MapTileServerId; setMapTileStyle: React.Dispatch<React.SetStateAction<MapTileServerId>>; onSignOut: () => void; onGoogleSignIn: () => void; showMapLegendPopover: boolean; setShowMapLegendPopover: React.Dispatch<React.SetStateAction<boolean>>; mobileSheetOpen: boolean; lastSyncNotice?: string; connectionStatus?: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING'; onOpenReverseBudgetModal?: () => void; primaryView?: string; onNavigateView?: (view: PrimaryViewId, subTab?: any) => void; invalidCityParam?: string | null; isSpatialMeasureActive?: boolean; onToggleSpatialMeasure?: () => void; }
export function NetworkStatusBadge({ status = 'LIVE_SYNC', isEn = false }: { status?: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING'; isEn?: boolean }) {
  const isActuallyOffline = status === 'CACHED_OFFLINE' && typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!isActuallyOffline) return <></>;
  return <span data-connection-status={status} className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] text-xs font-bold border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{isEn ? 'Offline' : 'آفلاین'}</span>;
}
const LENS_OPTIONS = [{ id: 'budget' as const, label: 'بودجه من', labelEn: 'My Budget' }, { id: 'heatmap' as const, label: 'هیت‌مپ قیمت', labelEn: 'Price Heatmap' }, { id: 'bubble' as const, label: 'حباب قیمت', labelEn: 'Price Bubble' }, { id: 'air' as const, label: 'کیفیت هوا', labelEn: 'Air Quality' }, { id: 'traffic' as const, label: 'ترافیک', labelEn: 'Traffic' }]; export function FloatingTopBar(props: FloatingTopBarProps): React.ReactElement { const { activeCity, featureFlags, onSwitchCity, searchQuery, setSearchQuery, showSearchDropdown, setShowSearchDropdown, evaluatedNeighborhoods, selectedHood, selectedHoodId, onSelectNeighborhood, setMobileSheetOpen, onLocateNearestHood, mobileFilterOpen, setMobileFilterOpen, showToolsPopover, setShowToolsPopover, onBeforeOpenFloatingPanel, counts, setShowOnboardingModal, mode, setMode, deposit, setDeposit, monthlyRent, setMonthlyRent, buyTotalBudget, setBuyTotalBudget, targetSqm, setTargetSqm, buildingAgeSegment, setBuildingAgeSegment, deductTenantRahnInBuy, setDeductTenantRahnInBuy, useLoanBooster, setUseLoanBooster, extraGreenWithLoan, workHubId, setWorkHubId, activeCityWorkHubs, statusFilter, setStatusFilter, onlyOutsideTrafficZone, setOnlyOutsideTrafficZone, onlyHighMetro, setOnlyHighMetro, onSaveUserPreferences, savingPrefs, currentUser, onCopyBudgetShareLink, prefsMessage, mapLens, setMapLens, setSuperModuleInitialTab, setShowSuperModulesModal, setShowHedonicModal, setShowSmartSuggestModal,
    setShowCompareModal, setExpansionModalType, setBargainHoodId, setSponsorHoodId, setShowAgencyModal, totalLiveBargainsCount, setShowVisitedModal, visitedHomesCount, setTradeUpCurrentHoodId, setShowTradeUpModal, setAlertHoodId, setAlertSubmitMsg, setShowBuyerAlertModal, setShowPulseModal, marketPulse, setShowSeoDrawer, mapTileStyle, setMapTileStyle, onSignOut, onGoogleSignIn, showMapLegendPopover,
    setShowMapLegendPopover, lastSyncNotice, connectionStatus = 'LIVE_SYNC', onOpenReverseBudgetModal, primaryView = 'map', onNavigateView, isSpatialMeasureActive, onToggleSpatialMeasure } = props; void TopBarProvinceAndCityDirectoryControl; void MapQuickControlsStrip; const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const rateState = useExchangeRateSnapshot(); const isEn = radarLocale === 'en'; const topCopy = getRadarTopBarCopy(radarLocale); const searchBlurTimerRef = React.useRef<number | null>(null);
  const clearSearchBlurTimer = React.useCallback(() => { if (searchBlurTimerRef.current !== null) { window.clearTimeout(searchBlurTimerRef.current); searchBlurTimerRef.current = null; } }, []);
  React.useEffect(() => clearSearchBlurTimer, [clearSearchBlurTimer]);
  useGlobalSearchShortcut(() => { clearSearchBlurTimer(); onBeforeOpenFloatingPanel?.('search'); setShowSearchDropdown(true); });
  const hasOpenTopBarOverlay = showSearchDropdown || mobileFilterOpen || showToolsPopover || showMapLegendPopover;
  React.useEffect(() => {
    if (!hasOpenTopBarOverlay) return undefined;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      clearSearchBlurTimer(); setShowSearchDropdown(false); setMobileFilterOpen(false); setShowToolsPopover(false); setShowMapLegendPopover(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [hasOpenTopBarOverlay, clearSearchBlurTimer, setShowSearchDropdown, setMobileFilterOpen, setShowToolsPopover, setShowMapLegendPopover]);
  const superSummary = React.useMemo(() => getVisibleSuperModulesSummary(featureFlags), [featureFlags]);
  const qTrim = searchQuery.trim();
  const searchMatches = qTrim ? evaluatedNeighborhoods.filter((n) => matchesPersianSearch(n.name, qTrim) || matchesPersianSearch(n.zone, qTrim)) : evaluatedNeighborhoods; const allNationwideHoods = React.useMemo(() => getAllMultiCityNeighborhoods(), []); const crossCityMatches = React.useMemo(() => (qTrim ? allNationwideHoods.filter((h) => !searchMatches.some((m) => m.id === h.id) && (matchesPersianSearch(h.name, qTrim) || matchesPersianSearch(h.zone, qTrim))) : []), [qTrim, searchMatches, allNationwideHoods]);
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (onlyOutsideTrafficZone ? 1 : 0) + (onlyHighMetro ? 1 : 0);
  if (primaryView === 'admin') return <></>; return ( <> <div className={`radar-floating-top-bar fixed top-[calc(var(--header-height)+8px)] right-3 sm:right-4 ${primaryView === 'map' ? 'lg:right-[384px]' : ''} left-3 sm:left-4 ${hasOpenTopBarOverlay ? 'z-[44]' : 'z-30'} flex flex-col items-stretch gap-2 pointer-events-none`}>
        {(primaryView === 'map' || showSearchDropdown || showToolsPopover) && <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full">
          {(primaryView === 'map' || showSearchDropdown) ? <div className="flex flex-nowrap items-center gap-1.5 apple-vibrancy-bar px-2 sm:px-2.5 py-1.5 rounded-[12px] pointer-events-auto min-w-0 flex-1 lg:flex-initial">
          <NetworkStatusBadge status={connectionStatus} isEn={isEn} />
          {onNavigateView && <button type="button" onClick={() => onNavigateView('discover', 'registry')} title="فهرست رسمی تمام محله‌های canonical ایران از رجیستری IRNI" aria-label="بازکردن رجیستری رسمی محله‌های ایران" className="inline-flex items-center gap-1 rounded-[8px] border border-emerald-300/80 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 px-2 py-1 text-[11px] font-extrabold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition cursor-pointer whitespace-nowrap" ><Compass className="w-3.5 h-3.5" /><span className="hidden sm:inline">رجیستری رسمی</span></button>}
          <div className="relative flex-1 min-w-[110px] sm:w-52 lg:w-64"> <Search className="w-4 h-4 stroke-[1.75] text-[var(--color-text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input type="text" aria-label="جست‌وجوی محله" value={searchQuery} onFocus={() => { clearSearchBlurTimer(); onBeforeOpenFloatingPanel?.('search'); setShowSearchDropdown(true); }} onBlur={() => { clearSearchBlurTimer(); searchBlurTimerRef.current = window.setTimeout(() => { searchBlurTimerRef.current = null; setShowSearchDropdown(false); }, 200); }} onKeyDown={(e) => { if (e.key === 'Enter' && searchMatches.length > 0) { e.preventDefault(); clearSearchBlurTimer(); recordRecentSearch(searchMatches[0].name); onSelectNeighborhood(searchMatches[0]);
                  setMobileSheetOpen(true); setSearchQuery(''); setShowSearchDropdown(false); } }}
              onChange={(e) => { clearSearchBlurTimer(); onBeforeOpenFloatingPanel?.('search'); setSearchQuery(e.target.value); setShowSearchDropdown(true); }}
              placeholder={topCopy.searchPlaceholder}
              className="w-full min-h-[44px] lg:min-h-[34px] apple-search-field rounded-[8px] pr-8 pl-2 sm:pl-3 xl:pl-8 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition" />
            {searchQuery ? ( <button type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setSearchQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"><X className="w-3.5 h-3.5 stroke-[1.75]" /></button>
            ) : (
              <kbd aria-hidden="true" className="hidden xl:inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-xs font-bold text-[var(--color-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">/</kbd> )}
            {showSearchDropdown && ( <SearchDropdownMenu
                searchQuery={searchQuery} searchMatches={searchMatches} evaluatedNeighborhoods={evaluatedNeighborhoods} mode={mode}
                onSelectNeighborhood={onSelectNeighborhood} setMobileSheetOpen={setMobileSheetOpen} setSearchQuery={setSearchQuery} setShowSearchDropdown={setShowSearchDropdown}
                crossCityMatches={crossCityMatches} onNavigateDestination={onNavigateView}
                onSwitchCity={(cId, hId) => { const found = allNationwideHoods.find((x) => x.id === hId); onSwitchCity(cId, hId, found ? [found.lat, found.lng] : undefined, 13); }}
              /> )}
          </div>
          {primaryView === 'map' && (
            <div role="group" aria-label="حالت خرید یا اجاره" className="hidden sm:inline-flex items-center p-0.5 rounded-[8px] apple-segmented shrink-0 text-xs font-bold">
              <button type="button" data-testid="quick-mode-buy" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')} className={`px-2.5 py-1 rounded-[6px] whitespace-nowrap transition cursor-pointer ${mode === 'buy' ? 'apple-segmented-pill-active text-[var(--color-brand-600)] font-bold' : 'text-[var(--color-text-secondary)]'}`}>{isEn ? 'Buy' : 'خرید'}</button>
              <button type="button" data-testid="quick-mode-rent" aria-pressed={mode === 'rent'} onClick={() => setMode('rent')} className={`px-2.5 py-1 rounded-[6px] whitespace-nowrap transition cursor-pointer ${mode === 'rent' ? 'apple-segmented-pill-active text-[var(--color-brand-600)] font-bold' : 'text-[var(--color-text-secondary)]'}`}>{isEn ? 'Rent' : 'رهن و اجاره'}</button>
            </div>
          )}
          {primaryView === 'map' && (
            <select aria-label={isEn ? 'Map Color Lens' : 'لنز رنگی نقشه'} value={mapLens} onChange={(e) => setMapLens(e.target.value as typeof mapLens)} className="hidden md:block min-h-[34px] rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-2.5 text-xs font-bold text-[var(--color-text-primary)] cursor-pointer shrink-0">
              {LENS_OPTIONS.map((lens) => (
                <option key={lens.id} value={lens.id}>{isEn ? lens.labelEn : lens.label}</option>
              ))}
            </select>
          )}
          <button type="button" aria-label={isEn ? `Budget & mortgage filter (${counts.green + counts.yellow} matching)` : `فیلتر بودجه و وام (${toPersianNum(counts.green + counts.yellow)} محله همخوان)`} aria-expanded={mobileFilterOpen} onClick={() => { const next = !mobileFilterOpen; if (next) onBeforeOpenFloatingPanel?.('filter'); setMobileFilterOpen(next); setShowToolsPopover(false); }} className={`min-h-[44px] lg:min-h-[34px] px-2.5 py-1.5 rounded-[8px] text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer border whitespace-nowrap ${mobileFilterOpen ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] border-[var(--color-border-subtle)]'}`}>
            <SlidersHorizontal className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            <span className="sm:hidden">{isEn ? 'Filter' : 'فیلتر'}</span>
            <span className="hidden sm:inline">{topCopy.filterBtnLabel}</span>
            {activeFilterCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-[6px] text-xs font-bold tabular-nums ${mobileFilterOpen ? 'bg-white/20 text-white' : 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]'}`}>
                {toPersianNum(activeFilterCount)}
              </span>
            )}
          </button>
        </div> : <span />}
        {(primaryView === 'map' || showToolsPopover) && <div className="shrink-0 flex items-center gap-1.5 pointer-events-auto relative">
          {primaryView === 'map' && <button type="button" aria-expanded={showToolsPopover} onClick={() => { const next = !showToolsPopover; if (next) onBeforeOpenFloatingPanel?.('tools'); setShowToolsPopover(next); setMobileFilterOpen(false); }} className="min-h-[44px] lg:min-h-[40px] flex items-center gap-1.5 apple-vibrancy-bar px-3 py-1.5 rounded-[12px] text-xs font-bold text-[var(--color-text-primary)] transition cursor-pointer whitespace-nowrap">
            <Layers className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] shrink-0" aria-hidden="true" /><span className="hidden sm:inline">{isEn ? 'Map Layers' : 'لایه‌های نقشه'}</span><ChevronDown className="w-3.5 h-3.5 stroke-[1.75] text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />
          </button>}
          {showToolsPopover && (
            <div role="dialog" aria-label="لایه‌ها و کنترل‌های مکانی نقشه" className="fixed lg:absolute bottom-[calc(4.75rem+var(--safe-bottom))] lg:bottom-auto lg:top-12 left-3 right-3 lg:left-0 lg:right-auto lg:w-72 max-h-[calc(100dvh-6rem-var(--safe-bottom))] overflow-y-auto apple-inspector-panel rounded-[16px] p-3 z-50 space-y-2.5 text-xs">
              <div className="pb-2.5 border-b border-[var(--color-border-subtle)] space-y-2">
                <div className="md:hidden">
                  <div className="text-xs font-bold text-[var(--color-text-muted)] px-1 pb-1">{isEn ? 'Map Color Lens' : 'لنز رنگی نقشه'}</div>
                  <div className="grid grid-cols-2 gap-1 apple-segmented p-1 rounded-[8px]">
                    {LENS_OPTIONS.map((lens) => (
                      <button key={lens.id} type="button" onClick={() => { setMapLens(lens.id); setShowToolsPopover(false); }} className={`min-h-[44px] md:min-h-[36px] py-1.5 rounded-[6px] font-bold transition cursor-pointer ${mapLens === lens.id ? 'apple-segmented-pill-active text-[var(--color-brand-600)]' : 'text-[var(--color-text-secondary)]'}`}>{isEn ? lens.labelEn : lens.label}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">

                  <button type="button" onClick={() => { setShowMapLegendPopover((p) => !p); setShowToolsPopover(false); }} className="min-h-[44px] md:min-h-[38px] px-2.5 py-1.5 rounded-[8px] font-bold flex items-center justify-center gap-1.5 border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] transition cursor-pointer">
                    <Compass className="w-3.5 h-3.5 text-[var(--color-brand-600)]" aria-hidden="true" /><span>راهنما و مترو</span>
                  </button>
                </div>
                {onToggleSpatialMeasure && (
                  <button type="button" onClick={() => { onToggleSpatialMeasure(); setShowToolsPopover(false); }} className={`w-full min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[8px] font-bold flex items-center justify-between border transition cursor-pointer ${isSpatialMeasureActive ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'}`}>
                    <span className="flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" aria-hidden="true" /><span>خط‌کش اندازه‌گیری فاصله روی نقشه</span></span>
                    <span>{isSpatialMeasureActive ? 'فعال' : 'خاموش'}</span>
                  </button>
                )}
                <button type="button" onClick={() => setMapTileStyle((prev) => prev === 'neshan' ? 'osm' : prev === 'voyager' ? 'neshan' : (FREE_KEYLESS_TILE_SERVERS[prev] || FREE_KEYLESS_TILE_SERVERS.osm).next)} className="w-full min-h-[40px] px-3 py-2 rounded-[8px] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] font-bold text-xs text-start transition cursor-pointer">
                  تغییر سبک پایه نقشه ({mapTileStyle === 'neshan' ? 'نشان' : mapTileStyle})
                </button>
              </div>
              <RadarLink
                href="/tools"
                onNavigate={() => {
                  setShowToolsPopover(false);
                  if (onNavigateView) onNavigateView('tools');
                  else { setSuperModuleInitialTab('valuation'); setShowSuperModulesModal(true); }
                }}
                className="w-full min-h-[44px] px-3 py-2.5 rounded-[8px] bg-[var(--color-brand-soft)] hover:opacity-90 border border-[var(--color-brand-200)] text-[var(--color-brand-700)] dark:text-[#86d8cb] font-bold flex items-center justify-between gap-2 transition cursor-pointer"
              >
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] shrink-0" /><span>همه ابزارها و محاسبه‌گرها</span></span>
                <span className="text-xs bg-[var(--color-brand-600)] text-white px-2 py-0.5 rounded-[6px] font-bold tabular-nums shrink-0">{toPersianNum(superSummary.toolCount)}</span>
              </RadarLink>
              <button type="button" onClick={() => { setShowSeoDrawer(true); setShowToolsPopover(false); }} className="w-full min-h-[40px] px-3 py-2 rounded-[8px] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] font-bold text-xs text-start transition cursor-pointer">
                فهرست کامل محله‌ها
              </button>
              <span className="sr-only">
                {void setShowHedonicModal}{void setShowSmartSuggestModal}{void setShowCompareModal}{void setExpansionModalType}{void setBargainHoodId}{void setSponsorHoodId}{void setShowAgencyModal}{void totalLiveBargainsCount}{void setShowVisitedModal}{void visitedHomesCount}{void setTradeUpCurrentHoodId}{void setShowTradeUpModal}{void setAlertHoodId}{void setAlertSubmitMsg}{void setShowBuyerAlertModal}{void setShowPulseModal}{void marketPulse}{void currentUser}{void onSignOut}{void onGoogleSignIn}
              </span>
            </div>
          )}
        </div>}
        </div>}
        {primaryView === 'map' && !mobileFilterOpen && !showSearchDropdown && activeFilterCount > 0 && (
          <div className="self-start flex flex-wrap items-center gap-1.5 apple-vibrancy-bar px-2.5 py-1 rounded-[10px] text-xs font-bold pointer-events-auto" role="region" aria-label="فیلترهای فعال نقشه">
            {statusFilter !== 'all' && (
              <button type="button" aria-label="حذف فیلتر وضعیت بودجه" onClick={() => setStatusFilter('all')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">
                <span>{statusFilter === 'green' ? 'مناسب بودجه' : statusFilter === 'yellow' ? 'مرزی' : 'فراتر از بودجه'}</span><X className="w-3 h-3" />
              </button>
            )}
            {onlyOutsideTrafficZone && (
              <button type="button" aria-label="حذف فیلتر خارج از طرح" onClick={() => setOnlyOutsideTrafficZone(false)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">
                <span>خارج از طرح</span><X className="w-3 h-3" />
              </button>
            )}
            {onlyHighMetro && (
              <button type="button" aria-label="حذف فیلتر دسترسی مترو" onClick={() => setOnlyHighMetro(false)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">
                <span>مترو ۸+</span><X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        {lastSyncNotice && !mobileFilterOpen && ( <div role="status" className="self-start apple-vibrancy-bar px-3 py-1.5 rounded-[10px] text-xs font-bold text-[var(--color-brand-600)] pointer-events-auto max-w-md truncate">{lastSyncNotice}</div> )}
        {/* Floating Budget & Loan Filter Popover Card */}
        {mobileFilterOpen && ( <div role="dialog" aria-label="تنظیم بودجه، وام مسکن و محل کار" className="self-start w-full sm:w-[410px] apple-inspector-panel bg-[var(--color-bg-surface)]/95 border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-[16px] p-4 space-y-3.5 text-xs pointer-events-auto max-h-[82vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2.5">
              <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)]"><SlidersHorizontal className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" /><span>تنظیم بودجه، وام مسکن و محل کار</span></div>
              <div className="flex items-center gap-1.5">
                {onOpenReverseBudgetModal && <button type="button" onClick={() => { onOpenReverseBudgetModal(); setMobileFilterOpen(false); }} title={`با بودجه من کجای ${MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران'} می‌تونم خانه بخرم؟`} aria-label={`با بودجه من کجای ${MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران'} می‌تونم خانه بخرم؟`} className="min-h-[36px] px-2.5 py-1 rounded-[8px] bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer whitespace-nowrap">یافتن محله با بودجه من</button>}
                <button type="button" onClick={() => { setShowOnboardingModal(true); setMobileFilterOpen(false); }} className="min-h-[36px] px-2.5 py-1 rounded-[8px] bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 cursor-pointer"><Compass className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400" /><span>راهنما</span></button>
                <button type="button" aria-label="بستن تنظیمات بودجه" onClick={() => setMobileFilterOpen(false)} className="min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] rounded-full bg-slate-200/70 dark:bg-[var(--color-bg-muted)] hover:bg-slate-200 text-slate-600 dark:text-[var(--color-text-secondary)] flex items-center justify-center cursor-pointer"><X className="w-4 h-4 stroke-[2]" /></button>
              </div>
            </div>
            <ModeSwitcherSegmented mode={mode} setMode={setMode} deposit={deposit} monthlyRent={monthlyRent} buyTotalBudget={useLoanBooster ? buyTotalBudget + 1200 : buyTotalBudget} />
            <div className="space-y-3 apple-grouped-card bg-slate-50/80 dark:bg-[var(--color-bg-canvas)] border border-slate-200/70 dark:border-[var(--color-border-subtle)] rounded-xl p-3.5">
              {mode === 'rent' ? ( <>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 dark:text-[var(--color-text-secondary)]">مبلغ ودیعه (پول پیش):</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" aria-label="مبلغ ودیعه" min={50} max={15000} step={50} value={deposit} onChange={(e) => setDeposit(Math.max(0, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-20 px-2 py-0.5 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                        <span className="text-xs text-[var(--color-text-muted)]">میلیون ({intlCurrency === 'IRT' ? formatMillionToVerbalPersian(deposit) : formatMillionTomanAsIntlCurrency(deposit, intlCurrency, radarLocale, rateState.snapshot)})</span>
                      </div>
                    </div>
                    <input type="range" aria-label="اسلایدر مبلغ ودیعه" min={50} max={15000} step={50} value={deposit} onChange={(e) => setDeposit(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-[var(--color-bg-muted)] rounded-lg" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 dark:text-[var(--color-text-secondary)]">اجاره ماهانه (رهن کامل معادل: {toPersianNum(deposit + Math.round(monthlyRent / 0.03))} م):</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" aria-label="اجاره ماهانه" min={0} max={300} step={1} value={monthlyRent} onChange={(e) => setMonthlyRent(Math.max(0, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-20 px-2 py-0.5 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                        <span className="text-xs text-[var(--color-text-muted)]">میلیون</span>
                      </div>
                    </div>
                    <input type="range" aria-label="اسلایدر اجاره ماهانه" min={0} max={300} step={1} value={monthlyRent} onChange={(e) => setMonthlyRent(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-[var(--color-bg-muted)] rounded-lg" />
                  </div>
                </>
              ) : ( <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-600 dark:text-[var(--color-text-secondary)]">بودجه کل خرید:</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" aria-label="بودجه کل خرید" min={1000} max={100000} step={250} value={buyTotalBudget} onChange={(e) => setBuyTotalBudget(Math.max(500, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-24 px-2 py-0.5 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                      <span className="text-xs text-[var(--color-text-muted)]">میلیون ({intlCurrency === 'IRT' ? formatMillionToVerbalPersian(buyTotalBudget) : formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, radarLocale, rateState.snapshot)})</span>
                    </div>
                  </div>
                  <input type="range" aria-label="اسلایدر بودجه کل خرید" min={1000} max={100000} step={500} value={buyTotalBudget} onChange={(e) => setBuyTotalBudget(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-[var(--color-bg-muted)] rounded-lg" />
                </div> )}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-slate-600 dark:text-[var(--color-text-secondary)]">متراژ مورد نظر ({mode === 'rent' ? 'اجاره' : 'خرید'} · {formatAreaShort(targetSqm, areaUnit)}):</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" aria-label="متراژ مورد نظر" min={30} max={500} step={5} value={targetSqm} onChange={(e) => setTargetSqm(Math.max(25, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-16 px-2 py-0.5 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                    <span className="text-xs text-[var(--color-text-muted)] font-bold tabular-nums">{areaUnit === 'sqft' ? `≈ ${toPersianNum(convertAreaFromSqm(targetSqm, 'sqft'))} ft²` : formatAreaUnitLabel('sqm')}</span>
                  </div>
                </div>
                <input type="range" aria-label="اسلایدر متراژ مورد نظر" min={30} max={500} step={5} value={targetSqm} onChange={(e) => setTargetSqm(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-[var(--color-bg-muted)] rounded-lg" />
              </div>
              <div className="pt-2 border-t border-slate-200/80 dark:border-[var(--color-border-subtle)]">
                <div className="text-xs font-bold text-slate-700 dark:text-[var(--color-text-secondary)] mb-1.5">سن بنای هدف:</div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'new' as const, label: 'نوساز (۰ تا ۵ سال)' },
                    { id: 'mid' as const, label: `۶ تا ۱۵ سال (${mode === 'rent' ? '-۱۰٪' : '-۱۲٪'})` },
                    { id: 'older' as const, label: `۱۵+ سال (${mode === 'rent' ? '-۲۰٪' : '-۲۴٪'})` },
                  ].map((seg) => (
                    <button key={seg.id} type="button" onClick={() => setBuildingAgeSegment(seg.id)} className={`min-h-[38px] py-1 px-1 rounded-lg text-xs font-bold transition cursor-pointer text-center ${buildingAgeSegment === seg.id ? 'bg-[var(--color-brand-600)] text-white shadow-xs' : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] border border-slate-200 dark:border-[var(--color-border-strong)]'}`}>{seg.label}</button>
                  ))}
                </div>
              </div>
              {mode === 'buy' && ( <label className="flex items-start gap-2 pt-2 border-t border-slate-200/80 dark:border-[var(--color-border-subtle)] cursor-pointer">
                  <input type="checkbox" checked={deductTenantRahnInBuy} onChange={(e) => setDeductTenantRahnInBuy(e.target.checked)} aria-label="کسر خودکار رهن مستأجر و ۱۰٪ تنفس سند" className="mt-0.5 rounded text-[var(--color-brand-600)] focus:ring-emerald-500 cursor-pointer" />
                  <div className="text-xs leading-snug">
                    <span className="font-bold text-slate-900 dark:text-white">کسر خودکار رهن مستأجر + ۱۰٪ تنفس سند</span>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">رهن مستأجر و ۱۰٪ تحویل سند از نقدینگی موردنیاز کسر می‌گردد.</p>
                  </div>
                </label> )}
            </div>
            {mode === 'buy' && <BuyingPowerSummaryCard buyTotalBudget={buyTotalBudget} targetSqm={targetSqm} useLoanBooster={useLoanBooster} deductTenantRahnInBuy={deductTenantRahnInBuy} buildingAgeSegment={buildingAgeSegment} selectedHood={selectedHood} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setUseLoanBooster((prev) => !prev)} className={`min-h-[44px] md:min-h-[38px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${useLoanBooster ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 text-emerald-800 dark:text-emerald-300' : 'bg-white dark:bg-[var(--color-bg-surface)] border-slate-200 dark:border-[var(--color-border-strong)] text-slate-700 dark:text-[var(--color-text-secondary)] hover:bg-slate-50 dark:hover:bg-[var(--color-bg-elevated)]'}`}>
                <span>افزودن وام مسکن</span>
                <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-brand-600)]/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold tabular-nums">+{toPersianNum(extraGreenWithLoan)} محله</span>
              </button>
              <select value={workHubId} onChange={(e) => setWorkHubId(e.target.value)} aria-label="منطقه محل کار" className="min-h-[44px] md:min-h-[38px] bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] text-xs rounded-xl px-2.5 py-2 text-slate-800 dark:text-[var(--color-text-primary)] focus:outline-none focus:border-emerald-600 cursor-pointer">
                {activeCityWorkHubs.map((hub) => <option key={hub.id} value={hub.id}>محل کار: {hub.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {activeCity === 'tehran' && ( <button type="button" aria-pressed={onlyOutsideTrafficZone} onClick={() => setOnlyOutsideTrafficZone((value) => !value)} className={`min-h-[44px] md:min-h-[36px] flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer inline-flex items-center justify-center gap-1 ${onlyOutsideTrafficZone ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-slate-50'}`}><TrafficCone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span>فقط خارج از طرح ترافیک</span></button> )}
              <button type="button" aria-pressed={onlyHighMetro} onClick={() => setOnlyHighMetro((value) => !value)} className={`min-h-[44px] md:min-h-[36px] flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer inline-flex items-center justify-center gap-1 ${onlyHighMetro ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-slate-50'}`}><TrainFront className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span>فقط دسترسی عالی مترو (امتیاز ۸+)</span></button>
            </div>
            <div className="flex items-center justify-between gap-1 apple-segmented bg-slate-100 dark:bg-[var(--color-bg-muted)] p-1 rounded-[10px] text-xs">
              {[
                { id: 'all' as const, label: `همه (${toPersianNum(evaluatedNeighborhoods.length)})` },
                { id: 'green' as const, label: `مناسب (${toPersianNum(counts.green)})` },
                { id: 'yellow' as const, label: `مرزی (${toPersianNum(counts.yellow)})` },
                { id: 'red' as const, label: `فراتر (${toPersianNum(counts.red)})` },
              ].map((st) => (
                <button key={st.id} type="button" onClick={() => setStatusFilter(st.id)} className={`flex-1 py-1.5 rounded-[8px] font-bold transition cursor-pointer ${statusFilter === st.id ? 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-900 dark:text-white font-bold shadow-xs' : 'text-slate-600 dark:text-[var(--color-text-muted)] hover:text-slate-900 dark:hover:text-white'}`}>{st.label}</button>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-200/70 dark:border-[var(--color-border-subtle)] flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={onSaveUserPreferences} disabled={savingPrefs} className="flex-1 py-2 px-3 rounded-[10px] bg-slate-900 dark:bg-white hover:bg-slate-800 text-white dark:text-[var(--color-bg-canvas)] text-xs font-bold transition cursor-pointer disabled:opacity-50">
                  {savingPrefs ? 'در حال ذخیره...' : currentUser ? 'ذخیره در حساب ابری' : 'ورود با گوگل و ذخیره'}
                </button>
                <button type="button" onClick={onCopyBudgetShareLink} className="px-3 py-2 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition cursor-pointer whitespace-nowrap">ارسال لینک این بودجه برای خانواده</button>
              </div>
              {prefsMessage && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 text-center">{prefsMessage}</span>}
            </div>
          </div> )}
      </div>
      <MapLegend open={showMapLegendPopover} onToggle={() => { const next = !showMapLegendPopover; if (next) onBeforeOpenFloatingPanel?.('legend'); setShowMapLegendPopover(next); setShowToolsPopover(false); }} statusFilter={statusFilter} onChangeStatusFilter={setStatusFilter} mapLens={mapLens} counts={counts} totalCount={evaluatedNeighborhoods.length} hideOnMobileSheet={primaryView !== 'map'} />
    </>
  ); }
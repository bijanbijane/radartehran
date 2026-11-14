import React from 'react'; import { ArrowLeftRight, Bell, Bookmark, Calculator, ChevronDown, Compass, Layers, LayoutGrid, LogIn, LogOut, MapPin, Navigation, PlusCircle, Scale, Search, Send, SlidersHorizontal, Sparkles, Wind, X } from 'lucide-react'; import type { User as FirebaseUser } from 'firebase/auth'; import { EvaluatedNeighborhood, FREE_KEYLESS_TILE_SERVERS, MapTileServerId, MarketPulseData, WorkHub, toPersianNum } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData'; import { findProvinceForHood } from '../data/iranProvincesDirectory'; import type { ExpansionModalType } from './ExpansionModulesModal'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { matchesPersianSearch, type FeatureFlags } from '../utils/security'; import { normalizeFinancialInput, formatMillionToVerbalPersian } from '../utils/persianFinancials'; import { MapLegend } from './MapLegend'; import { BuyingPowerSummaryCard } from './BuyingPowerSummaryCard'; import { SearchDropdownMenu, recordRecentSearch, useGlobalSearchShortcut } from './SearchDropdownMenu'; import { ModeSwitcherSegmented } from './ModeSwitcherSegmented'; import { TopBarProvinceAndCityDirectoryControl } from './TopBarProvinceDirectoryControl'; import { updateMapAdvancedOverlayState } from './mapAdvancedLayers'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { convertAreaFromSqm, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getRadarTopBarCopy, type PrimaryViewId } from '../utils/areaUnit'; export interface FloatingTopBarProps { activeCity: CityId; featureFlags: FeatureFlags; onSwitchCity: (cityId: CityId, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => void; onFlyToCityCenter: () => void; setShowNationwideProvinceModal?: (v: boolean) => void; searchQuery: string; setSearchQuery: (q: string) => void; showSearchDropdown: boolean; setShowSearchDropdown: (v: boolean) => void; evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood; selectedHoodId: number; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; setMobileSheetOpen: (v: boolean) => void; onLocateNearestHood: () => void; mobileFilterOpen: boolean; setMobileFilterOpen: React.Dispatch<React.SetStateAction<boolean>>; showToolsPopover: boolean; setShowToolsPopover: React.Dispatch<React.SetStateAction<boolean>>;
  counts: { green: number; yellow: number; red: number }; setShowOnboardingModal: (v: boolean) => void; mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void; deposit: number; setDeposit: (v: number) => void; monthlyRent: number; setMonthlyRent: (v: number) => void; buyTotalBudget: number; setBuyTotalBudget: (v: number) => void; targetSqm: number; setTargetSqm: (v: number) => void; buildingAgeSegment: 'new' | 'mid' | 'older'; setBuildingAgeSegment: (v: 'new' | 'mid' | 'older') => void; deductTenantRahnInBuy: boolean; setDeductTenantRahnInBuy: (v: boolean) => void; useLoanBooster: boolean; setUseLoanBooster: React.Dispatch<React.SetStateAction<boolean>>; extraGreenWithLoan: number; workHubId: string; setWorkHubId: (id: string) => void; activeCityWorkHubs: WorkHub[]; statusFilter: 'all' | 'green' | 'yellow' | 'red'; setStatusFilter: (s: 'all' | 'green' | 'yellow' | 'red') => void; onlyOutsideTrafficZone: boolean; setOnlyOutsideTrafficZone: React.Dispatch<React.SetStateAction<boolean>>; onlyHighMetro: boolean; setOnlyHighMetro: React.Dispatch<React.SetStateAction<boolean>>; onSaveUserPreferences: () => void; savingPrefs: boolean;
  currentUser: FirebaseUser | null; onCopyBudgetShareLink: () => void; prefsMessage: string; mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; setMapLens: (l: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap') => void; setSuperModuleInitialTab: (t: SuperModuleTabId) => void; setShowSuperModulesModal: (v: boolean) => void; setShowHedonicModal: (v: boolean) => void; setShowSmartSuggestModal: (v: boolean) => void; setShowCompareModal: (v: boolean) => void; setExpansionModalType: (t: ExpansionModalType) => void;
  setBargainHoodId: (id: number) => void; setSponsorHoodId: (id: number) => void; setShowAgencyModal: (v: boolean) => void; totalLiveBargainsCount: number; setShowVisitedModal: (v: boolean) => void; visitedHomesCount: number; setTradeUpCurrentHoodId: (id: number) => void; setShowTradeUpModal: (v: boolean) => void; setAlertHoodId: (id: number) => void; setAlertSubmitMsg: (msg: string) => void; setShowBuyerAlertModal: (v: boolean) => void; setShowPulseModal: (v: boolean) => void; marketPulse: MarketPulseData | null; setShowSeoDrawer: (v: boolean) => void; mapTileStyle: MapTileServerId; setMapTileStyle: React.Dispatch<React.SetStateAction<MapTileServerId>>; onSignOut: () => void; onGoogleSignIn: () => void; showMapLegendPopover: boolean; setShowMapLegendPopover: React.Dispatch<React.SetStateAction<boolean>>; mobileSheetOpen: boolean; lastSyncNotice?: string; connectionStatus?: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING'; onOpenReverseBudgetModal?: () => void; primaryView?: string; onNavigateView?: (view: PrimaryViewId, subTab?: any) => void; }
export function NetworkStatusBadge({ status = 'LIVE_SYNC' }: { status?: 'LIVE_SYNC' | 'CACHED_OFFLINE' | 'RECONNECTING' }) {
  const cfg = status === 'CACHED_OFFLINE' ? { dot: 'bg-amber-500', text: 'آفلاین (کش)', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' } : status === 'RECONNECTING' ? { dot: 'bg-sky-500 animate-pulse', text: 'اتصال مجدد...', cls: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800' } : { dot: 'bg-emerald-500', text: 'آنلاین', cls: 'bg-emerald-50/80 text-emerald-800 border-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' };
  return <span data-connection-status={status} className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.text}</span>;
}
const LENS_OPTIONS = [{ id: 'budget' as const, label: 'بودجه من' }, { id: 'heatmap' as const, label: '🔥 هیت‌مپ قیمت' }, { id: 'bubble' as const, label: 'حباب قیمت' }, { id: 'air' as const, label: 'کیفیت هوا' }, { id: 'traffic' as const, label: 'ترافیک' }]; export function FloatingTopBar(props: FloatingTopBarProps): React.ReactElement { const { activeCity, featureFlags, onSwitchCity, onFlyToCityCenter, searchQuery, setSearchQuery, showSearchDropdown, setShowSearchDropdown, evaluatedNeighborhoods, selectedHood, selectedHoodId, onSelectNeighborhood, setMobileSheetOpen, onLocateNearestHood, mobileFilterOpen, setMobileFilterOpen, showToolsPopover, setShowToolsPopover, counts, setShowOnboardingModal, mode, setMode, deposit, setDeposit, monthlyRent, setMonthlyRent, buyTotalBudget, setBuyTotalBudget, targetSqm, setTargetSqm, buildingAgeSegment, setBuildingAgeSegment, deductTenantRahnInBuy, setDeductTenantRahnInBuy, useLoanBooster, setUseLoanBooster, extraGreenWithLoan, workHubId, setWorkHubId, activeCityWorkHubs, statusFilter, setStatusFilter, onlyOutsideTrafficZone, setOnlyOutsideTrafficZone, onlyHighMetro, setOnlyHighMetro, onSaveUserPreferences, savingPrefs, currentUser, onCopyBudgetShareLink, prefsMessage, mapLens, setMapLens, setSuperModuleInitialTab, setShowSuperModulesModal, setShowHedonicModal, setShowSmartSuggestModal,
    setShowCompareModal, setExpansionModalType, setBargainHoodId, setSponsorHoodId, setShowAgencyModal, totalLiveBargainsCount, setShowVisitedModal, visitedHomesCount, setTradeUpCurrentHoodId, setShowTradeUpModal, setAlertHoodId, setAlertSubmitMsg, setShowBuyerAlertModal, setShowPulseModal, marketPulse, setShowSeoDrawer, mapTileStyle, setMapTileStyle, onSignOut, onGoogleSignIn, showMapLegendPopover,
    setShowMapLegendPopover, mobileSheetOpen, lastSyncNotice, setShowNationwideProvinceModal, connectionStatus = 'LIVE_SYNC', onOpenReverseBudgetModal, primaryView = 'map', onNavigateView } = props; const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const topCopy = getRadarTopBarCopy(radarLocale); useGlobalSearchShortcut(() => setShowSearchDropdown(true)); const qTrim = searchQuery.trim();
  const searchMatches = qTrim ? evaluatedNeighborhoods.filter((n) => matchesPersianSearch(n.name, qTrim) || matchesPersianSearch(n.zone, qTrim)) : evaluatedNeighborhoods; const allNationwideHoods = React.useMemo(() => getAllMultiCityNeighborhoods(), []); const crossCityMatches = React.useMemo(() => (qTrim ? allNationwideHoods.filter((h) => !searchMatches.some((m) => m.id === h.id) && (matchesPersianSearch(h.name, qTrim) || matchesPersianSearch(h.zone, qTrim))) : []), [qTrim, searchMatches, allNationwideHoods]);
  const activeHeaderLabel = featureFlags.enableMultiCity ? (findProvinceForHood(selectedHoodId)?.nameFa || MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران') : 'تهران'; if (primaryView === 'admin') return <></>; return ( <> <div className={`radar-floating-top-bar fixed top-[68px] right-3 sm:right-4 ${primaryView === 'map' ? 'lg:right-[336px] xl:right-[376px] 2xl:right-[388px]' : ''} left-3 sm:left-4 z-30 lg:z-40 flex flex-col items-stretch gap-2 pointer-events-none`}>
        {(primaryView === 'map' || showSearchDropdown || showToolsPopover) && <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full">
          {(primaryView === 'map' || showSearchDropdown) ? <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 sm:gap-1.5 apple-vibrancy-bar px-2 sm:px-3 py-1.5 rounded-[12px] pointer-events-auto min-w-0 flex-1 sm:flex-initial"> <a href="#top" onClick={(e) => { e.preventDefault(); onFlyToCityCenter(); }} className="hidden items-center gap-2 text-sm font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 pl-2.5 border-l border-slate-200/80 dark:border-slate-700">
            <span className="w-6 h-6 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center"><MapPin className="w-3.5 h-3.5 stroke-[2]" /></span><span>رادار {activeHeaderLabel}</span> </a>
          <NetworkStatusBadge status={connectionStatus} />
          {featureFlags.enableMultiCity && <TopBarProvinceAndCityDirectoryControl activeCity={activeCity} selectedHoodId={selectedHoodId} onSwitchCity={onSwitchCity} onOpenProvinceModal={setShowNationwideProvinceModal ? () => setShowNationwideProvinceModal(true) : undefined} />}
          <div className="relative flex-1 min-w-0 sm:w-44 xl:w-52"> <Search className="w-4 h-4 stroke-[1.75] text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" aria-label="جست‌وجوی محله" value={searchQuery} onFocus={() => setShowSearchDropdown(true)} onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)} onKeyDown={(e) => { if (e.key === 'Enter' && searchMatches.length > 0) { e.preventDefault(); recordRecentSearch(searchMatches[0].name); onSelectNeighborhood(searchMatches[0]);
                  setMobileSheetOpen(true); setSearchQuery(''); setShowSearchDropdown(false); } }}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearchDropdown(true); }}
              placeholder={topCopy.searchPlaceholder}
              className="w-full apple-search-field rounded-[8px] pr-8 pl-6 sm:pl-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition" />
            {searchQuery ? ( <button type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setSearchQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5 stroke-[1.75]" /></button>
            ) : (
              <kbd aria-hidden="true" className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[9.5px] font-bold text-slate-500 dark:text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">/</kbd> )}
            {showSearchDropdown && ( <SearchDropdownMenu
                searchQuery={searchQuery} searchMatches={searchMatches} evaluatedNeighborhoods={evaluatedNeighborhoods} mode={mode}
                onSelectNeighborhood={onSelectNeighborhood} setMobileSheetOpen={setMobileSheetOpen} setSearchQuery={setSearchQuery} setShowSearchDropdown={setShowSearchDropdown}
                crossCityMatches={crossCityMatches} onNavigateDestination={onNavigateView}
                onSwitchCity={(cId, hId) => { const found = allNationwideHoods.find((x) => x.id === hId); onSwitchCity(cId, hId, found ? [found.lat, found.lng] : undefined, 13); }}
              /> )}
          </div>
          <button type="button" aria-label="نزدیک‌ترین محله به موقعیت فعلی من" onClick={onLocateNearestHood} title="نزدیک‌ترین محله به موقعیت فعلی من (GPS)" className="p-1.5 rounded-[9px] bg-slate-100/90 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200/80 dark:border-slate-700 transition shrink-0 cursor-pointer">
            <Navigation className="w-4 h-4 stroke-[1.75]" />
          </button>
          <div className="hidden"><AreaUnitToggle compact showIntlControls /></div>
          <button type="button" aria-label="فیلتر بودجه و وام" aria-expanded={mobileFilterOpen} onClick={() => { setMobileFilterOpen((prev) => !prev); setShowToolsPopover(false); }} className={`px-2 sm:px-2.5 py-1.5 rounded-[9px] text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 cursor-pointer border ${mobileFilterOpen ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/70 text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'}`}>
            <SlidersHorizontal className="w-4 h-4 stroke-[1.75]" />
            <span className="hidden sm:inline">{topCopy.filterBtnLabel}</span>
            <span className={`hidden md:inline text-[10px] font-extrabold ${mobileFilterOpen ? 'text-white/90 dark:text-slate-900/90' : 'text-emerald-700 dark:text-emerald-400'}`}>({mode === 'rent' ? 'رهن/اجاره' : 'خرید'})</span>
            <span className={`px-1.5 py-0.5 rounded-[6px] text-[10px] font-extrabold tabular-nums ${mobileFilterOpen ? 'bg-white/25 text-white dark:bg-slate-900/15 dark:text-slate-900' : 'bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-100'}`}>{toPersianNum(counts.green + counts.yellow)}</span>
          </button>
        </div> : <span />}
        {(primaryView === 'map' || showToolsPopover) && <div className="shrink-0 flex items-center gap-1.5 pointer-events-auto relative">
          {primaryView === 'map' && onOpenReverseBudgetModal && <button type="button" onClick={onOpenReverseBudgetModal} className="hidden 2xl:flex items-center gap-1.5 apple-vibrancy-bar hover:bg-white px-2.5 py-1.5 rounded-[12px] text-[11px] font-bold text-indigo-700 dark:text-indigo-300 transition cursor-pointer"><Sparkles className="w-3.5 h-3.5 text-indigo-600" /><span>کشف محله با بودجه</span></button>}
          {primaryView === 'map' && <button type="button" aria-expanded={showToolsPopover} onClick={() => { setShowToolsPopover((prev) => !prev); setMobileFilterOpen(false); }} className="flex items-center gap-1 sm:gap-1.5 apple-vibrancy-bar hover:bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-[12px] text-xs font-bold text-slate-800 dark:text-slate-100 transition cursor-pointer whitespace-nowrap">
            <LayoutGrid className="w-4 h-4 stroke-[1.75] text-emerald-600 shrink-0" /><span>{topCopy.toolsBtnLabel}</span><ChevronDown className="w-3.5 h-3.5 stroke-[1.75] text-slate-400 shrink-0" />
          </button>}
          {showToolsPopover && (
            <div role="dialog" className="fixed lg:absolute bottom-[calc(4.75rem+var(--safe-bottom))] lg:bottom-auto lg:top-12 left-3 right-3 lg:left-0 lg:right-auto lg:w-68 max-h-[calc(100dvh-6rem-var(--safe-bottom))] overflow-y-auto apple-inspector-panel bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-[16px] p-2.5 z-50 space-y-1.5 text-xs">
              <div className="lg:hidden pb-2 mb-1 border-b border-slate-200/70 dark:border-slate-800 space-y-2">
                {featureFlags.enableMultiCity && ( <div>
                    <div className="text-[11px] font-bold text-slate-500 px-2 py-1">انتخاب کلانشهر</div>
                    <div className="grid grid-cols-5 gap-1 apple-segmented p-1 rounded-[10px]">
                      {(Object.keys(MULTI_CITY_CONFIGS) as CityId[]).map((cid) => ( <button key={cid} type="button" onClick={() => { onSwitchCity(cid); setShowToolsPopover(false); }} className={`py-1 rounded-[7px] text-[10.5px] font-bold transition cursor-pointer ${activeCity === cid ? 'apple-segmented-pill-active text-emerald-700' : 'text-slate-600'}`}>{MULTI_CITY_CONFIGS[cid]?.nameFa || cid}</button> ))} </div>
                  </div>
                )} <div>
                  <div className="text-[11px] font-bold text-slate-500 px-2 py-1">لنز رنگی نقشه</div>
                  <div className="grid grid-cols-2 gap-1 apple-segmented p-1 rounded-[10px]">
                    {LENS_OPTIONS.map((lens) => (
                      <button key={lens.id} type="button" onClick={() => { setMapLens(lens.id); setShowToolsPopover(false); }} className={`py-1.5 rounded-[8px] font-bold transition cursor-pointer ${mapLens === lens.id ? 'apple-segmented-pill-active text-emerald-700' : 'text-slate-600'}`}>{lens.label}</button>
                    ))} </div>
                </div>
              </div>
              <button type="button" onClick={() => { setSuperModuleInitialTab('valuation'); setShowSuperModulesModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100/80 border border-emerald-200/80 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 font-extrabold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>🚀 ابرماژول‌ها و جعبه ابزار جامع مسکن</span></span>
                <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-md font-bold">۱۰ تب · ۵۲ ابزار</span>
              </button>
              <button type="button" onClick={() => { setShowHedonicModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Calculator className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>ماشین‌حساب هوشمند قیمت‌گذاری (Hedonic)</span></span>
                <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-extrabold">کارشناسی</span>
              </button>
              <button type="button" onClick={() => { setShowSmartSuggestModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>پیشنهاد هوشمند محله</span></span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums">{toPersianNum(counts.green + counts.yellow)} محله</span>
              </button>
              <button type="button" onClick={() => { setShowOnboardingModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Compass className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>راهنمای ۳ مرحله‌ای ورود</span></span>
                <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-bold">ویزارد</span>
              </button>
              <button type="button" onClick={() => { setShowCompareModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-2 transition cursor-pointer">
                <ArrowLeftRight className="w-4 h-4 stroke-[1.75] text-slate-600" /><span>مقایسه دو محله</span>
              </button>
              {featureFlags.enableCommissionCalc && (
                <button type="button" onClick={() => { setExpansionModalType('commission'); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                  <span className="flex items-center gap-2"><Calculator className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>ماشین‌حساب کمیسیون و محضر</span></span>
                  <span className="text-[10px] text-emerald-700 font-bold">نرخ اتحادیه</span>
                </button>
              )} {featureFlags.enableAiContractCheck && (
                <button type="button" onClick={() => { setExpansionModalType('contract'); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                  <span className="flex items-center gap-2"><Scale className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>مشاور حقوقی هوشمند قولنامه</span></span>
                  <span className="text-[10px] text-emerald-700 font-bold">ضدکلاهبرداری</span>
                </button>
              )} <button type="button" onClick={() => { setBargainHoodId(selectedHoodId); setSponsorHoodId(selectedHoodId); setShowAgencyModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><PlusCircle className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>ثبت ملک زیر قیمت</span></span>
                <span className="text-[10px] text-slate-400 tabular-nums">{toPersianNum(totalLiveBargainsCount)} فایل</span>
              </button>
              <button type="button" onClick={() => { setShowVisitedModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Bookmark className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>دفترچه بازدیدهای من</span></span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md font-bold tabular-nums">{toPersianNum(visitedHomesCount)} ملک</span>
              </button>
              <button type="button" onClick={() => { setTradeUpCurrentHoodId(selectedHood?.id || selectedHoodId || 1); setShowTradeUpModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>معاوضه و ارتقای متراژ (Trade-Up)</span></span>
                <span className="text-[10px] text-slate-400">محاسبه آنلاین</span>
              </button>
              <button type="button" onClick={() => { setAlertHoodId(selectedHoodId); setAlertSubmitMsg(''); setShowBuyerAlertModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-2 transition cursor-pointer">
                <Bell className="w-4 h-4 stroke-[1.75] text-slate-600" /><span>هشدار شکار</span>
              </button>
              <button type="button" onClick={() => { setShowPulseModal(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                <span className="flex items-center gap-2"><Wind className="w-4 h-4 stroke-[1.75] text-sky-600" /><span>نبض بازار و هوا</span></span>
                <span className="text-[10px] font-extrabold text-emerald-700 tabular-nums">AQI {toPersianNum(marketPulse?.airQuality?.tehranAverageAqi || 92)}</span>
              </button>
              {featureFlags.enableTelegramFeed && ( <button type="button" onClick={() => { setExpansionModalType('telegram'); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-between transition cursor-pointer">
                  <span className="flex items-center gap-2"><Send className="w-4 h-4 stroke-[1.75] text-emerald-600" /><span>خروجی کانال تلگرام</span></span>
                  <span className="text-[10px] text-slate-400">وب‌هوک ربات</span>
                </button>
              )} <button type="button" onClick={() => { setShowSeoDrawer(true); setShowToolsPopover(false); }} className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-2 transition cursor-pointer">
                <Compass className="w-4 h-4 stroke-[1.75] text-slate-600" /><span>فهرست سئو</span>
              </button>
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                <button type="button" onClick={() => setMapTileStyle((prev) => (prev === 'satellite' ? 'neshan' : 'satellite'))} className={`flex-1 px-2.5 py-2 rounded-xl font-bold flex items-center justify-center gap-1 transition cursor-pointer ${mapTileStyle === 'satellite' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`} title="نمای ماهواره‌ای (Satellite)">
                  <Layers className="w-4 h-4 stroke-[1.75]" /><span className="text-[10px]">{mapTileStyle === 'satellite' ? 'ماهواره فعال' : 'نمای ماهواره'}</span>
                </button>
                <button type="button" onClick={() => setMapTileStyle((prev) => prev === 'neshan' ? 'osm' : prev === 'voyager' ? 'neshan' : (FREE_KEYLESS_TILE_SERVERS[prev] || FREE_KEYLESS_TILE_SERVERS.osm).next)} className="px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1 transition cursor-pointer" title="تغییر سبک نقشه (نشان / OSM / ماهواره / تاریک)">
                  <span className="text-[10px]">{mapTileStyle === 'neshan' ? 'نشان' : 'سبک نقشه'}</span>
                </button>
                {currentUser ? ( <button type="button" onClick={onSignOut} title="خروج از حساب" aria-label="خروج از حساب" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 transition cursor-pointer"><LogOut className="w-4 h-4 stroke-[1.75]" /></button>
                ) : ( <button type="button" onClick={onGoogleSignIn} title="ورود با گوگل" aria-label="ورود با گوگل" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-600 transition cursor-pointer"><LogIn className="w-4 h-4 stroke-[1.75]" /></button>
                )} </div>
            </div>
          )}
        </div>}
        </div>}
        {primaryView === 'map' && !mobileFilterOpen && !showSearchDropdown && (
          <div className="self-start max-w-full flex flex-wrap items-center gap-1.5 pointer-events-auto">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar apple-vibrancy-bar p-1 rounded-[11px] text-[11px] font-bold">
              {LENS_OPTIONS.map((lens) => (
                <button key={lens.id} type="button" aria-pressed={mapLens === lens.id} onClick={() => setMapLens(lens.id)} className={`px-2.5 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${mapLens === lens.id ? 'apple-primary-btn shadow-2xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>{lens.label}</button>
              ))}
            </div>
            {(statusFilter !== 'all' || onlyOutsideTrafficZone || onlyHighMetro) && (
              <div className="flex flex-wrap items-center gap-1 apple-vibrancy-bar px-2 py-1 rounded-[10px] text-[10.5px] font-bold" role="region" aria-label="فیلترهای فعال نقشه">
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
          </div>
        )}
        {lastSyncNotice && !mobileFilterOpen && ( <div role="status" className="self-start apple-vibrancy-bar px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-emerald-800 dark:text-emerald-300 pointer-events-auto max-w-md truncate">{lastSyncNotice}</div> )}
        {/* Floating Budget & Loan Filter Popover Card */}
        {mobileFilterOpen && ( <div role="dialog" aria-label="تنظیم بودجه، وام مسکن و محل کار" className="self-start w-full sm:w-[410px] apple-inspector-panel bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-[16px] p-4 space-y-3.5 text-xs pointer-events-auto max-h-[82vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white"><SlidersHorizontal className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>تنظیم بودجه، وام مسکن و محل کار</span></div>
              <div className="flex items-center gap-1.5">
                {onOpenReverseBudgetModal && <button type="button" onClick={() => { onOpenReverseBudgetModal(); setMobileFilterOpen(false); }} className="px-2 py-1 rounded-[8px] bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-[10.5px] font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer">با بودجه من کجای {MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران'} می‌تونم خانه بخرم؟</button>}
                <button type="button" onClick={() => { setShowOnboardingModal(true); setMobileFilterOpen(false); }} className="px-2 py-1 rounded-[8px] bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 cursor-pointer"><Compass className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /><span>راهنما</span></button>
                <button type="button" aria-label="بستن تنظیمات بودجه" onClick={() => setMobileFilterOpen(false)} className="w-7 h-7 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5 stroke-[2]" /></button>
              </div>
            </div>
            <ModeSwitcherSegmented mode={mode} setMode={setMode} deposit={deposit} monthlyRent={monthlyRent} buyTotalBudget={useLoanBooster ? buyTotalBudget + 1200 : buyTotalBudget} />
            <div className="space-y-3 apple-grouped-card bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-xl p-3.5">
              {mode === 'rent' ? ( <>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">مبلغ ودیعه (پول پیش):</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" aria-label="مبلغ ودیعه" min={50} max={15000} step={50} value={deposit} onChange={(e) => setDeposit(Math.max(0, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-20 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                        <span className="text-[10px] text-slate-400">میلیون ({intlCurrency === 'IRT' ? formatMillionToVerbalPersian(deposit) : formatMillionTomanAsIntlCurrency(deposit, intlCurrency, radarLocale)})</span>
                      </div>
                    </div>
                    <input type="range" aria-label="اسلایدر مبلغ ودیعه" min={50} max={15000} step={50} value={deposit} onChange={(e) => setDeposit(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">اجاره ماهانه (رهن کامل معادل: {toPersianNum(deposit + Math.round(monthlyRent / 0.03))} م):</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" aria-label="اجاره ماهانه" min={0} max={300} step={1} value={monthlyRent} onChange={(e) => setMonthlyRent(Math.max(0, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-20 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                        <span className="text-[10px] text-slate-400">میلیون</span>
                      </div>
                    </div>
                    <input type="range" aria-label="اسلایدر اجاره ماهانه" min={0} max={300} step={1} value={monthlyRent} onChange={(e) => setMonthlyRent(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                  </div>
                </>
              ) : ( <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-600 dark:text-slate-300">بودجه کل خرید:</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" aria-label="بودجه کل خرید" min={1000} max={100000} step={250} value={buyTotalBudget} onChange={(e) => setBuyTotalBudget(Math.max(500, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-24 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                      <span className="text-[10px] text-slate-400">میلیون ({intlCurrency === 'IRT' ? formatMillionToVerbalPersian(buyTotalBudget) : formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, radarLocale)})</span>
                    </div>
                  </div>
                  <input type="range" aria-label="اسلایدر بودجه کل خرید" min={1000} max={100000} step={500} value={buyTotalBudget} onChange={(e) => setBuyTotalBudget(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                </div> )}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">متراژ مورد نظر ({mode === 'rent' ? 'اجاره' : 'خرید'} · {formatAreaShort(targetSqm, areaUnit)}):</span>
                  <div className="flex items-center gap-1.5">
                    <AreaUnitToggle compact />
                    <input type="number" aria-label="متراژ مورد نظر" min={30} max={500} step={5} value={targetSqm} onChange={(e) => setTargetSqm(Math.max(25, normalizeFinancialInput(e.target.value)))} className="radar-tabular-num w-16 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-left text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-600" />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tabular-nums">{areaUnit === 'sqft' ? `≈ ${toPersianNum(convertAreaFromSqm(targetSqm, 'sqft'))} ft²` : formatAreaUnitLabel('sqm')}</span>
                  </div>
                </div>
                <input type="range" aria-label="اسلایدر متراژ مورد نظر" min={30} max={500} step={5} value={targetSqm} onChange={(e) => setTargetSqm(normalizeFinancialInput(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              </div>
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">سن بنای هدف:</div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'new' as const, label: 'نوساز (۰ تا ۵ سال)' },
                    { id: 'mid' as const, label: `۶ تا ۱۵ سال (${mode === 'rent' ? '-۱۰٪' : '-۱۲٪'})` },
                    { id: 'older' as const, label: `۱۵+ سال (${mode === 'rent' ? '-۲۰٪' : '-۲۴٪'})` },
                  ].map((seg) => (
                    <button key={seg.id} type="button" onClick={() => setBuildingAgeSegment(seg.id)} className={`py-1 px-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer text-center ${buildingAgeSegment === seg.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}>{seg.label}</button>
                  ))}
                </div>
              </div>
              {mode === 'buy' && ( <label className="flex items-start gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 cursor-pointer">
                  <input type="checkbox" checked={deductTenantRahnInBuy} onChange={(e) => setDeductTenantRahnInBuy(e.target.checked)} aria-label="کسر خودکار رهن مستأجر و ۱۰٪ تنفس سند" className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                  <div className="text-[11px] leading-tight">
                    <span className="font-extrabold text-slate-900 dark:text-white">کسر خودکار رهن مستأجر + ۱۰٪ تنفس سند</span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">رهن مستأجر و ۱۰٪ تحویل سند از نقدینگی موردنیاز کسر می‌گردد.</p>
                  </div>
                </label> )}
            </div>
            {mode === 'buy' && <BuyingPowerSummaryCard buyTotalBudget={buyTotalBudget} targetSqm={targetSqm} useLoanBooster={useLoanBooster} deductTenantRahnInBuy={deductTenantRahnInBuy} buildingAgeSegment={buildingAgeSegment} selectedHood={selectedHood} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setUseLoanBooster((prev) => !prev)} className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${useLoanBooster ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 text-emerald-800 dark:text-emerald-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span>افزودن وام مسکن</span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-extrabold tabular-nums">+{toPersianNum(extraGreenWithLoan)} محله</span>
              </button>
              <select value={workHubId} onChange={(e) => setWorkHubId(e.target.value)} aria-label="منطقه محل کار" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs rounded-xl px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer">
                {activeCityWorkHubs.map((hub) => <option key={hub.id} value={hub.id}>محل کار: {hub.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {activeCity === 'tehran' && ( <button type="button" aria-pressed={onlyOutsideTrafficZone} onClick={() => setOnlyOutsideTrafficZone((value) => !value)} className={`flex-1 py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${onlyOutsideTrafficZone ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}>🚗 فقط خارج از طرح ترافیک</button> )}
              <button type="button" aria-pressed={onlyHighMetro} onClick={() => setOnlyHighMetro((value) => !value)} className={`flex-1 py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${onlyHighMetro ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}>🚇 فقط دسترسی عالی مترو (امتیاز ۸+)</button>
            </div>
            <div className="flex items-center justify-between gap-1 apple-segmented bg-slate-100 dark:bg-slate-800 p-1 rounded-[10px] text-[11px]">
              {[
                { id: 'all' as const, label: `همه (${toPersianNum(evaluatedNeighborhoods.length)})` },
                { id: 'green' as const, label: `مناسب (${toPersianNum(counts.green)})` },
                { id: 'yellow' as const, label: `مرزی (${toPersianNum(counts.yellow)})` },
                { id: 'red' as const, label: `فراتر (${toPersianNum(counts.red)})` },
              ].map((st) => (
                <button key={st.id} type="button" onClick={() => setStatusFilter(st.id)} className={`flex-1 py-1.5 rounded-[8px] font-bold transition cursor-pointer ${statusFilter === st.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{st.label}</button>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={onSaveUserPreferences} disabled={savingPrefs} className="flex-1 py-2 px-3 rounded-[10px] bg-slate-900 dark:bg-white hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer disabled:opacity-50">
                  {savingPrefs ? 'در حال ذخیره...' : currentUser ? 'ذخیره در حساب ابری' : 'ورود با گوگل و ذخیره'}
                </button>
                <button type="button" onClick={onCopyBudgetShareLink} className="px-3 py-2 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition cursor-pointer whitespace-nowrap">ارسال لینک این بودجه برای خانواده</button>
              </div>
              {prefsMessage && <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 text-center">{prefsMessage}</span>}
            </div>
          </div> )}
      </div>
      <MapLegend open={showMapLegendPopover} onToggle={() => { setShowMapLegendPopover((prev) => !prev); setShowToolsPopover(false); }} statusFilter={statusFilter} onChangeStatusFilter={setStatusFilter} mapLens={mapLens} counts={counts} totalCount={evaluatedNeighborhoods.length} hideOnMobileSheet={primaryView !== 'map'} />
    </>
  ); }
import React from 'react'; import { ArrowLeftRight, Building2, Calculator, ChevronDown, ChevronUp, ClipboardList, Heart, Map, Moon, Phone, Satellite, Scale, Send, Share2, ShieldAlert, Sparkles, Sun, X } from 'lucide-react'; import { BubbleReport, EvaluatedNeighborhood, INITIAL_NEIGHBORHOODS, LocalLandmark, MapTileServerId, Neighborhood, ResidentVoteDoc, WorkHub, isSponsorActive, toPersianNum } from '../data/neighborhoods'; import { getTrafficZoneStatus, type NeighborhoodDeepInsight, type RentVsBuyVerdict } from '../data/neighborhoodInsights'; import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, getCityExpansionSeeds, resolveCityIdForNeighborhood } from '../data/multiCityData'; import type { ExpansionModalType } from './ExpansionModulesModal'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { buildSponsorWhatsAppUrl, type FeatureFlags } from '../utils/security'; import { QuickHoodRankingStrip } from './QuickHoodRankingStrip'; import { NeighborhoodInspectorTabs, type InspectorTabId } from './NeighborhoodInspectorTabs'; import { SmartPriceForecastCard, InspectorSponsorFooter } from './SmartPriceForecastCard';
import type { VisitedHomeEntry } from './PortfolioModals'; import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle, getRadarInspectorCopy } from '../utils/areaUnit'; import { computeNextSnapStateFromGesture, type BottomSheetSnapState } from '../utils/productViewRouterShellClasses'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples, formatNeighborhoodPriceTruthFa, isLiveDivarBargainId } from '../data/realMarketPriceAggregator'; const NeighborhoodMonthlyBarChart = React.lazy(() => import('./NeighborhoodMonthlyBarChart').then((m) => ({ default: m.NeighborhoodMonthlyBarChart }))); const NeighborhoodPhotoGallery = React.lazy(() => import('./NeighborhoodPhotoGallery').then((m) => ({ default: m.NeighborhoodPhotoGallery }))); const ExpandableComparisonTable = React.lazy(() => import('./ExpandableComparisonTable').then((m) => ({ default: m.ExpandableComparisonTable }))); const Stage2MasterWidget = React.lazy(() => import('./stage2/Stage2MasterWidget').then((m) => ({ default: m.Stage2MasterWidget }))); export interface NeighborhoodInspectorDrawerProps { mobileSheetOpen: boolean; setMobileSheetOpen: (v: boolean) => void; appleTheme: 'light' | 'dark'; onToggleAppleTheme: () => void; mapTileStyle?: MapTileServerId; setMapTileStyle?: React.Dispatch<React.SetStateAction<MapTileServerId>>; favoriteHoodIds: number[]; onToggleFavoriteHood: (hoodId: number) => void;
  onOpenShortlistMatrix: () => void; evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; activeCity: CityId; onSwitchCity?: (cityId: CityId, targetHoodId?: number) => void; onOpenShareModal: () => void; targetSqm: number; rentAgeMultiplier: number; selectedWorkHub: WorkHub; workHubId: string; workHubs: WorkHub[]; onSelectWorkHubId: (hubId: string) => void; onChangeTargetSqm: (sqm: number) => void; onChangeBuildingAgeSegment: (seg: 'new' | 'mid' | 'older') => void; useLoanBooster: boolean; onToggleLoanBooster: () => void; deductTenantRahnInBuy: boolean; onToggleDeductTenantRahn: () => void;
  setShowHedonicModal: (v: boolean, params?: { sqm?: number; buildYear?: number; renovationStatus?: any; floor?: number }) => void; featureFlags: FeatureFlags; setExpansionModalType: (t: ExpansionModalType) => void; setSuperModuleInitialTab: (t: SuperModuleTabId) => void; setShowSuperModulesModal: (v: boolean) => void; anatomyTabsRef: React.RefObject<HTMLDivElement | null>; activeTab: InspectorTabId; setActiveTab: (t: InspectorTabId) => void; mode: 'rent' | 'buy'; buildingAgeSegment: 'new' | 'mid' | 'older'; localAnalysis: { budgetVerdict: string }; directMetroCommuteInfo: { hasDirectLine: boolean; badgeText: string }; deepInsight: NeighborhoodDeepInsight; rentVsBuyVerdict: RentVsBuyVerdict; marketReport: BubbleReport;
  hoodCustomDeposit: number; setHoodCustomDeposit: (v: number) => void; calculatedHoodMonthlyRent: number; setTradeUpCurrentHoodId: (id: number) => void; setShowTradeUpModal: (v: boolean) => void; setBargainHoodId: (id: number) => void; setSponsorHoodId: (id: number) => void; setAgencyModalTab: (t: 'submit_bargain' | 'reserve_sponsor') => void; setShowAgencyModal: (v: boolean) => void; setAlertHoodId: (id: number) => void; setAlertSubmitMsg: (msg: string) => void; setShowBuyerAlertModal: (v: boolean) => void; callingSponsorHoodId: number | null; revealedSponsorPhoneHoodId: number | null; onTrackSponsorCall: (hood: Neighborhood, sponsor: { name: string; phone: string }) => void;
  setNewVisitAddress: (v: string) => void; setNewVisitPrice: (v: number) => void; setShowVisitedModal: (v: boolean) => void; hoodLandmarks: LocalLandmark[]; onFocusLandmarkOnMap: (lm: LocalLandmark) => void; voteAir: number; setVoteAir: (v: number) => void; votePower: number; setVotePower: (v: number) => void; voteInternet: number; setVoteInternet: (v: number) => void; voteMetro: number; setVoteMetro: (v: number) => void; voteSecurity: number; setVoteSecurity: (v: number) => void; voteFlat: number; setVoteFlat: (v: number) => void; voteComment: string; setVoteComment: (v: string) => void; verifyingGeo: boolean; onResidentVote: (useGeolocation: boolean) => void; voteStatus: { type: 'success' | 'warning' | 'info'; text: string } | null; cloudVotes: ResidentVoteDoc[]; totalRahnEquivalent: number; buyTotalBudget: number; deposit: number; monthlyRent: number; visitedHomes: VisitedHomeEntry[]; isOverlayOnSecondaryView?: boolean; }
export function NeighborhoodInspectorDrawer(props: NeighborhoodInspectorDrawerProps): React.ReactElement { const { mobileSheetOpen, setMobileSheetOpen, appleTheme, onToggleAppleTheme, mapTileStyle, setMapTileStyle, favoriteHoodIds, onToggleFavoriteHood, onOpenShortlistMatrix, evaluatedNeighborhoods, selectedHood, onSelectNeighborhood,
    activeCity, onSwitchCity, onOpenShareModal, targetSqm, rentAgeMultiplier, selectedWorkHub, workHubId, workHubs, onSelectWorkHubId, onChangeTargetSqm, onChangeBuildingAgeSegment, useLoanBooster, onToggleLoanBooster, deductTenantRahnInBuy, onToggleDeductTenantRahn, setShowHedonicModal, featureFlags, setExpansionModalType,
    setSuperModuleInitialTab, setShowSuperModulesModal, anatomyTabsRef, activeTab, setActiveTab, mode, buildingAgeSegment, localAnalysis, directMetroCommuteInfo, deepInsight, rentVsBuyVerdict, marketReport, hoodCustomDeposit, setHoodCustomDeposit,
    calculatedHoodMonthlyRent, setTradeUpCurrentHoodId, setShowTradeUpModal, setBargainHoodId, setSponsorHoodId, setAgencyModalTab, setShowAgencyModal, setAlertHoodId, setAlertSubmitMsg, setShowBuyerAlertModal, callingSponsorHoodId,
    revealedSponsorPhoneHoodId, onTrackSponsorCall, setNewVisitAddress, setNewVisitPrice, setShowVisitedModal, hoodLandmarks, onFocusLandmarkOnMap, voteAir, setVoteAir, votePower, setVotePower, voteInternet, setVoteInternet,
    voteMetro, setVoteMetro, voteSecurity, setVoteSecurity, voteFlat, setVoteFlat, voteComment, setVoteComment, verifyingGeo, onResidentVote, voteStatus, cloudVotes, totalRahnEquivalent, buyTotalBudget, deposit, monthlyRent, visitedHomes, isOverlayOnSecondaryView = false } = props;
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); useExchangeRateSnapshot(); const isEn = radarLocale === 'en'; const inspectorCopy = getRadarInspectorCopy(radarLocale); const [desktopCollapsed, setDesktopCollapsed] = React.useState(false); const [snapMode, setSnapMode] = React.useState<'peek' | 'expanded'>('expanded'); const dragStartRef = React.useRef<{ y: number; t: number } | null>(null); const didDragRef = React.useRef(false); React.useEffect(() => { setDesktopCollapsed(false); }, [selectedHood.id, mobileSheetOpen]); const currentSnap: BottomSheetSnapState = !mobileSheetOpen ? 'collapsed' : snapMode; const applySnapState = (next: BottomSheetSnapState) => { if (next === 'collapsed') { setMobileSheetOpen(false); } else { setSnapMode(next); setMobileSheetOpen(true); } }; const hoodVisitsCount = visitedHomes.filter((v) => v.hoodId === selectedHood.id).length; const favoriteMultiCityHoods = React.useMemo(() => { const favoriteCities = Array.from(new Set(favoriteHoodIds.map(resolveCityIdForNeighborhood))).filter((cityId) => cityId !== activeCity); return favoriteCities.flatMap((cityId) => cityId === 'tehran' ? INITIAL_NEIGHBORHOODS : getCityExpansionSeeds(cityId)); }, [favoriteHoodIds, activeCity]); const hoodAggMetrics = React.useMemo(() => aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)), [selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, selectedHood.bargains]); return ( <>
      <div onClick={() => setMobileSheetOpen(false)} aria-hidden="true" className={`lg:hidden fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[3px] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${mobileSheetOpen && snapMode === 'expanded' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />
      <aside data-snap-state={currentSnap} data-desktop-dock={isOverlayOnSecondaryView ? 'left-companion' : 'right-primary'} className={`fixed z-30 apple-inspector-panel rounded-t-[20px] rounded-b-[12px] lg:rounded-[12px] flex flex-col overflow-hidden ios-inspector-enter transition-[height,transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[height,transform,box-shadow] ${isOverlayOnSecondaryView ? 'lg:top-[76px] lg:left-4 lg:right-auto' : 'lg:top-[124px] lg:right-4 lg:left-auto'} lg:w-[312px] xl:w-[352px] 2xl:w-[364px] lg:translate-y-0 ${desktopCollapsed ? 'lg:bottom-auto lg:h-[68px]' : 'lg:bottom-4 lg:h-auto'} ${mobileSheetOpen ? (snapMode === 'peek' ? 'bottom-[calc(4.75rem+var(--safe-bottom))] inset-x-3 h-[46dvh] max-h-[calc(100dvh-5.5rem-var(--safe-bottom))] translate-y-0 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:ring-white/10' : 'bottom-[calc(4.75rem+var(--safe-bottom))] inset-x-3 h-[86dvh] max-h-[calc(100dvh-5.5rem-var(--safe-bottom))] translate-y-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10') : 'bottom-[calc(4.75rem+var(--safe-bottom))] inset-x-3 h-auto min-h-[72px] translate-y-0 shadow-lg'}`}>
        <button type="button" onPointerDown={(e) => { didDragRef.current = false; dragStartRef.current = { y: e.clientY, t: Date.now() }; try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {} }} onPointerUp={(e) => { try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {} if (!dragStartRef.current) return; const dy = e.clientY - dragStartRef.current.y; const dt = Math.max(16, Date.now() - dragStartRef.current.t); dragStartRef.current = null; const nextSnap = computeNextSnapStateFromGesture({ currentState: currentSnap, deltaY: dy, velocityY: dy / dt }); if (nextSnap !== currentSnap) { didDragRef.current = true; applySnapState(nextSnap); } }} onClick={() => { if (didDragRef.current) { didDragRef.current = false; return; } setMobileSheetOpen(!mobileSheetOpen); }} className="lg:hidden w-full pt-2 pb-0.5 flex justify-center shrink-0 cursor-pointer group touch-none radar-drawer-drag-handle min-h-[20px]" aria-expanded={mobileSheetOpen} aria-controls="neighborhood-inspector-content" aria-label={mobileSheetOpen ? 'بستن پنل کالبدشکافی' : 'باز کردن پنل کالبدشکافی'}> <span className="w-10 h-1.5 rounded-full bg-slate-300/80 dark:bg-slate-600/80 group-hover:bg-slate-400 group-active:scale-95 transition-all duration-200" />
        </button> {(!mobileSheetOpen || desktopCollapsed) && (
          <div className={`${desktopCollapsed ? 'flex' : 'lg:hidden flex'} min-h-[60px] py-2 px-4 items-center justify-between gap-3 shrink-0 transition-opacity duration-300`}> <button type="button" onClick={() => { setMobileSheetOpen(true); setDesktopCollapsed(false); }} aria-expanded={!desktopCollapsed && mobileSheetOpen} aria-controls="neighborhood-inspector-content" className="min-w-0 flex-1 text-start cursor-pointer">
              <div className="flex items-center gap-2"> <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">محله {selectedHood.name}</h2>
                <span className="px-2 py-0.5 rounded-[7px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-extrabold text-[11px] tabular-nums shrink-0">{toPersianNum(selectedHood.overallScore)} / ۱۰</span> </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums truncate">
                خرید: {areaUnit === 'sqft' ? 'هر ft²' : 'متری'} <strong className="text-slate-800 dark:text-slate-100">{toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}</strong> · رهن ({formatAreaShort(80, areaUnit)}):{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(selectedHood.rahn80m)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood.rahn80m, intlCurrency, radarLocale)})` : ''}</strong>
              </div>
            </button>
            <button type="button" onClick={() => { setMobileSheetOpen(true); setDesktopCollapsed(false); }} aria-expanded={!desktopCollapsed && mobileSheetOpen} aria-controls="neighborhood-inspector-content" className="px-3 py-2 rounded-[10px] bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shrink-0 shadow-xs cursor-pointer hover:bg-emerald-700 active:scale-95 transition-all">
              <span>{isEn ? 'Inspect' : 'بررسی محله'}</span>
              {desktopCollapsed ? <ChevronDown className="w-4 h-4 stroke-[1.75] hidden lg:block" aria-hidden="true" /> : null}
              <ChevronUp className={`w-4 h-4 stroke-[1.75] ${desktopCollapsed ? 'lg:hidden' : ''}`} aria-hidden="true" />
            </button>
          </div> )}
        <div id="neighborhood-inspector-content" inert={desktopCollapsed ? true : undefined} data-mobile-collapsed={!mobileSheetOpen ? 'true' : 'false'} className={`flex-col flex-1 overflow-y-auto overscroll-contain radar-drawer-scroll-container p-4 sm:p-5 justify-between transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${desktopCollapsed ? 'lg:hidden' : ''} ${mobileSheetOpen ? 'flex opacity-100 translate-y-0 pointer-events-auto' : 'hidden lg:flex opacity-0 translate-y-6 pointer-events-none lg:opacity-100 lg:translate-y-0 lg:pointer-events-auto'}`}>
        <div>
          <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-200/70 dark:border-slate-800">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 tracking-tight whitespace-nowrap">{inspectorCopy.headerTitle}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setSnapMode((prev) => (prev === 'peek' ? 'expanded' : 'peek'))} className="lg:hidden px-2 py-1 rounded-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap inline-flex items-center gap-1">
                {snapMode === 'peek' ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                <span>{snapMode === 'peek' ? 'کامل' : 'نیمه'}</span>
              </button>
              {setMapTileStyle && ( <button type="button" onClick={() => setMapTileStyle((prev) => (prev === 'satellite' ? 'neshan' : 'satellite'))} className={`px-2 py-1 rounded-[8px] border text-[10px] font-bold cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${mapTileStyle === 'satellite' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-slate-100 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                  {mapTileStyle === 'satellite' ? <Map className="w-3 h-3" aria-hidden="true" /> : <Satellite className="w-3 h-3" aria-hidden="true" />}
                  <span>{mapTileStyle === 'satellite' ? 'نقشه' : 'ماهواره'}</span>
                </button> )}
              <button type="button" onClick={onToggleAppleTheme} className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                {appleTheme === 'dark' ? <Sun className="w-3 h-3 text-amber-400" aria-hidden="true" /> : <Moon className="w-3 h-3" aria-hidden="true" />}
                <span>{appleTheme === 'dark' ? 'روشن' : 'تیره'}</span>
              </button>
              <button type="button" onClick={() => { setMobileSheetOpen(false); if (!isOverlayOnSecondaryView) setDesktopCollapsed(true); }} className="px-2 py-1 rounded-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[10.5px] font-bold flex items-center gap-0.5 cursor-pointer whitespace-nowrap">
                <span>{isEn ? 'Close' : 'بستن'}</span><ChevronDown className="w-3 h-3 stroke-[1.75]" />
              </button>
            </div>
          </div>
          {favoriteHoodIds.length > 0 && ( <div className="mb-3 pb-2.5 border-b border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 stroke-[1.75] text-rose-500 fill-rose-500" />
                  <span>منتخب من ({toPersianNum(favoriteHoodIds.length)})</span>
                </span>
                {favoriteHoodIds.length >= 2 && ( <button type="button" onClick={onOpenShortlistMatrix} className="px-2 py-0.5 rounded-[7px] bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer">
                    <ArrowLeftRight className="w-3 h-3 text-emerald-600" /><span>مقایسه جدولی منتخب‌ها</span>
                  </button> )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {favoriteHoodIds.map((favId) => { const favHood = evaluatedNeighborhoods.find((h) => h.id === favId) || favoriteMultiCityHoods.find((h) => h.id === favId); if (!favHood) return null; const favCityId = resolveCityIdForNeighborhood(favHood.id); const isOtherCity = favCityId !== activeCity;
                  const isCurrent = favHood.id === selectedHood.id; const favUnitBuy = convertPricePerSqmToUnit(favHood.buyPerSqm, areaUnit); const favMetricText = mode === 'rent' ? `رهن (${formatAreaShort(80, areaUnit)}): ${toPersianNum(favHood.rahn80m)} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(favHood.rahn80m, intlCurrency, radarLocale)}` : ''}` : `${toPersianNum(favUnitBuy)}م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(favUnitBuy, intlCurrency, radarLocale)}` : ''}`; return ( <div key={favHood.id} className={`flex items-center gap-1 px-2 py-1 rounded-[9px] text-[11px] font-bold border transition ${isCurrent ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'}`}>
                      <button type="button" onClick={() => { if (isOtherCity && onSwitchCity) onSwitchCity(favCityId, favHood.id); onSelectNeighborhood(favHood as EvaluatedNeighborhood); }} className="cursor-pointer flex items-center gap-1">
                        <span>{isOtherCity ? `${MULTI_CITY_CONFIGS[favCityId]?.nameFa || ''} · ${favHood.name}` : favHood.name}</span>
                        <span className={`text-[10px] tabular-nums ${isCurrent ? 'text-emerald-300 dark:text-emerald-700' : 'text-emerald-600 dark:text-emerald-400'}`}>({favMetricText})</span>
                      </button>
                      <button type="button" onClick={() => onToggleFavoriteHood(favHood.id)} title="حذف" className="text-slate-400 hover:text-rose-600 mr-0.5 cursor-pointer">
                        <X className="w-3 h-3 stroke-[1.75]" />
                      </button>
                    </div>
                  ); })}
              </div>
            </div> )}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="break-words leading-snug">{selectedHood.zone}</span><span aria-hidden="true">·</span>
                <span className={`whitespace-nowrap ${selectedHood.status === 'green' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : selectedHood.status === 'yellow' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}`}>
                  {selectedHood.status === 'green' ? 'متناسب با بودجه' : `${toPersianNum(selectedHood.diffPercent)}٪ بالاتر از بودجه`}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5 truncate">محله {selectedHood.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {activeCity === 'tehran' && (() => { const tz = getTrafficZoneStatus(selectedHood.id);
                  return <span className={`inline-block px-2 py-0.5 rounded-[7px] text-[10.5px] font-bold border ${tz.badgeClass}`}>{tz.label}</span>;
                })()}
                <span data-testid="inspector-price-truth" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-[9.5px] font-bold">
                  {formatNeighborhoodPriceTruthFa(selectedHood.id, (selectedHood.bargains || []).filter((row) => isLiveDivarBargainId(row.id)).length)}
                </span>
                <span data-testid="inspector-provenance-badge" title="فرمول شاخص پوشش نمونه (۰ نمونه=۰، ۱ نمونه=۳۵، ۲ نمونه=۵۲، ۳+ نمونه=62+3N تا سقف ۹۸): شاخص قراردادی پوشش داده است، نه احتمال یا اطمینان آماری" className={hoodAggMetrics.observedSampleCount === 0 ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[9.5px] font-bold tabular-nums' : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[9.5px] font-bold tabular-nums'}>
                  <Scale className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{hoodAggMetrics.observedSampleCount === 0
                    ? 'پوشش نمونه: ۰ آگهی زنده در محاسبه قیمت'
                    : hoodAggMetrics.isBootstrapped
                      ? `پوشش نمونه محدود: ${toPersianNum(hoodAggMetrics.observedSampleCount)} آگهی مشاهده‌شده + پروفایل مرجع (شاخص پوشش نمونه: ${toPersianNum(hoodAggMetrics.evidenceIndexScore)}/۱۰۰ — غیرآماری)`
                      : `شاخص پوشش نمونه: ${toPersianNum(hoodAggMetrics.evidenceIndexScore)}/۱۰۰ (${toPersianNum(hoodAggMetrics.eligibleObservedCount)} آگهی مشاهده‌شده معتبر | ${toPersianNum(hoodAggMetrics.excludedOutlierCount)} داده پرت آماری IQR حذف شد)`}</span>
                </span>
                {hoodVisitsCount > 0 && ( <button type="button" onClick={() => setShowVisitedModal(true)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[10.5px] font-bold cursor-pointer transition">
                    <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{toPersianNum(hoodVisitsCount)} بازدید ثبت‌شده شما در {selectedHood.name}</span>
                  </button> )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => onToggleFavoriteHood(selectedHood.id)} title="افزودن به منتخب‌ها" aria-label="افزودن به منتخب‌ها" className={`p-2 rounded-[10px] border transition cursor-pointer ${favoriteHoodIds.includes(selectedHood.id) ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950 dark:border-rose-800' : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                <Heart className={`w-4 h-4 stroke-[1.75] ${favoriteHoodIds.includes(selectedHood.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
              <button type="button" onClick={onOpenShareModal} title="اشتراک‌گذاری کارنامه محله" aria-label="اشتراک‌گذاری کارنامه محله" className="p-2 rounded-[10px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 transition cursor-pointer">
                <Share2 className="w-4 h-4 stroke-[1.75]" />
              </button>
              <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-[10px] px-2.5 py-1.5 text-center">
                <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{toPersianNum(selectedHood.overallScore)} / ۱۰</div>
              </div>
            </div>
          </div>
          <div data-testid="inspector-price-card" className="grid grid-cols-2 gap-2.5 my-2.5">
            <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatUnitBuyPriceTitle(areaUnit, radarLocale)}</div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">{toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? <span dir="ltr">{` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})`}</span> : ''}</span></div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{formatAreaShort(targetSqm, areaUnit, !isEn)}: {toPersianNum(((selectedHood.buyPerSqm * targetSqm) / 1000).toFixed(2))} {isEn ? 'B' : 'میلیارد'}{intlCurrency !== 'IRT' ? <span dir="ltr">{` (${formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm * targetSqm, intlCurrency, radarLocale)})`}</span> : ''} · {isEn ? 'Est. v6.4' : 'سناریو v6.4 (غیرثبتی)'}: {toPersianNum(convertPricePerSqmToUnit(hoodAggMetrics.estimatedDealPricePerSqm, areaUnit))} {isEn ? 'M' : 'م'}</div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{isEn ? 'Full Deposit' : 'رهن کامل'} ({formatAreaShort(targetSqm, areaUnit, !isEn)})</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">{toPersianNum(Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier))} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? <span dir="ltr">{` (${formatMillionTomanAsIntlCurrency(Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier), intlCurrency, radarLocale)})`}</span> : ''}</span></div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{selectedHood.distKm !== null ? (isEn ? `Direct distance to ${selectedWorkHub.name}: ${selectedHood.distKm} km` : `فاصله مستقیم تا ${selectedWorkHub.name}: ${toPersianNum(selectedHood.distKm)} کیلومتر`) : `${isEn ? 'Base' : 'پایه'} ${formatAreaShort(80, areaUnit, !isEn)}: ${toPersianNum(selectedHood.rahn80m)} ${isEn ? 'M' : 'م'}${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood.rahn80m, intlCurrency, radarLocale)})` : ''}`}</div>
            </div>
          </div>
          <div ref={anatomyTabsRef} role="tablist" aria-label={radarLocale === 'en' ? 'Neighborhood information' : 'بخش‌های کارنامه محله'} aria-orientation="horizontal" className="flex flex-wrap gap-1 apple-segmented dark:bg-slate-800 p-1 rounded-[10px] mb-2.5 text-[11px] font-bold">
            {[
              { id: 'scorecard' as const, label: inspectorCopy.scorecardTab }, { id: 'market' as const, label: inspectorCopy.marketTab },
              { id: 'bargains' as const, label: `${inspectorCopy.bargainsTabPrefix} (${toPersianNum((selectedHood?.bargains || []).length)})` },
              { id: 'reviews' as const, label: inspectorCopy.reviewsTab },
              { id: 'vote' as const, label: inspectorCopy.voteTab }, ].map((t, idx, arr) => { const isActive = activeTab === t.id; return ( <button
                  key={t.id} id={`inspector-tab-${t.id}`} type="button" role="tab" aria-selected={isActive} aria-controls={`inspector-panel-${t.id}`} tabIndex={isActive ? 0 : -1} data-testid={`inspector-tab-${t.id}`} onClick={() => setActiveTab(t.id)} onKeyDown={(event) => { const nextIndex = event.key === 'ArrowLeft' ? (idx + 1) % arr.length : event.key === 'ArrowRight' ? (idx + arr.length - 1) % arr.length : event.key === 'Home' ? 0 : event.key === 'End' ? arr.length - 1 : -1; if (nextIndex >= 0) { event.preventDefault(); setActiveTab(arr[nextIndex].id); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus(); } }}
                  className={`flex-1 basis-auto min-h-11 rounded-[8px] px-2 text-center whitespace-nowrap transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${isActive ? 'apple-segmented-pill-active dark:bg-slate-900 dark:text-white font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {t.label}
                </button>
              ); })}
          </div>
          <div
            id={`inspector-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`inspector-tab-${activeTab}`}
            tabIndex={0}
            className="outline-none"
          >
          <NeighborhoodInspectorTabs
            key={selectedHood.id} activeTab={activeTab} selectedHood={selectedHood} activeCity={activeCity} mode={mode}
            targetSqm={targetSqm} rentAgeMultiplier={rentAgeMultiplier}
            buildingAgeSegment={buildingAgeSegment} workHubId={workHubId}
            selectedWorkHub={selectedWorkHub} workHubs={workHubs}
            onSelectWorkHubId={onSelectWorkHubId} onChangeTargetSqm={onChangeTargetSqm}
            onChangeBuildingAgeSegment={onChangeBuildingAgeSegment}
            useLoanBooster={useLoanBooster} onToggleLoanBooster={onToggleLoanBooster}
            deductTenantRahnInBuy={deductTenantRahnInBuy}
            onToggleDeductTenantRahn={onToggleDeductTenantRahn}
            effectiveBuyBudget={useLoanBooster ? buyTotalBudget + 1200 : buyTotalBudget} buyTotalBudget={buyTotalBudget}
            deposit={deposit} monthlyRent={monthlyRent}
            totalRahnEquivalent={totalRahnEquivalent}
            localAnalysis={localAnalysis} directMetroCommuteInfo={directMetroCommuteInfo}
            deepInsight={deepInsight} rentVsBuyVerdict={rentVsBuyVerdict}
            marketReport={marketReport} hoodCustomDeposit={hoodCustomDeposit}
            setHoodCustomDeposit={setHoodCustomDeposit}
            calculatedHoodMonthlyRent={calculatedHoodMonthlyRent}
            setShowHedonicModal={setShowHedonicModal}
            setTradeUpCurrentHoodId={setTradeUpCurrentHoodId} setShowTradeUpModal={setShowTradeUpModal}
            setBargainHoodId={setBargainHoodId} setAgencyModalTab={setAgencyModalTab}
            setShowAgencyModal={setShowAgencyModal} setAlertHoodId={setAlertHoodId}
            setAlertSubmitMsg={setAlertSubmitMsg} setShowBuyerAlertModal={setShowBuyerAlertModal}
            featureFlags={featureFlags} callingSponsorHoodId={callingSponsorHoodId}
            revealedSponsorPhoneHoodId={revealedSponsorPhoneHoodId}
            onTrackSponsorCall={onTrackSponsorCall} setNewVisitAddress={setNewVisitAddress}
            setNewVisitPrice={setNewVisitPrice} setShowVisitedModal={setShowVisitedModal}
            hoodLandmarks={hoodLandmarks} onFocusLandmarkOnMap={onFocusLandmarkOnMap}
            voteAir={voteAir} setVoteAir={setVoteAir} votePower={votePower} setVotePower={setVotePower}
            voteInternet={voteInternet} setVoteInternet={setVoteInternet} voteMetro={voteMetro}
            setVoteMetro={setVoteMetro} voteSecurity={voteSecurity} setVoteSecurity={setVoteSecurity}
            voteFlat={voteFlat} setVoteFlat={setVoteFlat} voteComment={voteComment}
            setVoteComment={setVoteComment} verifyingGeo={verifyingGeo}
            onResidentVote={onResidentVote} voteStatus={voteStatus} cloudVotes={cloudVotes}
          />
          {activeTab === 'market' && ( <div className="space-y-3.5 my-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
              <SmartPriceForecastCard selectedHood={selectedHood} hoodName={selectedHood.name} currentBuyPerSqm={selectedHood.buyPerSqm} marketReport={marketReport} compact />
              <React.Suspense fallback={<div className="h-36 rounded-[12px] bg-slate-100/80 dark:bg-slate-800/80 animate-pulse" aria-busy="true" />}><NeighborhoodMonthlyBarChart selectedHood={selectedHood} marketReport={marketReport} activeCity={activeCity} compact /></React.Suspense>
            </div>
          )}
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-200/70 dark:border-slate-800">
            <QuickHoodRankingStrip evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHoodId={selectedHood.id} mode={mode} onSelectNeighborhood={onSelectNeighborhood} activeCity={activeCity} onSwitchCity={onSwitchCity} />
          </div>
          <div className="my-3.5 space-y-2">
            <button type="button" onClick={() => setShowHedonicModal(true)} className="w-full py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-black flex items-center justify-between transition cursor-pointer shadow-xs">
              <span className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4 stroke-[1.75]" /><span>{inspectorCopy.hedonicCta}</span>
              </span>
              <span className="text-[10.5px] bg-white/20 dark:bg-slate-900/10 px-2 py-0.5 rounded-[7px] font-bold">محله {selectedHood.name} · {formatAreaShort(targetSqm, areaUnit)}</span>
            </button>
            {featureFlags.enableCommissionCalc && ( <div className="flex items-center gap-2">
                <button
                  type="button" onClick={() => setExpansionModalType('commission')}
                  className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                    <span>ماشین‌حساب کمیسیون و محضر ({selectedHood.name})</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">{intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm * targetSqm, intlCurrency, radarLocale) : 'محاسبه آنلاین'}</span>
                </button>
                {featureFlags.enableAiContractCheck && ( <button
                    type="button" onClick={() => setExpansionModalType('contract')} title="مشاور حقوقی هوشمند قولنامه"
                    className="py-2 px-2.5 rounded-[10px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 transition cursor-pointer shrink-0"
                  >
                    <Scale className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                    <span>قولنامه</span>
                  </button> )}
              </div>
            )}
            {(featureFlags.enableAiValuation || featureFlags.enableFakeAdDetector || featureFlags.enableMortgageSimulator || featureFlags.enablePropertySwap) && (
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                {featureFlags.enableAiValuation && (
                  <button type="button" onClick={() => { setSuperModuleInitialTab('valuation'); setShowSuperModulesModal(true); }} className="py-1.5 px-2 rounded-[10px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1 transition cursor-pointer truncate">
                    <Sparkles className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" /><span className="truncate">کارشناسی قیمت ملک</span>
                  </button>
                )}
                {featureFlags.enableFakeAdDetector && (
                  <button type="button" onClick={() => { setSuperModuleInitialTab('fake_detector'); setShowSuperModulesModal(true); }} className="py-1.5 px-2 rounded-[10px] bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-1 transition cursor-pointer truncate">
                    <ShieldAlert className="w-3.5 h-3.5 stroke-[1.75] text-rose-500 shrink-0" /><span className="truncate">مچ‌گیر آگهی فیک</span>
                  </button>
                )}
                {(featureFlags.enableMortgageSimulator || featureFlags.enablePropertySwap) && (
                  <button type="button" onClick={() => { setSuperModuleInitialTab(featureFlags.enableMortgageSimulator ? 'mortgage' : 'swap_suburb'); setShowSuperModulesModal(true); }} className="py-1.5 px-2 rounded-[10px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-1 transition cursor-pointer truncate">
                    <Building2 className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" /><span className="truncate">وام و تهاتر</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <React.Suspense fallback={null}>
            {(activeTab === 'scorecard' || activeTab === 'vote') && ( <NeighborhoodPhotoGallery selectedHood={selectedHood} hoodLandmarks={hoodLandmarks} onFocusLandmarkOnMap={onFocusLandmarkOnMap} />
            )}
            <details className="my-3.5 rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-xs font-bold text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-slate-200">
                <span>تحلیل پیشرفته و مقایسه</span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">چرخه بازار · ماتریس محله‌ها</span>
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
              <Stage2MasterWidget
                hoodId={selectedHood.id}
                hoodName={selectedHood.name}
                cityId={activeCity}
                basePriceSqm={selectedHood.buyPerSqm}
                targetSqm={targetSqm}
                intlCurrency={intlCurrency}
                hood={selectedHood}
                initialTab={activeTab === 'market' ? 'HOUSING_CYCLE' : (activeTab === 'vote' || activeTab === 'reviews') ? 'CROWD_CLAIMS' : 'DECISION_SYNTHESIS'}
                onSelectCompareHood={(name) => {
                  const found = evaluatedNeighborhoods.find((h) => h.name === name) || favoriteMultiCityHoods.find((h) => h.name === name) || getAllMultiCityNeighborhoods().find((h) => h.name === name);
                  if (found) onSelectNeighborhood(found as EvaluatedNeighborhood);
                }}
              />
                <ExpandableComparisonTable
                  currentHood={selectedHood} allNeighborhoods={evaluatedNeighborhoods}
                  targetSqm={targetSqm} rentAgeMultiplier={rentAgeMultiplier} mode={mode}
                  onSelectNeighborhood={onSelectNeighborhood}
                />
              </div>
            </details>
          </React.Suspense>
        </div>
        <InspectorSponsorFooter
          selectedHood={selectedHood}
          enableSponsorBilling={featureFlags.enableSponsorBilling}
          mode={mode}
          totalRahnEquivalent={totalRahnEquivalent}
          buyTotalBudget={useLoanBooster ? buyTotalBudget + 1200 : buyTotalBudget}
          isSponsorActiveFn={isSponsorActive}
          buildSponsorWhatsAppUrlFn={buildSponsorWhatsAppUrl} onTrackSponsorCall={onTrackSponsorCall} onReserveSponsorClick={() => { setSponsorHoodId(selectedHood.id); setAgencyModalTab('reserve_sponsor'); setShowAgencyModal(true); }} PhoneIcon={Phone} SendIcon={Send} />
      </div>
    </aside>
    </>
  ); }
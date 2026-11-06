import React from 'react'; import { ArrowLeftRight, Building2, Calculator, ChevronDown, ChevronUp, Heart, Phone, Scale, Send, Share2, ShieldAlert, Sparkles, X } from 'lucide-react'; import { BubbleReport, EvaluatedNeighborhood, LocalLandmark, MapTileServerId, Neighborhood, ResidentVoteDoc, WorkHub, isSponsorActive, toPersianNum } from '../data/neighborhoods'; import { getTrafficZoneStatus, type NeighborhoodDeepInsight, type RentVsBuyVerdict } from '../data/neighborhoodInsights'; import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData'; import type { ExpansionModalType } from './ExpansionModulesModal'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { buildSponsorWhatsAppUrl, type FeatureFlags } from '../utils/security'; import { QuickHoodRankingStrip } from './QuickHoodRankingStrip'; import { NeighborhoodInspectorTabs, type InspectorTabId } from './NeighborhoodInspectorTabs'; import { SmartPriceForecastCard, InspectorSponsorFooter } from './SmartPriceForecastCard';
import { NeighborhoodMonthlyBarChart } from './NeighborhoodMonthlyBarChart'; import type { VisitedHomeEntry } from './PortfolioModals'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle, getRadarInspectorCopy } from '../utils/areaUnit'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; const NeighborhoodPhotoGallery = React.lazy(() => import('./NeighborhoodPhotoGallery').then((m) => ({ default: m.NeighborhoodPhotoGallery }))); const ExpandableComparisonTable = React.lazy(() => import('./ExpandableComparisonTable').then((m) => ({ default: m.ExpandableComparisonTable }))); export interface NeighborhoodInspectorDrawerProps { mobileSheetOpen: boolean; setMobileSheetOpen: (v: boolean) => void; appleTheme: 'light' | 'dark'; onToggleAppleTheme: () => void; mapTileStyle?: MapTileServerId; setMapTileStyle?: React.Dispatch<React.SetStateAction<MapTileServerId>>; favoriteHoodIds: number[]; onToggleFavoriteHood: (hoodId: number) => void;
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
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const inspectorCopy = getRadarInspectorCopy(radarLocale); const [desktopCollapsed, setDesktopCollapsed] = React.useState(false); React.useEffect(() => { setDesktopCollapsed(false); }, [selectedHood.id, mobileSheetOpen]); const hoodVisitsCount = visitedHomes.filter((v) => v.hoodId === selectedHood.id).length; const allMultiCityHoods = React.useMemo(() => getAllMultiCityNeighborhoods(), []); const hoodTotal80mMillions = Math.round(selectedHood.buyPerSqm * 80); const scaledMonthlyRentTarget = Math.max(1, Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier * 0.03)); void hoodTotal80mMillions; void scaledMonthlyRentTarget; const hoodAggMetrics = React.useMemo(() => aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, (selectedHood.bargains || []).map((b) => ({ id: b.id, askingTotalMillion: Math.round(b.sqm * selectedHood.buyPerSqm * (1 - (b.discountPercent || 10) / 100)), description: `${b.sqm} متر ${b.title}` }))), [selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, selectedHood.bargains]); return ( <>
      <div onClick={() => setMobileSheetOpen(false)} aria-hidden="true" className={`${isOverlayOnSecondaryView ? '' : 'lg:hidden '}fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[3px] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${mobileSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />
      <aside className={`fixed z-30 apple-inspector-panel rounded-[24px] lg:rounded-[20px] flex flex-col overflow-hidden ios-inspector-enter transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[height,transform,box-shadow] ${isOverlayOnSecondaryView ? 'lg:top-[76px]' : 'lg:top-[132px]'} lg:right-4 lg:left-auto lg:w-[396px] lg:translate-y-0 ${desktopCollapsed ? 'lg:bottom-auto lg:h-[68px]' : 'lg:bottom-5 lg:h-auto'} ${mobileSheetOpen ? 'bottom-16 inset-x-3 h-[78vh] translate-y-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10' : 'bottom-16 inset-x-3 h-[78px] translate-y-0 shadow-lg'}`}>
        <div onClick={() => setMobileSheetOpen(!mobileSheetOpen)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMobileSheetOpen(!mobileSheetOpen); } }} className="lg:hidden w-full pt-2.5 pb-1 flex justify-center shrink-0 cursor-pointer group touch-none" role="button" tabIndex={0} aria-label={mobileSheetOpen ? 'بستن پنل کالبدشکافی' : 'باز کردن پنل کالبدشکافی'}> <span className="w-10 h-1.5 rounded-full bg-slate-300/80 dark:bg-slate-600/80 group-hover:bg-slate-400 group-active:scale-95 transition-all duration-200" />
        </div> {(!mobileSheetOpen || desktopCollapsed) && (
          <div className={`${desktopCollapsed ? 'flex' : 'lg:hidden flex'} h-[64px] px-4 items-center justify-between gap-3 shrink-0 transition-opacity duration-300`}> <div role="button" tabIndex={0} onClick={() => { setMobileSheetOpen(true); setDesktopCollapsed(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMobileSheetOpen(true); setDesktopCollapsed(false); } }} className="min-w-0 flex-1 cursor-pointer">
              <div className="flex items-center gap-2"> <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">محله {selectedHood.name}</h2>
                <span className="px-2 py-0.5 rounded-[7px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-extrabold text-[11px] tabular-nums">{toPersianNum(selectedHood.overallScore)} / ۱۰</span> </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums truncate">
                خرید: {areaUnit === 'sqft' ? 'هر ft²' : 'متری'} <strong className="text-slate-800 dark:text-slate-100">{toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}</strong> (معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(hoodAggMetrics.estimatedDealPricePerSqm, areaUnit))} م) · رهن ({formatAreaShort(80, areaUnit)}):{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(selectedHood.rahn80m)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood.rahn80m, intlCurrency, radarLocale)})` : ''}</strong>
              </div>
            </div>
            <button type="button" onClick={() => { setMobileSheetOpen(true); setDesktopCollapsed(false); }} className="px-3 py-2 rounded-[10px] bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shrink-0 shadow-xs cursor-pointer hover:bg-emerald-700 active:scale-95 transition-all">
              <span>بررسی محله</span><ChevronUp className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div> )}
        <div className={`flex flex-col flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 justify-between transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${desktopCollapsed ? 'lg:hidden' : ''} ${mobileSheetOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-6 pointer-events-none lg:opacity-100 lg:translate-y-0 lg:pointer-events-auto'}`}>
        <div>
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/70 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 tracking-tight">{inspectorCopy.headerTitle}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="lg:hidden"><AreaUnitToggle compact showIntlControls /></div>
              {setMapTileStyle && ( <button type="button" onClick={() => setMapTileStyle((prev) => (prev === 'satellite' ? 'neshan' : 'satellite'))} className={`px-2 py-0.5 rounded-[7px] border text-[10px] font-bold cursor-pointer ${mapTileStyle === 'satellite' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                  {mapTileStyle === 'satellite' ? '🗺️ نقشه عادی' : '🛰️ ماهواره'}
                </button> )}
              <button type="button" onClick={onToggleAppleTheme} className="px-2 py-0.5 rounded-[7px] bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                {appleTheme === 'dark' ? '☀️ روشن' : '🌙 تیره'}
              </button>
              <button type="button" onClick={() => { setMobileSheetOpen(false); if (!isOverlayOnSecondaryView) setDesktopCollapsed(true); }} className="px-2 py-0.5 rounded-[7px] bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                <span>بستن</span><ChevronDown className="w-3 h-3 stroke-[1.75]" />
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
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {favoriteHoodIds.map((favId) => { const favHood = evaluatedNeighborhoods.find((h) => h.id === favId) || allMultiCityHoods.find((h) => h.id === favId); if (!favHood) return null; const favCityId = resolveCityIdForNeighborhood(favHood.id); const isOtherCity = favCityId !== activeCity;
                  const isCurrent = favHood.id === selectedHood.id; const favUnitBuy = convertPricePerSqmToUnit(favHood.buyPerSqm, areaUnit); const favMetricText = mode === 'rent' ? `رهن (${formatAreaShort(80, areaUnit)}): ${toPersianNum(favHood.rahn80m)} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(favHood.rahn80m, intlCurrency, radarLocale)}` : ''}` : `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(favUnitBuy)} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(favUnitBuy, intlCurrency, radarLocale)}` : ''}`; return ( <div key={favHood.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-[9px] text-xs font-bold whitespace-nowrap border transition shrink-0 ${isCurrent ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'}`}>
                      <button type="button" onClick={() => { if (isOtherCity && onSwitchCity) onSwitchCity(favCityId, favHood.id); onSelectNeighborhood(favHood as EvaluatedNeighborhood); }} className="cursor-pointer flex items-center gap-1">
                        <span>{isOtherCity ? `${MULTI_CITY_CONFIGS[favCityId]?.nameFa || ''} · ${favHood.name}` : favHood.name}</span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums">({favMetricText})</span>
                      </button>
                      <button type="button" onClick={() => onToggleFavoriteHood(favHood.id)} title="حذف" className="text-slate-400 hover:text-rose-600 mr-0.5 cursor-pointer">
                        <X className="w-3 h-3 stroke-[1.75]" />
                      </button>
                    </div>
                  ); })}
              </div>
            </div> )}
          <div className="flex items-start justify-between gap-2 pb-3.5 border-b border-slate-200/70 dark:border-slate-800">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{selectedHood.zone}</span><span aria-hidden="true">·</span>
                <span className={selectedHood.status === 'green' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : selectedHood.status === 'yellow' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                  {selectedHood.status === 'green' ? 'متناسب با بودجه' : `${toPersianNum(selectedHood.diffPercent)}٪ بالاتر از بودجه`}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5 truncate">محله {selectedHood.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {activeCity === 'tehran' && (() => { const tz = getTrafficZoneStatus(selectedHood.id);
                  return <span className={`inline-block px-2 py-0.5 rounded-[7px] text-[10.5px] font-bold border ${tz.badgeClass}`}>{tz.label}</span>;
                })()}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold tabular-nums">
                  🟢 اطمینان آماری: {toPersianNum(hoodAggMetrics.confidenceScore)}٪ ({toPersianNum(hoodAggMetrics.validSampleCount)} نمونه | {toPersianNum(hoodAggMetrics.rejectedFraudCount)} مورد فیک حذف شد)
                </span>
                {hoodVisitsCount > 0 && ( <button type="button" onClick={() => setShowVisitedModal(true)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[10.5px] font-bold cursor-pointer transition">
                    📋 {toPersianNum(hoodVisitsCount)} بازدید ثبت‌شده شما در {selectedHood.name}
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
          <div className="mt-3">
            <QuickHoodRankingStrip evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHoodId={selectedHood.id} mode={mode} onSelectNeighborhood={onSelectNeighborhood} activeCity={activeCity} onSwitchCity={onSwitchCity} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 my-3.5">
            <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatUnitBuyPriceTitle(areaUnit)}</div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">{toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">میلیون{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}</span></div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{formatAreaShort(targetSqm, areaUnit)}: {toPersianNum(((selectedHood.buyPerSqm * targetSqm) / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm * targetSqm, intlCurrency, radarLocale)})` : ''} · معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(hoodAggMetrics.estimatedDealPricePerSqm, areaUnit))} م</div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">رهن کامل ({formatAreaShort(targetSqm, areaUnit)})</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">{toPersianNum(Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier))} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">میلیون{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier), intlCurrency, radarLocale)})` : ''}</span></div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{selectedHood.distKm !== null ? `فاصله تا ${selectedWorkHub.name}: ${toPersianNum(selectedHood.distKm)} کم${areaUnit === 'sqft' ? ` (${toPersianNum((selectedHood.distKm * 0.621371).toFixed(1))} mi)` : ''}` : `پایه ${formatAreaShort(80, areaUnit)} نوساز: ${toPersianNum(selectedHood.rahn80m)} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood.rahn80m, intlCurrency, radarLocale)})` : ''}`}</div>
            </div>
          </div>
          <div ref={anatomyTabsRef} role="tablist" className="grid grid-cols-5 gap-0.5 apple-segmented dark:bg-slate-800 p-1 rounded-[10px] mb-3.5 text-[10px] font-bold whitespace-nowrap">
            {[
              { id: 'scorecard' as const, label: inspectorCopy.scorecardTab }, { id: 'market' as const, label: inspectorCopy.marketTab },
              { id: 'bargains' as const, label: `${inspectorCopy.bargainsTabPrefix} (${toPersianNum((selectedHood?.bargains || []).length)})` },
              { id: 'reviews' as const, label: inspectorCopy.reviewsTab },
              { id: 'vote' as const, label: inspectorCopy.voteTab }, ].map((t, idx, arr) => { const isActive = t.id === 'vote' ? activeTab === 'vote' || activeTab === 'osm_places' : activeTab === t.id; return ( <button
                  key={t.id} type="button" role="tab" aria-selected={isActive} data-testid={`inspector-tab-${t.id}`} onClick={() => setActiveTab(t.id)} onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(arr[(idx + (e.key === 'ArrowLeft' ? 1 : arr.length - 1)) % arr.length].id); } }}
                  className={`py-1.5 px-1 rounded-[8px] text-center truncate transition cursor-pointer ${isActive ? 'apple-segmented-pill-active dark:bg-slate-900 dark:text-white font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {t.label}
                </button>
              ); })}
          </div>
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
          {activeTab === 'market' && ( <div className="space-y-3.5 my-3.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
              <SmartPriceForecastCard selectedHood={selectedHood} hoodName={selectedHood.name} currentBuyPerSqm={selectedHood.buyPerSqm} marketReport={marketReport} compact />
              <NeighborhoodMonthlyBarChart selectedHood={selectedHood} marketReport={marketReport} activeCity={activeCity} compact />
            </div>
          )}
          <React.Suspense fallback={null}>
            {(activeTab === 'scorecard' || activeTab === 'vote') && ( <NeighborhoodPhotoGallery selectedHood={selectedHood} hoodLandmarks={hoodLandmarks} onFocusLandmarkOnMap={onFocusLandmarkOnMap} />
            )}
            <ExpandableComparisonTable
              currentHood={selectedHood} allNeighborhoods={evaluatedNeighborhoods}
              targetSqm={targetSqm} rentAgeMultiplier={rentAgeMultiplier} mode={mode}
              onSelectNeighborhood={onSelectNeighborhood}
            />
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
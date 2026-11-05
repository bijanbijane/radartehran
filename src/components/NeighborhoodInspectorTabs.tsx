import React from 'react'; import { AlertTriangle, Award, Bell, Bookmark, Building2, Calculator, Clock, Compass, MapPin, Mountain, Phone, PlusCircle, ShieldCheck, Sparkles, ThumbsUp, TrainFront, Wifi, Wind, Zap, } from 'lucide-react'; import { BubbleReport, EvaluatedNeighborhood, LocalLandmark, Neighborhood, ResidentVoteDoc, WorkHub, isSponsorActive, toPersianNum, } from '../data/neighborhoods'; import type { NeighborhoodDeepInsight, RentVsBuyVerdict, } from '../data/neighborhoodInsights'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { buildExternalDivarUrl, type FeatureFlags } from '../utils/security'; import { CommuteHubsMatrixCard } from './CommuteHubsMatrixCard'; import { BudgetBridgeAdvisorCard } from './BudgetBridgeAdvisorCard'; import { PurchasingPowerTrendCard } from './PurchasingPowerTrendCard'; import { ViewportLazyRender } from './priceHeatmapAndViewportLazy'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; const NeighborhoodPriceChartLazy = React.lazy(() =>
  import('./NeighborhoodPriceChart').then((m) => ({ default: m.NeighborhoodPriceChart })) ); const HedonicInlineWidget = React.lazy(() => import('./HedonicInlineWidget').then((m) => ({ default: m.HedonicInlineWidget }))
); const NeighborhoodBargainsAndVotesTabs = React.lazy(() => import('./NeighborhoodBargainsAndVotesTabs').then((m) => ({ default: m.NeighborhoodBargainsAndVotesTabs }))
); const ResidentReviewsTabLazy = React.lazy(() => import('./inspector/ResidentReviewsTab').then((m) => ({ default: m.ResidentReviewsTab }))); export type InspectorTabId = 'scorecard' | 'market' | 'bargains' | 'reviews' | 'vote' | 'osm_places'; export interface NeighborhoodInspectorTabsProps { activeTab: InspectorTabId; selectedHood: EvaluatedNeighborhood; activeCity: CityId; mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number; buildingAgeSegment: 'new' | 'mid' | 'older'; workHubId: string; selectedWorkHub: WorkHub; workHubs: WorkHub[]; onSelectWorkHubId: (hubId: string) => void; onChangeTargetSqm: (sqm: number) => void; onChangeBuildingAgeSegment: (seg: 'new' | 'mid' | 'older') => void; useLoanBooster: boolean; onToggleLoanBooster: () => void;
  deductTenantRahnInBuy: boolean; onToggleDeductTenantRahn: () => void; effectiveBuyBudget: number; buyTotalBudget?: number; deposit?: number; monthlyRent?: number; totalRahnEquivalent: number; localAnalysis: { budgetVerdict: string }; directMetroCommuteInfo: { hasDirectLine: boolean; badgeText: string }; deepInsight: NeighborhoodDeepInsight; rentVsBuyVerdict: RentVsBuyVerdict;
  marketReport: BubbleReport; hoodCustomDeposit: number; setHoodCustomDeposit: (v: number) => void; calculatedHoodMonthlyRent: number; setShowHedonicModal: (v: boolean, params?: { sqm?: number; buildYear?: number; renovationStatus?: any; floor?: number }) => void; setTradeUpCurrentHoodId: (id: number) => void; setShowTradeUpModal: (v: boolean) => void; setBargainHoodId: (id: number) => void;
  setAgencyModalTab: (t: 'submit_bargain' | 'reserve_sponsor') => void; setShowAgencyModal: (v: boolean) => void; setAlertHoodId: (id: number) => void; setAlertSubmitMsg: (msg: string) => void; setShowBuyerAlertModal: (v: boolean) => void; featureFlags: FeatureFlags; callingSponsorHoodId: number | null; revealedSponsorPhoneHoodId: number | null; onTrackSponsorCall: (hood: Neighborhood, sponsor: { name: string; phone: string }) => void; setNewVisitAddress: (v: string) => void; setNewVisitPrice: (v: number) => void;
  setShowVisitedModal: (v: boolean) => void; hoodLandmarks: LocalLandmark[]; onFocusLandmarkOnMap: (lm: LocalLandmark) => void; voteAir: number; setVoteAir: (v: number) => void; votePower: number; setVotePower: (v: number) => void;
  voteInternet: number; setVoteInternet: (v: number) => void; voteMetro: number; setVoteMetro: (v: number) => void; voteSecurity: number; setVoteSecurity: (v: number) => void; voteFlat: number; setVoteFlat: (v: number) => void;
  voteComment: string; setVoteComment: (v: string) => void; verifyingGeo: boolean; onResidentVote: (useGeolocation: boolean) => void; voteStatus: { type: 'success' | 'warning' | 'info'; text: string } | null; cloudVotes: ResidentVoteDoc[]; }
export function NeighborhoodInspectorTabs(props: NeighborhoodInspectorTabsProps): React.ReactElement { const { activeTab, selectedHood, activeCity, mode, targetSqm, rentAgeMultiplier, buildingAgeSegment, workHubId, selectedWorkHub, workHubs, onSelectWorkHubId,
    onChangeTargetSqm, onChangeBuildingAgeSegment, useLoanBooster, onToggleLoanBooster, deductTenantRahnInBuy, onToggleDeductTenantRahn, effectiveBuyBudget, buyTotalBudget = effectiveBuyBudget, deposit, monthlyRent, totalRahnEquivalent, localAnalysis, directMetroCommuteInfo, deepInsight, rentVsBuyVerdict, marketReport,
    hoodCustomDeposit, setHoodCustomDeposit, calculatedHoodMonthlyRent, setShowHedonicModal, setTradeUpCurrentHoodId, setShowTradeUpModal, setBargainHoodId, setAgencyModalTab, setShowAgencyModal, setAlertHoodId, setAlertSubmitMsg, setShowBuyerAlertModal,
    featureFlags, callingSponsorHoodId, revealedSponsorPhoneHoodId, onTrackSponsorCall, setNewVisitAddress, setNewVisitPrice, setShowVisitedModal, hoodLandmarks,
    onFocusLandmarkOnMap, voteAir, setVoteAir, votePower, setVotePower, voteInternet, setVoteInternet, voteMetro, setVoteMetro, voteSecurity, setVoteSecurity, voteFlat,
    setVoteFlat, voteComment, setVoteComment, verifyingGeo, onResidentVote, voteStatus, cloudVotes,
  } = props;
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const isEn = radarLocale === 'en';
  const cityNameFa = MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';
  const hoodTotal80mMillions = Math.round(selectedHood.buyPerSqm * 80);
  const monthlyRent80mMillions = Math.max(1, Math.round(selectedHood.rahn80m * 0.03));
  void hoodTotal80mMillions; void monthlyRent80mMillions;
  const scaledFullRahn = Math.max(50, Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeMultiplier));
  const effectiveMonthlyHousingCost = Math.max(calculatedHoodMonthlyRent, Math.round((scaledFullRahn * 0.015) * 10) / 10);
  const minHouseholdIncomeMillion = Math.max(25, Math.round(effectiveMonthlyHousingCost / 0.35));
  const fxTag = (millionVal: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(millionVal, intlCurrency, radarLocale)})` : '');
  if (activeTab === 'scorecard') {
    return (
      <div className="space-y-3.5 text-xs">
        <BudgetBridgeAdvisorCard
          selectedHood={selectedHood} mode={mode} targetSqm={targetSqm}
          onChangeTargetSqm={onChangeTargetSqm} buildingAgeSegment={buildingAgeSegment}
          onChangeBuildingAgeSegment={onChangeBuildingAgeSegment} useLoanBooster={useLoanBooster}
          onToggleLoanBooster={onToggleLoanBooster} deductTenantRahnInBuy={deductTenantRahnInBuy}
          onToggleDeductTenantRahn={onToggleDeductTenantRahn}
          effectiveBuyBudget={effectiveBuyBudget} totalRahnEquivalent={totalRahnEquivalent}
        />
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800 overflow-hidden">
          {[
            { label: isEn ? 'Air Quality & Green Space' : 'کیفیت هوا و فضای سبز', val: selectedHood?.air ?? 7, icon: Wind, badgeBg: '#0f172a' },
            { label: isEn ? 'Power & Water Stability' : 'پایداری برق و فشار آب', val: selectedHood?.powerWater ?? 8, icon: Zap, badgeBg: '#0f172a' },
            { label: isEn ? 'Fiber & Internet Speed' : 'سرعت اینترنت و فیبر نوری', val: selectedHood?.internet ?? 8, icon: Wifi, badgeBg: '#0f172a' },
            { label: isEn ? 'Metro & Transit Access' : 'دسترسی به مترو و حمل‌ونقل', val: selectedHood?.metro ?? 8, icon: TrainFront, badgeBg: '#059669' },
            { label: isEn ? 'Night Security & Quietness' : 'امنیت و آرامش شبانه', val: selectedHood?.security ?? 8, icon: ShieldCheck, badgeBg: '#0f172a' },
            { label: isEn ? 'Flat Terrain (Walkability)' : 'همواری گذرها (بدون شیب)', val: selectedHood?.flatTerrain ?? 8, icon: Mountain, badgeBg: '#0f172a' },
          ].map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <div key={idx} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-800 dark:text-slate-200 flex items-center gap-2.5 font-semibold min-w-0">
                  <span className="ios-squircle-icon" style={{ backgroundColor: item.badgeBg }}>
                    <IconComponent className="w-3.5 h-3.5 stroke-[2]" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1.5 bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300 bg-emerald-600 dark:bg-emerald-500" style={{ width: `${Math.min(100, (item.val || 0) * 10)}%` }} />
                  </div>
                  <span className="font-extrabold text-slate-900 dark:text-white tabular-nums w-9 text-left">{toPersianNum(item.val)}/۱۰</span>
                </div>
              </div>
            );
          })}
        </div>
        <CommuteHubsMatrixCard
          selectedHood={selectedHood} workHubs={workHubs} activeCity={activeCity}
          selectedWorkHubId={workHubId} onSelectWorkHubId={onSelectWorkHubId}
        />
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5 leading-relaxed">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
            <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>الگوی ترافیک ساعتی، فصلی و گلوگاه‌ها (برآورد تحلیلی)</span>
            </span>
            <span className="px-2 py-0.5 rounded-[7px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums shrink-0">
              {toPersianNum(selectedHood?.trafficInfo?.trafficScore ?? 6.5)} / ۱۰
            </span>
          </div>
          <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] px-3 py-2">
            <span className="text-slate-500 dark:text-slate-400">وضعیت معمول ترافیک:</span>
            <strong className="font-bold text-slate-800 dark:text-slate-200">
              {(selectedHood?.trafficInfo?.liveStatus || 'ترافیک نیمه‌سنگین در شریان‌های اصلی').replace(/^[🟢🟡🔴🟠⚪]+\s*/, '')}
            </strong>
          </div>
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-200">ساعات اوج شلوغی متداول: </span>
            <span className="text-slate-600 dark:text-slate-400">{selectedHood?.trafficInfo?.peakHours || 'ساعت ۱۷:۳۰ تا ۲۰:۳۰ شب (پیک مراجعت و خرید شبانه)'}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
            <span className="font-bold text-slate-800 dark:text-slate-200">تحلیل فصلی پاییز و زمستان: </span>
            <span className="text-slate-600 dark:text-slate-400">{selectedHood?.trafficInfo?.seasonalAnalysis || 'در نیمه دوم سال با بازگشایی مدارس و تاریکی زودهنگام ساعت ۱۷، پیک ترافیک عصرگاهی تا ساعت ۲۰:۳۰ امتداد می‌یابد.'}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-1.5">گلوگاه‌های ترافیکی {selectedHood?.name}:</div>
            <div className="flex flex-wrap gap-1.5">
              {String(selectedHood?.trafficInfo?.bottlenecks || 'تقاطع‌ها و میادین اصلی محله')
                .split('،').filter((b) => b && b.trim())
                .map((b: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 rounded-[8px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">{b.trim()}</span>
                ))}
            </div>
          </div>
        </div>
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2 leading-relaxed">
          <div><span className="font-bold text-emerald-700 dark:text-emerald-400">مزایای سکونت در {selectedHood.name}: </span><span className="text-slate-700 dark:text-slate-300">{selectedHood.pros}</span></div>
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800"><span className="font-bold text-rose-600 dark:text-rose-400">چالش‌ها و معایب محله: </span><span className="text-slate-700 dark:text-slate-300">{selectedHood.cons}</span></div>
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">بررسی بودجه شما: </span>{localAnalysis.budgetVerdict}</div>
        </div>
        {workHubId && workHubId !== 'none' && (
          <div className={`p-3 rounded-[12px] border text-xs flex items-center justify-between gap-2 ${directMetroCommuteInfo.hasDirectLine ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' : 'apple-grouped-card dark:bg-slate-900 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}>
            <div className="flex items-center gap-2">
              <TrainFront className={`w-4 h-4 shrink-0 stroke-[1.75] ${directMetroCommuteInfo.hasDirectLine ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              <span className="font-bold">{directMetroCommuteInfo.badgeText}</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium shrink-0 tabular-nums">{selectedHood.distKm != null ? `${toPersianNum(selectedHood.distKm.toFixed(1))} کیلومتر${areaUnit === 'sqft' ? ` (${toPersianNum((selectedHood.distKm * 0.621371).toFixed(1))} mi)` : ''} تا ` : 'تا '}{selectedWorkHub.name}</span>
          </div>
        )}
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2">
            <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5"><Building2 className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>کالبدشکافی خیابان‌ها (Micro-Hoods)</span></span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">ضریب قیمت واقعی</span>
          </div>
          <div className="space-y-2">
            {deepInsight.microHoods.map((tier, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${tier.tier === 'luxury' ? 'text-amber-700 dark:text-amber-400' : tier.tier === 'balanced' ? 'text-slate-900 dark:text-white' : 'text-emerald-700 dark:text-emerald-400'}`}>{tier.label}</span>
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10.5px] font-extrabold tabular-nums">
                    {tier.priceMultiplier > 1 ? `+${toPersianNum(Math.round((tier.priceMultiplier - 1) * 100))}٪` : tier.priceMultiplier < 1 ? `-${toPersianNum(Math.round((1 - tier.priceMultiplier) * 100))}٪` : 'مبنای محله'} · {mode === 'rent' ? `رهن (${formatAreaShort(80, areaUnit)}) ~${toPersianNum(Math.round(selectedHood.rahn80m * tier.priceMultiplier))} م${fxTag(Math.round(selectedHood.rahn80m * tier.priceMultiplier))}` : `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ~${toPersianNum(convertPricePerSqmToUnit(Math.round(selectedHood.buyPerSqm * tier.priceMultiplier), areaUnit))} م${fxTag(convertPricePerSqmToUnit(Math.round(selectedHood.buyPerSqm * tier.priceMultiplier), areaUnit))}`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{tier.streets}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200/70 dark:border-slate-800 pb-2">
            <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 stroke-[1.75] text-amber-600" /><span>تله‌های پنهان و واقعیت‌های میدانی</span></span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[10.5px] font-bold tabular-nums">پارک شبانه: {toPersianNum(deepInsight.nightParkingScore)} / ۱۰</span>
              <span className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-bold ${deepInsight.winterSnowRisk === 'HIGH' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800' : deepInsight.winterSnowRisk === 'MEDIUM' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'}`}>
                {deepInsight.winterSnowRisk === 'HIGH' ? '❄️ شیب تند و برف‌گیر در زمستان' : deepInsight.winterSnowRisk === 'MEDIUM' ? '🌨️ شیب ملایم در روزهای برفی' : '☀️ معابر هموار بدون ریسک یخبندان'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {deepInsight.vibeTags.map((v, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-medium">{v}</span>
            ))}
          </div>
          <div className="space-y-1.5 text-slate-700 dark:text-slate-300 text-[11.5px] pt-1">
            {deepInsight.hiddenTraps.map((trap, idx) => (
              <div key={idx} className="flex items-start gap-1.5 leading-relaxed"><span className="text-amber-500 mt-0.5 shrink-0">⚠️</span><span>{trap}</span></div>
            ))}
          </div>
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
            <span>هزینه زندگی: <strong>{deepInsight.costOfLivingLevel}</strong></span>
            <span>شارژ ماهانه: <strong>~{toPersianNum(deepInsight.monthlyChargeEstimateThousand)} هزار تومان{fxTag(deepInsight.monthlyChargeEstimateThousand / 1000)}</strong></span>
          </div>
        </div>
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5"><Sparkles className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>تصمیم ملکی: بخرم یا اجاره کنم؟</span></span>
            <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 tabular-nums">P/R: {toPersianNum(rentVsBuyVerdict.prRatio)} سال</span>
          </div>
          <div className="text-xs font-bold text-slate-900 dark:text-white">{rentVsBuyVerdict.title}</div>
          <p className="text-[11.5px] text-slate-700 dark:text-slate-300 leading-relaxed">{rentVsBuyVerdict.explanation}</p>
          <div className="grid grid-cols-2 gap-2 bg-white/85 dark:bg-slate-900/90 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl p-2 text-[10.5px]">
            <div><span className="text-slate-500 dark:text-slate-400 block">ثروت ۳ ساله با خرید ملک:</span><strong className="text-emerald-800 dark:text-emerald-400 font-black tabular-nums">{toPersianNum(rentVsBuyVerdict.buy3YrWealthBillion)} میلیارد تومان{fxTag(rentVsBuyVerdict.buy3YrWealthBillion * 1000)}</strong></div>
            <div className="border-r border-emerald-200/60 dark:border-emerald-800 pr-2"><span className="text-slate-500 dark:text-slate-400 block">ثروت ۳ ساله رهن + سرمایه‌گذاری:</span><strong className="text-amber-700 dark:text-amber-400 font-black tabular-nums">{toPersianNum(rentVsBuyVerdict.rentInvest3YrWealthBillion)} میلیارد تومان{fxTag(rentVsBuyVerdict.rentInvest3YrWealthBillion * 1000)}</strong></div>
          </div>
          <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between text-[10.5px] text-emerald-800 dark:text-emerald-300">
            <span>بازدهی اجاره: <strong>{toPersianNum(rentVsBuyVerdict.annualRentYieldPercent)}٪</strong></span>
            <button type="button" onClick={() => { setTradeUpCurrentHoodId(selectedHood.id); setShowTradeUpModal(true); }} className="font-bold underline hover:text-emerald-950 dark:hover:text-emerald-200 cursor-pointer">محاسبه معاوضه ملک فعلی ←</button>
          </div>
        </div>
      </div>
    );
  }
  if (activeTab === 'market') {
    const agg = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, (selectedHood.bargains || []).map((b) => ({ id: b.id, askingTotalMillion: Math.round(b.sqm * selectedHood.buyPerSqm * (1 - (b.discountPercent || 10) / 100)), description: `${b.sqm} متر ${b.title}` })));
    const regimeNote = agg.marketRegime === 'HOT' ? 'بازار داغ - فروشندگان حداکثر ۲.۵٪ تخفیف می‌دهند' : agg.marketRegime === 'BALANCED' ? 'بازار متعادل - میانگین ۷٪ تخفیف پای معامله' : 'رکود نسبی - حدود ۱۰٪ تخفیف پای قولنامه';
    return (
      <div className="space-y-3.5 text-xs">
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] p-2.5 tabular-nums">
            <div>
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">میانه قیمت تابلو (معادل ۵ سال ساخت)</div>
              <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{toPersianNum(convertPricePerSqmToUnit(agg.askingPricePerSqm, areaUnit))} میلیون تومان/{areaUnit === 'sqft' ? 'ft²' : 'متر'}{fxTag(convertPricePerSqmToUnit(agg.askingPricePerSqm, areaUnit))}</div>
            </div>
            <div className="border-r border-slate-200/70 dark:border-slate-800 pr-2">
              <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-bold">تخمین قیمت قطعی پای معامله</div>
              <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{toPersianNum(convertPricePerSqmToUnit(agg.estimatedDealPricePerSqm, areaUnit))} میلیون تومان/{areaUnit === 'sqft' ? 'ft²' : 'متر'}{fxTag(convertPricePerSqmToUnit(agg.estimatedDealPricePerSqm, areaUnit))}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800 rounded-[9px] px-2.5 py-1.5 text-[11px]">
            <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">بازه منطقی محله: {toPersianNum(convertPricePerSqmToUnit(agg.iqrLowPerSqm, areaUnit))} تا {toPersianNum(convertPricePerSqmToUnit(agg.iqrHighPerSqm, areaUnit))} میلیون/{areaUnit === 'sqft' ? 'ft²' : 'متر'}{fxTag(convertPricePerSqmToUnit(agg.iqrLowPerSqm, areaUnit))}</span>
            <span className="text-emerald-800 dark:text-emerald-300 font-semibold">{regimeNote}</span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-slate-500 dark:text-slate-400 font-medium">وضعیت حباب یا جاماندگی:</span>
            <span className={`font-extrabold text-xs px-2.5 py-1 rounded-[8px] ${marketReport.status === 'undervalued' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : marketReport.status === 'balanced' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'}`}>
              {marketReport.badgeText.replace(/^[💎⚖️🔥]+\s*/, '')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] p-2.5 tabular-nums">
            <div><div className="text-[11px] text-slate-500 dark:text-slate-400">رشد ۶ ماهه</div><div className="font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 text-sm">+{toPersianNum(marketReport.hoodGrowth6mPercent)}٪</div></div>
            <div className="border-x border-slate-200/60 dark:border-slate-800"><div className="text-[11px] text-slate-500 dark:text-slate-400">میانگین {cityNameFa}</div><div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 text-sm">+{toPersianNum(marketReport.tehranGrowth6mPercent)}٪</div></div>
            <div><div className="text-[11px] text-slate-500 dark:text-slate-400">نسبت P/R</div><div className="font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 text-sm">{toPersianNum(marketReport.prRatio)} سال</div></div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{marketReport.summary} · ارزش معیار واحد {formatAreaShort(targetSqm, areaUnit)}: <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{toPersianNum(Math.round((selectedHood.buyPerSqm * targetSqm) / 100) / 10)} میلیارد تومان{fxTag(selectedHood.buyPerSqm * targetSqm)}</strong></p>
        </div>
        <PurchasingPowerTrendCard selectedHood={selectedHood} marketReport={marketReport} effectiveBuyBudget={effectiveBuyBudget} />
        <ViewportLazyRender minHeightPx={190}>
          <React.Suspense fallback={<div className="h-44 rounded-[12px] bg-slate-100/80 dark:bg-slate-800/80 animate-pulse" />}>
            <NeighborhoodPriceChartLazy selectedHood={selectedHood} marketReport={marketReport} activeCity={activeCity} />
          </React.Suspense>
        </ViewportLazyRender>
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><Calculator className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>ماشین‌حساب تبدیل رهن و اجاره ({formatAreaShort(targetSqm, areaUnit)})</span></span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">رهن کامل: {toPersianNum(scaledFullRahn)} م{fxTag(scaledFullRahn)}</span>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-600 dark:text-slate-400">ودیعه انتخابی:</span>
              <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(Math.min(hoodCustomDeposit, scaledFullRahn))} میلیون تومان{fxTag(Math.min(hoodCustomDeposit, scaledFullRahn))}</strong>
            </div>
            <input type="range" min={50} max={scaledFullRahn} step={25} value={Math.min(hoodCustomDeposit, scaledFullRahn)} onChange={(e) => setHoodCustomDeposit(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] p-2.5 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">اجاره ماهانه واحد {formatAreaShort(targetSqm, areaUnit)}:</span>
            <div className="text-left shrink-0">
              {calculatedHoodMonthlyRent === 0 ? <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">رهن کامل (بدون اجاره)</span> : <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">ماهی {toPersianNum(calculatedHoodMonthlyRent)} میلیون تومان{fxTag(calculatedHoodMonthlyRent)}</div>}
            </div>
          </div>
          <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 rounded-[10px] p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-emerald-900 dark:text-emerald-200 font-semibold">حداقل درآمد ماهانه پیشنهادی خانوار برای سکونت در این محله:</span>
            <strong className="text-emerald-800 dark:text-emerald-300 font-black tabular-nums shrink-0">{toPersianNum(minHouseholdIncomeMillion)} میلیون تومان{fxTag(minHouseholdIncomeMillion)}</strong>
          </div>
        </div>
        <React.Suspense fallback={null}>{/* ماشین‌حساب هوشمند قیمت‌گذاری ملک (Hedonic) */}
          <HedonicInlineWidget neighborhood={selectedHood} defaultSqm={targetSqm} buildingAgeSegment={buildingAgeSegment} onOpenFullModal={(params) => setShowHedonicModal(true, params)} />
        </React.Suspense>
      </div>
    );
  }
  if (activeTab === 'reviews') {
    return (
      <React.Suspense fallback={<div className="apple-grouped-card p-4 text-center text-xs text-slate-400">در حال بارگذاری نظرات ساکنان...</div>}>
        <ResidentReviewsTabLazy
          selectedHood={selectedHood} voteAir={voteAir} setVoteAir={setVoteAir} votePower={votePower} setVotePower={setVotePower}
          voteInternet={voteInternet} setVoteInternet={setVoteInternet} voteMetro={voteMetro} setVoteMetro={setVoteMetro}
          voteSecurity={voteSecurity} setVoteSecurity={setVoteSecurity} voteFlat={voteFlat} setVoteFlat={setVoteFlat}
          voteComment={voteComment} setVoteComment={setVoteComment} verifyingGeo={verifyingGeo}
          onResidentVote={onResidentVote} voteStatus={voteStatus} cloudVotes={cloudVotes}
        />
      </React.Suspense>
    );
  }
  return (
    <React.Suspense fallback={<div className="apple-grouped-card p-4 text-center text-xs text-slate-400">در حال بارگذاری تب...</div>}>
      <NeighborhoodBargainsAndVotesTabs
        activeTab={activeTab === 'bargains' ? 'bargains' : 'vote'} selectedHood={selectedHood} activeCity={activeCity} mode={mode} targetSqm={targetSqm} buyTotalBudget={buyTotalBudget} deposit={deposit} monthlyRent={monthlyRent} featureFlags={featureFlags}
        setBargainHoodId={setBargainHoodId} setAgencyModalTab={setAgencyModalTab} setShowAgencyModal={setShowAgencyModal} setAlertHoodId={setAlertHoodId} setAlertSubmitMsg={setAlertSubmitMsg} setShowBuyerAlertModal={setShowBuyerAlertModal}
        callingSponsorHoodId={callingSponsorHoodId} revealedSponsorPhoneHoodId={revealedSponsorPhoneHoodId} onTrackSponsorCall={onTrackSponsorCall} setNewVisitAddress={setNewVisitAddress} setNewVisitPrice={setNewVisitPrice} setShowVisitedModal={setShowVisitedModal}
        hoodLandmarks={hoodLandmarks} onFocusLandmarkOnMap={onFocusLandmarkOnMap} voteAir={voteAir} setVoteAir={setVoteAir} votePower={votePower} setVotePower={setVotePower} voteInternet={voteInternet} setVoteInternet={setVoteInternet} voteMetro={voteMetro} setVoteMetro={setVoteMetro}
        voteSecurity={voteSecurity} setVoteSecurity={setVoteSecurity} voteFlat={voteFlat} setVoteFlat={setVoteFlat} voteComment={voteComment} setVoteComment={setVoteComment} verifyingGeo={verifyingGeo} onResidentVote={onResidentVote} voteStatus={voteStatus} cloudVotes={cloudVotes.filter((v) => v.hoodId === selectedHood.id)}
      />
    </React.Suspense>
  );
}
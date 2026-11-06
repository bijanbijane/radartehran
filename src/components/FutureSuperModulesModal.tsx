/**
 * @file src/components/FutureSuperModulesModal.tsx
 * @description جعبه ابزار جامع ابرماژول‌های ۵۲گانه پراپ‌تک مسکن (فاز ۳ تا ۱۲): * ۱۰ تب فوق‌پیشرفته و کاربردی برای بازار مسکن ایران همراه با ماشین‌حساب‌های اختصاصی.
 */

import React, { useState, useMemo, useEffect } from 'react'; import { ArrowLeftRight, Building2, Calculator, ClipboardCheck, FileCheck, GraduationCap, Hammer, Scale, ShieldAlert, Sparkles, X,
} from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import type { FeatureFlags } from '../types/models';
import { DeedType, ParkingType, GOLD_18K_TOMAN_PRICE, USD_TOMAN_PRICE, calculateDetailedValuation, } from '../data/superModulesLogic'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { useDialogFocus } from './useDialogFocus'; import { SuperModulesValuationAndFakeTabs } from './SuperModulesValuationAndFakeTabs'; import { SuperModulesLegalAndBuildingTabs } from './SuperModulesLegalAndBuildingTabs'; import { SuperModulesSwapAndStudioTabs } from './SuperModulesSwapAndStudioTabs';

export type SuperModuleTabId = | 'valuation'
  | 'fake_detector'
  | 'mortgage'
  | 'tax_inheritance'
  | 'tenant_rights'
  | 'municipality'
  | 'swap_suburb'
  | 'visit_checklist'
  | 'school_traffic'
  | 'realtor_studio';

export interface FutureSuperModulesModalProps { open: boolean; onClose: () => void; initialTab?: SuperModuleTabId;
  selectedHood: EvaluatedNeighborhood; neighborhoods: EvaluatedNeighborhood[]; activeCity: CityId; featureFlags: FeatureFlags;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void; onApplyCombinedBudget?: (totalBudgetMillion: number, targetSqm: number, enableTenantRahn?: boolean) => void; onQuickSubmitBargain?: (params: {
    hoodId: number; sqm: number;
    proposedPricePerSqm: number; title: string;
  }) => void;
}

export const VISITED_APARTMENTS_STORAGE_KEY = 'tehran_radar_visited_homes_v1';

export function FutureSuperModulesModal(props: FutureSuperModulesModalProps) {
  const { open, onClose, initialTab = 'valuation', selectedHood, neighborhoods, activeCity, featureFlags, onSelectNeighborhood, onApplyCombinedBudget } = props;

  const dialogRef = useDialogFocus(open, onClose); const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale();
  const [activeTab, setActiveTab] = useState<SuperModuleTabId>(initialTab);
  const [hoodId, setHoodId] = useState<number>(selectedHood.id);

  useEffect(() => {
    if (selectedHood?.id) {
      setHoodId(selectedHood.id);
    }
  }, [selectedHood?.id]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const activeHood = useMemo(() => {
    return neighborhoods.find((n) => n.id === hoodId) || selectedHood || neighborhoods[0];
  }, [neighborhoods, hoodId, selectedHood]);

  const allTabs: { id: SuperModuleTabId; label: string; icon: React.ElementType }[] = useMemo(() => [
    { id: 'valuation', label: '💎 کارشناسی ارزش، قدرالسهم و طلا', icon: Calculator },
    { id: 'fake_detector', label: '🕵️ مچ‌گیر آگهی، چانه‌زنی و مزایده', icon: ShieldAlert },
    { id: 'mortgage', label: '🏦 خرید با رهن، وام و آربیتراژ طلا', icon: Building2 },
    { id: 'tax_inheritance', label: '🏛️ مالیات، تقسیم ارث و مهریه‌یار', icon: Scale },
    { id: 'tenant_rights', label: '⚖️ داور موجر/مستأجر، مدیر و ثنا', icon: FileCheck },
    { id: 'municipality', label: '🔨 شهرداری، موقعیت اداری و لابی', icon: Hammer },
    { id: 'swap_suburb', label: '🔄 تهاتر، چیتگر و مهاجرت کلانشهر', icon: ArrowLeftRight },
    { id: 'visit_checklist', label: '📋 چک‌لیست بازدید، آب و نویز', icon: ClipboardCheck },
    { id: 'school_traffic', label: '🎓 مدارس، مترو آینده و گسل', icon: GraduationCap },
    { id: 'realtor_studio', label: '✨ استودیو املاک، اسباب‌کشی و سئو', icon: Sparkles },
  ], []);

  const availableTabs = useMemo(() => {
    return allTabs.filter((tab) => {
      if (tab.id === 'valuation' && featureFlags.enableAiValuation === false) return false;
      if (tab.id === 'fake_detector' && featureFlags.enableFakeAdDetector === false) return false;
      if (tab.id === 'mortgage' && featureFlags.enableMortgageSimulator === false) return false;
      if (tab.id === 'tax_inheritance' && featureFlags.enableTenantRights === false) return false;
      if (tab.id === 'tenant_rights' && featureFlags.enableTenantRights === false) return false;
      if (tab.id === 'municipality' && featureFlags.enableMunicipalityCalc === false) return false;
      if (tab.id === 'swap_suburb' && featureFlags.enablePropertySwap === false) return false;
      if (tab.id === 'visit_checklist' && featureFlags.enableVisitChecklist === false) return false;
      if (tab.id === 'school_traffic' && featureFlags.enableSchoolRadar === false) return false;
      if (tab.id === 'realtor_studio' && featureFlags.enableRealtorStudio === false) return false;
      return true;
    });
  }, [allTabs, featureFlags]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // Shared property parameters used across valuation, inheritance, building bill, and studio
  const [valSqm, setValSqm] = useState<number>(85);
  const [valAge, setValAge] = useState<number>(4);
  const [valFloor, setValFloor] = useState<number>(3);
  const [valBedrooms, setValBedrooms] = useState<number>(2);
  const [valDeedType, setValDeedType] = useState<DeedType>('single_deed');
  const [valParkingType, setValParkingType] = useState<ParkingType>('dedicated');
  const [valHasElevator, setValHasElevator] = useState<boolean>(true);
  const [valHasStorage, setValHasStorage] = useState<boolean>(true);
  const [valRenovation, setValRenovation] = useState<'renovated' | 'standard' | 'needs_work'>('standard');
  const [valLight, setValLight] = useState<'south' | 'normal' | 'dim'>('south');
  const [gold18kPriceToman, setGold18kPriceToman] = useState<number>(GOLD_18K_TOMAN_PRICE);
  const [usdPriceToman, setUsdPriceToman] = useState<number>(USD_TOMAN_PRICE);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/market-pulse?city=${encodeURIComponent(activeCity)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.liveMacroRates?.gold18kToman) setGold18kPriceToman(d.liveMacroRates.gold18kToman);
        if (d?.liveMacroRates?.usdToman) setUsdPriceToman(d.liveMacroRates.usdToman);
      })
      .catch(() => {});
  }, [open, activeCity]);

  const valuationResult = useMemo(() => {
    return calculateDetailedValuation({
      hood: activeHood, sqm: valSqm, age: valAge, floor: valFloor, bedrooms: valBedrooms,
      deedType: valDeedType, parkingType: valParkingType, hasElevator: valHasElevator,
      hasStorage: valHasStorage, renovation: valRenovation, light: valLight,
      gold18kTomanPrice: gold18kPriceToman, usdTomanPrice: usdPriceToman,
    });
  }, [activeHood, valSqm, valAge, valFloor, valBedrooms, valDeedType, valParkingType, valHasElevator, valHasStorage, valRenovation, valLight, gold18kPriceToman, usdPriceToman]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="ابرماژول‌ها و جعبه ابزار جامع مسکن" onClick={onClose} className="fixed inset-0 bg-black/30 backdrop-blur-[3px] flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet dark:bg-slate-900 dark:border-slate-700/80 max-w-5xl w-full p-4 sm:p-6 max-h-[94vh] flex flex-col overflow-hidden text-xs focus:outline-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-700/70 pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 stroke-[1.75]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                  جعبه ابزار جامع ۵۲گانه پراپ‌تک مسکن (رادار {MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران'})
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                  نسخه جامع سازمانی
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                کارشناسی واحد {formatAreaValue(valSqm, areaUnit, true)}: {toPersianNum((valuationResult.fairTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fairTotalMillion, intlCurrency, locale)})` : ''} · رهن: {toPersianNum(valuationResult.fullRahnMillion)} م (اجاره: {toPersianNum(Math.round(valuationResult.fullRahnMillion * 0.03))} م/ماه)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hidden sm:inline">محله فعال:</label>
            <select
              aria-label="انتخاب محله فعال در ابرماژول‌ها"
              value={activeHood.id}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setHoodId(nextId);
                const found = neighborhoods.find((n) => n.id === nextId);
                if (found && onSelectNeighborhood) {
                  onSelectNeighborhood(found);
                }
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-[10px] px-2.5 py-1.5 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              {neighborhoods.map((n) => { const unitPrice = convertPricePerSqmToUnit(n.buyPerSqm, areaUnit); const uDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit); return (
                  <option key={n.id} value={n.id}>{n.name} ({formatAreaUnitLabel(areaUnit)}: {toPersianNum(unitPrice)} م · معامله: {toPersianNum(uDeal)} م · کل {formatAreaValue(80, areaUnit, true)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(n.buyPerSqm * 80, intlCurrency, locale)}` : ''})</option>
                ); })}
            </select>

            <button type="button" aria-label="بستن پنجره ابرماژول‌ها" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors"><X className="w-4 h-4 stroke-[2]" /></button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="تب‌های ابرماژول‌های مسکن"
          className="flex items-center gap-1 overflow-x-auto p-1 mb-3 apple-segmented rounded-[11px] shrink-0 no-scrollbar"
        >
          {availableTabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id} role="tab" aria-selected={isSelected} type="button" onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-[8px] font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected ? 'apple-segmented-pill-active text-slate-900 dark:text-slate-100 font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {(activeTab === 'valuation' || activeTab === 'fake_detector' || activeTab === 'mortgage') && (
            <SuperModulesValuationAndFakeTabs
              activeTab={activeTab}
              activeHood={activeHood}
              valSqm={valSqm}
              setValSqm={setValSqm}
              valBedrooms={valBedrooms}
              setValBedrooms={setValBedrooms}
              valuationResult={valuationResult}
              valAge={valAge}
              setValAge={setValAge}
              valFloor={valFloor}
              setValFloor={setValFloor}
              valDeedType={valDeedType}
              setValDeedType={setValDeedType}
              valParkingType={valParkingType}
              setValParkingType={setValParkingType}
              valHasElevator={valHasElevator}
              setValHasElevator={setValHasElevator}
              valHasStorage={valHasStorage}
              setValHasStorage={setValHasStorage}
              valRenovation={valRenovation}
              setValRenovation={setValRenovation}
              valLight={valLight}
              setValLight={setValLight}
              gold18kPriceToman={gold18kPriceToman}
              setGold18kPriceToman={setGold18kPriceToman}
              usdPriceToman={usdPriceToman}
              setUsdPriceToman={setUsdPriceToman}
              onApplyCombinedBudget={
                onApplyCombinedBudget
                  ? (totalBudgetMillion, sqm) => {
                      onApplyCombinedBudget(totalBudgetMillion, sqm);
                      onClose();
                    }
                  : undefined
              }
            />
          )}

          {(activeTab === 'tax_inheritance' || activeTab === 'tenant_rights' || activeTab === 'municipality') && (
            <SuperModulesLegalAndBuildingTabs
              activeTab={activeTab}
              activeHood={activeHood}
              activeCity={activeCity}
              valSqm={valSqm}
              fairTotalMillion={valuationResult.fairTotalMillion}
            />
          )}
          {(activeTab === 'swap_suburb' || activeTab === 'visit_checklist' || activeTab === 'school_traffic' || activeTab === 'realtor_studio') && (
            <SuperModulesSwapAndStudioTabs
              activeTab={activeTab}
              activeHood={activeHood}
              valSqm={valSqm}
              valBedrooms={valBedrooms}
              fairPerSqm={valuationResult.fairPerSqm}
              fairTotalMillion={valuationResult.fairTotalMillion}
              fullRahnMillion={valuationResult.fullRahnMillion}
            />
          )}
        </div>
      </div>
    </div>
  );
}
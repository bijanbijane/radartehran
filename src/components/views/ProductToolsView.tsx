import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calculator, Compass, ChevronRight, ArrowUpRight, FileCheck, Search, Sparkles, X,
} from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import type { FeatureFlags } from '../../types/models';
import type { ExpansionModalType } from '../ExpansionModulesModal';
import type { SuperModuleTabId } from '../FutureSuperModulesModal';
import { convertPricePerSqmToUnit, convertPricePerSqmToUnitRaw, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useExperienceMode, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { matchesPersianSearch } from '../../utils/security';
import { Stage2MasterWidget, type Stage2ActiveTab } from '../stage2/Stage2MasterWidget';
import type { ToolsSubTabId } from '../../navigation/registry/route.types';
import {
  buildToolCategoriesForHood,
  calculateContractInitialTotalMillion,
  computeToolCategoryCounts,
  isRadarUiLabAvailable,
  sanitizeContractTargetSqm,
  type ToolDispatchTarget,
} from '../../features/tools/services/toolsCatalogEngine';

const InstantListingVerifierModal = React.lazy(() => import('../modals/InstantListingVerifierModal').then((m) => ({ default: m.InstantListingVerifierModal })));
const ContractRoomShieldModal = React.lazy(() => import('../modals/ContractRoomShieldModal').then((m) => ({ default: m.ContractRoomShieldModal })));
const RadarUiLabPanel = React.lazy(() => import('./RadarUiLabPanel').then((m) => ({ default: m.RadarUiLabPanel })));
const ValuationWorkspacePage = React.lazy(() => import('../../features/valuation/pages/ValuationWorkspacePage').then((m) => ({ default: m.ValuationWorkspacePage })));

export interface ProductToolsViewProps {
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonic: () => void;
  onOpenSuperModule: (tab: SuperModuleTabId) => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenReverseBudget: () => void;
  onOpenCompare: () => void;
  featureFlags: FeatureFlags;
  activeCity?: string;
  targetSqm?: number;
  activeSubTab?: ToolsSubTabId;
  isDevEnvironment?: boolean;
}

export function ProductToolsView(p: ProductToolsViewProps): React.ReactElement {
  const {
    selectedHood, onSelectNeighborhood, onOpenInspector, onOpenHedonic,
    onOpenSuperModule, onOpenExpansionModal, onOpenReverseBudget, onOpenCompare,
    evaluatedNeighborhoods, activeCity, targetSqm, activeSubTab, isDevEnvironment,
  } = p;
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale(), [experienceMode] = useExperienceMode();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const canAccessUiLab = isRadarUiLabAvailable(isDevEnvironment);
  const safeTargetSqm = sanitizeContractTargetSqm(targetSqm);
  const initialContractTotalMillion = calculateContractInitialTotalMillion(selectedHood?.buyPerSqm, safeTargetSqm);
  const [toolQuery, setToolQuery] = useState<string>('');
  const [activeCat, setActiveCat] = useState<'all' | 'financial' | 'legal' | 'urban' | 'decision'>('all');
  const [showEmbeddedLab, setShowEmbeddedLab] = useState<boolean>(false), [showUiLab, setShowUiLab] = useState<boolean>(false);
  const [showValuationWorkspace, setShowValuationWorkspace] = useState<boolean>(activeSubTab === 'valuation');
  const [activeDecisionTab, setActiveDecisionTab] = useState<Stage2ActiveTab>('DECISION_SYNTHESIS');
  const [showVerifierModal, setShowVerifierModal] = useState<boolean>(false), [showContractShieldModal, setShowContractShieldModal] = useState<boolean>(false);

  useEffect(() => {
    if (activeSubTab === 'valuation') { setActiveCat('financial'); setShowValuationWorkspace(true); }
    else if (activeSubTab === 'calculators') setActiveCat('financial');
    else if (activeSubTab === 'compare_props' || activeSubTab === 'compare_areas') setActiveCat('decision');
    else setActiveCat('all');
  }, [activeSubTab]);

  const openDecisionTool = useCallback((tabId: Stage2ActiveTab) => {
    setActiveDecisionTab(tabId);
    setShowEmbeddedLab(true);
  }, []);

  const dispatchTarget = useCallback((target: ToolDispatchTarget) => {
    switch (target.kind) {
      case 'decision': openDecisionTool(target.tab); break;
      case 'verifier': setShowVerifierModal(true); break;
      case 'contract_shield': setShowContractShieldModal(true); break;
      case 'hedonic': onOpenHedonic(); break;
      case 'reverse_budget': onOpenReverseBudget(); break;
      case 'compare': onOpenCompare(); break;
      case 'expansion': onOpenExpansionModal(target.modal); break;
      case 'super': onOpenSuperModule(target.tab); break;
    }
  }, [openDecisionTool, onOpenHedonic, onOpenReverseBudget, onOpenCompare, onOpenExpansionModal, onOpenSuperModule]);

  const dealSqm = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm;
  const unitBuy = convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), unitDeal = convertPricePerSqmToUnit(dealSqm, areaUnit);
  const unitBuyRaw = convertPricePerSqmToUnitRaw(selectedHood.buyPerSqm, areaUnit), unitDealRaw = convertPricePerSqmToUnitRaw(dealSqm, areaUnit);
  const areaSuffix = formatAreaUnitLabel(areaUnit);
  const buyText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(unitBuyRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${areaSuffix}` : `${toPersianNum(unitBuy)} میلیون تومان / ${areaSuffix}`;
  const dealText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(unitDealRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${areaSuffix}` : `${toPersianNum(unitDeal)} میلیون تومان / ${areaSuffix}`;

  const toolCategories = useMemo(
    () => buildToolCategoriesForHood({ isEn, hoodName: selectedHood.name }),
    [isEn, selectedHood.name],
  );
  const toolCounts = useMemo(() => computeToolCategoryCounts(toolCategories), [toolCategories]);
  const targetByToolId = useMemo(() => {
    const map = new Map<string, ToolDispatchTarget>();
    for (const cat of toolCategories) for (const item of cat.items) map.set(item.id, item.target);
    return map;
  }, [toolCategories]);
  const dispatchToolAction = useCallback((toolId: string) => {
    const target = targetByToolId.get(toolId);
    if (target) dispatchTarget(target);
  }, [targetByToolId, dispatchTarget]);

  const filteredCategories = useMemo(() => {
    const q = toolQuery.trim();
    const ordered = experienceMode === 'simple' && activeCat === 'all'
      ? [...toolCategories.filter((c) => c.id !== 'decision'), ...toolCategories.filter((c) => c.id === 'decision')]
      : toolCategories;
    return ordered
      .filter((c) => activeCat === 'all' || c.id === activeCat)
      .map((c) => ({
        ...c,
        items: q ? c.items.filter((it) => matchesPersianSearch(it.title, q) || matchesPersianSearch(it.desc, q)) : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [toolCategories, activeCat, toolQuery, experienceMode]);

  const fmtCount = (n: number) => (isEn ? n.toLocaleString('en-US') : toPersianNum(n));
  const categoryTabs = useMemo(() => [
    { id: 'all' as const, label: isEn ? `All (${fmtCount(toolCounts.total)})` : `همه ابزارها (${fmtCount(toolCounts.total)})` },
    { id: 'financial' as const, label: isEn ? `Financial (${fmtCount(toolCounts.byCategory.financial)})` : `مالی و قیمت (${fmtCount(toolCounts.byCategory.financial)})` },
    { id: 'legal' as const, label: isEn ? `Legal (${fmtCount(toolCounts.byCategory.legal)})` : `حقوقی و بازدید (${fmtCount(toolCounts.byCategory.legal)})` },
    { id: 'decision' as const, label: isEn ? `Deal & Risk Lab (${fmtCount(toolCounts.byCategory.decision)})` : `تصمیم‌یار و چانه‌زنی (${fmtCount(toolCounts.byCategory.decision)})` },
    { id: 'urban' as const, label: isEn ? `Urban & Swap (${fmtCount(toolCounts.byCategory.urban)})` : `ساخت و تهاتر (${fmtCount(toolCounts.byCategory.urban)})` },
  ], [isEn, toolCounts]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-tools-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
            {isEn ? 'Technical & Legal Calculators · Connected to Live Map' : 'محاسبات فنی و حقوقی · متصل به نقشه زنده'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEn ? 'Real Estate Transaction Toolkit' : 'جعبه‌ابزار هوشمند معاملات مسکن'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1" data-testid="tools-total-summary">
            {isEn
              ? `${fmtCount(toolCounts.total)} analytical, financial, negotiation & legal tools across ${fmtCount(toolCategories.length)} categories`
              : `مجموعه ${fmtCount(toolCounts.total)} ابزار کارشناسی قیمت، شبیه‌ساز مالی، راهنمای چانه‌زنی و بررسی حقوقی معاملات ملک در ${fmtCount(toolCategories.length)} گام`}
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2 min-w-[260px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">محله هدف محاسبات (قابل تغییر از نقشه):</span>
            {onOpenInspector && (
              <button type="button" onClick={() => onOpenInspector(selectedHood)} className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-0.5 cursor-pointer">
                <span>کارنامه</span><ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {evaluatedNeighborhoods && onSelectNeighborhood ? (
            <select aria-label="انتخاب محله هدف محاسبات" value={selectedHood.id} onChange={(e) => { const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value)); if (found) onSelectNeighborhood(found); }} className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-black text-slate-900 dark:text-white text-xs focus:outline-none cursor-pointer">
              {evaluatedNeighborhoods.map((h) => (<option key={h.id} value={h.id}>محله {h.name} {h.zone ? `· ${h.zone}` : ''}</option>))}
            </select>
          ) : (
            <strong className="font-black text-emerald-700 dark:text-emerald-300 block">محله {selectedHood.name} {selectedHood.zone ? `· ${selectedHood.zone}` : ''}</strong>
          )}
          <div className="flex items-center justify-between text-[11px] tabular-nums pt-0.5 gap-2">
            <span className="text-slate-600 dark:text-slate-300">اعلامی: <strong>{buyText}</strong> · سناریو v6.4 (غیرثبتی): <strong className="text-emerald-700 dark:text-emerald-400">{dealText}</strong></span>
            <button type="button" onClick={onOpenCompare} className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0">مقایسه دو محله</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button type="button" onClick={onOpenReverseBudget} className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 text-right hover:border-emerald-500 transition cursor-pointer flex items-center justify-between">
          <div><div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400">گام ۱ · کشف و تطبیق بودجه</div><div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5">با بودجه من کجا خانه بخرم؟</div></div>
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
        </button>
        <button type="button" onClick={onOpenHedonic} className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/70 text-right hover:border-sky-500 transition cursor-pointer flex items-center justify-between">
          <div><div className="text-[10px] font-black text-sky-700 dark:text-sky-400">گام ۲ · کارشناسی قیمت منصفانه</div><div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5">محاسبه قیمت واقعی ملک هدف</div></div>
          <Calculator className="w-4 h-4 text-sky-600 shrink-0" />
        </button>
        <button type="button" onClick={() => onOpenExpansionModal('contract')} className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 text-right hover:border-amber-500 transition cursor-pointer flex items-center justify-between">
          <div><div className="text-[10px] font-black text-amber-700 dark:text-amber-400">گام ۳ · امنیت حقوقی پیش از امضا</div><div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5">چک‌لیست قولنامه و کمیسیون</div></div>
          <FileCheck className="w-4 h-4 text-amber-600 shrink-0" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" aria-label={isEn ? 'Search calculators' : 'جستجوی سریع ابزار'} value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder={isEn ? 'Search calculators (e.g. mortgage, tax, commission, R122)...' : 'جستجوی سریع ابزار (مثلاً: وام، مالیات، کمیسیون، قولنامه، R122)...'} className="w-full pr-9 pl-7 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600" />
          {toolQuery && <button type="button" aria-label="پاک کردن جستجوی ابزار" onClick={() => setToolQuery('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {categoryTabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveCat(tab.id)} className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${activeCat === tab.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{tab.label}</button>
          ))}
          <button type="button" data-testid="toggle-valuation-workspace-btn" onClick={() => setShowValuationWorkspace((v) => !v)} className={`px-3 py-1.5 rounded-[8px] font-bold whitespace-nowrap transition cursor-pointer border ${showValuationWorkspace ? 'bg-[#176B63] text-white border-transparent' : 'border-[#DCE3DF] dark:border-slate-700 text-[#176B63] dark:text-emerald-400'}`}>
            میز کار ارزش‌گذاری
          </button>
          {canAccessUiLab && (
            <button type="button" data-testid="toggle-radar-ui-lab-btn" onClick={() => setShowUiLab((v) => !v)} className={`px-3 py-1.5 rounded-[8px] font-bold whitespace-nowrap transition cursor-pointer border ${showUiLab ? 'bg-[#176B63] text-white border-transparent' : 'border-[#DCE3DF] dark:border-slate-700 text-[#176B63] dark:text-emerald-400'}`}>
              Radar UI Lab
            </button>
          )}
        </div>
      </div>

      {showValuationWorkspace && evaluatedNeighborhoods && onSelectNeighborhood && <React.Suspense fallback={null}><ValuationWorkspacePage evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={onSelectNeighborhood} onOpenModalCalculator={onOpenHedonic} /></React.Suspense>}
      {canAccessUiLab && showUiLab && <React.Suspense fallback={null}><RadarUiLabPanel onClose={() => setShowUiLab(false)} isDevEnvironment={isDevEnvironment} /></React.Suspense>}
      {showEmbeddedLab && (
        <div className="rounded-2xl border-2 border-indigo-500/40 p-4 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-3" data-testid="decision-lab-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-600" />
              <span>پنل تعاملی تصمیم‌یار خرید، چانه‌زنی و ارزیابی ریسک بازار</span>
            </h3>
            <button type="button" onClick={() => setShowEmbeddedLab(false)} className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded-md bg-white dark:bg-slate-800 border cursor-pointer">
              بستن پنل آزمایشگاه ✕
            </button>
          </div>
          <Stage2MasterWidget
            hoodId={selectedHood.id} hoodName={selectedHood.name} basePriceSqm={selectedHood.buyPerSqm} intlCurrency={intlCurrency} hood={selectedHood}
            initialTab={activeDecisionTab} onTabChange={(tab) => setActiveDecisionTab(tab)}
            onSelectCompareHood={(targetName) => { const match = evaluatedNeighborhoods?.find((h) => h.name === targetName); if (match) onSelectNeighborhood?.(match); }}
          />
        </div>
      )}

      <div className="space-y-8">
        {filteredCategories.map((cat) => (
          <section key={cat.id} className="space-y-3.5">
            <h2 className={`text-xs font-bold text-slate-400 flex items-center gap-2 ${isEn ? 'uppercase tracking-wider' : 'tracking-normal'}`}>
              <span>{cat.category}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.items.map((tool) => {
                const IconC = tool.icon;
                return (
                  <button key={tool.id} type="button" onClick={() => dispatchToolAction(tool.id)} className="p-5 rounded-2xl text-start w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-400 hover:shadow-md transition cursor-pointer flex items-start gap-4 group focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none">
                    <span className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:bg-emerald-500 dark:group-hover:text-slate-950 transition shrink-0">
                      <IconC className="w-5 h-5 stroke-[2]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm transition truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{tool.title}</h3>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-[-2px] group-hover:text-emerald-600 transition shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{tool.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {showVerifierModal && (
        <React.Suspense fallback={null}>
          <InstantListingVerifierModal isOpen={showVerifierModal} onClose={() => setShowVerifierModal(false)} initialHoodName={selectedHood?.name} cityKey={activeCity || 'tehran'} evaluatedNeighborhoods={evaluatedNeighborhoods} />
        </React.Suspense>
      )}
      {showContractShieldModal && (
        <React.Suspense fallback={null}>
          <ContractRoomShieldModal
            isOpen={showContractShieldModal}
            onClose={() => setShowContractShieldModal(false)}
            initialTotalMillion={initialContractTotalMillion}
            contextKey={`${selectedHood?.id ?? 0}-${safeTargetSqm}`}
          />
        </React.Suspense>
      )}
    </div>
  );
}


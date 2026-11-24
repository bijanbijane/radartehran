/**
 * @file src/components/views/ProductToolsView.tsx
 * @description Unified Real Estate Tools & Workspaces (AUD-003, AUD-007, AUD-011, AUD-014, AUD-015).
 * Supports inline workspaces for /tools/valuation, /tools/budget-fit, and /tools/verifier alongside the unified tool directory.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Compass, ChevronLeft, ChevronRight, ArrowUpRight, Search, X } from 'lucide-react';
import type { CityId } from '../../data/multiCityData';
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
import { BudgetFitVerdict } from '../listing/BudgetFitVerdict';
import { ListingVerdictHero } from '../listing/ListingVerdictHero';
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
import { UnifiedCompareWorkspace } from '../../features/tools/components/UnifiedCompareWorkspace';
import { FinancialCalculatorsWorkspace } from '../../features/tools/components/FinancialCalculatorsWorkspace';

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
  currentUser?: any;
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
  const devQueryActive = typeof window !== 'undefined' && typeof window.location?.search === 'string' && new URLSearchParams(window.location.search).get('dev') === '1';
  const canAccessUiLab = isRadarUiLabAvailable(isDevEnvironment === true || devQueryActive);
  const displayDealLabelFa = isEn ? 'Estimated Deal' : 'برآورد معامله';
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
    else if (activeSubTab === 'calculators' || activeSubTab === 'budget_fit' || activeSubTab === 'verifier') { setActiveCat('financial'); setShowValuationWorkspace(false); }
    else if (activeSubTab === 'compare_props' || activeSubTab === 'compare_areas') { setActiveCat('decision'); setShowValuationWorkspace(false); }
    else { setActiveCat('all'); setShowValuationWorkspace(false); }
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

  const resolvedCity = (activeCity || 'tehran') as CityId;

  return (
    <div className="w-full max-w-[1320px] mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-tools-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-5">
        <div>
          <span className="text-xs font-bold tracking-wider text-[var(--color-brand-600)] dark:text-emerald-400 block mb-1">
            {isEn ? 'Technical & Legal Calculators · Connected to Live Map' : 'محاسبات فنی و حقوقی · متصل به نقشه زنده'}
          </span>
          <h1 className="text-2xl sm:text-[28px] font-black leading-[1.35] text-[var(--color-text-primary)] tracking-tight">
            {isEn ? 'Real Estate Transaction Toolkit' : 'جعبه‌ابزار هوشمند معاملات مسکن'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid="tools-total-summary">
            {isEn
              ? `${fmtCount(toolCounts.total)} analytical, financial, negotiation & legal tools across ${fmtCount(toolCategories.length)} categories`
              : `مجموعه ${fmtCount(toolCounts.total)} ابزار کارشناسی قیمت، شبیه‌ساز مالی، راهنمای چانه‌زنی و بررسی حقوقی در ${fmtCount(toolCategories.length)} دسته`}
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-[var(--color-brand-soft)]/70 border border-[var(--color-brand-600)]/25 text-xs space-y-2 w-full sm:w-auto sm:min-w-[270px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--color-text-secondary)] font-bold">محله هدف محاسبات:</span>
            {onOpenInspector && (
              <button type="button" onClick={() => onOpenInspector(selectedHood)} className="text-xs font-extrabold text-[var(--color-brand-600)] dark:text-emerald-300 hover:underline flex items-center gap-0.5 cursor-pointer">
                <span>کارنامه</span><ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {evaluatedNeighborhoods && onSelectNeighborhood ? (
            <select aria-label="انتخاب محله هدف محاسبات" value={selectedHood.id} onChange={(e) => { const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value)); if (found) onSelectNeighborhood(found); }} className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] font-black text-[var(--color-text-primary)] text-xs focus:outline-none cursor-pointer">
              {evaluatedNeighborhoods.map((h) => (<option key={h.id} value={h.id}>محله {h.name} {h.zone ? `· ${h.zone}` : ''}</option>))}
            </select>
          ) : (
            <strong className="font-black text-[var(--color-brand-600)] dark:text-emerald-300 block">محله {selectedHood.name} {selectedHood.zone ? `· ${selectedHood.zone}` : ''}</strong>
          )}
          <div className="flex items-center justify-between text-xs tabular-nums pt-0.5 gap-2">
            <span className="text-[var(--color-text-secondary)]">اعلامی: <strong>{buyText}</strong> · {displayDealLabelFa}: <strong className="text-[var(--color-brand-600)] dark:text-emerald-400">{dealText}</strong></span>
            <button type="button" onClick={onOpenCompare} className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer shrink-0">مقایسه دو محله</button>
          </div>
        </div>
      </div>

      {/* Inline Dedicated Workspaces for /tools/* sub-routes */}
      {activeSubTab === 'budget_fit' && evaluatedNeighborhoods && (
        <section aria-label="تطبیق بودجه با محله‌ها" data-testid="tools-budget-fit-workspace">
          <BudgetFitVerdict
            neighborhoods={evaluatedNeighborhoods}
            mode="buy"
            budgetMillion={initialContractTotalMillion}
            targetSqm={safeTargetSqm}
            city={resolvedCity}
            selectedHoodId={selectedHood?.id}
          />
        </section>
      )}
      {activeSubTab === 'verifier' && evaluatedNeighborhoods && (
        <section aria-label="سنجش قیمت آگهی" data-testid="tools-verifier-workspace">
          <ListingVerdictHero
            evaluatedNeighborhoods={evaluatedNeighborhoods}
            cityKey={resolvedCity}
            defaultHoodName={selectedHood?.name}
            onOpenFullModal={() => setShowVerifierModal(true)}
          />
        </section>
      )}
      {(activeSubTab === 'compare_areas' || activeSubTab === 'compare_props') && evaluatedNeighborhoods && (
        <UnifiedCompareWorkspace
          mode={activeSubTab === 'compare_props' ? 'properties' : 'areas'}
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          selectedHood={selectedHood}
          onSelectNeighborhood={onSelectNeighborhood}
        />
      )}
      {activeSubTab === 'calculators' && (
        <FinancialCalculatorsWorkspace defaultPropertyBillion={Math.max(2, Math.round(initialContractTotalMillion / 1000))} />
      )}

      {(!activeSubTab || activeSubTab === 'all') && (
        <div className="flex flex-col gap-2.5 bg-[var(--color-bg-surface)] p-3.5 rounded-xl border border-[var(--color-border-subtle)]">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label={isEn ? 'Search calculators' : 'جستجوی سریع ابزار'}
              value={toolQuery}
              onChange={(e) => setToolQuery(e.target.value)}
              placeholder={isEn ? 'Search calculators (e.g. mortgage, tax, commission, zoning)...' : 'جستجوی سریع ابزار (مثلاً: وام، مالیات، کمیسیون، قولنامه، ضوابط ساخت)...'}
              className="w-full min-h-[44px] md:min-h-[38px] ps-9 pe-8 py-2 rounded-lg bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-600)]"
            />
            {toolQuery && (
              <button type="button" aria-label="پاک کردن جستجوی ابزار" onClick={() => setToolQuery('')} className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center absolute end-1 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {categoryTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveCat(tab.id)} className={`min-h-[44px] md:min-h-[34px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${activeCat === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'}`}>{tab.label}</button>
            ))}
            <button type="button" data-testid="toggle-valuation-workspace-btn" onClick={() => setShowValuationWorkspace((v) => !v)} className={`min-h-[44px] md:min-h-[34px] px-3 py-1.5 rounded-[8px] font-bold whitespace-nowrap transition cursor-pointer border ${showValuationWorkspace ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'border-[var(--color-border-strong)] text-[var(--color-brand-fg)]'}`}>
              میز کار ارزش‌گذاری
            </button>
            {canAccessUiLab && (
              <button type="button" data-testid="toggle-radar-ui-lab-btn" onClick={() => setShowUiLab((v) => !v)} className={`min-h-[44px] md:min-h-[34px] px-3 py-1.5 rounded-[8px] font-bold whitespace-nowrap transition cursor-pointer border ${showUiLab ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'border-[var(--color-border-strong)] text-[var(--color-brand-fg)]'}`}>
                Radar UI Lab
              </button>
            )}
          </div>
        </div>
      )}

      {showValuationWorkspace && evaluatedNeighborhoods && onSelectNeighborhood && (
        <React.Suspense fallback={null}>
          <ValuationWorkspacePage
            evaluatedNeighborhoods={evaluatedNeighborhoods}
            selectedHood={selectedHood}
            activeCity={resolvedCity}
            currentUser={p.currentUser}
            onSelectNeighborhood={onSelectNeighborhood}
            onOpenModalCalculator={onOpenHedonic}
          />
        </React.Suspense>
      )}
      {canAccessUiLab && showUiLab && (
        <React.Suspense fallback={null}>
          <RadarUiLabPanel onClose={() => setShowUiLab(false)} isDevEnvironment={isDevEnvironment === true || devQueryActive} />
        </React.Suspense>
      )}
      {showEmbeddedLab && (
        <div className="rounded-2xl border border-[var(--color-brand-600)]/40 p-4 bg-[var(--color-brand-soft)]/35 space-y-3" data-testid="decision-lab-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[var(--color-brand-700)] dark:text-emerald-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>پنل تعاملی تصمیم‌یار خرید، چانه‌زنی و ارزیابی ریسک بازار</span>
            </h3>
            <button type="button" onClick={() => setShowEmbeddedLab(false)} className="min-h-[36px] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2.5 py-1 rounded-md bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] cursor-pointer">
              بستن پنل ✕
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
        {filteredCategories.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-3">
            <p className="text-sm font-extrabold text-[var(--color-text-primary)]">{isEn ? 'No matching tools found.' : 'ابزاری مطابق عبارت جست‌وجو یافت نشد.'}</p>
            <button type="button" onClick={() => { setToolQuery(''); setActiveCat('all'); }} className="min-h-[44px] md:min-h-[36px] px-4 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold transition cursor-pointer">{isEn ? 'Reset search & category' : 'بازنشانی جستجو و نمایش همه ابزارها'}</button>
          </div>
        ) : filteredCategories.map((cat) => (
          <section key={cat.id} className="space-y-3.5">
            <h2 className={`text-xs font-bold text-[var(--color-text-secondary)] flex items-center gap-2 ${isEn ? 'uppercase tracking-wider' : 'tracking-normal'}`}>
              <span>{cat.category}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.items.map((tool) => {
                const IconC = tool.icon;
                return (
                  <button key={tool.id} type="button" onClick={() => dispatchToolAction(tool.id)} className="p-5 rounded-2xl text-start w-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)] hover:shadow-md transition cursor-pointer flex items-start gap-4 group focus-visible:ring-2 focus-visible:ring-[var(--color-brand-600)] focus-visible:outline-none">
                    <span className="p-2.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] group-hover:bg-[var(--color-brand-600)] group-hover:text-white transition shrink-0"><IconC className="w-5 h-5 stroke-[2]" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-extrabold text-[var(--color-text-primary)] text-sm transition truncate group-hover:text-[var(--color-brand-fg)]">{tool.title}</h3>
                        {isEn
                          ? <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:translate-x-[2px] group-hover:text-[var(--color-brand-fg)] transition shrink-0" aria-hidden="true" />
                          : <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:translate-x-[-2px] group-hover:text-[var(--color-brand-fg)] transition shrink-0" aria-hidden="true" />}
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">{tool.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {showVerifierModal && <React.Suspense fallback={null}><InstantListingVerifierModal isOpen={showVerifierModal} onClose={() => setShowVerifierModal(false)} initialHoodName={selectedHood?.name} cityKey={activeCity || 'tehran'} evaluatedNeighborhoods={evaluatedNeighborhoods} /></React.Suspense>}
      {showContractShieldModal && <React.Suspense fallback={null}><ContractRoomShieldModal isOpen={showContractShieldModal} onClose={() => setShowContractShieldModal(false)} initialTotalMillion={initialContractTotalMillion} contextKey={`${selectedHood?.id ?? 0}-${safeTargetSqm}`} /></React.Suspense>}
    </div>
  );
}

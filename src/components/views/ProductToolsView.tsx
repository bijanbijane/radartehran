/** @file src/components/views/ProductToolsView.tsx — Unified Real Estate Tools & Workspaces (AUD-003..015) */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Calculator, ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight, Compass, GitCompare, Scale, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
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
  buildToolCategoriesForHood, calculateContractInitialTotalMillion, computeToolCategoryCounts,
  isRadarUiLabAvailable, sanitizeContractTargetSqm, type ToolDispatchTarget,
} from '../../features/tools/services/toolsCatalogEngine';
import { UnifiedCompareWorkspace } from '../../features/tools/components/UnifiedCompareWorkspace';
import { FinancialCalculatorsWorkspace } from '../../features/tools/components/FinancialCalculatorsWorkspace';

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
  onSelectSubTab?: (tab: ToolsSubTabId) => void;
  featureFlags: FeatureFlags;
  activeCity?: string;
  currentUser?: any;
  targetSqm?: number;
  activeSubTab?: ToolsSubTabId;
  isDevEnvironment?: boolean;
}

function resolveToolsHeading(subTab: ToolsSubTabId | undefined, isEn: boolean): string {
  switch (subTab) {
    case 'valuation': return isEn ? 'Hedonic Property Valuation' : 'ارزش‌گذاری هدونیک و قیمت منصفانه ملک';
    case 'budget_fit': return isEn ? 'Reverse Budget Fit Finder' : 'بودجه‌سنج معکوس و تطبیق قدرت خرید';
    case 'verifier': return isEn ? 'Listing Price & Risk Verifier' : 'سنجش سلامت و راستی‌آزمایی آگهی ملک';
    case 'compare_areas': return isEn ? 'Neighborhood Comparison Matrix' : 'مقایسه تحلیلی محله‌ها';
    case 'compare_props': return isEn ? 'Side-by-Side Property Comparison' : 'مقایسه کنار هم دو ملک';
    case 'calculators': return isEn ? 'Mortgage, Commission & Rent Calculators' : 'محاسبه‌گرهای وام، کمیسیون و رهن';
    case 'lab': return isEn ? 'Radar UI Design Lab' : 'آزمایشگاه طراحی رابط رادار';
    default: return isEn ? 'Real Estate Transaction Toolkit' : 'ابزارها و محاسبه‌گرهای هوشمند مسکن';
  }
}

export function ProductToolsView(p: ProductToolsViewProps): React.ReactElement {
  const {
    selectedHood, onSelectNeighborhood, onOpenInspector, onOpenHedonic,
    onOpenSuperModule, onOpenExpansionModal, onOpenReverseBudget, onOpenCompare,
    onSelectSubTab, evaluatedNeighborhoods, activeCity, targetSqm, activeSubTab, isDevEnvironment,
  } = p;
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale(), [experienceMode] = useExperienceMode();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  // The laboratory is restricted by the actual Vite development environment, never by a user-controlled URL flag.
  const canAccessUiLab = isRadarUiLabAvailable(isDevEnvironment);
  const displayDealLabelFa = isEn ? 'Estimated Deal' : 'برآورد معامله';
  const safeTargetSqm = sanitizeContractTargetSqm(targetSqm);
  const initialContractTotalMillion = calculateContractInitialTotalMillion(selectedHood?.buyPerSqm, safeTargetSqm);
  const [toolQuery, setToolQuery] = useState<string>('');
  const [activeCat, setActiveCat] = useState<'all' | 'financial' | 'legal' | 'urban' | 'decision'>('all');
  const [showExtendedCatalog, setShowExtendedCatalog] = useState<boolean>(false);
  const [showEmbeddedLab, setShowEmbeddedLab] = useState<boolean>(false);
  const isUiLabRoute = activeSubTab === 'lab';
  const [showValuationWorkspace, setShowValuationWorkspace] = useState<boolean>(activeSubTab === 'valuation');
  const [activeDecisionTab, setActiveDecisionTab] = useState<Stage2ActiveTab>('DECISION_SYNTHESIS');
  const [showVerifierModal, setShowVerifierModal] = useState<boolean>(false), [showContractShieldModal, setShowContractShieldModal] = useState<boolean>(false);
  const isCatalogSubView = !activeSubTab || activeSubTab === 'all';
  const showDedicatedSubWorkspace = Boolean(activeSubTab && activeSubTab !== 'all');

  useEffect(() => {
    if (activeSubTab === 'lab') { setActiveCat('all'); setShowValuationWorkspace(false); }
    else if (activeSubTab === 'valuation') { setActiveCat('financial'); setShowValuationWorkspace(true); }
    else if (activeSubTab === 'calculators' || activeSubTab === 'budget_fit' || activeSubTab === 'verifier') { setActiveCat('financial'); setShowValuationWorkspace(false); }
    else if (activeSubTab === 'compare_props' || activeSubTab === 'compare_areas') { setActiveCat('decision'); setShowValuationWorkspace(false); }
    else { setActiveCat('all'); setShowValuationWorkspace(false); }
  }, [activeSubTab]);

  const dispatchTarget = useCallback((target: ToolDispatchTarget) => {
    switch (target.kind) {
      case 'decision': setActiveDecisionTab(target.tab); setShowEmbeddedLab(true); break;
      case 'verifier':
        if (onSelectSubTab) onSelectSubTab('verifier');
        else setShowVerifierModal(true);
        break;
      case 'contract_shield': setShowContractShieldModal(true); break;
      case 'hedonic':
        if (onSelectSubTab) onSelectSubTab('valuation');
        else onOpenHedonic();
        break;
      case 'reverse_budget':
        if (onSelectSubTab) onSelectSubTab('budget_fit');
        else onOpenReverseBudget();
        break;
      case 'compare':
        if (onSelectSubTab) onSelectSubTab('compare_areas');
        else onOpenCompare();
        break;
      case 'expansion': onOpenExpansionModal(target.modal); break;
      case 'super': onOpenSuperModule(target.tab); break;
    }
  }, [onSelectSubTab, onOpenHedonic, onOpenReverseBudget, onOpenCompare, onOpenExpansionModal, onOpenSuperModule]);

  const dealSqm = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm;
  const unitBuy = convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), unitDeal = convertPricePerSqmToUnit(dealSqm, areaUnit);
  const unitBuyRaw = convertPricePerSqmToUnitRaw(selectedHood.buyPerSqm, areaUnit), unitDealRaw = convertPricePerSqmToUnitRaw(dealSqm, areaUnit);
  const areaSuffix = formatAreaUnitLabel(areaUnit, radarLocale);
  const buyText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(unitBuyRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${areaSuffix}` : `${toPersianNum(unitBuy)} میلیون تومان / ${areaSuffix}`;
  const dealText = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(unitDealRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${areaSuffix}` : `${toPersianNum(unitDeal)} میلیون تومان / ${areaSuffix}`;

  const toolCategories = useMemo(() => buildToolCategoriesForHood({ isEn, hoodName: selectedHood.name }), [isEn, selectedHood.name]);
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
      .map((c) => ({ ...c, items: q ? c.items.filter((it) => matchesPersianSearch(it.title, q) || matchesPersianSearch(it.desc, q)) : c.items }))
      .filter((c) => c.items.length > 0);
  }, [toolCategories, activeCat, toolQuery, experienceMode]);

  const fmtCount = (n: number) => (isEn ? n.toLocaleString('en-US') : toPersianNum(n));
  const categoryTabs = useMemo(() => [
    { id: 'all' as const, label: isEn ? `All (${fmtCount(toolCounts.total)})` : `همه (${fmtCount(toolCounts.total)})` },
    { id: 'financial' as const, label: isEn ? `Financial (${fmtCount(toolCounts.byCategory.financial)})` : `مالی و قیمت (${fmtCount(toolCounts.byCategory.financial)})` },
    { id: 'legal' as const, label: isEn ? `Legal (${fmtCount(toolCounts.byCategory.legal)})` : `حقوقی و بازدید (${fmtCount(toolCounts.byCategory.legal)})` },
    { id: 'decision' as const, label: isEn ? `Decision Lab (${fmtCount(toolCounts.byCategory.decision)})` : `تصمیم‌یار و ریسک (${fmtCount(toolCounts.byCategory.decision)})` },
    { id: 'urban' as const, label: isEn ? `Urban & Swap (${fmtCount(toolCounts.byCategory.urban)})` : `ساخت و تهاتر (${fmtCount(toolCounts.byCategory.urban)})` },
  ], [isEn, toolCounts]);

  const flagshipTools = useMemo<Array<{ id: ToolsSubTabId; title: string; desc: string; icon: typeof Calculator }>>(() => [
    {
      id: 'valuation',
      title: isEn ? 'Hedonic Valuation' : 'ارزش‌گذاری هدونیک ملک',
      desc: isEn ? 'Fair market and fast-sale estimate based on age, floor, elevator, and neighborhood comps.' : 'برآورد ارزش منصفانه و قیمت فروش فوری بر اساس سن بنا، طبقه، پارکینگ و میانگین محله.',
      icon: Calculator,
    },
    {
      id: 'budget_fit',
      title: isEn ? 'Reverse Budget Finder' : 'بودجه‌سنج معکوس',
      desc: isEn ? 'Find neighborhoods and floor areas that realistically match your cash and mortgage budget.' : 'یافتن محله‌ها و متراژهای واقع‌بینانه متناسب با بودجه نقدی و وام مسکن شما.',
      icon: Sparkles,
    },
    {
      id: 'verifier',
      title: isEn ? 'Listing Price Verifier' : 'سنجش سلامت آگهی',
      desc: isEn ? 'Paste any listing price or text to spot overpricing, bait ads, and negotiation leverage.' : 'کشف حباب قیمتی، آگهی‌های طعمه و استخراج سقف منطقی مذاکره پیش از بازدید.',
      icon: ShieldAlert,
    },
    {
      id: 'compare_areas',
      title: isEn ? 'Compare Neighborhoods' : 'مقایسه تحلیلی محله‌ها',
      desc: isEn ? 'Side-by-side comparison of price, metro access, air quality, and livability scores.' : 'مقایسه کنار هم دو محله از نظر قیمت، مترو، کیفیت هوا، ترافیک و امتیاز زیست‌پذیری.',
      icon: GitCompare,
    },
    {
      id: 'calculators',
      title: isEn ? 'Mortgage & Commission' : 'محاسبه‌گر وام، کمیسیون و رهن',
      desc: isEn ? 'Compute legal agency commission, notary fees, mortgage installments, and deposit conversion.' : 'محاسبه کمیسیون قانونی مشاور املاک، هزینه محضر، اقساط وام و تبدیل رهن و اجاره.',
      icon: Scale,
    },
  ], [isEn]);

  const resolvedCity = (activeCity || 'tehran') as CityId;
  const shouldRenderExtendedCatalog = showExtendedCatalog || toolQuery.trim().length > 0 || activeCat !== 'all';

  return (
    <div className="w-full max-w-[1320px] mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-tools-view">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-5">
        <div>
          <span className="text-sm font-bold text-[var(--color-brand-fg)] block mb-1">
            {isEn ? 'Technical & Financial Calculators · Connected to Live Data' : 'محاسبات فنی، مالی و حقوقی · همگام با داده‌های بازار'}
          </span>
          <h1 className="text-2xl sm:text-[30px] font-bold leading-[1.3] text-[var(--color-text-primary)] tracking-tight">
            {resolveToolsHeading(activeSubTab, isEn)}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5" data-testid="tools-total-summary">
            {isEn
              ? `${fmtCount(flagshipTools.length)} core workspaces and ${fmtCount(toolCounts.total)} specialized analytical & legal calculators`
              : `${fmtCount(flagshipTools.length)} میز کار اصلی تصمیم‌گیری به همراه ${fmtCount(toolCounts.total)} ابزار تخصصی کارشناسی و حقوقی`}
          </p>
        </div>

        {canAccessUiLab && activeSubTab !== 'lab' && (
          <button type="button" data-testid="toggle-radar-ui-lab-btn" onClick={() => {
            if (onSelectSubTab) onSelectSubTab('lab');
            else if (typeof window !== 'undefined') window.location.assign('/tools/lab');
          }} className="min-h-[44px] px-3 py-1.5 rounded-lg border border-[var(--color-border-strong)] text-sm font-bold text-[var(--color-brand-fg)] self-start lg:self-auto">{isEn ? 'Open development lab' : 'ورود به آزمایشگاه توسعه'}</button>
        )}
        {!showDedicatedSubWorkspace && (
          <div className="p-3.5 rounded-2xl bg-[var(--color-brand-soft)]/70 border border-[var(--color-brand-600)]/25 text-sm space-y-2 w-full lg:w-auto lg:min-w-[300px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[var(--color-text-secondary)] font-bold">محله مبنای محاسبات:</span>
              {onOpenInspector && (
                <button type="button" onClick={() => onOpenInspector(selectedHood)} className="text-sm font-bold text-[var(--color-brand-fg)] hover:underline flex items-center gap-0.5 cursor-pointer">
                  <span>کارنامه محله</span><ArrowUpRight className="w-4 h-4" />
                </button>
              )}
            </div>
            {evaluatedNeighborhoods && onSelectNeighborhood ? (
              <select
                aria-label="انتخاب محله هدف محاسبات"
                value={selectedHood.id}
                onChange={(e) => {
                  const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value));
                  if (found) onSelectNeighborhood(found);
                }}
                className="w-full min-h-[44px] md:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] font-bold text-[var(--color-text-primary)] text-sm focus:outline-none cursor-pointer"
              >
                {evaluatedNeighborhoods.map((h) => (<option key={h.id} value={h.id}>محله {h.name} {h.zone ? `· ${h.zone}` : ''}</option>))}
              </select>
            ) : (
              <strong className="font-bold text-[var(--color-brand-fg)] block">محله {selectedHood.name} {selectedHood.zone ? `· ${selectedHood.zone}` : ''}</strong>
            )}
            <div className="flex flex-wrap items-center justify-between text-sm tabular-nums pt-0.5 gap-2">
              <span className="text-[var(--color-text-secondary)]">اعلامی: <strong>{buyText}</strong> · {displayDealLabelFa}: <strong className="text-[var(--color-brand-fg)]">{dealText}</strong></span>
            </div>
          </div>
        )}
      </div>

      {activeSubTab === 'budget_fit' && evaluatedNeighborhoods && (
        <section aria-label="تطبیق بودجه با محله‌ها" data-testid="tools-budget-fit-workspace">
          <BudgetFitVerdict neighborhoods={evaluatedNeighborhoods} mode="buy" budgetMillion={initialContractTotalMillion} targetSqm={safeTargetSqm} city={resolvedCity} selectedHoodId={selectedHood?.id} />
        </section>
      )}
      {activeSubTab === 'verifier' && evaluatedNeighborhoods && (
        <section aria-label="سنجش قیمت آگهی" data-testid="tools-verifier-workspace">
          <ListingVerdictHero evaluatedNeighborhoods={evaluatedNeighborhoods} cityKey={resolvedCity} defaultHoodName={selectedHood?.name} onOpenFullModal={() => setShowVerifierModal(true)} />
        </section>
      )}
      {(activeSubTab === 'compare_areas' || activeSubTab === 'compare_props') && evaluatedNeighborhoods && (
        <UnifiedCompareWorkspace mode={activeSubTab === 'compare_props' ? 'properties' : 'areas'} evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} activeCity={resolvedCity} onSelectNeighborhood={onSelectNeighborhood} />
      )}
      {activeSubTab === 'calculators' && (
        <FinancialCalculatorsWorkspace defaultPropertyBillion={Math.max(2, Math.round(initialContractTotalMillion / 1000))} />
      )}

      {showValuationWorkspace && evaluatedNeighborhoods && onSelectNeighborhood && (
        <React.Suspense fallback={null}>
          <ValuationWorkspacePage evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} activeCity={resolvedCity} currentUser={p.currentUser} onSelectNeighborhood={onSelectNeighborhood} onOpenModalCalculator={onOpenHedonic} />
        </React.Suspense>
      )}

      {isCatalogSubView && (
        <>
          {/* Core Flagship Workspaces — clear visual hierarchy before extended tools */}
          <section className="space-y-3.5" aria-label={isEn ? 'Core decision workspaces' : 'ابزارهای اصلی تصمیم‌گیری'}>
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">
              {isEn ? 'Core Decision Workspaces' : 'ابزارهای اصلی تصمیم‌گیری و ارزیابی'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {flagshipTools.map((tool) => {
                const IconC = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`flagship-tool-${tool.id}`}
                    onClick={() => {
                      if (onSelectSubTab) onSelectSubTab(tool.id);
                      else if (tool.id === 'valuation') setShowValuationWorkspace(true);
                      else if (tool.id === 'budget_fit') onOpenReverseBudget();
                      else if (tool.id === 'verifier') setShowVerifierModal(true);
                      else if (tool.id === 'compare_areas') onOpenCompare();
                    }}
                    className="p-5 rounded-2xl text-start w-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)] hover:shadow-md transition cursor-pointer flex items-start gap-3.5 group"
                  >
                    <span className="p-2.5 rounded-xl border border-[var(--color-brand-600)]/25 bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] group-hover:bg-[var(--color-brand-600)] group-hover:text-white transition shrink-0">
                      <IconC className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-bold text-[var(--color-text-primary)] text-base group-hover:text-[var(--color-brand-fg)] transition">
                          {tool.title}
                        </h3>
                        {isEn ? <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />}
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">{tool.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Search + Extended Specialized Tools Disclosure */}
          <div className="flex flex-col gap-3 bg-[var(--color-bg-surface)] p-4 rounded-2xl border border-[var(--color-border-subtle)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label={isEn ? 'Search calculators' : 'جستجوی سریع ابزار'}
                  value={toolQuery}
                  onChange={(e) => setToolQuery(e.target.value)}
                  placeholder={isEn ? 'Search all calculators (mortgage, tax, commission, zoning)...' : 'جستجوی سریع در میان تمام ابزارها (وام، مالیات، کمیسیون، قولنامه، ضوابط ساخت)...'}
                  className="w-full min-h-[44px] md:min-h-[40px] ps-9 pe-9 py-2 rounded-lg bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-600)]"
                />
                {toolQuery && (
                  <button type="button" aria-label="پاک کردن جستجوی ابزار" onClick={() => setToolQuery('')} className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center absolute end-1 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"><X className="w-4 h-4" /></button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="toggle-extended-tools-btn"
                  aria-expanded={shouldRenderExtendedCatalog}
                  onClick={() => setShowExtendedCatalog((v) => !v)}
                  className="min-h-[44px] md:min-h-[40px] px-4 py-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] hover:bg-[var(--color-brand-soft)] text-sm font-bold text-[var(--color-text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition"
                >
                  <span>{shouldRenderExtendedCatalog ? 'بستن فهرست ابزارهای تکمیلی' : `نمایش ${fmtCount(toolCounts.total)} ابزار تخصصی و تکمیلی`}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${shouldRenderExtendedCatalog ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {shouldRenderExtendedCatalog && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm pt-2 border-t border-[var(--color-border-subtle)]">
                {categoryTabs.map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setActiveCat(tab.id)} className={`min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${activeCat === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'}`}>{tab.label}</button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isUiLabRoute && canAccessUiLab && (
        <section data-testid="radar-ui-lab-route" aria-label={isEn ? 'Radar UI Design Lab' : 'آزمایشگاه طراحی رابط رادار'} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">{isEn ? 'Experimental UI Lab' : 'آزمایشگاه مستقل و آزمایشی رابط کاربری'}</h2>
              <p className="text-sm text-[var(--color-text-muted)]">{isEn ? 'Development-only visual experiments, isolated from public decision tools.' : 'آزمایش‌های بصری فقط در محیط توسعه؛ جدا از ابزارهای تصمیم‌گیری عمومی.'}</p>
            </div>
            <button type="button" onClick={() => onSelectSubTab?.('all')} className="min-h-[44px] px-3 rounded-lg border border-[var(--color-border-strong)] text-sm font-bold text-[var(--color-text-primary)]">{isEn ? 'Back to tools' : 'بازگشت به ابزارها'}</button>
          </div>
          <React.Suspense fallback={<div className="p-4 text-sm text-[var(--color-text-muted)]">{isEn ? 'Loading UI lab…' : 'در حال بارگذاری آزمایشگاه رابط…'}</div>}>
            <RadarUiLabPanel onClose={() => onSelectSubTab?.('all')} isDevEnvironment={canAccessUiLab} />
          </React.Suspense>
        </section>
      )}
      {isUiLabRoute && !canAccessUiLab && (
        <section role="alert" data-testid="radar-ui-lab-unavailable" className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] p-5 space-y-3">
          <h2 className="font-bold text-[var(--color-text-primary)]">{isEn ? 'Development environment required' : 'آزمایشگاه فقط در محیط توسعه در دسترس است'}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{isEn ? 'This experimental workspace is not part of the public production tools catalogue.' : 'این محیط آزمایشی بخشی از کاتالوگ ابزارهای عمومی نسخهٔ عملیاتی نیست.'}</p>
          <button type="button" onClick={() => onSelectSubTab?.('all')} className="min-h-[44px] px-4 rounded-lg bg-[var(--color-brand-600)] text-white text-sm font-bold">{isEn ? 'Return to tools' : 'بازگشت به ابزارها'}</button>
        </section>
      )}
      {showEmbeddedLab && (
        <div className="rounded-2xl border border-[var(--color-brand-600)]/40 p-4 bg-[var(--color-brand-soft)]/35 space-y-3" data-testid="decision-lab-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--color-brand-fg)] flex items-center gap-2"><Compass className="w-4 h-4 text-[var(--color-brand-600)]" /><span>پنل تعاملی تصمیم‌یار خرید، چانه‌زنی و ارزیابی ریسک بازار</span></h3>
            <button type="button" onClick={() => setShowEmbeddedLab(false)} className="min-h-[36px] text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-3 py-1 rounded-md bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] cursor-pointer">بستن پنل ✕</button>
          </div>
          <Stage2MasterWidget hoodId={selectedHood.id} hoodName={selectedHood.name} basePriceSqm={selectedHood.buyPerSqm} intlCurrency={intlCurrency} hood={selectedHood} initialTab={activeDecisionTab} onTabChange={(tab) => setActiveDecisionTab(tab)} onSelectCompareHood={(targetName) => { const match = evaluatedNeighborhoods?.find((h) => h.name === targetName); if (match) onSelectNeighborhood?.(match); }} />
        </div>
      )}

      {isCatalogSubView && shouldRenderExtendedCatalog && (
        <div className="space-y-8">
          {filteredCategories.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-3">
              <p className="text-base font-bold text-[var(--color-text-primary)]">{isEn ? 'No matching tools found.' : 'ابزاری مطابق عبارت جست‌وجو یافت نشد.'}</p>
              <button type="button" onClick={() => { setToolQuery(''); setActiveCat('all'); }} className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-sm font-bold transition cursor-pointer">{isEn ? 'Reset search & category' : 'بازنشانی جستجو و نمایش همه ابزارها'}</button>
            </div>
          ) : filteredCategories.map((cat) => (
            <section key={cat.id} className="space-y-3.5">
              <h2 className={`text-sm font-bold text-[var(--color-text-secondary)] flex items-center gap-2 ${isEn ? 'uppercase tracking-wider' : 'tracking-normal'}`}><span>{cat.category}</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cat.items.map((tool) => {
                  const IconC = tool.icon;
                  return (
                    <button key={tool.id} type="button" onClick={() => dispatchToolAction(tool.id)} className="p-5 rounded-2xl text-start w-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)] hover:shadow-md transition cursor-pointer flex items-start gap-4 group focus-visible:ring-2 focus-visible:ring-[var(--color-brand-600)] focus-visible:outline-none">
                      <span className="p-2.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] group-hover:bg-[var(--color-brand-600)] group-hover:text-white transition shrink-0"><IconC className="w-5 h-5 stroke-[2]" /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="font-bold text-[var(--color-text-primary)] text-sm transition truncate group-hover:text-[var(--color-brand-fg)]">{tool.title}</h3>
                          {isEn ? <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:translate-x-[2px] group-hover:text-[var(--color-brand-fg)] transition shrink-0" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:translate-x-[-2px] group-hover:text-[var(--color-brand-fg)] transition shrink-0" aria-hidden="true" />}
                        </div>
                        <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">{tool.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {showVerifierModal && <React.Suspense fallback={null}><InstantListingVerifierModal isOpen={showVerifierModal} onClose={() => setShowVerifierModal(false)} initialHoodName={selectedHood?.name} cityKey={activeCity || 'tehran'} evaluatedNeighborhoods={evaluatedNeighborhoods} /></React.Suspense>}
      {showContractShieldModal && <React.Suspense fallback={null}><ContractRoomShieldModal isOpen={showContractShieldModal} onClose={() => setShowContractShieldModal(false)} initialTotalMillion={initialContractTotalMillion} contextKey={`${selectedHood?.id ?? 0}-${safeTargetSqm}`} /></React.Suspense>}
    </div>
  );
}

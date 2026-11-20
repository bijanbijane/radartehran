import React, { useState } from 'react';
import { Sparkles, Users, BookOpen, Scale, Compass, Network, Hourglass, Briefcase, Activity, PieChart, Wallet, Split, Award } from 'lucide-react';
import { INITIAL_NEIGHBORHOODS, toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import { getAllMultiCityNeighborhoods, type CityId } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { NeighborhoodCrowdClaimsPanel } from './NeighborhoodCrowdClaimsPanel';
import { SocioeconomicReferenceCard } from './SocioeconomicReferenceCard';
import { EpistemicProvenancePanel } from './EpistemicProvenancePanel';
import { ParetoRegretSimulatorCard } from './ParetoRegretSimulatorCard';
import { SpatialContagionLabCard } from './SpatialContagionLabCard';
import { RealOptionsLiquidityCard } from './RealOptionsLiquidityCard';
import { UrbanAffordabilityIsochroneCard } from './UrbanAffordabilityIsochroneCard';
import { MonteCarloRiskDensityCard } from './MonteCarloRiskDensityCard';
import { HousingCycleRegimeCard } from './HousingCycleRegimeCard';
import { MacroPortfolioArbitrageCard } from './MacroPortfolioArbitrageCard';
import { RentVsBuyArbitrageCard } from './RentVsBuyArbitrageCard';
import { UnifiedDecisionSynthesisCard } from './UnifiedDecisionSynthesisCard';

export interface Stage2MasterWidgetProps {
  hoodId?: number;
  hoodName?: string;
  cityId?: CityId | string;
  basePriceSqm?: number;
  targetSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
  cityKey?: string;
  initialTab?: Stage2ActiveTab;
  onTabChange?: (tab: Stage2ActiveTab) => void;
  onSelectCompareHood?: (hoodName: string) => void;
}

export type Stage2ActiveTab =
  | 'DECISION_SYNTHESIS'
  | 'EPISTEMIC_PROVENANCE'
  | 'PARETO_REGRET'
  | 'SPATIAL_CONTAGION'
  | 'REAL_OPTIONS'
  | 'URBAN_AFFORDABILITY'
  | 'MONTE_CARLO_VAR'
  | 'HOUSING_CYCLE'
  | 'MACRO_PORTFOLIO'
  | 'RENT_VS_BUY'
  | 'CROWD_CLAIMS'
  | 'SOCIOECONOMIC_REFERENCE';

export type Stage2DomainId = 'SYNTHESIS' | 'ARBITRAGE' | 'RISK_CYCLE' | 'FIELD_CROWD';

const STAGE2_DOMAINS: { id: Stage2DomainId; label: string }[] = [
  { id: 'SYNTHESIS', label: '۱. حکم و معرفت‌شناسی' },
  { id: 'ARBITRAGE', label: '۲. آربیتراژ و استطاعت' },
  { id: 'RISK_CYCLE', label: '۳. ریسک، چرخه و نقدشوندگی' },
  { id: 'FIELD_CROWD', label: '۴. پرتفوی، میدان و کوچ' },
];

const STAGE2_TABS: { id: Stage2ActiveTab; domain: Stage2DomainId; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'DECISION_SYNTHESIS', domain: 'SYNTHESIS', label: 'حکم نهایی و آمادگی معامله (کسپر)', shortLabel: 'حکم نهایی کسپر', icon: Award },
  { id: 'EPISTEMIC_PROVENANCE', domain: 'SYNTHESIS', label: 'تفکیک معرفتی و منشأ داده', shortLabel: 'تفکیک معرفتی', icon: Scale },
  { id: 'SPATIAL_CONTAGION', domain: 'SYNTHESIS', label: 'سرایت فضایی و شاخص آکرلوف', shortLabel: 'سرایت و آکرلوف', icon: Network },
  { id: 'PARETO_REGRET', domain: 'ARBITRAGE', label: 'ماتریس پشیمانی و آربیتراژ پارتو', shortLabel: 'پشیمانی و پارتو', icon: Compass },
  { id: 'RENT_VS_BUY', domain: 'ARBITRAGE', label: 'خرید در برابر اجاره و سرمایه‌گذاری', shortLabel: 'خرید یا اجاره (NPV)', icon: Split },
  { id: 'URBAN_AFFORDABILITY', domain: 'ARBITRAGE', label: 'استطاعت مسکن و تردد (TCOH)', shortLabel: 'استطاعت و تردد', icon: Briefcase },
  { id: 'MONTE_CARLO_VAR', domain: 'RISK_CYCLE', label: 'شبیه‌ساز مونت‌کارلو و VaR', shortLabel: 'مونت‌کارلو و VaR', icon: Activity },
  { id: 'HOUSING_CYCLE', domain: 'RISK_CYCLE', label: 'چرخه‌های مسکن و حباب', shortLabel: 'چرخه مسکن و حباب', icon: PieChart },
  { id: 'REAL_OPTIONS', domain: 'RISK_CYCLE', label: 'اختیارات واقعی و نقدشوندگی', shortLabel: 'اختیارات و نقدشوندگی', icon: Hourglass },
  { id: 'MACRO_PORTFOLIO', domain: 'FIELD_CROWD', label: 'تخصیص دارایی و طلا/دلار', shortLabel: 'تخصیص دارایی کلان', icon: Wallet },
  { id: 'CROWD_CLAIMS', domain: 'FIELD_CROWD', label: 'گزارش‌های میدانی و امتیازدهی', shortLabel: 'راستی‌آزمایی میدانی', icon: Users },
  { id: 'SOCIOECONOMIC_REFERENCE', domain: 'FIELD_CROWD', label: 'شناسنامه پژوهشی و کوچ تقاضا', shortLabel: 'شناسنامه و کوچ تقاضا', icon: BookOpen },
];

export const Stage2MasterWidget: React.FC<Stage2MasterWidgetProps> = ({
  hoodId,
  hoodName,
  cityId,
  basePriceSqm,
  targetSqm = 85,
  intlCurrency = 'USD',
  hood,
  cityKey,
  initialTab,
  onTabChange,
  onSelectCompareHood,
}) => {
  const [activeTab, setActiveTabState] = useState<Stage2ActiveTab>(initialTab ?? 'DECISION_SYNTHESIS');
  const [sharedTargetSqm, setSharedTargetSqm] = useState<number>(targetSqm);

  React.useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabState(initialTab);
    }
  }, [initialTab]);

  React.useEffect(() => {
    setSharedTargetSqm(targetSqm);
  }, [targetSqm]);

  const setActiveTab = (tab: Stage2ActiveTab) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };

  const resolvedHoodId = hoodId ?? hood?.id ?? 1;
  const effectiveHood: Neighborhood =
    hood ??
    getAllMultiCityNeighborhoods().find((n) => n.id === resolvedHoodId) ??
    INITIAL_NEIGHBORHOODS[0];
  const resolvedHoodName = hoodName ?? effectiveHood.name ?? 'محله';
  const resolvedCity = String(cityId ?? cityKey ?? 'tehran');
  const resolvedBasePrice = basePriceSqm ?? effectiveHood.buyPerSqm ?? 120;
  const activeTabMeta = STAGE2_TABS.find((t) => t.id === activeTab) ?? STAGE2_TABS[0];
  const activeDomain = activeTabMeta.domain;
  const domainTabs = STAGE2_TABS.filter((t) => t.domain === activeDomain);
  const liveAgg = React.useMemo(
    () => aggregateNeighborhoodMarketMetrics(resolvedHoodId, resolvedHoodName, resolvedBasePrice, buildNeighborhoodListingSamples(effectiveHood)),
    [resolvedHoodId, resolvedHoodName, resolvedBasePrice, effectiveHood],
  );
  const provenanceTitleFa =
    liveAgg.dataMode === 'OBSERVED_MARKET'
      ? `داده مشاهده‌شده واقعی (${toPersianNum(liveAgg.eligibleObservedCount)} آگهی)`
      : liveAgg.dataMode === 'LIMITED_OBSERVED_BLEND'
        ? `ترکیب مشاهدات محدود (${toPersianNum(liveAgg.eligibleObservedCount)} آگهی) و مدل پایه`
        : 'برآورد مدل پایه (بدون آگهی مشاهده‌شده)';

  return (
    <section
      data-testid="stage2-master-widget"
      aria-label="هوش معرفتی، اجتماعی-اقتصادی و راستی‌آزمایی میدانی محله"
      className="mt-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50/60 dark:from-slate-900 dark:via-slate-900/95 dark:to-indigo-950/30 p-3.5 shadow-sm space-y-3"
      dir="rtl"
    >
      {/* Header Banner + Quick-Jump Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              موتور تصمیم‌یار معرفتی، پارتو، سرایت فضایی و هوش اجتماعی ({resolvedHoodName})
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              سناریوی مذاکره (v6.4 · غیرثبتی): متری {toPersianNum(liveAgg.estimatedDealPricePerSqm)} م.ت ({formatMillionTomanAsIntlCurrency(liveAgg.estimatedDealPricePerSqm, intlCurrency, 'fa')}) · منشأ: {provenanceTitleFa} · شکارهای زیر قیمت: {toPersianNum(liveAgg.autoBargains.length)} مورد
            </p>
          </div>
        </div>
        <select
          aria-label="پرش سریع به آزمایشگاه تصمیم‌گیری"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as Stage2ActiveTab)}
          className="text-[11px] font-bold rounded-xl border border-indigo-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 shadow-2xs cursor-pointer"
        >
          {STAGE2_TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* 4 Strategic Domain Switcher + Active 3-Tab Sub-Bar */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          {STAGE2_DOMAINS.map((dom) => {
            const isDomActive = activeDomain === dom.id;
            return (
              <button
                key={dom.id}
                type="button"
                aria-pressed={isDomActive}
                onClick={() => {
                  const firstInDom = STAGE2_TABS.find((t) => t.domain === dom.id);
                  if (firstInDom) setActiveTab(firstInDom.id);
                }}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer border ${
                  isDomActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-100/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/70 dark:border-slate-700 hover:bg-slate-200/70'
                }`}
              >
                {dom.label}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label="زبانه‌های موتور تصمیم‌یار معرفتی کسپر"
          className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700"
        >
          {domainTabs.map((tab, idx) => {
            const IconC = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`stage2-tab-${tab.id}`}
                aria-controls={`stage2-panel-${tab.id}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-label={tab.label}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  const nextIdx = e.key === 'ArrowRight' ? (idx - 1 + domainTabs.length) % domainTabs.length : e.key === 'ArrowLeft' ? (idx + 1) % domainTabs.length : -1;
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    setActiveTab(domainTabs[nextIdx].id);
                    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIdx]?.focus();
                  }
                }}
                className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-indigo-100 dark:border-indigo-800/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <IconC className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Panel (neighborhood={effectiveHood}) */}
      <div id={`stage2-panel-${activeTab}`} role="tabpanel" aria-labelledby={`stage2-tab-${activeTab}`}>
        {(() => {
          const common = { hoodId: resolvedHoodId, hoodName: resolvedHoodName, cityKey: resolvedCity, basePriceSqm: resolvedBasePrice, hood: effectiveHood };
          switch (activeTab) {
            case 'DECISION_SYNTHESIS':
              return <UnifiedDecisionSynthesisCard {...common} initialTargetSqm={sharedTargetSqm} onTargetSqmChange={setSharedTargetSqm} intlCurrency={intlCurrency} onSelectTab={(t) => setActiveTab(t as Stage2ActiveTab)} />;
            case 'EPISTEMIC_PROVENANCE':
              return <EpistemicProvenancePanel {...common} initialTargetSqm={sharedTargetSqm} onTargetSqmChange={setSharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'PARETO_REGRET':
              return <ParetoRegretSimulatorCard {...common} initialTargetSqm={sharedTargetSqm} onTargetSqmChange={setSharedTargetSqm} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />;
            case 'SPATIAL_CONTAGION':
              return <SpatialContagionLabCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />;
            case 'REAL_OPTIONS':
              return <RealOptionsLiquidityCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'URBAN_AFFORDABILITY':
              return <UrbanAffordabilityIsochroneCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />;
            case 'MONTE_CARLO_VAR':
              return <MonteCarloRiskDensityCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'HOUSING_CYCLE':
              return <HousingCycleRegimeCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'MACRO_PORTFOLIO':
              return <MacroPortfolioArbitrageCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'RENT_VS_BUY':
              return <RentVsBuyArbitrageCard {...common} initialTargetSqm={sharedTargetSqm} onTargetSqmChange={setSharedTargetSqm} intlCurrency={intlCurrency} />;
            case 'CROWD_CLAIMS':
              return <NeighborhoodCrowdClaimsPanel {...common} intlCurrency={intlCurrency} />;
            case 'SOCIOECONOMIC_REFERENCE':
            default:
              return <SocioeconomicReferenceCard {...common} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />;
          }
        })()}
      </div>
    </section>
  );
};

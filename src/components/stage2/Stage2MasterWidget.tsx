import React, { useState } from 'react';
import { Sparkles, Users, BookOpen, Scale, Compass, Network, Hourglass, Briefcase, Activity, PieChart, Wallet, Split, Award } from 'lucide-react';
import type { Neighborhood } from '../../data/neighborhoods';
import type { CityId } from '../../data/multiCityData';
import type { IntlCurrencyCode } from '../../utils/areaUnit';
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
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
  cityKey?: string;
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

const STAGE2_TABS: { id: Stage2ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'DECISION_SYNTHESIS', label: 'حکم نهایی و آمادگی معامله (کسپر)', icon: Award },
  { id: 'EPISTEMIC_PROVENANCE', label: 'تفکیک معرفتی و منشأ داده', icon: Scale },
  { id: 'PARETO_REGRET', label: 'ماتریس پشیمانی و آربیتراژ پارتو', icon: Compass },
  { id: 'SPATIAL_CONTAGION', label: 'سرایت فضایی و شاخص آکرلوف', icon: Network },
  { id: 'REAL_OPTIONS', label: 'اختیارات واقعی و نقدشوندگی', icon: Hourglass },
  { id: 'URBAN_AFFORDABILITY', label: 'استطاعت مسکن و تردد (TCOH)', icon: Briefcase },
  { id: 'MONTE_CARLO_VAR', label: 'شبیه‌ساز مونت‌کارلو و VaR', icon: Activity },
  { id: 'HOUSING_CYCLE', label: 'چرخه‌های مسکن و حباب', icon: PieChart },
  { id: 'MACRO_PORTFOLIO', label: 'تخصیص دارایی و طلا/دلار', icon: Wallet },
  { id: 'RENT_VS_BUY', label: 'خرید در برابر اجاره و سرمایه‌گذاری', icon: Split },
  { id: 'CROWD_CLAIMS', label: 'گزارش‌های میدانی و امتیازدهی', icon: Users },
  { id: 'SOCIOECONOMIC_REFERENCE', label: 'شناسنامه پژوهشی و کوچ تقاضا', icon: BookOpen },
];

export const Stage2MasterWidget: React.FC<Stage2MasterWidgetProps> = ({
  hoodId,
  hoodName,
  cityId,
  basePriceSqm,
  intlCurrency = 'USD',
  hood,
  cityKey,
  onSelectCompareHood,
}) => {
  const [activeTab, setActiveTab] = useState<Stage2ActiveTab>('DECISION_SYNTHESIS');

  const resolvedHoodId = hoodId ?? hood?.id ?? 1;
  const resolvedHoodName = hoodName ?? hood?.name ?? 'محله';
  const resolvedCity = String(cityId ?? cityKey ?? 'tehran');
  const resolvedBasePrice = basePriceSqm ?? hood?.buyPerSqm ?? 120;

  return (
    <section
      aria-label="هوش معرفتی، اجتماعی-اقتصادی و راستی‌آزمایی میدانی محله"
      className="mt-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50/60 dark:from-slate-900 dark:via-slate-900/95 dark:to-indigo-950/30 p-3.5 shadow-sm space-y-3"
      dir="rtl"
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              موتور تصمیم‌یار معرفتی، پارتو، سرایت فضایی و هوش اجتماعی ({resolvedHoodName})
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              تفکیک ۱۲ لایه داده، سپر شناختی، ماتریس پشیمانی ساواج، شاخص آکرلوف و کوچ تقاضا
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700">
          {STAGE2_TABS.map((tab) => {
            const IconC = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-indigo-100 dark:border-indigo-800/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <IconC className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'DECISION_SYNTHESIS' ? (
        <UnifiedDecisionSynthesisCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'EPISTEMIC_PROVENANCE' ? (
        <EpistemicProvenancePanel
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'PARETO_REGRET' ? (
        <ParetoRegretSimulatorCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
          onSelectCompareHood={onSelectCompareHood}
        />
      ) : activeTab === 'SPATIAL_CONTAGION' ? (
        <SpatialContagionLabCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          onSelectCompareHood={onSelectCompareHood}
        />
      ) : activeTab === 'REAL_OPTIONS' ? (
        <RealOptionsLiquidityCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'URBAN_AFFORDABILITY' ? (
        <UrbanAffordabilityIsochroneCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'MONTE_CARLO_VAR' ? (
        <MonteCarloRiskDensityCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'HOUSING_CYCLE' ? (
        <HousingCycleRegimeCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'MACRO_PORTFOLIO' ? (
        <MacroPortfolioArbitrageCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'RENT_VS_BUY' ? (
        <RentVsBuyArbitrageCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
          basePriceSqm={resolvedBasePrice}
          intlCurrency={intlCurrency}
        />
      ) : activeTab === 'CROWD_CLAIMS' ? (
        <NeighborhoodCrowdClaimsPanel
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          cityKey={resolvedCity}
        />
      ) : (
        <SocioeconomicReferenceCard
          hoodId={resolvedHoodId}
          hoodName={resolvedHoodName}
          basePriceSqm={resolvedBasePrice}
          cityKey={resolvedCity}
          onSelectCompareHood={onSelectCompareHood}
        />
      )}
    </section>
  );
};

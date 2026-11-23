import React from 'react';
import { ArrowUpRight, ShieldCheck, Sparkles } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../../utils/areaUnit';
import { Stage2MasterWidget, type Stage2ActiveTab } from '../../../components/stage2/Stage2MasterWidget';

export interface MarketExperienceFooterProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity: string;
  intlCurrency: IntlCurrencyCode;
  experienceMode: 'simple' | 'pro';
  stage2Tab: Stage2ActiveTab;
  onSetExperienceMode: (m: 'simple' | 'pro') => void;
  onSetStage2Tab: (t: Stage2ActiveTab) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
}

export const MarketExperienceFooter: React.FC<MarketExperienceFooterProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  activeCity,
  intlCurrency,
  experienceMode,
  stage2Tab,
  onSetExperienceMode,
  onSetStage2Tab,
  onSelectNeighborhood,
  onOpenInspector,
}) => {
  return (
    <>
      <div
        data-testid="intelligence-experience-mode-bar"
        className="p-3.5 rounded-xl bg-[var(--color-bg-canvas)] dark:bg-slate-800/70 border border-[var(--color-border-subtle)] dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <span className="font-bold text-[var(--color-text-primary)] dark:text-slate-100">
            {experienceMode === 'simple'
              ? 'حالت تحلیلی استاندارد (متمرکز بر شاخص‌های مرجع و کیفیت داده)'
              : 'حالت حرفه‌ای (۱۲ آزمایشگاه اقتصادسنجی و راستی‌آزمایی جمعی فعال است)'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenInspector(selectedHood)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-600 bg-white dark:bg-slate-900 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>کارنامه محله {selectedHood.name}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="intelligence-open-crowd-claims-btn"
            onClick={() => {
              onSetStage2Tab('CROWD_CLAIMS');
              onSetExperienceMode('pro');
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ثبت / مشاهده قولنامه‌ها</span>
          </button>
          <button
            type="button"
            onClick={() => onSetExperienceMode(experienceMode === 'pro' ? 'simple' : 'pro')}
            className="px-3 py-1.5 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-600 bg-white dark:bg-slate-900 text-[var(--color-text-primary)] dark:text-slate-200 font-bold cursor-pointer"
          >
            {experienceMode === 'pro' ? 'بازگشت به نمای استاندارد' : 'آزمایشگاه‌های حرفه‌ای'}
          </button>
        </div>
      </div>

      {experienceMode === 'pro' && (
        <Stage2MasterWidget
          hoodId={selectedHood.id}
          hoodName={selectedHood.name}
          cityKey={activeCity}
          basePriceSqm={selectedHood.buyPerSqm}
          intlCurrency={intlCurrency}
          hood={selectedHood}
          initialTab={stage2Tab}
          onTabChange={onSetStage2Tab}
          onSelectCompareHood={(targetName) => {
            const match = evaluatedNeighborhoods.find((h) => h.name === targetName);
            if (match) onSelectNeighborhood(match);
          }}
        />
      )}
    </>
  );
};

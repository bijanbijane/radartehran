/** @file src/components/common/RadarDataBadges.tsx — RT-UI-COMP-001 Cards, Credibility Badges & RTD10 Provenance */
import React from 'react';
import { CheckCircle2, Info, AlertTriangle, Clock } from 'lucide-react';
import { DATA_CREDIBILITY_SPECS, type DataCredibilityStatus } from '../../design-system/componentSystem';

const CREDIBILITY_STYLES: Record<DataCredibilityStatus, { cls: string; Icon: React.FC<{ className?: string }> }> = {
  verified: {
    cls: 'bg-[#EAF5EE] text-[#176B4C] border-[#BBE0CA] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Icon: CheckCircle2,
  },
  estimated: {
    cls: 'bg-[#EAF3FB] text-[#155E9A] border-[#BFD9F0] dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    Icon: Info,
  },
  incomplete: {
    cls: 'bg-[#FFF4E5] text-[#875000] border-[#F4D3A1] dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    Icon: AlertTriangle,
  },
  stale: {
    cls: 'bg-[#F1F4F2] text-[#586760] border-[#DCE3DF] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Icon: Clock,
  },
};

export const DataCredibilityBadge: React.FC<{
  status: DataCredibilityStatus;
  locale?: 'fa' | 'en';
}> = ({ status, locale = 'fa' }) => {
  const spec = DATA_CREDIBILITY_SPECS[status];
  const { cls, Icon } = CREDIBILITY_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] border text-[13px] font-semibold leading-[1.4] ${cls}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{locale === 'en' ? spec.labelEn : spec.labelFa}</span>
    </span>
  );
};

export const DataProvenanceBar: React.FC<{
  sourceLabel: string;
  updatedAtLabel: string;
  methodLabel: string;
  credibility: DataCredibilityStatus;
  limitationNote?: string;
}> = ({ sourceLabel, updatedAtLabel, methodLabel, credibility, limitationNote }) => (
  <div className="rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 bg-[#F6F8F6] dark:bg-slate-900/70 p-3 space-y-1.5 text-[13px] text-[#34433E] dark:text-slate-300">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DataCredibilityBadge status={credibility} />
      <span className="text-[#586760] dark:text-slate-400">به‌روزرسانی: {updatedAtLabel}</span>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <span><strong>منبع:</strong> {sourceLabel}</span>
      <span><strong>روش تولید:</strong> {methodLabel}</span>
    </div>
    {limitationNote && <p className="text-[#586760] dark:text-slate-400 leading-[1.6]">{limitationNote}</p>}
  </div>
);

export const RadarCard: React.FC<{
  padding?: 'compact' | 'standard' | 'large';
  elevated?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ padding = 'standard', elevated = false, className = '', children }) => {
  const pad = padding === 'compact' ? 'p-3' : padding === 'large' ? 'p-5' : 'p-4';
  return (
    <div className={`rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 bg-white dark:bg-slate-900 ${elevated ? 'shadow-xs' : ''} ${pad} ${className}`}>
      {children}
    </div>
  );
};

export const RadarMetricCard: React.FC<{
  title: string;
  valueText: string;
  unitText: string;
  periodAndSource: string;
  credibility?: DataCredibilityStatus;
}> = ({ title, valueText, unitText, periodAndSource, credibility = 'verified' }) => (
  <RadarCard padding="standard" elevated>
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[13px] font-medium text-[#586760] dark:text-slate-400">{title}</span>
      <DataCredibilityBadge status={credibility} />
    </div>
    <div className="data-value text-[#182522] dark:text-white tabular-nums">{valueText}</div>
    <div className="text-[13px] font-medium text-[#34433E] dark:text-slate-300 mt-1">{unitText}</div>
    <div className="text-[13px] text-[#586760] dark:text-slate-400 mt-2 pt-2 border-t border-[#DCE3DF]/80 dark:border-slate-800">{periodAndSource}</div>
  </RadarCard>
);

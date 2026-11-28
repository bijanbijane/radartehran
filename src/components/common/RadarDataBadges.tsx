/** @file src/components/common/RadarDataBadges.tsx — RT-UI-COMP-001 Cards, Credibility Badges & RTD10 Provenance */
import React from 'react';
import { RadarSurfaceCard } from './RadarSurfaceCard';
import { CheckCircle2, Info, AlertTriangle, Clock } from 'lucide-react';
import { DATA_CREDIBILITY_SPECS, type DataCredibilityStatus } from '../../design-system/componentSystem';

const CREDIBILITY_STYLES: Record<DataCredibilityStatus, { cls: string; Icon: React.FC<{ className?: string }> }> = {
  verified: {
    cls: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]',
    Icon: CheckCircle2,
  },
  estimated: {
    cls: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]',
    Icon: Info,
  },
  incomplete: {
    cls: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]',
    Icon: AlertTriangle,
  },
  stale: {
    cls: 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-muted)] dark:text-[var(--color-text-secondary)] dark:border-[var(--color-border-strong)]',
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
  <div className="rounded-[12px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] dark:bg-[var(--color-bg-surface)] p-3 space-y-1.5 text-[13px] text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DataCredibilityBadge status={credibility} />
      <span className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">به‌روزرسانی: {updatedAtLabel}</span>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <span><strong>منبع:</strong> {sourceLabel}</span>
      <span><strong>روش تولید:</strong> {methodLabel}</span>
    </div>
    {limitationNote && <p className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] leading-[1.6]">{limitationNote}</p>}
  </div>
);

export const RadarCard: React.FC<{
  padding?: 'compact' | 'standard' | 'large';
  elevated?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ padding = 'standard', elevated = false, className = '', children }) => (
  <RadarSurfaceCard padding={padding} elevated={elevated} className={className}>
    {children}
  </RadarSurfaceCard>
);

export const RadarMetricCard: React.FC<{
  title: string;
  valueText: string;
  unitText: string;
  periodAndSource: string;
  credibility?: DataCredibilityStatus;
}> = ({ title, valueText, unitText, periodAndSource, credibility = 'verified' }) => (
  <RadarCard padding="standard" elevated>
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[13px] font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{title}</span>
      <DataCredibilityBadge status={credibility} />
    </div>
    <div className="data-value text-[var(--color-text-primary)] tabular-nums">{valueText}</div>
    <div className="text-[13px] font-medium text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] mt-1">{unitText}</div>
    <div className="text-[13px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] mt-2 pt-2 border-t border-[var(--color-border-subtle)]/80 dark:border-[var(--color-border-subtle)]">{periodAndSource}</div>
  </RadarCard>
);

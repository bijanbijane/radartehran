/** @file src/components/views/ValidationAndImplementLabTab.tsx — Stage 10 (RT-UI-VALIDATION-001) & Stage 11 (RT-UI-IMPLEMENT-001) Interactive QA & Pilot Rollout Console */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flag, Gauge, Layers, RotateCcw, ShieldAlert } from 'lucide-react';
import { RadarButton } from '../common/RadarButton';
import { RadarCard } from '../common/RadarDataBadges';
import {
  CORE_USER_JOURNEYS,
  PILOT_MAP_SCOPE_ITEMS,
  PROTOTYPE_SCOPE_VP,
  QA_VALIDATION_DOMAINS,
  STAGE_10_ACCEPTANCE_COUNT,
  STAGE_11_ACCEPTANCE_COUNT,
  type DesignQaIssue,
} from '../../interaction-system/contracts/validationAndImplementContract';
import {
  calculateIssuePriorityScore,
  canPassValidationGate,
  evaluatePerformanceBudget,
  getDefaultUiRolloutFlags,
  rollbackAllControlledFlags,
  toggleRolloutFlagSafe,
} from '../../interaction-system/validationEngines';
import { STAGE_12_DS_PHASES } from '../../design-system/componentSystem';
import { HOME_ACCEPTANCE_CHECKLIST_18 } from '../../features/home/services/homeDataAdapter';
import { MAP_IMPLEMENTATION_PACKAGES_19 } from '../../features/map/services/mapExperienceEngine';
import { STAGE_16_ACCEPTANCE_CHECKLIST_25 } from '../../features/map/services/layerManagementRegistry';
import { STAGE_17_ACCEPTANCE_CHECKLIST_30 } from '../../features/neighborhoods/services/neighborhoodProfileEngine';

const INITIAL_QA_ISSUES: DesignQaIssue[] = [
  {
    id: 'ISS-001',
    pageId: 'VP-02',
    componentId: 'RadarBottomNav',
    scenarioId: 'TEST-05',
    severity: 'S1',
    impact: 5,
    frequency: 4,
    recoveryDifficulty: 4,
    descriptionFa: 'خطای Hook هنگام بازگشت از مدیریت به نقشه (برطرف و تایید شده)',
    status: 'verified',
  },
  {
    id: 'ISS-002',
    pageId: 'VP-06',
    componentId: 'FilterChips',
    scenarioId: 'TEST-02',
    severity: 'S2',
    impact: 3,
    frequency: 3,
    recoveryDifficulty: 2,
    descriptionFa: 'نمایش برچسب فیلتر فعال روی نوار بالای نقشه (تایید شده)',
    status: 'verified',
  },
];

export const ValidationAndImplementLabTab: React.FC = () => {
  const [issues, setIssues] = useState<DesignQaIssue[]>(INITIAL_QA_ISSUES);
  const [flags, setFlags] = useState(() => getDefaultUiRolloutFlags());
  const [cwvSample, setCwvSample] = useState({ lcpMs: 1450, inpMs: 95, cls: 0.03, selectionLatencyMs: 140 });

  const gateStatus = useMemo(() => canPassValidationGate(issues), [issues]);
  const budgetEval = useMemo(() => evaluatePerformanceBudget(cwvSample), [cwvSample]);

  const toggleSimulateCriticalIssue = () => {
    setIssues((prev) => {
      const existing = prev.find((i) => i.id === 'ISS-SIM-S1');
      if (existing) {
        return prev.map((i) =>
          i.id === 'ISS-SIM-S1' ? { ...i, status: i.status === 'open' ? 'verified' : 'open' } : i,
        );
      }
      return [
        {
          id: 'ISS-SIM-S1',
          pageId: 'VP-08',
          componentId: 'PriceCard',
          scenarioId: 'TEST-01',
          severity: 'S1',
          impact: 5,
          frequency: 4,
          recoveryDifficulty: 4,
          descriptionFa: 'شبیه‌سازی خطای بحرانی نمایش قیمت متعلق به محله دیگر',
          status: 'open',
        },
        ...prev,
      ];
    });
  };

  return (
    <div className="space-y-5" data-testid="validation-implement-lab-tab">
      <RadarCard padding="standard" elevated>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>۱. دروازه‌های پذیرش مرحله دهم و ثبت اشکال (S0–S4 · Design Freeze Gate)</span>
          </h3>
          <span
            data-testid="design-freeze-gate-badge"
            className={`text-[11.5px] font-bold px-2.5 py-1 rounded-[6px] ${
              gateStatus.allowed ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]' : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
            }`}
          >
            {gateStatus.statusLabelFa}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <RadarButton variant="outline" size="sm" onClick={toggleSimulateCriticalIssue}>
            {issues.some((i) => i.id === 'ISS-SIM-S1' && i.status === 'open')
              ? 'تایید رفع خطای شبیه‌سازی‌شده (S1)'
              : 'شبیه‌سازی بروز خطای بحرانی (S1)'}
          </RadarButton>
          <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
            دامنه‌های QA: {QA_VALIDATION_DOMAINS.length}/۵ · صفحات VP: {PROTOTYPE_SCOPE_VP.length}/۱۴ · جریان‌ها: {CORE_USER_JOURNEYS.length}/۵ · چک‌لیست پذیرش: {STAGE_10_ACCEPTANCE_COUNT}
          </span>
        </div>

        <div className="space-y-2">
          {issues.map((iss) => {
            const score = calculateIssuePriorityScore(iss.impact, iss.frequency, iss.recoveryDifficulty);
            return (
              <div
                key={iss.id}
                className="p-2.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-wrap items-center justify-between gap-2 text-[12px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded-[4px] font-bold text-[11px] ${iss.status === 'open' ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'}`}>
                    {iss.severity} · اولویت {score}
                  </span>
                  <span className="font-medium text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] truncate">{iss.descriptionFa}</span>
                </div>
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {iss.pageId} · {iss.status === 'open' ? 'باز (مانع انتشار)' : 'تایید و بسته‌شده'}
                </span>
              </div>
            );
          })}
        </div>
      </RadarCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RadarCard padding="standard" elevated>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>۲. بودجه Core Web Vitals و نقشه (MAP-P01..P06)</span>
            </h3>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[6px] ${budgetEval.passedAll ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'}`}>
              {budgetEval.passedAll ? 'مطابق بودجه' : 'نیازمند بهینه‌سازی'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px] mb-3 tabular-nums">
            <div className="p-2 rounded-[8px] bg-[var(--color-bg-muted)] dark:bg-[var(--color-bg-muted)]">LCP: <strong>{cwvSample.lcpMs}ms</strong> (≤ 2500ms)</div>
            <div className="p-2 rounded-[8px] bg-[var(--color-bg-muted)] dark:bg-[var(--color-bg-muted)]">INP: <strong>{cwvSample.inpMs}ms</strong> (≤ 200ms)</div>
            <div className="p-2 rounded-[8px] bg-[var(--color-bg-muted)] dark:bg-[var(--color-bg-muted)]">CLS: <strong>{cwvSample.cls}</strong> (≤ 0.1)</div>
            <div className="p-2 rounded-[8px] bg-[var(--color-bg-muted)] dark:bg-[var(--color-bg-muted)]">MAP-P06: <strong>{cwvSample.selectionLatencyMs}ms</strong> (≤ 300ms)</div>
          </div>
          <div className="flex items-center gap-2">
            <RadarButton variant="outline" size="sm" onClick={() => setCwvSample({ lcpMs: 3100, inpMs: 240, cls: 0.08, selectionLatencyMs: 360 })}>
              شبیه‌سازی شبکه ضعیف
            </RadarButton>
            <RadarButton variant="secondary" size="sm" onClick={() => setCwvSample({ lcpMs: 1450, inpMs: 95, cls: 0.03, selectionLatencyMs: 140 })}>
              بازگردانی وضعیت بهینه
            </RadarButton>
          </div>
        </RadarCard>

        <RadarCard padding="standard" elevated>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>۳. دامنه پایلوت نقشه (RT-PILOT-MAP-001)</span>
            </h3>
            <span className="text-[11px] font-bold text-[var(--color-text-muted)] tabular-nums">پذیرش: {STAGE_11_ACCEPTANCE_COUNT} بند</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto text-[11.5px]">
            {PILOT_MAP_SCOPE_ITEMS.map((item) => (
              <div key={item.key} className="p-1.5 rounded-[6px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] flex items-center justify-between gap-1">
                <span className="truncate font-medium">{item.titleFa}</span>
                {item.status === 'required' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)] shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </RadarCard>
      </div>

      <RadarCard padding="standard" elevated>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Flag className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>۴. پرچم‌های انتشار تدریجی و بازگشت فوری (UI_FLAGS & Rollback · §9)</span>
          </h3>
          <RadarButton
            variant="destructive"
            size="sm"
            leadingIcon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => setFlags((prev) => rollbackAllControlledFlags(prev))}
          >
            بازگشت اضطراری ماژول‌های جدید (Rollback)
          </RadarButton>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {flags.map((flag) => (
            <label
              key={flag.key}
              className="p-2.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex items-center justify-between gap-2 cursor-pointer text-[12px]"
            >
              <div className="min-w-0">
                <div className="font-bold text-[var(--color-text-primary)] truncate">{flag.titleFa}</div>
                <div className="text-[10.5px] text-[var(--color-text-muted)]">{flag.rolloutPhase} · مالک: {flag.owner}</div>
              </div>
              <input
                type="checkbox"
                checked={flag.enabled}
                onChange={(e) => setFlags((prev) => toggleRolloutFlagSafe(prev, flag.key, e.target.checked))}
                aria-label={`وضعیت ${flag.key}`}
                className="accent-[var(--color-brand-600)] shrink-0"
              />
            </label>
          ))}
        </div>
      </RadarCard>

      <RadarCard padding="standard" elevated data-testid="stages-1-to-17-audit-matrix">
        <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-2.5">
          ۵. ماتریس ممیزی و پذیرش مراحل ۱ تا ۱۷ (End-to-End Stage 1–17 Verification)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11.5px] tabular-nums">
          <div className="p-2.5 rounded-[8px] bg-[var(--color-success-bg)] text-[var(--color-success)] font-bold">مرحله ۱۲–۱۳ (DS): {STAGE_12_DS_PHASES.length}/۹ فاز</div>
          <div className="p-2.5 rounded-[8px] bg-[var(--color-success-bg)] text-[var(--color-success)] font-bold">مرحله ۱۴ (Home): {HOME_ACCEPTANCE_CHECKLIST_18.length}/۱۸ معیار</div>
          <div className="p-2.5 rounded-[8px] bg-[var(--color-success-bg)] text-[var(--color-success)] font-bold">مرحله ۱۵ (Map): {MAP_IMPLEMENTATION_PACKAGES_19.length}/۱۹ بسته</div>
          <div className="p-2.5 rounded-[8px] bg-[var(--color-success-bg)] text-[var(--color-success)] font-bold">مرحله ۱۶ (Layers): {STAGE_16_ACCEPTANCE_CHECKLIST_25.length}/۲۵ معیار</div>
          <div className="p-2.5 rounded-[8px] bg-[var(--color-success-bg)] text-[var(--color-success)] font-bold">مرحله ۱۷ (Hood): {STAGE_17_ACCEPTANCE_CHECKLIST_30.length}/۳۰ معیار</div>
        </div>
      </RadarCard>
    </div>
  );
};

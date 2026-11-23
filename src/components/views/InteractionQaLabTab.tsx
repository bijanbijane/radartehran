/** @file src/components/views/InteractionQaLabTab.tsx — RT-UI-INTERACTION-001 & RT-UI-VALIDATION-001 Interactive QA Sandbox */
import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { RadarButton } from '../common/RadarButton';
import { RadarCard } from '../common/RadarDataBadges';
import {
  INTERACTION_ACCEPTANCE_CRITERIA,
  STAGE_10_QA_SCENARIOS,
} from '../../interaction-system/contracts/interactionContract';
import {
  applyDraftFilters,
  buildFourPartInteractionError,
  buildPrivacySafeInteractionEvent,
  createDualFilterState,
  createIdempotentRequestKey,
  createLatestRequestGuard,
  getActiveFilterChips,
  hasMapViewportMovedSignificantly,
  removeAppliedFilterChip,
} from '../../interaction-system/interactionEngines';
import { parseLocalizedNumber } from '../../utils/forms/formInputHelpers';

export const InteractionQaLabTab: React.FC = () => {
  const [filters, setFilters] = useState(() => createDualFilterState({ dealType: 'buy', hasParking: true }));
  const [viewportMoved, setViewportMoved] = useState(false);
  const [raceWinner, setRaceWinner] = useState<string>('آماده آزمایش همزمانی پاسداران ← ونک');
  const [valSqm, setValSqm] = useState<string>('95');
  const [valError, setValError] = useState<string | null>(null);
  const [valSubmitting, setValSubmitting] = useState<boolean>(false);
  const [valResult, setValResult] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string>(() => createIdempotentRequestKey({ hoodId: 5, sqm: 95, buildYear: 1398, attemptNonce: 'demo1' }));
  const [telemetryPreview, setTelemetryPreview] = useState<string>('');
  const [passedFlows, setPassedFlows] = useState<Record<string, boolean>>({
    'Flow-A': true,
    'Flow-B': true,
    'Flow-C': true,
    'Flow-D': true,
  });

  const chips = getActiveFilterChips(filters.applied);
  const hasPendingDraftChanges =
    JSON.stringify(filters.draft) !== JSON.stringify(filters.applied);
  const boundsNeedsRefresh = hasMapViewportMovedSignificantly(
    { north: 35.8, south: 35.65, east: 51.5, west: 51.3, zoom: 12 },
    viewportMoved
      ? { north: 35.85, south: 35.7, east: 51.54, west: 51.34, zoom: 12 }
      : { north: 35.8, south: 35.65, east: 51.5, west: 51.3, zoom: 12 },
  );

  const runRaceSimulation = () => {
    const guard = createLatestRequestGuard();
    const slowOld = guard.issue('پاسداران');
    const fastNew = guard.issue('ونک');
    let winner = '';
    setTimeout(() => {
      if (guard.isCurrent(fastNew)) winner = 'نتیجه معتبر: ونک (درخواست جدید پذیرفته شد)';
      if (guard.isCurrent(slowOld)) winner = 'خطا: پاسداران قدیمی بازنویسی شد!';
      setRaceWinner(winner);
    }, 30);
    setTelemetryPreview(
      JSON.stringify(
        buildPrivacySafeInteractionEvent({
          eventId: 'qa-race-1',
          eventType: 'search_race_guard',
          module: 'search',
          outcome: 'success',
          durationMs: 30,
          metadata: { queryLen: 3, phone: '09120001122', rawInput: 'پاسداران' },
        }),
      ),
    );
  };

  const runValuationSimulation = (simulateNetworkError: boolean) => {
    if (valSubmitting) return;
    setValSubmitting(true);
    setTimeout(() => {
      setValSubmitting(false);
      if (simulateNetworkError) {
        const err = buildFourPartInteractionError({
          whatHappened: 'اتصال سرور ارزش‌گذاری موقتاً برقرار نشد.',
          affectedModule: 'محاسبه ارزش ملک',
          unaffectedModulesNote: 'مقادیر فرم شما حفظ شده‌اند و تغییر نکردند.',
          previousStatePreserved: true,
          retryActionLabel: 'با همان شناسه یکتا دوباره تلاش کنید',
        });
        setValError(err.formattedMessageFa);
        setValResult(null);
      } else {
        setValError(null);
        setValResult(`برآورد هدونیک برای ${valSqm} متر ثبت شد (شناسه یکتا: ${requestKey})`);
      }
    }, 150);
  };

  return (
    <div className="space-y-5" data-testid="interaction-qa-lab-tab">
      <RadarCard padding="standard" elevated>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>۱. تفکیک Draft و Applied Filters (§4.1 - §4.4)</span>
          </h3>
          {hasPendingDraftChanges && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-[6px] bg-[#FFF4E5] text-[#875000]">
              تغییرات پیش‌نویس اعمال‌نشده
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px] mb-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.draft.hasParking}
              onChange={(e) => setFilters((s) => ({ ...s, draft: { ...s.draft, hasParking: e.target.checked } }))}
              className="accent-[var(--color-brand-600)]"
            />
            <span>پارکینگ</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.draft.hasElevator}
              onChange={(e) => setFilters((s) => ({ ...s, draft: { ...s.draft, hasElevator: e.target.checked } }))}
              className="accent-[var(--color-brand-600)]"
            />
            <span>آسانسور</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.draft.hasStorage}
              onChange={(e) => setFilters((s) => ({ ...s, draft: { ...s.draft, hasStorage: e.target.checked } }))}
              className="accent-[var(--color-brand-600)]"
            />
            <span>انباری</span>
          </label>
          <RadarButton
            variant="primary"
            size="sm"
            onClick={() => setFilters((s) => applyDraftFilters(s))}
          >
            اعمال فیلترها
          </RadarButton>
          <RadarButton
            variant="outline"
            size="sm"
            onClick={() => setViewportMoved((v) => !v)}
          >
            {boundsNeedsRefresh ? 'جست‌وجو در این محدوده' : 'شبیه‌سازی جابه‌جایی نقشه'}
          </RadarButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800">
          <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">فیلترهای فعال:</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={`حذف فیلتر ${c.labelFa}`}
              onClick={() => setFilters((s) => removeAppliedFilterChip(s, c.key))}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#EAF3F0] dark:bg-emerald-950/50 text-[#103B38] dark:text-emerald-300 text-[12px] font-semibold cursor-pointer"
            >
              <span>{c.labelFa}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      </RadarCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RadarCard padding="standard" elevated>
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] dark:text-white mb-2">۲. کنترل Race Condition و Telemetry بدون PII</h3>
          <p className="text-[12.5px] text-[var(--color-text-muted)] mb-3">ارسال متوالی درخواست «پاسداران» و بلافاصله «ونک» — پاسخ قدیمی منقضی می‌شود.</p>
          <RadarButton variant="secondary" size="sm" leadingIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={runRaceSimulation}>
            شبیه‌سازی جست‌وجوی همزمان A ← B
          </RadarButton>
          <div className="mt-3 p-2.5 rounded-[8px] bg-[var(--color-bg-muted)] dark:bg-slate-800 text-[12px] font-semibold text-[#176B4C] dark:text-emerald-300">
            {raceWinner}
          </div>
          {telemetryPreview && (
            <pre dir="ltr" className="mt-2 p-2 rounded-[6px] bg-slate-900 text-emerald-300 text-[10px] overflow-x-auto">
              {telemetryPreview}
            </pre>
          )}
        </RadarCard>

        <RadarCard padding="standard" elevated>
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] dark:text-white mb-2">۳. بازیابی خطای ارزش‌گذاری و شناسه یکتا (§9.3 - §9.5)</h3>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              aria-label="متراژ آزمایش خطا"
              value={valSqm}
              onChange={(e) => {
                const raw = e.target.value;
                setValSqm(raw);
                const parsed = parseLocalizedNumber(raw);
                const validSqm = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 95;
                setRequestKey(createIdempotentRequestKey({ hoodId: 5, sqm: validSqm, buildYear: 1398, attemptNonce: 'demo1' }));
              }}
              className="w-24 px-2.5 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] tabular-nums"
            />
            <RadarButton variant="outline" size="sm" loading={valSubmitting} onClick={() => runValuationSimulation(true)}>
              شبیه‌سازی خطای شبکه
            </RadarButton>
            <RadarButton variant="primary" size="sm" loading={valSubmitting} onClick={() => runValuationSimulation(false)}>
              تلاش مجدد امن
            </RadarButton>
          </div>
          {valError && <div role="alert" className="p-2.5 rounded-[8px] bg-[#FDECEC] text-[#A61B1B] text-[12px] font-medium">{valError}</div>}
          {valResult && <div role="status" className="p-2.5 rounded-[8px] bg-[#EAF5EE] text-[#176B4C] text-[12px] font-semibold">{valResult}</div>}
        </RadarCard>
      </div>

      <RadarCard padding="standard" elevated>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>۴. سناریوهای پذیرش تعاملات و Design QA (Stage 10 · RT-UI-VALIDATION-001)</span>
          </h3>
          <span className="text-[12px] font-bold text-[#176B4C] tabular-nums">
            {INTERACTION_ACCEPTANCE_CRITERIA.length}/۲۵ معیار مستند
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {STAGE_10_QA_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setPassedFlows((p) => ({ ...p, [sc.id]: !p[sc.id] }))}
              className="p-2.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 bg-white dark:bg-slate-900 text-start flex items-center justify-between gap-2 text-[12px] cursor-pointer"
            >
              <span className="font-medium text-[var(--color-text-primary)] dark:text-slate-100">{sc.id}: {sc.titleFa}</span>
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${passedFlows[sc.id] ? 'text-[#176B4C]' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      </RadarCard>
    </div>
  );
};

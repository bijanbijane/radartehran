/** @file src/features/onboarding/components/Stage53ProjectsStatusAndEvidencePanel.tsx — Stage 53 Project Evidence, Multi-Phase Status, Progress & Financials Panel */
import React, { useState } from 'react';
import {
  compareUrbanProjectsSafely,
  evaluateProjectEvidenceAndStatus,
  evaluateProjectProgressAndFinancials,
} from '../services/urbanProjectsEngine';
import {
  STAGE53_BOUNDARIES_8,
  type UrbanProjectRecord,
} from '../services/urbanProjectsTypes';

export const Stage53ProjectsStatusAndEvidencePanel: React.FC<{
  section: 'projects_status_and_documents' | 'progress_financials_and_comparison';
  projects: UrbanProjectRecord[];
  onFeedbackFa: (msg: string) => void;
}> = ({ section, projects, onFeedbackFa }) => {
  const [selectedId, setSelectedId] = useState(projects[0].projectId);
  const [evidenceKind, setEvidenceKind] = useState<
    'خبر رسانه‌ای' | 'مشاهده میدانی' | 'خروجی هوش مصنوعی بدون بازبین' | 'سند رسمی تأییدشده'
  >('خبر رسانه‌ای');
  const [sameUserReview, setSameUserReview] = useState(true);

  const active = projects.find((p) => p.projectId === selectedId) ?? projects[0];
  const evidenceEval = evaluateProjectEvidenceAndStatus({
    project: active,
    evidenceKind,
    registeredByUserId: 'editor-01',
    reviewerUserId: sameUserReview ? 'editor-01' : 'reviewer-02',
    targetStatus: 'در حال بهره‌برداری',
  });
  const progAndFin = evaluateProjectProgressAndFinancials(active);
  const comparison = compareUrbanProjectsSafely(projects);

  if (section === 'progress_financials_and_comparison') {
    return (
      <div className="space-y-3 text-[11px]" data-testid="stage53-progress-financials-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-amber-300 text-xs">
              ۵۳.۱۰ و ۵۳.۱۱ تفکیک پیشرفت مستند از تبلیغاتی و شفافیت ارقام مالی (UP-16..UP-19)
            </h4>
            <div className="flex gap-1.5">
              {projects.map((p) => (
                <button
                  key={p.projectId}
                  type="button"
                  onClick={() => setSelectedId(p.projectId)}
                  className={`rounded border px-2 py-0.5 text-[10px] cursor-pointer ${
                    active.projectId === p.projectId ? 'border-amber-400 bg-amber-950/40 text-white' : 'border-slate-800 bg-slate-900 text-slate-300'
                  }`}
                >
                  {p.projectId}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1.5" data-testid="up-progress-box">
            <div className="font-bold text-white">{active.titleFa}</div>
            <div>
              <strong>نوار پیشرفت مستند:</strong>{' '}
              <span className={progAndFin.showsSyntheticProgressBar ? 'text-emerald-300' : 'text-amber-300'}>
                {progAndFin.progressDisplayFa}
              </span>
            </div>
            {active.progressReportsConflict && (
              <div className="rounded border border-rose-500/40 bg-rose-950/20 p-2 text-[10px] text-rose-200">
                <strong>تعارض گزارش پیشرفت (بدون انتخاب صرفاً بر پایه تازگی):</strong>{' '}
                {active.progressReportsConflict.sourceAFa}: {active.progressReportsConflict.valueA}٪ در برابر{' '}
                {active.progressReportsConflict.sourceBFa}: {active.progressReportsConflict.valueB}٪
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5 text-[10px]">
            {progAndFin.financialLines.map((f) => (
              <div key={f.labelFa} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                <div className="text-slate-400">{f.labelFa}</div>
                <div className="font-bold text-white mt-0.5">{f.value !== null ? `${f.value} م.ت` : 'منتشر نشده'}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">
            ادغام در عدد مبهم «هزینه پروژه»: <strong>{progAndFin.collapsedIntoSingleCostNumber ? 'بله' : 'خیر (تفکیک‌شده)'}</strong> · مبنا: {active.financials.pricePeriodBaseFa}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2">
          <h4 className="font-bold text-cyan-300 text-xs">
            ۵۳.۱۸ و ۵۳.۱۹.۴ مقایسه پروژه‌ها بدون رتبه‌بندی کیفیت محله بر پایه تعداد پروژه (UP-36)
          </h4>
          <div className="space-y-1.5">
            {comparison.rows.map((r) => (
              <div key={r.projectId} className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded border border-slate-800 bg-slate-900/70 p-2 text-[10px]">
                <div className="font-bold text-white">{r.titleFa}</div>
                <div className="text-cyan-300">وضعیت: {r.status}</div>
                <div className="text-amber-300">اعتبار: {r.credibility}</div>
                <div className="text-slate-300">دقت هندسه: {r.geometryPrecisionFa} ({r.docCount} سند)</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-emerald-300">
            رتبه‌بندی کیفیت محله بر پایه تعداد پروژه: <strong>{comparison.ranksNeighborhoodQualityByProjectCount ? 'بله' : 'خیر (ممنوع)'}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px]" data-testid="stage53-status-documents-panel">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {STAGE53_BOUNDARIES_8.map((b) => (
          <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-[10px]">
            <div className="font-bold text-orange-300">{b.prevStageFa}</div>
            <div className="text-slate-300 mt-0.5">{b.roleFa}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {projects.map((p) => (
              <button
                key={p.projectId}
                type="button"
                onClick={() => {
                  setSelectedId(p.projectId);
                  onFeedbackFa(`پرونده ${p.projectId} (${p.conceptKind}) باز شد.`);
                }}
                data-testid={`up-select-project-${p.projectId}`}
                className={`rounded-lg border px-2.5 py-1 text-[10.5px] cursor-pointer ${
                  active.projectId === p.projectId
                    ? 'border-orange-400 bg-orange-950/40 text-white font-bold'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300'
                }`}
              >
                {p.projectId}: {p.conceptKind}
              </button>
            ))}
          </div>
          <select
            value={evidenceKind}
            onChange={(e) => setEvidenceKind(e.target.value as typeof evidenceKind)}
            data-testid="up-evidence-selector"
            aria-label="نوع مدرک پیشنهادی تغییر وضعیت"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10.5px] text-white"
          >
            <option value="خبر رسانه‌ای">خبر رسانه‌ای (بدون سند)</option>
            <option value="مشاهده میدانی">مشاهده میدانی کاربر</option>
            <option value="خروجی هوش مصنوعی بدون بازبین">خروجی هوش مصنوعی بدون بازبین</option>
            <option value="سند رسمی تأییدشده">سند رسمی تأییدشده</option>
          </select>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono text-[10px] text-orange-300">{active.projectId} · نوع: {active.conceptKind} · طرح بالادستی: {active.parentPlanTitleFa ?? 'ندارد'}</div>
              <h4 className="font-bold text-white text-xs mt-0.5">{active.titleFa}</h4>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={sameUserReview} onChange={(e) => setSameUserReview(e.target.checked)} />
              ثبت‌کننده و تأییدکننده یکسان (§۲۶.۲)
            </label>
          </div>

          <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[10.5px] text-amber-200" data-testid="up-status-guard-box">
            <strong>نتیجه کنترل وضعیت (§۳۳.۱):</strong> وضعیت مؤثر: <strong className="text-white">{evidenceEval.effectiveStatus}</strong> ·
            ارتقا مسدود: <strong>{evidenceEval.officialPromotionBlocked ? 'بله' : 'خیر'}</strong>
            <div className="text-slate-300 mt-0.5">{evidenceEval.reasonFa}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[10px]">
            {active.phases.map((ph) => (
              <div key={ph.phaseId} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                <div className="font-bold text-cyan-300">{ph.titleFa}</div>
                <div className="text-slate-300">وضعیت فاز: {ph.status} ({ph.zoneScopeFa})</div>
              </div>
            ))}
          </div>
          {active.isStaleInfo && (
            <div className="text-[10px] text-rose-300">
              وضعیت پروژه بر اساس آخرین اطلاعات موجود ({active.lastUpdatedDateFa}) نمایش داده شده است؛ به‌روزرسانی جدیدتری ثبت نشده است.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

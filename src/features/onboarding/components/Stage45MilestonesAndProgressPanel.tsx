/** @file src/features/onboarding/components/Stage45MilestonesAndProgressPanel.tsx — Stage 45 Milestones Map, Progress Reports & Evidence Documents */
import React, { useState } from 'react';
import { parseLocalizedNumber } from '../../../utils/forms/formInputHelpers';
import { formatTomanCurrency } from '../services/serviceTransactionEngine';
import {
  canMemberAccessDeliveryResource,
  computeProjectProgressSummary,
  reviewDeliverableOrMilestone,
  submitDeliverableForReview,
  submitMilestoneProgressReport,
  uploadProjectDocumentSafely,
} from '../services/serviceDeliveryEngine';
import type { ProjectDocumentCategory, ServiceDeliveryProject, WorkspaceDeliveryRole } from '../services/serviceDeliveryTypes';

export interface Stage45MilestonesAndProgressPanelProps {
  section: 'overview' | 'milestones' | 'documents';
  project: ServiceDeliveryProject;
  viewerRole: WorkspaceDeliveryRole;
  onUpdateProject: (next: ServiceDeliveryProject) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage45MilestonesAndProgressPanel: React.FC<Stage45MilestonesAndProgressPanelProps> = ({
  section,
  project,
  viewerRole,
  onUpdateProject,
  onFeedbackFa,
}) => {
  const [selectedMsId, setSelectedMsId] = useState(project.milestones[1]?.milestoneId || project.milestones[0]?.milestoneId || '');
  const [reportText, setReportText] = useState('اجرای عایق رطوبتی سرویس‌ها و تکمیل نقشه خط لوله‌کشی گرم و سرد.');
  const [declaredPct, setDeclaredPct] = useState('65');
  const [progressError, setProgressError] = useState<string | null>(null);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [docTitle, setDocTitle] = useState('تصویر کلکتور جدید طبقه اول');
  const [docCategory, setDocCategory] = useState<ProjectDocumentCategory>('تصاویر حین اجرا');
  const [docError, setDocError] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState('لطفاً نتیجه تست فشار ۴ بار لوله‌کشی هم ضمیمه شود.');

  const summary = computeProjectProgressSummary(project);
  const finAccess = canMemberAccessDeliveryResource(viewerRole, 'view_financial');
  const activeMs = project.milestones.find((m) => m.milestoneId === selectedMsId) || project.milestones[0];

  const handleSubmitProgress = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReport = reportText.trim();
    if (cleanReport.length < 3) {
      const msg = 'لطفاً شرح فعالیت انجام‌شده را با حداقل ۳ کاراکتر وارد کنید.';
      setProgressError(msg);
      onFeedbackFa(msg);
      return;
    }
    let parsedPercent: number | undefined;
    if (declaredPct.trim() !== '') {
      const n = Math.round(parseLocalizedNumber(declaredPct));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        const msg = 'درصد پیشرفت اعلام‌شده باید عددی بین ۰ تا ۱۰۰ باشد.';
        setProgressError(msg);
        onFeedbackFa(msg);
        return;
      }
      parsedPercent = n;
    }
    setProgressError(null);
    const res = submitMilestoneProgressReport({
      project,
      milestoneId: selectedMsId,
      authorFa: project.providerNameFa,
      activitySummaryFa: cleanReport,
      declaredPercent: parsedPercent,
      networkOnline: !simulateOffline,
    });
    if (res.ok) {
      onUpdateProject(res.project);
      setReportText('');
    }
    onFeedbackFa(res.messageFa);
  };

  const handleUploadDoc = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = docTitle.trim();
    if (cleanTitle.length < 2) {
      const msg = 'لطفاً عنوان مستند پروژه را وارد کنید.';
      setDocError(msg);
      onFeedbackFa(msg);
      return;
    }
    setDocError(null);
    const res = uploadProjectDocumentSafely({
      project,
      titleFa: cleanTitle,
      category: docCategory,
      milestoneId: selectedMsId,
      uploadedByFa: project.providerNameFa,
      descriptionFa: 'بارگذاری میدانی از محل پروژه با دسترسی محدود به اعضای مجاز',
      viewerPermission: viewerRole,
    });
    if (res.ok) onUpdateProject(res.project);
    onFeedbackFa(res.messageFa);
  };

  const handleSubmitDeliverable = (msId: string, supersedesId?: string) => {
    const next = submitDeliverableForReview({
      project,
      milestoneId: msId,
      titleFa: `گزارش تحویل مرحله (${supersedesId ? 'نسخه اصلاح‌شده' : 'ارسال جدید'})`,
      summaryFa: 'خروجی تکمیل‌شده و برای بررسی فرد مجاز ارسال گردید.',
      submittedByFa: project.providerNameFa,
      supersedesSubmissionId: supersedesId,
    });
    onUpdateProject(next);
    onFeedbackFa('خروجی تحویل شد و وضعیت مرحله به «نیازمند بررسی» تغییر یافت (ارسال کار با تأیید آن یکسان نیست).');
  };

  const handleReviewDeliverable = (subId: string, decision: 'پذیرفته‌شده' | 'نیازمند اصلاح') => {
    const res = reviewDeliverableOrMilestone({
      project,
      submissionId: subId,
      decision,
      reviewerFa: project.applicantNameFa,
      reviewerPermission: viewerRole,
      revisionNoteFa: decision === 'نیازمند اصلاح' ? revisionReason : undefined,
    });
    if (res.ok) onUpdateProject(res.project);
    onFeedbackFa(res.messageFa);
  };

  if (section === 'overview') {
    const awaitingSub = project.deliverables.find((d) => d.status === 'ارسال‌شده');
    return (
      <div className="space-y-3 text-[11px]" data-testid="del-overview-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[10px] text-slate-400">پیشرفت محاسبه‌شده (وزن مراحل)</div>
            <div className="mt-1 text-sm font-bold text-emerald-300 tabular-nums">{summary.weightedPercent}%</div>
            <div className="text-[10px] text-slate-500">{summary.basisLabelFa}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[10px] text-slate-400">مراحل تأیید / در انتظار بررسی</div>
            <div className="mt-1 text-sm font-bold text-cyan-300 tabular-nums">
              {summary.acceptedOrCompletedCount}/{summary.totalMilestones} تأیید · {summary.awaitingReviewCount} بررسی
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[10px] text-slate-400">بازه‌های زمانی پروژه</div>
            <div className="mt-1 font-bold text-white">شروع: {project.startDateFa}</div>
            <div className="text-[10px] text-slate-400">موعد: {project.plannedCompletionFa}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[10px] text-slate-400">وضعیت مالی متصل به مرحله ۴۴ (DEL-20)</div>
            {finAccess.allowed ? (
              <>
                <div className="mt-1 font-bold text-emerald-300 tabular-nums">{formatTomanCurrency(project.agreedAmountToman)}</div>
                <div className="text-[10px] text-slate-400 tabular-nums">پرداخت‌شده: {formatTomanCurrency(project.paidAmountToman)}</div>
              </>
            ) : (
              <div className="mt-1 text-[10px] text-amber-300">{finAccess.reasonFa}</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-cyan-600/40 bg-cyan-950/20 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-cyan-200">اقدام بعدی مورد نیاز: </span>
            <span className="text-slate-200">
              {awaitingSub ? `تحویل «${awaitingSub.titleFa}» در انتظار بررسی است.` : 'ثبت گزارش پیشرفت مرحله جاری و بارگذاری مستندات جدید.'}
            </span>
          </div>
          {awaitingSub && (
            <div className="flex gap-1.5">
              <button type="button" data-testid="del-quick-accept-btn" onClick={() => handleReviewDeliverable(awaitingSub.submissionId, 'پذیرفته‌شده')} className="rounded bg-[var(--color-brand-600)] px-2.5 py-1 font-bold text-slate-950 cursor-pointer">
                تأیید تحویل منتظر بررسی
              </button>
              <button type="button" data-testid="del-quick-revision-btn" onClick={() => handleReviewDeliverable(awaitingSub.submissionId, 'نیازمند اصلاح')} className="rounded border border-amber-500 bg-slate-900 px-2.5 py-1 font-bold text-amber-200 cursor-pointer">
                درخواست اصلاح
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section === 'milestones') {
    return (
      <div className="space-y-4 text-[11px]" data-testid="del-milestones-panel">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {project.milestones.map((ms) => (
            <div key={ms.milestoneId} className={`rounded-lg border p-3 space-y-2 ${selectedMsId === ms.milestoneId ? 'border-cyan-500 bg-slate-950' : 'border-slate-800 bg-slate-950/70'}`}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setSelectedMsId(ms.milestoneId)} className="text-right font-bold text-white hover:text-cyan-300 cursor-pointer">
                  {ms.titleFa} (وزن {ms.weightPercent}%)
                </button>
                <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-cyan-300">{ms.status}</span>
              </div>
              <div className="text-slate-400">مسئول: {ms.assigneeFa} · موعد: {ms.dueDateFa}</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid={`del-submit-deliverable-${ms.milestoneId}`} onClick={() => handleSubmitDeliverable(ms.milestoneId)} className="rounded border border-cyan-600 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-bold text-cyan-200 cursor-pointer">
                  ارسال خروجی برای بررسی (→ نیازمند بررسی)
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <form noValidate onSubmit={handleSubmitProgress} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">ثبت گزارش پیشرفت برای «{activeMs?.titleFa}»</span>
              <label className="flex items-center gap-1 text-[10px] text-amber-300 cursor-pointer">
                <input type="checkbox" checked={simulateOffline} onChange={(e) => setSimulateOffline(e.target.checked)} />
                <span>شبیه‌سازی قطع شبکه (تست حفظ پیش‌نویس)</span>
              </label>
            </div>
            <textarea
              aria-label="شرح فعالیت انجام‌شده"
              aria-invalid={Boolean(progressError)}
              data-testid="del-progress-report-input"
              rows={2}
              value={reportText}
              onChange={(e) => { setReportText(e.target.value); if (progressError) setProgressError(null); }}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
            />
            <div className="flex items-center gap-2">
              <label className="text-slate-300">درصد اعلام‌شده:</label>
              <input type="text" aria-label="درصد اعلام‌شده" aria-invalid={Boolean(progressError)} value={declaredPct} onChange={(e) => { setDeclaredPct(e.target.value); if (progressError) setProgressError(null); }} className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
              <button type="submit" data-testid="del-submit-progress-btn" className="mr-auto rounded-lg bg-[var(--color-brand-600)] hover:bg-emerald-500 px-3 py-1.5 font-bold text-slate-950 cursor-pointer">
                ثبت در تاریخچه پیشرفت
              </button>
            </div>
            {progressError && <div role="alert" className="text-[10.5px] font-bold text-rose-300">{progressError}</div>}
            <div className="space-y-1 pt-1">
              {project.progressReports.map((r) => (
                <div key={r.reportId} className="rounded border border-slate-800 bg-slate-900/60 p-2 text-[10px] text-slate-300">
                  <strong>{r.milestoneTitleFa}</strong> ({r.reportedAtFa}): {r.activitySummaryFa}
                </div>
              ))}
            </div>
          </form>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="del-deliverables-list">
            <div className="text-xs font-bold text-white">تحویل‌های مرحله‌ای و تاریخچه نسخه‌ها (DEL-14 · DEL-15)</div>
            <input type="text" aria-label="توضیح درخواست اصلاح" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white text-[10px]" />
            <div className="space-y-1.5">
              {project.deliverables.map((d) => (
                <div key={d.submissionId} className="rounded border border-slate-800 bg-slate-900/70 p-2 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-cyan-300">{d.titleFa} (V{d.versionNumber})</span>
                    <span className="text-amber-300">{d.status}</span>
                  </div>
                  <div className="text-slate-300">{d.summaryFa}</div>
                  {d.revisionNoteFa && <div className="text-rose-300 text-[10px]">اصلاح درخواستی: {d.revisionNoteFa}</div>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button type="button" onClick={() => handleReviewDeliverable(d.submissionId, 'پذیرفته‌شده')} className="rounded border border-emerald-600 px-2 py-0.5 text-[10px] text-emerald-300 cursor-pointer">تأیید تحویل</button>
                    <button type="button" onClick={() => handleReviewDeliverable(d.submissionId, 'نیازمند اصلاح')} className="rounded border border-rose-600 px-2 py-0.5 text-[10px] text-rose-300 cursor-pointer">درخواست اصلاح</button>
                    <button type="button" data-testid={`del-resubmit-${d.submissionId}`} onClick={() => handleSubmitDeliverable(d.milestoneId, d.submissionId)} className="rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300 cursor-pointer">ارسال نسخه جدید (حفظ قبلی)</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px]" data-testid="del-documents-panel">
      <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-2.5 text-amber-200">
        تفکیک شواهد (بخش ۷ و ۹): تصویر یا فایل ثبت‌شده به‌تنهایی اثبات قطعی کیفیت اجرا نیست؛ رابط میان «تصویر ثبت‌شده»، «مستند بررسی‌شده» و «نتیجه تأییدشده» تفکیک می‌گذارد.
      </div>
      <form noValidate onSubmit={handleUploadDoc} className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/80 p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input type="text" aria-label="عنوان مستند پروژه" aria-invalid={Boolean(docError)} value={docTitle} onChange={(e) => { setDocTitle(e.target.value); if (docError) setDocError(null); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white" />
          <select aria-label="دسته‌بندی مستند" value={docCategory} onChange={(e) => setDocCategory(e.target.value as ProjectDocumentCategory)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white">
            {(['تصاویر قبل از اجرا', 'تصاویر حین اجرا', 'تصاویر پس از اجرا', 'گزارش فنی', 'نقشه', 'فاکتور مصالح', 'صورت‌جلسه', 'مستندات تحویل'] as const).map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button type="submit" data-testid="del-upload-doc-btn" className="rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 font-bold text-slate-950 cursor-pointer">
            بارگذاری مستند محرمانه پروژه
          </button>
        </div>
        {docError && <div role="alert" className="text-[10.5px] font-bold text-rose-300">{docError}</div>}
      </form>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {project.documents.map((doc) => (
          <div key={doc.documentId} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span className="text-white">{doc.titleFa}</span>
              <span className="text-cyan-300 text-[10px]">{doc.evidenceLevel}</span>
            </div>
            <div className="text-slate-400">{doc.category} · ثبت: {doc.uploadedByFa} ({doc.uploadedAtFa})</div>
            <div className="text-[10px] text-slate-500">{doc.descriptionFa}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

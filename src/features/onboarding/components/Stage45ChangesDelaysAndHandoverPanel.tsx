/** @file src/features/onboarding/components/Stage45ChangesDelaysAndHandoverPanel.tsx — Stage 45 Scope Changes, Delays, Quality Checklist & Final Handover */
import React, { useState } from 'react';
import { parseLocalizedNumber } from '../../../utils/forms/formInputHelpers';
import { formatTomanCurrency } from '../services/serviceTransactionEngine';
import {
  canMemberAccessDeliveryResource,
  evaluateFinalHandoverReadiness,
  reportProjectDelay,
  submitScopeChangeRequest,
} from '../services/serviceDeliveryEngine';
import type { DelayCauseCategory, HandoverDecisionType, ServiceDeliveryProject, WorkspaceDeliveryRole } from '../services/serviceDeliveryTypes';

export interface Stage45ChangesDelaysAndHandoverPanelProps {
  section: 'changes_delays' | 'handover';
  project: ServiceDeliveryProject;
  viewerRole: WorkspaceDeliveryRole;
  onUpdateProject: (next: ServiceDeliveryProject) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage45ChangesDelaysAndHandoverPanel: React.FC<Stage45ChangesDelaysAndHandoverPanelProps> = ({
  section,
  project,
  viewerRole,
  onUpdateProject,
  onFeedbackFa,
}) => {
  const [changeDesc, setChangeDesc] = useState('بازسازی قرنیز و کف‌سازی بالکن غربی به متراژ ۸ متر مربع');
  const [changeCostToman, setChangeCostToman] = useState('1200000');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [delayDays, setDelayDays] = useState('2');
  const [delayCategory, setDelayCategory] = useState<DelayCauseCategory>('تأخیر در تأمین مصالح');
  const [delayError, setDelayError] = useState<string | null>(null);
  const [handoverDecision, setHandoverDecision] = useState<HandoverDecisionType>('پذیرش نهایی');

  const handleRequestChange = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDesc = changeDesc.trim();
    if (cleanDesc.length < 3) {
      const msg = 'لطفاً شرح تغییر دامنه کار را با حداقل ۳ کاراکتر وارد کنید.';
      setChangeError(msg);
      onFeedbackFa(msg);
      return;
    }
    const parsedCost = changeCostToman.trim() === '' ? 0 : Math.round(parseLocalizedNumber(changeCostToman));
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      const msg = 'برآورد اثر مالی تغییر باید عددی معتبر و غیرمنفی به تومان باشد.';
      setChangeError(msg);
      onFeedbackFa(msg);
      return;
    }
    setChangeError(null);
    const next = submitScopeChangeRequest({
      project,
      milestoneId: project.milestones[2]?.milestoneId || project.milestones[0].milestoneId,
      descriptionFa: cleanDesc,
      reasonFa: 'درخواست تکمیلی کارفرما در حین اجرای مرحله',
      proposedByFa: project.applicantNameFa,
      estimatedCostImpactToman: parsedCost,
      estimatedTimeImpactDays: 2,
    });
    onUpdateProject(next);
    onFeedbackFa('درخواست تغییر ثبت شد؛ توجه: مبلغ توافق‌شده در مرحله ۴۴ خودکار تغییر نمی‌کند و نیازمند نسخه جدید توافق است.');
  };

  const handleReportDelay = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDays = Math.round(parseLocalizedNumber(delayDays));
    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      const msg = 'تعداد روز تأخیر باید عددی معتبر بین ۱ تا ۳۶۵ روز باشد.';
      setDelayError(msg);
      onFeedbackFa(msg);
      return;
    }
    setDelayError(null);
    const next = reportProjectDelay({
      project,
      milestoneId: project.milestones[2]?.milestoneId || project.milestones[0].milestoneId,
      delayDays: parsedDays,
      causeCategory: delayCategory,
      reportedByFa: project.providerNameFa,
      impactFa: `تأخیر احتمالی ${parsedDays} روزه در اتمام مرحله ۳ نسبت به موعد مرجع ۱۸ آبان`,
      newProjectedDateFa: '۲۰ آبان ۱۴۰۵',
    });
    onUpdateProject(next);
    onFeedbackFa('تأخیر با موعد مرجع ثبت شد (وضعیت فعلی: ادعای بررسی‌نشده تا تأیید یا پاسخ طرف مقابل).');
  };

  const handleAttemptHandover = () => {
    const access = canMemberAccessDeliveryResource(viewerRole, 'formal_approve');
    if (!access.allowed) {
      onFeedbackFa(access.reasonFa);
      return;
    }
    const readiness = evaluateFinalHandoverReadiness(project, handoverDecision);
    if (!readiness.canMarkFullyCompleted && handoverDecision === 'پذیرش نهایی') {
      onFeedbackFa(readiness.warningFa);
      return;
    }
    onUpdateProject({
      ...project,
      overallStatusFa: readiness.canMarkFullyCompleted ? 'تکمیل‌شده' : 'دارای تعهد باز',
      handoverResult: { decision: handoverDecision, noteFa: readiness.warningFa, recordedAtFa: '۱۹ آبان ۱۴۰۵' },
    });
    onFeedbackFa(`نتیجه تحویل نهایی (${handoverDecision}) ثبت شد. ${readiness.warningFa}`);
  };

  if (section === 'changes_delays') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]" data-testid="del-changes-delays-panel">
        <form noValidate onSubmit={handleRequestChange} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="text-xs font-bold text-white">ثبت درخواست تغییر دامنه کار (بدون تغییر خودکار قیمت — DEL-12)</div>
          <input type="text" aria-label="شرح تغییر پروژه" aria-invalid={Boolean(changeError)} value={changeDesc} onChange={(e) => { setChangeDesc(e.target.value); if (changeError) setChangeError(null); }} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white" />
          <div className="flex items-center gap-2">
            <label className="text-slate-300">برآورد اثر مالی (تومان):</label>
            <input type="text" aria-label="برآورد اثر مالی تغییر به تومان" aria-invalid={Boolean(changeError)} value={changeCostToman} onChange={(e) => { setChangeCostToman(e.target.value); if (changeError) setChangeError(null); }} className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button type="submit" data-testid="del-submit-change-btn" className="mr-auto rounded bg-cyan-600 px-2.5 py-1 font-bold text-slate-950 cursor-pointer">
              ثبت تغییر
            </button>
          </div>
          {changeError && <div role="alert" className="text-[10.5px] font-bold text-rose-300">{changeError}</div>}
          <div className="space-y-1">
            {project.changeRequests.map((c) => (
              <div key={c.changeId} className="rounded border border-amber-600/40 bg-amber-950/20 p-2 text-[10px]">
                <div className="font-bold text-amber-200">{c.descriptionFa} (+{formatTomanCurrency(c.estimatedCostImpactToman)})</div>
                <div className="text-slate-300">{c.approvalStatus} · تغییر خودکار مبلغ توافق مرحله ۴۴: {c.agreedAmountAutoModified ? 'بله' : 'خیر (نیازمند اصلاح توافق)'}</div>
              </div>
            ))}
          </div>
        </form>

        <form noValidate onSubmit={handleReportDelay} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="text-xs font-bold text-white">ثبت تأخیر و موانع اجرایی (تفکیک ادعا از بررسی — DEL-11)</div>
          <div className="flex gap-2">
            <select aria-label="دسته‌بندی مانع" value={delayCategory} onChange={(e) => { setDelayCategory(e.target.value as DelayCauseCategory); if (delayError) setDelayError(null); }} className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              {(['تأخیر در تأمین مصالح', 'آماده نبودن محل اجرا', 'تغییر درخواست مشتری', 'شرایط فنی پیش‌بینی‌نشده', 'تأخیر نیروی اجرایی', 'محدودیت دسترسی', 'شرایط خارج از کنترل طرفین', 'سایر موارد'] as const).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input type="text" aria-label="تعداد روز تأخیر" aria-invalid={Boolean(delayError)} value={delayDays} onChange={(e) => { setDelayDays(e.target.value); if (delayError) setDelayError(null); }} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button type="submit" data-testid="del-submit-delay-btn" className="rounded bg-amber-500 px-2.5 py-1 font-bold text-slate-950 cursor-pointer">
              ثبت مانع
            </button>
          </div>
          {delayError && <div role="alert" className="text-[10.5px] font-bold text-rose-300">{delayError}</div>}
          <div className="space-y-1">
            {project.delays.map((d) => (
              <div key={d.delayId} className="rounded border border-slate-800 bg-slate-900/70 p-2 text-[10px]">
                <div className="font-bold text-rose-300">{d.causeCategory} — {d.delayDays} روز نسبت به موعد {d.baselineDueDateFa}</div>
                <div className="text-slate-300">ثبت‌کننده: {d.reportedByFa} · وضعیت بررسی طرف مقابل: <strong>{d.opponentReviewStatus}</strong></div>
              </div>
            ))}
          </div>
        </form>
      </div>
    );
  }

  const readiness = evaluateFinalHandoverReadiness(project, handoverDecision);
  return (
    <div className="space-y-3 text-[11px]" data-testid="del-handover-panel">
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="text-xs font-bold text-white">چک‌لیست کنترل کیفیت قابل تنظیم و ارجاع تخصصی (DEL-17)</div>
        <div className="space-y-1.5">
          {project.qualityChecklist.map((q) => (
            <div key={q.checkId} className="flex items-center justify-between rounded bg-slate-900/70 px-2.5 py-1.5">
              <span className="text-slate-200">{q.criterionFa}</span>
              <span className="font-bold text-cyan-300">{q.needsSpecialistReferral ? 'ارجاع به کارشناس مستقل (مرحله ۴۶)' : q.result}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-white">پنل پذیرش نهایی پروژه (DEL-18 · DEL-23)</span>
          <span className="text-amber-300">تعهدات/مراحل باز: {readiness.openCommitmentsCount}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="نتیجه پذیرش نهایی" value={handoverDecision} onChange={(e) => setHandoverDecision(e.target.value as HandoverDecisionType)} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white">
            <option value="پذیرش نهایی">پذیرش نهایی</option>
            <option value="پذیرش همراه با موارد تکمیلی">پذیرش همراه با موارد تکمیلی</option>
            <option value="درخواست اصلاح">درخواست اصلاح</option>
            <option value="رد پذیرش با ذکر دلیل">رد پذیرش با ذکر دلیل</option>
          </select>
          <button type="button" data-testid="del-submit-handover-btn" onClick={handleAttemptHandover} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-bold text-slate-950 cursor-pointer">
            ثبت نتیجه بررسی تحویل نهایی
          </button>
        </div>
        <div className="rounded border border-amber-600/40 bg-amber-950/20 p-2 text-amber-200">{readiness.warningFa}</div>
      </div>
    </div>
  );
};

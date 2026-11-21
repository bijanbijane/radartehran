/** @file src/features/onboarding/components/Stage42RequestAndReviewerPanel.tsx — VRF-06..14 & VRF-19..22 */
import React, { useState } from 'react';
import {
  evaluateReviewerDecision,
  submitVerificationAppealPreservingCase,
  type VerificationCaseRecord,
} from '../services/professionalVerificationEngine';

interface Props {
  reqCase: VerificationCaseRecord;
  onUpdateCase: (c: VerificationCaseRecord) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage42RequestAndReviewerPanel: React.FC<Props> = ({
  reqCase,
  onUpdateCase,
  onFeedbackFa,
}) => {
  const [appealReason, setAppealReason] = useState('تصویر واضح‌تر با پوشاندن شماره غیرضروری ارسال شد.');
  const [conflictOfInterest, setConflictOfInterest] = useState(false);
  const [evidenceChecked, setEvidenceChecked] = useState(false);

  const handleSubmitAppeal = () => {
    if (!appealReason.trim()) return;
    const updated = submitVerificationAppealPreservingCase(reqCase, appealReason.trim(), 'اسکن خوانا و محدودشده پروانه (v2)');
    onUpdateCase(updated);
    onFeedbackFa(`اعتراض شماره ${updated.appeals.length} به پرونده ${reqCase.caseId} متصل شد (پرونده قبلی حفظ گردید).`);
  };

  const handleReviewerAction = (decision: 'approve' | 'reject' | 'needs_more_info') => {
    const res = evaluateReviewerDecision({
      reqCase,
      reviewerId: 'rev-1',
      hasConflictOfInterest: conflictOfInterest,
      evidenceVerifiedBySource: evidenceChecked,
      decision,
    });
    onUpdateCase(res.updatedCase);
    onFeedbackFa(res.messageFa);
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 text-xs" data-testid="stage42-request-reviewer" dir="rtl">
      {/* VRF-06..14 Appeals & Protected Document Upload */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="font-bold text-white">پرونده تأیید و اعتراض متصل به پرونده اصلی (VRF-06, VRF-13, VRF-14)</div>
        <div className="rounded border border-slate-800 bg-slate-900 p-2.5 space-y-1 text-[11px] text-slate-300">
          <div>شناسه پرونده: <strong className="text-white" dir="ltr">{reqCase.caseId}</strong> · وضعیت: <strong className="text-amber-300">{reqCase.status}</strong></div>
          <div className="text-slate-300">علت رد/نقص: {reqCase.rejectionReasonFa}</div>
          <div className="text-cyan-300">نگهداری امن مدرک: {reqCase.submittedDocSummaryFa}</div>
        </div>
        <label className="block text-[11px] text-slate-300">
          توضیح اعتراض و بازبینی (بدون حذف پرونده قبلی):
          <input type="text" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
        </label>
        <button type="button" data-testid="vrf-submit-appeal-btn" onClick={handleSubmitAppeal} className="rounded bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white">
          ثبت اعتراض متصل به پرونده ({reqCase.appeals.length})
        </button>
      </div>

      {/* VRF-19..22 Reviewer Dual-Control & Conflict of Interest */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
        <div className="font-bold text-white">پنل بازبین، کنترل شواهد و تعارض منافع (VRF-19 & VRF-20)</div>
        <div className="space-y-1.5 text-[11px] text-slate-300">
          <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 cursor-pointer">
            <span>تعارض منافع بازبین با متقاضی وجود دارد</span>
            <input type="checkbox" data-testid="vrf-conflict-checkbox" checked={conflictOfInterest} onChange={(e) => setConflictOfInterest(e.target.checked)} className="accent-rose-500" />
          </label>
          <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 cursor-pointer">
            <span>شواهد و اصالت مدرک از مرجع بررسی شده است (نه صرفاً تصویر)</span>
            <input type="checkbox" checked={evidenceChecked} onChange={(e) => setEvidenceChecked(e.target.checked)} className="accent-emerald-500" />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" data-testid="vrf-rev-approve-btn" onClick={() => handleReviewerAction('approve')} className="rounded bg-[var(--color-brand-600)] px-2.5 py-1 text-[11px] font-bold text-white">
            تأیید پرونده
          </button>
          <button type="button" onClick={() => handleReviewerAction('needs_more_info')} className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">
            درخواست اطلاعات تکمیلی
          </button>
          <button type="button" onClick={() => handleReviewerAction('reject')} className="rounded border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300">
            رد با ثبت دلیل
          </button>
        </div>
      </div>
    </div>
  );
};

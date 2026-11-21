/** @file src/features/onboarding/components/Stage46ReviewAppealAndAdminPanel.tsx — Stage 46 Quality Matrix, Conflict-of-Interest, Resolution & Appeal */
import React, { useState } from 'react';
import {
  assignIndependentReviewerSafely,
  evaluateCredentialImpactSafely,
  recordDisputeResolution,
  submitDisputeAppeal,
} from '../services/serviceQualityEngine';
import type {
  DisputeAppealRecord,
  DisputeCaseRecord,
  DisputeResolutionOutcome,
  DisputeViewerRole,
} from '../services/serviceQualityTypes';
import { STAGE46_REVIEWERS } from '../services/stage46QualityFixtures';

const OUTCOMES: DisputeResolutionOutcome[] = [
  'ادعا تا حدی تأیید شد', 'ادعا تأیید شد', 'ادعا تأیید نشد', 'شواهد ناکافی',
  'حل‌شده با توافق', 'نیازمند اصلاح', 'ارجاع‌شده', 'خارج از دامنه',
];

export const Stage46ReviewAppealAndAdminPanel: React.FC<{
  section: 'quality_review' | 'resolution_appeal';
  disputeCase: DisputeCaseRecord;
  viewerRole: DisputeViewerRole;
  onUpdateCase: (next: DisputeCaseRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, disputeCase, viewerRole, onUpdateCase, onFeedbackFa }) => {
  const [selectedReviewerId, setSelectedReviewerId] = useState(STAGE46_REVIEWERS[0].reviewerId);
  const [outcome, setOutcome] = useState<DisputeResolutionOutcome>('ادعا تا حدی تأیید شد');
  const [confirmedScope, setConfirmedScope] = useState('نیاز به ثبت فشار خط آب گرم مطابق بند ۲ توافق V1 تأیید شد.');
  const [unconfirmedScope, setUnconfirmedScope] = useState('ادعای خسارت تاخیر خارج از شواهد تایید نشد.');

  const [appealReason, setAppealReason] = useState<DisputeAppealRecord['reasonCategoryFa']>('شواهد جدید');
  const [appealSummary, setAppealSummary] = useState('ارائه صورت‌جلسه امضاشده تست دوم توسط طرفین جهت بازنگری.');
  const [credEvalNote, setCredEvalNote] = useState<string>('');

  if (section === 'quality_review') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="qar-quality-review-panel">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
          <div className="font-bold text-white">تفکیک «رضایت مشتری» از «معیارهای فنی کیفیت» (QAR-11..13)</div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2 space-y-1">
            <div className="font-bold text-amber-300">بخش ۱: بازخورد تجربه مشتری (میانگین با نمره فنی ترکیب نمی‌شود)</div>
            <div className="text-slate-200">امتیاز تجربی: {disputeCase.customerSatisfactionScore5} از ۵ — {disputeCase.customerFeedbackSummaryFa}</div>
          </div>
          <div className="space-y-1.5">
            <div className="font-bold text-cyan-300">بخش ۲: ماتریس کنترل کیفیت فنی متناسب با خدمت</div>
            {disputeCase.technicalCriteria.map((c) => (
              <div key={c.criterionId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px]">
                <div className="flex justify-between font-bold text-white"><span>{c.titleFa}</span><span className="text-cyan-300">{c.status}</span></div>
                <div className="text-slate-400">روش بررسی: {c.verificationMethodFa} · سند لازم: {c.requiredEvidenceFa}</div>
                <div className="text-slate-300">نتیجه: {c.resultFa}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
          <div className="font-bold text-white">تخصیص ارزیاب مستقل و پایش تعارض منافع (QAR-14..16)</div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-200 space-y-1">
            <div>وضعیت فعلی ارزیابی: <strong>{disputeCase.reviewStageFa}</strong></div>
            <div>ارزیاب منصوب: <strong>{disputeCase.assignedReviewer ? `${disputeCase.assignedReviewer.displayNameFa} (${disputeCase.assignedReviewer.verifiedQualificationFa})` : 'تعیین‌نشده'}</strong></div>
          </div>
          <div className="space-y-1.5">
            <select aria-label="انتخاب کاندید ارزیاب" data-testid="qar-reviewer-select" value={selectedReviewerId} onChange={(e) => setSelectedReviewerId(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              {STAGE46_REVIEWERS.map((rv) => (
                <option key={rv.reviewerId} value={rv.reviewerId}>
                  {rv.displayNameFa} — {rv.hasConflictWithParty ? 'دارای تعارض منافع قبلی' : 'فاقد تعارض منافع'}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="qar-assign-reviewer-btn"
                onClick={() => {
                  const candidate = STAGE46_REVIEWERS.find((r) => r.reviewerId === selectedReviewerId) || STAGE46_REVIEWERS[0];
                  const fallback = STAGE46_REVIEWERS.find((r) => !r.hasConflictWithParty);
                  const res = assignIndependentReviewerSafely({ disputeCase, candidate, fallbackReviewer: fallback });
                  onUpdateCase(res.disputeCase);
                  onFeedbackFa(res.messageFa);
                }}
                className="rounded bg-cyan-600 hover:bg-cyan-500 px-3 py-1 font-bold text-slate-950 cursor-pointer"
              >
                بررسی تعارض منافع و تخصیص ارزیاب
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="qar-resolution-appeal-panel">
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
        <div className="font-bold text-white">تصمیم‌گیری مستند و اقدامات اصلاحی (QAR-17..19)</div>
        <div className="grid grid-cols-1 gap-1.5">
          <select aria-label="نوع نتیجه تصمیم" data-testid="qar-outcome-select" value={outcome} onChange={(e) => setOutcome(e.target.value as DisputeResolutionOutcome)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={confirmedScope} onChange={(e) => setConfirmedScope(e.target.value)} aria-label="بخش تاییدشده" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <input value={unconfirmedScope} onChange={(e) => setUnconfirmedScope(e.target.value)} aria-label="بخش تاییدنشده" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="qar-record-resolution-btn"
              onClick={() => {
                const res = recordDisputeResolution({
                  disputeCase,
                  outcome,
                  confirmedScopeFa: confirmedScope,
                  unconfirmedScopeFa: unconfirmedScope,
                  decidedByFa: 'هیئت رسیدگی کیفیت رادار',
                  viewerRole,
                });
                onUpdateCase(res.disputeCase);
                onFeedbackFa(res.messageFa);
              }}
              className="rounded bg-[var(--color-brand-600)] hover:bg-emerald-500 px-3 py-1 font-bold text-slate-950 cursor-pointer"
            >
              ثبت نتیجه رسمی پرونده
            </button>
            <button
              type="button"
              data-testid="qar-eval-cred-btn"
              onClick={() => {
                const ev = evaluateCredentialImpactSafely(disputeCase);
                setCredEvalNote(ev.noteFa);
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 font-bold text-cyan-300 cursor-pointer"
            >
              بررسی اثر بر اعتبار مرحله ۴۲
            </button>
          </div>
          {credEvalNote && <div className="rounded bg-slate-900 p-2 text-[10px] text-emerald-300">{credEvalNote}</div>}
        </div>
        {disputeCase.resolution && (
          <div data-testid="qar-recorded-resolution-box" className="rounded border border-emerald-700/50 bg-emerald-950/20 p-2 text-[10px] space-y-0.5 text-slate-200">
            <div className="font-bold text-emerald-300">نتیجه ثبت‌شده: {disputeCase.resolution.outcome}</div>
            <div>محدوده تأییدشده: {disputeCase.resolution.confirmedScopeFa}</div>
            <div>محدوده تأییدنشده: {disputeCase.resolution.unconfirmedScopeFa}</div>
            <div className="text-slate-400">{disputeCase.resolution.limitationsFa}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
        <div className="font-bold text-white">اقدامات اصلاحی (مرحله ۴۴/۴۵) و اعتراض به تصمیم (QAR-20)</div>
        {disputeCase.correctiveActions.map((ca) => (
          <div key={ca.actionId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-200">
            <div className="font-bold text-cyan-300">{ca.titleFa} ({ca.status})</div>
            <div>مسئول: {ca.responsibleFa} · مهلت: {ca.deadlineFa} · اثر مالی مرحله ۴۴: {ca.linkedStage44FinancialChange ? 'دارد' : 'ندارد'} · اصلاح تحویل مرحله ۴۵: {ca.linkedStage45DeliveryRevision ? 'دارد' : 'ندارد'}</div>
          </div>
        ))}
        <div className="pt-1 border-t border-slate-800 space-y-1.5">
          <div className="font-bold text-amber-300">ثبت درخواست بازبینی / اعتراض (حفظ نتیجه قبلی)</div>
          <div className="flex flex-wrap gap-1.5">
            <select aria-label="دلیل اعتراض" value={appealReason} onChange={(e) => setAppealReason(e.target.value as DisputeAppealRecord['reasonCategoryFa'])} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              <option value="شواهد جدید">شواهد جدید</option>
              <option value="ایراد به روش بررسی">ایراد به روش بررسی</option>
              <option value="تعارض منافع">تعارض منافع</option>
              <option value="نقص فرایند">نقص فرایند</option>
            </select>
            <input value={appealSummary} onChange={(e) => setAppealSummary(e.target.value)} aria-label="شرح اعتراض" className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button
              type="button"
              data-testid="qar-submit-appeal-btn"
              onClick={() => {
                onUpdateCase(submitDisputeAppeal({
                  disputeCase,
                  reasonCategoryFa: appealReason,
                  summaryFa: appealSummary,
                  requestedOutcomeFa: 'بازبینی مجدد توسط ارزیاب غیرهمسو',
                  independentAppealReviewerFa: 'هیئت تجدیدنظر مستقل رادار',
                }));
                onFeedbackFa('درخواست بازبینی با حفظ سابقه تصمیم قبلی ثبت شد و وضعیت به «در حال بازبینی» تغییر یافت.');
              }}
              className="rounded bg-amber-600 hover:bg-amber-500 px-2.5 py-1 font-bold text-slate-950 cursor-pointer"
            >
              ثبت اعتراض
            </button>
          </div>
          {disputeCase.appeals.map((a) => (
            <div key={a.appealId} className="rounded bg-slate-900 p-2 text-[10px] text-slate-300">
              اعتراض ({a.reasonCategoryFa}): {a.summaryFa} — تصمیم قبلی محفوظ: <strong>{a.previousResolutionPreservedFa}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

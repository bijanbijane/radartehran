/** @file src/features/services/components/AdminServiceModerationCard.tsx — Admin Queue for Provider Verification & Complaints */
import React, { useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import {
  loadProviderSubmissions,
  loadServiceComplaints,
  reviewProviderSubmission,
} from '../services/serviceWorkflowService';
import { CANONICAL_CATEGORY_LABELS_FA } from '../types/service.types';

export const AdminServiceModerationCard: React.FC<{ isVerifiedAdmin: boolean }> = ({ isVerifiedAdmin }) => {
  const [submissions, setSubmissions] = useState(() => loadProviderSubmissions());
  const [complaints] = useState(() => loadServiceComplaints());

  if (!isVerifiedAdmin) return null;

  return (
    <div
      data-testid="admin-services-moderation-queue"
      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>صف ممیزی ارائه‌دهندگان خدمات و شکایات (Stage 21)</span>
        </strong>
        <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
          پرونده‌ها: {submissions.length} · شکایات خصوصی: {complaints.length}
        </span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-[11px] text-[var(--color-text-muted)]">در حال حاضر پرونده جدیدی در صف تأیید متخصصان نیست.</p>
      ) : (
        <div className="space-y-2">
          {submissions.slice(0, 6).map((sub) => (
            <div key={sub.submissionId} className="p-3 rounded-xl bg-[#F8F9FA] dark:bg-slate-800/80 border border-[var(--color-border-subtle)] dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-[var(--color-text-primary)] dark:text-white">
                  {sub.displayName} · {CANONICAL_CATEGORY_LABELS_FA[sub.canonicalCategory]}
                </div>
                <div className="text-[10.5px] text-[var(--color-text-muted)]">
                  وضعیت فعلی: {sub.moderationStatus} · {sub.moderatorNoteFa}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSubmissions(
                      reviewProviderSubmission(sub.submissionId, 'verified', 'تأیید هویت و مدارک توسط مدیر سیستم'),
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تأیید انتشار</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSubmissions(
                      reviewProviderSubmission(sub.submissionId, 'revision_required', 'نیاز به ارسال تصویر خوانای پروانه'),
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-amber-500 text-amber-700 font-bold cursor-pointer"
                >
                  نقص مدرک
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSubmissions(
                      reviewProviderSubmission(sub.submissionId, 'rejected', 'عدم انطباق مدارک'),
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-[#B3261E] text-[#B3261E] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>رد</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

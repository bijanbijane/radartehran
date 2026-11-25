/** @file src/features/services/components/ServiceRequestsAndProposalsTab.tsx — Lifecycle Tracking, Proposal Comparison & Verified Reviews */
import React, { useState } from 'react';
import { CheckCircle2, ClipboardList, MessageSquare, ShieldAlert, Star } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ProviderReviewRecord,
  type ServiceProposalRecord,
  type ServiceRequestRecord,
  type ServiceRequestStatus,
} from '../types/service.types';

export interface ServiceRequestsAndProposalsTabProps {
  requests: ServiceRequestRecord[];
  proposals: ServiceProposalRecord[];
  reviews: ProviderReviewRecord[];
  onSimulateSampleProposal?: (req: ServiceRequestRecord) => void;
  onProposalAction: (proposalId: string, action: 'shortlisted' | 'accepted' | 'rejected') => void;
  onTransitionRequest: (requestId: string, status: ServiceRequestStatus) => void;
  onSubmitReview: (payload: {
    requestId: string;
    overallScore: 1 | 2 | 3 | 4 | 5;
    commentFa: string;
  }) => { ok: boolean; errorFa?: string };
}

const STATUS_LABELS_FA: Record<ServiceRequestStatus, string> = {
  draft: 'پیش‌نویس',
  submitted: 'ثبت‌شده',
  matching: 'در حال تطبیق',
  proposals_received: 'پیشنهاد دریافت‌شده',
  reviewing: 'در حال بررسی',
  provider_selected: 'متخصص انتخاب‌شده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
  closed: 'بسته‌شده',
};

export const ServiceRequestsAndProposalsTab: React.FC<ServiceRequestsAndProposalsTabProps> = ({
  requests,
  proposals,
  reviews,
  onSimulateSampleProposal,
  onProposalAction,
  onTransitionRequest,
  onSubmitReview,
}) => {
  const [reviewTextByReq, setReviewTextByReq] = useState<Record<string, string>>({});
  const [reviewScoreByReq, setReviewScoreByReq] = useState<Record<string, 1 | 2 | 3 | 4 | 5>>({});
  const [reviewMsg, setReviewMsg] = useState<{ requestId: string; tone: 'success' | 'error'; text: string } | null>(null);
  void onSimulateSampleProposal;

  if (requests.length === 0) {
    return (
      <div className="p-8 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-2 text-xs">
        <ClipboardList className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
        <p className="font-bold text-[var(--color-text-primary)]">هنوز درخواستی ثبت نکرده‌اید.</p>
        <p className="text-[var(--color-text-muted)]">از دایرکتوری متخصصان یا فرم ۷ مرحله‌ای، درخواست خود را ثبت کنید تا چرخه پیگیری و مقایسه پیشنهادها اینجا فعال شود.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="service-requests-tracker">
      {reviewMsg && (
        <div
          role={reviewMsg.tone === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-[10px] font-bold ${
            reviewMsg.tone === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-[#B3261E] dark:text-rose-200 border border-rose-200 dark:border-rose-800'
              : 'bg-[#EAF3F0] dark:bg-emerald-950/40 text-[var(--color-brand-700)] dark:text-emerald-200'
          }`}
        >
          {reviewMsg.text}
        </div>
      )}
      {requests.map((req) => {
        const reqProposals = proposals.filter((p) => p.requestId === req.id);
        const existingReview = reviews.find((r) => r.requestId === req.id);
        const canReview = ['provider_selected', 'in_progress', 'completed', 'closed'].includes(req.status);

        return (
          <article
            key={req.id}
            data-testid={`tracked-service-req-${req.id}`}
            className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-[var(--color-text-primary)]">{req.providerName}</strong>
                  <span className="px-2 py-0.5 rounded-[6px] bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-xs font-bold">
                    {STATUS_LABELS_FA[req.status]}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {CANONICAL_CATEGORY_LABELS_FA[req.canonicalCategory]} · محله {req.neighborhoodName} · {req.propertyTypeFa}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {req.status === 'provider_selected' && (
                  <button
                    type="button"
                    onClick={() => onTransitionRequest(req.id, 'completed')}
                    className="px-2.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer whitespace-nowrap"
                  >
                    علامت‌گذاری به‌عنوان انجام‌شده
                  </button>
                )}
                {req.status !== 'completed' && req.status !== 'cancelled' && req.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => onTransitionRequest(req.id, 'cancelled')}
                    className="px-2.5 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] text-[#B3261E] font-bold cursor-pointer whitespace-nowrap"
                  >
                    لغو درخواست
                  </button>
                )}
              </div>
            </div>

            <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] leading-relaxed">{req.projectSummary}</p>

            {/* Side-by-side proposals comparison */}
            {reqProposals.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />
                  <span>مقایسه شفاف پیشنهادهای دریافتی ({toPersianNum(reqProposals.length)})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {reqProposals.map((prop) => (
                    <div key={prop.proposalId} className="p-3 rounded-[10px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-[var(--color-text-primary)]">{prop.providerName}</strong>
                        <span className="font-bold text-[var(--color-brand-fg)] tabular-nums">{prop.priceDisplayFa}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">{prop.providerVerificationSummaryFa} · زمان: {prop.timelineFa}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{prop.scopeSummaryFa}</p>
                      <div className="text-xs text-[var(--color-text-muted)]">شامل: {prop.includesFa} · مستثنی: {prop.excludesFa}</div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {prop.status === 'accepted' ? (
                          <span className="text-[var(--color-brand-fg)] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> پیشنهاد انتخاب‌شده
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onProposalAction(prop.proposalId, 'accepted')}
                              className="px-2.5 py-1 rounded-[7px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
                            >
                              انتخاب این پیشنهاد
                            </button>
                            <button
                              type="button"
                              onClick={() => onProposalAction(prop.proposalId, 'rejected')}
                              className="px-2.5 py-1 rounded-[7px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] text-[var(--color-text-muted)] font-bold cursor-pointer"
                            >
                              رد
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verified Request-Tied Review */}
            {canReview && !existingReview && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const res = onSubmitReview({
                    requestId: req.id,
                    overallScore: reviewScoreByReq[req.id] || 5,
                    commentFa: reviewTextByReq[req.id] || '',
                  });
                  if (res.ok) {
                    setReviewTextByReq((p) => ({ ...p, [req.id]: '' }));
                    setReviewMsg({ requestId: req.id, tone: 'success', text: 'بازخورد معتبر شما ثبت و به پروفایل متخصص متصل شد.' });
                  } else {
                    setReviewMsg({ requestId: req.id, tone: 'error', text: res.errorFa || 'خطا در ثبت نظر' });
                  }
                }}
                className="p-3 rounded-[10px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] space-y-2"
              >
                <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span>ثبت بازخورد متصل به درخواست معتبر (نظرات منفی معتبر نیز حفظ می‌شوند)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="امتیاز کلی"
                    value={reviewScoreByReq[req.id] || 5}
                    onChange={(e) => {
                      if (reviewMsg?.requestId === req.id) setReviewMsg(null);
                      setReviewScoreByReq((p) => ({ ...p, [req.id]: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 }));
                    }}
                    className="p-2 rounded-[8px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]"
                  >
                    <option value={5}>۵ از ۵ (عالی)</option>
                    <option value={4}>۴ از ۵ (خوب)</option>
                    <option value={3}>۳ از ۵ (متوسط)</option>
                    <option value={2}>۲ از ۵ (ضعیف)</option>
                    <option value={1}>۱ از ۵ (نامناسب)</option>
                  </select>
                  <input
                    type="text"
                    aria-invalid={reviewMsg?.requestId === req.id && reviewMsg.tone === 'error'}
                    value={reviewTextByReq[req.id] || ''}
                    onChange={(e) => {
                      if (reviewMsg?.requestId === req.id) setReviewMsg(null);
                      setReviewTextByReq((p) => ({ ...p, [req.id]: e.target.value }));
                    }}
                    placeholder="تجربه واقعی خود از شفافیت، زمان‌بندی و کیفیت خدمت را بنویسید..."
                    className="flex-1 min-w-[200px] p-2 rounded-[8px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
                  >
                    ثبت نظر معتبر
                  </button>
                </div>
              </form>
            )}

            {existingReview && (
              <div className="p-2.5 rounded-[8px] bg-[#EAF3F0]/60 dark:bg-emerald-950/30 text-[var(--color-brand-700)] dark:text-emerald-200 flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>نظر ثبت‌شده شما: {toPersianNum(existingReview.overallScore)}/۵ — {existingReview.commentFa}</span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

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
  onSimulateSampleProposal: (req: ServiceRequestRecord) => void;
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
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <div className="p-8 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-2 text-xs">
        <ClipboardList className="w-8 h-8 text-[#586760] mx-auto" />
        <p className="font-bold text-[#182522] dark:text-white">هنوز درخواستی ثبت نکرده‌اید.</p>
        <p className="text-[#586760]">از دایرکتوری متخصصان یا فرم ۷ مرحله‌ای، درخواست خود را ثبت کنید تا چرخه پیگیری و مقایسه پیشنهادها اینجا فعال شود.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="service-requests-tracker">
      {reviewMsg && (
        <div className="p-3 rounded-[10px] bg-[#EAF3F0] dark:bg-emerald-950/40 text-[#14534E] dark:text-emerald-200 font-bold">
          {reviewMsg}
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
            className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#DCE3DF] dark:border-slate-800 pb-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-[#182522] dark:text-white">{req.providerName}</strong>
                  <span className="px-2 py-0.5 rounded-[6px] bg-[#EAF3F0] dark:bg-emerald-950/50 text-[#14534E] dark:text-emerald-300 text-[10.5px] font-bold">
                    {STATUS_LABELS_FA[req.status]}
                  </span>
                </div>
                <p className="text-[11px] text-[#586760] mt-0.5">
                  {CANONICAL_CATEGORY_LABELS_FA[req.canonicalCategory]} · محله {req.neighborhoodName} · {req.propertyTypeFa}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {req.status === 'submitted' && (
                  <button
                    type="button"
                    onClick={() => onSimulateSampleProposal(req)}
                    className="px-2.5 py-1.5 rounded-[8px] border border-[#176B63] text-[#176B63] font-bold cursor-pointer whitespace-nowrap"
                  >
                    دریافت پیشنهاد نمونه (دمو)
                  </button>
                )}
                {req.status === 'provider_selected' && (
                  <button
                    type="button"
                    onClick={() => onTransitionRequest(req.id, 'completed')}
                    className="px-2.5 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer whitespace-nowrap"
                  >
                    علامت‌گذاری به‌عنوان انجام‌شده
                  </button>
                )}
                {req.status !== 'completed' && req.status !== 'cancelled' && req.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => onTransitionRequest(req.id, 'cancelled')}
                    className="px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[#B3261E] font-bold cursor-pointer whitespace-nowrap"
                  >
                    لغو درخواست
                  </button>
                )}
              </div>
            </div>

            <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{req.projectSummary}</p>

            {/* Side-by-side proposals comparison */}
            {reqProposals.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
                <div className="font-black text-[#182522] dark:text-white flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-[#176B63]" />
                  <span>مقایسه شفاف پیشنهادهای دریافتی ({toPersianNum(reqProposals.length)})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {reqProposals.map((prop) => (
                    <div key={prop.proposalId} className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 border border-[#DCE3DF] dark:border-slate-700 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-[#182522] dark:text-white">{prop.providerName}</strong>
                        <span className="font-bold text-[#176B63] tabular-nums">{prop.priceDisplayFa}</span>
                      </div>
                      <p className="text-[10.5px] text-[#586760]">{prop.providerVerificationSummaryFa} · زمان: {prop.timelineFa}</p>
                      <p className="text-[11px] text-[#34433E] dark:text-slate-300">{prop.scopeSummaryFa}</p>
                      <div className="text-[10px] text-[#586760]">شامل: {prop.includesFa} · مستثنی: {prop.excludesFa}</div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {prop.status === 'accepted' ? (
                          <span className="text-[#176B63] font-black flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> پیشنهاد انتخاب‌شده
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onProposalAction(prop.proposalId, 'accepted')}
                              className="px-2.5 py-1 rounded-[7px] bg-[#176B63] text-white font-bold cursor-pointer"
                            >
                              انتخاب این پیشنهاد
                            </button>
                            <button
                              type="button"
                              onClick={() => onProposalAction(prop.proposalId, 'rejected')}
                              className="px-2.5 py-1 rounded-[7px] border border-[#DCE3DF] dark:border-slate-600 text-[#586760] font-bold cursor-pointer"
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
              <div className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/60 border border-[#DCE3DF] dark:border-slate-700 space-y-2">
                <div className="font-bold text-[#182522] dark:text-white flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span>ثبت بازخورد متصل به درخواست معتبر (نظرات منفی معتبر نیز حفظ می‌شوند)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="امتیاز کلی"
                    value={reviewScoreByReq[req.id] || 5}
                    onChange={(e) => setReviewScoreByReq((p) => ({ ...p, [req.id]: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 }))}
                    className="p-2 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700"
                  >
                    <option value={5}>۵ از ۵ (عالی)</option>
                    <option value={4}>۴ از ۵ (خوب)</option>
                    <option value={3}>۳ از ۵ (متوسط)</option>
                    <option value={2}>۲ از ۵ (ضعیف)</option>
                    <option value={1}>۱ از ۵ (نامناسب)</option>
                  </select>
                  <input
                    type="text"
                    value={reviewTextByReq[req.id] || ''}
                    onChange={(e) => setReviewTextByReq((p) => ({ ...p, [req.id]: e.target.value }))}
                    placeholder="تجربه واقعی خود از شفافیت، زمان‌بندی و کیفیت خدمت را بنویسید..."
                    className="flex-1 min-w-[200px] p-2 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const res = onSubmitReview({
                        requestId: req.id,
                        overallScore: reviewScoreByReq[req.id] || 5,
                        commentFa: reviewTextByReq[req.id] || '',
                      });
                      setReviewMsg(res.ok ? 'بازخورد معتبر شما ثبت و به پروفایل متخصص متصل شد.' : res.errorFa || 'خطا در ثبت نظر');
                    }}
                    className="px-3 py-1.5 rounded-[8px] bg-[#182522] text-white font-bold cursor-pointer"
                  >
                    ثبت نظر معتبر
                  </button>
                </div>
              </div>
            )}

            {existingReview && (
              <div className="p-2.5 rounded-[8px] bg-[#EAF3F0]/60 dark:bg-emerald-950/30 text-[#14534E] dark:text-emerald-200 flex items-center gap-1.5 font-bold">
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

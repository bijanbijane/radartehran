/** @file src/features/onboarding/components/Stage43RequestAndQuotesPanel.tsx — PRM-14..26 & PRM-31 */
import React, { useState } from 'react';
import {
  cancelServiceRequestSafely,
  compareServiceQuotesHonesty,
  evaluateProviderRequestAccess,
  reviseServiceQuoteKeepingHistory,
  submitServiceReviewWithVerification,
  type ServiceQuoteRecord,
  type ServiceRequestItem,
} from '../services/proMarketplaceEngine';

interface Props {
  request: ServiceRequestItem;
  quotes: ServiceQuoteRecord[];
  onUpdateRequest: (r: ServiceRequestItem) => void;
  onUpdateQuotes: (qs: ServiceQuoteRecord[]) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage43RequestAndQuotesPanel: React.FC<Props> = ({
  request,
  quotes,
  onUpdateRequest,
  onUpdateQuotes,
  onFeedbackFa,
}) => {
  const [reviewText, setReviewText] = useState('بازدید دقیق انجام شد و گزارش مکتوب مطابق توافق تحویل گردید.');
  const quoteAdvisory = compareServiceQuotesHonesty(quotes);

  const handleToggleBroadcast = () => {
    const nextMode = request.mode === 'direct' ? 'public_broadcast' : 'direct';
    onUpdateRequest({ ...request, mode: nextMode });
    onFeedbackFa(
      nextMode === 'public_broadcast'
        ? `درخواست به حالت عمومی تغییر یافت (${request.broadcastRecipientCount} ارائه‌دهنده محدوده؛ نشانی دقیق پنهان می‌ماند).`
        : 'درخواست به حالت مستقیم بازگشت.',
    );
  };

  const handleTestUninvitedAccess = () => {
    const res = evaluateProviderRequestAccess(request, 'prv-uninvited-999');
    onFeedbackFa(res.reasonFa);
  };

  const handleReviseQuote = (q: ServiceQuoteRecord) => {
    const updated = reviseServiceQuoteKeepingHistory(q, q.amountM + 0.5, 'به‌روزرسانی پس از اطلاعات تکمیلی متراژ');
    onUpdateQuotes(quotes.map((x) => (x.quoteId === q.quoteId ? updated : x)));
    onFeedbackFa(`پیشنهاد ${q.providerNameFa} با حفظ نسخه قبلی (نسخه ${updated.revisionHistory.length} در تاریخچه) اصلاح شد.`);
  };

  const handleCancelReq = () => {
    onUpdateRequest(cancelServiceRequestSafely(request, 'تغییر برنامه خریدار پیش از شروع خدمت'));
    onFeedbackFa('درخواست با ثبت دلیل لغو شد و دسترسی به نشانی دقیق بسته ماند.');
  };

  const handleMarkCompletedAndReview = () => {
    const completedReq: ServiceRequestItem = { ...request, status: 'completed' };
    onUpdateRequest(completedReq);
    const rev = submitServiceReviewWithVerification({ req: completedReq, rating: 5, commentFa: reviewText });
    onFeedbackFa(rev.messageFa);
  };

  return (
    <div className="space-y-3 text-xs text-slate-200" data-testid="stage43-request-quotes" dir="rtl">
      {/* PRM-14, PRM-16 & PRM-31 Request Context & Privacy */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-white">درخواست خدمت انتقالی از ملک: <span dir="ltr">{request.requestId}</span> ({request.status})</div>
          <span className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[10.5px] text-cyan-200">
            حالت: {request.mode === 'direct' ? 'مستقیم' : `عمومی (${request.broadcastRecipientCount} گیرنده)`}
          </span>
        </div>
        <div className="text-[11px] text-slate-300 space-y-0.5">
          <div>ملک مرجع: <span dir="ltr">{request.subjectPropertyRef}</span> · محدوده تقریبی قابل‌نمایش: {request.approximateAreaFa}</div>
          <div className="text-amber-300">حریم خصوصی نشانی دقیق (PRM-31): {request.exactAddressVisibleToProvider ? request.exactAddressFa : 'مخفی برای ارائه‌دهندگان تا مرحله توافق/اجرا'}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" data-testid="prm-toggle-mode-btn" onClick={handleToggleBroadcast} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-200">
            تغییر حالت مستقیم / عمومی
          </button>
          <button type="button" data-testid="prm-uninvited-test-btn" onClick={handleTestUninvitedAccess} className="rounded border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300">
            تست دسترسی ارائه‌دهنده غیرمجاز
          </button>
          <button type="button" data-testid="prm-cancel-req-btn" onClick={handleCancelReq} className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">
            لغو درخواست پیش از اجرا
          </button>
        </div>
      </div>

      {/* PRM-17..19 Quotes Comparison & Revision History */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="font-bold text-white">مقایسه شفاف پیشنهادهای قیمت (PRM-19)</div>
        <div className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-200">
          {quoteAdvisory.advisoryFa}
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {quotes.map((q) => (
            <div key={q.quoteId} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 space-y-1 text-[11px] text-slate-300">
              <div className="flex items-center justify-between">
                <strong className="text-white">{q.providerNameFa}</strong>
                <span className="font-bold text-emerald-300">{q.amountM} م‌تومان ({q.priceStageLabel})</span>
              </div>
              <div>دامنه تعهد: {q.scopeIncludedFa}</div>
              <div className="text-amber-300">هزینه‌های خارج از دامنه: {q.outOfScopeCostsFa}</div>
              <div>لغو: {q.cancellationTermsFa} · سوابق اصلاح قیمت: {q.revisionHistory.length} نسخه قبلی</div>
              <button type="button" data-testid={`revise-quote-${q.quoteId}`} onClick={() => handleReviseQuote(q)} className="mt-1 rounded border border-cyan-500/40 px-2 py-0.5 text-[10.5px] text-cyan-200">
                اصلاح مبلغ (با حفظ سابقه قبلی)
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* PRM-24 Post-Completion Verified Review */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center gap-2">
        <input type="text" value={reviewText} onChange={(e) => setReviewText(e.target.value)} aria-label="متن ارزیابی پس از خدمت" className="flex-1 min-w-[200px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white" />
        <button type="button" data-testid="prm-complete-review-btn" onClick={handleMarkCompletedAndReview} className="rounded bg-[var(--color-brand-600)] px-3 py-1 text-[11px] font-bold text-white">
          تکمیل خدمت و ثبت ارزیابی تعامل تأییدشده
        </button>
      </div>
    </div>
  );
};

/** @file src/features/services/components/ServiceProviderModal.tsx — Provider Identity, 4-Track Verification, Pricing & Reviews */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, MapPin, Phone, ShieldAlert, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { useDialogFocus } from '../../../components/useDialogFocus';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ProviderReviewRecord,
  type ServiceDisputeRecord,
  type ServiceProviderEntity,
} from '../types/service.types';

export interface ServiceProviderModalProps {
  provider: ServiceProviderEntity | null;
  reviews?: ProviderReviewRecord[];
  onClose: () => void;
  onOpenRequestModal: (provider: ServiceProviderEntity) => void;
  onSubmitDispute: (providerId: string, reason: ServiceDisputeRecord['reason'], details: string) => void;
}

export const ServiceProviderModal: React.FC<ServiceProviderModalProps> = ({
  provider,
  reviews = [],
  onClose,
  onOpenRequestModal,
  onSubmitDispute,
}) => {
  const [disputeReason, setDisputeReason] = useState<ServiceDisputeRecord['reason']>('misleading_credential');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [disputeSent, setDisputeSent] = useState(false);
  const disputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useDialogFocus(Boolean(provider), onClose);
  const providerId = provider?.identity.id ?? null;

  useEffect(() => {
    setDisputeReason('misleading_credential');
    setDisputeDetails('');
    setDisputeError('');
    setDisputeSent(false);
    if (disputeTimerRef.current !== null) {
      clearTimeout(disputeTimerRef.current);
      disputeTimerRef.current = null;
    }
  }, [providerId]);

  useEffect(() => {
    return () => {
      if (disputeTimerRef.current !== null) {
        clearTimeout(disputeTimerRef.current);
        disputeTimerRef.current = null;
      }
    };
  }, []);

  if (!provider) return null;

  const publishedReviews = reviews.filter((r) => r.providerId === provider.identity.id && r.status === 'published');
  const primaryOffering = provider.offerings[0];

  const handleDispute = () => {
    if (disputeDetails.trim().length < 8) {
      setDisputeError('لطفاً توضیح مغایرت را حداقل در ۸ کاراکتر بنویسید.');
      return;
    }
    setDisputeError('');
    onSubmitDispute(provider.identity.id, disputeReason, disputeDetails.trim());
    setDisputeDetails('');
    setDisputeSent(true);
    if (disputeTimerRef.current !== null) clearTimeout(disputeTimerRef.current);
    disputeTimerRef.current = setTimeout(() => {
      setDisputeSent(false);
      disputeTimerRef.current = null;
    }, 3000);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9500] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`جزئیات ${provider.identity.displayName}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-[16px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 p-5 space-y-4 text-xs"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-3">
          <div>
            <span className="text-[10.5px] font-bold text-[var(--color-brand-600)]">
              {CANONICAL_CATEGORY_LABELS_FA[provider.canonicalCategory]} · {provider.identity.primaryNeighborhoodName}
            </span>
            <h3 className="text-base font-black text-[var(--color-text-primary)] dark:text-white mt-0.5">
              {provider.identity.displayName}
            </h3>
          </div>
          <button type="button" aria-label="بستن جزئیات" onClick={onClose} className="p-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 space-y-1.5">
            <strong className="text-[var(--color-text-primary)] dark:text-white block">۱. هویت، موقعیت دفتر و محدوده پوشش</strong>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--color-text-secondary)] dark:text-slate-300 tabular-nums">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
                <span>{provider.coverage.officeAddressSummaryFa} · پوشش: {provider.coverage.coveredAreaNames.join('، ')}</span>
              </span>
              <span className="font-bold flex items-center gap-1" dir="ltr">
                <Phone className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
                {provider.identity.phone || 'ثبت‌نشده'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-[10px] bg-[#FFF4E5]/70 dark:bg-amber-950/20 border border-[#F4D3A1] dark:border-amber-800 space-y-2 text-[#875000] dark:text-amber-200">
            <strong className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>۲. وضعیت ۴ مسیر مستقل احراز و صلاحیت</span>
            </strong>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {provider.credential.tracks.map((tr) => (
                <div key={tr.track} className="p-2 rounded-[8px] bg-white/80 dark:bg-slate-900/80 border border-[#F4D3A1]/70 dark:border-amber-900/50 space-y-0.5">
                  <div className="flex items-center justify-between font-bold text-[var(--color-text-primary)] dark:text-white">
                    <span>{tr.labelFa}</span>
                    <span className={tr.status === 'verified' ? 'text-[var(--color-brand-600)]' : tr.status === 'expired' ? 'text-[#B3261E]' : 'text-[#875000]'}>
                      {tr.badgeTextFa}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] dark:text-slate-400">{tr.noteFa}</p>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] opacity-90">{provider.credential.separationNoteFa}</p>
          </div>

          <div className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 space-y-1.5">
            <strong className="text-[var(--color-text-primary)] dark:text-white block">۳. خدمات، اقلام شامل‌شده و تعرفه شفاف</strong>
            <p className="text-[var(--color-text-secondary)] dark:text-slate-300">{provider.specialtyFa}</p>
            <p className="text-[10.5px] text-[var(--color-text-muted)]">
              {provider.pricingModelFa} · سابقه اظهارشده: {toPersianNum(provider.activity.experienceYearsDeclared)} سال · زمان پاسخ: {provider.activity.responseTimeLabelFa}
            </p>
            {primaryOffering && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[10.5px]">
                <div className="text-[var(--color-brand-700)] dark:text-emerald-300">
                  <strong>شامل خدمت:</strong> {primaryOffering.pricing.includesListFa.join('، ')}
                </div>
                <div className="text-[var(--color-text-muted)] dark:text-slate-400">
                  <strong>خارج از تعرفه پایه:</strong> {primaryOffering.pricing.excludesListFa.join('، ')}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 space-y-2 text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text-primary)] dark:text-white flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
              <span>۴. بازخوردهای متصل به درخواست معتبر ({toPersianNum(publishedReviews.length)} مورد)</span>
            </strong>
            {publishedReviews.length === 0 ? (
              <p>تعداد نظرات راستی‌آزمایی‌شده فعلی: ۰ مورد · {provider.feedback.noteFa}</p>
            ) : (
              <div className="space-y-1.5">
                {publishedReviews.slice(0, 4).map((rev) => (
                  <div key={rev.reviewId} className="p-2 rounded-[8px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-primary)] dark:text-slate-200">
                    <div className="flex items-center justify-between text-[10.5px] font-bold">
                      <span>{rev.reviewerLabelFa} · درخواست تأییدشده</span>
                      <span className="tabular-nums text-[var(--color-brand-600)]">امتیاز {toPersianNum(rev.overallScore)} از ۵</span>
                    </div>
                    <p className="text-[11px] mt-1">{rev.commentFa}</p>
                  </div>
                ))}
                <p className="text-[10px]">{provider.feedback.noteFa}</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onClose(); onOpenRequestModal(provider); }}
          className="w-full py-2.5 rounded-[10px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer"
        >
          ثبت درخواست خدمت از این مجموعه
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDispute();
          }}
          className="pt-3 border-t border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2"
        >
          <div className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-[#B3261E]" />
            <span>گزارش مغایرت اطلاعات یا شکایت خصوصی خدماتی</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              aria-label="علت گزارش مغایرت"
              value={disputeReason}
              onChange={(e) => {
                setDisputeReason(e.target.value as ServiceDisputeRecord['reason']);
                if (disputeError) setDisputeError('');
                if (disputeSent) setDisputeSent(false);
              }}
              className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
            >
              <option value="misleading_credential">ادعای نادرست صلاحیت/پروانه</option>
              <option value="fee_dispute">اختلاف در حق‌الزحمه/کمیسیون</option>
              <option value="unresponsive">عدم پاسخگویی</option>
              <option value="other">سایر موارد</option>
            </select>
            <input
              type="text"
              aria-invalid={Boolean(disputeError)}
              value={disputeDetails}
              onChange={(e) => {
                setDisputeDetails(e.target.value);
                if (disputeError) setDisputeError('');
                if (disputeSent) setDisputeSent(false);
              }}
              placeholder="توضیح کوتاه مغایرت (حداقل ۸ حرف)..."
              className="sm:col-span-2 p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {disputeError ? (
              <span role="alert" className="text-[#B3261E] dark:text-rose-300 font-bold">{disputeError}</span>
            ) : disputeSent ? (
              <span role="status" className="text-[#176B4C] font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> گزارش شما به‌صورت خصوصی برای تیم بررسی ثبت شد.</span>
            ) : <span />}
            <button
              type="submit"
              className="px-3 py-1.5 rounded-[8px] border border-[#B3261E] text-[#B3261E] font-bold cursor-pointer shrink-0"
            >
              ثبت گزارش مغایرت
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

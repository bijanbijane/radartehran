/** @file src/features/services/components/ServiceRequestModal.tsx — Structured Service Request with Privacy Consent */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, X } from 'lucide-react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import {
  isValidNormalizedIranianMobile,
  normalizeIranianMobileInput,
} from '../../../utils/forms/formInputHelpers';
import { SERVICE_CATEGORY_LABELS_FA, type ServiceProviderEntity } from '../types/service.types';

export function normalizeServicePhoneDigits(raw: string): string {
  return normalizeIranianMobileInput(raw);
}

export interface ServiceRequestModalProps {
  provider: ServiceProviderEntity | null;
  onClose: () => void;
  onSubmit: (payload: { requesterName: string; requesterPhone: string; projectSummary: string; contactConsentAccepted: boolean }) => void;
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  provider,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [summary, setSummary] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useDialogFocus<HTMLFormElement>(Boolean(provider), onClose);
  const providerId = provider?.identity.id ?? null;

  useEffect(() => {
    setError('');
    setSummary('');
    setConsent(false);
  }, [providerId]);

  if (!provider) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizeServicePhoneDigits(phone);
    if (name.trim().length < 2) { setError('لطفاً نام خود را وارد کنید.'); return; }
    if (!isValidNormalizedIranianMobile(normalizedPhone)) { setError('شماره موبایل معتبر ۱۱ رقمی (با 09) وارد کنید.'); return; }
    if (summary.trim().length < 8) { setError('لطفاً شرح کوتاه نیاز ملکی خود را بنویسید.'); return; }
    if (!consent) { setError('برای ارسال درخواست، رضایت نمایش شماره تماس به این ارائه‌دهنده الزامی است.'); return; }

    onSubmit({
      requesterName: name.trim(),
      requesterPhone: normalizedPhone,
      projectSummary: summary.trim(),
      contactConsentAccepted: consent,
    });
    setName(''); setPhone(''); setSummary(''); setConsent(false); setError('');
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9500] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`درخواست خدمت از ${provider.identity.displayName}`}
      onClick={onClose}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        data-testid="service-request-form"
        className="w-full max-w-lg rounded-[16px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 p-5 space-y-3.5 text-xs"
      >
        <div className="flex items-start justify-between gap-2 border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
          <div>
            <span className="text-[10.5px] font-bold text-[#176B63]">
              {SERVICE_CATEGORY_LABELS_FA[provider.category]} · محله {provider.identity.primaryNeighborhoodName}
            </span>
            <h3 className="text-base font-black text-[#182522] dark:text-white mt-0.5">
              ارسال درخواست به {provider.identity.displayName}
            </h3>
          </div>
          <button type="button" aria-label="بستن فرم درخواست" onClick={onClose} className="p-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="font-bold block mb-1">نام و نام خانوادگی</label>
          <input type="text" data-testid="srv-req-name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(''); }} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" placeholder="مثال: آرش احمدی" />
        </div>

        <div>
          <label className="font-bold block mb-1">شماره تماس (فقط پس از رضایت ارسال می‌شود)</label>
          <input type="text" data-testid="srv-req-phone" value={phone} onChange={(e) => { setPhone(e.target.value); if (error) setError(''); }} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums" placeholder="09120000000" />
        </div>

        <div>
          <label className="font-bold block mb-1">شرح نیاز ملکی و محدوده</label>
          <textarea rows={3} data-testid="srv-req-summary" value={summary} onChange={(e) => { setSummary(e.target.value); if (error) setError(''); }} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" placeholder="مثال: بازدید فنی آپارتمان ۱۰۰ متری پیش از امضای مبایعه‌نامه..." />
        </div>

        <label className="flex items-start gap-2 p-3 rounded-[9px] bg-[#F1F4F2] dark:bg-slate-800 cursor-pointer font-bold">
          <input type="checkbox" data-testid="srv-req-consent" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (error) setError(''); }} className="accent-[#176B63] mt-0.5" />
          <span>موافقم شماره تماس من صرفاً در اختیار همین ارائه‌دهنده انتخابی قرار گیرد. رادار تهران تعهدی نسبت به قرارداد خصوصی طرفین ندارد.</span>
        </label>

        {error && <div role="alert" className="p-2.5 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 text-[#B3261E] dark:text-rose-200 font-bold">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 font-bold cursor-pointer">انصراف</button>
          <button type="submit" data-testid="srv-req-submit" className="px-4 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold flex items-center gap-1.5 cursor-pointer">
            <Send className="w-3.5 h-3.5" />
            <span>ثبت درخواست</span>
          </button>
        </div>
      </form>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

/** @file src/features/properties/submission/ListingSubmissionSteps4To7.tsx — Steps 4..7 of Submission Stepper */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AMENITY_VALUE_LABELS_FA,
  DOCUMENT_TYPE_LABELS_FA,
  type AmenityValue,
  type DocumentType,
} from '../types/property.types';
import {
  PUBLISHER_ROLE_LABELS_FA,
  type PriceType,
  type PublisherRole,
} from '../types/listing.types';
import type {
  DuplicateMatchAssessment,
  ListingAnomalyFlag,
  ListingSubmissionDraft,
} from '../types/listing-history.types';

export interface ListingSubmissionSteps4To7Props {
  step: number;
  draft: ListingSubmissionDraft;
  errors: Record<string, string>;
  anomalies: ListingAnomalyFlag[];
  duplicateAssessment: DuplicateMatchAssessment;
  onUpdate: (patch: Partial<ListingSubmissionDraft>) => void;
}

export const ListingSubmissionSteps4To7: React.FC<ListingSubmissionSteps4To7Props> = ({
  step,
  draft,
  errors,
  anomalies,
  duplicateAssessment,
  onUpdate,
}) => {
  if (step === 4) {
    return (
      <div className="space-y-3">
        <div>
          <label className="font-bold block mb-1">نوع سند ملک</label>
          <select
            value={draft.documentType}
            onChange={(e) => onUpdate({ documentType: e.target.value as DocumentType })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          >
            {(Object.keys(DOCUMENT_TYPE_LABELS_FA) as DocumentType[]).map((d) => (
              <option key={d} value={d}>{DOCUMENT_TYPE_LABELS_FA[d]}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['parking', 'elevator', 'storage', 'balcony'] as const).map((k) => (
            <div key={k} className="space-y-1">
              <label className="font-bold block">
                {k === 'parking' ? 'پارکینگ' : k === 'elevator' ? 'آسانسور' : k === 'storage' ? 'انباری' : 'بالکن'}
              </label>
              <select
                value={draft[k]}
                onChange={(e) => onUpdate({ [k]: e.target.value as AmenityValue })}
                className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
              >
                {(Object.keys(AMENITY_VALUE_LABELS_FA) as AmenityValue[]).map((av) => (
                  <option key={av} value={av}>{AMENITY_VALUE_LABELS_FA[av]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="space-y-3">
        <div>
          <label className="font-bold block mb-1">شیوه اعلام قیمت</label>
          <div className="grid grid-cols-3 gap-2">
            {([['fixed', 'قیمت قطعی'], ['negotiable', 'قابل مذاکره'], ['undisclosed', 'توافقی / نامشخص']] as [PriceType, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onUpdate({ priceType: id })}
                className={`p-2 rounded-[8px] border font-bold cursor-pointer ${
                  draft.priceType === id ? 'bg-[#176B63] text-white border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {draft.priceType !== 'undisclosed' &&
          (draft.transactionType === 'sale' || draft.transactionType === 'presale' ? (
            <div>
              <label className="font-bold block mb-1">قیمت کل پیشنهادی (میلیارد تومان)</label>
              <input
                type="text"
                data-testid="submit-price-billion-input"
                aria-invalid={Boolean(errors.saleTotalBillion)}
                value={draft.saleTotalBillion}
                onChange={(e) => onUpdate({ saleTotalBillion: e.target.value })}
                placeholder="مثال: ۲۸.۵"
                className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums"
              />
              {errors.saleTotalBillion && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.saleTotalBillion}</span>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ودیعه (میلیون تومان)</label>
                <input
                  type="text"
                  aria-invalid={Boolean(errors.depositMillion)}
                  value={draft.depositMillion}
                  onChange={(e) => onUpdate({ depositMillion: e.target.value })}
                  className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums"
                />
                {errors.depositMillion && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.depositMillion}</span>}
              </div>
              {draft.transactionType === 'rent' && (
                <div>
                  <label className="font-bold block mb-1">اجاره ماهانه (میلیون تومان)</label>
                  <input
                    type="text"
                    aria-invalid={Boolean(errors.monthlyRentMillion)}
                    value={draft.monthlyRentMillion}
                    onChange={(e) => onUpdate({ monthlyRentMillion: e.target.value })}
                    className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums"
                  />
                  {errors.monthlyRentMillion && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.monthlyRentMillion}</span>}
                </div>
              )}
            </div>
          ))}
        {anomalies.map((flag) => (
          <div key={flag.code} className="p-3 rounded-[9px] bg-[#FFF4E5] border border-[#F4D3A1] text-[#875000] flex items-start gap-2 text-[11px]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{flag.messageFa}</span>
          </div>
        ))}
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="space-y-3">
        <div>
          <label className="font-bold block mb-1">عنوان شفاف فایل</label>
          <input
            type="text"
            data-testid="submit-title-input"
            aria-invalid={Boolean(errors.title)}
            value={draft.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="مثال: آپارتمان ۸۵ متری ۲ خواب بازسازی‌شده، سعادت‌آباد"
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          />
          {errors.title && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.title}</span>}
        </div>
        <div>
          <label className="font-bold block mb-1">توضیحات دقیق ویژگی‌ها و وضعیت تخلیه/سند</label>
          <textarea
            rows={4}
            data-testid="submit-desc-input"
            aria-invalid={Boolean(errors.description)}
            value={draft.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="شرایط نورگیر، مشاعات، بازسازی، وضعیت مستأجر و نکات واقعی ملک..."
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          />
          {errors.description && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.description}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="font-bold block mb-1">نقش ثبت‌کننده</label>
          <select
            value={draft.publisherRole}
            onChange={(e) => onUpdate({ publisherRole: e.target.value as PublisherRole })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          >
            {(['owner', 'agent', 'developer'] as PublisherRole[]).map((r) => (
              <option key={r} value={r}>{PUBLISHER_ROLE_LABELS_FA[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-bold block mb-1">نام نمایشی</label>
          <input
            type="text"
            data-testid="submit-name-input"
            aria-invalid={Boolean(errors.publisherName)}
            value={draft.publisherName}
            onChange={(e) => onUpdate({ publisherName: e.target.value })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          />
          {errors.publisherName && <span role="alert" className="text-[#B3261E] text-[10.5px] block mt-0.5">{errors.publisherName}</span>}
        </div>
        <div>
          <label className="font-bold block mb-1">شماره تماس استعلام</label>
          <input
            type="text"
            data-testid="submit-phone-input"
            aria-invalid={Boolean(errors.publisherPhone)}
            value={draft.publisherPhone}
            onChange={(e) => onUpdate({ publisherPhone: e.target.value })}
            placeholder="09120000000"
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 tabular-nums"
          />
          {errors.publisherPhone && <span role="alert" className="text-[#B3261E] text-[10.5px] block mt-0.5">{errors.publisherPhone}</span>}
        </div>
      </div>

      {duplicateAssessment.level !== 'none' && (
        <div className="p-3 rounded-[9px] bg-[#FFF4E5] border border-[#F4D3A1] text-[#875000] space-y-1 text-[11px]">
          <strong className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> احتمال تشابه با فایل‌های موجود ({duplicateAssessment.reasons.join(' · ')})
          </strong>
          <p>
            {duplicateAssessment.actionPolicy === 'queue_manual_review'
              ? 'این فایل پس از ثبت به صف بررسی دستی می‌رود تا از تکرار آگهی جلوگیری شود.'
              : 'اگر همان فایل قبلی است، ویرایش آگهی قبلی از تکرار جلوگیری می‌کند.'}
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 p-3 rounded-[9px] bg-[#F1F4F2] dark:bg-slate-800 cursor-pointer font-bold">
        <input
          type="checkbox"
          aria-invalid={Boolean(errors.agreeToVerification)}
          checked={draft.agreeToVerification}
          onChange={(e) => onUpdate({ agreeToVerification: e.target.checked })}
          className="accent-[#176B63]"
        />
        <span>صحت اطلاعات را تأیید می‌کنم و می‌دانم پس از انتشار تحت پایش تازگی و گزارش کاربران قرار دارد.</span>
      </label>
      {errors.agreeToVerification && <span role="alert" className="text-[#B3261E] text-[11px] block mt-0.5">{errors.agreeToVerification}</span>}
    </div>
  );
};

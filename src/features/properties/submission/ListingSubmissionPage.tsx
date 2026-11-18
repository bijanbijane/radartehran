/** @file src/features/properties/submission/ListingSubmissionPage.tsx — 7-Step Adaptive Listing Submission Wizard */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Save, ShieldCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  ACCOUNT_WORKSPACE_UPDATED_EVENT,
  resolveEffectiveUid,
} from '../../account/services/accountStorageScope';
import {
  PROPERTY_TYPE_LABELS_FA,
  type LocationPrecision,
  type PropertyType,
} from '../types/property.types';
import {
  TRANSACTION_TYPE_LABELS_FA,
  type PropertyListingRecord,
  type TransactionType,
} from '../types/listing.types';
import type { ListingSubmissionDraft } from '../types/listing-history.types';
import {
  createEmptySubmissionDraft,
  evaluatePriceAnomalies,
  validateSubmissionStep,
} from '../moderation/ListingValidation';
import { assessDuplicateSubmission } from '../moderation/DuplicateDetection';
import {
  clearSubmissionDraft,
  loadSubmissionDraft,
  saveSubmissionDraft,
  submitDraftAsPropertyListing,
} from '../services/listingService';
import { trackPropertyEvent } from '../state/propertyUrlAdapter';

import { ListingSubmissionSteps4To7 } from './ListingSubmissionSteps4To7';

export interface ListingSubmissionPageProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  existingRecords: PropertyListingRecord[];
  currentUserUid?: string | null;
  onCancel: () => void;
  onSubmitted: (record: PropertyListingRecord) => void;
}

const STEPS = [
  { id: 1, label: '۱. نوع ملک و معامله' },
  { id: 2, label: '۲. موقعیت و نقشه' },
  { id: 3, label: '۳. مشخصات فیزیکی' },
  { id: 4, label: '۴. امکانات و سند' },
  { id: 5, label: '۵. قیمت‌گذاری' },
  { id: 6, label: '۶. عنوان و شرح' },
  { id: 7, label: '۷. ثبت‌کننده و بازبینی' },
];

export const ListingSubmissionPage: React.FC<ListingSubmissionPageProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  existingRecords,
  currentUserUid,
  onCancel,
  onSubmitted,
}) => {
  const activeOwnerUid = resolveEffectiveUid(currentUserUid);
  const lastOwnerUidRef = useRef<string>(activeOwnerUid);
  const [draft, setDraft] = useState<ListingSubmissionDraft>(
    () => loadSubmissionDraft(activeOwnerUid) || createEmptySubmissionDraft(selectedHood.id, 'tehran', activeOwnerUid),
  );
  const [step, setStep] = useState<number>(draft.stepIndex || 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedNotice, setSavedNotice] = useState<string>('');

  useEffect(() => {
    const syncAccountDraft = () => {
      const nextUid = resolveEffectiveUid(currentUserUid);
      if (lastOwnerUidRef.current === nextUid && draft.ownerUid === nextUid) return;
      lastOwnerUidRef.current = nextUid;
      const loaded = loadSubmissionDraft(nextUid) || createEmptySubmissionDraft(selectedHood.id, 'tehran', nextUid);
      setDraft(loaded);
      setStep(loaded.stepIndex || 1);
      setErrors({});
      setSavedNotice('');
    };
    syncAccountDraft();
    window.addEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, syncAccountDraft);
    return () => window.removeEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, syncAccountDraft);
  }, [currentUserUid, selectedHood.id, draft.ownerUid]);

  const targetHood = useMemo(
    () => evaluatedNeighborhoods.find((h) => h.id === draft.hoodId) || selectedHood,
    [evaluatedNeighborhoods, draft.hoodId, selectedHood],
  );

  const anomalies = useMemo(() => evaluatePriceAnomalies(draft, targetHood), [draft, targetHood]);
  const duplicateAssessment = useMemo(() => assessDuplicateSubmission(draft, existingRecords), [draft, existingRecords]);

  const update = (patch: Partial<ListingSubmissionDraft>) => {
    const scopeUid = resolveEffectiveUid(currentUserUid);
    const baseDraft = draft.ownerUid && draft.ownerUid !== scopeUid
      ? loadSubmissionDraft(scopeUid) || createEmptySubmissionDraft(selectedHood.id, 'tehran', scopeUid)
      : draft;
    const next: ListingSubmissionDraft = { ...baseDraft, ...patch, ownerUid: scopeUid, stepIndex: step };
    setDraft(next);
    saveSubmissionDraft(next, scopeUid);
  };

  const handleNext = () => {
    const scopeUid = resolveEffectiveUid(currentUserUid);
    const res = validateSubmissionStep(draft, step);
    setErrors(res.errors);
    if (!res.valid) return;
    const nextStep = Math.min(7, step + 1);
    setStep(nextStep);
    saveSubmissionDraft({ ...draft, ownerUid: scopeUid, stepIndex: nextStep }, scopeUid);
    trackPropertyEvent('property_submission_step', { step: nextStep });
  };

  const handleManualDraftSave = () => {
    const scopeUid = resolveEffectiveUid(currentUserUid);
    const stamped = saveSubmissionDraft({ ...draft, ownerUid: scopeUid, stepIndex: step }, scopeUid);
    setSavedNotice(`پیش‌نویس در ${new Date(stamped.lastSavedAtIso).toLocaleTimeString('fa-IR')} ذخیره شد`);
    setTimeout(() => setSavedNotice(''), 2500);
  };

  const handleSubmit = () => {
    const scopeUid = resolveEffectiveUid(currentUserUid);
    if (draft.ownerUid && draft.ownerUid !== scopeUid) {
      const reloaded = loadSubmissionDraft(scopeUid) || createEmptySubmissionDraft(selectedHood.id, 'tehran', scopeUid);
      setDraft(reloaded);
      setStep(reloaded.stepIndex || 1);
      setErrors({ publisherName: 'حساب کاربری تغییر کرده است. لطفاً پیش‌نویس حساب فعلی را بررسی کنید.' });
      return;
    }
    const res = validateSubmissionStep(draft, 7);
    setErrors(res.errors);
    if (!res.valid) return;
    const created = submitDraftAsPropertyListing({ ...draft, ownerUid: scopeUid }, targetHood, duplicateAssessment, scopeUid);
    trackPropertyEvent('property_submitted', { status: created.listing.status, dup: duplicateAssessment.level });
    onSubmitted(created);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 rounded-[16px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-5" data-testid="listing-submission-wizard">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE3DF] dark:border-slate-800 pb-3.5">
        <div>
          <h2 className="text-base sm:text-lg font-black text-[#182522] dark:text-white">ثبت ساختاریافته فایل ملکی (گام {toPersianNum(step)} از ۷)</h2>
          <p className="text-[11px] text-[#586760] dark:text-slate-400">
            پیش‌نویس شما به‌صورت خودکار ذخیره می‌شود · {savedNotice || `آخرین ذخیره: ${new Date(draft.lastSavedAtIso).toLocaleTimeString('fa-IR')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={handleManualDraftSave} className="px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
            <Save className="w-3.5 h-3.5 text-[#176B63]" />
            <span>ذخیره پیش‌نویس</span>
          </button>
          <button
            type="button"
            onClick={() => { clearSubmissionDraft(resolveEffectiveUid(currentUserUid)); onCancel(); }}
            className="px-2.5 py-1.5 rounded-[8px] text-[#B3261E] font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            انصراف
          </button>
        </div>
      </div>

      {/* Stepper Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { if (s.id < step) setStep(s.id); }}
            className={`px-2.5 py-1 rounded-[7px] text-[11px] font-bold whitespace-nowrap cursor-pointer ${
              s.id === step
                ? 'bg-[#176B63] text-white'
                : s.id < step
                ? 'bg-[#EAF5EE] text-[#176B4C]'
                : 'bg-[#F1F4F2] dark:bg-slate-800 text-[#586760]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 text-xs">
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-bold text-[#182522] dark:text-white block">نوع معامله</label>
              {(Object.keys(TRANSACTION_TYPE_LABELS_FA) as TransactionType[]).map((tx) => (
                <button
                  key={tx}
                  type="button"
                  onClick={() => update({ transactionType: tx })}
                  className={`w-full p-2.5 rounded-[9px] border text-right font-bold cursor-pointer ${
                    draft.transactionType === tx ? 'bg-[#EAF3F0] border-[#176B63] text-[#14534E]' : 'border-[#DCE3DF] dark:border-slate-700'
                  }`}
                >
                  {TRANSACTION_TYPE_LABELS_FA[tx]}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="font-bold text-[#182522] dark:text-white block">کاربری فیزیکی ملک</label>
              {(Object.keys(PROPERTY_TYPE_LABELS_FA) as PropertyType[]).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => update({ propertyType: pt })}
                  className={`w-full p-2.5 rounded-[9px] border text-right font-bold cursor-pointer ${
                    draft.propertyType === pt ? 'bg-[#EAF3F0] border-[#176B63] text-[#14534E]' : 'border-[#DCE3DF] dark:border-slate-700'
                  }`}
                >
                  {PROPERTY_TYPE_LABELS_FA[pt]}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="font-bold block mb-1">محله</label>
              <select
                value={draft.hoodId}
                onChange={(e) => update({ hoodId: Number(e.target.value) })}
                className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
              >
                {evaluatedNeighborhoods.map((h) => (
                  <option key={h.id} value={h.id}>محله {h.name} ({h.zone})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">خیابان / محدوده تقریبی</label>
              <input
                type="text"
                data-testid="submit-street-input"
                value={draft.street}
                onChange={(e) => update({ street: e.target.value })}
                placeholder="مثال: بلوار ۲۴ متری، فرعی دنج..."
                className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
              />
              {errors.street && <span className="text-[#B3261E] text-[11px] block mt-1">{errors.street}</span>}
            </div>
            <div>
              <label className="font-bold block mb-1">سطح نمایش موقعیت روی نقشه (حریم خصوصی)</label>
              <select
                value={draft.locationPrecision}
                onChange={(e) => update({ locationPrecision: e.target.value as LocationPrecision })}
                className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
              >
                <option value="approximate">محدوده تقریبی خیابان (پیشنهادی برای حفظ حریم خصوصی)</option>
                <option value="neighborhood">فقط در سطح محله</option>
                <option value="exact">نقطه دقیق ثبت‌شده</option>
                <option value="unavailable">عدم نمایش مختصات روی نقشه</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tabular-nums">
            <div>
              <label className="font-bold block mb-1">متراژ (متر مربع)</label>
              <input type="text" data-testid="submit-area-input" value={draft.areaSqm} onChange={(e) => update({ areaSqm: e.target.value })} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
              {errors.areaSqm && <span className="text-[#B3261E] text-[11px]">{errors.areaSqm}</span>}
            </div>
            {draft.propertyType !== 'land' && (
              <>
                <div>
                  <label className="font-bold block mb-1">سال ساخت (شمسی)</label>
                  <input type="text" value={draft.buildYearJalali} onChange={(e) => update({ buildYearJalali: e.target.value })} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
                  {errors.buildYearJalali && <span className="text-[#B3261E] text-[11px]">{errors.buildYearJalali}</span>}
                </div>
                <div>
                  <label className="font-bold block mb-1">تعداد اتاق خواب</label>
                  <input type="text" value={draft.roomsCount} onChange={(e) => update({ roomsCount: e.target.value })} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold block mb-1">طبقه</label>
                    <input type="text" value={draft.floorNumber} onChange={(e) => update({ floorNumber: e.target.value })} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">کل طبقات</label>
                    <input type="text" value={draft.totalFloors} onChange={(e) => update({ totalFloors: e.target.value })} className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
                    {errors.totalFloors && <span className="text-[#B3261E] text-[10px]">{errors.totalFloors}</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step >= 4 && (
          <ListingSubmissionSteps4To7
            step={step}
            draft={draft}
            errors={errors}
            anomalies={anomalies}
            duplicateAssessment={duplicateAssessment}
            onUpdate={update}
          />
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[#DCE3DF] dark:border-slate-800">
        <button type="button" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} className="px-3.5 py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40">
          <ArrowRight className="w-3.5 h-3.5" />
          <span>گام قبل</span>
        </button>
        {step < 7 ? (
          <button type="button" data-testid="submit-wizard-next-btn" onClick={handleNext} className="px-4 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white text-xs font-bold flex items-center gap-1 cursor-pointer">
            <span>گام بعد</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button type="button" data-testid="submit-wizard-publish-btn" onClick={handleSubmit} className="px-5 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            {duplicateAssessment.actionPolicy === 'queue_manual_review' ? <ShieldCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>ثبت نهایی فایل</span>
          </button>
        )}
      </div>
    </div>
  );
};

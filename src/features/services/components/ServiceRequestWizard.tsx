/** @file src/features/services/components/ServiceRequestWizard.tsx — 7-Step Structured Service Request Flow with Draft Persistence */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Save, ShieldCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  isValidNormalizedIranianMobile,
  normalizeIranianMobileInput,
  parseLocalizedNumber,
} from '../../../utils/forms/formInputHelpers';
import {
  CANONICAL_SERVICE_DEFINITIONS,
  resolveCategoryAdaptiveQuestions,
} from '../services/serviceTaxonomyAndVerification';
import {
  clearServiceRequestDraft,
  loadServiceRequestDraft,
  saveServiceRequestDraft,
  validateAllServiceWizardSteps,
  validateServiceWizardStep,
  type ServiceRequestDraftPayload,
} from '../services/serviceWorkflowService';
import type { ServiceCanonicalCategory, ServiceDeliveryMode } from '../types/service.types';
import { ServiceRequestWizardSteps } from './ServiceRequestWizardSteps';

export interface ServiceRequestWizardProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSubmitWizard: (payload: {
    canonicalCategory: ServiceCanonicalCategory;
    serviceId: string;
    neighborhoodName: string;
    propertyTypeFa: string;
    areaSqm?: number;
    budgetRangeFa: string;
    preferredScheduleFa: string;
    deliveryMode: ServiceDeliveryMode;
    contactPolicy: 'platform_only' | 'shared_after_approval';
    requesterName: string;
    requesterPhone: string;
    projectSummary: string;
    categorySpecificDetails: Record<string, string>;
    contactConsentAccepted: boolean;
  }) => void;
}

const STEPS_FA = [
  '۱. رسته خدمت',
  '۲. عنوان خدمت',
  '۳. محدوده و روش',
  '۴. مشخصات ملک',
  '۵. جزئیات تخصصی',
  '۶. بودجه و زمان',
  '۷. حریم خصوصی و ارسال',
];

export const ServiceRequestWizard: React.FC<ServiceRequestWizardProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  onSubmitWizard,
}) => {
  const createInitialDraft = (hoodName: string): ServiceRequestDraftPayload => ({
    canonicalCategory: 'legal',
    serviceId: 'legal.contract-review',
    neighborhoodName: hoodName,
    propertyTypeFa: 'آپارتمان مسکونی',
    areaSqm: '95',
    budgetRangeFa: 'طبق تعرفه رسمی / توافقی',
    preferredScheduleFa: 'طی ۴۸ ساعت آینده',
    deliveryMode: 'hybrid',
    contactPolicy: 'shared_after_approval',
    requesterName: '',
    requesterPhone: '',
    projectSummary: '',
    categorySpecificDetails: {},
    contactConsentAccepted: false,
  });

  const saved = useMemo(() => loadServiceRequestDraft(), []);
  const [step, setStep] = useState(0);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);
  const [error, setError] = useState('');
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<ServiceRequestDraftPayload>(() => ({
    ...createInitialDraft(selectedHood.name),
    ...(saved ? {
      canonicalCategory: saved.canonicalCategory || 'legal',
      serviceId: saved.serviceId || 'legal.contract-review',
      neighborhoodName: saved.neighborhoodName || selectedHood.name,
      propertyTypeFa: saved.propertyTypeFa || 'آپارتمان مسکونی',
      areaSqm: saved.areaSqm || '95',
      budgetRangeFa: saved.budgetRangeFa || 'طبق تعرفه رسمی / توافقی',
      preferredScheduleFa: saved.preferredScheduleFa || 'طی ۴۸ ساعت آینده',
      deliveryMode: saved.deliveryMode || 'hybrid',
      contactPolicy: saved.contactPolicy || 'shared_after_approval',
      requesterName: saved.requesterName || '',
      requesterPhone: saved.requesterPhone || '',
      projectSummary: saved.projectSummary || '',
      categorySpecificDetails: saved.categorySpecificDetails || {},
      contactConsentAccepted: saved.contactConsentAccepted || false,
    } : {}),
  }));

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
  }, []);

  const categoryServices = useMemo(
    () => CANONICAL_SERVICE_DEFINITIONS.filter((s) => s.category === draft.canonicalCategory),
    [draft.canonicalCategory],
  );
  const adaptiveFields = useMemo(
    () => resolveCategoryAdaptiveQuestions(draft.canonicalCategory),
    [draft.canonicalCategory],
  );

  const patch = (p: Partial<ServiceRequestDraftPayload>) => {
    setError('');
    setDraft((prev) => ({ ...prev, ...p }));
  };

  const handleSaveDraft = () => {
    saveServiceRequestDraft(draft);
    setDraftSavedNotice(true);
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setDraftSavedNotice(false);
      noticeTimerRef.current = null;
    }, 2500);
  };

  const jumpToStep = (targetIdx: number) => {
    if (targetIdx <= step) {
      setError('');
      setStep(targetIdx);
      return;
    }
    for (let i = step; i < targetIdx; i += 1) {
      const check = validateServiceWizardStep(draft, i);
      if (!check.valid) {
        setStep(i);
        setError(Object.values(check.errors)[0] || 'لطفاً فیلدهای این مرحله را تکمیل کنید.');
        return;
      }
    }
    setError('');
    setStep(targetIdx);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS_FA.length - 1) {
      const stepRes = validateServiceWizardStep(draft, step);
      if (!stepRes.valid) {
        setError(Object.values(stepRes.errors)[0] || 'لطفاً فیلدهای این مرحله را تکمیل کنید.');
        return;
      }
      setError('');
      setStep((s) => Math.min(STEPS_FA.length - 1, s + 1));
      return;
    }
    const allRes = validateAllServiceWizardSteps(draft);
    if (!allRes.valid) {
      if (allRes.firstInvalidStep !== null && allRes.firstInvalidStep !== step) {
        setStep(allRes.firstInvalidStep);
      }
      setError(Object.values(allRes.errors)[0] || 'لطفاً فیلدهای الزامی درخواست را تکمیل کنید.');
      return;
    }
    const normalizedPhone = normalizeIranianMobileInput(draft.requesterPhone);
    if (!isValidNormalizedIranianMobile(normalizedPhone)) {
      setError('شماره موبایل معتبر ۱۱ رقمی (با 09) وارد کنید.');
      return;
    }
    const parsedArea = parseLocalizedNumber(draft.areaSqm);
    onSubmitWizard({
      canonicalCategory: draft.canonicalCategory,
      serviceId: draft.serviceId,
      neighborhoodName: draft.neighborhoodName,
      propertyTypeFa: draft.propertyTypeFa,
      areaSqm: Number.isFinite(parsedArea) && parsedArea > 0 ? parsedArea : undefined,
      budgetRangeFa: draft.budgetRangeFa,
      preferredScheduleFa: draft.preferredScheduleFa,
      deliveryMode: draft.deliveryMode,
      contactPolicy: draft.contactPolicy,
      requesterName: draft.requesterName.trim(),
      requesterPhone: normalizedPhone,
      projectSummary: draft.projectSummary.trim(),
      categorySpecificDetails: draft.categorySpecificDetails,
      contactConsentAccepted: draft.contactConsentAccepted,
    });
    clearServiceRequestDraft();
    setDraft(createInitialDraft(selectedHood.name));
    setStep(0);
    setError('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="service-request-wizard"
      className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-4 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white">ثبت درخواست تخصصی ۷ مرحله‌ای</h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">اطلاعات تماس شما تا پیش از انتخاب یا تأیید حریم خصوصی در اختیار عموم قرار نمی‌گیرد.</p>
        </div>
        <button
          type="button"
          onClick={handleSaveDraft}
          className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
          <span>{draftSavedNotice ? 'پیش‌نویس ذخیره شد' : 'ذخیره پیش‌نویس'}</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STEPS_FA.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => jumpToStep(idx)}
            className={`px-2.5 py-1 rounded-[7px] font-bold cursor-pointer whitespace-nowrap ${
              step === idx
                ? 'bg-[var(--color-brand-600)] text-white'
                : idx < step
                ? 'bg-[#EAF3F0] dark:bg-emerald-950/50 text-[var(--color-brand-700)] dark:text-emerald-300'
                : 'bg-[#F8F9FA] dark:bg-slate-800 text-[var(--color-text-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ServiceRequestWizardSteps
        step={step}
        draft={draft}
        evaluatedNeighborhoods={evaluatedNeighborhoods}
        categoryServices={categoryServices}
        adaptiveFields={adaptiveFields}
        patch={patch}
        onSelectCategory={(cat) => {
          const first = CANONICAL_SERVICE_DEFINITIONS.find((d) => d.category === cat);
          patch({ canonicalCategory: cat, serviceId: first?.serviceId || draft.serviceId });
          setStep(1);
        }}
      />

      {error && <div role="alert" className="p-2.5 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 text-[#B3261E] dark:text-rose-200 font-bold">{error}</div>}

      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => { setError(''); setStep((s) => Math.max(0, s - 1)); }}
          className="px-3.5 py-2 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>مرحله قبل</span>
        </button>

        <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
          گام {toPersianNum(step + 1)} از {toPersianNum(STEPS_FA.length)}
        </span>

        {step < STEPS_FA.length - 1 ? (
          <button
            type="submit"
            className="px-4 py-2 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>مرحله بعد</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            data-testid="wizard-submit-btn"
            className="px-4 py-2 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>ثبت نهایی درخواست</span>
          </button>
        )}
      </div>
    </form>
  );
};

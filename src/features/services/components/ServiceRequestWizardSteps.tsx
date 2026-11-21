/** @file src/features/services/components/ServiceRequestWizardSteps.tsx — Step Views (0..6) for 7-Step Service Request Wizard */
import React from 'react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { ServiceRequestDraftPayload } from '../services/serviceWorkflowService';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ServiceCanonicalCategory,
  type ServiceDefinition,
  type ServiceDeliveryMode,
} from '../types/service.types';

export interface ServiceRequestWizardStepsProps {
  step: number;
  draft: ServiceRequestDraftPayload;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  categoryServices: ServiceDefinition[];
  adaptiveFields: Array<{ key: string; labelFa: string; placeholderFa: string }>;
  patch: (p: Partial<ServiceRequestDraftPayload>) => void;
  onSelectCategory: (cat: ServiceCanonicalCategory) => void;
}

export const ServiceRequestWizardSteps: React.FC<ServiceRequestWizardStepsProps> = ({
  step,
  draft,
  evaluatedNeighborhoods,
  categoryServices,
  adaptiveFields,
  patch,
  onSelectCategory,
}) => {
  if (step === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(Object.keys(CANONICAL_CATEGORY_LABELS_FA) as Array<ServiceCanonicalCategory | 'all'>)
          .filter((k): k is ServiceCanonicalCategory => k !== 'all')
          .map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`p-3 rounded-[10px] border text-start font-bold cursor-pointer ${
                draft.canonicalCategory === cat
                  ? 'border-[var(--color-brand-600)] bg-[#EAF3F0]/60 dark:bg-emerald-950/40 text-[var(--color-brand-700)] dark:text-emerald-200'
                  : 'border-[var(--color-border-subtle)] dark:border-slate-800 text-[var(--color-text-primary)] dark:text-white'
              }`}
            >
              {CANONICAL_CATEGORY_LABELS_FA[cat]}
            </button>
          ))}
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-2">
        {categoryServices.map((srv) => (
          <label key={srv.serviceId} className="block p-3 rounded-[10px] border border-[var(--color-border-subtle)] dark:border-slate-800 cursor-pointer">
            <div className="flex items-center gap-2 font-black text-[var(--color-text-primary)] dark:text-white">
              <input
                type="radio"
                name="serviceId"
                checked={draft.serviceId === srv.serviceId}
                onChange={() => patch({ serviceId: srv.serviceId })}
                className="accent-[var(--color-brand-600)]"
              />
              <span>{srv.titleFa}</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 pr-5">{srv.summaryFa}</p>
          </label>
        ))}
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-bold block mb-1">محدوده و محله ملک</label>
          <select
            value={draft.neighborhoodName}
            onChange={(e) => patch({ neighborhoodName: e.target.value })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          >
            {evaluatedNeighborhoods.map((h) => (
              <option key={h.id} value={h.name}>محله {h.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-bold block mb-1">نحوه ارائه خدمت</label>
          <select
            value={draft.deliveryMode}
            onChange={(e) => patch({ deliveryMode: e.target.value as ServiceDeliveryMode })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          >
            <option value="onsite">حضوری در محل ملک</option>
            <option value="remote">آنلاین / غیرحضوری</option>
            <option value="hybrid">ترکیبی (آنلاین + بازدید حضوری)</option>
          </select>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-bold block mb-1">نوع ملک</label>
          <select
            value={draft.propertyTypeFa}
            onChange={(e) => patch({ propertyTypeFa: e.target.value })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          >
            <option value="آپارتمان مسکونی">آپارتمان مسکونی</option>
            <option value="ویلایی / کلنگی">ویلایی / کلنگی</option>
            <option value="تجاری / مغازه">تجاری / مغازه</option>
            <option value="اداری">اداری</option>
            <option value="مشاعات ساختمان">مشاعات ساختمان</option>
          </select>
        </div>
        <div>
          <label className="font-bold block mb-1">متراژ تقریبی (متر مربع)</label>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={draft.areaSqm}
            onChange={(e) => patch({ areaSqm: e.target.value })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 tabular-nums"
          />
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="space-y-3">
        {adaptiveFields.map((f) => (
          <div key={f.key}>
            <label className="font-bold block mb-1">{f.labelFa}</label>
            <input
              type="text"
              value={draft.categorySpecificDetails[f.key] || ''}
              onChange={(e) =>
                patch({ categorySpecificDetails: { ...draft.categorySpecificDetails, [f.key]: e.target.value } })
              }
              placeholder={f.placeholderFa}
              className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
            />
          </div>
        ))}
        <div>
          <label className="font-bold block mb-1">شرح دقیق نیاز و انتظارات شما</label>
          <textarea
            rows={3}
            data-testid="wizard-project-summary"
            value={draft.projectSummary}
            onChange={(e) => patch({ projectSummary: e.target.value })}
            placeholder="مثال: نیاز به بررسی حقوقی مبایعه‌نامه و وضعیت رهن پیش از امضای نهایی..."
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          />
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-bold block mb-1">بازه بودجه حق‌الزحمه</label>
          <input
            type="text"
            value={draft.budgetRangeFa}
            onChange={(e) => patch({ budgetRangeFa: e.target.value })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          />
        </div>
        <div>
          <label className="font-bold block mb-1">زمان مطلوب انجام خدمت</label>
          <input
            type="text"
            value={draft.preferredScheduleFa}
            onChange={(e) => patch({ preferredScheduleFa: e.target.value })}
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-bold block mb-1">نام متقاضی</label>
          <input
            type="text"
            data-testid="wizard-requester-name"
            value={draft.requesterName}
            onChange={(e) => patch({ requesterName: e.target.value })}
            placeholder="نام و نام خانوادگی"
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
          />
        </div>
        <div>
          <label className="font-bold block mb-1">شماره تماس (محفوظ تا زمان تأیید)</label>
          <input
            type="text"
            data-testid="wizard-requester-phone"
            value={draft.requesterPhone}
            onChange={(e) => patch({ requesterPhone: e.target.value })}
            placeholder="09120000000"
            className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 tabular-nums"
          />
        </div>
      </div>

      <div>
        <label className="font-bold block mb-1">سیاست اشتراک‌گذاری راه تماس</label>
        <select
          value={draft.contactPolicy}
          onChange={(e) => patch({ contactPolicy: e.target.value as 'platform_only' | 'shared_after_approval' })}
          className="w-full p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700"
        >
          <option value="shared_after_approval">نمایش شماره فقط پس از تأیید پیشنهاد ارائه‌دهنده</option>
          <option value="platform_only">فقط پیام و پیشنهاد داخل پلتفرم</option>
        </select>
      </div>

      <label className="flex items-start gap-2 p-3 rounded-[9px] bg-[var(--color-bg-muted)] dark:bg-slate-800 cursor-pointer font-bold">
        <input
          type="checkbox"
          data-testid="wizard-consent"
          checked={draft.contactConsentAccepted}
          onChange={(e) => patch({ contactConsentAccepted: e.target.checked })}
          className="accent-[var(--color-brand-600)] mt-0.5"
        />
        <span>موافقم اطلاعات این درخواست صرفاً برای دریافت پیشنهاد متخصصان مرتبط استفاده شود.</span>
      </label>
    </div>
  );
};

/** @file src/features/onboarding/components/Stage46IntakeAndEvidencePanel.tsx — Stage 46 Complaint Builder, Side-by-Side Responses & Evidence */
import React, { useState } from 'react';
import {
  addConflictingEvidencePreservingBoth,
  getConditionalComplaintFields,
  submitCounterpartyResponse,
  submitServiceComplaint,
} from '../services/serviceQualityEngine';
import type {
  DisputeCaseRecord,
  DisputeCategoryId,
  DisputeEvidenceItem,
  DisputeResponseRecord,
  DisputeServiceDomain,
} from '../services/serviceQualityTypes';

const CATEGORIES: DisputeCategoryId[] = [
  'کیفیت فنی', 'عدم تطابق با توافق', 'زمان‌بندی و تأخیر', 'اختلاف مالی', 'ارتباطی',
  'رفتاری', 'مدارک و گزارش', 'هویت و اعتبار', 'حریم خصوصی', 'سایر',
];

export const Stage46IntakeAndEvidencePanel: React.FC<{
  section: 'overview_complaint' | 'claim_evidence';
  disputeCase: DisputeCaseRecord;
  casesCount: number;
  onUpdateCase: (next: DisputeCaseRecord) => void;
  onAddNewCase: (created: DisputeCaseRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, disputeCase, casesCount, onUpdateCase, onAddNewCase, onFeedbackFa }) => {
  const [domain, setDomain] = useState<DisputeServiceDomain>(disputeCase.serviceDomain);
  const [category, setCategory] = useState<DisputeCategoryId>('کیفیت فنی');
  const [titleFa, setTitleFa] = useState('درخواست بازبینی گزارش تست فشار کلکتور آب گرم');
  const [claimSummaryFa, setClaimSummaryFa] = useState('گزارش تحویلی مرحله ۲ فاقد ثبت عددی فشار خطوط آب گرم است.');
  const [requestedOutcomeFa, setRequestedOutcomeFa] = useState('انجام تست تکمیلی و صدور گزارش اصلاح‌شده');

  const [stance, setStance] = useState<DisputeResponseRecord['stance']>('پیشنهاد اصلاح');
  const [responseText, setResponseText] = useState('تست فشار آب سرد ثبت شده و تست خط آب گرم بدون حذف گزارش قبلی تکمیل می‌شود.');

  const [evTitle, setEvTitle] = useState('تصویر گیج جدید و صورت‌جلسه حضور مشترک');
  const [evKind, setEvKind] = useState<DisputeEvidenceItem['kindFa']>('گزارش فنی');
  const [evRole, setEvRole] = useState<DisputeEvidenceItem['submittedByRole']>('provider');
  const [evDesc, setEvDesc] = useState('مستند تکمیلی با حفظ هر دو نسخه متضاد E1 و E2 در پرونده.');

  const conditionalFields = getConditionalComplaintFields(category, domain);

  if (section === 'overview_complaint') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="qar-overview-complaint-panel">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-cyan-300">پرونده فعال: {disputeCase.caseId} — {disputeCase.titleFa}</span>
            <span data-testid="qar-claim-badge" className="rounded bg-amber-950/60 border border-amber-700/60 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              {disputeCase.claimVerificationBadgeFa} · وضعیت: {disputeCase.status}
            </span>
          </div>
          <div className="text-slate-300 leading-relaxed">
            <div>اتصال پرونده به مرحله ۴۳/۴۴/۴۵: درخواست <strong>{disputeCase.linkedRequestId}</strong> · صورت‌حساب <strong>{disputeCase.linkedInvoiceNumber || '—'}</strong> · پروژه <strong>{disputeCase.linkedProjectId}</strong></div>
            <div className="mt-1">مسئول پیگیری فعلی: <strong>{disputeCase.handlerNameFa || 'در انتظار تخصیص'}</strong></div>
          </div>
          <div data-testid="qar-credential-safe-banner" className="rounded border border-emerald-700/50 bg-emerald-950/30 p-2 text-[10px] text-emerald-200">
            حفاظت اعتبار (QAR-21): {disputeCase.credentialImpactNoteFa}
          </div>
          <div className="text-[10px] text-slate-400">
            وضعیت حذف خودکار نشان ارائه‌دهنده: <strong>{disputeCase.providerBadgeAutoDropped ? 'فعال' : 'غیرفعال (محفوظ)'}</strong>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
          <div className="font-bold text-white">ثبت شکایت یا اعتراض ساختاریافته (QAR-05)</div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="دامنه خدمت شکایت" value={domain} onChange={(e) => setDomain(e.target.value as DisputeServiceDomain)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              <option value="technical_inspection">بازرسی فنی و تاسیسات</option>
              <option value="construction_renovation">بازسازی و اجرا</option>
              <option value="advisory">مشاوره تخصصی</option>
              <option value="facilities_repair">تعمیرات ساختمان</option>
            </select>
            <select aria-label="دسته‌بندی موضوع شکایت" data-testid="qar-category-select" value={category} onChange={(e) => setCategory(e.target.value as DisputeCategoryId)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rounded bg-slate-900/90 p-2 text-[10px] text-slate-300" data-testid="qar-conditional-fields">
            فیلدهای پویای این دسته: {conditionalFields.join(' · ')}
          </div>
          <input value={titleFa} onChange={(e) => setTitleFa(e.target.value)} aria-label="عنوان شکایت" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <input value={claimSummaryFa} onChange={(e) => setClaimSummaryFa(e.target.value)} aria-label="شرح ادعا" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <div className="flex flex-wrap items-center gap-2">
            <input value={requestedOutcomeFa} onChange={(e) => setRequestedOutcomeFa(e.target.value)} aria-label="نتیجه درخواستی" className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button
              type="button"
              data-testid="qar-submit-complaint-btn"
              onClick={() => {
                const created = submitServiceComplaint({
                  existingCasesCount: casesCount,
                  linkedRequestId: 'req-43-101',
                  linkedDossierId: 'dos-44-saadat-101',
                  linkedInvoiceNumber: 'INV-1405-4401',
                  linkedProjectId: 'prj-45-saadat-101',
                  linkedMilestoneTitleFa: 'مرحله ۲: کنترل تأسیسات و لوله‌کشی',
                  serviceDomain: domain,
                  category,
                  titleFa,
                  claimSummaryFa,
                  requestedOutcomeFa,
                });
                onAddNewCase(created);
                onFeedbackFa(`شکایت ${created.caseId} با برچسب «ادعای بررسی‌نشده» ثبت شد و هیچ کاهش خودکار اعتباری اعمال نگردید.`);
              }}
              className="rounded bg-cyan-600 hover:bg-cyan-500 px-3 py-1 font-bold text-slate-950 cursor-pointer"
            >
              ثبت شکایت جدید
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="qar-claim-evidence-panel">
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
        <div className="font-bold text-white">نمای دوجانبه ادعا و پاسخ طرف مقابل (QAR-07 / QAR-08)</div>
        <div className="rounded border border-amber-700/40 bg-amber-950/20 p-2 text-slate-200 space-y-1">
          <div className="font-bold text-amber-300">ادعای متقاضی ({disputeCase.claimVerificationBadgeFa})</div>
          <div>{disputeCase.claimSummaryFa}</div>
          <div className="text-[10px] text-slate-400">نتیجه درخواستی: {disputeCase.requestedOutcomeFa}</div>
        </div>
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {disputeCase.responses.map((r) => (
            <div key={r.responseId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-200">
              <div className="font-bold text-cyan-300">{r.authorNameFa} — موضع: {r.stance} ({r.submittedAtFa})</div>
              <div>{r.explanationFa}</div>
            </div>
          ))}
        </div>
        <div className="pt-1 border-t border-slate-800 space-y-1.5">
          <div className="text-[10px] text-slate-400">قاعده دفاع منصفانه: طرف مقابل می‌تواند پاسخ رسمی ثبت کند ولی امکان حذف شکایت را ندارد؛ عدم پاسخ به معنی اقرار نیست.</div>
          <div className="flex flex-wrap gap-1.5">
            <select aria-label="موضع طرف مقابل" value={stance} onChange={(e) => setStance(e.target.value as DisputeResponseRecord['stance'])} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              <option value="پیشنهاد اصلاح">پیشنهاد اصلاح</option>
              <option value="پذیرش بخشی از موضوع">پذیرش بخشی از موضوع</option>
              <option value="مخالفت با ادعا">مخالفت با ادعا</option>
              <option value="ارائه توضیح">ارائه توضیح</option>
              <option value="درخواست بررسی مستقل">درخواست بررسی مستقل</option>
            </select>
            <input value={responseText} onChange={(e) => setResponseText(e.target.value)} aria-label="متن پاسخ طرف مقابل" className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button
              type="button"
              data-testid="qar-submit-response-btn"
              onClick={() => {
                onUpdateCase(submitCounterpartyResponse({ disputeCase, authorNameFa: 'دفتر فنی مهندس نیازی', stance, explanationFa: responseText }));
                onFeedbackFa('پاسخ رسمی طرف مقابل در کنار ادعای اولیه ثبت شد.');
              }}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 font-bold text-slate-950 cursor-pointer"
            >
              ثبت پاسخ
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-[11px]">
        <div className="font-bold text-white">مدیریت شواهد و نگهداری مستندات متعارض (QAR-09 / QAR-10)</div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto" data-testid="qar-evidence-list">
          {disputeCase.evidences.map((ev) => (
            <div key={ev.evidenceId} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-200 flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-white">[{ev.versionLabel}] {ev.titleFa}</div>
                <div className="text-slate-400">{ev.submittedByNameFa} · نوع: {ev.kindFa} · مرتبط با: {ev.relatedTargetFa}</div>
                <div className="text-slate-300">{ev.descriptionFa}</div>
                {ev.conflictsWithEvidenceId && <div className="text-amber-300 font-bold">تعارض ثبت‌شده با سند {ev.conflictsWithEvidenceId} (هر دو سند با هم حفظ شده‌اند)</div>}
              </div>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300 font-bold shrink-0">{ev.status}</span>
            </div>
          ))}
        </div>
        <div className="pt-1 border-t border-slate-800 grid grid-cols-2 gap-1.5">
          <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} aria-label="عنوان سند جدید" className="col-span-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <select aria-label="نوع سند" value={evKind} onChange={(e) => setEvKind(e.target.value as DisputeEvidenceItem['kindFa'])} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            <option value="گزارش فنی">گزارش فنی</option>
            <option value="تصویر">تصویر</option>
            <option value="صورت‌حساب">صورت‌حساب</option>
            <option value="صورت‌جلسه">صورت‌جلسه</option>
          </select>
          <select aria-label="ارسال‌کننده سند" value={evRole} onChange={(e) => setEvRole(e.target.value as DisputeEvidenceItem['submittedByRole'])} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            <option value="provider">ارائه‌دهنده</option>
            <option value="applicant">درخواست‌کننده</option>
            <option value="reviewer">ارزیاب مستقل</option>
          </select>
          <input value={evDesc} onChange={(e) => setEvDesc(e.target.value)} aria-label="توضیح سند" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <button
            type="button"
            data-testid="qar-add-evidence-btn"
            onClick={() => {
              const conflictTarget = disputeCase.evidences[0]?.evidenceId;
              onUpdateCase(addConflictingEvidencePreservingBoth({
                disputeCase,
                titleFa: evTitle,
                kindFa: evKind,
                submittedByRole: evRole,
                submittedByNameFa: evRole === 'applicant' ? 'آرش بهرامی' : 'دفتر فنی مهندس نیازی',
                descriptionFa: evDesc,
                conflictsWithEvidenceId: conflictTarget,
              }));
              onFeedbackFa('سند جدید اضافه شد و مستند قبلی بدون حذف در تاریخچه حفظ گردید.');
            }}
            className="rounded bg-cyan-600 hover:bg-cyan-500 px-2.5 py-1 font-bold text-slate-950 cursor-pointer"
          >
            افزودن سند بدون حذف قبلی
          </button>
        </div>
      </div>
    </div>
  );
};

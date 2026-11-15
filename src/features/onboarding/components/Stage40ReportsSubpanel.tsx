/** @file src/features/onboarding/components/Stage40ReportsSubpanel.tsx — Stage 40 Personal Reports & Analytical Documents */
import React, { useState } from 'react';
import {
  NEIGHBORHOOD_11_SECTIONS,
  REPORT_BUILDER_STEPS,
  REPORT_TEMPLATES_FA,
  REPORT_TYPE_CATALOG,
  toggleReportSectionSafely,
  type ReportDraftSpec,
  type ReportExportFormat,
  type ReportMode,
  type ReportTemplateId,
  type ReportTypeId,
  type StoredReportDocument,
} from '../services/reportsAndDocumentsEngine';
import { Stage40ReportPreviewAndExport } from './Stage40ReportPreviewAndExport';
import { Stage40ReportsArchiveAndShare } from './Stage40ReportsArchiveAndShare';

function buildInitialDraft(preset: 'niavaran' | 'compare38' | 'history39'): ReportDraftSpec {
  if (preset === 'compare38') {
    return {
      reportId: 'RT-RPT-00381',
      titleFa: 'گزارش مقایسه ۳ ملک منتخب (انتقال از مرحله ۳۸)',
      type: 'comparison',
      subjectId: 'cmp-38-batch',
      subjectTitleFa: 'سعادت‌آباد · پونک · نیاوران (۳ گزینه)',
      geoBoundaryLabelFa: 'تهران — مقایسه بین‌محله‌ای',
      timeRangeLabelFa: 'پاییز ۱۴۰۵',
      template: 'analytical',
      mode: 'snapshot',
      format: 'pdf',
      sections: REPORT_TYPE_CATALOG[2].defaultSections.map((s) => ({ ...s })),
      claims: [
        { statementFa: 'اختلاف قیمت پیشنهادی بین گزینه‌ها بر اساس معیارهای هم‌ارز رتبه‌بندی شد.', classification: 'computed', sourceLabelFa: 'موتور مقایسه مرحله ۳۸', referencePeriodFa: 'آبان ۱۴۰۵', sampleCount: 3 },
      ],
      dataReferenceDateLabelFa: '۱۲ آبان ۱۴۰۵',
      generatedAtLabelFa: '۱۴ آبان ۱۴۰۵',
      dataAgeDays: 2,
      sampleCount: 18,
      minRequiredSamples: 10,
      hasUnverifiedData: false,
      hasBoundaryChange: false,
      containsPrivatePii: true,
      inheritedComparisonWeights: { 'قیمت هر متر': 45, 'کیفیت دسترسی': 30, 'عمر بنا': 25 },
      incomparableWarningFa: 'یکی از گزینه‌ها دارای داده با مرز جغرافیایی نسخه V2 است و با احتیاط مقایسه شده است.',
      methodologyVersion: 'MCDA-v2.1',
    };
  }
  return {
    reportId: preset === 'history39' ? 'RT-RPT-00392' : 'RT-RPT-00104',
    titleFa: preset === 'history39' ? 'گزارش تاریخچه تغییرات ۶۰ روزه (مرحله ۳۹)' : 'گزارش تحلیلی محله نیاوران',
    type: preset === 'history39' ? 'changes_history' : 'neighborhood',
    subjectId: 'niavaran',
    subjectTitleFa: 'محله نیاوران',
    geoBoundaryLabelFa: 'تهران، منطقه ۱ (BOUNDARY-V3)',
    timeRangeLabelFa: 'شهریور تا آبان ۱۴۰۵',
    template: 'formal',
    mode: 'snapshot',
    format: 'pdf',
    sections: NEIGHBORHOOD_11_SECTIONS.map((s) => ({ ...s })),
    claims: [
      { statementFa: 'شاخص قیمت پیشنهادی آگهی‌ها در محدوده نیاوران +۴.۲٪ تغییر ثبت‌شده دارد (معادل معامله قطعی نیست).', classification: 'registered', sourceLabelFa: 'داده بازار (SRC-02)', referencePeriodFa: 'مهر و آبان ۱۴۰۵', sampleCount: 24 },
      { statementFa: 'بازه ارزش تخمینی سامانه برای واحدهای ۹۰ تا ۱۳۰ متری به‌عنوان برآورد تحلیلی ارائه شده است.', classification: 'estimated', sourceLabelFa: 'مدل هدونیک رادار', referencePeriodFa: 'آبان ۱۴۰۵', sampleCount: 24 },
      { statementFa: 'شاخص اجاره به دلیل کمبود نمونه زیر آستانه بدون عددگذاری ارائه نشده است.', classification: 'computed', sourceLabelFa: 'پایگاه داده اجاره', referencePeriodFa: 'آبان ۱۴۰۵', sampleCount: 0 },
    ],
    dataReferenceDateLabelFa: preset === 'history39' ? '۲۵ مهر ۱۴۰۵' : '۱۱ آبان ۱۴۰۵',
    generatedAtLabelFa: '۱۴ آبان ۱۴۰۵',
    dataAgeDays: preset === 'history39' ? 19 : 3,
    sampleCount: 24,
    minRequiredSamples: 10,
    hasUnverifiedData: false,
    hasBoundaryChange: true,
    containsPrivatePii: false,
    methodologyVersion: 'HEDONIC-v3.2',
  };
}

const INITIAL_ARCHIVE_DOCS: StoredReportDocument[] = [
  {
    reportId: 'RT-RPT-00101',
    titleFa: 'گزارش تاریخی محله پونک (مهر ۱۴۰۵)',
    type: 'neighborhood',
    subjectTitleFa: 'محله پونک',
    mode: 'snapshot',
    currentVersion: 1,
    versions: [{ version: 1, versionId: 'RT-RPT-00101-v1', createdAtLabelFa: '۲۰ مهر ۱۴۰۵', dataReferenceDateLabelFa: '۱۸ مهر ۱۴۰۵', template: 'formal', mode: 'snapshot', format: 'pdf', changeNoteFa: 'نسخه اصلی ثابت برای جلسه کاری', snapshotFrozen: true, status: 'ready_to_download' }],
    shareMode: 'private',
    containsPrivatePii: true,
    draft: buildInitialDraft('niavaran'),
  },
];

export const Stage40ReportsSubpanel: React.FC = () => {
  const [viewTab, setViewTab] = useState<'builder' | 'preview' | 'archive'>('builder');
  const [step, setStep] = useState<number>(3);
  const [draft, setDraft] = useState<ReportDraftSpec>(() => buildInitialDraft('niavaran'));
  const [archiveDocs, setArchiveDocs] = useState<StoredReportDocument[]>(INITIAL_ARCHIVE_DOCS);

  const selectedCount = draft.sections.filter((s) => s.selected).length;

  const handleContextualEntry = (preset: 'niavaran' | 'compare38' | 'history39') => {
    setDraft(buildInitialDraft(preset));
    setStep(3);
    setViewTab('builder');
  };

  const handleSaveToArchive = (savedDraft: ReportDraftSpec) => {
    setArchiveDocs((prev) => {
      if (prev.some((d) => d.reportId === savedDraft.reportId)) return prev;
      return [{
        reportId: savedDraft.reportId,
        titleFa: savedDraft.titleFa,
        type: savedDraft.type,
        subjectTitleFa: savedDraft.subjectTitleFa,
        mode: savedDraft.mode,
        currentVersion: 1,
        versions: [{ version: 1, versionId: `${savedDraft.reportId}-v1`, createdAtLabelFa: savedDraft.generatedAtLabelFa, dataReferenceDateLabelFa: savedDraft.dataReferenceDateLabelFa, template: savedDraft.template, mode: savedDraft.mode, format: savedDraft.format, changeNoteFa: 'تولید اولیه از گزارش‌ساز', snapshotFrozen: savedDraft.mode === 'snapshot', status: 'ready_to_download' }],
        shareMode: 'private',
        containsPrivatePii: savedDraft.containsPrivatePii,
        draft: savedDraft,
      }, ...prev];
    });
  };

  return (
    <div className="space-y-4" data-testid="stage40-reports-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۰: مرکز گزارش‌های شخصی، خروجی‌ها و اسناد تحلیلی (RT-UI-REPORTS-001)</h3>
            <p className="mt-1 text-xs text-slate-400">گزارش‌ساز ۷ مرحله‌ای با حفظ کامل انتخاب‌ها، قفل بخش‌های منشأ/محدودیت، تفکیک نسخه ثابت و پویا، و خروجی واقعی CSV</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: 'builder', label: 'گزارش‌ساز مرحله‌ای' },
              { id: 'preview', label: 'پیش‌نمایش و خروجی' },
              { id: 'archive', label: `گزارش‌های من (${archiveDocs.length})` },
            ] as const).map((t) => (
              <button key={t.id} type="button" data-testid={`stage40-tab-${t.id}`} onClick={() => setViewTab(t.id)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${viewTab === t.id ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* RPT-01 Contextual Entry Points */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 font-bold">ورود بافت‌محور (RPT-01 انتقال خودکار زمینه):</span>
          <button type="button" data-testid="entry-niavaran-report" onClick={() => handleContextualEntry('niavaran')} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 hover:border-cyan-500">ساخت گزارش محله نیاوران</button>
          <button type="button" data-testid="entry-compare38-report" onClick={() => handleContextualEntry('compare38')} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-emerald-300 hover:border-emerald-500">انتقال مقایسه ۳ ملک (مرحله ۳۸)</button>
          <button type="button" data-testid="entry-history39-report" onClick={() => handleContextualEntry('history39')} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-amber-300 hover:border-amber-500">انتقال تاریخچه پایش (مرحله ۳۹)</button>
        </div>

        {viewTab === 'builder' && (
          <div className="space-y-3 text-xs">
            {/* RPT-03 7-Step Stepper */}
            <div className="flex flex-wrap gap-1">
              {REPORT_BUILDER_STEPS.map((s) => (
                <button key={s.step} type="button" onClick={() => setStep(s.step)} className={`rounded border px-2 py-1 text-[10.5px] font-bold ${step === s.step ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
                  {s.step}. {s.titleFa}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Step Controls */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
                <div className="font-bold text-white">تنظیمات نوع، قالب و رفتار گزارش (RPT-02 & RPT-06)</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="text-slate-300">نوع گزارش:
                    <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as ReportTypeId }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                      {REPORT_TYPE_CATALOG.map((c) => <option key={c.id} value={c.id}>{c.titleFa}</option>)}
                    </select>
                  </label>
                  <label className="text-slate-300">قالب سند:
                    <select value={draft.template} onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value as ReportTemplateId }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                      {REPORT_TEMPLATES_FA.map((t) => <option key={t.id} value={t.id}>{t.titleFa}</option>)}
                    </select>
                  </label>
                  <label className="text-slate-300">رفتار داده (ثابت / پویا):
                    <select value={draft.mode} onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value as ReportMode }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                      <option value="snapshot">گزارش ثابت (Snapshot پیش‌فرض)</option>
                      <option value="dynamic">گزارش پویا (Dynamic)</option>
                    </select>
                  </label>
                  <label className="text-slate-300">فرمت خروجی:
                    <select value={draft.format} onChange={(e) => setDraft((d) => ({ ...d, format: e.target.value as ReportExportFormat }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                      <option value="pdf">PDF (اولویت اول)</option>
                      <option value="xlsx">Excel (XLSX)</option>
                      <option value="csv">CSV (انتقال داده)</option>
                    </select>
                  </label>
                </div>
                <div className="flex gap-2 pt-1">
                  {step > 1 && <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300">مرحله قبل (حفظ تنظیمات)</button>}
                  <button type="button" data-testid="go-stage40-preview-btn" onClick={() => setViewTab('preview')} className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white">مشاهده پیش‌نمایش و خروجی</button>
                </div>
              </div>

              {/* RPT-05 Section Selector */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="stage40-section-selector">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">بخش‌های گزارش (RPT-05 — {selectedCount} از {draft.sections.length} بخش)</span>
                  <span className="text-[10.5px] text-amber-300">منابع و محدودیت‌ها قفل شده</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                  {draft.sections.map((s) => (
                    <label key={s.id} className={`flex items-center justify-between rounded border px-2 py-1 ${s.required ? 'border-slate-700 bg-slate-900/60 text-slate-300' : 'border-slate-800 bg-slate-900 text-slate-200 cursor-pointer'}`}>
                      <span className="flex items-center gap-1.5">
                        <input type="checkbox" checked={s.selected} disabled={s.required} onChange={() => setDraft((d) => ({ ...d, sections: toggleReportSectionSafely(d.sections, s.id) }))} className="accent-emerald-500" />
                        <span>{s.titleFa}</span>
                      </span>
                      {!s.hasSufficientData && <span className="text-[9.5px] text-amber-300">داده ناکافی</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewTab === 'preview' && <Stage40ReportPreviewAndExport draft={draft} onSaveToArchive={handleSaveToArchive} />}
        {viewTab === 'archive' && (
          <Stage40ReportsArchiveAndShare
            documents={archiveDocs}
            onUpdateDocument={(updated) => setArchiveDocs((prev) => prev.map((d) => (d.reportId === updated.reportId ? updated : d)))}
            onDeleteDocument={(id) => setArchiveDocs((prev) => prev.filter((d) => d.reportId !== id))}
          />
        )}
      </div>
    </div>
  );
};
export default Stage40ReportsSubpanel;

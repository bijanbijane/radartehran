/** @file src/features/onboarding/components/Stage40ReportPreviewAndExport.tsx — RPT-08..14, RPT-19, RPT-21, RPT-22 Preview & Real Export */
import React, { useState } from 'react';
import {
  DATA_CLASSIFICATION_LABELS_FA,
  evaluateReportPreGenerationAudit,
  generateRealReportCsvExport,
  handleReportGenerationOutcome,
  type ReportDraftSpec,
  type ReportGenerationStatus,
} from '../services/reportsAndDocumentsEngine';

interface Props {
  draft: ReportDraftSpec;
  onSaveToArchive: (draft: ReportDraftSpec) => void;
}

export const Stage40ReportPreviewAndExport: React.FC<Props> = ({ draft, onSaveToArchive }) => {
  const [genStatus, setGenStatus] = useState<ReportGenerationStatus>('ready');
  const [statusMessageFa, setStatusMessageFa] = useState<string>('آماده بررسی و خروجی‌گیری از سند');
  const [exportNote, setExportNote] = useState<string>('');
  const audit = evaluateReportPreGenerationAudit(draft);
  const selectedSections = draft.sections.filter((s) => s.selected);

  const handleGenerate = (outcome: 'ready_to_download' | 'failed') => {
    const res = handleReportGenerationOutcome(draft, outcome);
    setGenStatus(res.status);
    setStatusMessageFa(res.messageFa);
    if (outcome === 'ready_to_download') onSaveToArchive(res.preservedDraft);
  };

  const handleDownloadCsv = () => {
    const csv = generateRealReportCsvExport(draft);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.reportId}-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNote('فایل CSV با رمزگذاری UTF-8 و واحدهای مشخص صادر شد (جایگزین سند تحلیلی نیست).');
  };

  return (
    <div className="space-y-3 text-xs" data-testid="stage40-preview-export" dir="rtl">
      {/* RPT-09 & RPT-08 Cover & Metadata */}
      <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div>
            <span className="text-[10.5px] font-bold text-cyan-400 block">رادار تهران · پیش‌نمایش جلد و شناسنامه سند (RPT-08 / RPT-09)</span>
            <h4 className="text-sm font-black text-white mt-0.5">{draft.titleFa}</h4>
            <div className="text-[11px] text-slate-400">موضوع: {draft.subjectTitleFa} · محدوده: {draft.geoBoundaryLabelFa}</div>
          </div>
          <div className="text-left text-[10.5px] space-y-0.5 text-slate-300">
            <div>شناسه سند: <strong className="text-white" dir="ltr">{draft.reportId}</strong></div>
            <div>تاریخ تولید سند: <strong className="text-emerald-300">{draft.generatedAtLabelFa}</strong></div>
            <div>تاریخ مرجع داده: <strong className="text-amber-300">{draft.dataReferenceDateLabelFa}</strong></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10.5px]">
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">قالب: {draft.template}</span>
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">نوع رفتار: {draft.mode === 'snapshot' ? 'ثابت (Snapshot)' : 'پویا (Dynamic)'}</span>
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">نسخه روش: {draft.methodologyVersion}</span>
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">بخش‌های فعال: {selectedSections.length}/{draft.sections.length}</span>
        </div>
      </div>

      {/* RPT-11 Pre-Generation Audit Warnings */}
      {audit.warningsFa.length > 0 && (
        <div data-testid="stage40-quality-warnings" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 space-y-1">
          <div className="font-bold text-amber-200">هشدارهای کیفیت و محدودیت اطلاعات پیش از خروجی (RPT-11 & RPT-22)</div>
          <ul className="list-disc list-inside text-[11px] text-amber-100/90 space-y-0.5">
            {audit.warningsFa.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Traceable Executive Claims with 4-way Classification Labels */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
        <div className="font-bold text-white">خلاصه اجرایی و تفکیک نوع اطلاعات (تطبیق با داده و منبع)</div>
        {draft.claims.map((c) => (
          <div key={c.statementFa} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-100">{c.statementFa}</div>
              <div className="text-[10.5px] text-slate-400 mt-0.5">
                منبع: {c.sourceLabelFa} · دوره: {c.referencePeriodFa} · نمونه: {c.sampleCount > 0 ? `${c.sampleCount} مورد` : 'ناکافی (بدون عددسازی)'}
              </div>
            </div>
            <span className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
              {DATA_CLASSIFICATION_LABELS_FA[c.classification]}
            </span>
          </div>
        ))}
        {draft.inheritedComparisonWeights && (
          <div className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[11px] text-emerald-300">
            وزن‌های انتقالی از مرحله ۳۸ حفظ شدند: {Object.entries(draft.inheritedComparisonWeights).map(([k, v]) => `${k}: ${v}%`).join(' · ')}
          </div>
        )}
      </div>

      {/* Incomplete sections honest disclosure */}
      {selectedSections.some((s) => !s.hasSufficientData) && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-[11px] text-slate-300">
          <div className="font-bold text-slate-100">بخش‌های فاقد داده کافی (RPT-22 — بدون تولید عدد جعلی):</div>
          {selectedSections.filter((s) => !s.hasSufficientData).map((s) => (
            <div key={s.id}>• <strong>{s.titleFa}:</strong> {s.missingDataDisclosureFa}</div>
          ))}
        </div>
      )}

      {/* RPT-13, RPT-14, RPT-21 Generation Controls & Failure Preservation */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-white" data-testid="stage40-gen-status">وضعیت تولید: {statusMessageFa} ({genStatus})</div>
          {exportNote && <div className="text-[10.5px] text-emerald-300 mt-0.5">{exportNote}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" data-testid="stage40-generate-ok-btn" onClick={() => handleGenerate('ready_to_download')} className="rounded-lg bg-[var(--color-brand-600)] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500">
            تولید سند و ذخیره در آرشیو
          </button>
          <button type="button" data-testid="stage40-simulate-fail-btn" onClick={() => handleGenerate('failed')} className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-bold text-rose-300">
            تست خطای تولید (حفظ تنظیمات)
          </button>
          <button type="button" data-testid="stage40-export-csv-btn" onClick={handleDownloadCsv} className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] font-bold text-cyan-200">
            دریافت CSV واقعی
          </button>
        </div>
      </div>
    </div>
  );
};

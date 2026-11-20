/** @file src/features/onboarding/components/Stage55ScenariosDocsPrivacyAndStage56Panel.tsx — Stage 55 Scenarios, Docs, History, Privacy & Stage 56 Preview */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  auditDocumentAndPrivacyAccess,
  simulateHypotheticalDevelopmentScenarios,
} from '../services/urbanRegulationEngine';
import {
  STAGE55_DOCUMENT_CATEGORIES_10,
  STAGE55_SPECIAL_STATES_9,
  STAGE55_UX_METRICS_8,
  STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10,
  type RegulationAmendmentEvent,
  type RegulationDocumentRecord,
  type RegulationViewerRole,
} from '../services/urbanRegulationTypes';

interface Props {
  section: 'scenarios_docs_and_history' | 'reports_privacy_and_stage56';
  documents: ReadonlyArray<RegulationDocumentRecord>;
  amendments: ReadonlyArray<RegulationAmendmentEvent>;
  onFeedbackFa: (message: string) => void;
}

const ROLES: ReadonlyArray<RegulationViewerRole> = [
  'خریدار یا فروشنده',
  'سرمایه‌گذار یا سازنده',
  'مشاور املاک',
  'کارشناس شهرسازی و پژوهشگر',
  'مدیر سامانه',
];

export const Stage55ScenariosDocsPrivacyAndStage56Panel: React.FC<Props> = ({
  section,
  documents,
  amendments,
  onFeedbackFa,
}) => {
  const [lotAreaSqm, setLotAreaSqm] = useState<number>(400);
  const [baseFarPercent, setBaseFarPercent] = useState<number>(240);
  const [hypotheticalFloors, setHypotheticalFloors] = useState<number>(5);
  const [docSearchQuery, setDocSearchQuery] = useState<string>('');
  const [attemptAiSummaryReplace, setAttemptAiSummaryReplace] = useState<boolean>(false);
  const [role, setRole] = useState<RegulationViewerRole>('خریدار یا فروشنده');

  if (section === 'scenarios_docs_and_history') {
    const sim = simulateHypotheticalDevelopmentScenarios({
      lotAreaSqm,
      baseFarPercent,
      coveragePercent: 60,
      hypotheticalFloors,
      maxHeightMeters: 18,
      setbackMeters: 2,
    });

    const filteredDocs = documents.filter(
      (d) =>
        docSearchQuery.trim() === '' ||
        d.titleFa.includes(docSearchQuery) ||
        d.categoryFa.includes(docSearchQuery) ||
        d.docNumberFa.includes(docSearchQuery),
    );
    const activeDoc = filteredDocs[0] ?? documents[0];
    const docAudit = auditDocumentAndPrivacyAccess(activeDoc, role, attemptAiSummaryReplace);

    return (
      <div className="space-y-4" data-testid="stage55-scenarios-docs-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300">شبیه‌ساز سناریوهای فرضی توسعه</h4>
            <span className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300" data-testid="stage55-scenario-disclaimer">
              {sim.labelTagFa}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-slate-400">مساحت زمین فرضی (متر مربع):</span>
              <NumericDraftInput
                min={50}
                max={100000}
                fallback={100}
                value={lotAreaSqm}
                onValueChange={setLotAreaSqm}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">تراکم مبنای فرضی (٪):</span>
              <NumericDraftInput
                min={60}
                max={600}
                fallback={180}
                value={baseFarPercent}
                onValueChange={setBaseFarPercent}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">طبقات فرضی:</span>
              <NumericDraftInput
                min={1}
                max={20}
                fallback={1}
                value={hypotheticalFloors}
                onValueChange={setHypotheticalFloors}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {sim.scenarios.map((s) => (
              <div key={s.nameFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
                <div className="font-bold text-slate-200">{s.nameFa}</div>
                <div className="mt-1 text-cyan-300">
                  زیربنای فرضی: {s.hypotheticalTotalGfaSqm} م² | اشغال: {s.footprintSqm} م²
                </div>
                <div className="text-slate-400 mt-0.5">{s.noteFa}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-200/90">{sim.disclaimerFa}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-cyan-300">مرکز اسناد مقرراتی ({STAGE55_DOCUMENT_CATEGORIES_10.length} دسته)</h4>
              <input
                type="text"
                placeholder="جست‌وجوی سند یا شماره..."
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={attemptAiSummaryReplace}
                onChange={(e) => setAttemptAiSummaryReplace(e.target.checked)}
              />
              <span>آزمون نمایش خلاصه کمکی به‌جای متن اصلی (باید متن اصلی حفظ شود)</span>
            </label>
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-[11px] text-slate-200" data-testid="stage55-doc-text-guard">
              {docAudit.displayedTextFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <h4 className="font-bold text-cyan-300">خط زمانی تغییرات و مقایسه قبل/بعد مقررات</h4>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {amendments.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-[11px]">
                  <div className="font-bold text-slate-200">{a.titleFa} ({a.effectiveDateFa})</div>
                  <div className="text-rose-300/90 mt-0.5">پیشین: {a.previousRuleFa}</div>
                  <div className="text-emerald-300/90">جدید: {a.newRuleFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const docAudit = auditDocumentAndPrivacyAccess(documents[0], role, false);

  return (
    <div className="space-y-4" data-testid="stage55-reports-privacy-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-cyan-300">حریم خصوصی، کنترل دسترسی نقش‌ها و گزارش ۱۲بخشی</h4>
          <select
            aria-label="انتخاب نقش کاربری مرحله ۵۵"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as RegulationViewerRole);
              onFeedbackFa(`نمای ضوابط متناسب با نقش «${e.target.value}» تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 text-cyan-100" data-testid="stage55-role-privacy">
          {docAudit.ownerPrivacyNoticeFa} • آمادگی گزارش تحلیلی: {docAudit.reportSectionsCount} بخش با ذکر تاریخ و نسخه داده.
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
            <div className="font-bold text-amber-300">حالت‌های خاص و خطای داده</div>
            {STAGE55_SPECIAL_STATES_9.map((s) => (
              <div key={s.stateFa} className="text-[11px] text-slate-300">
                <strong className="text-slate-100">{s.stateFa}: </strong>
                {s.actionFa}
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="font-bold text-cyan-300">شاخص‌های ارزیابی تجربه کاربری ({STAGE55_UX_METRICS_8.length})</div>
            <ul className="list-disc pr-4 text-[11px] text-slate-300 space-y-0.5">
              {STAGE55_UX_METRICS_8.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-4 space-y-2 text-xs" data-testid="stage56-preview-box">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-teal-300">پیش‌نمایش مرحله ۵۶: RT-UI-URBAN-INFRASTRUCTURE-001</span>
          <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] text-teal-200">
            زیرساخت‌های شهری، ظرفیت خدمات‌رسانی و دسترسی محله‌ها ({STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10.length} محور)
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-[11px] text-slate-200">
          {STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10.map((axis) => (
            <div key={axis} className="rounded border border-teal-500/20 bg-slate-950/60 px-2.5 py-1.5">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

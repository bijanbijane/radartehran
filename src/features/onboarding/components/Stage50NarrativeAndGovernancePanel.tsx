/** @file src/features/onboarding/components/Stage50NarrativeAndGovernancePanel.tsx — Stage 50 Narrative, 6-Axis Quality, Versioning, Errata, Personal Reports & Stage 51 Preview */
import React, { useState } from 'react';
import {
  evaluatePersonalReportAccessAndExport,
  issueReportErrataAndValidateAiNarrative,
} from '../services/marketReportingEngine';
import {
  STAGE50_FORBIDDEN_ERRORS_20,
  STAGE50_MR_COMPONENT_IDS_50,
  STAGE50_UI_MR_TASKS_39,
  STAGE50_UX_EVENTS_17,
  STAGE51_GEOSPATIAL_AXES_20,
  type ChangeNarrativeBlockRecord,
  type MarketReportSummaryRecord,
} from '../services/marketReportingTypes';

export const Stage50NarrativeAndGovernancePanel: React.FC<{
  section: 'narrative_quality_and_methodology' | 'versioning_access_and_stage51';
  report: MarketReportSummaryRecord;
  narrative: ChangeNarrativeBlockRecord;
  onUpdateReport: (next: MarketReportSummaryRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, report, narrative, onUpdateReport, onFeedbackFa }) => {
  const [aiClaimsCausation, setAiClaimsCausation] = useState(false);
  const [humanReviewed, setHumanReviewed] = useState(true);
  const [userRole, setUserRole] = useState<'visitor' | 'logged_in_user' | 'professional' | 'internal_admin'>('logged_in_user');

  const errataEval = issueReportErrataAndValidateAiNarrative({
    report,
    errataInput: {
      affectedSectionFa: 'جدول میانه قیمت آپارتمان‌های منطقه ۲',
      previousValueFa: '۲۱۴ م.ت بر مترمربع',
      correctedValueFa: '۲۱۲.۵ م.ت بر مترمربع (پس از حذف ۶ آگهی تکراری جدید)',
      reasonFa: 'شناسایی آگهی‌های بازنشرشده در پایش تکمیلی مرحله ۴۹',
      impactOnConclusionFa: 'نرخ تغییر ماهانه از +۵.۹٪ به +۵.۲٪ اصلاح شد؛ جهت کلی تغییر نکرد.',
      correctedAtFa: '۱۴۰۵/۰۸/۱۶ · ۱۰:۱۵',
    },
    aiDraftClaimsDefinitiveCausation: aiClaimsCausation,
    aiDraftMatchesComputedTable: true,
    humanReviewed,
  });

  const accessAndPersonalEval = evaluatePersonalReportAccessAndExport({
    report,
    userRole,
    monitoredHoodsFa: ['سعادت‌آباد', 'شهرک غرب'],
    candidateEventHoodFa: 'سعادت‌آباد',
    narrative,
  });

  if (section === 'narrative_quality_and_methodology') {
    return (
      <div className="space-y-3" data-testid="stage50-narrative-quality-panel">
        {/* 5-Part Narrative & 5 Analytical Claim Labels (§15.1, §15.2, §15.6 · Test 12) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <h4 className="font-bold text-emerald-300 text-xs">
            ۵۰.۱۵ روایت تحلیلی ۵ جزئی، تفکیک نوع گزاره‌ها و منع ادعای علّی از هم‌زمانی (MR-27, MR-28, MR-48)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
              <strong className="text-cyan-300">۱. مشاهده:</strong> {narrative.observationFa}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
              <strong className="text-amber-300">۲. مقایسه:</strong> {narrative.comparisonFa}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
              <strong className="text-indigo-300">۳. توضیح احتمالی:</strong> {narrative.plausibleExplanationFa}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
              <strong className="text-emerald-300">۴. شواهد پشتیبان:</strong> {narrative.supportingEvidenceFa}
            </div>
          </div>
          <div className="rounded border border-rose-500/30 bg-rose-950/20 p-2 text-[10.5px] text-rose-200">
            <strong>۵. محدودیت استنباط:</strong> {narrative.limitationFa}
          </div>

          <div className="space-y-1.5 pt-1" data-testid="mr-analytical-claims-list">
            {narrative.statements.map((st) => (
              <div key={st.statementId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/50 px-2.5 py-1.5 text-[10.5px]">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-bold text-amber-300">{st.claimKind}</span>
                  <span className="text-slate-200">{st.textFa}</span>
                </div>
                <span className="font-mono text-[10px] text-cyan-300">شاخص متصل: {st.linkedMetricId}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 6-Axis Quality Profile without Opaque 0–100 Score (§16.6, §22.3, §22.6 · Test 9) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]" data-testid="mr-six-axis-quality-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300 text-xs">
              ۵۰.۱۶ و ۵۰.۲۲ شناسنامه روش‌شناسی و کیفیت داده در ۶ محور مستقل (بدون نمره کلی ۰ تا ۱۰۰ مبهم — MR-23..MR-26)
            </h4>
            <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300">
              روش: {report.methodNameFa} ({report.methodVersion})
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10.5px]">
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۱. تازگی:</strong> {report.qualityAxes.freshnessFa}</div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۲. پوشش جغرافیایی:</strong> {report.qualityAxes.coverageFa}</div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۳. کامل‌بودن فیلدها:</strong> {report.qualityAxes.completenessFa}</div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۴. منشأ داده:</strong> {report.qualityAxes.provenanceFa}</div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۵. سازگاری روش:</strong> {report.qualityAxes.consistencyFa}</div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2"><strong>۶. قابلیت بازتولید:</strong> {report.qualityAxes.reproducibilityFa}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stage50-versioning-access-panel">
      {/* Versioning, Errata Preservation & AI Human-in-the-Loop Gate (§21.4, §23, §29 · Tests 7, 12) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-amber-300 text-xs">
            ۵۰.۲۳ و ۵۰.۲۹ نسخه‌بندی، ثبت اصلاحیه با حفظ نسخه قبلی و گیت کنترل روایت هوش مصنوعی (MR-29, MR-30 · Tests 7, 12)
          </h4>
          <button
            type="button"
            data-testid="mr-issue-errata-btn"
            onClick={() => {
              onUpdateReport(errataEval.updatedReport);
              onFeedbackFa(`اصلاحیه ${errataEval.errata.errataId} ثبت شد؛ نسخه قبلی (${errataEval.errata.previousVersion}) حفظ گردید.`);
            }}
            className="rounded bg-amber-600/30 border border-amber-500/50 px-2.5 py-1 text-amber-200 font-bold cursor-pointer"
          >
            ثبت اصلاحیه رسمی و ارتقای نسخه گزارش (Test 7)
          </button>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 text-[10.5px] space-y-1">
          <div>
            نسخه قبلی حفظ‌شده: <strong className="text-white">{errataEval.errata.previousVersion}</strong> → نسخه جدید:{' '}
            <strong className="text-emerald-300">{errataEval.errata.newVersion}</strong>
          </div>
          <div>مقدار قبلی: {errataEval.errata.previousValueFa} | مقدار اصلاح‌شده: <strong className="text-cyan-300">{errataEval.errata.correctedValueFa}</strong></div>
          <div>اثر بر نتیجه: {errataEval.errata.impactOnConclusionFa}</div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[10.5px]">
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={aiClaimsCausation} onChange={(e) => setAiClaimsCausation(e.target.checked)} />
            شبیه‌سازی ادعای علّی بی‌پشتوانه در متن AI
          </label>
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={humanReviewed} onChange={(e) => setHumanReviewed(e.target.checked)} />
            تأیید بازبین انسانی (Human-in-the-Loop)
          </label>
          <span className="text-emerald-300 font-bold">{errataEval.aiValidationReasonFa}</span>
        </div>
      </div>

      {/* Personal Report Scope, Access Control & Export Bundle (§19, §20.5, §24 · Tests 8, 13, 14) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">کنترل سطح دسترسی گزارش ({report.accessLevel})، گزارش شخصی و بسته خروجی (Tests 8, 13, 14):</span>
          <select
            aria-label="نقش کاربر"
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as typeof userRole)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white text-[10.5px]"
          >
            <option value="visitor">بازدیدکننده مهمان</option>
            <option value="logged_in_user">کاربر عادی واردشده</option>
            <option value="professional">کارشناس حرفه‌ای</option>
            <option value="internal_admin">مدیر داخلی</option>
          </select>
        </div>
        <div className="text-[10.5px] text-cyan-200">
          مجوز دسترسی به گزارش فعلی: <strong>{accessAndPersonalEval.accessGranted ? 'مجاز' : accessAndPersonalEval.accessDenialNoticeFa}</strong> ·
          ارائه گزارش شخصی به‌عنوان نماینده کل شهر؟ <strong>{accessAndPersonalEval.personalReportPresentedAsCitywideMarket ? 'بله' : 'خیر (صرفاً محدود به پایش‌های کاربر)'}</strong>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10.5px] pt-1">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کامپوننت‌های MR: <strong>{STAGE50_MR_COMPONENT_IDS_50.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">رویدادهای UX: <strong>{STAGE50_UX_EVENTS_17.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">تسک‌های اجرایی: <strong>{STAGE50_UI_MR_TASKS_39.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">خطاهای ممنوعه: <strong>{STAGE50_FORBIDDEN_ERRORS_20.length}</strong></div>
        </div>

        <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-2.5" data-testid="mr-stage51-preview-box">
          <div className="font-bold text-indigo-300 mb-1">
            پیش‌نمایش مرحله ۵۱ (RT-UI-GEOSPATIAL-INTELLIGENCE-001) — {STAGE51_GEOSPATIAL_AXES_20.length} محور تحلیل مکانی پیشرفته و هوشمندی جغرافیایی:
          </div>
          <div className="text-[10.5px] text-slate-300">{STAGE51_GEOSPATIAL_AXES_20.join(' • ')}</div>
        </div>
      </div>
    </div>
  );
};

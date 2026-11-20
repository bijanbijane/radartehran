/** @file src/features/onboarding/components/Stage47GovernanceAndEditorialPanel.tsx — Stage 47 Source Provenance, Editorial Queue, Search & Stage 48 Preview */
import React, { useEffect, useState } from 'react';
import {
  evaluateScheduledReviewDue,
  evaluateUserDocumentPublicationRights,
  inspectSourceProvenance,
  proposeExpertContentRevision,
  resolveMobileKnowledgeLayout,
  searchProfessionalKnowledgeCatalog,
  submitContentErrorReport,
  supersedeKnowledgeSource,
} from '../services/professionalKnowledgeEngine';
import {
  STAGE47_EDITORIAL_ROLES_8,
  STAGE48_DECISION_TOOL_AXES_15,
  type ContentErrorReportRecord,
  type ProfessionalGuideRecord,
} from '../services/professionalKnowledgeTypes';

export const Stage47GovernanceAndEditorialPanel: React.FC<{
  section: 'sources_contributions' | 'editorial_search';
  guides: ProfessionalGuideRecord[];
  activeGuide: ProfessionalGuideRecord;
  errorReports: ContentErrorReportRecord[];
  onUpdateGuide: (next: ProfessionalGuideRecord) => void;
  onAddErrorReport: (report: ContentErrorReportRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, guides, activeGuide, errorReports, onUpdateGuide, onAddErrorReport, onFeedbackFa }) => {
  const [reportSectionFa, setReportSectionFa] = useState(activeGuide.tableOfContentsFa[0] || 'بخش ۱');
  const [reportType, setReportType] = useState<ContentErrorReportRecord['problemType']>('ادعای تخصصی نادرست');
  const [reportDescFa, setReportDescFa] = useState('نیاز به تصریح فشار تست هیدرواستاتیک بر حسب بار (Bar)');
  const [docHasPii, setDocHasPii] = useState(true);
  const [docExplicitLicense, setDocExplicitLicense] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [proposedDiffTextFa, setProposedDiffTextFa] = useState(
    'در لوله‌کشی پلی‌پروپیلن و پنج‌لایه، فشار تست حداقل ۱.۵ برابر فشار کاری و به مدت حداقل ۲ ساعت ثبت گردد.',
  );
  const [revisionPreview, setRevisionPreview] = useState<ReturnType<typeof proposeExpertContentRevision> | null>(null);

  useEffect(() => {
    setReportSectionFa(activeGuide.tableOfContentsFa[0] || 'بخش ۱');
    setRevisionPreview(null);
  }, [activeGuide.guideId]);

  const pubRights = evaluateUserDocumentPublicationRights({
    uploadedByUser: true,
    explicitPublicLicenseGranted: docExplicitLicense,
    containsPersonalPii: docHasPii,
    intendedUse: 'public_licensed',
  });
  const searchResult = searchProfessionalKnowledgeCatalog(guides, searchQuery);
  const aiRiskGate = resolveMobileKnowledgeLayout(390, 'legal_interpretation');

  if (section === 'sources_contributions') {
    return (
      <div className="space-y-3" data-testid="pk-sources-contributions-panel">
        {/* Source Metadata & Supersession Simulator (PK-06, PK-21, PK-32, PK-33 · Tests 2, 3, 4) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-white">شناسنامه ۱۲فیلدی منابع و کنترل منسوخ‌شدن یا سررسید بازبینی (PK-06 · Tests 2–4):</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="pk-simulate-supersede-btn"
                onClick={() => {
                  const firstSource = activeGuide.sources[0];
                  if (!firstSource) return;
                  const res = supersedeKnowledgeSource({
                    guide: activeGuide,
                    oldSourceId: firstSource.sourceId,
                    newSourceId: `${firstSource.sourceId}-V1405`,
                    impactsGuideContent: true,
                  });
                  onUpdateGuide(res.updatedGuide);
                  onFeedbackFa(res.editorialQueueReasonFa);
                }}
                className="rounded bg-amber-700 px-2.5 py-1 font-bold text-white cursor-pointer"
              >
                شبیه‌سازی جایگزینی منبع با نسخه جدید (Test 3)
              </button>
              <button
                type="button"
                data-testid="pk-simulate-review-due-btn"
                onClick={() => {
                  const res = evaluateScheduledReviewDue(activeGuide, '2027-01-15T00:00:00.000Z');
                  onUpdateGuide(res.updatedGuide);
                  if (res.warningBannerFa) onFeedbackFa(res.warningBannerFa);
                }}
                className="rounded border border-rose-500/60 bg-rose-950/50 px-2.5 py-1 font-bold text-rose-200 cursor-pointer"
              >
                شبیه‌سازی فرارسیدن موعد بازبینی (Test 4)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeGuide.sources.map((rawSrc) => {
              const src = inspectSourceProvenance(rawSrc);
              return (
                <div key={src.sourceId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1 text-[10.5px]" data-testid={`pk-source-card-${src.sourceId}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-300">{src.fullTitleFa}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-amber-300">{src.status}</span>
                  </div>
                  <div className="text-slate-300">ناشر: {src.publisherFa} · نویسنده: {src.authorFa} · نسخه: {src.documentCodeOrVersion}</div>
                  <div className="text-slate-400">انتشار: {src.publishedDateFa} · لازم‌الاجرا: {src.effectiveDateFa} · آخرین بررسی: {src.lastVerifiedDateFa}</div>
                  {src.replacementSourceId !== 'نامشخص' && (
                    <div className="text-amber-300 font-bold" data-testid="pk-superseded-notice">
                      جایگزین‌شده با منبع: {src.replacementSourceId} (PK-33)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* User Error Report Form (PK-25 & PK-26 · Test 5) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="pk-error-report-form">
            <div className="font-bold text-white">ثبت گزارش خطا یا پیشنهاد اصلاح محتوا (PK-25 · Test 5):</div>
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="بخش موردنظر" value={reportSectionFa} onChange={(e) => setReportSectionFa(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
              <select aria-label="نوع مشکل محتوایی" value={reportType} onChange={(e) => setReportType(e.target.value as ContentErrorReportRecord['problemType'])} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                <option value="ادعای تخصصی نادرست">ادعای تخصصی نادرست</option>
                <option value="اطلاعات منسوخ">اطلاعات منسوخ</option>
                <option value="منبع نامعتبر">منبع نامعتبر</option>
                <option value="خطای مفهومی">خطای مفهومی</option>
                <option value="خطای نگارشی">خطای نگارشی</option>
              </select>
            </div>
            <input aria-label="شرح مسئله" value={reportDescFa} onChange={(e) => setReportDescFa(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
            <button
              type="button"
              data-testid="pk-submit-error-report-btn"
              onClick={() => {
                const created = submitContentErrorReport({
                  existingCount: errorReports.length,
                  guideId: activeGuide.guideId,
                  targetSectionFa: reportSectionFa,
                  problemType: reportType,
                  descriptionFa: reportDescFa,
                });
                onAddErrorReport(created);
                onFeedbackFa(`گزارش ${created.reportId} با وضعیت «${created.status}» ثبت و به مسیر «${created.routingPathFa}» ارجاع شد.`);
              }}
              className="rounded bg-teal-600 px-3 py-1 font-bold text-white cursor-pointer"
            >
              ثبت گزارش با شناسه پیگیری
            </button>
            <div className="space-y-1 pt-1">
              {errorReports.map((r) => (
                <div key={r.reportId} className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 flex justify-between">
                  <span>{r.reportId} · {r.targetSectionFa} ({r.problemType})</span>
                  <span className="text-teal-300 font-bold">{r.status} ← {r.routingPathFa}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Publication Rights & PII Gate (Test 11) */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="pk-publication-rights-card">
            <div className="font-bold text-white">کنترل حقوق انتشار و ناشناس‌سازی اطلاعات شخصی (Test 11):</div>
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" checked={docHasPii} onChange={(e) => setDocHasPii(e.target.checked)} />
              <span>سند ارسالی حاوی نام، شماره تماس یا پلاک ثبتی شخصی (PII) است</span>
            </label>
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" checked={docExplicitLicense} onChange={(e) => setDocExplicitLicense(e.target.checked)} />
              <span>مجوز صریح انتشار عمومی توسط صاحب اثر ثبت شده است</span>
            </label>
            <div className="rounded border border-slate-800 bg-slate-900 p-2 text-[10.5px]">
              <div>سطح دسترسی مجاز: <strong className="text-amber-300">{pubRights.effectivePermission}</strong></div>
              <div className="text-slate-300 mt-0.5">{pubRights.guardReasonFa}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="pk-editorial-search-panel">
      {/* Search & Zero-Result Recovery (PK-02, PK-31 · Test 9) */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">جست‌وجوی تخصصی چندمعیاره و مدیریت حالت بدون نتیجه (PK-02 & PK-31 · Test 9):</span>
          <input
            aria-label="جست‌وجو در مرکز دانش حرفه‌ای"
            data-testid="pk-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جست‌وجو (برای تست بدون نتیجه بنویسید: ژئوترمال)..."
            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white w-64"
          />
        </div>
        {searchResult.zeroResultRecovery ? (
          <div data-testid="pk-search-zero-result" className="rounded border border-amber-500/40 bg-amber-950/30 p-2.5 text-amber-200 space-y-1">
            <div className="font-bold">{searchResult.zeroResultRecovery.spellingSuggestionFa}</div>
            <div>موضوعات نزدیک: {searchResult.zeroResultRecovery.nearbyTopicsFa.join(' · ')} (بدون نمایش اجباری نتایج نامرتبط)</div>
          </div>
        ) : (
          <div className="text-slate-300">تعداد راهنماهای منطبق: {searchResult.matchedGuides.length} مورد (مرتب‌سازی بر پایه ارتباط، اعتبار منبع و تازگی؛ نه صرفاً محبوبیت)</div>
        )}
      </div>

      {/* Expert Revision Diff & Editorial Roles (PK-24, PK-35, PK-36 · Test 6) */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-[11px]" data-testid="pk-expert-review-workbench">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">میزکار بازبین تخصصی و مقایسه نسخه (PK-24 & PK-36 · Test 6):</span>
          <span className="text-[10px] text-slate-400">۸ نقش تحریریه: {STAGE47_EDITORIAL_ROLES_8.join(' · ')}</span>
        </div>
        <div className="flex gap-2">
          <input aria-label="متن اصلاح پیشنهادی متخصص" value={proposedDiffTextFa} onChange={(e) => setProposedDiffTextFa(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
          <button
            type="button"
            data-testid="pk-propose-revision-btn"
            onClick={() => {
              const rev = proposeExpertContentRevision({
                guide: activeGuide,
                sectionId: activeGuide.sections[0].sectionId,
                proposedTextFa: proposedDiffTextFa,
                expertNameFa: 'مهندس آرش کاظمی',
                reviewLimitationNoteFa: 'صرفاً ناظر بر لوله‌کشی داخل واحد است.',
              });
              setRevisionPreview(rev);
              onFeedbackFa(`پیشنهاد اصلاح تخصصی ${rev.revisionId} در وضعیت «${rev.workflowStatus}» ثبت شد.`);
            }}
            className="rounded bg-cyan-700 px-3 py-1 font-bold text-white cursor-pointer"
          >
            ثبت مقایسه نسخه (Diff)
          </button>
        </div>
        {revisionPreview && (
          <div data-testid="pk-revision-diff-box" className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded border border-rose-800/50 bg-rose-950/30 p-2 text-rose-200"><strong>متن نسخه قبلی ({revisionPreview.previousVersion}): </strong>{revisionPreview.previousTextFa}</div>
            <div className="rounded border border-emerald-800/50 bg-emerald-950/30 p-2 text-emerald-200"><strong>پیشنهاد متخصص ({revisionPreview.workflowStatus}): </strong>{revisionPreview.proposedTextFa}</div>
          </div>
        )}
        <div className="text-[10px] text-amber-300">
          کنترل هوش مصنوعی (PK-40): انتشار خودکار بدون بازبینی انسانی مجاز است؟ <strong>{aiRiskGate.aiCanAutoPublishDirectly ? 'بله' : 'خیر (الزام بازبینی متخصص انسانی برای موضوعات حقوقی/فنی/ایمنی)'}</strong>
        </div>
      </div>

      {/* Stage 48 Decision Support Tools Preview (15 Axes) */}
      <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 space-y-1.5 text-[10.5px]" data-testid="stage48-decision-tools-preview">
        <div className="font-bold text-teal-200">پیش‌نمایش متصل به مرحله ۴۸: ابزارهای تصمیم‌یار و محاسبات تعاملی (RT-UI-DECISION-TOOLS-001 · ۱۵ محور):</div>
        <div className="flex flex-wrap gap-1">
          {STAGE48_DECISION_TOOL_AXES_15.map((ax, i) => (
            <span key={ax} className="rounded bg-slate-900/90 border border-slate-800 px-1.5 py-0.5 text-slate-300">
              {i + 1}. {ax}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

/** @file src/features/onboarding/components/Stage47GuideAndToolsPanel.tsx — Stage 47 Content Detail, Service Standards, Checklists & Glossary */
import React, { useState } from 'react';
import {
  resolveContentDetailHeader,
  resolveContextualKnowledgeSuggestion,
  separateReferenceFromInterpretation,
  updateInteractiveChecklistItem,
} from '../services/professionalKnowledgeEngine';
import {
  SERVICE_GUIDE_SECTIONS_15,
  STAGE47_BOUNDARIES_5,
  STAGE47_CONTENT_CATEGORIES_14,
  type ChecklistItemStatus,
  type ProfessionalChecklistRecord,
  type ProfessionalGuideRecord,
} from '../services/professionalKnowledgeTypes';
import { STAGE47_GLOSSARY_ENTRIES } from '../services/stage47KnowledgeFixtures';

const CHECKLIST_STATUSES: ChecklistItemStatus[] = [
  'بررسی نشده',
  'بررسی شد',
  'نیازمند پیگیری',
  'قابل اعمال نیست',
  'نیازمند متخصص',
];

export const Stage47GuideAndToolsPanel: React.FC<{
  section: 'architecture_detail' | 'service_guides_tools';
  activeGuide: ProfessionalGuideRecord;
  checklist: ProfessionalChecklistRecord;
  onUpdateChecklist: (next: ProfessionalChecklistRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, activeGuide, checklist, onUpdateChecklist, onFeedbackFa }) => {
  const [contextStep, setContextStep] = useState<'renovation_request' | 'property_visit' | 'dispute_filing' | 'valuation_view'>('renovation_request');
  const [glossaryTermId, setGlossaryTermId] = useState<string>(STAGE47_GLOSSARY_ENTRIES[0].termId);
  const [learningPathId, setLearningPathId] = useState<'buy' | 'renovation' | 'specialist'>('renovation');

  const detailHeader = resolveContentDetailHeader(activeGuide);
  const contextualWidget = resolveContextualKnowledgeSuggestion(contextStep);
  const activeGlossary = STAGE47_GLOSSARY_ENTRIES.find((g) => g.termId === glossaryTermId) || STAGE47_GLOSSARY_ENTRIES[0];

  if (section === 'architecture_detail') {
    return (
      <div className="space-y-3" data-testid="pk-architecture-detail-panel">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[10px]" data-testid="pk-boundaries-strip">
          {STAGE47_BOUNDARIES_5.map((b) => (
            <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2 space-y-0.5">
              <div className="font-bold text-teal-300">{b.prevStageFa}</div>
              <div className="text-slate-400">قبلی: {b.prevRoleFa}</div>
              <div className="text-emerald-200 font-semibold">مرز ۴۷: {b.stage47BoundaryFa}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-white">۱۴ دسته‌بندی توسعه‌پذیر دانش حرفه‌ای (PK-03):</span>
            <span className="text-teal-300 font-bold">قابلیت توسعه Taxonomy فعال</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10.5px]">
            {STAGE47_CONTENT_CATEGORIES_14.map((cat) => (
              <span key={cat} className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Content Detail Page Standard (PK-01..PK-12 · Test 1 & Test 10) */}
        <div className="rounded-xl border border-teal-500/40 bg-slate-950/90 p-3.5 space-y-3" data-testid="pk-content-detail-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span data-testid="pk-content-type-badge" className="rounded bg-teal-900/70 px-2 py-0.5 font-bold text-teal-200">
                نوع محتوا: {detailHeader.contentType === 'practical_guide' ? 'راهنمای عملی' : 'استاندارد یا ضابطه'}
              </span>
              <span data-testid="pk-trust-label-badge" className="rounded bg-emerald-900/60 px-2 py-0.5 font-bold text-emerald-200">
                {detailHeader.trustLabel}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">مخاطب: {detailHeader.targetAudienceFa}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">محدوده: {detailHeader.geographicAndTopicScopeFa}</span>
            </div>
            <span className="text-slate-400 tabular-nums">
              نسخه {activeGuide.version} · بازبینی: {activeGuide.lastReviewedDateFa} · مطالعه: ~{activeGuide.readingMinutes} دقیقه
            </span>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white">{activeGuide.titleFa}</h4>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 text-[11px]" data-testid="pk-summary-panel">
              <div><strong className="text-teal-300 block">۱. این محتوا درباره چیست؟</strong><span className="text-slate-200">{activeGuide.summaryWhatFa}</span></div>
              <div><strong className="text-teal-300 block">۲. برای چه کسی مفید است؟</strong><span className="text-slate-200">{activeGuide.summaryForWhomFa}</span></div>
              <div><strong className="text-teal-300 block">۳. اقدام بعدی پس از مطالعه:</strong><span className="text-slate-200">{activeGuide.summaryNextActionFa}</span></div>
            </div>
          </div>

          <div className="space-y-2">
            {activeGuide.sections.map((sec) => {
              const separated = separateReferenceFromInterpretation(sec, activeGuide.trustLabel);
              return (
                <div key={sec.sectionId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 space-y-1.5 text-[11px]" data-testid={`pk-section-${sec.sectionId}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{sec.headingFa}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-amber-300">لایه اطمینان: {sec.claimLayer}</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-950/30 border border-emerald-800/50 text-emerald-100">
                    <strong>مرجع اصلی (اطلاعات قطعی منبع): </strong>{separated.sourceFactLayerFa}
                  </div>
                  <div className="p-2 rounded bg-cyan-950/30 border border-cyan-800/50 text-cyan-100">
                    <strong>برداشت و تحلیل نویسنده: </strong>{separated.authorInterpretationLayerFa}
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300">
                    <strong>توضیح تحریریه: </strong>{separated.editorialExplanationLayerFa}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200" data-testid="pk-limitation-notice">
            <strong>محدودیت کاربرد (PK-11): </strong>{activeGuide.limitationNoticeFa} · نویسنده: {activeGuide.authorNameFa} · بازبین تخصصی: {activeGuide.expertReviewerNameFa}
          </div>
        </div>

        {/* Contextual Knowledge Widget (PK-29 · Test 8) */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]" data-testid="pk-contextual-widget">
          <div className="space-y-0.5">
            <span className="text-teal-300 font-bold">پیشنهاد درون‌زمینه‌ای متناسب با موقعیت کاربر (PK-29 · بدون پوشاندن دکمه اصلی):</span>
            <div className="font-bold text-white">{contextualWidget.titleFa}</div>
            <div className="text-slate-400">{contextualWidget.reasonFa}</div>
          </div>
          <select aria-label="موقعیت فعلی کاربر در محصول" value={contextStep} onChange={(e) => setContextStep(e.target.value as typeof contextStep)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            <option value="renovation_request">ثبت درخواست بازسازی (مرحله ۴۳/۴۴)</option>
            <option value="property_visit">صفحه ملک و هماهنگی بازدید</option>
            <option value="dispute_filing">پرونده اختلاف (مرحله ۴۶)</option>
            <option value="valuation_view">صفحه ارزش‌گذاری هدونیک</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="pk-service-guides-tools-panel">
      {/* 15-Section Service Standard Guide & Learning Paths */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="font-bold text-white">قالب ۱۵گانه استاندارد راهنمای خدمت (PK-13):</div>
          <div className="flex flex-wrap gap-1 text-[10px]">
            {SERVICE_GUIDE_SECTIONS_15.map((s, idx) => (
              <span key={s} className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                {idx + 1}. {s}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">مسیرهای یادگیری غیرخطی (PK-38 · ورود مستقیم به هر گام):</span>
            <select aria-label="انتخاب مسیر یادگیری" value={learningPathId} onChange={(e) => setLearningPathId(e.target.value as typeof learningPathId)} className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-white">
              <option value="buy">مسیر خرید ملک (۶ گام)</option>
              <option value="renovation">مسیر بازسازی ساختمان (۹ گام)</option>
              <option value="specialist">مسیر انتخاب متخصص (۶ پرسش)</option>
            </select>
          </div>
          <p className="text-slate-300 text-[10.5px]">
            {learningPathId === 'buy'
              ? '۱. شناخت نیاز ← ۲. شناخت محله ← ۳. بررسی ملک ← ۴. بررسی مدارک ← ۵. مقایسه گزینه‌ها ← ۶. تصمیم نهایی'
              : learningPathId === 'renovation'
                ? '۱. هدف بازسازی ← ۲. وضعیت موجود ← ۳. دامنه عملیات ← ۴. تخصص‌ها ← ۵. مقایسه پیشنهادها ← ۶. توافق ← ۷. مستندسازی ← ۸. کنترل کیفیت ← ۹. رفع نواقص'
                : '۱. موضوع کار ← ۲. تخصص مرتبط ← ۳. مدارک لازم ← ۴. بررسی سوابق ← ۵. پرسش‌های ضروری ← ۶. مقایسه پیشنهادها'}
          </p>
        </div>
      </div>

      {/* Interactive 5-State Checklist (PK-15 & PK-16 · Test 7) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]" data-testid="pk-interactive-checklist">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold text-white">{checklist.titleFa}</div>
            <div className="text-[10px] text-amber-300">{checklist.nonCertificationDisclaimerFa}</div>
          </div>
          <span className="rounded bg-teal-900/60 px-2 py-0.5 font-bold text-teal-200">نسخه {checklist.version}</span>
        </div>
        <div className="space-y-2">
          {checklist.items.map((item) => (
            <div key={item.itemId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-bold text-white">{item.titleFa}</div>
                <div className="text-[10px] text-slate-400">{item.explanationFa} · یادداشت: {item.userNoteFa}</div>
              </div>
              <select
                aria-label={`وضعیت ${item.titleFa}`}
                data-testid={`pk-checklist-status-${item.itemId}`}
                value={item.status}
                onChange={(e) => {
                  const res = updateInteractiveChecklistItem({
                    checklist,
                    itemId: item.itemId,
                    nextStatus: e.target.value as ChecklistItemStatus,
                  });
                  onUpdateChecklist(res.updatedChecklist);
                  onFeedbackFa(`وضعیت «${item.titleFa}» به «${e.target.value}» تغییر یافت (پیشرفت: ${res.progressPercent}٪ — فاقد ارزش گواهی کارشناسی رسمی).`);
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white font-bold"
              >
                {CHECKLIST_STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Specialized Glossary with Dual Simple vs Technical Definitions (PK-19 & PK-20) */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-[11px]" data-testid="pk-glossary-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">واژه‌نامه تخصصی املاک و ساختمان با تفکیک تعریف عمومی و تخصصی (PK-19):</span>
          <select aria-label="انتخاب مدخل واژه‌نامه" value={glossaryTermId} onChange={(e) => setGlossaryTermId(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            {STAGE47_GLOSSARY_ENTRIES.map((g) => (
              <option key={g.termId} value={g.termId}>{g.termFa} ({g.termEn})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <strong className="text-teal-300 block">تعریف ساده (عمومی):</strong>
            <span className="text-slate-200">{activeGlossary.simpleDefinitionFa}</span>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <strong className="text-amber-300 block">تعریف تخصصی (فنی/حقوقی):</strong>
            <span className="text-slate-200">{activeGlossary.technicalDefinitionFa}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

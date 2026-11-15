/** @file src/features/onboarding/components/Stage47ProfessionalKnowledgeSubpanel.tsx — Stage 47 Professional Knowledge, Service Standards & Guidance */
import React, { useState } from 'react';
import { resolveMobileKnowledgeLayout } from '../services/professionalKnowledgeEngine';
import {
  STAGE47_PK_COMPONENT_IDS_40,
  STAGE47_UI_PK_TASKS_30,
  STAGE47_UX_EVENTS_14,
  type ContentErrorReportRecord,
  type ProfessionalChecklistRecord,
  type ProfessionalGuideRecord,
} from '../services/professionalKnowledgeTypes';
import {
  INITIAL_STAGE47_CHECKLIST,
  INITIAL_STAGE47_GUIDES,
  STAGE47_INITIAL_ERROR_REPORTS,
} from '../services/stage47KnowledgeFixtures';
import { Stage47GovernanceAndEditorialPanel } from './Stage47GovernanceAndEditorialPanel';
import { Stage47GuideAndToolsPanel } from './Stage47GuideAndToolsPanel';

type Stage47TabId = 'architecture_detail' | 'service_guides_tools' | 'sources_contributions' | 'editorial_search';

export const Stage47ProfessionalKnowledgeSubpanel: React.FC = () => {
  const [guides, setGuides] = useState<ProfessionalGuideRecord[]>(INITIAL_STAGE47_GUIDES);
  const [activeGuideId, setActiveGuideId] = useState<string>(INITIAL_STAGE47_GUIDES[0].guideId);
  const [checklist, setChecklist] = useState<ProfessionalChecklistRecord>(INITIAL_STAGE47_CHECKLIST);
  const [errorReports, setErrorReports] = useState<ContentErrorReportRecord[]>(STAGE47_INITIAL_ERROR_REPORTS);
  const [activeTab, setActiveTab] = useState<Stage47TabId>('architecture_detail');
  const [mobilePreview, setMobilePreview] = useState<boolean>(false);
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const activeGuide = guides.find((g) => g.guideId === activeGuideId) || guides[0];
  const layoutMode = resolveMobileKnowledgeLayout(mobilePreview ? 390 : 1280, 'legal_interpretation');

  const updateActiveGuide = (next: ProfessionalGuideRecord) => {
    setGuides((prev) => prev.map((g) => (g.guideId === next.guideId ? next : g)));
  };

  return (
    <div className="space-y-4" data-testid="stage47-professional-knowledge-subpanel" dir="rtl">
      <div className={`rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3.5 ${layoutMode.singleColumnNarrowText ? 'max-w-[410px] mx-auto' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              مرحله ۴۷: مدیریت دانش حرفه‌ای، راهنماهای تخصصی و استانداردهای خدمات (RT-UI-PROFESSIONAL-KNOWLEDGE-001)
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              دانش کاربردی، ابزار تعاملی و منشأ قابل استناد · {STAGE47_PK_COMPONENT_IDS_40.length} جزء PK · {STAGE47_UX_EVENTS_14.length} رویداد UX · {STAGE47_UI_PK_TASKS_30.length} بسته اجرایی
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <select
              aria-label="انتخاب راهنمای تخصصی فعال"
              data-testid="pk-active-guide-select"
              value={activeGuide.guideId}
              onChange={(e) => setActiveGuideId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-white"
            >
              {guides.map((g) => (
                <option key={g.guideId} value={g.guideId}>
                  {g.titleFa} ({g.publicationStatus})
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="pk-toggle-mobile-reading-btn"
              onClick={() => setMobilePreview((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 font-bold cursor-pointer ${
                mobilePreview ? 'border-teal-500 bg-teal-950/60 text-teal-200' : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {mobilePreview ? 'نمای مطالعه موبایل فعال (بدون اسکرول افقی)' : 'نمای دسکتاپ'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="بخش‌های مرکز دانش حرفه‌ای مرحله ۴۷">
          {(
            [
              ['architecture_detail', '۱. معماری اطلاعات، صفحه جزئیات و پیشنهاد زمینه‌مند'],
              ['service_guides_tools', '۲. استاندارد خدمات، مسیر یادگیری، چک‌لیست و واژه‌نامه'],
              ['sources_contributions', '۳. شناسنامه منبع، جایگزینی نسخه، گزارش خطا و حقوق انتشار'],
              ['editorial_search', '۴. جست‌وجوی تخصصی، میزکار بازبین، کنترل AI و پیش‌نمایش ۴۸'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              data-testid={`pk-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                activeTab === id ? 'border-teal-500 bg-teal-950/50 text-teal-200' : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {feedbackFa && (
          <div data-testid="stage47-feedback-banner" className="rounded-lg border border-teal-500/40 bg-teal-950/30 px-3 py-1.5 text-[11px] text-teal-200">
            {feedbackFa}
          </div>
        )}

        {(activeTab === 'architecture_detail' || activeTab === 'service_guides_tools') && (
          <Stage47GuideAndToolsPanel
            section={activeTab}
            activeGuide={activeGuide}
            checklist={checklist}
            onUpdateChecklist={setChecklist}
            onFeedbackFa={setFeedbackFa}
          />
        )}

        {(activeTab === 'sources_contributions' || activeTab === 'editorial_search') && (
          <Stage47GovernanceAndEditorialPanel
            section={activeTab}
            guides={guides}
            activeGuide={activeGuide}
            errorReports={errorReports}
            onUpdateGuide={updateActiveGuide}
            onAddErrorReport={(r) => setErrorReports((prev) => [r, ...prev])}
            onFeedbackFa={setFeedbackFa}
          />
        )}

        <div className="text-[10px] text-slate-400">
          اصل محوری مرحله ۴۷: هیچ محتوای تخصصی بدون نمایش منشأ، تاریخ بازبینی، وضعیت اعتبار و محدودیت کاربرد به‌عنوان مرجع قطعی معرفی نمی‌شود.
        </div>
      </div>
    </div>
  );
};
export default Stage47ProfessionalKnowledgeSubpanel;

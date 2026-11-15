/** @file src/features/onboarding/components/Stage46QualitySubpanel.tsx — Stage 46 Service Quality Assurance, Independent Review & Dispute Resolution */
import React, { useState } from 'react';
import { canAccessDisputeCase } from '../services/serviceQualityEngine';
import { SIX_QUALITY_CONCEPTS, type DisputeCaseRecord, type DisputeViewerRole } from '../services/serviceQualityTypes';
import { INITIAL_STAGE46_CASE } from '../services/stage46QualityFixtures';
import { Stage46IntakeAndEvidencePanel } from './Stage46IntakeAndEvidencePanel';
import { Stage46ReviewAppealAndAdminPanel } from './Stage46ReviewAppealAndAdminPanel';

type QualityTabId = 'overview_complaint' | 'claim_evidence' | 'quality_review' | 'resolution_appeal';

export const Stage46QualitySubpanel: React.FC = () => {
  const [cases, setCases] = useState<DisputeCaseRecord[]>([INITIAL_STAGE46_CASE]);
  const [activeCaseId, setActiveCaseId] = useState<string>(INITIAL_STAGE46_CASE.caseId);
  const [activeTab, setActiveTab] = useState<QualityTabId>('overview_complaint');
  const [viewerRole, setViewerRole] = useState<DisputeViewerRole>('case_manager');
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const activeCase = cases.find((c) => c.caseId === activeCaseId) || cases[0];
  const access = canAccessDisputeCase(viewerRole);

  const updateActiveCase = (next: DisputeCaseRecord) => {
    setCases((prev) => prev.map((c) => (c.caseId === next.caseId ? next : c)));
  };

  return (
    <div className="space-y-4" data-testid="stage46-quality-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۶: تضمین کیفیت خدمات، بررسی مستقل و رسیدگی به اختلافات (RT-UI-SERVICE-QUALITY-001)</h3>
            <p className="mt-1 text-xs text-slate-400">
              متصل به پرونده مالی مرحله ۴۴ و تحویل مرحله ۴۵ · تفکیک ۶ مفهوم کیفیت · بدون حکم قضایی و بدون کاهش خودکار نشان اعتبار
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <select aria-label="انتخاب پرونده فعال" value={activeCase.caseId} onChange={(e) => setActiveCaseId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-white">
              {cases.map((c) => <option key={c.caseId} value={c.caseId}>{c.caseId} ({c.status})</option>)}
            </select>
            <select
              aria-label="نقش بیننده پرونده اختلاف"
              data-testid="qar-viewer-role-select"
              value={viewerRole}
              onChange={(e) => setViewerRole(e.target.value as DisputeViewerRole)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-white"
            >
              <option value="case_manager">مسئول رسیدگی سامانه</option>
              <option value="applicant">درخواست‌کننده خدمت</option>
              <option value="provider">ارائه‌دهنده خدمت</option>
              <option value="independent_reviewer">ارزیاب مستقل</option>
              <option value="observer">ناظر محدود</option>
              <option value="outsider">کاربر خارج از پرونده (غیرمجاز)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="qar-six-concepts-strip">
          {SIX_QUALITY_CONCEPTS.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[10px] space-y-0.5">
              <div className="font-bold text-cyan-300">{c.titleFa}</div>
              <div className="text-slate-300">{c.boundaryFa}</div>
            </div>
          ))}
        </div>

        {!access.allowed ? (
          <div data-testid="qar-access-denied-banner" className="rounded-lg border border-rose-600/60 bg-rose-950/40 p-4 text-xs font-bold text-rose-200">
            {access.reasonFa}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="بخش‌های کنترل کیفیت و اختلاف مرحله ۴۶">
              {(
                [
                  ['overview_complaint', '۱. نمای کلی و ثبت شکایت'],
                  ['claim_evidence', '۲. ادعا، پاسخ دوجانبه و شواهد'],
                  ['quality_review', '۳. ماتریس کیفیت و ارزیاب مستقل'],
                  ['resolution_appeal', '۴. تصمیم، اصلاح و اعتراض'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  data-testid={`qar-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                    activeTab === id ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {feedbackFa && (
              <div data-testid="stage46-feedback-banner" className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1.5 text-[11px] text-cyan-200">
                {feedbackFa}
              </div>
            )}

            {(activeTab === 'overview_complaint' || activeTab === 'claim_evidence') && (
              <Stage46IntakeAndEvidencePanel
                section={activeTab}
                disputeCase={activeCase}
                casesCount={cases.length}
                onUpdateCase={updateActiveCase}
                onAddNewCase={(created) => {
                  setCases((prev) => [created, ...prev]);
                  setActiveCaseId(created.caseId);
                }}
                onFeedbackFa={setFeedbackFa}
              />
            )}

            {(activeTab === 'quality_review' || activeTab === 'resolution_appeal') && (
              <Stage46ReviewAppealAndAdminPanel
                section={activeTab}
                disputeCase={activeCase}
                viewerRole={viewerRole}
                onUpdateCase={updateActiveCase}
                onFeedbackFa={setFeedbackFa}
              />
            )}
          </>
        )}

        <div className="text-[10px] text-slate-400">
          مرز حقوقی و حریم خصوصی (QAR-22): داده‌های شخصی، مدارک اختلاف و هویت گزارش‌دهندگان فقط در دسترس نقش مجاز پرونده است و خروجی این سامانه جایگزین داوری قضایی یا رأی رسمی دادگاه نیست.
        </div>
      </div>
    </div>
  );
};
export default Stage46QualitySubpanel;

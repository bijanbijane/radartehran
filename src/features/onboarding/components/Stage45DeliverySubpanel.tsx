/** @file src/features/onboarding/components/Stage45DeliverySubpanel.tsx — Stage 45 Project Execution, Milestones & Service Delivery */
import React, { useState } from 'react';
import { canMemberAccessDeliveryResource } from '../services/serviceDeliveryEngine';
import { FIVE_DELIVERY_CONCEPTS, type ServiceDeliveryProject, type WorkspaceDeliveryRole } from '../services/serviceDeliveryTypes';
import { INITIAL_STAGE45_PROJECT } from '../services/stage45DeliveryFixtures';
import { Stage45ChangesDelaysAndHandoverPanel } from './Stage45ChangesDelaysAndHandoverPanel';
import { Stage45MilestonesAndProgressPanel } from './Stage45MilestonesAndProgressPanel';

type DeliveryTabId = 'overview' | 'milestones' | 'documents' | 'changes_delays' | 'handover';

export const Stage45DeliverySubpanel: React.FC = () => {
  const [project, setProject] = useState<ServiceDeliveryProject>(INITIAL_STAGE45_PROJECT);
  const [activeTab, setActiveTab] = useState<DeliveryTabId>('overview');
  const [viewerRole, setViewerRole] = useState<WorkspaceDeliveryRole>('formal_approve');
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const viewAccess = canMemberAccessDeliveryResource(viewerRole, 'view_project');

  return (
    <div className="space-y-4" data-testid="stage45-delivery-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۵: مدیریت پروژه، اجرای خدمت و تحویل نهایی (RT-UI-SERVICE-DELIVERY-001)</h3>
            <p className="mt-1 text-xs text-slate-400">
              متصل به پرونده مالی {project.linkedDossierId} (نسخه {project.linkedAgreementVersionLabel}) · وضعیت فعلی: {project.overallStatusFa}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">سطح مجوز عضو فضای کاری:</span>
            <select
              aria-label="سطح دسترسی عضو در پروژه"
              data-testid="del-viewer-role-select"
              value={viewerRole}
              onChange={(e) => setViewerRole(e.target.value as WorkspaceDeliveryRole)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-white"
            >
              <option value="formal_approve">تأییدکننده رسمی پروژه (درخواست‌کننده)</option>
              <option value="participate_review">مشارکت در بررسی (ارائه‌دهنده / همکار)</option>
              <option value="view_progress">مشاهده‌گر (بدون حق تأیید یا مالی)</option>
              <option value="revoked">عضو حذف‌شده (دسترسی لغوشده)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="del-five-concepts-strip">
          {FIVE_DELIVERY_CONCEPTS.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[10px] space-y-0.5">
              <div className="font-bold text-emerald-300">{c.titleFa}</div>
              <div className="text-slate-300">{c.boundaryRuleFa}</div>
            </div>
          ))}
        </div>

        {!viewAccess.allowed ? (
          <div data-testid="del-access-denied-banner" className="rounded-lg border border-rose-600/60 bg-rose-950/40 p-4 text-xs font-bold text-rose-200">
            {viewAccess.reasonFa}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="بخش‌های مدیریت اجرای پروژه مرحله ۴۵">
              {(
                [
                  ['overview', '۱. داشبورد پروژه و اتصال مالی'],
                  ['milestones', '۲. مراحل، پیشرفت و تحویل مرحله‌ای'],
                  ['documents', '۳. مستندات و گالری شواهد'],
                  ['changes_delays', '۴. درخواست تغییر و تأخیر'],
                  ['handover', '۵. کنترل کیفیت و پذیرش نهایی'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  data-testid={`del-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                    activeTab === id ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {feedbackFa && (
              <div data-testid="stage45-feedback-banner" className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-[11px] text-emerald-200">
                {feedbackFa}
              </div>
            )}

            {(activeTab === 'overview' || activeTab === 'milestones' || activeTab === 'documents') && (
              <Stage45MilestonesAndProgressPanel section={activeTab} project={project} viewerRole={viewerRole} onUpdateProject={setProject} onFeedbackFa={setFeedbackFa} />
            )}

            {(activeTab === 'changes_delays' || activeTab === 'handover') && (
              <Stage45ChangesDelaysAndHandoverPanel section={activeTab} project={project} viewerRole={viewerRole} onUpdateProject={setProject} onFeedbackFa={setFeedbackFa} />
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default Stage45DeliverySubpanel;

/** @file src/features/onboarding/components/Stage48DecisionToolsSubpanel.tsx — Stage 48 Property & Building Decision Support Tools */
import React, { useState } from 'react';
import {
  STAGE48_DT_COMPONENT_IDS_40,
  STAGE48_UI_DT_TASKS_35,
  STAGE48_UX_EVENTS_19,
  type DecisionPropertyOption,
  type RenovationOperationRow,
  type SavedDecisionScenario,
} from '../services/decisionSupportToolsTypes';
import {
  INITIAL_STAGE48_PROPERTIES,
  INITIAL_STAGE48_RENOVATION_OPS,
  INITIAL_STAGE48_SCENARIO,
} from '../services/stage48DecisionToolsFixtures';
import { Stage48ComparisonAndInspectionPanel } from './Stage48ComparisonAndInspectionPanel';
import { Stage48CostScheduleAndScenariosPanel } from './Stage48CostScheduleAndScenariosPanel';

type Stage48TabId =
  | 'property_hood_compare'
  | 'service_offers_observation'
  | 'renovation_schedule_maintenance'
  | 'scenarios_sharing_governance';

export const Stage48DecisionToolsSubpanel: React.FC = () => {
  const [properties, setProperties] = useState<DecisionPropertyOption[]>(INITIAL_STAGE48_PROPERTIES);
  const [renovationOps, setRenovationOps] = useState<RenovationOperationRow[]>(INITIAL_STAGE48_RENOVATION_OPS);
  const [savedScenario, setSavedScenario] = useState<SavedDecisionScenario>(INITIAL_STAGE48_SCENARIO);
  const [activeTab, setActiveTab] = useState<Stage48TabId>('property_hood_compare');
  const [mobileStepMode, setMobileStepMode] = useState<boolean>(false);
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  return (
    <div className="space-y-4" data-testid="stage48-decision-tools-subpanel" dir="rtl">
      <div className={`rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3.5 ${mobileStepMode ? 'max-w-[410px] mx-auto' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              مرحله ۴۸: ابزارهای تصمیم‌یار و محاسبات تعاملی املاک و ساختمان (RT-UI-DECISION-TOOLS-001)
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              تفکیک داده سامانه، ورودی کاربر و فرض محاسباتی · بدون موتور ارزش‌گذاری موازی · {STAGE48_DT_COMPONENT_IDS_40.length} جزء DT · {STAGE48_UX_EVENTS_19.length} رویداد UX · {STAGE48_UI_DT_TASKS_35.length} بسته اجرایی
            </p>
          </div>
          <button
            type="button"
            data-testid="dt-toggle-mobile-wizard-btn"
            onClick={() => setMobileStepMode((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
              mobileStepMode ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200' : 'border-slate-700 bg-slate-950 text-slate-300'
            }`}
          >
            {mobileStepMode ? 'حالت ۷مرحله‌ای موبایل فعال (بدون جدول عریض)' : 'نمای ۳ستونه دسکتاپ'}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="بخش‌های ابزارهای تصمیم‌یار مرحله ۴۸">
          {(
            [
              ['property_hood_compare', '۱. مقایسه چند ملک، محله و شرط الزامی/ترجیحی'],
              ['service_offers_observation', '۲. مقایسه پیشنهادهای خدماتی و بررسی اولیه وضعیت ملک'],
              ['renovation_schedule_maintenance', '۳. برآورد بازسازی، زمان‌بندی پروژه، هزینه نگهداری و متراژ'],
              ['scenarios_sharing_governance', '۴. مدیریت سناریوها، نسخه‌بندی، اشتراک کنترل‌شده و پیش‌نمایش ۴۹'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              data-testid={`dt-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                activeTab === id ? 'border-indigo-500 bg-indigo-950/50 text-indigo-200' : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {feedbackFa && (
          <div data-testid="stage48-feedback-banner" className="rounded-lg border border-indigo-500/40 bg-indigo-950/30 px-3 py-1.5 text-[11px] text-indigo-200">
            {feedbackFa}
          </div>
        )}

        {(activeTab === 'property_hood_compare' || activeTab === 'service_offers_observation') && (
          <Stage48ComparisonAndInspectionPanel
            section={activeTab}
            properties={properties}
            isMobileStepMode={mobileStepMode}
            onUpdateProperties={setProperties}
            onFeedbackFa={setFeedbackFa}
          />
        )}

        {(activeTab === 'renovation_schedule_maintenance' || activeTab === 'scenarios_sharing_governance') && (
          <Stage48CostScheduleAndScenariosPanel
            section={activeTab}
            renovationOps={renovationOps}
            savedScenario={savedScenario}
            onUpdateRenovationOps={setRenovationOps}
            onUpdateScenario={setSavedScenario}
            onFeedbackFa={setFeedbackFa}
          />
        )}

        <div className="text-[10px] text-slate-400">
          اصل محوری مرحله ۴۸: ابزار تصمیم‌یار باید به کاربر کمک کند پیامد گزینه‌ها را تحت فرض‌های شفاف بسنجد؛ اما هیچ برآورد یا امتیاز الگوریتمی جایگزین حقیقت قطعی یا نظر کارشناسی رسمی نیست.
        </div>
      </div>
    </div>
  );
};
export default Stage48DecisionToolsSubpanel;

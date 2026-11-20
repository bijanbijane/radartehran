/** @file src/features/onboarding/components/Stage48CostScheduleAndScenariosPanel.tsx — Stage 48 Renovation Cost, Schedule, Maintenance, Area & Scenarios */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  calculateGeometricAreaWithProvenance,
  calculateRenovationEstimateAndDiff,
  shareAndVersionDecisionScenario,
  summarizeMaintenanceCostsSeparated,
  validateProjectScheduleDependencies,
} from '../services/decisionSupportToolsEngine';
import {
  STAGE49_MONITORING_AXES_16,
  type RenovationOperationRow,
  type SavedDecisionScenario,
} from '../services/decisionSupportToolsTypes';
import {
  INITIAL_STAGE48_ACTIVITIES,
  INITIAL_STAGE48_MAINTENANCE_COSTS,
} from '../services/stage48DecisionToolsFixtures';

export const Stage48CostScheduleAndScenariosPanel: React.FC<{
  section: 'renovation_schedule_maintenance' | 'scenarios_sharing_governance';
  renovationOps: RenovationOperationRow[];
  savedScenario: SavedDecisionScenario;
  onUpdateRenovationOps: (next: RenovationOperationRow[]) => void;
  onUpdateScenario: (next: SavedDecisionScenario) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, renovationOps, savedScenario, onUpdateRenovationOps, onUpdateScenario, onFeedbackFa }) => {
  const [reservePercent, setReservePercent] = useState<number>(savedScenario.reservePercent);
  const [widthM, setWidthM] = useState<number>(8.5);
  const [lengthM, setLengthM] = useState<number>(12.0);
  const [consentPrivatePhone, setConsentPrivatePhone] = useState<boolean>(false);

  const renovationCalc = calculateRenovationEstimateAndDiff({
    operations: renovationOps,
    reservePercent,
    previousScenario: savedScenario,
  });
  const scheduleCheck = validateProjectScheduleDependencies(INITIAL_STAGE48_ACTIVITIES);
  const maintenanceSummary = summarizeMaintenanceCostsSeparated(INITIAL_STAGE48_MAINTENANCE_COSTS);
  const areaResult = calculateGeometricAreaWithProvenance({
    widthM,
    lengthM,
    measurementKind: 'مساحت هندسی محاسبه‌شده',
    deedAreaSqm: 100.5,
  });
  const shareCheck = shareAndVersionDecisionScenario({
    scenario: savedScenario,
    shareWithRole: 'invited_specialist',
    includePrivateOwnerPhone: true,
    explicitUserConsentForPrivateData: consentPrivatePhone,
    newEngineMethodVersion: 'v6.5-DT',
  });

  if (section === 'renovation_schedule_maintenance') {
    return (
      <div className="space-y-3" data-testid="dt-renovation-schedule-maintenance-panel">
        {/* Renovation Cost Builder & Price Update Diff (DT-19 · Tests 6, 7) */}
        <div className="rounded-xl border border-indigo-500/40 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]" data-testid="dt-renovation-cost-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-white">برآورد مقدماتی هزینه بازسازی با تفکیک مصالح، دستمزد و ذخیره احتیاطی (DT-19 · Tests 6–7):</span>
              <div className="text-[10px] text-indigo-300" dir="ltr">{renovationCalc.formulaFa}</div>
            </div>
            <button
              type="button"
              data-testid="dt-bump-material-price-btn"
              onClick={() => {
                const updatedOps = renovationOps.map((op, idx) =>
                  idx === 1 ? { ...op, unitPriceM: Math.round((op.unitPriceM + 0.4) * 10) / 10 } : op,
                );
                onUpdateRenovationOps(updatedOps);
                onUpdateScenario({
                  ...savedScenario,
                  previousVersionSnapshot: {
                    versionLabel: 'نسخه قبلی پیش از تغییر قیمت سرامیک',
                    methodVersion: savedScenario.methodVersion,
                    totalResultM: renovationCalc.cBudgetM,
                  },
                });
                onFeedbackFa('قیمت واحد سرامیک تغییر یافت؛ برآورد جدید محاسبه شد و نسخه قبلی سناریو برای مقایسه حفظ گردید.');
              }}
              className="rounded bg-indigo-700 px-2.5 py-1 font-bold text-white cursor-pointer"
            >
              تغییر قیمت مصالح و حفظ نسخه قبلی (Test 7)
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10.5px] tabular-nums">
            <div className="rounded border border-slate-800 bg-slate-900 p-2">مصالح: <strong className="text-white">{renovationCalc.materialsM} م.ت</strong></div>
            <div className="rounded border border-slate-800 bg-slate-900 p-2">دستمزد اجرا: <strong className="text-white">{renovationCalc.laborM} م.ت</strong></div>
            <div className="rounded border border-slate-800 bg-slate-900 p-2">
              ذخیره احتیاطی ({reservePercent}٪): <strong className="text-amber-300">{renovationCalc.cReserveM} م.ت</strong>
            </div>
            <div className="rounded border border-emerald-800/50 bg-emerald-950/30 p-2">
              کل بودجه برآوردی: <strong className="text-emerald-300">{renovationCalc.cBudgetM} م.ت</strong> (اختلاف با نسخه پایه: {renovationCalc.deltaFromPreviousM >= 0 ? `+${renovationCalc.deltaFromPreviousM}` : renovationCalc.deltaFromPreviousM} م.ت)
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-amber-300">
            <span>{renovationCalc.outOfScopeWarningFa}</span>
            <label className="flex items-center gap-1 text-slate-300">
              <span>درصد ذخیره:</span>
              <NumericDraftInput min={0} max={30} fallback={0} value={reservePercent} onValueChange={setReservePercent} className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-white" />
            </label>
          </div>
        </div>

        {/* Project Schedule Conflict Checker (DT-20 · Test 8) & 3-Bucket Maintenance Costs (DT-21 · Test 9) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="dt-schedule-conflict-card">
            <div className="font-bold text-white">برنامه‌ریزی زمان پروژه و تشخیص تعارض وابستگی (DT-20 · Test 8):</div>
            {scheduleCheck.conflictsFa.map((c) => (
              <div key={c} className="rounded border border-rose-500/50 bg-rose-950/40 p-2 text-[10.5px] text-rose-200 font-bold">
                ⚠️ هشدار تعارض زمانی: {c}
              </div>
            ))}
            <div className="text-[10px] text-slate-400">زمان‌بندی پیشنهادی تعهد قطعی پیمانکار محسوب نمی‌شود و به مرحله ۴۵ متصل است.</div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="dt-maintenance-cost-card">
            <div className="font-bold text-white">مدیریت هزینه‌های نگهداری ملک با تفکیک ۳گانه (DT-21 · Test 9):</div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] tabular-nums">
              <div className="rounded border border-slate-800 bg-slate-900 p-2">انجام‌شده: <strong className="text-emerald-300 block">{maintenanceSummary.completedM} م.ت</strong></div>
              <div className="rounded border border-slate-800 bg-slate-900 p-2">برنامه‌ریزی‌شده: <strong className="text-cyan-300 block">{maintenanceSummary.plannedM} م.ت</strong></div>
              <div className="rounded border border-slate-800 bg-slate-900 p-2">ذخیره پیشنهادی: <strong className="text-amber-300 block">{maintenanceSummary.reserveM} م.ت</strong></div>
            </div>
            <div className="text-[10px] text-slate-400">هزینه انجام‌شده، برنامه‌ریزی‌شده و ذخیره پیشنهادی هیچ‌گاه بدون تفکیک ادغام نمی‌شوند.</div>
          </div>
        </div>

        {/* Geometric Area Calculator with Deed Distinction (DT-22 · Test 10) */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-[11px]" data-testid="dt-area-calculator-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-white">محاسبه‌گر متراژ و تبدیل واحد با تفکیک مساحت هندسی از مساحت سند (DT-22 · Test 10):</span>
            <div className="flex items-center gap-2">
              <NumericDraftInput aria-label="عرض به متر" allowDecimal min={0.5} max={1000} fallback={8.5} value={widthM} onValueChange={setWidthM} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-white" />
              <span>×</span>
              <NumericDraftInput aria-label="طول به متر" allowDecimal min={0.5} max={1000} fallback={12} value={lengthM} onValueChange={setLengthM} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-white" />
            </div>
          </div>
          {areaResult.valid ? (
            <div className="text-[10.5px] text-slate-200 tabular-nums">
              مساحت هندسی محاسبه‌شده: <strong>{areaResult.areaSqm} مترمربع</strong> ({areaResult.areaSqft} فوت‌مربع) · محیط: <strong>{areaResult.perimeterM} متر</strong> · مساحت مندرج در سند: <strong>{areaResult.deedAreaSqm} مترمربع</strong> (جایگزین خودکار مساحت سند نمی‌شود).
            </div>
          ) : (
            <div className="text-rose-300 font-bold">{areaResult.errorFa}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dt-scenarios-sharing-governance-panel">
      {/* Saved Scenario Version History & Selective Specialist Sharing (DT-27..DT-30 · Tests 12, 13, 14) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]" data-testid="dt-scenario-version-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-white">{savedScenario.nameFa} ({savedScenario.scenarioId})</span>
            <div className="text-[10px] text-slate-400">
              نسخه روش متصل به نتیجه تاریخی: <strong>{shareCheck.historicalResultBoundToMethodVersion}</strong> (با ارتقای روش به {shareCheck.updatedEngineMethodVersion} نتیجه تاریخی بدون ثبت نسخه بازنویسی نمی‌شود — Test 14)
            </div>
          </div>
          <span className="rounded bg-indigo-900/60 px-2 py-0.5 font-bold text-indigo-200">ذخیره‌شده</span>
        </div>

        {savedScenario.previousVersionSnapshot && (
          <div data-testid="dt-previous-scenario-snapshot" className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-[10.5px] text-amber-200">
            نسخه قبلی حفظ‌شده: <strong>{savedScenario.previousVersionSnapshot.versionLabel}</strong> — مبلغ قبلی: {savedScenario.previousVersionSnapshot.totalResultM} م.ت
          </div>
        )}

        <div className="rounded border border-slate-800 bg-slate-900 p-2.5 space-y-1.5" data-testid="dt-scenario-share-box">
          <div className="font-bold text-white">اشتراک‌گذاری کنترل‌شده سناریو با متخصص (DT-29 · Test 13):</div>
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={consentPrivatePhone} onChange={(e) => setConsentPrivatePhone(e.target.checked)} />
            <span>اجازه صریح کاربر برای درج شماره تماس شخصی مالک در خروجی ارسالی به متخصص</span>
          </label>
          <div className="text-[10.5px] text-teal-300">
            وضعیت ارسال شماره تماس خصوصی در گزارش: <strong>{shareCheck.sharedOwnerPhoneIncluded ? 'مجاز با رضایت صریح کاربر' : 'حذف‌شده به‌صورت پیش‌فرض (حفظ حریم خصوصی)'}</strong>
          </div>
        </div>
      </div>

      {/* Stage 49 Market Monitoring Preview (16 Axes) */}
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1.5 text-[10.5px]" data-testid="stage49-monitoring-preview">
        <div className="font-bold text-indigo-200">
          پیش‌نمایش متصل به مرحله ۴۹: پایش بازار، هشدارهای هوشمند و رویدادهای مهم املاک (RT-UI-MARKET-MONITORING-001 · ۱۶ محور):
        </div>
        <div className="flex flex-wrap gap-1">
          {STAGE49_MONITORING_AXES_16.map((ax, i) => (
            <span key={ax} className="rounded bg-slate-900/90 border border-slate-800 px-1.5 py-0.5 text-slate-300">
              {i + 1}. {ax}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

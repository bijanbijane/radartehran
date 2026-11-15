/** @file src/features/onboarding/components/Stage54BuildingIdentityAndChangesPanel.tsx — Stage 54 Identity, Provenance, Changes & AI Guard Panel */
import React, { useState } from 'react';
import {
  evaluateBuildingProfileAndPhysicalGuards,
  evaluatePhysicalChangeDemolitionAndAiGuard,
} from '../services/builtEnvironmentEngine';
import {
  STAGE54_BOUNDARIES_7,
  STAGE54_BUILT_ENTITIES_6,
  type BuildingRecord,
  type DetectedPhysicalChangeRecord,
} from '../services/builtEnvironmentTypes';

interface Props {
  section: 'identity_parcels_units_age_height' | 'changes_demolition_and_ai';
  buildings: ReadonlyArray<BuildingRecord>;
  changes: ReadonlyArray<DetectedPhysicalChangeRecord>;
  onFeedbackFa: (message: string) => void;
}

export const Stage54BuildingIdentityAndChangesPanel: React.FC<Props> = ({
  section,
  buildings,
  changes,
  onFeedbackFa,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(buildings[0]?.id ?? 'RT-BLD-0001');
  const [attemptHeightFormula, setAttemptHeightFormula] = useState<boolean>(true);
  const [attemptAgeOnlyDilapidation, setAttemptAgeOnlyDilapidation] = useState<boolean>(true);

  const [selectedChangeId, setSelectedChangeId] = useState<string>(changes[0]?.id ?? 'CHG-54-01');
  const [isCatalogImportOnly, setIsCatalogImportOnly] = useState<boolean>(false);
  const [hasHumanReview, setHasHumanReview] = useState<boolean>(false);
  const [reuseOldBuildingIdAttempt, setReuseOldBuildingIdAttempt] = useState<boolean>(false);

  const building = buildings.find((item) => item.id === selectedBuildingId) ?? buildings[0];
  const change = changes.find((item) => item.id === selectedChangeId) ?? changes[0];

  if (section === 'identity_parcels_units_age_height' && building) {
    const guard = evaluateBuildingProfileAndPhysicalGuards(
      building,
      attemptHeightFormula,
      attemptAgeOnlyDilapidation,
    );

    return (
      <div className="space-y-4" data-testid="stage54-identity-panel">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <h4 className="text-xs font-bold text-amber-300">مرزبندی ۷گانه مرحله ۵۴ با مراحل قبلی</h4>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {STAGE54_BOUNDARIES_7.map((row) => (
                <div key={row.stage} className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2 text-[11px]">
                  <span className="font-bold text-slate-200">{row.stage}: </span>
                  <span className="text-slate-400">{row.responsibilityFa}</span>
                  <div className="text-emerald-300/90 mt-0.5">{row.stage54RoleFa}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <h4 className="text-xs font-bold text-amber-300">تفکیک ۶ موجودیت اصلی ساختمانی (Building ≠ Parcel ≠ Unit ≠ Case)</h4>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {STAGE54_BUILT_ENTITIES_6.map((item) => (
                <div key={item.kind} className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2 text-[11px]">
                  <div className="font-bold text-sky-300">{item.kind}</div>
                  <div className="text-slate-300 mt-0.5">{item.ruleFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-slate-900/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-white">شناسنامه نمونه و آزمون قواعد ارتفاع، سن بنا و تفکیک آگهی</h4>
            <div className="flex gap-2">
              {buildings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedBuildingId(item.id);
                    onFeedbackFa(`ساختمان نمونه ${item.id} (${item.neighborhoodNameFa}) انتخاب شد.`);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                    item.id === building.id
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {item.id} ({item.neighborhoodNameFa})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5">
              <input
                type="checkbox"
                checked={attemptHeightFormula}
                onChange={(e) => {
                  setAttemptHeightFormula(e.target.checked);
                  onFeedbackFa('آزمون جلوگیری از تبدیل خودکار تعداد طبقه به ارتفاع دقیق به‌روزرسانی شد.');
                }}
              />
              <span>آزمون ضرب ثابت طبقات در ارتفاع (ممنوعیت قطعیت)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5">
              <input
                type="checkbox"
                checked={attemptAgeOnlyDilapidation}
                onChange={(e) => {
                  setAttemptAgeOnlyDilapidation(e.target.checked);
                  onFeedbackFa('قاعده منع برچسب «فرسوده/ناایمن» صرفاً بر پایه سن بررسی شد.');
                }}
              />
              <span>آزمون برچسب‌زنی فرسودگی صرفاً با سن بنا</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-slate-200">{guard.entitySeparationNoteFa}</div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-sky-200">{guard.uniqueBuildingsVsListingsFa}</div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-amber-200">{guard.heightEvaluationFa}</div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-slate-200">{guard.yearProvenanceFa}</div>
            <div
              className={`rounded-lg border p-2.5 ${
                guard.ageVsSafetyBlocked
                  ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                  : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
              }`}
              data-testid="stage54-age-safety-result"
            >
              {guard.ageVsSafetyMessageFa}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-indigo-200">
              {guard.permitVsPhysicalSeparationFa} — نمای سه‌بعدی: {guard.threeDModeLabelFa}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!change) return null;
  const aiGuard = evaluatePhysicalChangeDemolitionAndAiGuard(
    change,
    isCatalogImportOnly,
    hasHumanReview,
    change.changeType === 'تخریب' ? (reuseOldBuildingIdAttempt ? change.buildingId : 'RT-BLD-0002') : null,
  );

  return (
    <div className="space-y-4" data-testid="stage54-changes-ai-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-amber-300">پایش تغییرات کالبدی، چرخه تخریب و نوسازی و کنترل هوش مصنوعی</h4>
          <div className="flex gap-2">
            {changes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedChangeId(item.id);
                  onFeedbackFa(`رویداد تغییر ${item.id} (${item.changeType}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                  item.id === change.id
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {item.id} — {item.changeType}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5">
            <input
              type="checkbox"
              checked={isCatalogImportOnly}
              onChange={(e) => {
                setIsCatalogImportOnly(e.target.checked);
                onFeedbackFa('حالت ورود پایگاه داده جدید (Catalog Import) در برابر ساخت واقعی تغییر کرد.');
              }}
            />
            <span>صرفاً ورود داده جدید به کاتالوگ (Import) بدون ساخت واقعی</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5">
            <input
              type="checkbox"
              checked={hasHumanReview}
              onChange={(e) => {
                setHasHumanReview(e.target.checked);
                onFeedbackFa('وضعیت تأیید بازبین انسانی روی پیشنهاد سامانه به‌روزرسانی شد.');
              }}
            />
            <span>تأیید بازبین انسانی ثبت شده است</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5">
            <input
              type="checkbox"
              checked={reuseOldBuildingIdAttempt}
              onChange={(e) => setReuseOldBuildingIdAttempt(e.target.checked)}
            />
            <span>آزمون بازاستفاده نادرست از شناسه بنای تخریب‌شده</span>
          </label>
        </div>

        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-slate-200" data-testid="stage54-change-classification">
            <strong className="text-sky-300">طبقه‌بندی تغییر: </strong>
            {aiGuard.classificationLabelFa}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage54-ai-guard-badge">
            <strong className="text-amber-300">وضعیت تشخیص AI: </strong>
            {aiGuard.aiStatusBadgeFa}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-emerald-200" data-testid="stage54-demolition-chain">
            <strong className="text-emerald-300">پیوند تاریخی تخریب/نوسازی: </strong>
            {aiGuard.demolitionLinkNoteFa}
          </div>
        </div>
      </div>
    </div>
  );
};

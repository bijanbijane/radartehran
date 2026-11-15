/** @file src/features/onboarding/components/Stage51ClustersMultiCriteriaAndGovernancePanel.tsx — Stage 51 Multi-Criteria Spatial Scoring, Urban Transformation Guard, Versioning & Stage 52 Preview */
import React, { useState } from 'react';
import {
  evaluateMultiCriteriaTemporalAndUrbanSignals,
  manageSpatialArtifactVersioningAndPrivacy,
} from '../services/geospatialIntelligenceEngine';
import {
  STAGE51_FORBIDDEN_ERRORS_20,
  STAGE51_GI_COMPONENT_IDS_50,
  STAGE51_UI_GI_TASKS_40,
  STAGE51_UX_EVENTS_19,
  STAGE52_URBAN_ATLAS_AXES_24,
  type SavedSpatialArtifactRecord,
} from '../services/geospatialIntelligenceTypes';

export const Stage51ClustersMultiCriteriaAndGovernancePanel: React.FC<{
  section: 'multicriteria_temporal_and_urban' | 'versioning_privacy_and_stage52';
  artifacts: SavedSpatialArtifactRecord[];
  onUpdateArtifact: (next: SavedSpatialArtifactRecord) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, artifacts, onUpdateArtifact, onFeedbackFa }) => {
  const [transitWeight, setTransitWeight] = useState(40);
  const [testForbiddenPhrase, setTestForbiddenPhrase] = useState(true);
  const [shareExternal, setShareExternal] = useState(true);

  const mcdaAndUrban = evaluateMultiCriteriaTemporalAndUrbanSignals({
    candidates: [
      {
        zoneId: 'Z-01',
        nameFa: 'محدوده الف (سعادت‌آباد شرقی — واجد شرایط الزامی)',
        passesMandatoryFilter: true,
        scoresByCriterion: { transit: 88, healthcare: 82, priceIndex: 70 },
      },
      {
        zoneId: 'Z-02',
        nameFa: 'محدوده ب (شهرک غرب جنوبی — واجد شرایط الزامی)',
        passesMandatoryFilter: true,
        scoresByCriterion: { transit: 72, healthcare: 90, priceIndex: 76 },
      },
      {
        zoneId: 'Z-03',
        nameFa: 'محدوده ج (فاقد شرط الزامی کاربری مسکونی)',
        passesMandatoryFilter: false,
        scoresByCriterion: { transit: 98, healthcare: 95, priceIndex: 92 },
      },
    ],
    weights: { transit: transitWeight, healthcare: 35, priceIndex: 25 },
    previousWeights: { transit: 25, healthcare: 35, priceIndex: 25 },
    period1SourceCount: 2,
    period2SourceCount: 4,
    lockColorScaleAcrossFrames: true,
    urbanSignalKind: 'نشانه تحول',
    proposedBannerTitleFa: testForbiddenPhrase
      ? 'منطقه قطعی رشد قیمت و فرصت تضمینی سرمایه‌گذاری'
      : 'محدوده دارای نشانه‌های تغییر کالبدی ثبت‌شده',
  });

  const activeArtifact = artifacts[0];
  const artifactLifecycle = manageSpatialArtifactVersioningAndPrivacy({
    artifact: activeArtifact,
    parameterUpdatedSummaryFa: 'آستانه زمان پیاده: ۲۰ دقیقه · شعاع پهنای باند: ۵۰۰ متر',
    newMethodVersion: 'v1.5',
    toggledMapLayerVisibilityOnly: true,
    shareWithExternalUser: shareExternal,
  });

  if (section === 'multicriteria_temporal_and_urban') {
    return (
      <div className="space-y-3" data-testid="stage51-multicriteria-urban-panel">
        {/* Multi-Criteria Spatial Scoring & Weight Sensitivity (§16 · Tests 13, 14) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-emerald-300 text-xs">
              ۵۱.۱۶ تحلیل چندمعیاره مکانی (S_j = Σ w_i · x_ij)، تفکیک معیار الزامی و حساسیت وزن‌ها (GI-27..GI-29 · Tests 13–14)
            </h4>
            <label className="flex items-center gap-1.5 text-[10.5px] text-slate-300">
              <span>وزن دسترسی حمل‌ونقل: {transitWeight}</span>
              <input
                type="range"
                min={10}
                max={80}
                step={10}
                value={transitWeight}
                onChange={(e) => {
                  setTransitWeight(Number(e.target.value));
                  onFeedbackFa('وزن دسترسی حمل‌ونقل تغییر کرد و حساسیت رتبه‌بندی بازمحاسبه شد.');
                }}
              />
            </label>
          </div>

          <div className="space-y-1.5" data-testid="gi-mcda-zones-list">
            {mcdaAndUrban.rankedZones.map((z) => (
              <div key={z.zoneId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[10.5px]">
                <div>
                  <span className="font-bold text-white">{z.nameFa}</span>
                  <span className="mr-2 text-slate-400">
                    (شرط الزامی: {z.passesMandatoryFilter ? 'برقرار' : 'نقض‌شده — حذف از پیشنهاد برتر'})
                  </span>
                </div>
                <div className="text-emerald-300 font-bold">
                  امتیاز: {z.currentScore} (تغییر ناشی از وزن: {z.scoreDeltaFromWeightChange > 0 ? `+${z.scoreDeltaFromWeightChange}` : z.scoreDeltaFromWeightChange})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Temporal Source-Shift Separation & Urban Transformation Guard (§15, §18, §20 · Tests 15, 18) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]" data-testid="gi-urban-transformation-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300 text-xs">
              ۵۱.۱۵، ۵۱.۱۸ و ۵۱.۲۰ تفکیک گسترش منبع از تغییر واقعی، قفل مقیاس رنگ زمانی و گارد واژگان تحول شهری (GI-25, GI-26)
            </h4>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={testForbiddenPhrase} onChange={(e) => setTestForbiddenPhrase(e.target.checked)} />
              تست پالایش عنوان تبلیغاتی ممنوعه (§18.5)
            </label>
          </div>
          <div className="text-[10.5px] text-amber-300">{mcdaAndUrban.temporalCheck.sourceShiftWarningFa}</div>
          <div className="text-[10.5px] text-slate-300">
            قفل مقیاس رنگ در فریم‌های پویانمایی زمانی: <strong>{mcdaAndUrban.temporalCheck.colorScaleLockedAcrossFrames ? 'فعال (جلوگیری از خطای دیداری)' : 'غیرفعال'}</strong> ·
            عنوان مجاز خروجی تحول شهری: <strong className="text-emerald-300">{mcdaAndUrban.urbanTransformation.sanitizedTitleFa}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stage51-versioning-privacy-panel">
      {/* Map Save vs Analysis Save, Versioning, Positional vs Analytical Confidence & Privacy (§22, §24, §26 · Tests 19–24) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-amber-300 text-xs">
            ۵۱.۲۲، ۵۱.۲۴ و ۵۱.۲۶ تفکیک «ذخیره نقشه» از «ذخیره تحلیل»، نسخه‌بندی و حفاظت حریم خصوصی مکانی (GI-31..GI-50)
          </h4>
          <button
            type="button"
            data-testid="gi-upgrade-artifact-version-btn"
            onClick={() => {
              onUpdateArtifact(artifactLifecycle.updatedArtifact);
              onFeedbackFa(`نسخه جدید تحلیل مکانی (${artifactLifecycle.updatedArtifact.methodVersion}) بدون بازنویسی نسخه قبلی ثبت شد.`);
            }}
            className="rounded bg-emerald-600/30 border border-emerald-500/50 px-2.5 py-1 text-emerald-200 font-bold cursor-pointer"
          >
            ثبت نسخه جدید تحلیل پس از تغییر پارامتر (Tests 19, 24)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
          {artifacts.map((art) => (
            <div key={art.artifactId} className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
              <div className="font-bold text-white">{art.titleFa} ({art.methodVersion})</div>
              <div className="text-cyan-300">نوع ذخیره: {art.saveKind}</div>
              <div className="text-slate-300">پارامترها: {art.parametersSummaryFa}</div>
              <div className="text-amber-300">
                دقت مکانی: {art.positionalAccuracy} | اطمینان تحلیلی: {art.analyticalConfidenceFa}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={shareExternal} onChange={(e) => setShareExternal(e.target.checked)} />
            اشتراک‌گذاری تحلیل خصوصی با کاربر دیگر (Test 20)
          </label>
          <span>
            حذف مختصات دقیق خصوصی در خروجی اشتراکی:{' '}
            <strong className="text-emerald-300">{artifactLifecycle.sharedExportPayload.exactPrivateCoordinatesStripped ? 'بله (حفاظت‌شده)' : 'خیر'}</strong> ·
            تغییر تحلیل ذخیره‌شده با خاموش‌کردن لایه نقشه: <strong>{artifactLifecycle.storedAnalysisMutatedByLayerToggle ? 'بله' : 'خیر (ایزوله — Test 21)'}</strong>
          </span>
        </div>
      </div>

      {/* Catalog Summary & Stage 52 Preview */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کامپوننت‌های GI: <strong>{STAGE51_GI_COMPONENT_IDS_50.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">رویدادهای UX: <strong>{STAGE51_UX_EVENTS_19.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">تسک‌های اجرایی: <strong>{STAGE51_UI_GI_TASKS_40.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">خطاهای ممنوعه: <strong>{STAGE51_FORBIDDEN_ERRORS_20.length}</strong></div>
        </div>

        <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-2.5" data-testid="gi-stage52-preview-box">
          <div className="font-bold text-indigo-300 mb-1">
            پیش‌نمایش مرحله ۵۲ (RT-UI-URBAN-DATA-ATLAS-001) — {STAGE52_URBAN_ATLAS_AXES_24.length} محور کاتالوگ داده‌های شهری و اطلس لایه‌های مرجع:
          </div>
          <div className="text-[10.5px] text-slate-300">{STAGE52_URBAN_ATLAS_AXES_24.join(' • ')}</div>
        </div>
      </div>
    </div>
  );
};

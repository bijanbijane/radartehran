/** @file src/features/onboarding/components/Stage51AccessProximityAndDensityPanel.tsx — Stage 51 Distance vs Access, Coverage, Density & Intra-Neighborhood Grid */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  evaluateDensityClustersAndAutocorrelation,
  evaluateIntraNeighborhoodLandUseAndServiceGap,
  evaluateSpatialAccessAndCoverage,
} from '../services/geospatialIntelligenceEngine';
import {
  STAGE51_BOUNDARIES_8,
  type IntraNeighborhoodCellRecord,
  type SpatialClusterMode,
  type SpatialDestinationAccessRecord,
  type SpatialNeighborhoodWeightRule,
} from '../services/geospatialIntelligenceTypes';

export const Stage51AccessProximityAndDensityPanel: React.FC<{
  section: 'access_proximity_and_coverage' | 'density_grid_and_landuse';
  destinations: SpatialDestinationAccessRecord[];
  gridCells: IntraNeighborhoodCellRecord[];
  onFeedbackFa: (msg: string) => void;
}> = ({ section, destinations, gridCells, onFeedbackFa }) => {
  const [thresholdMinutes, setThresholdMinutes] = useState(15);
  const [popDataAvailable, setPopDataAvailable] = useState(false);
  const [clusterMode, setClusterMode] = useState<SpatialClusterMode>(
    'خوشه‌بندی بصری (صرفاً برای خوانایی نقشه)',
  );
  const [pointCount, setPointCount] = useState(18);
  const [hasDemandData, setHasDemandData] = useState(false);
  const [neighborhoodRule] = useState<SpatialNeighborhoodWeightRule>('مرز مشترک (Contiguity)');

  const accessEval = evaluateSpatialAccessAndCoverage({
    destinations,
    thresholdMinutes,
    populationDataAvailable: popDataAvailable,
    areaCoveredSqKm: 2.4,
    populationCoveredCount: 34200,
  });

  const densityEval = evaluateDensityClustersAndAutocorrelation({
    pointCount,
    minSampleForStatisticalCluster: 30,
    bandwidthMeters: 400,
    cellSizeMeters: 250,
    areaSqKm: 2.4,
    clusterMode,
    neighborhoodRule,
    moranIValue: 0.42,
    pValue: 0.018,
  });

  const gridAndServiceEval = evaluateIntraNeighborhoodLandUseAndServiceGap({
    cells: gridCells,
    minCellPrivacyCount: 5,
    serviceCentersCount: 7,
    hasCapacityAndPopulationDemandData: hasDemandData,
  });

  if (section === 'access_proximity_and_coverage') {
    return (
      <div className="space-y-3" data-testid="stage51-access-coverage-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" data-testid="gi-boundaries-strip">
          {STAGE51_BOUNDARIES_8.map((b) => (
            <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="font-bold text-emerald-300">{b.prevStageFa}</div>
              <div className="text-slate-300">{b.roleFa}</div>
            </div>
          ))}
        </div>

        {/* Distance vs Network Accessibility & Service Coverage (GI-11..GI-15 · Tests 1, 2, 3, 4, 16) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <h4 className="font-bold text-emerald-300 text-xs">
              ۵۱.۲.۲، ۵۱.۶ و ۵۱.۷ تفکیک فاصله مستقیم از مسیر شبکه، دقت موقعیت و پوشش هندسی/جمعیتی (GI-11..GI-15)
            </h4>
            <div className="flex flex-wrap items-center gap-3 text-[10.5px]">
              <label className="flex items-center gap-1 text-slate-300">
                <span>آستانه دسترسی (دقیقه):</span>
                <NumericDraftInput
                  min={5}
                  max={45}
                  fallback={15}
                  value={thresholdMinutes}
                  onValueChange={setThresholdMinutes}
                  className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-white"
                />
              </label>
              <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={popDataAvailable}
                  onChange={(e) => {
                    setPopDataAvailable(e.target.checked);
                    onFeedbackFa('وضعیت دسترسی به داده توزیع جمعیت به‌روزرسانی شد.');
                  }}
                />
                وجود داده معتبر جمعیت ساکن (Test 4)
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-[10.5px] space-y-1">
            <div>
              نوع پوشش گزارش‌شده: <strong className="text-cyan-300">{accessEval.coverageScopeKindFa}</strong> · مساحت پوشش:{' '}
              <strong>{accessEval.areaCoveredSqKm} کیلومترمربع</strong> · جمعیت تحت پوشش:{' '}
              <strong className="text-amber-300">
                {accessEval.populationCoveredCount !== null
                  ? `${accessEval.populationCoveredCount.toLocaleString('fa-IR')} نفر`
                  : 'گزارش‌نشده (صرفاً پوشش هندسی به دلیل نبود داده جمعیت معتبر)'}
              </strong>
            </div>
            <div className="text-slate-400">{accessEval.networkLimitationNoticeFa}</div>
          </div>

          <div className="space-y-2" data-testid="gi-destinations-list">
            {accessEval.evaluatedDestinations.map((d) => (
              <div key={d.destinationId} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-[10.5px] space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-white">
                    {d.nameFa} ({d.categoryFa})
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-cyan-300">{d.measurementTypeLabelFa}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-slate-300">
                  <div>فاصله مستقیم: <strong>{d.straightLineMeters} متر</strong></div>
                  <div>
                    فاصله روی شبکه معابر:{' '}
                    <strong>{d.networkRouteMeters !== null ? `${d.networkRouteMeters} متر` : 'نامشخص (شبکه ناقص)'}</strong>
                  </div>
                  <div>
                    زمان تخمینی حرکت:{' '}
                    <strong className="text-emerald-300">
                      {d.estimatedTravelMinutes !== null ? `${d.estimatedTravelMinutes} دقیقه (${d.travelModeFa})` : 'غیرقابل محاسبه از فاصله مستقیم'}
                    </strong>
                  </div>
                </div>
                {d.positionalWarningFa && (
                  <div className="text-amber-300 text-[10px]" data-testid={`gi-pos-warning-${d.destinationId}`}>
                    هشدار دقت مکانی ({d.originPositionalAccuracy}): {d.positionalWarningFa}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stage51-density-grid-panel">
      {/* Density, Visual vs Statistical Clustering & Autocorrelation (§9, §10, §11 · Tests 6, 7, 8, 9) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-emerald-300 text-xs">
            ۵۱.۹، ۵۱.۱۰ و ۵۱.۱۱ تراکم نرمال‌شده، تفکیک خوشه بصری از خوشه آماری و خودهمبستگی مکانی (GI-16..GI-21)
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
            <button
              type="button"
              onClick={() =>
                setClusterMode((prev) =>
                  prev.includes('بصری')
                    ? 'خوشه‌بندی آماری (الگوریتم و معیار آماری مشخص)'
                    : 'خوشه‌بندی بصری (صرفاً برای خوانایی نقشه)',
                )
              }
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-cyan-300 cursor-pointer"
            >
              تغییر حالت خوشه ({clusterMode.includes('بصری') ? 'بصری' : 'آماری'})
            </button>
            <button
              type="button"
              onClick={() => setPointCount((c) => (c < 30 ? 45 : 18))}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-amber-300 cursor-pointer"
            >
              تعداد مشاهدات: {pointCount} (حداقل آماری: ۳۰)
            </button>
          </div>
        </div>

        <div className="text-[10.5px] text-slate-300">
          تراکم نرمال‌شده: <strong className="text-white">{densityEval.normalizedDensityPerSqKm} مشاهده بر کیلومترمربع</strong> · پهنای باند:{' '}
          <strong>{densityEval.bandwidthMeters} متر</strong> · حالت خروجی:{' '}
          <strong className="text-emerald-300">{densityEval.effectiveClusterModeFa}</strong>
        </div>
        {densityEval.insufficientSampleNoticeFa && (
          <div className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-[10px] text-amber-200">
            {densityEval.insufficientSampleNoticeFa}
          </div>
        )}
        <div className="text-[10px] text-cyan-200">
          خودهمبستگی مکانی ({densityEval.autocorrelation.neighborhoodRule}): شاخص Moran&apos;s I = {densityEval.autocorrelation.moranIValue} (p = {densityEval.autocorrelation.pValue}) — {densityEval.autocorrelation.cautionNoticeFa}
        </div>
      </div>

      {/* Intra-Neighborhood Grid (MAUP + Privacy Guard), Land Use vs Listing & Service Gap 3-Concepts (§12, §13, §14 · Tests 10, 11, 12) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]" data-testid="gi-intra-neighborhood-grid-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">
            ۵۱.۱۲، ۵۱.۱۳ و ۵۱.۱۴ شبکه سلولی درون‌محله‌ای، تفکیک کاربری رسمی از آگهی و ۳ مفهوم خدمات (GI-22..GI-24):
          </span>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={hasDemandData} onChange={(e) => setHasDemandData(e.target.checked)} />
            وجود داده ظرفیت مراکز و تقاضای جمعیت (Test 12)
          </label>
        </div>
        <div className="text-[10px] text-amber-300">{gridAndServiceEval.maupScaleWarningFa}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
          {gridAndServiceEval.evaluatedCells.map((cell) => (
            <div key={cell.cellId} className="rounded border border-slate-800 bg-slate-900/70 p-2 space-y-1">
              <div className="font-bold text-slate-100">{cell.labelFa} ({cell.observationCount} مشاهده)</div>
              <div className="text-emerald-300">میانه قیمت: {cell.displayedMedianPriceFa}</div>
              <div className="text-slate-300">ادعای آگهی: {cell.landUseReportedInListingsFa}</div>
              <div className="text-cyan-300">کاربری طرح تفصیلی: {cell.officialZoningLandUseFa}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-300 pt-1">
          ارزیابی خدمات ({gridAndServiceEval.serviceEvaluation.serviceCentersCount} مرکز): مفهوم مجاز گزارش ={' '}
          <strong className="text-emerald-300">{gridAndServiceEval.serviceEvaluation.reportedConcept}</strong> · برچسب سیاستی:{' '}
          <strong>{gridAndServiceEval.serviceEvaluation.nonStigmatizingLabelFa}</strong>
        </div>
      </div>
    </div>
  );
};

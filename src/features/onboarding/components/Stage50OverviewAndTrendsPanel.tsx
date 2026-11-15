/** @file src/features/onboarding/components/Stage50OverviewAndTrendsPanel.tsx — Stage 50 Dashboard, Report Builder, Price Trends & Neighborhood Comparison */
import React, { useState } from 'react';
import {
  calculateSupplyCompositionShares,
  evaluateMarketReportPeriodComparison,
  evaluateMultiNeighborhoodReportComparison,
  evaluateTrendSeriesAndAdjustment,
} from '../services/marketReportingEngine';
import {
  STAGE50_BOUNDARIES_7,
  STAGE50_STANDARD_REPORT_SECTIONS_16,
  type MarketReportSummaryRecord,
} from '../services/marketReportingTypes';

export const Stage50OverviewAndTrendsPanel: React.FC<{
  section: 'overview_and_builder' | 'trends_supply_and_comparison';
  reports: MarketReportSummaryRecord[];
  selectedReportId: string;
  onSelectReport: (reportId: string) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, reports, selectedReportId, onSelectReport, onFeedbackFa }) => {
  const [prevZeroTest, setPrevZeroTest] = useState(false);
  const [enableReferenceDeflator, setEnableReferenceDeflator] = useState(true);
  const [misalignPeriods, setMisalignPeriods] = useState(false);

  const activeReport = reports.find((r) => r.reportId === selectedReportId) ?? reports[0];

  const periodEval = evaluateMarketReportPeriodComparison({
    report: activeReport,
    previousValue: prevZeroTest ? 0 : activeReport.previousPeriodMedianM,
    currentValue: activeReport.medianAskingPricePerSqmM,
    askingPriceChartSeparateFromDealPrice: true,
  });

  const supplyShares = calculateSupplyCompositionShares({
    classifiedCounts: [
      { categoryFa: 'آپارتمان مسکونی (زیر ۱۰۰ متر)', count: 165 },
      { categoryFa: 'آپارتمان مسکونی (۱۰۰ تا ۱۵۰ متر)', count: 142 },
      { categoryFa: 'آپارتمان مسکونی (بالای ۱۵۰ متر)', count: 80 },
    ],
    unclassifiedCount: 25,
  });

  const trendEval = evaluateTrendSeriesAndAdjustment({
    nominalSeries: [
      { periodFa: 'شهریور ۱۴۰۵', valueM: 194, methodVersion: 'v2.3' },
      { periodFa: 'مهر ۱۴۰۵', valueM: 202, methodVersion: 'v2.4' },
      { periodFa: 'آبان ۱۴۰۵', valueM: 214, methodVersion: 'v2.4' },
    ],
    referenceIndexAvailable: enableReferenceDeflator,
    referenceIndexNameFa: 'شاخص مرجع بهای کالا و خدمات مصرفی (اعلام‌شده)',
    basePeriodFa: 'شهریور ۱۴۰۵ = ۱.۰۰',
    referenceDeflators: [1.0, 1.025, 1.055],
  });

  const hoodComparison = evaluateMultiNeighborhoodReportComparison({
    neighborhoods: [
      {
        hoodNameFa: 'سعادت‌آباد',
        periodFa: 'آبان ۱۴۰۵',
        propertyTypeFa: 'آپارتمان مسکونی',
        dataType: 'قیمت آگهی',
        medianPricePerSqmM: 214,
        observationCount: 412,
      },
      {
        hoodNameFa: 'شهرک غرب',
        periodFa: misalignPeriods ? 'پاییز ۱۴۰۵ (فصلی)' : 'آبان ۱۴۰۵',
        propertyTypeFa: 'آپارتمان مسکونی',
        dataType: 'قیمت آگهی',
        medianPricePerSqmM: 228,
        observationCount: 14,
      },
      {
        hoodNameFa: 'محدوده صنعتی جنوب‌غرب (بدون نمونه مسکونی)',
        periodFa: 'آبان ۱۴۰۵',
        propertyTypeFa: 'آپارتمان مسکونی',
        dataType: 'قیمت آگهی',
        medianPricePerSqmM: null,
        observationCount: 0,
      },
    ],
    minSufficientSample: 30,
  });

  if (section === 'overview_and_builder') {
    return (
      <div className="space-y-3" data-testid="stage50-overview-builder-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" data-testid="mr-boundaries-strip">
          {STAGE50_BOUNDARIES_7.map((b) => (
            <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="font-bold text-cyan-300">{b.prevStageFa}</div>
              <div className="text-slate-300">{b.roleFa}</div>
            </div>
          ))}
        </div>

        {/* Report Selector & 4-Layer Data vs Interpretation Separation (MR-01..MR-11 · Tests 1, 2) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <h4 className="font-bold text-emerald-300 text-xs">
              ۵۰.۲ و ۵۰.۵ مشخصات پایدار سربرگ گزارش، تفکیک ۵ نوع قیمت و ۴ لایه تحلیل (MR-04, MR-05, MR-11)
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {reports.map((r) => (
                <button
                  key={r.reportId}
                  type="button"
                  onClick={() => {
                    onSelectReport(r.reportId);
                    onFeedbackFa(`گزارش «${r.titleFa}» (${r.reportPeriodFa} · ${r.reportVersion}) انتخاب شد.`);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold cursor-pointer ${
                    r.reportId === activeReport.reportId
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                      : 'bg-slate-900 text-slate-300 border border-slate-800'
                  }`}
                >
                  {r.reportId} ({r.categoryFa})
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-[10.5px]">
            <div>شناسه و نسخه: <strong className="text-white">{activeReport.reportId} · {activeReport.reportVersion}</strong></div>
            <div>دوره بررسی: <strong className="text-amber-300">{activeReport.reportPeriodFa}</strong></div>
            <div>محدوده: <strong className="text-cyan-300">{activeReport.geographicScopeFa}</strong></div>
            <div>نوع داده و مشاهدات: <strong className="text-emerald-300">{activeReport.priceDataType} ({activeReport.observationCount} مشاهده)</strong></div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
            <div>
              میانه فعلی هر متر: <strong className="text-white">{activeReport.medianAskingPricePerSqmM} م.ت</strong> · نرخ تغییر نسبت به دوره قبل:{' '}
              <strong className="text-amber-300">{periodEval.changeRateDisplayFa}</strong> (تفکیک نمودار آگهی از معامله:{' '}
              <strong>{periodEval.askingAndDealChartsSeparated ? 'بله' : 'خیر'}</strong>)
            </div>
            <label className="flex items-center gap-1.5 text-[10.5px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={prevZeroTest} onChange={(e) => setPrevZeroTest(e.target.checked)} />
              تست دوره قبلی صفر/نامعتبر (§8.5)
            </label>
          </div>

          {periodEval.compositionShiftBannerFa && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-amber-200 text-[10.5px]" data-testid="mr-composition-shift-warning">
              هشدار تغییر ترکیب نمونه (§11.5 · Test 3): {periodEval.compositionShiftBannerFa}
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="font-bold text-slate-200 mb-1">معماری ۱۶ بخش استاندارد صفحه گزارش (§5.1):</div>
            <div className="text-[10px] text-slate-400">{STAGE50_STANDARD_REPORT_SECTIONS_16.join(' · ')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stage50-trends-comparison-panel">
      {/* Nominal vs Adjusted Trend & Method Discontinuity Marker (§10.3, §16.3 · Tests 6, 10, 11) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-emerald-300 text-xs">
            ۵۰.۱۰ و ۵۰.۱۶ روند اسمی در برابر تعدیل‌شده، نشان تغییر روش و جدول داده پشتیبان (MR-13, MR-18, MR-41)
          </h4>
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={enableReferenceDeflator} onChange={(e) => setEnableReferenceDeflator(e.target.checked)} />
            وجود شاخص مرجع معتبر برای تعدیل تورمی (Test 11)
          </label>
        </div>
        <div className="text-amber-300 text-[10.5px]">{trendEval.methodBreakNoticeFa}</div>
        <div className="text-cyan-300 text-[10.5px]">{trendEval.adjustmentMetaFa}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10.5px]">
          {trendEval.nominalSeries.map((pt, idx) => (
            <div key={pt.periodFa} className="rounded border border-slate-800 bg-slate-900/70 p-2">
              <div className="font-bold text-white">{pt.periodFa} (روش {pt.methodVersion})</div>
              <div className="text-slate-300">اسمی: <strong>{pt.valueM} م.ت/مترمربع</strong></div>
              <div className="text-emerald-300">
                تعدیل‌شده: <strong>{trendEval.adjustedSeries ? `${trendEval.adjustedSeries[idx].adjustedValueM} م.ت` : 'صرفاً اسمی (بدون تعدیل فرضی)'}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supply Composition with Unclassified Preserved & Multi-Neighborhood Comparison (§12, §13 · Tests 4, 5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2" data-testid="mr-supply-composition-card">
          <div className="font-bold text-white">
            {supplyShares.scopeTitleFa} (کل رکوردها با حفظ «نامشخص» در مخرج: {supplyShares.totalRecords})
          </div>
          {supplyShares.shares.map((s) => (
            <div key={s.categoryFa} className="flex items-center justify-between border-b border-slate-800/70 pb-1 text-[10.5px]">
              <span className="text-slate-300">{s.categoryFa}</span>
              <span className="font-bold text-emerald-300">{s.count} فایل ({s.sharePercent}٪)</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2" data-testid="mr-neighborhood-comparison-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-white">مقایسه محله‌ها و تفکیک «فاقد داده» در نقشه (Tests 4–5):</span>
            <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={misalignPeriods} onChange={(e) => setMisalignPeriods(e.target.checked)} />
              شبیه‌سازی ناهمسانی دوره
            </label>
          </div>
          <div className="text-[10px] text-amber-300">{hoodComparison.alignmentNoticeFa}</div>
          {hoodComparison.rows.map((r) => (
            <div key={r.hoodNameFa} className="rounded border border-slate-800 bg-slate-900/70 p-2 text-[10px]">
              <div className="font-bold text-slate-100">
                {r.hoodNameFa} ({r.periodFa}) — میانه: {r.medianPricePerSqmM !== null ? `${r.medianPricePerSqmM} م.ت` : 'فاقد داده'}
              </div>
              <div className="text-cyan-300">وضعیت لایه نقشه: {r.mapZoneState} · {r.qualityWarningFa}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** @file src/features/onboarding/components/Stage36DataVisSubpanel.tsx — Stage 36 (RT-UI-DATA-VIS-001) Interactive Data Visualization & Analytical Interface */
import React, { useMemo, useState } from 'react';
import { BarChart3, Database, GitCompare, MapPin } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  BOX_PLOT_PLAIN_GUIDE_FA,
  RADAR_METRIC_REGISTRY,
  calculateDistributionPercentiles,
  evaluateMetricSufficiency,
  selectChartForAnalyticalQuestion,
  validateNeighborhoodComparisonHomogeneity,
  type AnalyticalQuestionKind,
  type PriceDataOrigin,
} from '../services/dataVisualizationEngine';

export interface Stage36DataVisSubpanelProps {
  onAnnounceStatus: (msgFa: string) => void;
}

const HOOD_ANALYTICAL_SAMPLES: Record<
  string,
  {
    nameFa: string;
    districtFa: string;
    samplesM: number[];
    sampleCount: number;
    timeSeries: Array<{ monthFa: string; medianM: number | null }>;
  }
> = {
  'saadat-abad': {
    nameFa: 'سعادت‌آباد',
    districtFa: 'منطقه ۲',
    samplesM: [165, 178, 185, 192, 205, 218, 240],
    sampleCount: 142,
    timeSeries: [
      { monthFa: 'خرداد ۱۴۰۵', medianM: 176 },
      { monthFa: 'تیر ۱۴۰۵', medianM: 181 },
      { monthFa: 'مرداد ۱۴۰۵', medianM: null },
      { monthFa: 'شهریور ۱۴۰۵', medianM: 189 },
      { monthFa: 'مهر ۱۴۰۵', medianM: 192 },
    ],
  },
  punak: {
    nameFa: 'پونک',
    districtFa: 'منطقه ۵',
    samplesM: [118, 126, 134, 140, 148, 158, 172],
    sampleCount: 118,
    timeSeries: [
      { monthFa: 'خرداد ۱۴۰۵', medianM: 131 },
      { monthFa: 'تیر ۱۴۰۵', medianM: 135 },
      { monthFa: 'مرداد ۱۴۰۵', medianM: 138 },
      { monthFa: 'شهریور ۱۴۰۵', medianM: 140 },
      { monthFa: 'مهر ۱۴۰۵', medianM: 142 },
    ],
  },
  'low-sample-hood': {
    nameFa: 'محدوده کم‌نمونه (آزمایش کفایت داده)',
    districtFa: 'منطقه ۲۲',
    samplesM: [92, 98, 105],
    sampleCount: 8,
    timeSeries: [
      { monthFa: 'خرداد ۱۴۰۵', medianM: 95 },
      { monthFa: 'تیر ۱۴۰۵', medianM: null },
      { monthFa: 'مرداد ۱۴۰۵', medianM: null },
      { monthFa: 'شهریور ۱۴۰۵', medianM: 98 },
      { monthFa: 'مهر ۱۴۰۵', medianM: null },
    ],
  },
};

export const Stage36DataVisSubpanel: React.FC<Stage36DataVisSubpanelProps> = ({ onAnnounceStatus }) => {
  const [selectedHoodKey, setSelectedHoodKey] = useState<string>('saadat-abad');
  const [questionKind, setQuestionKind] = useState<AnalyticalQuestionKind>('temporal_trend');
  const [compareOriginB, setCompareOriginB] = useState<PriceDataOrigin>('asking_price');

  const hood = HOOD_ANALYTICAL_SAMPLES[selectedHoodKey] ?? HOOD_ANALYTICAL_SAMPLES['saadat-abad'];
  const dist = useMemo(() => calculateDistributionPercentiles(hood.samplesM), [hood]);
  const primaryMetric = RADAR_METRIC_REGISTRY[0];
  const sufficiency = evaluateMetricSufficiency(hood.sampleCount, primaryMetric.minSufficientSampleCount, dist.p50Median);
  const chartRec = selectChartForAnalyticalQuestion(questionKind);
  const homogeneity = validateNeighborhoodComparisonHomogeneity(
    { dataOrigin: 'asking_price', unitFa: 'میلیون تومان', periodFa: 'مهر ۱۴۰۵' },
    { dataOrigin: compareOriginB, unitFa: 'میلیون تومان', periodFa: 'مهر ۱۴۰۵' },
  );

  return (
    <div className="space-y-4" data-testid="stage-36-datavis-panel">
      {/* Drill-down Breadcrumb + Linked View Neighborhood Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[10px] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)]">
        <div className="flex items-center gap-1.5 font-bold text-[#182522] dark:text-white" data-testid="drilldown-breadcrumb">
          <MapPin className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>مسیر Drill-down مکانی: تهران / {hood.districtFa} / {hood.nameFa} / توزیع و روند قیمت آگهی‌ها</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(HOOD_ANALYTICAL_SAMPLES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              data-testid={`datavis-hood-${k}`}
              onClick={() => {
                setSelectedHoodKey(k);
                onAnnounceStatus(`نماهای مرتبط (نقشه، نمودار و جدول) برای «${v.nameFa}» همگام‌سازی شدند.`);
              }}
              className={`px-2.5 py-1.5 rounded-[8px] font-bold cursor-pointer ${
                selectedHoodKey === k ? 'bg-[var(--color-brand-600)] text-white' : 'bg-white dark:bg-[var(--color-bg-surface)] border border-[#DCE3DF] dark:border-[var(--color-border-strong)]'
              }`}
            >
              {v.nameFa}
            </button>
          ))}
        </div>
      </div>

      {/* Section 6 & 8: Honest KPI Card + Percentiles (P10, P25, P50, P75, P90, IQR) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--color-brand-600)] dark:text-emerald-400">
              {primaryMetric.titleFa} ({primaryMetric.methodologyVersion})
            </span>
            <span className="font-bold text-[#34433E] dark:text-[var(--color-text-secondary)]">وضعیت کفایت: {sufficiency.status}</span>
          </div>
          <div className="text-xl font-bold text-[#182522] dark:text-white tabular-nums">
            {dist.p50Median !== null ? `${toPersianNum(dist.p50Median)} ${primaryMetric.unitFa}` : 'داده ناموجود'}
          </div>
          <div className="text-[11px] text-[#586760] tabular-nums">
            بر اساس <strong>{toPersianNum(hood.sampleCount)} آگهی یکتا</strong> · نوع داده: <strong>قیمت پیشنهادی آگهی (Asking Price)</strong> · تغییر مطلق: <strong>+{toPersianNum(7)} میلیون تومان (+{toPersianNum(3.8)}٪ نسبت به شهریور ۱۴۰۵)</strong>
          </div>
          <div className="text-[11px] text-[#586760]">
            تاریخ داده: <strong>مهر ۱۴۰۵</strong> · تاریخ انتشار گزارش: <strong>آبان ۱۴۰۵</strong> · منبع: {primaryMetric.sourceTitleFa}
          </div>
          {sufficiency.warningFa && (
            <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold">
              {sufficiency.warningFa}
            </div>
          )}
        </div>

        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] space-y-2.5">
          <h3 className="text-sm font-bold text-[#182522] dark:text-white flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>توزیع صدک‌ها و نمودار جعبه‌ای (Box Plot & IQR)</span>
          </h3>
          <p className="text-[11px] font-semibold text-[var(--color-brand-700)] dark:text-emerald-300">{BOX_PLOT_PLAIN_GUIDE_FA}</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center tabular-nums">
            {[
              { label: 'P10', val: dist.p10 },
              { label: 'P25 (Q1)', val: dist.p25 },
              { label: 'P50 (میانه)', val: dist.p50Median },
              { label: 'P75 (Q3)', val: dist.p75 },
              { label: 'P90', val: dist.p90 },
              { label: 'IQR', val: dist.iqrP75MinusP25 },
            ].map((cell) => (
              <div key={cell.label} className="p-2 rounded bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)]">
                <div className="text-[10px] text-[#586760] font-bold">{cell.label}</div>
                <div className="font-bold text-[#182522] dark:text-white">{cell.val !== null ? toPersianNum(cell.val) : '—'}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[#586760] tabular-nums">
            میانگین حسابی: <strong>{dist.mean !== null ? `${toPersianNum(dist.mean)} میلیون تومان` : '—'}</strong> · دامنه میان‌چارکی (P75−P25): <strong>{dist.iqrP75MinusP25 !== null ? `${toPersianNum(dist.iqrP75MinusP25)} میلیون تومان` : '—'}</strong>
          </div>
        </div>
      </div>

      {/* Section 9, 10, 30.3 & 35: Chart Selector + Missing Data Time Series Table + Homogeneity Guard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] space-y-2.5">
          <h3 className="text-sm font-bold text-[#182522] dark:text-white flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>سری زمانی با حفظ گسست داده مفقود (عدم تبدیل Null به صفر)</span>
          </h3>
          <table className="w-full text-right border-collapse tabular-nums">
            <caption className="sr-only">جدول روند ماهانه میانه قیمت پیشنهادی با نمایش صریح ماه‌های فاقد داده</caption>
            <thead>
              <tr className="border-b border-[#DCE3DF] dark:border-[var(--color-border-strong)] text-[#586760]">
                <th scope="col" className="py-1">دوره ماهانه</th>
                <th scope="col" className="py-1">میانه قیمت پیشنهادی</th>
                <th scope="col" className="py-1">وضعیت نقطه در نمودار خطی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF]/60 dark:divide-[var(--color-border-subtle)]">
              {hood.timeSeries.map((pt) => (
                <tr key={pt.monthFa}>
                  <td className="py-1.5 font-bold">{pt.monthFa}</td>
                  <td className="py-1.5">{pt.medianM !== null ? `${toPersianNum(pt.medianM)} میلیون تومان` : 'داده ناموجود (Null)'}</td>
                  <td className="py-1.5">{pt.medianM !== null ? 'نقطه معتبر' : 'گسست خط (بدون اتصال ساختگی)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] space-y-2.5">
          <h3 className="text-sm font-bold text-[#182522] dark:text-white flex items-center gap-1.5">
            <GitCompare className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>انتخابگر نمودار (ONS) و نگهبان هم‌جنس بودن مقایسه (بند ۳۰.۳)</span>
          </h3>
          <div>
            <label htmlFor="analytical-question-select" className="block font-bold mb-1">سؤال تحلیلی کاربر:</label>
            <select
              id="analytical-question-select"
              value={questionKind}
              onChange={(e) => setQuestionKind(e.target.value as AnalyticalQuestionKind)}
              className="w-full p-2 rounded-[8px] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] font-bold"
            >
              <option value="temporal_trend">روند قیمت در طول زمان (Line Chart)</option>
              <option value="category_comparison">مقایسه قیمت مناطق با برچسب فارسی (Horizontal Bar — محور از صفر)</option>
              <option value="multi_group_distribution">مقایسه پراکندگی و چارک‌های چند محله (Box Plot)</option>
              <option value="estimate_with_range">نمایش برآورد مرکزی همراه با دامنه عدم‌قطعیت (Dot Plot with Range)</option>
              <option value="spatial_area_rate">الگوی جغرافیایی شاخص محله‌ها (Choropleth Map)</option>
            </select>
          </div>
          <div className="p-2 rounded bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)]">
            نمودار پیشنهادی: <strong>{chartRec.recommendedChart}</strong> · شروع محور از صفر: <strong>{chartRec.yAxisMustStartAtZero ? 'بله (الزامی)' : 'خیر'}</strong> · {chartRec.rationaleFa}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">آزمون مقایسه با سری دوم:</span>
            <button type="button" data-testid="compare-homogeneous-btn" onClick={() => setCompareOriginB('asking_price')} className={`px-2 py-1 rounded font-bold cursor-pointer ${compareOriginB === 'asking_price' ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)]'}`}>قیمت آگهی (هم‌جنس)</button>
            <button type="button" data-testid="compare-heterogeneous-btn" onClick={() => setCompareOriginB('transaction_price')} className={`px-2 py-1 rounded font-bold cursor-pointer ${compareOriginB === 'transaction_price' ? 'bg-rose-700 text-white' : 'bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)]'}`}>قیمت معامله (نامتجانس)</button>
          </div>
          <div className="font-bold text-[#182522] dark:text-white" data-testid="comparison-homogeneity-verdict">
            نتیجه اعتبارسنجی مقایسه: {homogeneity.reasonFa}
          </div>
        </div>
      </div>
    </div>
  );
};

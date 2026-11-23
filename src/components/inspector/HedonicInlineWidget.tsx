import React, { useState, useDeferredValue, useEffect, useRef } from 'react';
import {
  normalizeFinancialInput,
  validateAndScaleTomanInput,
  formatMillionToVerbalPersian,
} from '../../utils/persianFinancials';
import {
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { NumericDraftInput } from '../ui/NumericDraftInput';
import {
  evaluateHedonicModelSync,
  type HedonicEstimationRequest,
  type HedonicEstimationResponse,
} from '../../workers/hedonicEstimator.worker';

export interface HedonicInlineWidgetProps {
  hoodNameFa: string;
  hoodBasePricePerSqmMillion: number;
  districtTier?: 'NORTH_LUXURY' | 'CENTRAL_BALANCED' | 'SOUTH_HIGH_YIELD';
}

export const HedonicInlineWidget: React.FC<HedonicInlineWidgetProps> = ({
  hoodNameFa,
  hoodBasePricePerSqmMillion,
  districtTier = 'CENTRAL_BALANCED',
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  // Immediate 60fps UI State [RULE-04]
  const [areaSqm, setAreaSqm] = useState<number>(100);
  const [buildingAgeYears, setBuildingAgeYears] = useState<number>(7);
  const [bedrooms, setBedrooms] = useState<number>(2);
  const [floorNumber, setFloorNumber] = useState<number>(3);
  const [hasParking, setHasParking] = useState<boolean>(true);
  const [hasElevator, setHasElevator] = useState<boolean>(true);
  const [hasStorage, setHasStorage] = useState<boolean>(true);
  const [isSunlitSouthFacing, setIsSunlitSouthFacing] = useState<boolean>(false);
  const [depositShareRatio, setDepositShareRatio] = useState<number>(0.5);
  const [monthlyConversionRate, setMonthlyConversionRate] = useState<number>(3.0);
  const [offeredTotalInput, setOfferedTotalInput] = useState<string>('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  // Deferred Calculation State [RULE-04]
  const deferredRequest = useDeferredValue<HedonicEstimationRequest>({
    requestId: 1,
    hoodBasePricePerSqmMillion,
    districtTier,
    areaSqm,
    buildingAgeYears,
    bedrooms,
    floorNumber,
    hasElevator,
    hasParking,
    hasStorage,
    isSunlitSouthFacing,
    depositShareRatio,
    monthlyConversionRatePercent: monthlyConversionRate,
  });

  const [estimation, setEstimation] = useState<HedonicEstimationResponse>(() =>
    evaluateHedonicModelSync(deferredRequest)
  );

  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef<number>(1);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../../workers/hedonicEstimator.worker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = (e: MessageEvent<HedonicEstimationResponse>) => {
        if (e.data && e.data.requestId === seqRef.current) setEstimation(e.data);
      };
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
      return undefined;
    }
  }, []);

  useEffect(() => {
    seqRef.current += 1;
    const payload: HedonicEstimationRequest = { ...deferredRequest, requestId: seqRef.current };
    if (workerRef.current) workerRef.current.postMessage(payload);
    else setEstimation(evaluateHedonicModelSync(payload));
  }, [deferredRequest]);

  const offeredValidation = validateAndScaleTomanInput(offeredTotalInput, 'TOTAL_BUY_PRICE');
  const fmt = new Intl.NumberFormat(radarLocale === 'en' ? 'en-US' : 'fa-IR');

  return (
    <section
      dir={radarLocale === 'en' ? 'ltr' : 'rtl'}
      data-area-unit={areaUnit}
      data-intl-currency={intlCurrency}
      aria-label={`ماشین‌حساب هدونیک ارزش‌گذاری ملک در ${hoodNameFa}`}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-4 text-slate-900 dark:text-slate-100 shadow-lg"
    >
      {/* Layer 1: Zero-State Instant Benchmark Summary [RULE-12] */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            تخمین هوشمند رادار بر اساس معاملات مشابه اخیر
          </span>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
            ارزش‌گذاری واحد {fmt.format(areaSqm)} متری ({formatAreaShort(areaSqm, areaUnit)}) در {hoodNameFa}
          </h3>
        </div>
        <div className="text-left">
          <div className="radar-tabular-num text-lg font-extrabold text-[var(--color-brand-600)] dark:text-emerald-400">
            {formatMillionToVerbalPersian(estimation.estimatedTotalMillion)} ({formatMillionTomanAsIntlCurrency(estimation.estimatedTotalMillion, intlCurrency, radarLocale)})
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            بازه اطمینان: {fmt.format(estimation.lowBandTotalMillion)} تا {fmt.format(estimation.highBandTotalMillion)} میلیون تومان
          </div>
        </div>
      </div>

      {/* Primary Quick Sliders */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
            <label htmlFor="hedonic-area-slider">متراژ بنا ({areaUnit === 'sqft' ? 'فوت مربع' : 'متر مربع'})</label>
            <span className="radar-tabular-num font-bold text-slate-900 dark:text-white">{formatAreaShort(areaSqm, areaUnit)}</span>
          </div>
          <input
            id="hedonic-area-slider"
            type="range"
            min={40}
            max={350}
            step={5}
            value={areaSqm}
            onChange={(e) => setAreaSqm(normalizeFinancialInput(e.target.value))}
            className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700 accent-emerald-500"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
            <label htmlFor="hedonic-age-slider">سن بنا ({estimation.ageRegimeLabel})</label>
            <span className="radar-tabular-num font-bold text-slate-900 dark:text-white">
              {buildingAgeYears === 0 ? 'نوساز' : `${fmt.format(buildingAgeYears)} سال`}
            </span>
          </div>
          <input
            id="hedonic-age-slider"
            type="range"
            min={0}
            max={35}
            step={1}
            value={buildingAgeYears}
            onChange={(e) => setBuildingAgeYears(normalizeFinancialInput(e.target.value))}
            className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700 accent-emerald-500"
          />
        </div>
      </div>

      {/* Progressive Disclosure Toggle for Layer 3 Deep Analysis [RULE-12] */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          className="radar-interactive-chip flex w-full items-center justify-between rounded-xl bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <span>تنظیمات دقیق واحد، تبدیل رهن و اجاره و مقایسه قیمت پیشنهادی</span>
          <span>{isAdvancedOpen ? 'بستن ▲' : 'باز کردن ▼'}</span>
        </button>
      </div>

      {isAdvancedOpen && (
        <div className="mt-4 space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'پارکینگ سندی', active: hasParking, toggle: () => setHasParking(!hasParking) },
              { label: 'آسانسور', active: hasElevator, toggle: () => setHasElevator(!hasElevator) },
              { label: 'انباری', active: hasStorage, toggle: () => setHasStorage(!hasStorage) },
              { label: 'نورگیر جنوبی', active: isSunlitSouthFacing, toggle: () => setIsSunlitSouthFacing(!isSunlitSouthFacing) },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.toggle}
                aria-pressed={item.active}
                aria-label={item.label}
                className={`radar-interactive-chip rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${item.active ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400">طبقه واحد</label>
              <NumericDraftInput aria-label="طبقه واحد" min={0} max={60} fallback={3} value={floorNumber} onValueChange={setFloorNumber} className="radar-tabular-num mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400">تعداد اتاق خواب</label>
              <NumericDraftInput aria-label="تعداد اتاق خواب" min={0} max={10} fallback={2} value={bedrooms} onValueChange={setBedrooms} className="radar-tabular-num mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white" />
            </div>
          </div>

          {/* Rahn-to-Ejareh Dynamic Slider [RULE-13] */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 p-3">
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span>تبدیل رهن و اجاره (نرخ عرف: {fmt.format(monthlyConversionRate)}٪ ماهانه)</span>
              <span className="text-[var(--color-brand-600)] dark:text-emerald-400">بازده اجاره سالانه (Cap Rate): {fmt.format(estimation.annualCapRatePercent)}٪</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">نسبت ودیعه (رهن) به اجاره</label>
                <input type="range" aria-label="نسبت ودیعه به اجاره" min={0} max={1} step={0.1} value={depositShareRatio} onChange={(e) => setDepositShareRatio(Number.parseFloat(e.target.value))} className="mt-1 h-2 w-full accent-indigo-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">نرخ تبدیل ماهانه (۱.۵٪ تا ۴٪)</label>
                <input type="range" aria-label="نرخ تبدیل ماهانه" min={1.5} max={4.0} step={0.25} value={monthlyConversionRate} onChange={(e) => setMonthlyConversionRate(Number.parseFloat(e.target.value))} className="mt-1 h-2 w-full accent-indigo-500" />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
              <span>ودیعه: {formatMillionToVerbalPersian(estimation.suggestedDepositMillion)}</span>
              <span>اجاره ماهانه: {formatMillionToVerbalPersian(estimation.suggestedMonthlyRentMillion)}</span>
            </div>
          </div>

          {/* Seller Ask Price Disambiguation [RULE-08] & [RULE-09] */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">بررسی قیمت پیشنهادی فروشنده (به میلیون تومان)</label>
            <input
              type="text"
              aria-label="قیمت پیشنهادی فروشنده به میلیون تومان"
              inputMode="decimal"
              placeholder="مثلاً ۶۵۰۰ برای ۶ میلیارد و ۵۰۰ میلیون"
              value={offeredTotalInput}
              onChange={(e) => setOfferedTotalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="radar-tabular-num mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
            <div className="mt-1 text-xs text-[var(--color-brand-600)] dark:text-emerald-400">{offeredValidation.verbalPersianText}</div>
            {offeredValidation.warningMessage && (
              <div className="mt-1 flex items-center justify-between rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                <span>{offeredValidation.warningMessage}</span>
                <button type="button" onClick={() => setOfferedTotalInput(String(offeredValidation.normalizedMillionValue * 1000))} aria-label="اصلاح قیمت به میلیارد تومان" className="rounded bg-amber-500 px-2 py-0.5 font-bold text-slate-950 cursor-pointer">
                  اصلاح به میلیارد
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

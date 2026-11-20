import React, { useState, useMemo } from 'react';
import { Compass, Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Building2, KeyRound, TrendingUp, X } from 'lucide-react';
import { EvaluatedNeighborhood, WORK_HUBS, WorkHub, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { recordDiagnosticEvent } from '../utils/security';
import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { useDialogFocus } from './useDialogFocus';
import { compareEvaluatedNeighborhoodsForSuggestion, explainNeighborhoodRecommendation } from './useEvaluatedNeighborhoods';
import { NumericDraftInput } from './ui/NumericDraftInput';

export interface OnboardingWizardModalProps {
  open: boolean; onClose: (selectedFromWizard?: EvaluatedNeighborhood) => void; evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy'; setMode: (mode: 'rent' | 'buy') => void; deposit: number; setDeposit: (v: number) => void;
  monthlyRent: number; setMonthlyRent: (v: number) => void; buyTotalBudget: number; setBuyTotalBudget: (v: number) => void;
  targetSqm: number; setTargetSqm: (v: number) => void; workHubId: string; setWorkHubId: (v: string) => void;
  buildingAgeSegment: 'new' | 'mid' | 'older'; setBuildingAgeSegment: (v: 'new' | 'mid' | 'older') => void;
  deductTenantRahnInBuy: boolean; setDeductTenantRahnInBuy: (v: boolean) => void;
  useLoanBooster: boolean; setUseLoanBooster: (v: boolean) => void; workHubs?: WorkHub[];
}

export function OnboardingWizardModal({
  open, onClose, evaluatedNeighborhoods, mode, setMode, deposit, setDeposit, monthlyRent, setMonthlyRent,
  buyTotalBudget, setBuyTotalBudget, targetSqm, setTargetSqm, workHubId, setWorkHubId, buildingAgeSegment,
  setBuildingAgeSegment, deductTenantRahnInBuy, setDeductTenantRahnInBuy, useLoanBooster, setUseLoanBooster,
  workHubs = WORK_HUBS,
}: OnboardingWizardModalProps): React.ReactElement | null {
  const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale();
  const showIntl = currency !== 'IRT'; const [step, setStep] = useState<1 | 2 | 3>(1);
  const isEn = locale === 'en';
  const dialogRef = useDialogFocus(open, () => onClose());

  const greenNeighborhoods = useMemo(() => evaluatedNeighborhoods.filter((n) => n.status === 'green'), [evaluatedNeighborhoods]);
  const rankedGreenNeighborhoods = useMemo(
    () => [...greenNeighborhoods].sort((a, b) => compareEvaluatedNeighborhoodsForSuggestion(a, b, { mode, suggestSortBy: 'score', suggestPriority: 'balanced' })),
    [greenNeighborhoods, mode],
  );
  const bestNeighborhood = rankedGreenNeighborhoods[0] || evaluatedNeighborhoods[0] || null;

  const rentAgeMultiplier = buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.9 : 0.8;
  const buyAgeMultiplier = buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.88 : 0.76;
  const effectiveBuyPowerMillion = Math.round((buyTotalBudget + (useLoanBooster ? 1200 : 0)) / (deductTenantRahnInBuy ? 0.72 : 1.0));
  const combinedRahnEquivalent = deposit + Math.round((monthlyRent * 100) / 3) + (useLoanBooster ? 400 : 0);

  if (!open) return null;

  const handleFinish = (targetHood?: EvaluatedNeighborhood) => {
    const chosen = targetHood || bestNeighborhood || undefined;
    recordDiagnosticEvent('OnboardingWizard', `Completed onboarding wizard. Best hood: ${chosen?.name || 'none'}`, 'success');
    onClose(chosen);
  };
  const handleSkip = () => {
    recordDiagnosticEvent('OnboardingWizard', 'Skipped onboarding wizard', 'fallback');
    onClose();
  };

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} role="dialog" aria-modal="true" aria-labelledby="onboarding-wizard-title" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl flex flex-col overflow-hidden max-h-[92vh] focus:outline-none shadow-2xl">
        <div className="px-6 py-4 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0"><Compass className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="onboarding-wizard-title" className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  {isEn ? 'Smart Housing Radar Setup' : 'تنظیم سریع رادار مسکن هوشمند'}
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {isEn ? 'Wizard' : 'راهنمای ورود'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isEn ? 'Discover matching neighborhoods in 3 quick steps' : 'در ۳ گام، محله‌های همخوان با فرض بودجه و اولویت خود را بررسی کنید'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" onClick={handleSkip} aria-label={isEn ? 'Close' : 'بستن راهنما'} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/70 dark:border-slate-800 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 w-full">
            {[
              { num: 1, labelFa: 'هدف و متراژ', labelEn: 'Goal & Area' },
              { num: 2, labelFa: 'بودجه و اهرم‌ها', labelEn: 'Budget & Leverage' },
              { num: 3, labelFa: 'سبک زندگی و نتیجه', labelEn: 'Lifestyle & Match' },
            ].map((s) => (
              <button key={s.num} type="button" onClick={() => setStep(s.num as 1 | 2 | 3)} className={`flex items-center gap-2 text-xs font-bold transition cursor-pointer ${step === s.num ? 'text-emerald-700 dark:text-emerald-400' : step > s.num ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition ${step === s.num ? 'bg-emerald-600 text-white shadow-xs' : step > s.num ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{toPersianNum(s.num)}</div>
                <span className="hidden sm:inline">{isEn ? s.labelEn : s.labelFa}</span>
              </button>
            ))}
          </div>
          <div className="shrink-0 flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-400 font-bold px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs" title="وضعیت سبز صرفاً نشان‌دهنده همخوانی با فرض بودجه فعلی است، نه برتری مطلق کیفی محله">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{toPersianNum(greenNeighborhoods.length)} {isEn ? 'Within Budget' : 'محله همخوان با بودجه (سبز)'}</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 dark:text-slate-200">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">{isEn ? '1. What is your primary objective?' : '۱. تصمیم اصلی شما در این مقطع چیست؟'}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setMode('buy')} className={`p-4 rounded-2xl border-2 text-right transition flex flex-col gap-1 cursor-pointer ${mode === 'buy' ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-xs' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />{isEn ? 'Buy & Investment' : 'خرید مسکن یا سرمایه‌گذاری'}</span>
                      {mode === 'buy' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{isEn ? 'Total price, mortgage, building age' : 'محاسبه قیمت کل، سن بنا، کسر رهن مستأجر و وام'}</span>
                  </button>
                  <button type="button" onClick={() => setMode('rent')} className={`p-4 rounded-2xl border-2 text-right transition flex flex-col gap-1 cursor-pointer ${mode === 'rent' ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-xs' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />{isEn ? 'Rent & Deposit' : 'رهن و اجاره خانه'}</span>
                      {mode === 'rent' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{isEn ? 'Convert deposit to monthly rent with 3% formula' : 'تنظیم هم‌زمان ودیعه و اجاره ماهانه با فرمول عرف ۳٪'}</span>
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">{isEn ? 'Target Area:' : 'متراژ دلخواه شما:'}</span>
                  <div className="flex items-center gap-2">
                    <NumericDraftInput aria-label={isEn ? 'Target area' : 'متراژ دلخواه'} min={30} max={400} fallback={80} value={targetSqm} onValueChange={setTargetSqm} className="w-20 px-2 py-1 text-center font-bold text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:outline-hidden" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">{areaUnit === 'sqft' ? formatAreaShort(targetSqm, 'sqft') : `${toPersianNum(targetSqm)} متر`}</span>
                  </div>
                </div>
                <input type="range" aria-label={isEn ? 'Target area slider' : 'اسلایدر متراژ دلخواه'} min={30} max={400} step={5} value={targetSqm} onChange={(e) => setTargetSqm(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700">
                  <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">{isEn ? 'Target Building Age:' : 'سن بنای هدف:'}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 'new' as const, label: 'نوساز (۰ تا ۵ سال)' },
                      { id: 'mid' as const, label: `۶ تا ۱۵ سال (${mode === 'rent' ? '-۱۰٪' : '-۱۲٪'})` },
                      { id: 'older' as const, label: `۱۵+ سال (${mode === 'rent' ? '-۲۰٪' : '-۲۴٪'})` },
                    ]).map((seg) => (
                      <button key={seg.id} type="button" onClick={() => setBuildingAgeSegment(seg.id)} className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${buildingAgeSegment === seg.id ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
                        {seg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {mode === 'buy' ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">{isEn ? 'Cash Budget (Million):' : 'کل بودجه نقدی در دسترس شما:'}</span>
                      <NumericDraftInput aria-label={isEn ? 'Cash budget' : 'بودجه نقدی خرید'} min={500} max={150000} step={500} fallback={10500} value={buyTotalBudget} onValueChange={setBuyTotalBudget} className="w-28 px-2 py-1 text-center font-bold text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:outline-hidden" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[2500, 3500, 5000, 10000, 20000].map((preset) => (
                        <button key={preset} type="button" onClick={() => setBuyTotalBudget(preset)} className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition ${buyTotalBudget === preset ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>{preset >= 1000 ? `${toPersianNum(preset / 1000)}B` : `${toPersianNum(preset)}M`} {showIntl && `(${formatMillionTomanAsIntlCurrency(preset, currency, locale)})`}</button>
                      ))}
                    </div>
                    <input type="range" aria-label={isEn ? 'Cash budget slider' : 'اسلایدر بودجه نقدی خرید'} min={500} max={150000} step={500} value={buyTotalBudget} onChange={(e) => setBuyTotalBudget(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                  </div>
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 space-y-2.5">
                    <label className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 cursor-pointer">
                      <input type="checkbox" aria-label={isEn ? 'Deduct tenant deposit' : 'کسر خودکار رهن به مستأجر'} checked={deductTenantRahnInBuy} onChange={(e) => setDeductTenantRahnInBuy(e.target.checked)} className="mt-0.5 rounded text-emerald-600" />
                      <div className="text-xs"><strong className="text-slate-900 dark:text-white block font-bold">{isEn ? 'Tenant Deposit Deduction' : 'کسر خودکار رهن به مستأجر + ۱۰٪ تنفس سند'}</strong></div>
                    </label>
                    <label className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 cursor-pointer">
                      <input type="checkbox" aria-label={isEn ? 'Enable housing loan' : 'محاسبه با وام مسکن جعاله'} checked={useLoanBooster} onChange={(e) => setUseLoanBooster(e.target.checked)} className="mt-0.5 rounded text-emerald-600" />
                      <div className="text-xs"><strong className="text-slate-900 dark:text-white block font-bold">{isEn ? 'Housing Loan (+1.2B Toman)' : 'محاسبه با وام مسکن جعاله (+۱.۲ میلیارد تومان)'}</strong></div>
                    </label>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-emerald-200/80 dark:border-emerald-800">
                      <span>{isEn ? 'Effective Purchasing Power:' : 'قدرت خرید مؤثر با اهرم‌ها:'}</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(effectiveBuyPowerMillion)} م{showIntl && ` (${formatMillionTomanAsIntlCurrency(effectiveBuyPowerMillion, currency, locale)})`}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        {isEn ? 'Available Deposit:' : 'ودیعه در دسترس (پیش):'}
                        {showIntl && <span className="font-normal text-[10px] text-emerald-700 dark:text-emerald-400 block" dir="ltr">{formatMillionTomanAsIntlCurrency(deposit, currency, locale)}</span>}
                      </span>
                      <NumericDraftInput aria-label={isEn ? 'Available deposit' : 'ودیعه در دسترس'} min={50} max={15000} step={50} fallback={500} value={deposit} onValueChange={setDeposit} className="w-24 px-2 py-1 text-center font-bold text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:outline-hidden" />
                    </div>
                    <input type="range" aria-label={isEn ? 'Available deposit slider' : 'اسلایدر ودیعه در دسترس'} min={50} max={15000} step={50} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        {isEn ? 'Monthly Rent Budget (Million):' : 'اجاره ماهانه قابل پرداخت (میلیون تومان):'}
                        {showIntl && <span className="font-normal text-[10px] text-emerald-700 dark:text-emerald-400 block" dir="ltr">{formatMillionTomanAsIntlCurrency(monthlyRent, currency, locale)}</span>}
                      </span>
                      <NumericDraftInput aria-label={isEn ? 'Monthly rent budget' : 'اجاره ماهانه قابل پرداخت'} min={0} max={300} step={1} fallback={0} value={monthlyRent} onValueChange={setMonthlyRent} className="w-24 px-2 py-1 text-center font-bold text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:outline-hidden" />
                    </div>
                    <input type="range" aria-label={isEn ? 'Monthly rent slider' : 'اسلایدر اجاره ماهانه'} min={0} max={300} step={1} value={monthlyRent} onChange={(e) => setMonthlyRent(Number(e.target.value))} className="w-full accent-teal-600 cursor-pointer" />
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-700">
                      <span>{isEn ? 'Combined Full-Rahn Power (3% rate):' : 'قدرت رهن کامل ترکیبی (نرخ معادل‌سازی ۳٪):'}</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(combinedRahnEquivalent)} م{showIntl && ` (${formatMillionTomanAsIntlCurrency(combinedRahnEquivalent, currency, locale)})`}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-700">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">{isEn ? 'Primary Work / Commute Hub:' : 'قطب محل کار یا تردد روزانه شما:'}</label>
                  <select aria-label={isEn ? 'Work hub' : 'انتخاب قطب محل کار'} value={workHubId} onChange={(e) => setWorkHubId(e.target.value)} className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-emerald-600 focus:outline-none">
                    {workHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5 text-xs">
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {isEn ? `Within-Budget Neighborhoods (${toPersianNum(rankedGreenNeighborhoods.length)}):` : `محله‌های همخوان با فرض بودجه فعلی (${toPersianNum(rankedGreenNeighborhoods.length)} محله):`}
                  </span>
                  <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    سبز مالی = همخوان با بودجه · ★ = میانگین هم‌وزن ۶ سنجه زیرساختی
                  </span>
                </div>
                {rankedGreenNeighborhoods.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rankedGreenNeighborhoods.slice(0, 4).map((hood, idx) => {
                      const effectiveRahn = Math.round(hood.rahn80m * (targetSqm / 80) * rentAgeMultiplier);
                      const uBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
                      const uDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm, areaUnit);
                      const explain = explainNeighborhoodRecommendation(hood, { mode, topReferenceScore: rankedGreenNeighborhoods[0]?.overallScore });
                      return (
                        <button key={hood.id} type="button" onClick={() => handleFinish(hood)} aria-label={isEn ? `Select ${hood.name}` : `انتخاب محله ${hood.name}`} className="p-2.5 rounded-xl text-start w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition cursor-pointer flex flex-col justify-between gap-1.5">
                          <div className="flex items-center justify-between w-full gap-1">
                            <strong className="text-xs font-black text-slate-900 dark:text-white">🟢 {hood.name}</strong>
                            <div className="flex items-center gap-1">
                              {idx > 0 && explain.isTieBandWithTop && (
                                <span className="text-[9.5px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded">هم‌تراز ±۰.۳</span>
                              )}
                              <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800" title={explain.scoreSemanticsLabelFa}>
                                ★ {toPersianNum(hood.overallScore)}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">{mode === 'buy' ? `متری ${toPersianNum(uBuy)} م (معامله v6.4: ${toPersianNum(uDeal)} م)${showIntl ? ` (${formatMillionTomanAsIntlCurrency(uBuy, currency, locale)})` : ''}` : `رهن: ${toPersianNum(effectiveRahn)} م`}</span>
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-1">{explain.tradeOffSummaryFa}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
                    {isEn ? 'No fully matched neighborhoods found. Try adjusting budget or area.' : 'با این فرض بودجه در محله‌های انتخابی گزینه همخوان (سبز) یافت نشد. توصیه می‌کنیم متراژ، ودیعه/اجاره یا وام را کمی تعدیل کنید.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer">
              <ArrowRight className="w-4 h-4" /> <span>{isEn ? 'Back' : 'مرحله قبلی'}</span>
            </button>
          ) : (
            <button type="button" onClick={handleSkip} className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 transition cursor-pointer">{isEn ? 'Skip' : 'رد شدن و ورود مستقیم'}</button>
          )}
          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button type="button" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition cursor-pointer">
                <span>{isEn ? 'Next' : 'ادامه'}</span> <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={() => handleFinish()} className="flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 rounded-[10px] shadow-xs transition cursor-pointer">
                <Sparkles className="w-4 h-4 stroke-[1.75]" /> <span>{isEn ? 'Explore on Map' : 'شروع کاوش هوشمند روی نقشه'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
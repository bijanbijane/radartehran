import React, { useState, useMemo, useEffect } from 'react';
import {
  Brain, ShieldCheck, TrendingUp, AlertTriangle, Scale,
  Gauge, Activity, ArrowRight, CheckCircle2, Sliders, X,
} from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { useDialogFocus } from './useDialogFocus';

export interface CasperDecisionSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  userBudgetMillion?: number;
}

type DilemmaId = 'budget_funnel' | 'rent_vs_buy' | 'macro_stress';
type MacroScenario = 'currency_shock' | 'stagflation_freeze' | 'equilibrium';

export function CasperDecisionSuiteModal({
  isOpen, onClose, selectedHood, evaluatedNeighborhoods, onSelectNeighborhood, userBudgetMillion = 9500,
}: CasperDecisionSuiteModalProps) {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [activeDilemma, setActiveDilemma] = useState<DilemmaId>('macro_stress');
  const [scenario, setScenario] = useState<MacroScenario>('currency_shock');
  const [simulatedBudget, setSimulatedBudget] = useState<number>(userBudgetMillion);
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();

  useEffect(() => {
    if (isOpen && userBudgetMillion > 0) {
      setSimulatedBudget(userBudgetMillion);
    }
  }, [isOpen, userBudgetMillion]);

  // 1. Counterfactual Macro Stress Simulator Calculations
  const stressMetrics = useMemo(() => {
    const baseDealPrice = selectedHood.buyPerSqm * 0.92;
    const baseLiquidityDays = selectedHood.status === 'green' ? 28 : selectedHood.status === 'yellow' ? 55 : 95;

    if (scenario === 'currency_shock') {
      return {
        scenarioName: 'شوک جهش ۳۰٪ ارز',
        priceEffectToman: '+۱۸٪ تا +۲۲٪ (چسبندگی اولیه قیمت اسمی)',
        dealPriceProjected: Math.round(baseDealPrice * 1.20),
        liquidityDaysProjected: Math.round(baseLiquidityDays * 1.35),
        liquidityStatus: 'کاهش موقت نقدشوندگی به دلیل گپ انتظار خریدار و فروشنده',
        safetyMargin: 'بالا — حفظ ارزش سرمایه در برابر تورم',
        buyerVerdict: 'شکار در موج اول پیش از تعدیل برچسب قیمت فروشندگان',
      };
    }
    if (scenario === 'stagflation_freeze') {
      return {
        scenarioName: 'رکود انجمادی ۲ ساله مسکن',
        priceEffectToman: '-۸٪ تا -۱۴٪ تخفیف واقعی پای قرارداد',
        dealPriceProjected: Math.round(baseDealPrice * 0.90),
        liquidityDaysProjected: Math.round(baseLiquidityDays * 2.2),
        liquidityStatus: 'انجماد شدید — خروج دشوار بدون تخفیف تهاجمی',
        safetyMargin: 'متوسط — نیاز به نقدینگی ذخیره',
        buyerVerdict: 'چانه‌زنی تهاجمی پای میز؛ خریدار برنده مطلق است',
      };
    }
    return {
      scenarioName: 'ثبات تعادلی و بازدهی اجاره',
      priceEffectToman: '+۵٪ همگام با تورم عمومی',
      dealPriceProjected: Math.round(baseDealPrice * 1.05),
      liquidityDaysProjected: baseLiquidityDays,
      liquidityStatus: 'تعادل نرمال بازار — معامله ظرف ۳۰ الی ۴۵ روز',
      safetyMargin: 'پایدار و کم‌ریسک',
      buyerVerdict: 'ورود مطمئن بر اساس کیفیت زندگی و دسترسی به مترو',
    };
  }, [scenario, selectedHood]);

  // 2. Budget Funnel Optimal Neighborhoods
  const optimalBudgetHoods = useMemo(() => {
    return evaluatedNeighborhoods
      .filter((h) => (h.buyPerSqm * 80) <= simulatedBudget * 1.15)
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 3);
  }, [evaluatedNeighborhoods, simulatedBudget]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-lg animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="casper-modal-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] shadow-xl p-5 space-y-4 text-[var(--color-text-primary)] outline-none"
      >
        {/* Header with Epistemic Badge */}
        <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand-600)] dark:bg-[var(--color-brand-soft)] dark:text-[var(--color-brand-fg)]">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="casper-modal-title" className="text-base font-bold text-[var(--color-text-primary)]">دستیار تصمیم‌گیری هوشمند مسکن</h3>
                <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[var(--color-brand-soft)] text-[var(--color-brand-700)] dark:bg-[var(--color-brand-soft)] dark:text-[var(--color-brand-fg)]">تحلیل سناریوی معامله</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[var(--color-text-muted)] mt-0.5">آزمون فرضیات، شبیه‌سازی استرس رکود و خنثی‌سازی خطاهای شناختی</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-[var(--color-text-primary)] transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Dilemma Tabs */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[var(--color-bg-muted)] text-xs font-bold">
          <button type="button" onClick={() => setActiveDilemma('macro_stress')} className={`flex-1 py-2 px-2 rounded-lg transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${activeDilemma === 'macro_stress' ? 'bg-white dark:bg-[var(--color-bg-surface)] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-600 dark:text-[var(--color-text-muted)]'}`}>
            <Activity className="w-3.5 h-3.5" />
            <span>آزمون استرس کلان</span>
          </button>
          <button type="button" onClick={() => setActiveDilemma('rent_vs_buy')} className={`flex-1 py-2 px-2 rounded-lg transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${activeDilemma === 'rent_vs_buy' ? 'bg-white dark:bg-[var(--color-bg-surface)] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-600 dark:text-[var(--color-text-muted)]'}`}>
            <Scale className="w-3.5 h-3.5" />
            <span>رهن در برابر خرید</span>
          </button>
          <button type="button" onClick={() => setActiveDilemma('budget_funnel')} className={`flex-1 py-2 px-2 rounded-lg transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${activeDilemma === 'budget_funnel' ? 'bg-white dark:bg-[var(--color-bg-surface)] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-600 dark:text-[var(--color-text-muted)]'}`}>
            <Gauge className="w-3.5 h-3.5" />
            <span>مسیریاب بهینه بودجه</span>
          </button>
        </div>

        {/* Tab 1: Counterfactual Macro Stress */}
        {activeDilemma === 'macro_stress' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">محله مورد آزمون: <strong>{selectedHood.name}</strong></span>
              <span className="text-[11px] text-slate-500">پایه معامله فعلی: {toPersianNum(Math.round(selectedHood.buyPerSqm * 0.92))} م/م²</span>
            </div>

            {/* Scenario Toggles */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'currency_shock' as const, label: 'جهش ۳۰٪ دلار', desc: 'تورم انتظاری' },
                { id: 'stagflation_freeze' as const, label: 'رکود انجمادی مسکن', desc: 'افت قدرت خرید' },
                { id: 'equilibrium' as const, label: 'ثبات تعادلی', desc: 'روند ارگانیک' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenario(s.id)}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${scenario === s.id ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-[var(--color-border-subtle)] bg-slate-50 dark:bg-[var(--color-bg-muted)] text-slate-700 dark:text-[var(--color-text-secondary)]'}`}
                >
                  <div className="text-xs font-bold">{s.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>

            {/* Simulated Stress Report Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200/80 dark:border-[var(--color-border-strong)] space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-900 dark:text-white">نتیجه شبیه‌سازی در سناریوی {stressMetrics.scenarioName}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10.5px]">تست استرس قیمت</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs tabular-nums">
                <div className="p-2.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-100 dark:border-[var(--color-border-subtle)]">
                  <div className="text-[10px] text-slate-500">قیمت تخمینی پای قرارداد</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">متری {toPersianNum(stressMetrics.dealPriceProjected)} م</div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400">{stressMetrics.priceEffectToman}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-100 dark:border-[var(--color-border-subtle)]">
                  <div className="text-[10px] text-slate-500">سرعت خروج و زمان نقدشوندگی</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">~ {toPersianNum(stressMetrics.liquidityDaysProjected)} روز</div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400">{stressMetrics.safetyMargin}</div>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 text-[11px] text-indigo-950 dark:text-indigo-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> حکم استراتژیک برای خریدار:</div>
                <p className="leading-relaxed">{stressMetrics.buyerVerdict}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Rent vs Buy Epistemic Arbitrage */}
        {activeDilemma === 'rent_vs_buy' && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200/80 dark:border-[var(--color-border-strong)] space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>مدل بی‌تفاوتی سرمایه در {selectedHood.name} (واحد ۸۰ متری)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs tabular-nums">
              <div className="p-3 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200/70 dark:border-[var(--color-border-subtle)] space-y-1">
                <div className="text-[11px] font-bold text-slate-500">گزینه ۱: خرید مستقیم سنددار</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{toPersianNum(((selectedHood.buyPerSqm * 80) / 1000).toFixed(2))} میلیارد تومان</div>
                <div className="text-[10px] text-[var(--color-brand-600)]">مصونیت کامل در برابر تورم زمین</div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200/70 dark:border-[var(--color-border-subtle)] space-y-1">
                <div className="text-[11px] font-bold text-slate-500">گزینه ۲: رهن کامل + آربیتراژ</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{toPersianNum(selectedHood.rahn80m)} میلیون رهن</div>
                <div className="text-[10px] text-indigo-600">نقدینگی آزاد برای سپرده یا طلا</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed bg-white/70 dark:bg-[var(--color-bg-surface)] p-3 rounded-lg border border-slate-200/50 dark:border-[var(--color-border-subtle)]">
              💡 <strong>تحلیل اقتصادسنجی رادار:</strong> نسبت رهن به خرید در این محله معادل <strong>{toPersianNum(((selectedHood.rahn80m / (selectedHood.buyPerSqm * 80)) * 100).toFixed(1))}٪</strong> است. در نسبت‌های زیر ۱۸٪، خرید قطعی ارزش مازاد بالاتری دارد.
            </div>
          </div>
        )}

        {/* Tab 3: Guided Budget Funnel */}
        {activeDilemma === 'budget_funnel' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">تنظیم بودجه نقد خریدار:</span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{toPersianNum((simulatedBudget / 1000).toFixed(1))} میلیارد تومان</span>
            </div>
            <div className="flex gap-2">
              {[4500, 7500, 10500, 16000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSimulatedBudget(b)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${simulatedBudget === b ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-[var(--color-bg-muted)] text-slate-600 dark:text-[var(--color-text-muted)]'}`}
                >
                  {toPersianNum((b / 1000).toFixed(1))} B
                </button>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-bold text-slate-500">۳ محله بهینه با بالاترین امتیاز کیفیت در بودجه شما:</div>
              {optimalBudgetHoods.map((h) => (
                <div
                  key={h.id}
                  onClick={() => { onSelectNeighborhood?.(h); onClose(); }}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200/70 dark:border-[var(--color-border-subtle)] flex items-center justify-between hover:border-indigo-400 transition cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{h.name} ({h.zone})</div>
                    <div className="text-[10px] text-slate-500 tabular-nums">متری {toPersianNum(h.buyPerSqm)} م · ۸۰م²: {toPersianNum(((h.buyPerSqm * 80) / 1000).toFixed(2))} میلیارد</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold tabular-nums">{toPersianNum(h.overallScore)}/۱۰</span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Epistemic Provenance Footer */}
        <div className="pt-2 border-t border-slate-100 dark:border-[var(--color-border-subtle)] flex items-center justify-between text-[10.5px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>منبع اعتبارسنجی: کد رهگیری قطعی + پاکسازی چارک‌های بیرونی IQR</span>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold transition cursor-pointer">
            متوجه شدم
          </button>
        </div>
      </div>
    </div>
  );
}

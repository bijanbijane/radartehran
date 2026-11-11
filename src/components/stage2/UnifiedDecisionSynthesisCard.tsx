/**
 * @file UnifiedDecisionSynthesisCard.tsx
 * @module components/stage2
 * @description CASPER Unified Decision Quality & Executive Deal Readiness Synthesis Card.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Target, Sparkles, Award, ArrowUpLeft, ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';
import { resolveNeighborhood, synthesizeExecutiveDecisionReport, UnifiedDecisionSynthesisReport } from '../../cells/decision-epistemology/unifiedDecisionSynthesisEngine';
import { type Neighborhood, toPersianNum } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface UnifiedDecisionSynthesisCardProps {
  hoodId?: number; hoodName?: string; cityKey?: string; basePriceSqm?: number;
  initialTargetSqm?: number; onTargetSqmChange?: (sqm: number) => void;
  intlCurrency?: IntlCurrencyCode; onSelectTab?: (tabId: string) => void; hood?: Neighborhood;
}

export const UnifiedDecisionSynthesisCard: React.FC<UnifiedDecisionSynthesisCardProps> = ({
  hoodId = 1, hoodName = 'پونک', cityKey = 'tehran', basePriceSqm = 120,
  initialTargetSqm = 80, onTargetSqmChange, intlCurrency = 'USD', onSelectTab, hood,
}) => {
  const [targetSqm, setTargetSqm] = useState<number>(initialTargetSqm || 80);
  const [scenarioMode, setScenarioMode] = useState<'FAIR' | 'MARKET' | 'BUBBLE' | 'CUSTOM'>('MARKET');
  const [userCustomAskingSqm, setUserCustomAskingSqm] = useState<number>(0);
  const [copiedPlaybook, setCopiedPlaybook] = useState<boolean>(false);

  useEffect(() => {
    if (initialTargetSqm && initialTargetSqm > 0) setTargetSqm(initialTargetSqm);
  }, [initialTargetSqm]);

  const resolvedHood = useMemo(() => resolveNeighborhood(cityKey, hoodId, hoodName, hood), [cityKey, hoodId, hoodName, hood]);
  const aggMetrics = useMemo(
    () => aggregateNeighborhoodMarketMetrics(hoodId, hoodName, basePriceSqm, buildNeighborhoodListingSamples(resolvedHood)),
    [hoodId, hoodName, basePriceSqm, resolvedHood],
  );
  const fairDealSqm = aggMetrics.estimatedDealPricePerSqm;

  const customAskingSqm = useMemo(() => {
    if (scenarioMode === 'CUSTOM' && userCustomAskingSqm > 0) return userCustomAskingSqm;
    if (scenarioMode === 'FAIR') return Math.round(fairDealSqm * 1.025);
    if (scenarioMode === 'BUBBLE') return Math.round(fairDealSqm * 1.18);
    return aggMetrics.askingPricePerSqm;
  }, [scenarioMode, userCustomAskingSqm, fairDealSqm, aggMetrics.askingPricePerSqm]);

  const areaOptions = useMemo(() => {
    const base = [65, 80, 100, 130];
    return base.includes(targetSqm) ? base : [...base, targetSqm].sort((a, b) => a - b);
  }, [targetSqm]);

  const report: UnifiedDecisionSynthesisReport = useMemo(
    () => synthesizeExecutiveDecisionReport(hoodId, hoodName, cityKey, fairDealSqm, customAskingSqm, targetSqm, intlCurrency, resolvedHood),
    [hoodId, hoodName, cityKey, fairDealSqm, customAskingSqm, targetSqm, intlCurrency, resolvedHood],
  );

  const scoreBadgeColors = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  };
  const badgeClass = scoreBadgeColors[report.verdictBadgeColor as keyof typeof scoreBadgeColors] || scoreBadgeColors.indigo;
  const fxTag = (valMillion: number) => intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valMillion, intlCurrency, 'fa')})` : '';
  const pb = report.executionPlaybook;

  return (
    <div data-testid="casper-unified-decision-card" className="rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3.5 text-slate-800 dark:text-slate-200" dir="rtl">
      {/* Interactive Scenario Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">متراژ هدف معامله:</span>
          {areaOptions.map((sqm) => (
            <button key={sqm} type="button" onClick={() => { setTargetSqm(sqm); onTargetSqmChange?.(sqm); }} className={`px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums transition cursor-pointer ${targetSqm === sqm ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
              {toPersianNum(sqm)} متر
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">سناریوی قیمت فروشنده:</span>
          {[
            { id: 'FAIR' as const, label: '+۲.۵٪ (منصف)' },
            { id: 'MARKET' as const, label: 'رایج آگهی' },
            { id: 'BUBBLE' as const, label: '+۱۸٪ (حبابی)' },
            { id: 'CUSTOM' as const, label: 'قیمت دلخواه...' },
          ].map((opt) => (
            <button key={opt.id} type="button" onClick={() => { setScenarioMode(opt.id); if (opt.id === 'CUSTOM' && userCustomAskingSqm === 0) setUserCustomAskingSqm(aggMetrics.askingPricePerSqm); }} className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${scenarioMode === opt.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
              {opt.label}
            </button>
          ))}
          {scenarioMode === 'CUSTOM' && (
            <div className="flex items-center gap-1">
              <input type="number" aria-label="قیمت پیشنهادی هر متر مربع به میلیون تومان" value={userCustomAskingSqm || ''} onChange={(e) => setUserCustomAskingSqm(Math.max(1, Number(e.target.value)))} placeholder="متری (م.ت)" className="w-20 px-2 py-0.5 text-[11px] font-bold rounded-md border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums" />
              <span className="text-[10px] text-slate-400">م.ت/متر</span>
            </div>
          )}
        </div>
      </div>

      {/* Executive Hero Banner */}
      <div className={`p-3.5 rounded-xl border ${badgeClass} space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 shrink-0" />
            <h4 className="text-sm font-black tracking-tight">{report.verdictTitleFa}</h4>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {report.isStagflationaryIllusion && (
              <span data-testid="synthesis-stagflation-badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[10px] font-extrabold">
                <AlertTriangle className="w-3 h-3" /><span>هشدار توهم پولی رکود تورمی</span>
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-rose-100/80 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 text-[10px] font-bold tabular-nums">
              VaR95 خروج اضطراری: -{toPersianNum(report.illiquidityAdjustedVaR95RealPct)}٪
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-current shadow-xs text-xs font-black tabular-nums">
              <span>شاخص آمادگی معامله:</span><span className="text-sm font-black">{toPersianNum(report.readinessScore)}٪</span>
            </div>
          </div>
        </div>
        <p className="text-xs leading-relaxed font-medium">{report.executiveDirectiveFa}</p>
        {report.nonCompensatoryVetoTriggered && (
          <div data-testid="synthesis-veto-banner" className="p-2 rounded-lg bg-rose-100/90 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1">
            <span className="font-extrabold flex items-center gap-1 text-[11.5px]">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>وتوی غیرجبرانی ریسک بحرانی فعال است (Non-Compensatory Veto):</span>
            </span>
            <ul className="list-disc list-inside text-[11px] font-medium leading-relaxed space-y-0.5">
              {report.vetoReasonsFa.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Negotiation Numbers & Walk-Away Ceiling */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">قیمت اعلامی فروشنده:</span>
          <strong className="text-base font-black text-slate-900 dark:text-white tabular-nums block">{toPersianNum(Math.round(report.askingPricePerSqm * report.targetSqm))} م.ت</strong>
          <span className="text-[10px] text-slate-400 tabular-nums">متری {toPersianNum(report.askingPricePerSqm)} م</span>
        </div>
        <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">ارزش قطعی مدل (v6.4):</span>
          <strong className="text-base font-black text-indigo-700 dark:text-indigo-300 tabular-nums block">{toPersianNum(Math.round(report.fairPricePerSqm * report.targetSqm))} م.ت</strong>
          <span className="text-[10px] text-slate-400 tabular-nums">متری {toPersianNum(report.fairPricePerSqm)} م{fxTag(report.fairPricePerSqm)}</span>
        </div>
        <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">پیشنهاد افتتاحیه چانه‌زنی:</span>
          <strong className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums block">{toPersianNum(report.negotiationOpeningOfferMillion)} م.ت</strong>
          <span className="text-[10px] text-slate-400 tabular-nums">تخفیف هدف: {toPersianNum(report.targetDiscountMillion)} م.ت</span>
        </div>
        <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40">
          <span className="text-[10px] text-rose-700 dark:text-rose-400 font-extrabold flex items-center gap-1"><Target className="w-3 h-3 shrink-0" /><span>سقف ترک مذاکره (خط قرمز):</span></span>
          <strong className="text-base font-black text-rose-700 dark:text-rose-300 tabular-nums block">{toPersianNum(report.walkAwayCeilingTotalMillion)} م.ت</strong>
          <span className="text-[10px] text-slate-400">بالاتر از این، معامله را متوقف کنید</span>
        </div>
      </div>

      {/* Contract-Room 3-Stage Escrow Execution Playbook & Protective Clauses */}
      <div data-testid="casper-execution-playbook-panel" className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>شیوه‌نامه اجرایی ۳مرحله‌ای اتاق قرارداد و شروط حفاظتی صیادی ({report.hoodName})</span>
          </span>
          <button
            type="button" data-testid="copy-deal-playbook-btn"
            onClick={() => {
              navigator.clipboard?.writeText(pb.copyableActionSheetFa).catch(() => {});
              setCopiedPlaybook(true);
              setTimeout(() => setCopiedPlaybook(false), 2000);
            }}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
          >
            {copiedPlaybook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPlaybook ? 'برگه اقدام کپی شد' : 'کپی برگه اقدام اتاق قرارداد'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 tabular-nums">
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-900/50">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">۱. هم‌زمان با امضا و کد رهگیری ({toPersianNum(pb.signingStagePct)}٪):</span>
            <strong className="text-xs font-black text-slate-900 dark:text-white">{toPersianNum(pb.signingStageMillion)} م.ت (چک صیادی)</strong>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-900/50">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">۲. تحویل کلید، تخلیه و صورت‌جلسه ({toPersianNum(pb.handoverStagePct)}٪):</span>
            <strong className="text-xs font-black text-slate-900 dark:text-white">{toPersianNum(pb.handoverStageMillion)} م.ت</strong>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-900/50">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">۳. انتقال قطعی سند در دفترخانه ({toPersianNum(pb.deedStagePct)}٪):</span>
            <strong className="text-xs font-black text-emerald-700 dark:text-emerald-300">{toPersianNum(pb.deedStageMillion)} م.ت</strong>
          </div>
        </div>
        <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300 list-disc list-inside leading-relaxed">
          {pb.protectiveClausesFa.map((clause, idx) => <li key={idx}>{clause}</li>)}
        </ul>
      </div>

      {/* Interactive 6-Pillar Sensitivity Matrix */}
      <div className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-600" /><span>ماتریس ۶گانه ارزیابی کیفیت تصمیم معامله در {report.hoodName}</span></span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400">برای باز کردن آزمایشگاه هر ضلع، روی کارت آن کلیک کنید ↗</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {report.pillars.map((pillar) => (
            <button
              key={pillar.id} type="button" onClick={() => onSelectTab?.(pillar.targetTabId)} aria-label={`مشاهده آزمایشگاه ${pillar.nameFa}`}
              className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-right space-y-1.5 transition cursor-pointer group"
            >
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-extrabold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center gap-1">
                  <span>{pillar.nameFa}</span><ArrowUpLeft className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 tabular-nums">وزن {toPersianNum(pillar.weightPct)}٪</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{toPersianNum(pillar.score)}٪</span>
                </div>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pillar.score >= 70 ? 'bg-emerald-500' : pillar.score >= 50 ? 'bg-indigo-500' : 'bg-amber-500'}`} style={{ width: `${pillar.score}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between tabular-nums">
                <span>وضعیت: {pillar.gradeFa}</span><span>{pillar.detailFa}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>رهنمود مهندسی کسپر:</strong> تصمیم‌گیری عقلانی در مسکن حاصل برهم‌کنش ریاضی ارزش قطعی معامله (v6.4)، نقدشوندگی، تقارن اطلاعاتی و رژیم تورم کلان است. با کلیک روی هر یک از ۶ ضلع بالا، وارد میز کار تخصصی همان مدل شوید.
        </p>
      </div>
    </div>
  );
};

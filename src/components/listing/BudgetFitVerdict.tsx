/** First-page budget ruling for the twenty dated Tehran neighborhoods. formatMillionTomanAsIntlCurrency */
import React, { useMemo, useState } from 'react';
import { toPersianNum } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import {
  HONEST_ASKING_SENTENCE_FA,
  buildBudgetFitVerdict,
  formatBudgetVerdictShareText,
  type BudgetFitLine,
} from '../../data/neighborhoodListingSamples';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { findProvinceForHood } from '../../data/iranProvincesDirectory';
import { downloadBudgetVerdictCard, renderBudgetVerdictCard } from './BudgetVerdictCardImage';

export interface BudgetFitVerdictProps {
  neighborhoods: ReadonlyArray<{ id: number; name?: string; buyPerSqm?: number; rahn80m: number }>;
  mode: 'buy' | 'rent';
  budgetMillion: number;
  targetSqm: number;
  city?: CityId;
  selectedHoodId?: number;
}

export function BudgetFitVerdict(p: BudgetFitVerdictProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const isTehran = !p.city || p.city === 'tehran';
  const activeProv = !isTehran && p.selectedHoodId !== undefined ? findProvinceForHood(p.selectedHoodId) : undefined;
  const lines = useMemo((): BudgetFitLine[] => {
    if (isTehran) return buildBudgetFitVerdict(p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm);
    const sqm = p.targetSqm > 0 ? p.targetSqm : 80;
    const provMatches = activeProv ? p.neighborhoods.filter((h) => findProvinceForHood(h.id)?.id === activeProv.id) : [];
    const pool = provMatches.length > 0 ? provMatches : p.neighborhoods;
    return pool.slice(0, 3).map((h) => {
      const ref = p.mode === 'rent' ? Math.round(h.rahn80m * (sqm / 80)) : Math.round((h.buyPerSqm ?? 45) * sqm);
      const ratio = p.budgetMillion / Math.max(1, ref);
      const fit: BudgetFitLine['fit'] = ratio >= 0.98 ? 'fits' : ratio >= 0.85 ? 'tight' : 'over';
      const fitLabelFa = fit === 'fits' ? 'جا می‌شود' : fit === 'tight' ? 'نزدیک مرز بودجه' : 'فراتر از بودجه';
      const referenceLabelFa = p.mode === 'rent' ? `مرجع رهن ${toPersianNum(sqm)} متری: ${toPersianNum(ref)} م` : `مرجع خرید ${toPersianNum(sqm)} متری: ${toPersianNum(Math.round((h.buyPerSqm ?? 45) * 10) / 10)} م/متر`;
      return { hoodId: h.id, nameFa: h.name || `محله ${h.id}`, fit, fitLabelFa, referenceLabelFa, truthFa: 'مرجع داخلی، آبان ۱۴۰۵ · ۰ معامله ثبت‌شده' };
    });
  }, [isTehran, activeProv, p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm]);
  const placeFa = !isTehran ? (activeProv?.capitalFa || findProvinceForHood(p.neighborhoods[0]?.id ?? -1)?.capitalFa || MULTI_CITY_CONFIGS[p.city!]?.nameFa || 'شهر فعال') : 'تهران';
  const shareText = formatBudgetVerdictShareText(lines, p.mode, p.budgetMillion, p.targetSqm);
  const sendCard = async () => {
    const blob = await renderBudgetVerdictCard({ lines, mode: p.mode, budgetMillion: p.budgetMillion, targetSqm: p.targetSqm });
    const file = new File([blob], 'radar-tehran-verdict.png', { type: 'image/png' });
    const payload = { title: `رادار ${placeFa}`, text: shareText, files: [file] };
    try {
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(payload)) {
        await navigator.share(payload);
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    downloadBudgetVerdictCard(blob);
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch { setCopied(false); }
  };
  return (
    <section data-testid="budget-fit-verdict" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs space-y-3">
      <div>
        <h2 className="text-base font-black text-slate-950 dark:text-white">با این بودجه، کجا جا می‌شود؟</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isTehran ? 'سه محله از بیست محلهٔ تاریخ‌دار تهران' : `سه محلهٔ نمونه در ${placeFa}`}، برای حدود {toPersianNum(Math.round(p.targetSqm || 80))} متر.</p>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.hoodId} className="rounded-xl border border-slate-200/80 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-slate-950 dark:text-white">{line.nameFa}</strong>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                line.fit === 'fits'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : line.fit === 'tight'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
              }`}>{line.fitLabelFa}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{line.referenceLabelFa}</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1">{line.truthFa}</p>
          </li>
        ))}
      </ul>
      {lines.length > 0 && lines.every((l) => l.fit === 'over') && (
        <div data-testid="budget-fit-affordability-bridge" className="rounded-xl border border-amber-200/90 bg-amber-50/80 dark:border-amber-800/70 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100 space-y-1">
          <div className="font-extrabold">💡 پل تأمین بودجه و جایگزین‌های حومه و کرج</div>
          <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            با بودجهٔ نقدی فعلی در ۲۰ محلهٔ مرکزی تاریخ‌دار تهران گزینه‌ای در محدوده نیست؛ اما با فعال‌سازی <strong>وام مسکن (+۱.۲ میلیارد) + کسر رهن مستأجر</strong> در بخش «کشف محله»، یا بررسی <strong>حومهٔ استان تهران (پرند، اندیشه، پیشوا)</strong> و کلان‌شهر <strong>کرج (گلشهر، گوهردشت)</strong> گزینه‌های متناسب در دسترس است.
          </p>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{HONEST_ASKING_SENTENCE_FA}</p>
      <button type="button" onClick={() => { void sendCard(); }} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer">
        {copied ? 'کارت ذخیره شد' : 'کارت را بفرست'}
      </button>
    </section>
  );
}

/** First-page budget ruling for the twenty dated Tehran neighborhoods. formatMillionTomanAsIntlCurrency */
import React, { useMemo, useState } from 'react';
import { toPersianNum } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import {
  HONEST_ASKING_SENTENCE_FA,
  buildBudgetFitVerdict,
  formatBudgetVerdictShareText,
} from '../../data/neighborhoodListingSamples';

export interface BudgetFitVerdictProps {
  neighborhoods: ReadonlyArray<{ id: number; rahn80m: number }>;
  mode: 'buy' | 'rent';
  budgetMillion: number;
  targetSqm: number;
  city?: CityId;
}

export function BudgetFitVerdict(p: BudgetFitVerdictProps): React.ReactElement | null {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(
    () => buildBudgetFitVerdict(p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm),
    [p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm],
  );
  if (p.city && p.city !== 'tehran') return null;
  const shareText = formatBudgetVerdictShareText(lines, p.mode, p.budgetMillion, p.targetSqm);
  const sendCard = async () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'رادار تهران', text: shareText });
        return;
      }
    } catch { /* clipboard fallback when share is dismissed or unavailable */ }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch { setCopied(false); }
  };
  return (
    <section data-testid="budget-fit-verdict" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs space-y-3">
      <div>
        <h2 className="text-base font-black text-slate-950 dark:text-white">با این بودجه، کجا جا می‌شود؟</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">سه محله از بیست محلهٔ تاریخ‌دار تهران، برای حدود {toPersianNum(Math.round(p.targetSqm || 80))} متر.</p>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.hoodId} className="rounded-xl border border-slate-200/80 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-slate-950 dark:text-white">{line.nameFa}</strong>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{line.fitLabelFa}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{line.referenceLabelFa}</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1">{line.truthFa}</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{HONEST_ASKING_SENTENCE_FA}</p>
      <button type="button" onClick={() => { void sendCard(); }} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer">
        {copied ? 'متن کارت کپی شد' : 'کارت را بفرست'}
      </button>
    </section>
  );
}

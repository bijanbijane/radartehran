/** First-page budget ruling for active-city neighborhoods. formatMillionTomanAsIntlCurrency */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import {
  HONEST_ASKING_SENTENCE_FA,
  buildBudgetFitVerdict,
  formatBudgetVerdictShareText,
  formatNeighborhoodPriceTruthFa,
  isLiveDivarBargainId,
  type BudgetFitLine,
} from '../../data/neighborhoodListingSamples';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { findProvinceForHood } from '../../data/iranProvincesDirectory';
import { downloadBudgetVerdictCard, renderBudgetVerdictCard } from './BudgetVerdictCardImage';
import { convertPricePerSqmToUnitRaw, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';

export interface BudgetFitVerdictProps {
  neighborhoods: ReadonlyArray<{ id: number; name?: string; buyPerSqm?: number; rahn80m: number; bargains?: ReadonlyArray<{ id: string }> | null }>;
  mode: 'buy' | 'rent';
  budgetMillion: number;
  targetSqm: number;
  city?: CityId;
  selectedHoodId?: number;
}

export function BudgetFitVerdict(p: BudgetFitVerdictProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const isTehran = !p.city || p.city === 'tehran';
  const activeProv = !isTehran && p.selectedHoodId !== undefined ? findProvinceForHood(p.selectedHoodId) : undefined;
  const placeFa = !isTehran ? (activeProv?.capitalFa || findProvinceForHood(p.neighborhoods[0]?.id ?? -1)?.capitalFa || MULTI_CITY_CONFIGS[p.city!]?.nameFa || 'شهر فعال') : 'تهران';

  const lines = useMemo((): BudgetFitLine[] => {
    const sqm = p.targetSqm > 0 ? p.targetSqm : 80;
    const areaLbl = formatAreaShort(Math.round(sqm), areaUnit);
    if (isTehran) {
      return buildBudgetFitVerdict(p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm).map((line) => {
        const matched = p.neighborhoods.find((h) => h.id === line.hoodId);
        const unitPrice = matched?.buyPerSqm ? Math.round(convertPricePerSqmToUnitRaw(matched.buyPerSqm, areaUnit) * 10) / 10 : undefined;
        const unitSuffix = areaUnit === 'sqft' ? 'هر ft²' : 'متری';
        const refVal = p.mode === 'rent' ? Math.round((matched?.rahn80m ?? 0) * (sqm / 80)) : Math.round((matched?.buyPerSqm ?? 0) * sqm);
        const fx = intlCurrency !== 'IRT' && refVal > 0 ? ` (${formatMillionTomanAsIntlCurrency(refVal, intlCurrency, radarLocale)})` : '';
        return {
          ...line,
          referenceLabelFa: p.mode === 'rent'
            ? `رهن حدود ${toPersianNum(refVal)} میلیون برای ${areaLbl}${fx}`
            : unitPrice
              ? `${unitSuffix} ${toPersianNum(unitPrice)} میلیون · کل حدود ${toPersianNum(refVal)} میلیون${fx}`
              : line.referenceLabelFa,
        };
      });
    }
    const provMatches = activeProv ? p.neighborhoods.filter((h) => findProvinceForHood(h.id)?.id === activeProv.id) : [];
    const pool = provMatches.length > 0 ? provMatches : p.neighborhoods;
    return pool.slice(0, 3).map((h) => {
      const ref = p.mode === 'rent' ? Math.round(h.rahn80m * (sqm / 80)) : Math.round((h.buyPerSqm ?? 45) * sqm);
      const ratio = p.budgetMillion / Math.max(1, ref);
      const fit: BudgetFitLine['fit'] = ratio >= 0.98 ? 'fits' : ratio >= 0.85 ? 'tight' : 'over';
      const fitLabelFa = fit === 'fits' ? 'جا می‌شود' : fit === 'tight' ? 'نزدیک مرز بودجه' : 'فراتر از بودجه';
      const unitBuy = Math.round(convertPricePerSqmToUnitRaw(h.buyPerSqm ?? 45, areaUnit) * 10) / 10;
      const unitLbl = areaUnit === 'sqft' ? 'هر ft²' : 'م/متر';
      const fx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(ref, intlCurrency, radarLocale)})` : '';
      const referenceLabelFa = p.mode === 'rent'
        ? `مرجع رهن ${areaLbl}: ${toPersianNum(ref)} م${fx}`
        : `مرجع خرید ${areaLbl}: ${toPersianNum(unitBuy)} ${unitLbl}${fx}`;
      const liveCount = (h.bargains || []).filter((b) => isLiveDivarBargainId(b.id)).length;
      return {
        hoodId: h.id,
        nameFa: h.name || `محله ${h.id}`,
        fit,
        fitLabelFa,
        referenceLabelFa,
        truthFa: formatNeighborhoodPriceTruthFa(h.id, liveCount, p.city ?? 'tehran', h.buyPerSqm),
      };
    });
  }, [isTehran, activeProv, p.neighborhoods, p.mode, p.budgetMillion, p.targetSqm, p.city, areaUnit, intlCurrency, radarLocale]);

  const shareText = formatBudgetVerdictShareText(lines, p.mode, p.budgetMillion, p.targetSqm, placeFa);
  const sendCard = async () => {
    const blob = await renderBudgetVerdictCard({ lines, mode: p.mode, budgetMillion: p.budgetMillion, targetSqm: p.targetSqm, placeFa });
    const file = new File([blob], 'radar-verdict.png', { type: 'image/png' });
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
    <section data-testid="budget-fit-verdict" className="bg-white dark:bg-[var(--color-bg-surface)] rounded-2xl border border-slate-200/90 dark:border-[var(--color-border-subtle)] p-4 shadow-xs space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-950 dark:text-white">با این بودجه، کجا جا می‌شود؟</h2>
        <p className="text-xs text-slate-500 dark:text-[var(--color-text-muted)] mt-1">{isTehran ? 'سه محله از بیست محلهٔ تاریخ‌دار تهران' : `سه محلهٔ نمونه در ${placeFa}`}، برای حدود {formatAreaShort(Math.round(p.targetSqm || 80), areaUnit)}.</p>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => {
          const FitIcon = line.fit === 'fits' ? CheckCircle2 : line.fit === 'tight' ? AlertTriangle : XCircle;
          return (
            <li key={line.hoodId} className="rounded-xl border border-slate-200/80 dark:border-[var(--color-border-strong)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-slate-950 dark:text-white">{line.nameFa}</strong>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                  line.fit === 'fits'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : line.fit === 'tight'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}>
                  <FitIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {line.fitLabelFa}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[var(--color-text-secondary)] mt-1">{line.referenceLabelFa}</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1">{line.truthFa}</p>
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && lines.every((l) => l.fit === 'over') && (
        <div data-testid="budget-fit-affordability-bridge" className="rounded-xl border border-amber-200/90 bg-amber-50/80 dark:border-amber-800/70 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100 space-y-1">
          <div className="font-bold">پل تأمین بودجه و گزینه‌های جایگزین</div>
          <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            {isTehran ? (
              <>با بودجهٔ نقدی فعلی در ۲۰ محلهٔ مرکزی تاریخ‌دار تهران گزینه‌ای در محدوده نیست؛ با فعال‌سازی <strong>وام مسکن (+۱.۲ میلیارد) + کسر رهن مستأجر</strong> در «کشف محله»، یا بررسی <strong>حومهٔ استان تهران (پرند، اندیشه، پیشوا)</strong> و کلان‌شهر <strong>کرج (گلشهر، گوهردشت)</strong> گزینه‌های متناسب در دسترس است.</>
            ) : (
              <>در {placeFa} با بودجهٔ نقدی فعلی در محله‌های منتخب گزینه‌ای در محدوده نیست؛ با فعال‌سازی <strong>وام مسکن (+۱.۲ میلیارد) + کسر رهن مستأجر</strong> در بخش «کشف محله» گزینه‌های قابل تطبیق را بررسی کنید.</>
            )}
          </p>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-[var(--color-text-muted)]">{HONEST_ASKING_SENTENCE_FA}</p>
      <button type="button" onClick={() => { void sendCard(); }} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer">
        {copied ? 'کارت ذخیره شد' : 'کارت را بفرست'}
      </button>
    </section>
  );
}

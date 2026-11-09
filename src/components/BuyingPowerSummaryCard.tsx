/**
 * @file src/components/BuyingPowerSummaryCard.tsx
 * @description کارت فرمول شفاف جمع قدرت خرید واقعی (نقدینگی پایه + وام مسکن + کمک رهن مستأجر)
 * در پاپ‌اور فیلتر بودجه حالت خرید ملک.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaValue,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';

export interface BuyingPowerSummaryCardProps {
  buyTotalBudget: number;
  targetSqm: number;
  useLoanBooster: boolean;
  deductTenantRahnInBuy: boolean;
  buildingAgeSegment?: 'new' | 'mid' | 'older';
  selectedHood: EvaluatedNeighborhood;
}

export function BuyingPowerSummaryCard({
  buyTotalBudget,
  targetSqm,
  useLoanBooster,
  deductTenantRahnInBuy,
  buildingAgeSegment = 'new',
  selectedHood,
}: BuyingPowerSummaryCardProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const safeSqm = Math.max(25, targetSqm || 80);
  const rentAgeFactor = buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.9 : 0.8;
  const loanHelpMillion = useLoanBooster ? 1200 : 0;
  const tenantRahnHelpMillion = deductTenantRahnInBuy
    ? Math.round((selectedHood?.rahn80m || 1200) * (safeSqm / 80) * rentAgeFactor)
    : 0;

  // When deductTenantRahnInBuy is active, 10% title deed retention also boosts purchasing power
  const rawTotalMillion = buyTotalBudget + loanHelpMillion + tenantRahnHelpMillion;
  const effectivePurchasingPowerMillion = deductTenantRahnInBuy
    ? Math.round(rawTotalMillion / 0.9)
    : rawTotalMillion;
  const deedHoldbackMillion = deductTenantRahnInBuy
    ? Math.max(0, effectivePurchasingPowerMillion - rawTotalMillion)
    : 0;
  const effectivePerSqmMillion = Math.round(effectivePurchasingPowerMillion / safeSqm);
  const displayUnitPrice = convertPricePerSqmToUnit(effectivePerSqmMillion, areaUnit);
  const hoodPerSqm = Math.max(1, selectedHood?.buyPerSqm || effectivePerSqmMillion);
  const affordableSqmInHood = Math.round(effectivePurchasingPowerMillion / hoodPerSqm);
  const hoodTotal80mMillions = (selectedHood?.buyPerSqm || 120) * 80;
  const monthlyRent80mMillions = Math.round(((selectedHood?.rahn80m || 1200) * 0.03) * 10) / 10;
  const hoodUnitRate = convertPricePerSqmToUnit(hoodPerSqm, areaUnit);
  const agg = selectedHood
    ? aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, hoodPerSqm, buildNeighborhoodListingSamples(selectedHood))
    : null;
  const dealPerSqm = Math.max(1, agg?.estimatedDealPricePerSqm || hoodPerSqm);
  const affordableDealSqmInHood = Math.round(effectivePurchasingPowerMillion / dealPerSqm);
  const dealUnitRate = convertPricePerSqmToUnit(dealPerSqm, areaUnit);

  return (
    <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-800/70 rounded-xl p-3 space-y-1.5 text-[11px] text-slate-800 dark:text-slate-200">
      <div className="font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>فرمول قدرت خرید واقعی شما ({formatAreaValue(safeSqm, areaUnit)}):</span>
      </div>

      <div className="space-y-1 text-[10.5px] text-slate-600 dark:text-slate-300 tabular-nums">
        <div className="flex items-center justify-between">
          <span>نقدینگی پایه شما:</span>
          <strong className="text-slate-900 dark:text-white">
            {toPersianNum((buyTotalBudget / 1000).toFixed(2))} میلیارد تومان
            {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, radarLocale)})` : ''}
          </strong>
        </div>

        {useLoanBooster && (
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span>+ وام مسکن زوجین/جعاله:</span>
            <strong>
              +۱.۲۰ میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(loanHelpMillion, intlCurrency, radarLocale)})` : ''}
            </strong>
          </div>
        )}

        {deductTenantRahnInBuy && (
          <>
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span>+ کمک رهن مستأجر در {selectedHood?.name || 'محله'} ({formatAreaShort(safeSqm, areaUnit)}):</span>
              <strong>
                +{toPersianNum((tenantRahnHelpMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(tenantRahnHelpMillion, intlCurrency, radarLocale)})` : ''}
              </strong>
            </div>
            <div className="flex items-center justify-between text-teal-700 dark:text-teal-400">
              <span>+ تنفس ۱۰٪ تحویل سند رسمی:</span>
              <strong>
                +{toPersianNum((deedHoldbackMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(deedHoldbackMillion, intlCurrency, radarLocale)})` : ''}
              </strong>
            </div>
          </>
        )}
      </div>

      <div className="pt-1.5 border-t border-emerald-200/80 dark:border-emerald-800/70 flex items-center justify-between text-[11px] tabular-nums">
        <span className="font-extrabold text-emerald-950 dark:text-emerald-200">
          = کل قدرت خرید واقعی ({formatAreaShort(safeSqm, areaUnit)}):
        </span>
        <strong className="font-black text-emerald-800 dark:text-emerald-300">
          {toPersianNum((effectivePurchasingPowerMillion / 1000).toFixed(2))} میلیارد
          {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(effectivePurchasingPowerMillion, intlCurrency, radarLocale)})` : ''}{' '}
          ({areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}
          {toPersianNum(displayUnitPrice)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(displayUnitPrice, intlCurrency, radarLocale)}` : ''})
        </strong>
      </div>

      <div className="pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between text-[10.5px] text-emerald-900 dark:text-emerald-200 tabular-nums">
        <span>
          متراژ قابل خرید در {selectedHood?.name || 'این محله'} ({areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}
          {toPersianNum(hoodUnitRate)} م · {formatAreaShort(80, areaUnit)}: {toPersianNum((hoodTotal80mMillions / 1000).toFixed(1))} میلیارد · اجاره: {toPersianNum(monthlyRent80mMillions)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(hoodUnitRate, intlCurrency, radarLocale)}` : ''}):
        </span>
        <strong className="font-black text-emerald-700 dark:text-emerald-400">{formatAreaValue(affordableSqmInHood, areaUnit)}</strong>
      </div>

      <div className="pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between text-[10.5px] text-teal-900 dark:text-teal-200 tabular-nums">
        <span>
          با تخمین قیمت قطعی معامله ({areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}
          {toPersianNum(dealUnitRate)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(dealUnitRate, intlCurrency, radarLocale)}` : ''}):
        </span>
        <strong className="font-black text-teal-700 dark:text-teal-400">{formatAreaValue(affordableDealSqmInHood, areaUnit)}</strong>
      </div>

      {(useLoanBooster || deductTenantRahnInBuy) && (
        <div
          data-testid="buying-power-liability-disclosure"
          className="mt-1 pt-1.5 border-t border-amber-200/80 dark:border-amber-800/60 text-[10px] text-amber-900 dark:text-amber-300 leading-relaxed space-y-0.5"
        >
          <div className="font-bold flex items-center justify-between tabular-nums">
            <span>آورده خالص نقدی: {toPersianNum((buyTotalBudget / 1000).toFixed(2))} میلیارد</span>
            <span>تعهدات و اهرم‌ها: {toPersianNum(((effectivePurchasingPowerMillion - buyTotalBudget) / 1000).toFixed(2))} میلیارد</span>
          </div>
          <p className="text-[9.5px] text-amber-800/90 dark:text-amber-300/90">
            {deductTenantRahnInBuy
              ? 'توجه واقع‌بینانه: استفاده از «رهن مستأجر» به معنای عدم امکان سکونت شخصی تا پایان قرارداد اجاره است و «۱۰٪ تنفس سند» تخفیف نیست بلکه تعهد نقدی قابل پرداخت در روز انتقال سند محضری است.'
              : 'توجه واقع‌بینانه: مبلغ وام مسکن بدهی بانکی با اقساط ماهانه و هزینه اوراق است و باید از آورده خالص تفکیک شود.'}
          </p>
        </div>
      )}
    </div>
  );
}

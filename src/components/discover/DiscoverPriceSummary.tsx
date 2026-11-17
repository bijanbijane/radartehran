/**
 * @file src/components/discover/DiscoverPriceSummary.tsx
 * @description Stage 186 & 187: Unified Grid & List price presentation component backed by discoverPricingEngine.
 * Uses unit-consistent area labels, separates asking vs unregistered v6.4 scenario pricing,
 * marks FX outputs with «معادل تقریبی», and omits fabricated static dates.
 */
import React from 'react';
import { toPersianNum } from '../../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  convertPricePerSqmToUnitRaw,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
  type RuntimeExchangeRateReference,
} from '../../utils/areaUnit';
import {
  calculateDiscoverDepositForTargetArea,
  isValidPositiveMetric,
  sanitizeTargetSqm,
  type DiscoverBudgetMode,
  type DiscoverFreshnessMetadata,
} from '../../features/discovery/services/discoverPricingEngine';
import { getDiscoverLocaleCopy } from '../../features/discovery/i18n/discoverLocaleCopy';

export interface DiscoverPriceSummaryProps {
  buyPerSqm: number;
  dealPerSqm: number | null;
  rahn80m: number;
  targetSqm: number;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  mode: DiscoverBudgetMode;
  exchangeRateRef?: RuntimeExchangeRateReference | null;
  freshness: DiscoverFreshnessMetadata;
  layout?: 'grid' | 'list';
}

export const DiscoverPriceSummary: React.FC<DiscoverPriceSummaryProps> = ({
  buyPerSqm,
  dealPerSqm,
  rahn80m,
  targetSqm,
  areaUnit,
  intlCurrency,
  radarLocale,
  exchangeRateRef,
  freshness,
  layout = 'grid',
}) => {
  const copy = getDiscoverLocaleCopy(radarLocale);
  const safeSqm = sanitizeTargetSqm(targetSqm);
  const hasAsking = isValidPositiveMetric(buyPerSqm);
  const resolvedDealPerSqm = isValidPositiveMetric(dealPerSqm) ? dealPerSqm : hasAsking ? buyPerSqm : null;
  const scaledDeposit = calculateDiscoverDepositForTargetArea(rahn80m, safeSqm);

  const areaSuffix = copy.isEn
    ? areaUnit === 'sqft' ? 'ft²' : 'm²'
    : areaUnit === 'sqft' ? 'فوت‌مربع' : 'مترمربع';
  const irtUnitSuffix = copy.isEn ? `M Toman / ${areaSuffix}` : `میلیون تومان / ${areaSuffix}`;

  const fmtUnitPrice = (perSqmMillion: number): string => {
    const unitNum = convertPricePerSqmToUnit(perSqmMillion, areaUnit);
    if (intlCurrency === 'IRT') {
      return copy.isEn
        ? `${unitNum.toLocaleString('en-US')} ${irtUnitSuffix}`
        : `${toPersianNum(unitNum)} ${irtUnitSuffix}`;
    }
    const rawUnit = convertPricePerSqmToUnitRaw(perSqmMillion, areaUnit);
    return `${formatMillionTomanAsIntlCurrency(rawUnit, intlCurrency, radarLocale, exchangeRateRef)} / ${areaSuffix}`;
  };

  const fmtDeposit = (depositMillion: number): string => {
    if (intlCurrency === 'IRT') {
      return copy.isEn
        ? `${depositMillion.toLocaleString('en-US')}M Toman`
        : `${toPersianNum(depositMillion)} میلیون تومان`;
    }
    return formatMillionTomanAsIntlCurrency(depositMillion, intlCurrency, radarLocale, exchangeRateRef);
  };

  const freshnessLine = copy.isEn
    ? freshness.sourceUpdatedLabelEn || copy.priceUnavailableLabel
    : freshness.sourceUpdatedLabelFa || copy.priceUnavailableLabel;

  const wrapperClass =
    layout === 'list'
      ? 'flex flex-wrap items-center gap-3 tabular-nums text-xs'
      : 'my-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 tabular-nums';

  const depositBorderClass =
    layout === 'list'
      ? ''
      : copy.dir === 'rtl'
        ? 'border-r border-slate-100 dark:border-slate-800 pr-3'
        : 'border-l border-slate-100 dark:border-slate-800 pl-3';

  return (
    <div className={wrapperClass} dir={copy.dir}>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-400 font-medium truncate" title={freshnessLine}>
          {freshnessLine}
        </div>
        <strong className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
          {hasAsking ? fmtUnitPrice(buyPerSqm) : copy.priceUnavailableLabel}
        </strong>
        {resolvedDealPerSqm !== null && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
            {copy.scenarioPrefix} {fmtUnitPrice(resolvedDealPerSqm)}
          </span>
        )}
        {intlCurrency !== 'IRT' && hasAsking && (
          <span className="text-[9.5px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5">
            {copy.approxFxPrefix} {intlCurrency}
          </span>
        )}
      </div>

      <div className={`min-w-0 ${depositBorderClass}`}>
        <span className="text-[10px] text-slate-400 block font-medium">
          {safeSqm !== null
            ? `${copy.depositLabelPrefix(safeSqm, areaUnit)}:`
            : copy.invalidAreaLabel}
        </span>
        <strong
          className={`text-sm font-black mt-0.5 block ${
            scaledDeposit !== null
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400 text-xs'
          }`}
        >
          {scaledDeposit !== null
            ? fmtDeposit(scaledDeposit)
            : safeSqm === null
              ? copy.invalidAreaLabel
              : copy.priceUnavailableLabel}
        </strong>
        {intlCurrency !== 'IRT' && scaledDeposit !== null && (
          <span className="text-[9.5px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5">
            {copy.approxFxPrefix} {intlCurrency}
          </span>
        )}
      </div>
    </div>
  );
};

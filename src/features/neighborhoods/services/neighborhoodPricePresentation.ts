/**
 * @file src/features/neighborhoods/services/neighborhoodPricePresentation.ts
 * @description Shared pure price scaling, filter-bracket boundary evaluation, and unit/date labeling for Home & Discover views.
 */
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { lookupMatchingDatedReferencePrice, type TehranReferencePriceRow } from '../../../data/neighborhoodListingSamples';
import type { CityId } from '../../../types/models';
import {
  convertPricePerSqmToUnit,
  convertPricePerSqmToUnitRaw,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RuntimeExchangeRateReference,
} from '../../../utils/areaUnit';

import {
  calculateDiscoverDepositForTargetArea,
  matchesDiscoverPriceBracket,
} from '../../discovery/services/discoverPricingEngine';

export type PriceBracketId = 'all' | 'under5b' | '5to10b' | '10to20b' | 'luxury';

export interface PriceBracketOption {
  id: PriceBracketId;
  label: string;
}

export interface NeighborhoodPricePresentation {
  safeTargetSqm: number;
  unitBuy: number;
  unitDeal: number;
  scaledRahnTarget: number;
  refRow: TehranReferencePriceRow | undefined;
  unitPerAreaFa: string;
  buyReferenceLabelFa: string;
  buyValueWithUnitFa: string;
  dealScenarioLineFa: string;
  rahnAreaLabelFa: string;
  rahnValueWithUnitFa: string;
}

export function scaleFullRahnForTargetSqm(rahn80m: number, targetSqm: number): number {
  const safeSqm = targetSqm > 0 && Number.isFinite(targetSqm) ? targetSqm : 80;
  return calculateDiscoverDepositForTargetArea(rahn80m, safeSqm) ?? 0;
}

export function matchesFinancialBracket(
  hood: Pick<EvaluatedNeighborhood, 'rahn80m' | 'buyPerSqm'>,
  mode: 'rent' | 'buy',
  targetSqm: number,
  effectiveBuyPerSqm: number,
  bracket: PriceBracketId,
): boolean {
  const safeSqm = targetSqm > 0 && Number.isFinite(targetSqm) ? targetSqm : 80;
  return matchesDiscoverPriceBracket(hood, mode, safeSqm, effectiveBuyPerSqm, bracket);
}

export function getPriceBracketOptions(mode: 'rent' | 'buy', isEn: boolean): readonly PriceBracketOption[] {
  if (isEn) {
    return mode === 'rent'
      ? [
          { id: 'all', label: 'All Prices' },
          { id: 'under5b', label: 'Under 1B Deposit' },
          { id: '5to10b', label: '1B to 2B Deposit' },
          { id: '10to20b', label: 'Over 2B to 4B Deposit' },
          { id: 'luxury', label: 'Over 4B Deposit' },
        ]
      : [
          { id: 'all', label: 'All Prices' },
          { id: 'under5b', label: 'Under 5B Toman' },
          { id: '5to10b', label: '5B to 10B Toman' },
          { id: '10to20b', label: 'Over 10B to 20B Toman' },
          { id: 'luxury', label: 'Over 20B Toman' },
        ];
  }
  return mode === 'rent'
    ? [
        { id: 'all', label: 'همه قیمت‌ها' },
        { id: 'under5b', label: 'زیر ۱ میلیارد تومان' },
        { id: '5to10b', label: '۱ تا ۲ میلیارد تومان' },
        { id: '10to20b', label: 'بیش از ۲ تا ۴ میلیارد تومان' },
        { id: 'luxury', label: 'بیش از ۴ میلیارد تومان' },
      ]
    : [
        { id: 'all', label: 'همه قیمت‌ها' },
        { id: 'under5b', label: 'زیر ۵ میلیارد تومان' },
        { id: '5to10b', label: '۵ تا ۱۰ میلیارد تومان' },
        { id: '10to20b', label: 'بیش از ۱۰ تا ۲۰ میلیارد تومان' },
        { id: 'luxury', label: 'بیش از ۲۰ میلیارد تومان' },
      ];
}

export function getNeighborhoodPricePresentation(params: {
  hood: Pick<EvaluatedNeighborhood, 'id' | 'buyPerSqm' | 'rahn80m'>;
  cityId: CityId | string;
  dealPerSqm: number;
  targetSqm: number;
  areaUnit: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
  exchangeRateRef?: RuntimeExchangeRateReference | null;
}): NeighborhoodPricePresentation {
  const safeTargetSqm = params.targetSqm > 0 && Number.isFinite(params.targetSqm) ? Math.round(params.targetSqm) : 80;
  const currency = params.intlCurrency ?? 'IRT';
  const unitBuy = convertPricePerSqmToUnit(params.hood.buyPerSqm, params.areaUnit);
  const unitDeal = convertPricePerSqmToUnit(params.dealPerSqm, params.areaUnit);
  const unitBuyRaw = convertPricePerSqmToUnitRaw(params.hood.buyPerSqm, params.areaUnit);
  const unitDealRaw = convertPricePerSqmToUnitRaw(params.dealPerSqm, params.areaUnit);
  const scaledRahnTarget = scaleFullRahnForTargetSqm(params.hood.rahn80m, safeTargetSqm);
  const refRow = lookupMatchingDatedReferencePrice(params.cityId, params.hood.id, params.hood.buyPerSqm);
  const areaSuffix = params.areaUnit === 'sqft' ? 'فوت‌مربع' : 'مترمربع';
  const unitPerAreaFa = currency === 'IRT' ? `میلیون تومان / ${areaSuffix}` : `/ ${areaSuffix}`;
  const buyReferenceLabelFa = refRow
    ? `مرجع داخلی · بازبینی ${refRow.asOfJalali}`
    : 'قیمت مرجع داخلی (بدون تاریخ به‌روزرسانی)';
  const buyValueWithUnitFa =
    currency === 'IRT'
      ? `${toPersianNum(unitBuy)} ${unitPerAreaFa}`
      : `${formatMillionTomanAsIntlCurrency(unitBuyRaw, currency, 'fa', params.exchangeRateRef)} ${unitPerAreaFa}`;
  const dealScenarioLineFa =
    currency === 'IRT'
      ? `سناریو v6.4 (غیرثبتی): ${toPersianNum(unitDeal)} ${unitPerAreaFa}`
      : `سناریو v6.4 (غیرثبتی): ${formatMillionTomanAsIntlCurrency(unitDealRaw, currency, 'fa', params.exchangeRateRef)} ${unitPerAreaFa}`;
  const rahnAreaLabelFa = `رهن کامل برای ${formatAreaShort(safeTargetSqm, params.areaUnit)}`;
  const rahnValueWithUnitFa =
    currency === 'IRT'
      ? `${toPersianNum(scaledRahnTarget)} میلیون تومان`
      : formatMillionTomanAsIntlCurrency(scaledRahnTarget, currency, 'fa', params.exchangeRateRef);

  return {
    safeTargetSqm,
    unitBuy,
    unitDeal,
    scaledRahnTarget,
    refRow,
    unitPerAreaFa,
    buyReferenceLabelFa,
    buyValueWithUnitFa,
    dealScenarioLineFa,
    rahnAreaLabelFa,
    rahnValueWithUnitFa,
  };
}

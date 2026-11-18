/**
 * @file src/platform/entity-detail/core/EntityDetailNormalizer.ts
 * @description Normalizes financial fields (keeping asking, deal, estimated valuation, rahn, rent, and pricePerSqm strictly separate) and timestamps.
 */

import { createEntityDetailField } from './EntityDetailContract';
import type { DataConfidence, EntityDetailField } from './EntityDetailTypes';

export interface RawEntityFinancialInput {
  transactionType?: 'sale' | 'rent' | 'rahn_full' | string | null;
  askingSalePriceMillionToman?: number | null;
  registeredDealPriceMillionToman?: number | null;
  registeredDealSourceId?: string;
  estimatedValuationMillionToman?: number | null;
  rahnDepositMillionToman?: number | null;
  monthlyRentMillionToman?: number | null;
  builtAreaSqm?: number | null;
  observedAt?: string;
  updatedAt?: string;
}

/**
 * Stage 7 Section 5.2 Financial Logic:
 * - Asking sale price, registered deal price, estimated valuation, rahn, monthly rent, and pricePerSqm remain strictly separate fields.
 * - `pricePerSqm` is calculated ONLY when `askingSalePrice` and `builtAreaSqm` are both valid positive numbers and transactionType allows sale calculation.
 * - Never converts asking price into deal price or estimated valuation into verified price.
 */
export function normalizeEntityFinancialFields(
  input: RawEntityFinancialInput
): Record<string, EntityDetailField<number | string>> {
  const tx = input.transactionType ?? null;
  const asking =
    typeof input.askingSalePriceMillionToman === 'number' && input.askingSalePriceMillionToman > 0
      ? input.askingSalePriceMillionToman
      : null;
  const deal =
    typeof input.registeredDealPriceMillionToman === 'number' &&
    input.registeredDealPriceMillionToman > 0 &&
    input.registeredDealSourceId
      ? input.registeredDealPriceMillionToman
      : null;
  const valuation =
    typeof input.estimatedValuationMillionToman === 'number' && input.estimatedValuationMillionToman > 0
      ? input.estimatedValuationMillionToman
      : null;
  const rahn =
    typeof input.rahnDepositMillionToman === 'number' && input.rahnDepositMillionToman >= 0
      ? input.rahnDepositMillionToman
      : null;
  const rent =
    typeof input.monthlyRentMillionToman === 'number' && input.monthlyRentMillionToman >= 0
      ? input.monthlyRentMillionToman
      : null;
  const area =
    typeof input.builtAreaSqm === 'number' && input.builtAreaSqm > 0 ? input.builtAreaSqm : null;

  const canCalculateSalePerSqm =
    asking !== null && area !== null && tx !== 'rent' && tx !== 'rahn_full';
  const askingPerSqm = canCalculateSalePerSqm ? Number((asking! / area!).toFixed(2)) : null;

  const askConfidence: DataConfidence = asking !== null ? 'unverified' : 'unknown';

  return {
    transactionType: createEntityDetailField(tx, {
      confidence: tx ? 'verified' : 'unknown',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    askingSalePrice: createEntityDetailField(asking, {
      unit: 'میلیون تومان',
      confidence: askConfidence,
      sourceId: 'listing_declaration',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    registeredDealPrice: createEntityDetailField(deal, {
      unit: 'میلیون تومان',
      confidence: deal !== null ? 'verified' : 'unknown',
      sourceId: input.registeredDealSourceId,
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    estimatedValuation: createEntityDetailField(valuation, {
      unit: 'میلیون تومان',
      confidence: valuation !== null ? 'estimated' : 'unknown',
      sourceId: 'hedonic_valuation_engine',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    rahnDeposit: createEntityDetailField(rahn, {
      unit: 'میلیون تومان',
      confidence: rahn !== null ? 'unverified' : 'unknown',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    monthlyRent: createEntityDetailField(rent, {
      unit: 'میلیون تومان',
      confidence: rent !== null ? 'unverified' : 'unknown',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
    pricePerSqm: createEntityDetailField(askingPerSqm, {
      unit: 'میلیون تومان/مترمربع',
      confidence: askingPerSqm !== null ? askConfidence : 'unknown',
      observedAt: input.observedAt,
      updatedAt: input.updatedAt,
    }),
  };
}

export function formatIsoToJalaliDisplay(isoString?: string | null): string {
  if (!isoString || typeof isoString !== 'string') return 'نامشخص';
  const ts = Date.parse(isoString);
  if (!Number.isFinite(ts)) return 'نامشخص';
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(ts));
  } catch {
    return isoString.slice(0, 10);
  }
}

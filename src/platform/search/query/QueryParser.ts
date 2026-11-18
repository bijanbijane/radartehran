/**
 * @file src/platform/search/query/QueryParser.ts
 * @description Parses natural Persian search queries into structured tokens while preserving rawQuery.
 */

import { normalizePersianSearchQuery } from '../core/SearchNormalizer';
import { EXACT_SQM_TO_SQFT, type AreaValue, type MoneyValue } from '../core/SearchTypes';

export interface ParsedSearchQueryTokens {
  rawQuery: string;
  normalizedQuery: string;
  tokens: string[];
  extractedDistrictNumber?: number | null;
  extractedArea?: AreaValue | null;
  extractedBudget?: MoneyValue | null;
  extractedBedrooms?: number | null;
  transactionModeHint?: 'buy' | 'rent' | 'rahn_full' | null;
  isAnalyticalQuestion: boolean;
}

export function parseSearchQueryTokens(rawQuery: string): ParsedSearchQueryTokens {
  const safeRaw = typeof rawQuery === 'string' ? rawQuery : '';
  const normalizedQuery = normalizePersianSearchQuery(safeRaw);
  const tokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];

  // Extract district number e.g. «منطقه 5» or «منطقه ۵»
  let extractedDistrictNumber: number | null = null;
  const districtMatch = normalizedQuery.match(/منطقه\s*(\d{1,2})/);
  if (districtMatch) {
    const num = Number(districtMatch[1]);
    if (num >= 1 && num <= 22) extractedDistrictNumber = num;
  }

  // Extract area e.g. «85 متر» or «1000 فوت»
  let extractedArea: AreaValue | null = null;
  const sqmMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*(?:متر|مترمربع|متری)/);
  const sqftMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*(?:فوت|فوت مربع)/);
  if (sqmMatch) {
    extractedArea = { value: Number(sqmMatch[1]), unit: 'sqm' };
  } else if (sqftMatch) {
    const sqft = Number(sqftMatch[1]);
    extractedArea = { value: Number((sqft / EXACT_SQM_TO_SQFT).toFixed(4)), unit: 'sqm' };
  }

  // Extract budget e.g. «12 میلیارد» or «850 میلیون»
  let extractedBudget: MoneyValue | null = null;
  const billionMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*میلیارد/);
  const millionMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*میلیون/);
  if (billionMatch) {
    extractedBudget = {
      amount: Number(billionMatch[1]),
      currency: 'IRR',
      displayUnit: 'billion',
    };
  } else if (millionMatch) {
    extractedBudget = {
      amount: Number(millionMatch[1]),
      currency: 'IRR',
      displayUnit: 'million',
    };
  }

  // Extract bedrooms e.g. «2 خواب» or «۳ خوابه»
  let extractedBedrooms: number | null = null;
  const bedMatch = normalizedQuery.match(/(\d)\s*خواب/);
  if (bedMatch) {
    extractedBedrooms = Number(bedMatch[1]);
  }

  let transactionModeHint: 'buy' | 'rent' | 'rahn_full' | null = null;
  if (/\b(اجاره|مستاجر)\b/.test(normalizedQuery)) {
    transactionModeHint = 'rent';
  } else if (/\b(رهن کامل|رهن)\b/.test(normalizedQuery)) {
    transactionModeHint = 'rahn_full';
  } else if (/\b(خرید|فروش)\b/.test(normalizedQuery)) {
    transactionModeHint = 'buy';
  }

  const isAnalyticalQuestion = /\b(قیمت|شاخص|روند|تحلیل|میانگین|آمار|حباب)\b/.test(normalizedQuery);

  return {
    rawQuery: safeRaw,
    normalizedQuery,
    tokens,
    extractedDistrictNumber,
    extractedArea,
    extractedBudget,
    extractedBedrooms,
    transactionModeHint,
    isAnalyticalQuestion,
  };
}

import type {
  AppliedMarketFilters,
  MarketFilterDraft,
  MarketGeoLevel,
  MarketPeriodId,
  MarketTransactionType,
  MarketType,
  PropertySubType,
} from '../types/market.types';

export interface FilterCapabilityMatrix {
  supportsRooms: boolean;
  supportsAgeRange: boolean;
  supportsRentEquivalent: boolean;
  availableTransactions: MarketTransactionType[];
  availableSubTypes: Array<{ id: PropertySubType; labelFa: string }>;
  isMarketLiveInRadar: boolean;
}

export const MARKET_TYPE_CAPABILITIES: Record<MarketType, FilterCapabilityMatrix> = {
  residential: {
    supportsRooms: true,
    supportsAgeRange: true,
    supportsRentEquivalent: true,
    availableTransactions: ['sale', 'rent'],
    availableSubTypes: [
      { id: 'apartment', labelFa: 'آپارتمان' },
      { id: 'villa', labelFa: 'خانه و ویلایی' },
      { id: 'penthouse', labelFa: 'پنت‌هاوس' },
    ],
    isMarketLiveInRadar: true,
  },
  commercial: {
    supportsRooms: false,
    supportsAgeRange: true,
    supportsRentEquivalent: true,
    availableTransactions: ['sale', 'rent'],
    availableSubTypes: [{ id: 'shop', labelFa: 'مغازه و تجاری' }],
    isMarketLiveInRadar: false,
  },
  office: {
    supportsRooms: true,
    supportsAgeRange: true,
    supportsRentEquivalent: true,
    availableTransactions: ['sale', 'rent'],
    availableSubTypes: [{ id: 'office_unit', labelFa: 'واحد اداری' }],
    isMarketLiveInRadar: false,
  },
  land: {
    supportsRooms: false,
    supportsAgeRange: false,
    supportsRentEquivalent: false,
    availableTransactions: ['sale'],
    availableSubTypes: [{ id: 'land_plot', labelFa: 'زمین و کلنگی' }],
    isMarketLiveInRadar: false,
  },
};

export function createDefaultMarketDraft(
  transactionType: MarketTransactionType = 'sale',
  geoLevel: MarketGeoLevel = 'neighborhood',
  zoneName = '',
): MarketFilterDraft {
  return {
    marketType: 'residential',
    transactionType,
    propertySubType: 'apartment',
    geoLevel,
    zoneName,
    period: '180d',
    areaRange: 'all',
    ageRange: 'all',
    rooms: 'all',
    onlyObserved: false,
    includeRentEquivalent: true,
  };
}

export function normalizeDraftForMarketType(
  draft: MarketFilterDraft,
  nextMarketType: MarketType,
): MarketFilterDraft {
  const cap = MARKET_TYPE_CAPABILITIES[nextMarketType];
  const nextSub = cap.availableSubTypes.some((s) => s.id === draft.propertySubType)
    ? draft.propertySubType
    : cap.availableSubTypes[0].id;
  const nextTx = cap.availableTransactions.includes(draft.transactionType)
    ? draft.transactionType
    : cap.availableTransactions[0];
  return {
    ...draft,
    marketType: nextMarketType,
    transactionType: nextTx,
    propertySubType: nextSub,
    rooms: cap.supportsRooms ? draft.rooms : 'all',
    ageRange: cap.supportsAgeRange ? draft.ageRange : 'all',
    includeRentEquivalent: cap.supportsRentEquivalent ? draft.includeRentEquivalent : false,
  };
}

export function isDraftDirty(
  draft: MarketFilterDraft,
  applied: AppliedMarketFilters,
): boolean {
  return (
    draft.marketType !== applied.marketType ||
    draft.transactionType !== applied.transactionType ||
    draft.propertySubType !== applied.propertySubType ||
    draft.geoLevel !== applied.geoLevel ||
    draft.zoneName !== applied.zoneName ||
    draft.period !== applied.period ||
    draft.areaRange !== applied.areaRange ||
    draft.ageRange !== applied.ageRange ||
    draft.rooms !== applied.rooms ||
    draft.onlyObserved !== applied.onlyObserved ||
    draft.includeRentEquivalent !== applied.includeRentEquivalent
  );
}

export function commitMarketDraft(draft: MarketFilterDraft): AppliedMarketFilters {
  return {
    ...draft,
    appliedAtIso: new Date().toISOString(),
  };
}

export function resetMarketFiltersToDefault(zoneName = ''): {
  draft: MarketFilterDraft;
  applied: AppliedMarketFilters;
} {
  const draft = createDefaultMarketDraft('sale', 'neighborhood', zoneName);
  return { draft, applied: commitMarketDraft(draft) };
}

export function getPeriodLabelFa(period: MarketPeriodId): string {
  switch (period) {
    case '30d':
      return '۳۰ روز اخیر';
    case '90d':
      return '۹۰ روز اخیر (فصلی)';
    case '180d':
      return '۶ ماه اخیر';
    case '365d':
      return '۱۲ ماه اخیر';
  }
}

export function getPeriodMonthCount(period: MarketPeriodId): number {
  switch (period) {
    case '30d':
      return 3;
    case '90d':
      return 4;
    case '180d':
      return 6;
    case '365d':
      return 12;
  }
}

/** @file src/features/properties/filters/PropertyFilterDraft.ts — Draft/Applied Filter State & Adaptive Schema Rules */
import type { AmenityValue, PropertyType } from '../types/property.types';
import type { TransactionType } from '../types/listing.types';

export type PropertySortKey =
  | 'relevance'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'price_per_sqm_asc'
  | 'area_desc'
  | 'discount_desc';

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface PropertyFilterDraft {
  searchQuery: string;
  transactionType: 'all' | TransactionType;
  propertyType: 'all' | PropertyType;
  hoodIds: number[];
  priceMinMillion: string;
  priceMaxMillion: string;
  depositMaxMillion: string;
  rentMaxMillion: string;
  areaMin: string;
  areaMax: string;
  roomsMin: number | null;
  buildYearMin: string;
  parking: AmenityValue | 'any';
  elevator: AmenityValue | 'any';
  storage: AmenityValue | 'any';
  verifiedOnly: boolean;
  onlySelectedHood: boolean;
  onlyInMapBounds: boolean;
  mapBounds: GeoBounds | null;
  sortBy: PropertySortKey;
}

export type AppliedPropertyFilters = PropertyFilterDraft;

export interface PropertyFilterChip {
  key: string;
  label: string;
  clearPatch: Partial<PropertyFilterDraft>;
}

export function normalizeDigitsToAscii(input: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return input
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)));
}

export function parseOptionalNumber(input: string): number | null {
  const cleaned = normalizeDigitsToAscii(input || '')
    .replace(/\u066B/g, '.')
    .replace(/[,٬،\s_]/g, '')
    .trim();
  if (!cleaned) return null;
  if (!/^\d*(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function isMalformedOptionalNumber(input: string): boolean {
  return input.trim().length > 0 && parseOptionalNumber(input) === null;
}

export function validatePropertyFilterErrors(draft: PropertyFilterDraft): string[] {
  const errors: string[] = [];
  const checks: Array<[string, string]> = [
    ['حداقل متراژ', draft.areaMin],
    ['حداکثر متراژ', draft.areaMax],
    ['حداقل قیمت', draft.priceMinMillion],
    ['حداکثر قیمت', draft.priceMaxMillion],
    ['حداکثر ودیعه', draft.depositMaxMillion],
    ['حداکثر اجاره', draft.rentMaxMillion],
    ['حداقل سال ساخت', draft.buildYearMin],
  ];
  for (const [label, raw] of checks) {
    if (isMalformedOptionalNumber(raw)) {
      errors.push(`مقدار فیلد «${label}» باید عدد معتبر باشد.`);
    }
  }
  return errors;
}

export function createDefaultPropertyFilters(initialTx: 'all' | TransactionType = 'all'): PropertyFilterDraft {
  return {
    searchQuery: '',
    transactionType: initialTx,
    propertyType: 'all',
    hoodIds: [],
    priceMinMillion: '',
    priceMaxMillion: '',
    depositMaxMillion: '',
    rentMaxMillion: '',
    areaMin: '',
    areaMax: '',
    roomsMin: null,
    buildYearMin: '',
    parking: 'any',
    elevator: 'any',
    storage: 'any',
    verifiedOnly: false,
    onlySelectedHood: false,
    onlyInMapBounds: false,
    mapBounds: null,
    sortBy: 'relevance',
  };
}

export function normalizeFiltersForPropertyType(
  draft: PropertyFilterDraft,
  nextType: 'all' | PropertyType,
): PropertyFilterDraft {
  if (nextType === 'land') {
    return { ...draft, propertyType: nextType, roomsMin: null, elevator: 'any', buildYearMin: '' };
  }
  if (nextType === 'commercial') {
    return { ...draft, propertyType: nextType, roomsMin: null, elevator: 'any' };
  }
  return { ...draft, propertyType: nextType };
}

export function supportsRoomsFilter(propertyType: 'all' | PropertyType): boolean {
  return propertyType !== 'land' && propertyType !== 'commercial';
}

export function supportsElevatorFilter(propertyType: 'all' | PropertyType): boolean {
  return propertyType !== 'land' && propertyType !== 'commercial';
}

export function validatePropertyFilterDraft(draft: PropertyFilterDraft): string[] {
  const warnings: string[] = [];
  const pMin = parseOptionalNumber(draft.priceMinMillion);
  const pMax = parseOptionalNumber(draft.priceMaxMillion);
  if (pMin !== null && pMax !== null && pMin > pMax) {
    warnings.push('حداقل قیمت از حداکثر قیمت بزرگ‌تر است و هنگام اعمال تصحیح می‌شود.');
  }
  const aMin = parseOptionalNumber(draft.areaMin);
  const aMax = parseOptionalNumber(draft.areaMax);
  if (aMin !== null && aMax !== null && aMin > aMax) {
    warnings.push('حداقل متراژ از حداکثر متراژ بزرگ‌تر است و هنگام اعمال تصحیح می‌شود.');
  }
  return warnings;
}

export function commitPropertyFilterDraft(draft: PropertyFilterDraft): AppliedPropertyFilters {
  const next = { ...draft };
  const pMin = parseOptionalNumber(next.priceMinMillion);
  const pMax = parseOptionalNumber(next.priceMaxMillion);
  if (pMin !== null && pMax !== null && pMin > pMax) {
    next.priceMinMillion = String(pMax);
    next.priceMaxMillion = String(pMin);
  }
  const aMin = parseOptionalNumber(next.areaMin);
  const aMax = parseOptionalNumber(next.areaMax);
  if (aMin !== null && aMax !== null && aMin > aMax) {
    next.areaMin = String(aMax);
    next.areaMax = String(aMin);
  }
  return next;
}

export function isPropertyFilterDirty(draft: PropertyFilterDraft, applied: AppliedPropertyFilters): boolean {
  return JSON.stringify(draft) !== JSON.stringify(applied);
}

export function buildActiveFilterChips(applied: AppliedPropertyFilters, selectedHoodName: string): PropertyFilterChip[] {
  const chips: PropertyFilterChip[] = [];
  if (applied.transactionType !== 'all') {
    chips.push({ key: 'tx', label: `معامله: ${applied.transactionType === 'sale' ? 'فروش' : applied.transactionType === 'rent' ? 'اجاره' : applied.transactionType === 'full_deposit' ? 'رهن کامل' : 'پیش‌فروش'}`, clearPatch: { transactionType: 'all' } });
  }
  if (applied.propertyType !== 'all') {
    chips.push({ key: 'ptype', label: `نوع ملک: ${applied.propertyType}`, clearPatch: { propertyType: 'all' } });
  }
  if (applied.onlySelectedHood) {
    chips.push({ key: 'hood', label: `فقط ${selectedHoodName}`, clearPatch: { onlySelectedHood: false } });
  }
  if (applied.onlyInMapBounds && applied.mapBounds) {
    chips.push({ key: 'bounds', label: 'محدوده فعلی نقشه', clearPatch: { onlyInMapBounds: false, mapBounds: null } });
  }
  if (applied.areaMin || applied.areaMax) {
    chips.push({ key: 'area', label: `متراژ: ${applied.areaMin || '۰'} تا ${applied.areaMax || '∞'} م²`, clearPatch: { areaMin: '', areaMax: '' } });
  }
  if (applied.priceMinMillion || applied.priceMaxMillion) {
    chips.push({ key: 'price', label: `قیمت کل: ${applied.priceMinMillion || '۰'} تا ${applied.priceMaxMillion || '∞'} م`, clearPatch: { priceMinMillion: '', priceMaxMillion: '' } });
  }
  if (applied.roomsMin !== null) {
    chips.push({ key: 'rooms', label: `حداقل ${applied.roomsMin} خواب`, clearPatch: { roomsMin: null } });
  }
  if (applied.parking !== 'any') chips.push({ key: 'parking', label: `پارکینگ: ${applied.parking === 'has' ? 'دارد' : applied.parking === 'lacks' ? 'ندارد' : 'نامشخص'}`, clearPatch: { parking: 'any' } });
  if (applied.elevator !== 'any') chips.push({ key: 'elevator', label: `آسانسور: ${applied.elevator === 'has' ? 'دارد' : applied.elevator === 'lacks' ? 'ندارد' : 'نامشخص'}`, clearPatch: { elevator: 'any' } });
  if (applied.storage !== 'any') chips.push({ key: 'storage', label: `انباری: ${applied.storage === 'has' ? 'دارد' : applied.storage === 'lacks' ? 'ندارد' : 'نامشخص'}`, clearPatch: { storage: 'any' } });
  if (applied.verifiedOnly) chips.push({ key: 'verified', label: 'فقط راستی‌آزمایی‌شده', clearPatch: { verifiedOnly: false } });
  return chips;
}

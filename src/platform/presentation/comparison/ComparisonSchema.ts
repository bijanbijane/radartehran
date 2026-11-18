/**
 * @file src/platform/presentation/comparison/ComparisonSchema.ts
 * @description Canonical Comparison contracts, entity-type caps (Property:4, Building:4, Listing:5, Neighborhood:3, Service:4), and field groups.
 */

import type { ResultEntityType } from '../core/ResultTypes';

export interface ComparisonItem {
  entityId: string;
  entityType: ResultEntityType;
}

export interface ComparisonField {
  id: string;
  label: string;
  unit?: string;

  comparable: boolean;
  group: string;
}

export interface ComparisonModel {
  items: ComparisonItem[];
  fields: ComparisonField[];
}

export const COMPARISON_MAX_BY_ENTITY: Record<ResultEntityType, number> = {
  property: 4,
  building: 4,
  listing: 5,
  neighborhood: 3,
  service: 4,
};

export const PROPERTY_COMPARISON_FIELDS: readonly ComparisonField[] = [
  { id: 'propertyType', label: 'نوع ملک', comparable: true, group: 'مشخصات پایه' },
  { id: 'neighborhood', label: 'محله', comparable: true, group: 'مشخصات پایه' },
  { id: 'areaSqm', label: 'زیربنا', unit: 'مترمربع', comparable: true, group: 'مساحت' },
  { id: 'landAreaSqm', label: 'مساحت زمین', unit: 'مترمربع', comparable: true, group: 'مساحت' },
  { id: 'buildingAge', label: 'سن بنا', unit: 'سال', comparable: true, group: 'ساختمان' },
  { id: 'totalPrice', label: 'قیمت پیشنهادی کل', unit: 'میلیون تومان', comparable: true, group: 'مالی' },
  { id: 'pricePerSqm', label: 'قیمت هر مترمربع', unit: 'میلیون تومان/مترمربع', comparable: true, group: 'مالی' },
  { id: 'estimatedDealPricePerSqm', label: 'ارزش برآوردی هر متر', unit: 'میلیون تومان/مترمربع', comparable: true, group: 'مالی' },
  { id: 'updatedAt', label: 'تاریخ اندازه‌گیری و اعتبار', comparable: true, group: 'اعتبار داده' },
] as const;

export const NEIGHBORHOOD_COMPARISON_FIELDS: readonly ComparisonField[] = [
  { id: 'pricePerSqm', label: 'میانگین قیمت پیشنهادی هر متر', unit: 'میلیون تومان/مترمربع', comparable: true, group: 'مالی' },
  { id: 'estimatedDealPricePerSqm', label: 'سناریوی قیمت معامله هر متر', unit: 'میلیون تومان/مترمربع', comparable: true, group: 'مالی' },
  { id: 'sampleCount', label: 'تعداد آگهی‌های قابل استناد', unit: 'آگهی معتبر', comparable: true, group: 'اعتبار داده' },
  { id: 'areaSqm', label: 'مساحت محدوده', unit: 'کیلومترمربع', comparable: true, group: 'مساحت' },
  { id: 'updatedAt', label: 'آخرین زمان به‌روزرسانی', comparable: true, group: 'اعتبار داده' },
] as const;

export function getComparisonFieldsForEntityType(entityType: ResultEntityType): ComparisonField[] {
  if (entityType === 'neighborhood') return [...NEIGHBORHOOD_COMPARISON_FIELDS];
  return [...PROPERTY_COMPARISON_FIELDS];
}

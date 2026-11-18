/**
 * @file src/platform/entity-engagement/core/EngagementRegistry.ts
 * @description Matrix of supported WatchConditionTypes per EntityType and Persian labels for Stage 8 Entity Engagement.
 */

import type { EntityType, WatchConditionType } from './EngagementTypes';

export interface WatchConditionDescriptor {
  conditionType: WatchConditionType;
  labelFa: string;
  descriptionFa: string;
  supportedEntityTypes: EntityType[];
  requiresThreshold: boolean;
  defaultThresholdPercent?: number;
  defaultCooldownMinutes: number;
}

export const WATCH_CONDITION_REGISTRY: Record<WatchConditionType, WatchConditionDescriptor> = {
  price_drop: {
    conditionType: 'price_drop',
    labelFa: 'کاهش قیمت',
    descriptionFa: 'اعلان در صورت کاهش قیمت پیشنهادی یا کارشناسی بیش از آستانه تعیین‌شده',
    supportedEntityTypes: ['property', 'listing', 'neighborhood'],
    requiresThreshold: true,
    defaultThresholdPercent: 3,
    defaultCooldownMinutes: 60,
  },
  price_change: {
    conditionType: 'price_change',
    labelFa: 'تغییر قیمت (افزایش یا کاهش)',
    descriptionFa: 'اعلان در صورت هرگونه تغییر معنادار قیمت بیش از درصد یا مبلغ مشخص',
    supportedEntityTypes: ['property', 'listing', 'neighborhood'],
    requiresThreshold: true,
    defaultThresholdPercent: 2,
    defaultCooldownMinutes: 60,
  },
  status_change: {
    conditionType: 'status_change',
    labelFa: 'تغییر وضعیت چرخه حیات',
    descriptionFa: 'اعلان در صورت انتشار، انقضا، حذف یا تغییر وضعیت معاملاتی ملک یا آگهی',
    supportedEntityTypes: ['property', 'listing', 'building'],
    requiresThreshold: false,
    defaultCooldownMinutes: 30,
  },
  new_listing_in_building: {
    conditionType: 'new_listing_in_building',
    labelFa: 'ثبت آگهی جدید در ساختمان',
    descriptionFa: 'اعلان به محض انتشار آگهی فروش یا اجاره جدید در این ساختمان',
    supportedEntityTypes: ['building', 'property'],
    requiresThreshold: false,
    defaultCooldownMinutes: 60,
  },
  new_listing_in_neighborhood: {
    conditionType: 'new_listing_in_neighborhood',
    labelFa: 'ثبت آگهی جدید در محله',
    descriptionFa: 'اعلان هنگام ثبت آگهی جدید منطبق با معیارهای رصد در این محله',
    supportedEntityTypes: ['neighborhood'],
    requiresThreshold: false,
    defaultCooldownMinutes: 120,
  },
  neighborhood_index_change: {
    conditionType: 'neighborhood_index_change',
    labelFa: 'تغییر شاخص قیمت یا نقدشوندگی محله',
    descriptionFa: 'اعلان در صورت تغییر معنادار میانگین قیمت مترمربع یا امتیاز نقدشوندگی محله',
    supportedEntityTypes: ['neighborhood'],
    requiresThreshold: true,
    defaultThresholdPercent: 3,
    defaultCooldownMinutes: 240,
  },
};

export function getSupportedWatchConditionsForEntity(
  entityType: EntityType
): WatchConditionDescriptor[] {
  return Object.values(WATCH_CONDITION_REGISTRY).filter((desc) =>
    desc.supportedEntityTypes.includes(entityType)
  );
}

export function isWatchConditionSupportedForEntity(
  entityType: EntityType,
  conditionType: WatchConditionType
): boolean {
  const desc = WATCH_CONDITION_REGISTRY[conditionType];
  return Boolean(desc && desc.supportedEntityTypes.includes(entityType));
}

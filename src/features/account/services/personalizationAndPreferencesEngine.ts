/**
 * RT-UI-PERSONALIZATION-001 (Stage 31) | Personal Workspace, Saved Items & User Preferences Engine
 * Enforces:
 * 1. Four independent concepts: Saved Items, Display/Map/Search Preferences, Alerts, Identity/Privacy
 * 2. Three independent spatial states: Default City != Last Viewed Bounds != Saved Map Preset (§16.1)
 * 3. Display-only unit/currency/number formatting without mutating canonical DB values (§15.1–15.3)
 * 4. Undoable removal, bulk delete, expired/deleted listing state retention, and unavailable map layer fallback
 */

import { toPersianNum } from '../../../data/neighborhoods';

export type SavedEntityKind =
  | 'PROPERTY' | 'NEIGHBORHOOD' | 'SEARCH' | 'MAP_PRESET'
  | 'KNOWLEDGE_ARTICLE' | 'MARKET_REPORT' | 'COMMUNITY_TOPIC' | 'SERVICE_PROVIDER';

export type SavedTargetLifecycleStatus = 'ACTIVE' | 'EXPIRED' | 'DELETED' | 'LAYER_PARTIALLY_UNAVAILABLE';

export interface UnifiedSavedItemRecord {
  id: string;
  userId: string;
  entityType: SavedEntityKind;
  entityId: string;
  titleFa: string;
  subtitleFa: string;
  cityId: string;
  neighborhoodNameFa?: string;
  priceMillionToman?: number;
  areaSqm?: number;
  targetLifecycleStatus: SavedTargetLifecycleStatus;
  unavailableLayerNamesFa?: string[];
  activeLayers?: string[];
  alertEnabled?: boolean;
  collectionNameFa?: string;
  createdAt: string;
}

export interface UserDisplayPreferences {
  theme: 'light' | 'dark' | 'system';
  numberFormat: 'fa' | 'en';
  areaUnit: 'sqm';
  currencyUnit: 'toman' | 'rial';
  density: 'comfortable' | 'standard' | 'compact';
}

export interface UserMapPreferences {
  defaultCityId: string;
  lastViewedCityId: string;
  baseMapStyle: 'street_standard' | 'light_analytical' | 'dark_slate';
  showStreetNames: boolean;
  showLabels: boolean;
  showNeighborhoodBoundaries: boolean;
  defaultActiveLayers: string[];
  showLegendByDefault: boolean;
}

export interface UserSearchPreferences {
  defaultCityId: string;
  defaultEntityType: 'ALL' | 'PROPERTIES' | 'NEIGHBORHOODS' | 'MARKET' | 'SERVICES' | 'KNOWLEDGE';
  defaultSort: 'RELEVANCE' | 'NEWEST' | 'PRICE_ASC';
  pageSize: 10 | 20 | 50;
  retainLastSearch: boolean;
  suggestPreviousQueries: boolean;
  personalizedSuggestionsEnabled: boolean;
}

export interface PersonalizationLevelSettings {
  level1ExplicitPreferencesEnabled: true;
  level2ActivityBasedEnabled: boolean;
  level3SmartRecommendationsEnabled: boolean;
}

export interface CompleteUserPreferencesBundle {
  userId: string;
  display: UserDisplayPreferences;
  map: UserMapPreferences;
  search: UserSearchPreferences;
  personalizationLevels: PersonalizationLevelSettings;
  updatedAt: string;
}

export function formatValueWithNumberPreference(
  val: string | number,
  numberFormat: 'fa' | 'en',
  isTechnicalId = false
): string {
  if (isTechnicalId) return String(val);
  const str = String(val);
  if (numberFormat === 'fa') return toPersianNum(str);
  return str.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function formatPriceByUserPreference(
  canonicalPriceMillionToman: number,
  prefs: Pick<UserDisplayPreferences, 'currencyUnit' | 'numberFormat'>
): { displayAmount: string; unitLabelFa: string; canonicalPriceMillionToman: number } {
  const isRial = prefs.currencyUnit === 'rial';
  const rawDisplayNumeric = isRial ? canonicalPriceMillionToman * 10 : canonicalPriceMillionToman;
  const formatted = formatValueWithNumberPreference(rawDisplayNumeric.toLocaleString('en-US'), prefs.numberFormat);
  return {
    displayAmount: formatted,
    unitLabelFa: isRial ? 'میلیون ریال' : 'میلیون تومان',
    canonicalPriceMillionToman,
  };
}

const INITIAL_SAVED_ITEMS: UnifiedSavedItemRecord[] = [
  {
    id: 'sv-prop-105', userId: 'usr-current', entityType: 'PROPERTY', entityId: 'prop-saadat-105',
    titleFa: 'آپارتمان ۱۰۵ متری ۲خوابه نوساز سعادت‌آباد',
    subtitleFa: 'منطقه ۲ تهران · پارکینگ و آسانسور · سند تک‌برگ', cityId: 'tehran',
    neighborhoodNameFa: 'سعادت‌آباد', priceMillionToman: 14900, areaSqm: 105,
    targetLifecycleStatus: 'ACTIVE', collectionNameFa: 'املاک مناسب خرید', createdAt: '2026-04-12T09:00:00Z',
  },
  {
    id: 'sv-prop-expired-88', userId: 'usr-current', entityType: 'PROPERTY', entityId: 'prop-vanak-expired-92',
    titleFa: 'آپارتمان ۹۲ متری در ونک (شیخ‌بهایی)',
    subtitleFa: 'این آگهی منقضی یا واگذار شده است؛ مشخصات جهت مقایسه نگهداری شده است.', cityId: 'tehran',
    neighborhoodNameFa: 'ونک', priceMillionToman: 12400, areaSqm: 92,
    targetLifecycleStatus: 'EXPIRED', collectionNameFa: 'املاک مناسب خرید', createdAt: '2026-04-04T11:00:00Z',
  },
  {
    id: 'sv-hood-saadat', userId: 'usr-current', entityType: 'NEIGHBORHOOD', entityId: 'saadat-abad',
    titleFa: 'محله سعادت‌آباد (منطقه ۲ تهران)',
    subtitleFa: 'شاخص نقدشوندگی ۸۸/۱۰۰ · میانگین پیشنهادی ۱۴۲ م.ت/متر', cityId: 'tehran',
    neighborhoodNameFa: 'سعادت‌آباد', priceMillionToman: 142,
    targetLifecycleStatus: 'ACTIVE', collectionNameFa: 'محله‌های مورد بررسی', createdAt: '2026-04-10T08:00:00Z',
  },
  {
    id: 'sv-map-region2', userId: 'usr-current', entityType: 'MAP_PRESET', entityId: 'map-preset-region-2',
    titleFa: 'نمای نقشه: بررسی بازار منطقه ۲ و مراکز درمانی',
    subtitleFa: 'مرز محله‌ها + لایه قیمت مسکن + مراکز درمانی (۱ لایه آزمایشی موقتاً غیرفعال)', cityId: 'tehran',
    neighborhoodNameFa: 'سعادت‌آباد', targetLifecycleStatus: 'LAYER_PARTIALLY_UNAVAILABLE',
    activeLayers: ['boundaries', 'price_heatmap', 'hospitals'],
    unavailableLayerNamesFa: ['لایه آزمایشی ترافیک لحظه‌ای'], createdAt: '2026-04-09T16:30:00Z',
  },
  {
    id: 'sv-kb-niavaran', userId: 'usr-current', entityType: 'KNOWLEDGE_ARTICLE', entityId: 'kb-niavaran-history',
    titleFa: 'مقاله: تاریخچه محله نیاوران و تحول باغ‌شهرهای شمیران',
    subtitleFa: 'مرکز دانش و پژوهش رادار تهران · مطالعه شهری', cityId: 'tehran',
    neighborhoodNameFa: 'نیاوران', targetLifecycleStatus: 'ACTIVE', createdAt: '2026-04-08T10:00:00Z',
  },
];

export class PersonalizationWorkspaceEngine {
  private itemsByUser: Map<string, UnifiedSavedItemRecord[]> = new Map([['usr-current', [...INITIAL_SAVED_ITEMS]]]);
  private lastDeletedUndoBuffer: Map<string, UnifiedSavedItemRecord> = new Map();

  private preferencesByUser: Map<string, CompleteUserPreferencesBundle> = new Map([
    [
      'usr-current',
      {
        userId: 'usr-current',
        display: { theme: 'system', numberFormat: 'fa', areaUnit: 'sqm', currencyUnit: 'toman', density: 'standard' },
        map: {
          defaultCityId: 'tehran', lastViewedCityId: 'tehran', baseMapStyle: 'street_standard',
          showStreetNames: true, showLabels: true, showNeighborhoodBoundaries: true,
          defaultActiveLayers: ['boundaries', 'price_heatmap'], showLegendByDefault: true,
        },
        search: {
          defaultCityId: 'tehran', defaultEntityType: 'ALL', defaultSort: 'RELEVANCE', pageSize: 20,
          retainLastSearch: true, suggestPreviousQueries: true, personalizedSuggestionsEnabled: true,
        },
        personalizationLevels: {
          level1ExplicitPreferencesEnabled: true,
          level2ActivityBasedEnabled: true,
          level3SmartRecommendationsEnabled: true,
        },
        updatedAt: '2026-04-12T08:00:00Z',
      },
    ],
  ]);

  public listSavedItems(callerUserId: string, requestedOwnerUserId = callerUserId): {
    ok: boolean; errorFa?: string; items: UnifiedSavedItemRecord[];
  } {
    if (callerUserId !== requestedOwnerUserId) {
      return { ok: false, errorFa: 'مشاهده ذخیره‌های حساب سایر کاربران مجاز نیست (IDOR Guard).', items: [] };
    }
    return { ok: true, items: [...(this.itemsByUser.get(callerUserId) || [])] };
  }

  public saveItem(callerUserId: string, item: Omit<UnifiedSavedItemRecord, 'id' | 'userId' | 'createdAt'>): UnifiedSavedItemRecord {
    const existing = this.itemsByUser.get(callerUserId) || [];
    const duplicate = existing.find((x) => x.entityType === item.entityType && x.entityId === item.entityId);
    if (duplicate) return duplicate;
    const created: UnifiedSavedItemRecord = {
      ...item,
      id: `sv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      userId: callerUserId,
      createdAt: new Date().toISOString(),
    };
    this.itemsByUser.set(callerUserId, [created, ...existing]);
    return created;
  }

  public removeSavedItemWithUndo(callerUserId: string, itemId: string): {
    removed: boolean; undoMessageFa?: string; removedItem?: UnifiedSavedItemRecord;
  } {
    const existing = this.itemsByUser.get(callerUserId) || [];
    const target = existing.find((x) => x.id === itemId);
    if (!target) return { removed: false };
    this.lastDeletedUndoBuffer.set(callerUserId, target);
    this.itemsByUser.set(callerUserId, existing.filter((x) => x.id !== itemId));
    return {
      removed: true,
      undoMessageFa: `«${target.titleFa}» از ذخیره‌ها حذف شد. امکان بازگردانی فوری فعال است.`,
      removedItem: target,
    };
  }

  public undoLastRemovedItem(callerUserId: string): UnifiedSavedItemRecord | null {
    const last = this.lastDeletedUndoBuffer.get(callerUserId);
    if (!last) return null;
    this.lastDeletedUndoBuffer.delete(callerUserId);
    const existing = this.itemsByUser.get(callerUserId) || [];
    this.itemsByUser.set(callerUserId, [last, ...existing]);
    return last;
  }

  public bulkDeleteSavedItems(callerUserId: string, selectedIds: string[]): { deletedCount: number; remainingCount: number } {
    const idSet = new Set(selectedIds);
    const existing = this.itemsByUser.get(callerUserId) || [];
    const remaining = existing.filter((x) => !idSet.has(x.id));
    this.itemsByUser.set(callerUserId, remaining);
    return { deletedCount: existing.length - remaining.length, remainingCount: remaining.length };
  }

  public getPreferences(callerUserId = 'usr-current'): CompleteUserPreferencesBundle {
    return this.preferencesByUser.get(callerUserId) || this.preferencesByUser.get('usr-current')!;
  }

  public updatePreferences(
    callerUserId: string,
    patch: {
      display?: Partial<UserDisplayPreferences>;
      map?: Partial<UserMapPreferences>;
      search?: Partial<UserSearchPreferences>;
      personalizationLevels?: Partial<Omit<PersonalizationLevelSettings, 'level1ExplicitPreferencesEnabled'>>;
    }
  ): CompleteUserPreferencesBundle {
    const current = this.getPreferences(callerUserId);
    const next: CompleteUserPreferencesBundle = {
      ...current,
      userId: callerUserId,
      display: { ...current.display, ...(patch.display || {}) },
      map: { ...current.map, ...(patch.map || {}) },
      search: { ...current.search, ...(patch.search || {}) },
      personalizationLevels: {
        ...current.personalizationLevels,
        ...(patch.personalizationLevels || {}),
        level1ExplicitPreferencesEnabled: true,
      },
      updatedAt: new Date().toISOString(),
    };
    if (patch.personalizationLevels?.level2ActivityBasedEnabled === false) {
      next.search.personalizedSuggestionsEnabled = false;
    }
    this.preferencesByUser.set(callerUserId, next);
    return next;
  }

  public recordTransientMapCityView(callerUserId: string, viewedCityId: string): CompleteUserPreferencesBundle {
    return this.updatePreferences(callerUserId, { map: { lastViewedCityId: viewedCityId } });
  }
}

export const defaultPersonalizationEngine = new PersonalizationWorkspaceEngine();

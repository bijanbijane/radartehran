/**
 * RT-UI-SEARCH-001 | Search Workspace Service:
 * Categorized Autocomplete, Search History with Privacy Controls, Saved Searches
 * with Meaningful Change Detection (Stage 26 Notification Bridge), & Recommendations
 */

import {
  RecommendationCardItem,
  SavedSearchAlertFrequency,
  SavedSearchRecord,
  SearchEntityType,
  SearchFilterSet,
  SearchHistoryEntry,
  SearchMatchState,
  SearchScope,
  SearchSortOption,
  SearchSuggestionItem,
} from '../models/search.types';
import { normalizePersianSearchQuery, PLACE_HIERARCHY_REGISTRY } from './searchNormalizerAndPlanner';

export interface MeaningfulChangeCandidate {
  entityId: string;
  entityType: SearchEntityType;
  version: number;
  priceMillionToman?: number;
  activeStatus: boolean;
  changeKind: 'NEW_MATCH' | 'PRICE_CHANGE' | 'STATUS_CHANGE' | 'MINOR_TEXT_OR_IMAGE_EDIT';
}

const SENSITIVE_QUERY_PATTERNS = [/\b09\d{9}\b/, /\b\d{10}\b/, /\bIR\d{24}\b/i];

export function containsSensitivePersonalPattern(text: string): boolean {
  return SENSITIVE_QUERY_PATTERNS.some((rx) => rx.test(text));
}

export class SearchWorkspaceStateManager {
  private historyRecordingEnabled = true;
  private personalizationEnabled = true;
  private dismissedRecommendationIds: Set<string> = new Set();

  private searchHistory: SearchHistoryEntry[] = [
    {
      id: 'hist-1', userId: 'usr-current', rawQuery: 'آپارتمان دوخوابه در سعادت‌آباد',
      normalizedQuery: 'آپارتمان ۲خوابه در سعادت‌آباد', scope: 'PROPERTIES',
      filters: { neighborhoodId: 'saadat-abad', bedrooms: 2, propertyType: 'APARTMENT' },
      resultCount: 2, createdAt: '2026-04-12T09:15:00Z',
    },
    {
      id: 'hist-2', userId: 'usr-current', rawQuery: 'میانگین قیمت آپارتمان در منطقه ۵',
      normalizedQuery: 'میانگین قیمت آپارتمان در منطقه 5', scope: 'MARKET',
      filters: { districtNumber: 5 }, resultCount: 2, createdAt: '2026-04-11T18:40:00Z',
    },
  ];

  private savedSearches: SavedSearchRecord[] = [
    {
      id: 'saved-search-1', userId: 'usr-current', titleFa: 'آپارتمان ۲خوابه سعادت‌آباد زیر ۱۵ میلیارد',
      query: 'آپارتمان دوخوابه در سعادت‌آباد', scope: 'PROPERTIES',
      filters: { neighborhoodId: 'saadat-abad', bedrooms: 2, maxPriceMillionToman: 15000 },
      sort: 'RELEVANCE', alertFrequency: 'INSTANT', channels: ['IN_APP', 'PUSH'], status: 'ACTIVE',
      matchedCount: 2, unreadChangesCount: 1, lastCheckedAt: '2026-04-12T10:30:00Z', createdAt: '2026-04-05T12:00:00Z',
    },
    {
      id: 'saved-search-2', userId: 'usr-current', titleFa: 'پایش شاخص قیمت منطقه ۵ (پونک)',
      query: 'میانگین قیمت آپارتمان در منطقه ۵', scope: 'MARKET',
      filters: { districtNumber: 5 }, sort: 'NEWEST', alertFrequency: 'WEEKLY', channels: ['IN_APP', 'EMAIL'],
      status: 'ACTIVE', matchedCount: 2, unreadChangesCount: 0, lastCheckedAt: '2026-04-12T08:00:00Z', createdAt: '2026-04-02T09:00:00Z',
    },
  ];

  private matchStates: Map<string, SearchMatchState> = new Map([
    [
      'saved-search-1::prop-saadat-105',
      {
        savedSearchId: 'saved-search-1', entityType: 'LISTING', entityId: 'prop-saadat-105',
        firstMatchedAt: '2026-04-10T10:00:00Z', lastMatchedAt: '2026-04-12T10:00:00Z',
        lastNotifiedVersion: 2, lastKnownPriceMillionToman: 15200, lastKnownActiveStatus: true,
        matchStatus: 'UPDATED_MEANINGFUL',
      },
    ],
  ]);

  public getPrivacySettings() {
    return {
      historyRecordingEnabled: this.historyRecordingEnabled,
      personalizationEnabled: this.personalizationEnabled,
      dismissedCount: this.dismissedRecommendationIds.size,
    };
  }

  public setHistoryRecordingEnabled(enabled: boolean): void { this.historyRecordingEnabled = enabled; }
  public setPersonalizationEnabled(enabled: boolean): void { this.personalizationEnabled = enabled; }
  public getSearchHistory(userId = 'usr-current'): SearchHistoryEntry[] { return this.searchHistory.filter((h) => h.userId === userId); }

  public recordSearchHistory(params: {
    userId?: string; rawQuery: string; scope: SearchScope; filters?: SearchFilterSet; resultCount: number;
  }): SearchHistoryEntry | null {
    if (!this.historyRecordingEnabled) return null;
    const trimmed = params.rawQuery.trim();
    if (!trimmed || containsSensitivePersonalPattern(trimmed)) return null;
    const norm = normalizePersianSearchQuery(trimmed);
    const entry: SearchHistoryEntry = {
      id: `hist-${Date.now()}`, userId: params.userId || 'usr-current', rawQuery: trimmed,
      normalizedQuery: norm.normalizedQuery, scope: params.scope, filters: params.filters || {},
      resultCount: params.resultCount, createdAt: new Date().toISOString(),
    };
    this.searchHistory = [entry, ...this.searchHistory.filter((item) => item.normalizedQuery !== norm.normalizedQuery)].slice(0, 25);
    return entry;
  }

  public deleteSearchHistoryItem(id: string): boolean {
    const before = this.searchHistory.length;
    this.searchHistory = this.searchHistory.filter((h) => h.id !== id);
    return this.searchHistory.length < before;
  }

  public clearSearchHistory(userId = 'usr-current'): void {
    this.searchHistory = this.searchHistory.filter((h) => h.userId !== userId);
  }

  public getSavedSearches(userId = 'usr-current'): SavedSearchRecord[] {
    return this.savedSearches.filter((s) => s.userId === userId);
  }

  public createSavedSearch(params: {
    userId?: string; titleFa: string; query: string; scope: SearchScope;
    filters?: SearchFilterSet; sort?: SearchSortOption; alertFrequency?: SavedSearchAlertFrequency;
  }): SavedSearchRecord {
    const created: SavedSearchRecord = {
      id: `saved-search-${Date.now()}`, userId: params.userId || 'usr-current',
      titleFa: params.titleFa.trim() || params.query.trim() || 'جست‌وجوی ذخیره‌شده',
      query: params.query.trim(), scope: params.scope, filters: params.filters || {},
      sort: params.sort || 'RELEVANCE', alertFrequency: params.alertFrequency || 'DAILY',
      channels: ['IN_APP'], status: 'ACTIVE', matchedCount: 1, unreadChangesCount: 0,
      lastCheckedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    this.savedSearches.unshift(created);
    return created;
  }

  public convertHistoryToSavedSearch(historyId: string, alertFrequency: SavedSearchAlertFrequency = 'DAILY'): SavedSearchRecord | null {
    const hist = this.searchHistory.find((h) => h.id === historyId);
    if (!hist) return null;
    return this.createSavedSearch({
      userId: hist.userId, titleFa: `پایش: ${hist.rawQuery}`, query: hist.rawQuery,
      scope: hist.scope, filters: hist.filters, alertFrequency,
    });
  }

  public updateSavedSearchStatus(id: string, status: 'ACTIVE' | 'PAUSED'): SavedSearchRecord | null {
    const target = this.savedSearches.find((s) => s.id === id);
    if (!target) return null;
    target.status = status;
    return target;
  }

  public updateSavedSearchFrequency(id: string, frequency: SavedSearchAlertFrequency): SavedSearchRecord | null {
    const target = this.savedSearches.find((s) => s.id === id);
    if (!target) return null;
    target.alertFrequency = frequency;
    return target;
  }

  public deleteSavedSearch(id: string): boolean {
    const before = this.savedSearches.length;
    this.savedSearches = this.savedSearches.filter((s) => s.id !== id);
    return this.savedSearches.length < before;
  }

  public evaluateSavedSearchMatchChange(
    savedSearchId: string,
    candidate: MeaningfulChangeCandidate
  ): { shouldNotify: boolean; reasonFa: string; updatedState: SearchMatchState } {
    const key = `${savedSearchId}::${candidate.entityId}`;
    const existing = this.matchStates.get(key);
    const now = new Date().toISOString();

    if (!existing) {
      const state: SearchMatchState = {
        savedSearchId, entityType: candidate.entityType, entityId: candidate.entityId,
        firstMatchedAt: now, lastMatchedAt: now, lastNotifiedVersion: candidate.version,
        lastKnownPriceMillionToman: candidate.priceMillionToman, lastKnownActiveStatus: candidate.activeStatus,
        matchStatus: 'NEW',
      };
      this.matchStates.set(key, state);
      return { shouldNotify: true, reasonFa: 'مورد جدید مطابق با جست‌وجوی ذخیره‌شده ثبت شد.', updatedState: state };
    }

    if (candidate.version <= existing.lastNotifiedVersion) {
      return { shouldNotify: false, reasonFa: 'این نسخه قبلاً اطلاع‌رسانی شده است (جلوگیری از اعلان تکراری).', updatedState: existing };
    }

    if (candidate.changeKind === 'MINOR_TEXT_OR_IMAGE_EDIT') {
      existing.lastMatchedAt = now;
      return { shouldNotify: false, reasonFa: 'ویرایش جزئی متن یا ترتیب تصاویر، تغییر معنادار قیمتی/وضعیتی محسوب نمی‌شود.', updatedState: existing };
    }

    const priceChanged =
      candidate.priceMillionToman !== undefined &&
      existing.lastKnownPriceMillionToman !== undefined &&
      Math.abs(candidate.priceMillionToman - existing.lastKnownPriceMillionToman) >= 10;
    const statusChanged = candidate.activeStatus !== existing.lastKnownActiveStatus;

    if (priceChanged || statusChanged || candidate.changeKind === 'PRICE_CHANGE' || candidate.changeKind === 'STATUS_CHANGE') {
      existing.lastMatchedAt = now;
      existing.lastNotifiedVersion = candidate.version;
      existing.lastKnownPriceMillionToman = candidate.priceMillionToman;
      existing.lastKnownActiveStatus = candidate.activeStatus;
      existing.matchStatus = statusChanged && !candidate.activeStatus ? 'REMOVED' : 'UPDATED_MEANINGFUL';
      return {
        shouldNotify: true,
        reasonFa: priceChanged ? 'تغییر معنادار قیمت در مورد منطبق با جست‌وجوی ذخیره‌شده' : 'تغییر وضعیت فعال/غیرفعال آگهی منطبق',
        updatedState: existing,
      };
    }

    return { shouldNotify: false, reasonFa: 'بدون تغییر معنادار', updatedState: existing };
  }

  public getAutocompleteSuggestions(rawPrefix: string): SearchSuggestionItem[] {
    const norm = normalizePersianSearchQuery(rawPrefix);
    const q = norm.normalizedQuery;
    const suggestions: SearchSuggestionItem[] = [];

    for (const h of this.searchHistory.slice(0, 2)) {
      if (!q || h.normalizedQuery.includes(q) || h.rawQuery.includes(q)) {
        suggestions.push({ id: `sug-recent-${h.id}`, category: 'RECENT', titleFa: h.rawQuery, subtitleFa: 'جست‌وجوی اخیر شما', scope: h.scope, queryText: h.rawQuery });
      }
    }

    for (const s of this.savedSearches.slice(0, 2)) {
      if (!q || s.titleFa.includes(q) || s.query.includes(q)) {
        suggestions.push({ id: `sug-saved-${s.id}`, category: 'SAVED', titleFa: s.titleFa, subtitleFa: 'جست‌وجوی ذخیره‌شده فعال', scope: s.scope, queryText: s.query });
      }
    }

    for (const p of PLACE_HIERARCHY_REGISTRY) {
      if (!q || p.canonicalName.includes(q) || p.aliases.some((a) => a.includes(q))) {
        suggestions.push({
          id: `sug-place-${p.id}`, category: 'PLACE', titleFa: `محله ${p.canonicalName}`,
          subtitleFa: p.hierarchyPath.slice(2).join(' › '), scope: 'NEIGHBORHOODS', queryText: p.canonicalName, urlPath: `/discover?hood=${p.id}`,
        });
      }
    }

    const popularItems: SearchSuggestionItem[] = [
      { id: 'sug-pop-1', category: 'POPULAR_QUERY', titleFa: 'آپارتمان دوخوابه در سعادت‌آباد', subtitleFa: 'جست‌وجوی پرتکرار املاک · منطقه ۲', scope: 'PROPERTIES', queryText: 'آپارتمان دوخوابه در سعادت‌آباد' },
      { id: 'sug-pop-2', category: 'POPULAR_QUERY', titleFa: 'میانگین قیمت آپارتمان در منطقه ۵', subtitleFa: 'شاخص بازار و روند قیمت · منطقه ۵', scope: 'MARKET', queryText: 'میانگین قیمت آپارتمان در منطقه ۵' },
      { id: 'sug-srv-1', category: 'KNOWLEDGE_OR_SERVICE', titleFa: 'کارشناس رسمی ارزیابی ملک', subtitleFa: 'بازار خدمات و متخصصان تاییدشده', scope: 'SERVICES', queryText: 'کارشناس رسمی ارزیابی ملک' },
      { id: 'sug-kb-1', category: 'KNOWLEDGE_OR_SERVICE', titleFa: 'تاریخچه محله نیاوران', subtitleFa: 'مرکز دانش و پژوهش شهری', scope: 'KNOWLEDGE', queryText: 'تاریخچه محله نیاوران' },
      { id: 'sug-comm-1', category: 'KNOWLEDGE_OR_SERVICE', titleFa: 'پرسش‌های کاربران درباره سند مشاع', subtitleFa: 'جامعه کاربران و تجربه‌های حقوقی', scope: 'COMMUNITY', queryText: 'پرسش‌های کاربران درباره سند مشاع' },
    ];

    for (const item of popularItems) {
      if (!q || item.titleFa.includes(q) || item.queryText.includes(q)) suggestions.push(item);
    }

    return suggestions.slice(0, 8);
  }

  public getDiscoveryRecommendations(activeNeighborhoodName = 'سعادت‌آباد'): RecommendationCardItem[] {
    const allCards: RecommendationCardItem[] = [
      {
        id: 'rec-ctx-hood-market', category: 'CONTEXTUAL', entityType: 'MARKET_INDEX', scope: 'MARKET',
        titleFa: `تحلیل شکاف قیمت پیشنهادی و معامله در ${activeNeighborhoodName}`,
        subtitleFa: 'مقایسه قیمت پیشنهادی فروشندگان با معامله سناریویی v6.4 و ارزش هدونیک',
        reasonFa: `مرتبط با محله انتخاب‌شده (${activeNeighborhoodName})`, urlPath: '/market-trends', metricBadgeFa: 'شکاف منصفانه: ۶.۲٪-',
      },
      {
        id: 'rec-sim-adjacent-hood', category: 'SIMILARITY', entityType: 'NEIGHBORHOOD', scope: 'NEIGHBORHOODS',
        titleFa: 'مقایسه سعادت‌آباد، شهرک غرب و پونک از نظر نقدشوندگی',
        subtitleFa: 'محله‌های هم‌جوار در غرب تهران با بودجه و تیپ آپارتمانی مشابه',
        reasonFa: 'محله‌های مشابه از نظر بودجه و نقدشوندگی', urlPath: '/compare', metricBadgeFa: 'نقدشوندگی ۸۸/۱۰۰',
      },
      {
        id: 'rec-saved-match', category: 'SAVED_SEARCH_MATCH', entityType: 'LISTING', scope: 'PROPERTIES',
        titleFa: 'کاهش قیمت ۳۰۰ میلیونی آپارتمان ۱۰۵ متری سعادت‌آباد',
        subtitleFa: 'تغییر معنادار قیمت در ۲۴ ساعت گذشته · منطقه ۲',
        reasonFa: 'مطابق جست‌وجوی ذخیره‌شده شما', urlPath: '/discover?hood=saadat-abad', metricBadgeFa: '۱۴.۹ میلیارد تومان',
      },
      {
        id: 'rec-related-kb', category: 'RELATED_TOPIC', entityType: 'ARTICLE', scope: 'KNOWLEDGE',
        titleFa: 'راهنمای بررسی پهنه گسلی و تاب‌آوری سازه پیش از خرید آپارتمان',
        subtitleFa: 'مرکز دانش و پژوهش رادار تهران · چک‌لیست فنی خریدار',
        reasonFa: 'پرتکرار در میان خریداران مسکن تهران', urlPath: '/knowledge', metricBadgeFa: 'مطالعه ۶ دقیقه‌ای',
      },
    ];

    return allCards
      .filter((c) => !this.dismissedRecommendationIds.has(c.id))
      .filter((c) => this.personalizationEnabled || c.category !== 'SAVED_SEARCH_MATCH');
  }

  public dismissRecommendation(id: string): void { this.dismissedRecommendationIds.add(id); }
}

export const defaultSearchWorkspaceService = new SearchWorkspaceStateManager();

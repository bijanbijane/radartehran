/**
 * Property Search Suggestions, Saved Searches & User Query History Service
 * (`server/modules/property-search/suggestionsAndHistoryService.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import type {
  GeographySearchAdapter,
  SavedSearchRepositoryAdapter,
  SearchHistoryRepositoryAdapter,
} from './contracts';
import type {
  SaveSearchInput,
  SearchSuggestionItem,
  SearchSuggestionsRequest,
  StoredPropertySavedSearch,
  StoredSearchHistoryRecord,
  UpdateSavedSearchInput,
} from './types';
import { normalizePersianText } from './validation';

const COMMON_PRESET_FILTERS: readonly {
  titleFa: string;
  subtitleFa: string;
  patch: SearchSuggestionItem['filterPatch'];
}[] = [
  {
    titleFa: 'آپارتمان نوساز با پارکینگ و آسانسور',
    subtitleFa: 'مسکونی | خرید و فروش',
    patch: {
      category: 'residential',
      subtype: 'apartment',
      dealType: 'sale',
      hasParking: true,
      hasElevator: true,
      maxBuildingAgeYears: 3,
    },
  },
  {
    titleFa: 'رهن کامل آپارتمان ۲ خوابه',
    subtitleFa: 'مسکونی | رهن و اجاره',
    patch: {
      category: 'residential',
      subtype: 'apartment',
      dealType: 'rent',
      minRooms: 2,
      maxMonthlyRentMillion: 0,
    },
  },
  {
    titleFa: 'مغازه و واحد تجاری سنددار',
    subtitleFa: 'تجاری | خرید و فروش',
    patch: {
      category: 'commercial',
      subtype: 'shop',
      dealType: 'sale',
      hasCommercialLicense: true,
    },
  },
  {
    titleFa: 'دفتر کار مناسب مطب یا شرکت',
    subtitleFa: 'اداری | رهن و اجاره',
    patch: {
      category: 'office',
      subtype: 'medical_office',
      dealType: 'rent',
      hasElevator: true,
      suitableForMedical: true,
    },
  },
];

export class SuggestionsAndHistoryService {
  constructor(
    private readonly geographyAdapter: GeographySearchAdapter,
    private readonly savedSearchRepo?: SavedSearchRepositoryAdapter,
    private readonly historyRepo?: SearchHistoryRepositoryAdapter,
    private readonly nowFn: () => number = Date.now,
  ) {}

  /**
   * Generates search suggestions based on verified cities, neighborhoods, property types, and common filters.
   */
  public async getSuggestions(request: SearchSuggestionsRequest): Promise<SearchSuggestionItem[]> {
    const rawPrefix = normalizePersianText(request.prefix);
    const limit = request.limit ?? 8;
    const suggestions: SearchSuggestionItem[] = [];

    // 1. Recent query suggestions if requested and user is authenticated
    if (request.includeRecent && request.userUid && this.historyRepo) {
      try {
        const recent = await this.historyRepo.getRecentQueries(request.userUid, 3);
        for (const r of recent) {
          if (!rawPrefix || normalizePersianText(r.querySummaryFa).includes(rawPrefix)) {
            suggestions.push({
              id: `recent_${r.historyId}`,
              type: 'recent_query',
              titleFa: r.querySummaryFa,
              subtitleFa: 'جست‌وجوی اخیر شما',
              filterPatch: r.filters,
            });
          }
        }
      } catch {
        // Recent history errors do not compromise suggestions
      }
    }

    // 2. City suggestions
    try {
      const cities = await this.geographyAdapter.getAllSupportedCities();
      for (const city of cities) {
        if (!rawPrefix || normalizePersianText(city.nameFa).includes(rawPrefix) || city.nameEn.toLowerCase().includes(rawPrefix.toLowerCase())) {
          suggestions.push({
            id: `city_${city.id}`,
            type: 'city',
            titleFa: `شهر ${city.nameFa}`,
            subtitleFa: 'محدوده کل شهر',
            filterPatch: { cityId: city.id },
          });
        }
      }
    } catch {
      // Geography city lookup failure handled gracefully
    }

    // 3. Location / Neighborhood lookup via Geography resolution
    if (rawPrefix.length >= 2) {
      try {
        const geoRes = await this.geographyAdapter.resolveLocation(rawPrefix, request.cityId);
        if (geoRes.resolved && geoRes.hoodId) {
          suggestions.push({
            id: `hood_${geoRes.cityId}_${geoRes.hoodId}`,
            type: 'neighborhood',
            titleFa: geoRes.displayNameFa ? `محله ${geoRes.displayNameFa}` : `محله کد ${geoRes.hoodId}`,
            subtitleFa: geoRes.cityId ? `در شهر ${geoRes.cityId}` : undefined,
            filterPatch: {
              cityId: geoRes.cityId,
              neighborhoodIds: [geoRes.hoodId],
            },
          });
        }
      } catch {
        // Location resolution error fallback
      }
    }

    // 4. Common Filter Presets matching prefix
    for (const preset of COMMON_PRESET_FILTERS) {
      if (!rawPrefix || normalizePersianText(preset.titleFa).includes(rawPrefix) || normalizePersianText(preset.subtitleFa).includes(rawPrefix)) {
        suggestions.push({
          id: `preset_${suggestions.length + 1}`,
          type: 'common_filter',
          titleFa: preset.titleFa,
          subtitleFa: preset.subtitleFa,
          filterPatch: preset.patch,
        });
      }
    }

    return suggestions.slice(0, limit);
  }

  // ============================================================================
  // SAVED SEARCHES (OWNED BY PROPERTY-SEARCH MODULE)
  // ============================================================================

  public async saveSearch(ownerUid: string, input: SaveSearchInput): Promise<StoredPropertySavedSearch> {
    if (!this.savedSearchRepo) {
      throw new Error('SAVED_SEARCH_REPO_UNAVAILABLE: Saved search repository adapter is not configured.');
    }
    if (!ownerUid || ownerUid.trim().length === 0) {
      throw new Error('UNAUTHENTICATED: Valid ownerUid is required to save a search.');
    }

    const nowIso = new Date(this.nowFn()).toISOString();
    const savedSearchId = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: StoredPropertySavedSearch = {
      savedSearchId,
      ownerUid,
      titleFa: input.titleFa,
      filters: input.filters,
      sortMode: input.sortMode,
      notifyOnNewMatches: input.notifyOnNewMatches ?? false,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.savedSearchRepo.createSavedSearch(record);
    return record;
  }

  public async listUserSavedSearches(ownerUid: string, limit = 20): Promise<StoredPropertySavedSearch[]> {
    if (!this.savedSearchRepo) return [];
    if (!ownerUid) return [];
    return this.savedSearchRepo.listSavedSearchesByOwner(ownerUid, limit);
  }

  public async updateSavedSearch(
    ownerUid: string,
    savedSearchId: string,
    input: UpdateSavedSearchInput,
  ): Promise<StoredPropertySavedSearch> {
    if (!this.savedSearchRepo) {
      throw new Error('SAVED_SEARCH_REPO_UNAVAILABLE');
    }
    const existing = await this.savedSearchRepo.getSavedSearchById(savedSearchId);
    if (!existing) {
      throw new Error('SAVED_SEARCH_NOT_FOUND: Target saved search was not found.');
    }
    if (existing.ownerUid !== ownerUid) {
      throw new Error('FORBIDDEN_SAVED_SEARCH_OWNER_MISMATCH: You do not have permission to modify this saved search.');
    }

    const updated = await this.savedSearchRepo.updateSavedSearch(savedSearchId, ownerUid, {
      ...(input.titleFa ? { titleFa: input.titleFa } : {}),
      ...(input.filters ? { filters: input.filters } : {}),
      ...(input.sortMode !== undefined ? { sortMode: input.sortMode } : {}),
      ...(input.notifyOnNewMatches !== undefined ? { notifyOnNewMatches: input.notifyOnNewMatches } : {}),
    });

    if (!updated) {
      throw new Error('SAVED_SEARCH_UPDATE_FAILED');
    }
    return updated;
  }

  public async deleteSavedSearch(ownerUid: string, savedSearchId: string): Promise<boolean> {
    if (!this.savedSearchRepo) {
      throw new Error('SAVED_SEARCH_REPO_UNAVAILABLE');
    }
    const existing = await this.savedSearchRepo.getSavedSearchById(savedSearchId);
    if (!existing) {
      throw new Error('SAVED_SEARCH_NOT_FOUND: Target saved search was not found.');
    }
    if (existing.ownerUid !== ownerUid) {
      throw new Error('FORBIDDEN_SAVED_SEARCH_OWNER_MISMATCH: You do not have permission to delete this saved search.');
    }
    return this.savedSearchRepo.deleteSavedSearch(savedSearchId, ownerUid);
  }

  // ============================================================================
  // USER SEARCH HISTORY (REQUIRES PRIVACY CONSENT)
  // ============================================================================

  public async recordHistory(params: {
    userUid?: string;
    querySummaryFa: string;
    filters: StoredSearchHistoryRecord['filters'];
    resultCountSnapshot: number;
  }): Promise<void> {
    if (!this.historyRepo || !params.userUid) return;
    const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.historyRepo.recordQuery({
      historyId,
      userUid: params.userUid,
      querySummaryFa: params.querySummaryFa,
      filters: params.filters,
      resultCountSnapshot: params.resultCountSnapshot,
      recordedAtIso: new Date(this.nowFn()).toISOString(),
    });
  }

  public async listUserHistory(userUid: string, limit = 10): Promise<StoredSearchHistoryRecord[]> {
    if (!this.historyRepo || !userUid) return [];
    return this.historyRepo.getRecentQueries(userUid, limit);
  }

  public async clearUserHistory(userUid: string): Promise<void> {
    if (!this.historyRepo || !userUid) return;
    await this.historyRepo.clearHistory(userUid);
  }
}

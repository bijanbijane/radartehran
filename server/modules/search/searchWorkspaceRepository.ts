import type {
  SavedSearchAlertFrequency,
  SavedSearchRecord,
  SearchFilterSet,
  SearchHistoryEntry,
  SearchMatchState,
  SearchScope,
  SearchSortOption,
} from '../../../src/features/search/models/search.types';
import { normalizePersianSearchQuery, validateRawSearchQuery } from '../../../src/features/search/services/searchNormalizerAndPlanner';
import { containsSensitivePersonalPattern } from '../../../src/features/search/services/searchWorkspaceService';
import { getCanonicalSearchEngine } from './searchCompositionRoot';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';

interface UserSearchPreferences {
  historyRecordingEnabled: boolean;
  personalizationEnabled: boolean;
  revision: number;
}

interface PersistedSearchWorkspaceState {
  history: SearchHistoryEntry[];
  savedSearches: SavedSearchRecord[];
  matchStates: SearchMatchState[];
  preferencesByUid: Record<string, UserSearchPreferences>;
}

const workspaceRepo = new AtomicJsonRepository<PersistedSearchWorkspaceState>('search-workspace-state.json');

function defaultState(): PersistedSearchWorkspaceState {
  return { history: [], savedSearches: [], matchStates: [], preferencesByUid: {} };
}

export class SearchWorkspaceFileRepository {
  private state(): PersistedSearchWorkspaceState {
    return workspaceRepo.load(defaultState);
  }

  private save(next: PersistedSearchWorkspaceState): void {
    workspaceRepo.writeImmediate(next);
  }

  getPreferences(uid: string): UserSearchPreferences {
    const state = this.state();
    return state.preferencesByUid[uid] ?? {
      historyRecordingEnabled: true,
      personalizationEnabled: true,
      revision: 1,
    };
  }

  updatePreferences(uid: string, patch: Partial<UserSearchPreferences>): UserSearchPreferences {
    const state = this.state();
    const current = this.getPreferences(uid);
    const next: UserSearchPreferences = {
      ...current,
      ...patch,
      revision: current.revision + 1,
    };
    state.preferencesByUid[uid] = next;
    this.save(state);
    return next;
  }

  recordSearchHistory(params: {
    userId: string;
    rawQuery: string;
    scope: SearchScope;
    filters?: SearchFilterSet;
    resultCount: number;
  }): SearchHistoryEntry | null {
    const trimmed = params.rawQuery.trim();
    if (!trimmed || containsSensitivePersonalPattern(trimmed)) return null;
    const norm = normalizePersianSearchQuery(trimmed);
    const state = this.state();
    const entry: SearchHistoryEntry = {
      id: `hist-${Date.now()}`,
      userId: params.userId,
      rawQuery: trimmed,
      normalizedQuery: norm.normalizedQuery,
      scope: params.scope,
      filters: params.filters ?? {},
      resultCount: params.resultCount,
      createdAt: new Date().toISOString(),
    };
    const others = state.history.filter((h) => h.userId !== params.userId);
    const sameUser = state.history.filter((h) => h.userId === params.userId && h.normalizedQuery !== norm.normalizedQuery);
    state.history = [entry, ...sameUser.slice(0, 24), ...others];
    this.save(state);
    return entry;
  }

  listSearchHistory(uid: string): SearchHistoryEntry[] {
    return this.state().history.filter((h) => h.userId === uid);
  }

  clearSearchHistory(uid: string): void {
    const state = this.state();
    state.history = state.history.filter((h) => h.userId !== uid);
    this.save(state);
  }

  listSavedSearches(uid: string): SavedSearchRecord[] {
    return this.state().savedSearches.filter((s) => s.userId === uid);
  }

  createSavedSearch(params: {
    userId: string;
    titleFa: string;
    query: string;
    scope: SearchScope;
    filters: SearchFilterSet;
    sort?: SearchSortOption;
    alertFrequency?: SavedSearchAlertFrequency;
  }): SavedSearchRecord {
    const valid = validateRawSearchQuery(params.query);
    const searchOut = valid.valid
      ? getCanonicalSearchEngine().executeSearch({
          rawQuery: params.query,
          scope: params.scope,
          sort: params.sort ?? 'RELEVANCE',
          explicitFilters: params.filters,
          caller: { userId: params.userId, isAuthenticated: true, isAdmin: false },
        })
      : null;

    const alertFrequency = params.alertFrequency ?? 'OFF';
    const state = this.state();
    const rec: SavedSearchRecord = {
      id: `saved-${Date.now()}`,
      userId: params.userId,
      titleFa: params.titleFa,
      query: params.query,
      scope: params.scope,
      filters: params.filters,
      sort: params.sort ?? 'RELEVANCE',
      alertFrequency,
      channels: ['IN_APP'],
      status: 'ACTIVE',
      persistenceScope: 'ACCOUNT_PERSISTENT',
      notificationStatus: alertFrequency === 'OFF' ? 'ALERT_NOT_CONFIGURED' : 'SUBSCRIPTION_REQUIRED',
      matchedCount: searchOut?.totalCount ?? 0,
      unreadChangesCount: 0,
      lastCheckedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    state.savedSearches.unshift(rec);
    this.save(state);
    return rec;
  }

  deleteSavedSearch(uid: string, savedId: string): boolean {
    const state = this.state();
    const before = state.savedSearches.length;
    state.savedSearches = state.savedSearches.filter((s) => !(s.id === savedId && s.userId === uid));
    this.save(state);
    return state.savedSearches.length < before;
  }
}

export async function ensureSearchWorkspaceRepositoryHydrated(): Promise<PersistedSearchWorkspaceState> {
  return workspaceRepo.ensureRemoteHydrated(defaultState);
}

export function resetSearchWorkspaceRepositoryForTests(): void {
  workspaceRepo.resetInMemoryCacheForTests();
}
/**
 * @file src/platform/entity-detail/state/EntityDetailState.ts
 * @description State management and Workspace/Permission-isolated caching for Entity Detail pages (Stage 7).
 */

import type { EntityDetailModel, EntityDetailPageStatus, EntityType } from '../core/EntityDetailTypes';
import type { DetailSectionId } from '../sections/SectionRegistry';

export interface EntityDetailCacheKeyParams {
  userId: string;
  workspaceId: string;
  permissionVersion: number;
  entityType: EntityType;
  entityId: string;
}

export function buildEntityDetailCacheKey(params: EntityDetailCacheKeyParams): string {
  const u = String(params.userId || 'anon').trim();
  const w = String(params.workspaceId || 'default').trim();
  const v = Number.isFinite(params.permissionVersion) ? params.permissionVersion : 1;
  return `entity-detail:${u}:${w}:v${v}:${params.entityType}:${params.entityId}`;
}

export interface EntityDetailViewState {
  status: EntityDetailPageStatus;
  entity: EntityDetailModel | null;
  activeSectionId: DetailSectionId;
  failedSections: Partial<Record<DetailSectionId, string>>;
  isStale: boolean;
  errorMessageFa: string | null;
  loadedAt: number | null;
}

export class EntityDetailStateStore {
  private cache = new Map<string, { model: EntityDetailModel; storedAt: number; ttlMs: number }>();
  private state: EntityDetailViewState = {
    status: 'Initial',
    entity: null,
    activeSectionId: 'overview',
    failedSections: {},
    isStale: false,
    errorMessageFa: null,
    loadedAt: null,
  };

  public getState(): EntityDetailViewState {
    return { ...this.state, failedSections: { ...this.state.failedSections } };
  }

  public setLoading(): EntityDetailViewState {
    this.state = {
      ...this.state,
      status: 'Loading',
      errorMessageFa: null,
    };
    return this.getState();
  }

  public setEntityLoaded(
    model: EntityDetailModel,
    cacheKey?: string,
    ttlMs = 60_000,
    failedSections: Partial<Record<DetailSectionId, string>> = {}
  ): EntityDetailViewState {
    const now = Date.now();
    if (cacheKey) {
      this.cache.set(cacheKey, { model, storedAt: now, ttlMs });
    }
    const hasFailedSections = Object.keys(failedSections).length > 0;
    const derivedStatus: EntityDetailPageStatus =
      model.pageStatus && model.pageStatus !== 'Success'
        ? model.pageStatus
        : hasFailedSections
          ? 'Partial'
          : 'Success';

    this.state = {
      status: derivedStatus,
      entity: model,
      activeSectionId: this.state.activeSectionId,
      failedSections,
      isStale: derivedStatus === 'Stale',
      errorMessageFa: null,
      loadedAt: now,
    };
    return this.getState();
  }

  public setErrorStatus(status: EntityDetailPageStatus, errorMessageFa: string): EntityDetailViewState {
    this.state = {
      ...this.state,
      status,
      entity: status === 'Stale' || status === 'Conflict' ? this.state.entity : null,
      errorMessageFa,
    };
    return this.getState();
  }

  public setActiveSection(sectionId: DetailSectionId): EntityDetailViewState {
    this.state = {
      ...this.state,
      activeSectionId: sectionId,
    };
    return this.getState();
  }

  public getCachedEntity(cacheKey: string, now = Date.now()): { model: EntityDetailModel; isStale: boolean } | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    const isStale = now - entry.storedAt > entry.ttlMs;
    return { model: entry.model, isStale };
  }

  public invalidateForSecurityTransition(): void {
    this.cache.clear();
    this.state = {
      status: 'Initial',
      entity: null,
      activeSectionId: 'overview',
      failedSections: {},
      isStale: false,
      errorMessageFa: null,
      loadedAt: null,
    };
  }
}

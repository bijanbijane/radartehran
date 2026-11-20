/**
 * @file src/features/entity-detail/hooks/useEntityDetail.ts
 * @description React hook orchestrating Entity Detail state, cache isolation, request cancellation, and breadcrumb context (Stage 7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEntityDetailCacheKey,
  EntityContextResolver,
  EntityDetailRequestManager,
  EntityDetailStateStore,
  type DetailSectionId,
  type EntityDetailModel,
  type EntityDetailViewState,
  type EntityType,
} from '../../../platform/entity-detail';

export interface UseEntityDetailOptions {
  userId?: string;
  workspaceId?: string;
  permissionVersion?: number;
  initialEntity?: EntityDetailModel | null;
}

export function useEntityDetail(options: UseEntityDetailOptions = {}) {
  const userId = options.userId || 'anon';
  const workspaceId = options.workspaceId || 'default';
  const permissionVersion = options.permissionVersion ?? 1;

  const storeRef = useRef<EntityDetailStateStore | null>(null);
  if (!storeRef.current) storeRef.current = new EntityDetailStateStore();
  const requestManagerRef = useRef<EntityDetailRequestManager | null>(null);
  if (!requestManagerRef.current) requestManagerRef.current = new EntityDetailRequestManager();
  const contextResolverRef = useRef<EntityContextResolver | null>(null);
  if (!contextResolverRef.current) contextResolverRef.current = new EntityContextResolver();
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestManagerRef.current?.cancelInFlight();
    };
  }, []);

  const [viewState, setViewState] = useState<EntityDetailViewState>(() => {
    if (options.initialEntity) {
      const key = buildEntityDetailCacheKey({
        userId,
        workspaceId,
        permissionVersion,
        entityType: options.initialEntity.entityType,
        entityId: options.initialEntity.id,
      });
      return storeRef.current!.setEntityLoaded(options.initialEntity, key);
    }
    return storeRef.current!.getState();
  });

  const loadEntity = useCallback(
    async (
      entityType: EntityType,
      entityId: string,
      fetcher: (signal: AbortSignal) => Promise<EntityDetailModel>
    ) => {
      const cacheKey = buildEntityDetailCacheKey({
        userId,
        workspaceId,
        permissionVersion,
        entityType,
        entityId,
      });

      const cached = storeRef.current!.getCachedEntity(cacheKey);
      if (cached && !cached.isStale) {
        const next = storeRef.current!.setEntityLoaded(cached.model, cacheKey);
        if (isMountedRef.current) setViewState(next);
        return next;
      }

      if (isMountedRef.current) setViewState(storeRef.current!.setLoading());

      const outcome = await requestManagerRef.current!.executeFetch(
        { entityType, entityId, workspaceId, permissionVersion },
        async (_req, signal) => fetcher(signal)
      );

      if (outcome.aborted || !isMountedRef.current) {
        return storeRef.current!.getState();
      }

      if (outcome.model) {
        const next = storeRef.current!.setEntityLoaded(outcome.model, cacheKey);
        setViewState(next);
        return next;
      }

      const status =
        outcome.httpStatus === 404
          ? 'NotFound'
          : outcome.httpStatus === 403 || outcome.httpStatus === 401
            ? 'Restricted'
            : outcome.httpStatus === 409
              ? 'Conflict'
              : 'Error';
      const next = storeRef.current!.setErrorStatus(
        status,
        outcome.errorMessageFa || 'خطا در دریافت اطلاعات موجودیت'
      );
      setViewState(next);
      return next;
    },
    [userId, workspaceId, permissionVersion]
  );

  const selectSection = useCallback((sectionId: DetailSectionId) => {
    setViewState(storeRef.current!.setActiveSection(sectionId));
  }, []);

  const invalidateCache = useCallback(() => {
    requestManagerRef.current!.cancelInFlight();
    storeRef.current!.invalidateForSecurityTransition();
    setViewState(storeRef.current!.getState());
  }, []);

  const breadcrumbs = useMemo(() => {
    if (!viewState.entity) return [];
    return contextResolverRef.current!.buildBreadcrumbTrail({
      cityId: viewState.entity.cityId,
      cityNameFa: viewState.entity.cityNameFa,
      neighborhoodId: viewState.entity.neighborhoodId,
      neighborhoodNameFa: viewState.entity.neighborhoodNameFa,
      entityType: viewState.entity.entityType,
      entityId: viewState.entity.id,
      entityTitleFa: viewState.entity.title,
    });
  }, [viewState.entity]);

  return {
    viewState,
    breadcrumbs,
    loadEntity,
    selectSection,
    invalidateCache,
    contextResolver: contextResolverRef.current,
  };
}

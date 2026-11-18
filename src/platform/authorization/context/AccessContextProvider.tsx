/**
 * @file src/platform/authorization/context/AccessContextProvider.tsx
 * @description Unified React Provider for AccessContext, ActiveWorkspace, and PermissionVersion.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AccessContext, CanonicalBaseRole, ResourceTargetContext } from '../core/AccessContext';
import type { AccessDecision, ActionUiVisibilityState } from '../core/AccessDecision';
import type { CanonicalPermissionCode } from '../core/Permission';
import { evaluateAccessPolicy } from '../core/AccessPolicy';
import { adaptBackendAccessPayload, type RawBackendAccessPayload } from '../adapters/backendAccessAdapter';
import { switchAccessWorkspaceContext } from '../policies/workspacePolicy';
import { triggerPermissionInvalidation } from '../cache/permissionInvalidation';
import { ActiveWorkspaceReactContext } from './ActiveWorkspaceContext';
import { PermissionVersionReactContext } from './PermissionVersionContext';

export interface AccessControllerValue {
  context: AccessContext;
  checkAccess: (
    permission: CanonicalPermissionCode | string,
    resource?: ResourceTargetContext,
    defaultDeniedUiState?: Exclude<ActionUiVisibilityState, 'Visible'>
  ) => AccessDecision;
  switchWorkspace: (nextWorkspaceId: string | null, nextRole: CanonicalBaseRole) => void;
  recordStepUpVerification: () => void;
  bumpPermissionVersion: () => number;
}

const AccessControllerContext = createContext<AccessControllerValue | null>(null);

export interface AccessContextProviderProps {
  initialAccess?: AccessContext | RawBackendAccessPayload | null;
  children: React.ReactNode;
}

export const AccessContextProvider: React.FC<AccessContextProviderProps> = ({
  initialAccess,
  children,
}) => {
  const [context, setContext] = useState<AccessContext>(() => {
    if (initialAccess && 'personalRoles' in initialAccess) {
      return initialAccess;
    }
    return adaptBackendAccessPayload(initialAccess);
  });

  const [lastInvalidatedAtMs, setLastInvalidatedAtMs] = useState<number>(0);

  const checkAccess = useCallback(
    (
      permission: CanonicalPermissionCode | string,
      resource?: ResourceTargetContext,
      defaultDeniedUiState?: Exclude<ActionUiVisibilityState, 'Visible'>
    ): AccessDecision => {
      return evaluateAccessPolicy({
        permission,
        context,
        resource,
        defaultDeniedUiState,
      });
    },
    [context]
  );

  const switchWorkspace = useCallback((nextWorkspaceId: string | null, nextRole: CanonicalBaseRole) => {
    setContext((prev) => {
      triggerPermissionInvalidation({
        reason: 'WORKSPACE_SWITCHED',
        userId: prev.userId,
        workspaceId: prev.activeWorkspaceId,
        currentPermissionVersion: prev.permissionVersion,
      });
      setLastInvalidatedAtMs(Date.now());
      return switchAccessWorkspaceContext(prev, nextWorkspaceId, nextRole);
    });
  }, []);

  const recordStepUpVerification = useCallback(() => {
    setContext((prev) => ({
      ...prev,
      stepUpVerifiedAtMs: Date.now(),
      permissionVersion: prev.permissionVersion + 1,
    }));
  }, []);

  const bumpPermissionVersion = useCallback((): number => {
    let nextVer = 1;
    setContext((prev) => {
      nextVer = prev.permissionVersion + 1;
      triggerPermissionInvalidation({
        reason: 'ROLE_CHANGED',
        userId: prev.userId,
        workspaceId: prev.activeWorkspaceId,
        currentPermissionVersion: prev.permissionVersion,
      });
      setLastInvalidatedAtMs(Date.now());
      return {
        ...prev,
        permissionVersion: nextVer,
      };
    });
    return nextVer;
  }, []);

  const controllerValue = useMemo<AccessControllerValue>(
    () => ({
      context,
      checkAccess,
      switchWorkspace,
      recordStepUpVerification,
      bumpPermissionVersion,
    }),
    [context, checkAccess, switchWorkspace, recordStepUpVerification, bumpPermissionVersion]
  );

  const workspaceValue = useMemo(
    () => ({
      workspaceId: context.activeWorkspaceId,
      workspaceNameFa: context.activeWorkspaceId ? `فضای کاری (${context.activeWorkspaceId})` : 'فضای شخصی',
      workspaceType: context.activeWorkspaceType ?? 'personal',
      workspaceStatus: context.activeWorkspaceStatus ?? 'ACTIVE',
      activeRole: context.activeRole,
      switchWorkspace,
    }),
    [context, switchWorkspace]
  );

  const versionValue = useMemo(
    () => ({
      permissionVersion: context.permissionVersion,
      lastInvalidatedAtMs,
      bumpPermissionVersion,
    }),
    [context.permissionVersion, lastInvalidatedAtMs, bumpPermissionVersion]
  );

  return (
    <AccessControllerContext.Provider value={controllerValue}>
      <ActiveWorkspaceReactContext.Provider value={workspaceValue}>
        <PermissionVersionReactContext.Provider value={versionValue}>
          {children}
        </PermissionVersionReactContext.Provider>
      </ActiveWorkspaceReactContext.Provider>
    </AccessControllerContext.Provider>
  );
};

export function useAccessController(): AccessControllerValue {
  const ctx = useContext(AccessControllerContext);
  if (!ctx) {
    const fallbackCtx = adaptBackendAccessPayload(null);
    return {
      context: fallbackCtx,
      checkAccess: (permission, resource, defaultDeniedUiState) =>
        evaluateAccessPolicy({ permission, context: fallbackCtx, resource, defaultDeniedUiState }),
      switchWorkspace: () => {},
      recordStepUpVerification: () => {},
      bumpPermissionVersion: () => 1,
    };
  }
  return ctx;
}

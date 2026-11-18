/**
 * @file src/platform/authorization/policies/resourcePolicy.ts
 * @description Resource-level ownership, lock, and version conflict policies for Stage 25.
 */

import type { AccessContext, ResourceTargetContext } from '../core/AccessContext';

export interface ResourceOwnershipEvaluation {
  isOwner: boolean;
  isAssigned: boolean;
  isSameWorkspace: boolean;
  isSameCity: boolean;
  isLocked: boolean;
  hasVersionConflict: boolean;
}

export function evaluateResourceTarget(
  context: AccessContext,
  resource?: ResourceTargetContext,
  expectedVersion?: number
): ResourceOwnershipEvaluation {
  if (!resource) {
    return {
      isOwner: false,
      isAssigned: false,
      isSameWorkspace: Boolean(context.activeWorkspaceId),
      isSameCity: true,
      isLocked: false,
      hasVersionConflict: false,
    };
  }

  const isOwner = Boolean(
    context.userId && resource.ownerUserId && context.userId === resource.ownerUserId
  );
  const isAssigned = Boolean(
    isOwner ||
      (context.userId &&
        Array.isArray(resource.assignedUserIds) &&
        resource.assignedUserIds.includes(context.userId))
  );

  const targetWs = resource.workspaceId || resource.agencyId || resource.providerId;
  const isSameWorkspace = targetWs
    ? Boolean(context.activeWorkspaceId && context.activeWorkspaceId === targetWs)
    : Boolean(context.activeWorkspaceId);

  const isSameCity = resource.cityId
    ? !context.assignedCityIds ||
      context.assignedCityIds.length === 0 ||
      context.assignedCityIds.includes(resource.cityId)
    : true;

  const isLocked = Boolean(resource.isLocked);
  const hasVersionConflict =
    typeof expectedVersion === 'number' &&
    typeof resource.version === 'number' &&
    expectedVersion !== resource.version;

  return {
    isOwner,
    isAssigned,
    isSameWorkspace,
    isSameCity,
    isLocked,
    hasVersionConflict,
  };
}

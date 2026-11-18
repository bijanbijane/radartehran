/**
 * @file src/platform/authorization/cache/permissionInvalidation.ts
 * @description Immediate (< 100ms) permission and workspace cache invalidation coordinator.
 */

import { globalAccessDecisionCache } from './accessCachePolicy';

export type InvalidationTriggerReason =
  | 'LOGOUT'
  | 'ROLE_CHANGED'
  | 'WORKSPACE_SWITCHED'
  | 'PERMISSION_REVOKED'
  | 'TEMPORARY_GRANT_EXPIRED'
  | 'VERSION_CONFLICT_409'
  | 'ACCOUNT_LOCKED_423';

export interface InvalidationAuditRecord {
  reason: InvalidationTriggerReason;
  userId: string | null;
  workspaceId: string | null;
  nextPermissionVersion: number;
  invalidatedEntries: number;
  durationMs: number;
  timestampMs: number;
}

type InvalidationListener = (record: InvalidationAuditRecord) => void;

const listeners = new Set<InvalidationListener>();

export function subscribePermissionInvalidation(listener: InvalidationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function triggerPermissionInvalidation(params: {
  reason: InvalidationTriggerReason;
  userId?: string | null;
  workspaceId?: string | null;
  currentPermissionVersion?: number;
}): InvalidationAuditRecord {
  const startMs = performance.now();
  let invalidatedEntries = 0;

  if (params.reason === 'LOGOUT' || (!params.userId && !params.workspaceId)) {
    invalidatedEntries = globalAccessDecisionCache.size();
    globalAccessDecisionCache.clearAll();
  } else if (params.workspaceId && params.reason === 'WORKSPACE_SWITCHED') {
    invalidatedEntries = globalAccessDecisionCache.invalidateWorkspace(params.workspaceId);
    if (params.userId) {
      invalidatedEntries += globalAccessDecisionCache.invalidateUser(params.userId);
    }
  } else if (params.userId) {
    invalidatedEntries = globalAccessDecisionCache.invalidateUser(params.userId);
  }

  const nextPermissionVersion = (params.currentPermissionVersion ?? 1) + 1;
  const durationMs = Math.max(0, Number((performance.now() - startMs).toFixed(3)));

  const record: InvalidationAuditRecord = {
    reason: params.reason,
    userId: params.userId ?? null,
    workspaceId: params.workspaceId ?? null,
    nextPermissionVersion,
    invalidatedEntries,
    durationMs,
    timestampMs: Date.now(),
  };

  for (const listener of listeners) {
    try {
      listener(record);
    } catch {
      // Listener errors must never block invalidation
    }
  }

  return record;
}

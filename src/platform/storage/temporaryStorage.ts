/** @file src/platform/storage/temporaryStorage.ts — Form Draft Preservation During Token Expiry & Re-Authentication */
import { getActiveStorageBackend, readVersionedStorage, writeVersionedStorage } from './storageAdapter';

const DRAFT_SCHEMA_VERSION = 1;
const DEFAULT_DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes max retention

export interface PreservedFormDraft<T = Record<string, unknown>> {
  readonly formId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly routePath: string;
  readonly values: T;
  readonly savedAtIso: string;
}

export function saveFormDraftForReauth<T = Record<string, unknown>>(draft: PreservedFormDraft<T>): boolean {
  const key = `rt:temp:draft:${draft.userId}:${draft.workspaceId}:${draft.formId}`;
  const res = writeVersionedStorage({
    key,
    namespace: 'temporary',
    schemaVersion: DRAFT_SCHEMA_VERSION,
    value: draft,
    ttlMs: DEFAULT_DRAFT_TTL_MS,
    scopeKey: `${draft.userId}|${draft.workspaceId}`,
  });
  return res.ok;
}

export function restoreFormDraftAfterReauth<T = Record<string, unknown>>(params: {
  readonly userId: string;
  readonly workspaceId: string;
  readonly formId: string;
}): PreservedFormDraft<T> | null {
  const key = `rt:temp:draft:${params.userId}:${params.workspaceId}:${params.formId}`;
  return readVersionedStorage<PreservedFormDraft<T> | null>({
    key,
    expectedSchemaVersion: DRAFT_SCHEMA_VERSION,
    expectedScopeKey: `${params.userId}|${params.workspaceId}`,
    fallback: null,
  });
}

export function clearFormDraft(userId: string, workspaceId: string, formId: string): void {
  const backend = getActiveStorageBackend();
  backend.removeItem(`rt:temp:draft:${userId}:${workspaceId}:${formId}`);
}

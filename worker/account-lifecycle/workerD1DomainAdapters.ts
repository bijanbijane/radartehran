/**
 * Worker D1 domain deletion adapters (Stage D hardening).
 * Firestore-authoritative domains remain fail-closed until a trusted supplement is configured.
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import type {
  BatchDispositionResult,
  OwnedDomainRecordItem,
  UserOwnedDomainRepositoryAdapter,
  UserOwnedDomainSource,
} from '../../server/modules/account-lifecycle/types.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';
import { ALL_USER_OWNED_DOMAIN_SOURCES, DEPENDENT_PURGE_SOURCES } from '../../server/modules/account-lifecycle/types.ts';

async function runD1Mutation(db: D1DatabaseBinding, sql: string, ...values: unknown[]): Promise<number> {
  const result = await db.prepare(sql).bind(...values).run();
  if (!result.success) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', result.error || 'D1 domain mutation failed.', 503);
  }
  return result.meta?.changes ?? 0;
}

const FIRESTORE_AUTHORITATIVE_SOURCES = new Set<UserOwnedDomainSource>([
  'BARGAIN_LISTINGS',
  'BUYER_ALERTS',
  'SPONSOR_RECORDS',
  'FAVORITES_AND_WORKSPACES',
  'CROWD_CLAIMS',
]);

function failClosedFirestoreAdapter(source: UserOwnedDomainSource): UserOwnedDomainRepositoryAdapter {
  return {
    source,
    async fetchOwnedRecordsPage() {
      throw new AccountLifecycleError(
        'DOMAIN_ADAPTER_UNAVAILABLE',
        `Worker cannot purge Firestore-backed source "${source}" without legacy supplement; deletion cannot complete safely.`,
        503,
      );
    },
    async disposeOwnedRecordsBatch() {
      throw new AccountLifecycleError(
        'DOMAIN_ADAPTER_UNAVAILABLE',
        `Worker cannot purge Firestore-backed source "${source}" without legacy supplement.`,
        503,
      );
    },
  };
}

function createUploadSessionAdapter(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter {
  return {
    source: 'USER_PROFILE',
    async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
      const limit = Math.max(1, Math.min(50, pageSize));
      const cursorKey = cursor ?? '';
      const res = await db
        .prepare(
          `SELECT session_id, owner_uid, created_at_ms FROM upload_sessions
           WHERE owner_uid = ?1 AND session_id > ?2
           ORDER BY session_id ASC LIMIT ?3`,
        )
        .bind(targetUid, cursorKey, limit)
        .all<Record<string, unknown>>();
      if (!res.success || !Array.isArray(res.results)) throw new AccountLifecycleError('STORE_UNAVAILABLE', res.error || 'D1_DOMAIN_QUERY_FAILED', 503);
      const rows = res.results;
      const items: OwnedDomainRecordItem[] = rows.map((r) => ({
        recordId: String(r.session_id),
        ownerUid: String(r.owner_uid),
        source: 'USER_PROFILE',
        createdAtIso: new Date(Number(r.created_at_ms)).toISOString(),
        payload: { kind: 'upload_session' },
      }));
      const lastId = items.length > 0 ? items[items.length - 1].recordId : null;
      return {
        items,
        nextCursor: items.length === limit ? lastId : null,
        hasMore: items.length === limit,
      };
    },
    async disposeOwnedRecordsBatch({ targetUid, cursor, batchSize }): Promise<BatchDispositionResult> {
      const page = await this.fetchOwnedRecordsPage({ targetUid, cursor, pageSize: batchSize ?? 25 });
      const receipts = [];
      for (const item of page.items) {
        if (item.ownerUid !== targetUid) continue;
        await runD1Mutation(db, 'DELETE FROM upload_session_chunks WHERE session_id = ?1', item.recordId);
        const sessionChanges = await runD1Mutation(db, 'DELETE FROM upload_sessions WHERE session_id = ?1 AND owner_uid = ?2', item.recordId, targetUid);
        if (sessionChanges !== 1) throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Owned upload session could not be verified as deleted.', 503);
        receipts.push({
          recordId: item.recordId,
          source: 'USER_PROFILE',
          outcome: 'PERMANENTLY_DELETED',
          processedAtIso: new Date().toISOString(),
        });
      }
      return { receipts, nextCursor: page.nextCursor, hasMore: page.hasMore };
    },
  };
}

function createDataRequestsAdapter(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter {
  return {
    source: 'USER_PROFILE',
    async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
      const limit = Math.max(1, Math.min(50, pageSize));
      const cursorKey = cursor ?? '';
      const res = await db
        .prepare(
          `SELECT request_id, target_uid, requested_at_iso FROM account_data_requests
           WHERE target_uid = ?1 AND request_id > ?2
           ORDER BY request_id ASC LIMIT ?3`,
        )
        .bind(targetUid, cursorKey, limit)
        .all<Record<string, unknown>>();
      if (!res.success || !Array.isArray(res.results)) throw new AccountLifecycleError('STORE_UNAVAILABLE', res.error || 'D1_DOMAIN_QUERY_FAILED', 503);
      const rows = res.results;
      const items: OwnedDomainRecordItem[] = rows.map((r) => ({
        recordId: String(r.request_id),
        ownerUid: String(r.target_uid),
        source: 'USER_PROFILE',
        createdAtIso: String(r.requested_at_iso),
        payload: { kind: 'data_request' },
      }));
      const lastId = items.length > 0 ? items[items.length - 1].recordId : null;
      return {
        items,
        nextCursor: items.length === limit ? lastId : null,
        hasMore: items.length === limit,
      };
    },
    async disposeOwnedRecordsBatch({ targetUid, cursor, batchSize }) {
      const page = await this.fetchOwnedRecordsPage({ targetUid, cursor, pageSize: batchSize ?? 25 });
      const receipts = [];
      for (const item of page.items) {
        const deleted = await runD1Mutation(db, 'DELETE FROM account_data_requests WHERE request_id = ?1 AND target_uid = ?2', item.recordId, targetUid);
        if (deleted !== 1) throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Owned data request could not be verified as deleted.', 503);
        receipts.push({
          recordId: item.recordId,
          source: 'USER_PROFILE',
          outcome: 'PERMANENTLY_DELETED',
          processedAtIso: new Date().toISOString(),
        });
      }
      return { receipts, nextCursor: page.nextCursor, hasMore: page.hasMore };
    },
  };
}

/** Merged USER_PROFILE adapter: sessions first, then data requests (cursor encodes phase). */
function createUserProfileD1Adapter(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter {
  const sessions = createUploadSessionAdapter(db);
  const requests = createDataRequestsAdapter(db);

  const normalizedBatchSize = (size: number): number =>
    Math.max(1, Math.min(50, Math.trunc(size)));

  const encodeRequestCursor = (cursor: string | null, hasMore: boolean): string | null =>
    cursor ? `drq:${cursor}` : hasMore ? 'drq:' : null;

  return {
    source: 'USER_PROFILE',
    async fetchOwnedRecordsPage(params) {
      const limit = normalizedBatchSize(params.pageSize);
      if (params.cursor?.startsWith('drq:')) {
        const innerCursor = params.cursor === 'drq:' ? null : params.cursor.slice(4);
        return requests.fetchOwnedRecordsPage({ ...params, cursor: innerCursor, pageSize: limit });
      }

      const sessionPage = await sessions.fetchOwnedRecordsPage({ ...params, pageSize: limit });
      if (sessionPage.hasMore) return sessionPage;

      // Preserve the final short upload-session page and use only the remaining page capacity
      // for data requests. Returning only the request page would silently omit these sessions.
      const remaining = limit - sessionPage.items.length;
      if (remaining <= 0) {
        return { items: sessionPage.items, nextCursor: 'drq:', hasMore: true };
      }

      const requestPage = await requests.fetchOwnedRecordsPage({
        ...params,
        cursor: null,
        pageSize: remaining,
      });
      return {
        items: [...sessionPage.items, ...requestPage.items],
        nextCursor: encodeRequestCursor(requestPage.nextCursor, requestPage.hasMore),
        hasMore: requestPage.hasMore,
      };
    },
    async disposeOwnedRecordsBatch(params) {
      const limit = normalizedBatchSize(params.batchSize);
      if (params.cursor?.startsWith('drq:')) {
        const innerCursor = params.cursor === 'drq:' ? null : params.cursor.slice(4);
        return requests.disposeOwnedRecordsBatch({ ...params, cursor: innerCursor, batchSize: limit });
      }

      const sessionBatch = await sessions.disposeOwnedRecordsBatch({ ...params, batchSize: limit });
      if (sessionBatch.hasMore) return sessionBatch;

      // Keep the combined operation bounded by the caller's batchSize across both tables.
      const remaining = limit - sessionBatch.receipts.length;
      if (remaining <= 0) {
        return { ...sessionBatch, nextCursor: 'drq:', hasMore: true };
      }

      const requestBatch = await requests.disposeOwnedRecordsBatch({
        ...params,
        cursor: null,
        batchSize: remaining,
      });
      return {
        receipts: [...sessionBatch.receipts, ...requestBatch.receipts],
        nextCursor: encodeRequestCursor(requestBatch.nextCursor, requestBatch.hasMore),
        hasMore: requestBatch.hasMore,
      };
    },
  };
}

function createMediaMetadataD1Adapter(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter {
  return {
    source: 'MEDIA_METADATA',
    async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
      const limit = Math.max(1, Math.min(50, pageSize));
      const cursorKey = cursor ?? '';
      const res = await db
        .prepare(
          `SELECT object_id, owner_uid, created_at_iso FROM media_objects
           WHERE owner_uid = ?1 AND object_id > ?2
           ORDER BY object_id ASC LIMIT ?3`,
        )
        .bind(targetUid, cursorKey, limit)
        .all<Record<string, unknown>>();
      if (!res.success || !Array.isArray(res.results)) throw new AccountLifecycleError('STORE_UNAVAILABLE', res.error || 'D1_DOMAIN_QUERY_FAILED', 503);
      const rows = res.results;
      const items: OwnedDomainRecordItem[] = rows.map((r) => ({
        recordId: String(r.object_id),
        ownerUid: String(r.owner_uid),
        source: 'MEDIA_METADATA',
        createdAtIso: String(r.created_at_iso ?? new Date().toISOString()),
        payload: { kind: 'media_metadata' },
      }));
      const lastId = items.length > 0 ? items[items.length - 1].recordId : null;
      return {
        items,
        nextCursor: items.length === limit ? lastId : null,
        hasMore: items.length === limit,
      };
    },
    async disposeOwnedRecordsBatch({ targetUid, cursor, batchSize }) {
      const page = await this.fetchOwnedRecordsPage({ targetUid, cursor, pageSize: batchSize ?? 25 });
      const receipts = [];
      const nowIso = new Date().toISOString();
      for (const item of page.items) {
        if (item.ownerUid !== targetUid) continue;
        const updated = await runD1Mutation(
          db,
          `UPDATE media_objects SET lifecycle_state = 'PURGED', deletion_state = 'DELETED', updated_at_iso = ?1
           WHERE object_id = ?2 AND owner_uid = ?3`,
          nowIso,
          item.recordId,
          targetUid,
        );
        if (updated !== 1) throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Owned media metadata could not be verified as deleted.', 503);
        receipts.push({
          recordId: item.recordId,
          source: 'MEDIA_METADATA',
          outcome: 'PERMANENTLY_DELETED',
          processedAtIso: nowIso,
        });
      }
      return { receipts, nextCursor: page.nextCursor, hasMore: page.hasMore };
    },
  };
}

export function createWorkerD1DomainAdapters(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter[] {
  const bySource = new Map<UserOwnedDomainSource, UserOwnedDomainRepositoryAdapter>();
  bySource.set('USER_PROFILE', createUserProfileD1Adapter(db));
  bySource.set('MEDIA_METADATA', createMediaMetadataD1Adapter(db));
  for (const source of FIRESTORE_AUTHORITATIVE_SOURCES) {
    bySource.set(source, failClosedFirestoreAdapter(source));
  }
  return ALL_USER_OWNED_DOMAIN_SOURCES.map((s) => bySource.get(s)!);
}

export function workerD1AdapterSources(): readonly UserOwnedDomainSource[] {
  return DEPENDENT_PURGE_SOURCES;
}
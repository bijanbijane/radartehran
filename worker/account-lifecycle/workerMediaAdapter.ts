/**
 * Worker R2 + D1 media deletion adapter (Stage D).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import type { WorkerEnv } from '../types.ts';
import type { MediaDeletionCoordinationAdapter } from '../../server/modules/account-lifecycle/types.ts';
import type { AccountLifecycleActorContext } from '../../server/modules/account-lifecycle/types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';

export function createWorkerMediaDeletionAdapter(params: {
  /** Stage D orchestration database. Never used as the owner of media records. */
  db: D1DatabaseBinding;
  /** Must be the distinct D1 database that authoritatively owns media_objects. */
  authoritativeUserDataDb?: D1DatabaseBinding;
  mediaBucket?: WorkerEnv['MEDIA_BUCKET'];
  bucketName: string;
}): MediaDeletionCoordinationAdapter {
  const { mediaBucket, bucketName } = params;
  const db = params.authoritativeUserDataDb;
  if (!db) {
    const unavailable = () => new AccountLifecycleStoreError(
      'DOMAIN_ADAPTER_UNAVAILABLE',
      'Media deletion requires the authoritative USER_DB binding; Stage D lifecycle D1 cannot stand in for it.',
      503,
    );
    return {
      async listOwnedMediaPage() { throw unavailable(); },
      async deleteOwnedMediaObject() { throw unavailable(); },
    };
  }

  return {
    async listOwnedMediaPage({ targetUid, cursor, pageSize }) {
      const limit = Math.max(1, Math.min(50, pageSize));
      const cursorKey = cursor ?? '';
      const res = await db
        .prepare(
          `SELECT object_id, owner_uid, storage_key FROM media_objects
           WHERE owner_uid = ?1 AND deletion_state = 'ACTIVE' AND object_id > ?2
           ORDER BY object_id ASC LIMIT ?3`,
        )
        .bind(targetUid, cursorKey, limit)
        .all<Record<string, unknown>>();
      if (!res.success || !Array.isArray(res.results)) {
        throw new AccountLifecycleStoreError(
          'STORE_UNAVAILABLE',
          'Owned media could not be listed from D1; deletion cannot advance.',
          503,
        );
      }
      const rows = res.results;
      const items = rows.map((r) => ({
        objectId: String(r.object_id),
        ownerUid: String(r.owner_uid),
        storageKey: String(r.storage_key),
      }));
      const nextCursor = items.length > 0 ? items[items.length - 1].objectId : null;
      const nowIso = new Date().toISOString();
      return {
        mediaItems: items.map((i) => ({
          objectId: i.objectId,
          ownerUid: i.ownerUid,
          lifecycleState: 'ACTIVE',
          originalFileName: i.objectId,
          mimeType: 'application/octet-stream',
          byteSize: 0,
          createdAtIso: nowIso,
        })),
        nextCursor: items.length === limit ? nextCursor : null,
        hasMore: items.length === limit,
      };
    },

    async deleteOwnedMediaObject({ targetUid, objectId }) {
      const row = await d1FirstRow(
        db,
        `SELECT object_id, owner_uid, storage_key, bucket_name FROM media_objects WHERE object_id = ?1`,
        objectId,
      );
      if (!row) {
        return { objectId, status: 'ALREADY_DELETED' };
      }
      if (String(row.owner_uid) !== targetUid) {
        return { objectId, status: 'PENDING_RETRY', failureReason: 'OWNERSHIP_MISMATCH' };
      }
      const storageKey = String(row.storage_key);
      const rowBucket = String(row.bucket_name ?? bucketName);
      if (rowBucket !== bucketName) {
        return { objectId, status: 'PENDING_RETRY', failureReason: 'BUCKET_OWNERSHIP_MISMATCH' };
      }
      if (!mediaBucket) {
        return { objectId, status: 'PENDING_RETRY', failureReason: 'R2_MEDIA_BUCKET_UNAVAILABLE' };
      }
      try {
        await mediaBucket.delete(storageKey);
      } catch {
        return { objectId, status: 'PENDING_RETRY', failureReason: 'R2_DELETE_FAILED' };
      }
      const nowIso = new Date().toISOString();
      const updated = await db
        .prepare(
          `UPDATE media_objects SET deletion_state = 'DELETED', lifecycle_state = 'PURGED', updated_at_iso = ?1, deleted_at_iso = ?1 WHERE object_id = ?2 AND owner_uid = ?3`,
        )
        .bind(nowIso, objectId, targetUid)
        .run();
      if (!updated.success || (updated.meta?.changes ?? 0) !== 1) {
        return { objectId, status: 'PENDING_RETRY', failureReason: 'D1_MEDIA_METADATA_UPDATE_FAILED' };
      }
      return { objectId, status: 'DELETED' };
    },
  };
}

export function createSystemMediaActor(targetUid: string): AccountLifecycleActorContext {
  return { uid: targetUid, isAdmin: true, freshAuthVerified: true };
}
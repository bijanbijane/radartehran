/**
 * Stage D dual-database write barrier.
 *
 * Lifecycle job state lives in the dedicated migrations/d1 database. User
 * mutation admission remains owned by the legacy migrations/user-d1 schema.
 * This module mirrors the Stage D job ID into USER_DB without overwriting an
 * unrelated active legacy deletion job or active write block.
 */
import type { D1Database } from '../types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';

export async function ensureUserDbDeletionWriteBlock(params: {
  userDb: D1Database;
  uid: string;
  jobId: string;
  reason?: string;
  nowIso?: string;
}): Promise<void> {
  const uid = String(params.uid || '').trim();
  const jobId = String(params.jobId || '').trim();
  if (!uid || uid.length > 128 || !jobId || jobId.length > 160) {
    throw new AccountLifecycleStoreError('WRITE_BLOCK_UNVERIFIED', 'User DB write-block identity is invalid.', 503);
  }

  const nowIso = params.nowIso ?? new Date().toISOString();
  const result = await params.userDb.prepare(
    `INSERT INTO account_write_blocks (
       uid, job_id, block_reason, blocked_at_iso, released_at_iso
     )
     SELECT ?1, ?2, ?3, ?4, NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM account_write_blocks
       WHERE uid = ?1 AND released_at_iso IS NULL AND job_id <> ?2
     )
     AND NOT EXISTS (
       SELECT 1 FROM account_deletion_jobs
       WHERE uid = ?1 AND completed_at_iso IS NULL AND job_id <> ?2
     )
     ON CONFLICT(uid) DO UPDATE SET
       job_id = excluded.job_id,
       block_reason = excluded.block_reason,
       blocked_at_iso = excluded.blocked_at_iso,
       released_at_iso = NULL
     WHERE account_write_blocks.released_at_iso IS NOT NULL
        OR account_write_blocks.job_id = excluded.job_id`,
  ).bind(uid, jobId, params.reason ?? 'STAGE_D_ACCOUNT_DELETION_ACTIVE', nowIso).run();

  if (!result.success) {
    throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'User DB deletion write block could not be persisted.', 503);
  }
  await assertUserDbDeletionWriteBlock({ userDb: params.userDb, uid, jobId });
}

export async function assertNoActiveUserDbLegalHold(params: {
  userDb: D1Database;
  uid: string;
}): Promise<void> {
  try {
    const row = await params.userDb.prepare(
      `SELECT resource_id, reason FROM legal_holds
       WHERE active = 1 AND resource_id IN (?1, ?2)
       LIMIT 1`,
    ).bind('user:' + params.uid, params.uid).first<{ resource_id: string; reason: string }>();
    if (row) {
      throw new AccountLifecycleStoreError(
        'LEGAL_HOLD_ACTIVE',
        String(row.reason || 'USER_UNDER_LEGAL_HOLD') + ' (' + String(row.resource_id) + ')',
        409,
      );
    }
  } catch (error) {
    if (error instanceof AccountLifecycleStoreError) throw error;
    throw new AccountLifecycleStoreError(
      'STORE_UNAVAILABLE',
      'USER_DB legal-hold status could not be verified; deletion is refused.',
      503,
    );
  }
}

export async function assertUserDbDeletionWriteBlock(params: {
  userDb: D1Database;
  uid: string;
  jobId: string;
}): Promise<void> {
  const row = await params.userDb.prepare(
    'SELECT uid, job_id, released_at_iso FROM account_write_blocks WHERE uid = ?1 LIMIT 1',
  ).bind(params.uid).first<{ uid: string; job_id: string; released_at_iso: string | null }>();

  if (!row || String(row.uid) !== params.uid || String(row.job_id) !== params.jobId || row.released_at_iso != null) {
    throw new AccountLifecycleStoreError(
      'WRITE_BLOCK_UNVERIFIED',
      'User DB write block is missing, released, or belongs to a different deletion job.',
      503,
    );
  }
}


/**
 * Rebinds a USER_DB reservation to the authoritative Stage D job ID when a
 * concurrent pre-existing Stage D job wins createOrGetActiveJob().
 * The compare-and-set predicate prevents replacing another account's block.
 */
export async function rebindUserDbDeletionWriteBlock(params: {
  userDb: D1Database;
  uid: string;
  reservedJobId: string;
  authoritativeJobId: string;
  nowIso?: string;
}): Promise<void> {
  if (params.reservedJobId === params.authoritativeJobId) {
    await assertUserDbDeletionWriteBlock({
      userDb: params.userDb,
      uid: params.uid,
      jobId: params.authoritativeJobId,
    });
    return;
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  const result = await params.userDb.prepare(
    `UPDATE account_write_blocks
     SET job_id = ?1, block_reason = ?2, blocked_at_iso = ?3
     WHERE uid = ?4 AND job_id = ?5 AND released_at_iso IS NULL`,
  ).bind(
    params.authoritativeJobId,
    'STAGE_D_ACCOUNT_DELETION_ACTIVE',
    nowIso,
    params.uid,
    params.reservedJobId,
  ).run();
  if (!result.success) {
    throw new AccountLifecycleStoreError(
      'STORE_UNAVAILABLE',
      'USER_DB deletion barrier could not be rebound to the authoritative lifecycle job.',
      503,
    );
  }
  if ((result.meta?.changes ?? 0) !== 1) {
    const row = await params.userDb.prepare(
      'SELECT uid, job_id, released_at_iso FROM account_write_blocks WHERE uid = ?1 LIMIT 1',
    ).bind(params.uid).first<{ uid: string; job_id: string; released_at_iso: string | null }>();
    if (!row || row.job_id !== params.authoritativeJobId || row.released_at_iso != null) {
      throw new AccountLifecycleStoreError(
        'WRITE_BLOCK_UNVERIFIED',
        'USER_DB deletion barrier reservation changed before it could be rebound.',
        503,
      );
    }
  }
  await assertUserDbDeletionWriteBlock({
    userDb: params.userDb,
    uid: params.uid,
    jobId: params.authoritativeJobId,
  });
}

/**
 * Rolls back only the exact pre-job reservation owned by the failed request.
 * If the row has been rebound or replaced, this function never releases it.
 */
export async function releaseUserDbDeletionWriteBlockIfOwned(params: {
  userDb: D1Database;
  uid: string;
  reservedJobId: string;
  nowIso?: string;
}): Promise<void> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const result = await params.userDb.prepare(
    `UPDATE account_write_blocks
     SET released_at_iso = ?1
     WHERE uid = ?2 AND job_id = ?3 AND released_at_iso IS NULL`,
  ).bind(nowIso, params.uid, params.reservedJobId).run();
  if (!result.success) {
    throw new AccountLifecycleStoreError(
      'STORE_UNAVAILABLE',
      'Uncommitted USER_DB deletion barrier reservation could not be rolled back.',
      503,
    );
  }
  const row = await params.userDb.prepare(
    'SELECT uid, job_id, released_at_iso FROM account_write_blocks WHERE uid = ?1 LIMIT 1',
  ).bind(params.uid).first<{ uid: string; job_id: string; released_at_iso: string | null }>();
  if (row && row.job_id === params.reservedJobId && row.released_at_iso == null) {
    throw new AccountLifecycleStoreError(
      'WRITE_BLOCK_UNVERIFIED',
      'Uncommitted USER_DB deletion barrier reservation remains active after rollback.',
      503,
    );
  }
}

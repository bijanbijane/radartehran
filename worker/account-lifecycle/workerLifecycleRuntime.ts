/**
 * @file worker/account-lifecycle/workerLifecycleRuntime.ts
 * @description Durable Account Deletion & Cross-Domain Research Erasure Outbox Orchestrator.
 *
 * Architectural & Privacy Invariants (RT-DB-TRIAD-001):
 * - Coordinates deletion authoritatively on `USER_DB` with Legal Hold guard, write blocking,
 *   mutation permit drain, atomic auth disable (`DISABLE_USER`), and PII cleanup.
 * - Cross-domain erasure into `RESEARCH_DB` uses a durable Outbox (`research_erasure_outbox`)
 *   containing ONLY `(subject_key, subject_key_version)` — NEVER raw Firebase UID!
 * - An account deletion job NEVER transitions to `COMPLETED` until verifiable erasure receipts
 *   are recorded for ALL outbox items (handles transient RESEARCH_DB failures via retryable Outbox).
 * - Preserves minimal compliance deletion receipts using keyed HMAC-SHA256 `uid_hash`
 *   (sensitive pseudonymous compliance digest; never claims cross-D1 single-transaction atomicity).
 */
import { recordUserRevocationInD1 } from '../auth/authRevocationStore';
import { requireUserDb, resolveResearchDb } from '../db/bindingResolver';
import { deriveAllSubjectKeysForErasure, hashUidForComplianceReceipt } from '../research/pseudonymizer';
import { executeResearchSubjectErasure } from '../research/researchService';
import type { D1Database, WorkerEnv } from '../types';
import { blockUserWritesInD1, countActiveMutationPermitsInD1 } from './d1MutationPermit';

export type AccountDeletionJobStatus =
  | 'INITIATED'
  | 'BLOCKED_LEGAL_HOLD'
  | 'PENDING_PERMIT_DRAIN'
  | 'PENDING_RESEARCH_ERASURE'
  | 'COMPLETED'
  | 'FAILED';

export function resolveDedicatedLifecycleReceiptSecret(env: WorkerEnv): string | null {
  const secret = String(env.LIFECYCLE_RECEIPT_HMAC_SECRET || '').trim();
  if (new TextEncoder().encode(secret).byteLength < 32) return null;
  const otherSecrets = [
    env.INTERNAL_LIFECYCLE_RPC_SECRET,
    env.RESEARCH_HMAC_SECRET,
    env.AUTH_INTERNAL_HMAC_SECRET,
    env.AUTH_PII_HMAC_SECRET,
    env.MARKET_PII_HASH_SECRET,
    env.R2_SIGNING_SECRET,
    env.OBJECT_STORAGE_SIGNING_SECRET,
    env.IRNI_PUBLISH_HMAC_SECRET,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return otherSecrets.includes(secret) ? null : secret;
}

export interface AccountDeletionExecutionResult {
  readonly ok: boolean;
  readonly statusCode: 200 | 202 | 409 | 423 | 503;
  readonly jobId: string;
  readonly status: AccountDeletionJobStatus;
  readonly idempotentReplay: boolean;
  readonly userDbDeletedRecords: number;
  readonly outboxItemsQueued: number;
  readonly outboxItemsCompleted: number;
  readonly researchEventsErased: number;
  readonly receiptHash: string | null;
  readonly code: string;
}

async function hasActiveUserLegalHold(userDb: D1Database, uid: string): Promise<{ held: boolean; reason?: string }> {
  const row = await userDb
    .prepare('SELECT active, reason FROM legal_holds WHERE resource_id = ?1 AND active = 1')
    .bind(`user:${uid}`)
    .first<{ active: number; reason: string }>();
  if (row && Number(row.active) === 1) {
    return { held: true, reason: row.reason || 'USER_UNDER_LEGAL_HOLD' };
  }
  const rawUidRow = await userDb
    .prepare('SELECT active, reason FROM legal_holds WHERE resource_id = ?1 AND active = 1')
    .bind(uid)
    .first<{ active: number; reason: string }>();
  if (rawUidRow && Number(rawUidRow.active) === 1) {
    return { held: true, reason: rawUidRow.reason || 'USER_UNDER_LEGAL_HOLD' };
  }
  return { held: false };
}

/**
 * Processes pending `research_erasure_outbox` records from `USER_DB` against `RESEARCH_DB`.
 * Transitions parent `account_deletion_jobs` to `COMPLETED` ONLY when every outbox entry has a
 * verifiable receipt from `RESEARCH_DB`.
 */
export async function processPendingResearchErasureOutbox(params: {
  userDb: D1Database;
  researchDb?: D1Database;
  jobId?: string;
  nowMs?: number;
  receiptSecret: string;
}): Promise<{
  readonly attempted: number;
  readonly completed: number;
  readonly pending: number;
  readonly erasedEventsTotal: number;
}> {
  const receiptSecret = resolveDedicatedLifecycleReceiptSecret({ LIFECYCLE_RECEIPT_HMAC_SECRET: params.receiptSecret } as WorkerEnv);
  if (!receiptSecret) throw new Error('LIFECYCLE_RECEIPT_HMAC_SECRET_MISSING_WEAK_OR_REUSED');
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const outboxRowsRes = params.jobId
    ? await params.userDb
        .prepare(
          `SELECT * FROM research_erasure_outbox
           WHERE job_id = ?1 AND status IN ('PENDING', 'RETRY_PENDING') AND next_retry_at_ms <= ?2`,
        )
        .bind(params.jobId, nowMs)
        .all<Record<string, unknown>>()
    : await params.userDb
        .prepare(
          `SELECT * FROM research_erasure_outbox
           WHERE status IN ('PENDING', 'RETRY_PENDING') AND next_retry_at_ms <= ?1
           LIMIT 50`,
        )
        .bind(nowMs)
        .all<Record<string, unknown>>();

  if (!outboxRowsRes.success) throw new Error('RESEARCH_ERASURE_OUTBOX_READ_FAILED');
  const rows = outboxRowsRes.results ?? [];
  let attempted = 0;
  let completed = 0;
  let pending = 0;
  let erasedEventsTotal = 0;
  const touchedJobIds = new Set<string>();

  for (const row of rows) {
    const outboxId = String(row.outbox_id);
    const jobId = String(row.job_id);
    const subjectKey = String(row.subject_key);
    const subjectKeyVersion = String(row.subject_key_version);
    const attempts = Number(row.attempt_count ?? 0) + 1;
    touchedJobIds.add(jobId);
    attempted += 1;

    if (!params.researchDb) {
      const backoffMs = Math.min(300_000, 10_000 * Math.pow(2, Math.min(attempts, 5)));
      const retryUpdate = await params.userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'RETRY_PENDING', attempt_count = attempt_count + 1, next_retry_at_ms = ?1,
               last_error_code = 'RESEARCH_DB_UNAVAILABLE', updated_at_iso = ?2
           WHERE outbox_id = ?3 AND status IN ('PENDING', 'RETRY_PENDING')`,
        )
        .bind(nowMs + backoffMs, nowIso, outboxId)
        .run();
      if (!retryUpdate.success) throw new Error('RESEARCH_ERASURE_UNAVAILABLE_RETRY_STATE_UPDATE_FAILED');

      // A competing Worker may have completed this item after our pending-row scan.
      // The unavailable-DB path must never downgrade that durable completion.
      if ((retryUpdate.meta?.changes ?? 0) === 0) {
        const currentOutbox = await params.userDb
          .prepare('SELECT status, erased_events_count FROM research_erasure_outbox WHERE outbox_id = ?1')
          .bind(outboxId)
          .first<{ status: string; erased_events_count: number }>();
        if (
          currentOutbox?.status === 'COMPLETED' &&
          Number.isSafeInteger(Number(currentOutbox.erased_events_count)) &&
          Number(currentOutbox.erased_events_count) >= 0
        ) {
          completed += 1;
          erasedEventsTotal += Number(currentOutbox.erased_events_count);
          continue;
        }
      }
      pending += 1;
      continue;
    }

    try {
      const erasureRes = await executeResearchSubjectErasure({
        researchDb: params.researchDb,
        outboxId,
        subjectKey,
        subjectKeyVersion,
        nowMs,
      });

      // Remove subject key mapping from USER_DB registry ONLY after verifiable RESEARCH_DB receipt
      const registryDelete = await params.userDb
        .prepare('DELETE FROM user_research_subject_registry WHERE subject_key = ?1 AND subject_key_version = ?2')
        .bind(subjectKey, subjectKeyVersion)
        .run();
      if (!registryDelete.success) throw new Error('RESEARCH_SUBJECT_REGISTRY_DELETE_FAILED');

      const outboxComplete = await params.userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'COMPLETED', attempt_count = ?1, receipt_id = ?2,
               erased_events_count = ?3, last_error_code = NULL,
               updated_at_iso = ?4, completed_at_iso = ?5
           WHERE outbox_id = ?6`,
        )
        .bind(attempts, erasureRes.receiptId, erasureRes.deletedEventsCount, nowIso, erasureRes.completedAtIso, outboxId)
        .run();
      if (!outboxComplete.success || (outboxComplete.meta?.changes ?? 0) !== 1) {
        throw new Error('RESEARCH_ERASURE_OUTBOX_COMPLETION_UNCONFIRMED');
      }

      erasedEventsTotal += erasureRes.deletedEventsCount;
      completed += 1;
    } catch {
      const backoffMs = Math.min(300_000, 10_000 * Math.pow(2, Math.min(attempts, 5)));
      const retryUpdate = await params.userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'RETRY_PENDING', attempt_count = ?1, next_retry_at_ms = ?2,
               last_error_code = 'RESEARCH_ERASURE_EXECUTION_FAILED', updated_at_iso = ?3
           WHERE outbox_id = ?4 AND status IN ('PENDING', 'RETRY_PENDING')`,
        )
        .bind(attempts, nowMs + backoffMs, nowIso, outboxId)
        .run();
      if (!retryUpdate.success) throw new Error('RESEARCH_ERASURE_RETRY_STATE_UPDATE_FAILED');

      // A competing Worker may have completed this outbox item after our attempt failed.
      // Never downgrade its durable COMPLETED state back to RETRY_PENDING.
      if ((retryUpdate.meta?.changes ?? 0) === 0) {
        const currentOutbox = await params.userDb
          .prepare('SELECT status, erased_events_count FROM research_erasure_outbox WHERE outbox_id = ?1')
          .bind(outboxId)
          .first<{ status: string; erased_events_count: number }>();
        if (
          currentOutbox?.status === 'COMPLETED' &&
          Number.isSafeInteger(Number(currentOutbox.erased_events_count)) &&
          Number(currentOutbox.erased_events_count) >= 0
        ) {
          completed += 1;
          erasedEventsTotal += Number(currentOutbox.erased_events_count);
          continue;
        }
      }
      pending += 1;
    }
  }

  // Recover parent jobs whose outbox items were completed by a previous invocation
  // but whose parent status update was interrupted.
  const alreadyCompletedJobs = await params.userDb
    .prepare(
      `SELECT j.job_id
       FROM account_deletion_jobs j
       WHERE j.status = 'PENDING_RESEARCH_ERASURE'
         AND EXISTS (SELECT 1 FROM research_erasure_outbox o WHERE o.job_id = j.job_id)
         AND NOT EXISTS (
           SELECT 1 FROM research_erasure_outbox o
           WHERE o.job_id = j.job_id AND o.status != 'COMPLETED'
         )
       LIMIT 50`,
    )
    .all<{ job_id: string }>();
  if (!alreadyCompletedJobs.success) throw new Error('RESEARCH_ERASURE_COMPLETED_JOB_SCAN_FAILED');
  for (const row of alreadyCompletedJobs.results ?? []) {
    if (row.job_id) touchedJobIds.add(String(row.job_id));
  }

  // Reconcile parent deletion jobs: mark COMPLETED only when 0 incomplete outbox entries remain
  for (const jobId of touchedJobIds) {
    const remainingRow = await params.userDb
      .prepare(`SELECT COUNT(*) AS cnt FROM research_erasure_outbox WHERE job_id = ?1 AND status != 'COMPLETED'`)
      .bind(jobId)
      .first<{ cnt: number }>();

    if (!remainingRow || !Number.isFinite(Number(remainingRow.cnt)) || Number(remainingRow.cnt) < 0) {
      throw new Error('RESEARCH_ERASURE_OUTBOX_RECONCILIATION_UNAVAILABLE');
    }
    if (Number(remainingRow.cnt) === 0) {
      const jobRow = await params.userDb
        .prepare('SELECT uid FROM account_deletion_jobs WHERE job_id = ?1')
        .bind(jobId)
        .first<{ uid: string }>();
      if (!jobRow?.uid) throw new Error('ACCOUNT_DELETION_JOB_UID_MISSING_DURING_RECONCILIATION');

      const completionSummary = await params.userDb
        .prepare(
          `SELECT COUNT(*) AS completed_count,
                  COALESCE(SUM(erased_events_count), 0) AS erased_events_total
           FROM research_erasure_outbox
           WHERE job_id = ?1 AND status = 'COMPLETED'`,
        )
        .bind(jobId)
        .first<{ completed_count: number; erased_events_total: number }>();
      if (
        !completionSummary ||
        !Number.isFinite(Number(completionSummary.completed_count)) ||
        !Number.isFinite(Number(completionSummary.erased_events_total))
      ) {
        throw new Error('RESEARCH_ERASURE_COMPLETION_SUMMARY_UNAVAILABLE');
      }

      const uidHash = await hashUidForComplianceReceipt(jobRow.uid, params.receiptSecret);
      const receiptId = `rcpt_res_${jobId}`;

      const receiptInsert = await params.userDb
        .prepare(
          `INSERT OR IGNORE INTO account_lifecycle_receipts (
            receipt_id, job_id, uid_hash, stage, subsystem, status,
            deleted_records_count, evidence_json, recorded_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          receiptId,
          jobId,
          uidHash,
          'RESEARCH_ERASURE_CONFIRMED',
          'RESEARCH_DB',
          'COMPLETED',
          Number(completionSummary.erased_events_total),
          JSON.stringify({
            completedOutboxItems: Number(completionSummary.completed_count),
            erasedEventsTotal: Number(completionSummary.erased_events_total),
          }),
          nowIso,
        )
        .run();
      if (!receiptInsert.success) throw new Error('RESEARCH_ERASURE_RECEIPT_INSERT_FAILED');

      const jobComplete = await params.userDb
        .prepare(
          `UPDATE account_deletion_jobs
           SET status = 'COMPLETED', stage = 'COMPLETED', receipt_hash = ?1,
               updated_at_iso = ?2, completed_at_iso = ?3
           WHERE job_id = ?4`,
        )
        .bind(uidHash, nowIso, nowIso, jobId)
        .run();
      if (!jobComplete.success || (jobComplete.meta?.changes ?? 0) !== 1) {
        throw new Error('ACCOUNT_DELETION_COMPLETION_UNCONFIRMED');
      }
    }
  }

  return { attempted, completed, pending, erasedEventsTotal };
}

/**
 * Initiates and executes the durable account deletion lifecycle across `USER_DB` and `RESEARCH_DB`.
 */
export async function executeAccountDeletionLifecycle(params: {
  env: WorkerEnv;
  uid: string;
  actorUid: string;
  idempotencyKey: string;
  reason?: string;
  nowMs?: number;
}): Promise<AccountDeletionExecutionResult> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    return {
      ok: false,
      statusCode: 503,
      jobId: '',
      status: 'FAILED',
      idempotentReplay: false,
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: userDbRes.code,
    };
  }
  const userDb = userDbRes.db;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const receiptSecret = resolveDedicatedLifecycleReceiptSecret(params.env);
  if (!receiptSecret) {
    return {
      ok: false,
      statusCode: 503,
      jobId: '',
      status: 'FAILED',
      idempotentReplay: false,
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: 'LIFECYCLE_RECEIPT_HMAC_SECRET_MISSING_WEAK_OR_REUSED',
    };
  }

  // 1. Idempotency check (with resumable PENDING_PERMIT_DRAIN support)
  let resumedJobId: string | null = null;
  const existingJob = await userDb
    .prepare('SELECT * FROM account_deletion_jobs WHERE idempotency_key = ?1')
    .bind(params.idempotencyKey)
    .first<Record<string, unknown>>();
  if (existingJob) {
    if (String(existingJob.uid) !== params.uid) {
      return {
        ok: false,
        statusCode: 409,
        jobId: String(existingJob.job_id),
        status: String(existingJob.status) as AccountDeletionJobStatus,
        idempotentReplay: false,
        userDbDeletedRecords: 0,
        outboxItemsQueued: 0,
        outboxItemsCompleted: 0,
        researchEventsErased: 0,
        receiptHash: existingJob.receipt_hash ? String(existingJob.receipt_hash) : null,
        code: 'DELETION_IDEMPOTENCY_CONFLICT',
      };
    }
    const existingStatus = String(existingJob.status) as AccountDeletionJobStatus;
    if (existingStatus === 'PENDING_PERMIT_DRAIN' ||
        existingStatus === 'INITIATED' ||
        existingStatus === 'BLOCKED_LEGAL_HOLD') {
      // Recover interrupted requests and re-evaluate legal holds on retry.
      resumedJobId = String(existingJob.job_id);
    } else {
      return {
        ok: existingStatus === 'COMPLETED' || existingStatus === 'PENDING_RESEARCH_ERASURE',
        statusCode: existingStatus === 'COMPLETED' ? 200 : 202,
        jobId: String(existingJob.job_id),
        status: existingStatus,
        idempotentReplay: true,
        userDbDeletedRecords: 0,
        outboxItemsQueued: 0,
        outboxItemsCompleted: 0,
        researchEventsErased: 0,
        receiptHash: existingJob.receipt_hash ? String(existingJob.receipt_hash) : null,
        code: 'ACCOUNT_DELETION_IDEMPOTENT_REPLAY',
      };
    }
  }

  // 2. Legal Hold guard (fail-closed)
  const hold = await hasActiveUserLegalHold(userDb, params.uid);
  const jobId = resumedJobId ?? `adel_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  if (hold.held) {
    if (resumedJobId) {
      await userDb
        .prepare(
          `UPDATE account_deletion_jobs
           SET status = 'BLOCKED_LEGAL_HOLD', stage = 'LEGAL_HOLD_CHECK',
               legal_hold_blocked = 1, attempt_count = attempt_count + 1, updated_at_iso = ?1
           WHERE job_id = ?2`,
        )
        .bind(nowIso, jobId)
        .run();
    } else {
      await userDb
        .prepare(
          `INSERT INTO account_deletion_jobs (
            job_id, uid, idempotency_key, status, stage, requested_by_uid, reason,
            legal_hold_blocked, attempt_count, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, 'BLOCKED_LEGAL_HOLD', 'LEGAL_HOLD_CHECK', ?4, ?5, 1, 1, ?6, ?7)`,
        )
        .bind(jobId, params.uid, params.idempotencyKey, params.actorUid, hold.reason || 'LEGAL_HOLD', nowIso, nowIso)
        .run();
    }
    return {
      ok: false,
      statusCode: 423,
      jobId,
      status: 'BLOCKED_LEGAL_HOLD',
      idempotentReplay: false,
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: 'LEGAL_HOLD_ACTIVE',
    };
  }

  // 3. Create or resume durable job + block new writes immediately
  if (resumedJobId) {
    await userDb
      .prepare(
        `UPDATE account_deletion_jobs
         SET attempt_count = attempt_count + 1, updated_at_iso = ?1
         WHERE job_id = ?2`,
      )
      .bind(nowIso, jobId)
      .run();
  } else {
    await userDb
      .prepare(
        `INSERT INTO account_deletion_jobs (
          job_id, uid, idempotency_key, status, stage, requested_by_uid, reason,
          legal_hold_blocked, attempt_count, created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, 'INITIATED', 'WRITE_BLOCK', ?4, ?5, 0, 1, ?6, ?7)`,
      )
      .bind(jobId, params.uid, params.idempotencyKey, params.actorUid, params.reason || 'USER_REQUESTED_ERASURE', nowIso, nowIso)
      .run();
  }

  await blockUserWritesInD1({ userDb, uid: params.uid, jobId, nowIso });

  // 4. Verify in-flight mutation permits drained
  const activePermits = await countActiveMutationPermitsInD1(userDb, params.uid, nowMs);
  if (activePermits > 0) {
    await userDb
      .prepare(`UPDATE account_deletion_jobs SET status = 'PENDING_PERMIT_DRAIN', stage = 'PERMIT_DRAIN', updated_at_iso = ?1 WHERE job_id = ?2`)
      .bind(nowIso, jobId)
      .run();
    return {
      ok: false,
      statusCode: 409,
      jobId,
      status: 'PENDING_PERMIT_DRAIN',
      idempotentReplay: Boolean(resumedJobId),
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: 'ACTIVE_MUTATION_PERMITS_DRAINING',
    };
  }

  // 5. Atomically disable auth tokens + revoke sessions
  const revRes = await recordUserRevocationInD1({
    db: userDb,
    uid: params.uid,
    action: 'DISABLE_USER',
    actorUid: params.actorUid,
    reason: `ACCOUNT_DELETION:${jobId}`,
    idempotencyKey: `del_disable_${jobId}`,
    nowMs,
  });
  if (!revRes.applied) {
    return {
      ok: false,
      statusCode: 503,
      jobId,
      status: 'FAILED',
      idempotentReplay: false,
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: 'AUTH_DISABLE_FAILED',
    };
  }

  // 6. Collect all historical subject keys (registered + derived across active & rotated HMAC keys)
  const subjectKeyMap = new Map<string, { subjectKey: string; subjectKeyVersion: string }>();
  const regRes = await userDb
    .prepare('SELECT subject_key, subject_key_version FROM user_research_subject_registry WHERE uid = ?1')
    .bind(params.uid)
    .all<{ subject_key: string; subject_key_version: string }>();
  if (!regRes.success) throw new Error('RESEARCH_SUBJECT_REGISTRY_READ_FAILED');
  for (const row of regRes.results ?? []) {
    subjectKeyMap.set(`${row.subject_key_version}:${row.subject_key}`, {
      subjectKey: row.subject_key,
      subjectKeyVersion: row.subject_key_version,
    });
  }

  const derivedKeysRes = await deriveAllSubjectKeysForErasure({ uid: params.uid, env: params.env });
  if (derivedKeysRes.ok) {
    for (const k of derivedKeysRes.keys) {
      subjectKeyMap.set(`${k.subjectKeyVersion}:${k.subjectKey}`, k);
    }
  } else if (subjectKeyMap.size === 0) {
    // An absent RESEARCH_DB binding is not proof that historical research data do not exist.
    // Without a registry key or derivation secret, erasure scope cannot be established.
    return {
      ok: false,
      statusCode: 503,
      jobId,
      status: 'FAILED',
      idempotentReplay: false,
      userDbDeletedRecords: 0,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: null,
      code: 'code' in derivedKeysRes ? derivedKeysRes.code : 'RESEARCH_HMAC_SECRET_MISSING',
    };
  }

  // 7. Purge USER_DB personal data tables (including orphan upload_session_chunks & user_data_requests)
  // while keeping only a keyed pseudonymous compliance receipt in account_lifecycle_receipts.
  const deleteTables = [
    'DELETE FROM upload_session_chunks WHERE session_id IN (SELECT session_id FROM upload_sessions WHERE owner_uid = ?1)',
    'DELETE FROM upload_sessions WHERE owner_uid = ?1',
    'DELETE FROM user_profiles WHERE uid = ?1',
    'DELETE FROM user_privacy_consents WHERE uid = ?1',
    'DELETE FROM user_notification_channels WHERE uid = ?1',
    'DELETE FROM user_favorites WHERE uid = ?1',
    'DELETE FROM user_saved_searches WHERE uid = ?1',
    'DELETE FROM user_sessions WHERE uid = ?1',
    'DELETE FROM user_data_requests WHERE uid = ?1',
  ];
  let userDbDeletedRecords = 0;
  for (const sql of deleteTables) {
    const res = await userDb.prepare(sql).bind(params.uid).run();
    if (!res.success) throw new Error('USER_DB_ERASURE_DELETE_FAILED');
    userDbDeletedRecords += res.meta?.changes ?? 0;
  }

  const uidHash = await hashUidForComplianceReceipt(params.uid, receiptSecret);
  const userReceiptId = `rcpt_usr_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  const userReceipt = await userDb
    .prepare(
      `INSERT INTO account_lifecycle_receipts (
        receipt_id, job_id, uid_hash, stage, subsystem, status,
        deleted_records_count, evidence_json, recorded_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      userReceiptId,
      jobId,
      uidHash,
      'USER_DB_PURGED',
      'USER_DB',
      'COMPLETED',
      userDbDeletedRecords,
      JSON.stringify({ authDisabledEventId: revRes.eventId }),
      nowIso,
    )
    .run();
  if (!userReceipt.success) throw new Error('USER_DB_ERASURE_RECEIPT_INSERT_FAILED');

  // 8. Enqueue durable UID-FREE research_erasure_outbox items
  const subjectKeys = Array.from(subjectKeyMap.values());
  for (const sk of subjectKeys) {
    const outboxId = `rout_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
    const outboxInsert = await userDb
      .prepare(
        `INSERT INTO research_erasure_outbox (
          outbox_id, job_id, subject_key, subject_key_version, status,
          attempt_count, next_retry_at_ms, created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, ?4, 'PENDING', 0, 0, ?5, ?6)`,
      )
      .bind(outboxId, jobId, sk.subjectKey, sk.subjectKeyVersion, nowIso, nowIso)
      .run();
    if (!outboxInsert.success) throw new Error('RESEARCH_ERASURE_OUTBOX_INSERT_FAILED');
  }

  const pendingJobUpdate = await userDb
    .prepare(
      `UPDATE account_deletion_jobs
       SET status = 'PENDING_RESEARCH_ERASURE', stage = 'RESEARCH_ERASURE_OUTBOX',
           receipt_hash = ?1, updated_at_iso = ?2
       WHERE job_id = ?3`,
    )
    .bind(uidHash, nowIso, jobId)
    .run();
  if (!pendingJobUpdate.success || (pendingJobUpdate.meta?.changes ?? 0) !== 1) {
    throw new Error('ACCOUNT_DELETION_PENDING_STATE_UNCONFIRMED');
  }

  // 9. Attempt immediate Outbox -> RESEARCH_DB Inbox execution (falls back cleanly to retryable PENDING_RESEARCH_ERASURE if RESEARCH_DB fails/absent)
  const researchDb = resolveResearchDb(params.env);
  if (subjectKeys.length === 0) {
    const emptyOutboxCompletion = await userDb
      .prepare(
        `UPDATE account_deletion_jobs SET status = 'COMPLETED', stage = 'COMPLETED', updated_at_iso = ?1, completed_at_iso = ?2 WHERE job_id = ?3`,
      )
      .bind(nowIso, nowIso, jobId)
      .run();
    if (!emptyOutboxCompletion.success || (emptyOutboxCompletion.meta?.changes ?? 0) !== 1) {
      throw new Error('ACCOUNT_DELETION_EMPTY_OUTBOX_COMPLETION_UNCONFIRMED');
    }
    return {
      ok: true,
      statusCode: 200,
      jobId,
      status: 'COMPLETED',
      idempotentReplay: false,
      userDbDeletedRecords,
      outboxItemsQueued: 0,
      outboxItemsCompleted: 0,
      researchEventsErased: 0,
      receiptHash: uidHash,
      code: 'ACCOUNT_DELETION_COMPLETED',
    };
  }

  const outboxResult = await processPendingResearchErasureOutbox({
    userDb,
    researchDb,
    jobId,
    nowMs,
    receiptSecret,
  });

  const isComplete = outboxResult.pending === 0 && outboxResult.completed === subjectKeys.length;
  return {
    ok: true,
    statusCode: isComplete ? 200 : 202,
    jobId,
    status: isComplete ? 'COMPLETED' : 'PENDING_RESEARCH_ERASURE',
    idempotentReplay: false,
    userDbDeletedRecords,
    outboxItemsQueued: subjectKeys.length,
    outboxItemsCompleted: outboxResult.completed,
    researchEventsErased: outboxResult.erasedEventsTotal,
    receiptHash: uidHash,
    code: isComplete ? 'ACCOUNT_DELETION_COMPLETED' : 'ACCOUNT_DELETION_PENDING_RESEARCH_ERASURE',
  };
}

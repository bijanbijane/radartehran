/**
 * @file worker/research/researchConsentRevocation.ts
 * @description Durable consent revocation orchestration across USER_DB and RESEARCH_DB.
 * Consent is revoked in USER_DB first; leased permits drain before revision-scoped erasure.
 */
import {
  getUserPrivacyConsentFromD1,
  updateUserPrivacyConsentInD1,
} from '../account/d1AccountRepository';
import {
  processPendingResearchErasureOutbox,
  resolveDedicatedLifecycleReceiptSecret,
} from '../account-lifecycle/workerLifecycleRuntime';
import { requireUserDb, resolveResearchDb } from '../db/bindingResolver';
import type { WorkerEnv } from '../types';
import {
  countActiveResearchProcessingPermitsInD1,
  expireStaleResearchProcessingPermitsInD1,
  mapConsentRevocationJobRow,
  type ResearchConsentRevocationJobRecord,
} from './researchConsentBarrier';

export interface ResearchConsentRevocationResponse {
  readonly ok: boolean;
  readonly statusCode: 200 | 202 | 404 | 503;
  readonly status: 'DRAINING_PERMITS' | 'PENDING_ERASURE' | 'COMPLETED' | 'NOT_FOUND';
  readonly completed: boolean;
  readonly revocationId: string;
  readonly activePermitsRemaining: number;
  readonly expiredPermitsReclaimed: number;
  readonly erasedEventsCount: number;
  readonly receiptIds: string[];
  readonly idempotentReplay: boolean;
}

function toResponse(
  job: ResearchConsentRevocationJobRecord,
  activePermitsRemaining: number,
  expiredPermitsReclaimed: number,
  idempotentReplay = false,
): ResearchConsentRevocationResponse {
  const completed = job.status === 'COMPLETED';
  return {
    ok: true,
    statusCode: completed ? 200 : 202,
    status: job.status,
    completed,
    revocationId: job.revocationId,
    activePermitsRemaining,
    expiredPermitsReclaimed,
    erasedEventsCount: job.erasedEventsCount,
    receiptIds: job.receiptIds,
    idempotentReplay,
  };
}

async function readRevocationJob(userDb: Parameters<typeof getUserPrivacyConsentFromD1>[0], revocationId: string) {
  const row = await userDb
    .prepare('SELECT * FROM research_consent_revocation_jobs WHERE revocation_id = ?1')
    .bind(revocationId)
    .first<Record<string, unknown>>();
  return row ? mapConsentRevocationJobRow(row) : null;
}

async function cancelUnappliedRevocationIntent(
  userDb: Parameters<typeof getUserPrivacyConsentFromD1>[0],
  revocationId: string,
): Promise<void> {
  const results = await userDb.batch([
    userDb.prepare('DELETE FROM research_erasure_outbox WHERE job_id = ?1').bind(revocationId),
    userDb
      .prepare(
        `DELETE FROM research_consent_revocation_jobs
         WHERE revocation_id = ?1 AND status IN ('DRAINING_PERMITS', 'PENDING_ERASURE')`,
      )
      .bind(revocationId),
  ]);
  if (results.length !== 2 || results.some((result) => !result.success)) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_INTENT_CLEANUP_FAILED');
  }
}

export async function revokeUserResearchConsentWithBarrier(params: {
  env: WorkerEnv;
  uid: string;
  actorUid: string;
  nowMs?: number;
  behavioralTelemetryConsent?: boolean;
  marketingCommunicationsConsent?: boolean;
}): Promise<{
  privacy: Awaited<ReturnType<typeof getUserPrivacyConsentFromD1>>;
  revocation: (ResearchConsentRevocationResponse & { readonly revocationId: string }) | null;
}> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) throw new Error(userDbRes.code);
  const userDb = userDbRes.db;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const current = await getUserPrivacyConsentFromD1(userDb, params.uid);

  // A repeated revoke while draining must return the existing job, not advance the revision again.
  if (!current.researchAnalyticsConsent) {
    const existing = await userDb
      .prepare(
        `SELECT * FROM research_consent_revocation_jobs
         WHERE uid = ?1 AND new_consent_revision = ?2
         ORDER BY created_at_iso DESC LIMIT 1`,
      )
      .bind(params.uid, current.consentRevision)
      .first<Record<string, unknown>>();
    if (!existing) return { privacy: current, revocation: null };
    const job = mapConsentRevocationJobRow(existing);
    const active = await countActiveResearchProcessingPermitsInD1({
      userDb,
      uid: params.uid,
      maxConsentRevision: job.revokedConsentRevision,
      nowMs,
    });
    return {
      privacy: current,
      revocation: { ...toResponse(job, active, 0, true), revocationId: job.revocationId },
    };
  }

  const existingActiveJob = await userDb
    .prepare(
      `SELECT * FROM research_consent_revocation_jobs
       WHERE uid = ?1 AND status IN ('DRAINING_PERMITS', 'PENDING_ERASURE')
       ORDER BY created_at_iso DESC LIMIT 1`,
    )
    .bind(params.uid)
    .first<Record<string, unknown>>();

  let registryRows: Array<{ subject_key: string; subject_key_version: string }> = [];
  let privacy = current;
  let revocationId: string;
  let revokedConsentRevision: number;
  let newConsentRevision: number;

  if (existingActiveJob) {
    const existingJob = mapConsentRevocationJobRow(existingActiveJob);
    if (current.consentRevision !== existingJob.revokedConsentRevision) {
      await cancelUnappliedRevocationIntent(userDb, existingJob.revocationId);
      throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
    }
    // Recover a crash after the durable job/outbox commit but before consent was switched off.
    try {
      privacy = await updateUserPrivacyConsentInD1(userDb, {
        uid: params.uid,
        actorUid: params.actorUid,
        researchAnalyticsConsent: false,
        behavioralTelemetryConsent: params.behavioralTelemetryConsent,
        marketingCommunicationsConsent: params.marketingCommunicationsConsent,
        consentSource: 'research_consent_revocation_barrier',
        expectedConsentRevision: existingJob.revokedConsentRevision,
        nowIso,
      });
    } catch (error) {
      const latest = await getUserPrivacyConsentFromD1(userDb, params.uid);
      if (latest.researchAnalyticsConsent) {
        await cancelUnappliedRevocationIntent(userDb, existingJob.revocationId);
      }
      throw error;
    }
    if (privacy.consentRevision !== existingJob.newConsentRevision) {
      throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
    }
    revocationId = existingJob.revocationId;
    revokedConsentRevision = existingJob.revokedConsentRevision;
    newConsentRevision = existingJob.newConsentRevision;
  } else {
    const registry = await userDb
      .prepare(
        'SELECT subject_key, subject_key_version FROM user_research_subject_registry WHERE uid = ?1 ORDER BY subject_key_version, subject_key',
      )
      .bind(params.uid)
      .all<{ subject_key: string; subject_key_version: string }>();
    if (!registry.success) throw new Error('RESEARCH_SUBJECT_REGISTRY_READ_FAILED');
    registryRows = registry.results ?? [];

    revokedConsentRevision = current.consentRevision;
    newConsentRevision = current.consentRevision + 1;
    if (!Number.isSafeInteger(newConsentRevision)) throw new Error('CONSENT_REVISION_EXHAUSTED');
    const uidDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(params.uid));
    const uidSuffix = Array.from(new Uint8Array(uidDigest))
      .slice(0, 12)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    revocationId = `rrev_${current.consentRevision}_${uidSuffix}`;

    // Commit the durable revocation job and UID-free outbox BEFORE switching consent off.
    // Permit admission checks for this active job, so a crash here fails closed; reconcile
    // can finish the consent CAS without losing the erasure intent.
    const statements = [
      userDb
        .prepare(
          `INSERT OR IGNORE INTO research_consent_revocation_jobs (
            revocation_id, uid, revoked_consent_revision, new_consent_revision, status,
            erased_events_count, receipt_ids_json, created_at_iso, updated_at_iso, completed_at_iso
          ) VALUES (?1, ?2, ?3, ?4, 'DRAINING_PERMITS', 0, '[]', ?5, ?5, NULL)`,
        )
        .bind(revocationId, params.uid, revokedConsentRevision, newConsentRevision, nowIso),
      ...registryRows.map((subject) => {
        const outboxId = `rrevout_${revocationId}_${subject.subject_key_version}_${subject.subject_key}`;
        return userDb
          .prepare(
            `INSERT OR IGNORE INTO research_erasure_outbox (
              outbox_id, job_id, subject_key, subject_key_version, status, attempt_count,
              next_retry_at_ms, created_at_iso, updated_at_iso, max_consent_revision
            ) VALUES (?1, ?2, ?3, ?4, 'PENDING', 0, 0, ?5, ?5, ?6)`,
          )
          .bind(
            outboxId,
            revocationId,
            subject.subject_key,
            subject.subject_key_version,
            nowIso,
            newConsentRevision,
          );
      }),
    ];
    const writes = await userDb.batch(statements);
    if (writes.length !== statements.length || writes.some((result) => !result.success)) {
      throw new Error('RESEARCH_CONSENT_REVOCATION_OUTBOX_CREATE_FAILED');
    }

    try {
      privacy = await updateUserPrivacyConsentInD1(userDb, {
        uid: params.uid,
        actorUid: params.actorUid,
        researchAnalyticsConsent: false,
        behavioralTelemetryConsent: params.behavioralTelemetryConsent,
        marketingCommunicationsConsent: params.marketingCommunicationsConsent,
        consentSource: 'research_consent_revocation_barrier',
        expectedConsentRevision: revokedConsentRevision,
        nowIso,
      });
    } catch (error) {
      // A concurrent revoke with the same deterministic revision key may win the CAS.
      // Treat that exact durable outcome as idempotent; reject every other conflict.
      const latestPrivacy = await getUserPrivacyConsentFromD1(userDb, params.uid);
      const canonicalJob = await readRevocationJob(userDb, revocationId);
      if (latestPrivacy.researchAnalyticsConsent) {
        await cancelUnappliedRevocationIntent(userDb, revocationId);
        throw error;
      }
      if (
        latestPrivacy.consentRevision !== newConsentRevision ||
        !canonicalJob ||
        canonicalJob.uid !== params.uid ||
        canonicalJob.revokedConsentRevision !== revokedConsentRevision ||
        canonicalJob.newConsentRevision !== newConsentRevision
      ) throw error;
      privacy = latestPrivacy;
    }
    if (privacy.consentRevision !== newConsentRevision) {
      throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
    }
  }

  const expiredPermitsReclaimed = await expireStaleResearchProcessingPermitsInD1({
    userDb,
    uid: params.uid,
    nowMs,
  });
  const activePermitsRemaining = await countActiveResearchProcessingPermitsInD1({
    userDb,
    uid: params.uid,
    maxConsentRevision: revokedConsentRevision,
    nowMs,
  });
  // Never complete from the pre-barrier registry snapshot. A permit may have
  // registered a subject after that snapshot and finished before this count.
  // Reconciliation always performs the authoritative post-drain registry scan.
  const status = activePermitsRemaining > 0 ? 'DRAINING_PERMITS' : 'PENDING_ERASURE';
  const statusWrite = await userDb
    .prepare(
      `UPDATE research_consent_revocation_jobs
       SET status = ?1, updated_at_iso = ?2,
           completed_at_iso = CASE WHEN ?1 = 'COMPLETED' THEN ?2 ELSE NULL END
       WHERE revocation_id = ?3`,
    )
    .bind(status, nowIso, revocationId)
    .run();
  if (!statusWrite.success || (statusWrite.meta?.changes ?? 0) !== 1) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_STATUS_WRITE_FAILED');
  }

  // Always reconcile, even when the initial registry snapshot was empty. The
  // reconciliation pass re-reads registry state after all admitted permits drain.
  const reconciled = await reconcileResearchConsentRevocation({ env: params.env, revocationId, nowMs });
  return {
    privacy,
    revocation: {
      ...reconciled,
      expiredPermitsReclaimed: expiredPermitsReclaimed + reconciled.expiredPermitsReclaimed,
      revocationId,
    },
  };
}

export async function reconcileResearchConsentRevocation(params: {
  env: WorkerEnv;
  revocationId: string;
  nowMs?: number;
}): Promise<ResearchConsentRevocationResponse> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    return {
      ok: false,
      statusCode: 503,
      status: 'PENDING_ERASURE',
      completed: false,
      revocationId: params.revocationId,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      idempotentReplay: false,
    };
  }
  const userDb = userDbRes.db;
  const nowMs = params.nowMs ?? Date.now();
  const job = await readRevocationJob(userDb, params.revocationId);
  if (!job) {
    return {
      ok: false,
      statusCode: 404,
      status: 'NOT_FOUND',
      completed: false,
      revocationId: params.revocationId,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      idempotentReplay: false,
    };
  }
  if (job.status === 'COMPLETED') return toResponse(job, 0, 0, true);

  // Recover a crash between durable revocation intent creation and the consent CAS.
  const currentPrivacy = await getUserPrivacyConsentFromD1(userDb, job.uid);
  if (currentPrivacy.researchAnalyticsConsent) {
    if (currentPrivacy.consentRevision !== job.revokedConsentRevision) {
      await cancelUnappliedRevocationIntent(userDb, job.revocationId);
      throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
    }
    let revokedPrivacy;
    try {
      revokedPrivacy = await updateUserPrivacyConsentInD1(userDb, {
        uid: job.uid,
        actorUid: job.uid,
        researchAnalyticsConsent: false,
        consentSource: 'research_consent_revocation_reconcile',
        expectedConsentRevision: job.revokedConsentRevision,
        nowIso: new Date(nowMs).toISOString(),
      });
    } catch (error) {
      const latest = await getUserPrivacyConsentFromD1(userDb, job.uid);
      if (latest.researchAnalyticsConsent) {
        await cancelUnappliedRevocationIntent(userDb, job.revocationId);
      }
      throw error;
    }
    if (revokedPrivacy.consentRevision !== job.newConsentRevision) {
      throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
    }
  } else if (currentPrivacy.consentRevision !== job.newConsentRevision) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_REVISION_CONFLICT');
  }

  const expiredPermitsReclaimed = await expireStaleResearchProcessingPermitsInD1({
    userDb,
    uid: job.uid,
    nowMs,
  });
  const activePermitsRemaining = await countActiveResearchProcessingPermitsInD1({
    userDb,
    uid: job.uid,
    maxConsentRevision: job.revokedConsentRevision,
    nowMs,
  });
  const nowIso = new Date(nowMs).toISOString();
  if (activePermitsRemaining > 0) {
    await userDb
      .prepare(
        `UPDATE research_consent_revocation_jobs
         SET status = 'DRAINING_PERMITS', updated_at_iso = ?1
         WHERE revocation_id = ?2 AND status != 'COMPLETED'`,
      )
      .bind(nowIso, params.revocationId)
      .run();
    const current = (await readRevocationJob(userDb, params.revocationId))!;
    return toResponse(current, activePermitsRemaining, expiredPermitsReclaimed);
  }

  // Re-scan after all old permits have drained. A request may have registered its
  // subject key and acquired a permit between the initial registry snapshot and the
  // revocation-job admission barrier; that key must still receive an erasure outbox item.
  const registry = await userDb
    .prepare(
      'SELECT subject_key, subject_key_version FROM user_research_subject_registry WHERE uid = ?1 ORDER BY subject_key_version, subject_key',
    )
    .bind(job.uid)
    .all<{ subject_key: string; subject_key_version: string }>();
  if (!registry.success) throw new Error('RESEARCH_SUBJECT_REGISTRY_RESCAN_FAILED');
  const existingOutbox = await userDb
    .prepare('SELECT subject_key, subject_key_version FROM research_erasure_outbox WHERE job_id = ?1')
    .bind(params.revocationId)
    .all<{ subject_key: string; subject_key_version: string }>();
  if (!existingOutbox.success) throw new Error('RESEARCH_CONSENT_ERASURE_OUTBOX_RESCAN_FAILED');
  const existingSubjects = new Set(
    (existingOutbox.results ?? []).map((row) => `${row.subject_key_version}\u0000${row.subject_key}`),
  );
  const missingOutboxStatements = (registry.results ?? [])
    .filter((row) => !existingSubjects.has(`${row.subject_key_version}\u0000${row.subject_key}`))
    .map((subject) => {
      const outboxId = `rrevout_${params.revocationId}_${subject.subject_key_version}_${subject.subject_key}`;
      return userDb.prepare(
        `INSERT OR IGNORE INTO research_erasure_outbox (
          outbox_id, job_id, subject_key, subject_key_version, status, attempt_count,
          next_retry_at_ms, created_at_iso, updated_at_iso, max_consent_revision
        ) VALUES (?1, ?2, ?3, ?4, 'PENDING', 0, 0, ?5, ?5, ?6)`,
      ).bind(outboxId, params.revocationId, subject.subject_key, subject.subject_key_version, nowIso, job.newConsentRevision);
    });
  for (let offset = 0; offset < missingOutboxStatements.length; offset += 50) {
    const writes = await userDb.batch(missingOutboxStatements.slice(offset, offset + 50));
    if (writes.some((result) => !result.success)) {
      throw new Error('RESEARCH_CONSENT_ERASURE_OUTBOX_RECOVERY_FAILED');
    }
  }

  const scopedOutboxCount = await userDb
    .prepare('SELECT COUNT(*) AS cnt FROM research_erasure_outbox WHERE job_id = ?1')
    .bind(params.revocationId)
    .first<{ cnt: number }>();
  if (!scopedOutboxCount || !Number.isSafeInteger(Number(scopedOutboxCount.cnt))) {
    throw new Error('RESEARCH_CONSENT_ERASURE_OUTBOX_COUNT_UNAVAILABLE');
  }
  if (Number(scopedOutboxCount.cnt) === 0) {
    const completeEmptyJob = await userDb
      .prepare(
        `UPDATE research_consent_revocation_jobs
         SET status = 'COMPLETED', erased_events_count = 0, receipt_ids_json = '[]',
             updated_at_iso = ?1, completed_at_iso = ?1
         WHERE revocation_id = ?2 AND status != 'COMPLETED'`,
      )
      .bind(nowIso, params.revocationId)
      .run();
    if (!completeEmptyJob.success) throw new Error('RESEARCH_CONSENT_REVOCATION_EMPTY_COMPLETION_FAILED');
    const emptyCompletedJob = await readRevocationJob(userDb, params.revocationId);
    if (!emptyCompletedJob) throw new Error('RESEARCH_CONSENT_REVOCATION_READBACK_FAILED');
    return toResponse(emptyCompletedJob, 0, expiredPermitsReclaimed);
  }

  await userDb
    .prepare(
      `UPDATE research_consent_revocation_jobs
       SET status = 'PENDING_ERASURE', updated_at_iso = ?1
       WHERE revocation_id = ?2 AND status != 'COMPLETED'`,
    )
    .bind(nowIso, params.revocationId)
    .run();

  const researchDb = resolveResearchDb(params.env);
  const receiptSecret = resolveDedicatedLifecycleReceiptSecret(params.env);
  if (receiptSecret) {
    await processPendingResearchErasureOutbox({
      userDb,
      researchDb,
      jobId: params.revocationId,
      nowMs,
      receiptSecret,
    });
  }

  const finalJob = await readRevocationJob(userDb, params.revocationId);
  if (!finalJob) throw new Error('RESEARCH_CONSENT_REVOCATION_READBACK_FAILED');
  const finalActive = await countActiveResearchProcessingPermitsInD1({
    userDb,
    uid: job.uid,
    maxConsentRevision: job.revokedConsentRevision,
    nowMs,
  });
  return toResponse(finalJob, finalActive, expiredPermitsReclaimed);
}

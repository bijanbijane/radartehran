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

  const registry = await userDb
    .prepare(
      'SELECT subject_key, subject_key_version FROM user_research_subject_registry WHERE uid = ?1 ORDER BY subject_key_version, subject_key',
    )
    .bind(params.uid)
    .all<{ subject_key: string; subject_key_version: string }>();
  if (!registry.success) throw new Error('RESEARCH_SUBJECT_REGISTRY_READ_FAILED');

  // CAS update is the permit-admission barrier: any permit racing after this write is rejected.
  const privacy = await updateUserPrivacyConsentInD1(userDb, {
    uid: params.uid,
    actorUid: params.actorUid,
    researchAnalyticsConsent: false,
    behavioralTelemetryConsent: params.behavioralTelemetryConsent,
    marketingCommunicationsConsent: params.marketingCommunicationsConsent,
    consentSource: 'research_consent_revocation_barrier',
    nowIso,
  });
  const revokedConsentRevision = current.consentRevision;
  const newConsentRevision = privacy.consentRevision;
  const revocationId = `rrev_${nowMs}_${crypto.randomUUID().slice(0, 12)}`;

  const statements = [
    userDb
      .prepare(
        `INSERT INTO research_consent_revocation_jobs (
          revocation_id, uid, revoked_consent_revision, new_consent_revision, status,
          erased_events_count, receipt_ids_json, created_at_iso, updated_at_iso, completed_at_iso
        ) VALUES (?1, ?2, ?3, ?4, 'DRAINING_PERMITS', 0, '[]', ?5, ?5, NULL)`,
      )
      .bind(revocationId, params.uid, revokedConsentRevision, newConsentRevision, nowIso),
    ...(registry.results ?? []).map((subject) => {
      const outboxId = `rrevout_${revocationId}_${subject.subject_key_version}_${crypto.randomUUID().slice(0, 6)}`;
      return userDb
        .prepare(
          `INSERT INTO research_erasure_outbox (
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
          revokedConsentRevision,
        );
    }),
  ];
  const writes = await userDb.batch(statements);
  if (writes.length !== statements.length || writes.some((result) => !result.success)) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_OUTBOX_CREATE_FAILED');
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
  const status = activePermitsRemaining > 0 ? 'DRAINING_PERMITS' : 'PENDING_ERASURE';
  const statusWrite = await userDb
    .prepare(
      'UPDATE research_consent_revocation_jobs SET status = ?1, updated_at_iso = ?2 WHERE revocation_id = ?3',
    )
    .bind(status, nowIso, revocationId)
    .run();
  if (!statusWrite.success || (statusWrite.meta?.changes ?? 0) !== 1) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_STATUS_WRITE_FAILED');
  }

  if (activePermitsRemaining === 0) {
    const researchDb = resolveResearchDb(params.env);
    const receiptSecret = resolveDedicatedLifecycleReceiptSecret(params.env);
    if (receiptSecret) {
      await processPendingResearchErasureOutbox({
        userDb,
        researchDb,
        jobId: revocationId,
        nowMs,
        receiptSecret,
      });
    }
  }

  const finalJob = await readRevocationJob(userDb, revocationId);
  if (!finalJob) throw new Error('RESEARCH_CONSENT_REVOCATION_READBACK_FAILED');
  const finalActive = await countActiveResearchProcessingPermitsInD1({
    userDb,
    uid: params.uid,
    maxConsentRevision: revokedConsentRevision,
    nowMs,
  });
  return {
    privacy,
    revocation: { ...toResponse(finalJob, finalActive, expiredPermitsReclaimed), revocationId },
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

/**
 * D1 dispatch outbox + per-job execution leases (Stage D).
 */
import type { D1DatabaseBinding } from '../db/types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import * as Q from './d1LifecycleDispatchQueries.ts';

const DEFAULT_LEASE_MS = 120_000;

export type DispatchOutboxRow = {
  eventId: string;
  jobId: string;
  targetUid: string;
  operationType: string;
  idempotencyKey: string;
  dispatchStatus: string;
  correlationId: string;
};

export type DispatchJobLease = {
  jobId: string;
  targetUid: string;
  leaseToken: string;
  fencingRevision: number;
  leaseOwner: string;
  leaseExpiresAtMs: number;
};

function storeUnavailable(message: string): AccountLifecycleStoreError {
  return new AccountLifecycleStoreError('STORE_UNAVAILABLE', message, 503);
}

export class D1AccountLifecycleDispatch {
  constructor(private readonly db: D1DatabaseBinding) {}

  public async enqueueDispatchEvent(params: {
    eventId: string;
    jobId: string;
    targetUid: string;
    operationType: string;
    idempotencyKey: string;
    correlationId: string;
    createdAtIso: string;
    nextAttemptAtIso?: string | null;
  }): Promise<{ inserted: boolean }> {
    const result = await this.db
      .prepare(Q.SQL_INSERT_DISPATCH_OUTBOX)
      .bind(
        params.eventId,
        params.jobId,
        params.targetUid,
        params.operationType,
        params.idempotencyKey,
        'PENDING',
        0,
        params.nextAttemptAtIso ?? null,
        null,
        params.correlationId,
        params.createdAtIso,
        params.createdAtIso,
        null,
      )
      .run();
    if (!result.success) {
      throw storeUnavailable('Failed to persist lifecycle dispatch outbox event.');
    }
    const changes = result.meta?.changes;
    if (changes === 1) return { inserted: true };
    if (changes !== undefined && changes !== 0) {
      throw storeUnavailable('D1 returned an unverifiable lifecycle outbox insert result.');
    }
    const existing = await d1FirstRow(this.db, Q.SQL_GET_DISPATCH_BY_IDEM, params.idempotencyKey);
    if (!existing) throw storeUnavailable('Dispatch idempotency key could not be verified after insert.');
    return { inserted: false };
  }

  public async listPendingDispatch(limit: number, nowIso: string): Promise<DispatchOutboxRow[]> {
    const result = await this.db
      .prepare(Q.SQL_LIST_PENDING_DISPATCH)
      .bind(nowIso, Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<Record<string, unknown>>();
    if (!result.success) throw storeUnavailable('Failed to read lifecycle dispatch outbox.');
    return result.results.map((row) => ({
      eventId: String(row.event_id),
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
      operationType: String(row.operation_type),
      idempotencyKey: String(row.idempotency_key),
      dispatchStatus: String(row.dispatch_status),
      correlationId: String(row.correlation_id ?? ''),
    }));
  }

  public async markDispatchSent(idempotencyKey: string, nowIso: string): Promise<boolean> {
    const result = await this.db.prepare(Q.SQL_MARK_DISPATCH_SENT).bind(nowIso, idempotencyKey).run();
    if (!result.success) throw storeUnavailable('Failed to mark lifecycle dispatch as sent.');
    const changes = result.meta?.changes;
    if (changes === 1) return true;
    if (changes !== undefined && changes !== 0) {
      throw storeUnavailable('D1 returned an unverifiable lifecycle dispatch confirmation.');
    }
    const current = await d1FirstRow(this.db, Q.SQL_GET_DISPATCH_BY_IDEM, idempotencyKey);
    if (String(current?.dispatch_status ?? '') === 'DISPATCHED') return false;
    throw storeUnavailable('D1 did not confirm the lifecycle dispatch state after queue publication.');
  }

  public async markDispatchFailed(
    idempotencyKey: string,
    nowIso: string,
    nextAttemptIso: string,
    errorRedacted: string,
  ): Promise<void> {
    const result = await this.db
      .prepare(Q.SQL_MARK_DISPATCH_FAILED)
      .bind(errorRedacted.slice(0, 240), nowIso, nextAttemptIso, idempotencyKey)
      .run();
    if (!result.success) throw storeUnavailable('Failed to schedule lifecycle dispatch retry.');
    const changes = result.meta?.changes;
    if (changes === 1) return;
    if (changes !== undefined && changes !== 0) {
      throw storeUnavailable('D1 returned an unverifiable lifecycle dispatch retry result.');
    }
    const current = await d1FirstRow(this.db, Q.SQL_GET_DISPATCH_BY_IDEM, idempotencyKey);
    const status = String(current?.dispatch_status ?? '');
    if (status === 'DISPATCH_FAILED' || status === 'DISPATCHED') return;
    throw storeUnavailable('D1 did not confirm the lifecycle dispatch retry state.');
  }

  public async getJobLease(jobId: string): Promise<DispatchJobLease | null> {
    const row = await d1FirstRow(this.db, Q.SQL_GET_JOB_LEASE, jobId);
    if (!row) return null;
    return {
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
      leaseToken: String(row.lease_token),
      fencingRevision: Number(row.fencing_revision),
      leaseOwner: String(row.lease_owner),
      leaseExpiresAtMs: Number(row.lease_expires_at_ms),
    };
  }

  public async acquireJobLease(params: {
    jobId: string;
    targetUid: string;
    leaseToken: string;
    leaseOwner: string;
    nowMs: number;
    durationMs?: number;
  }): Promise<{ acquired: boolean; fencingRevision: number }> {
    const durationMs = params.durationMs ?? DEFAULT_LEASE_MS;
    if (
      !params.jobId.trim() ||
      !params.targetUid.trim() ||
      !params.leaseToken.trim() ||
      !params.leaseOwner.trim() ||
      !Number.isSafeInteger(params.nowMs) ||
      params.nowMs < 0 ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 5_000 ||
      durationMs > 10 * 60_000
    ) {
      throw storeUnavailable('Invalid lifecycle execution lease parameters.');
    }
    const expiresMs = params.nowMs + durationMs;
    if (!Number.isSafeInteger(expiresMs)) {
      throw storeUnavailable('Invalid lifecycle execution lease expiry.');
    }
    const nowIso = new Date(params.nowMs).toISOString();

    const assertValidLease = (lease: DispatchJobLease | null): DispatchJobLease => {
      if (
        !lease ||
        lease.jobId !== params.jobId ||
        lease.targetUid !== params.targetUid ||
        !lease.leaseToken.trim() ||
        !lease.leaseOwner.trim() ||
        !Number.isSafeInteger(lease.fencingRevision) ||
        lease.fencingRevision < 1 ||
        !Number.isSafeInteger(lease.leaseExpiresAtMs) ||
        lease.leaseExpiresAtMs < 0
      ) {
        throw storeUnavailable('Persisted lifecycle execution lease is missing or invalid.');
      }
      return lease;
    };

    let existing = await this.getJobLease(params.jobId);
    if (!existing) {
      const inserted = await this.db
        .prepare(Q.SQL_INSERT_JOB_LEASE)
        .bind(
          params.jobId,
          params.targetUid,
          params.leaseToken,
          params.leaseOwner,
          expiresMs,
          nowIso,
        )
        .run();
      if (!inserted.success) throw storeUnavailable('Failed to create lifecycle execution lease.');
      const insertChanges = inserted.meta?.changes;
      if (
        insertChanges !== undefined &&
        (!Number.isSafeInteger(insertChanges) || (insertChanges !== 0 && insertChanges !== 1))
      ) {
        throw storeUnavailable('D1 returned an unverifiable lifecycle execution lease insert result.');
      }

      const persisted = assertValidLease(await this.getJobLease(params.jobId));
      if (
        persisted.leaseToken === params.leaseToken &&
        persisted.leaseOwner === params.leaseOwner &&
        persisted.fencingRevision === 1 &&
        persisted.leaseExpiresAtMs === expiresMs
      ) {
        return { acquired: true, fencingRevision: persisted.fencingRevision };
      }
      existing = persisted;
    } else {
      existing = assertValidLease(existing);
    }

    const previousFencingRevision = existing.fencingRevision;
    const nextFencingRevision = previousFencingRevision + 1;
    if (!Number.isSafeInteger(nextFencingRevision)) {
      throw storeUnavailable('Lifecycle execution fencing revision is out of range.');
    }

    const claim = await this.db
      .prepare(Q.SQL_CLAIM_JOB_LEASE)
      .bind(
        params.leaseToken,
        params.leaseOwner,
        expiresMs,
        nowIso,
        params.jobId,
        params.nowMs,
      )
      .run();
    if (!claim.success) throw storeUnavailable('Failed to claim lifecycle execution lease.');
    const claimChanges = claim.meta?.changes;
    if (
      typeof claimChanges !== 'number' ||
      !Number.isSafeInteger(claimChanges) ||
      (claimChanges !== 0 && claimChanges !== 1)
    ) {
      throw storeUnavailable('D1 returned an unverifiable lifecycle execution lease claim result.');
    }

    const current = assertValidLease(await this.getJobLease(params.jobId));
    if (claimChanges === 1) {
      if (
        current.leaseToken !== params.leaseToken ||
        current.leaseOwner !== params.leaseOwner ||
        current.fencingRevision !== nextFencingRevision ||
        current.leaseExpiresAtMs !== expiresMs
      ) {
        throw storeUnavailable('D1 lease claim could not be verified against the persisted fencing revision.');
      }
      return { acquired: true, fencingRevision: current.fencingRevision };
    }

    if (current.leaseToken === params.leaseToken) {
      throw storeUnavailable('D1 reported an unchanged lease claim for the current lease token.');
    }
    return { acquired: false, fencingRevision: current.fencingRevision };
  }

  public async verifyJobLease(
    jobId: string,
    leaseToken: string,
    fencingRevision: number,
    nowMs: number,
  ): Promise<boolean> {
    const lease = await this.getJobLease(jobId);
    if (!lease) return false;
    if (lease.leaseToken !== leaseToken) return false;
    if (lease.fencingRevision !== fencingRevision) return false;
    return lease.leaseExpiresAtMs > nowMs;
  }

  public async releaseJobLease(
    jobId: string,
    leaseToken: string,
    fencingRevision: number,
    nowMs: number,
  ): Promise<void> {
    const result = await this.db
      .prepare(Q.SQL_RELEASE_JOB_LEASE)
      .bind(nowMs, new Date(nowMs).toISOString(), jobId, leaseToken, fencingRevision)
      .run();
    if (!result.success) throw storeUnavailable('Failed to release lifecycle execution lease.');
  }

  public async listJobsWithExpiredLeases(
    limit: number,
    nowMs: number,
  ): Promise<Array<{ jobId: string; targetUid: string }>> {
    const result = await this.db
      .prepare(Q.SQL_LIST_EXPIRED_JOB_LEASES)
      .bind(nowMs, Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<Record<string, unknown>>();
    if (!result.success) throw storeUnavailable('Failed to list expired lifecycle execution leases.');
    return result.results.map((row) => ({
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
    }));
  }
}

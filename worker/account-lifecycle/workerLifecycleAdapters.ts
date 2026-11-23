/** Worker-side D1 domain + native identity deletion adapters. */
import type { D1DatabaseBinding } from '../db/types.ts';
import type { D1Database } from '../types.ts';
import type { AuthIdentityDeletionAdapter, UserOwnedDomainRepositoryAdapter } from '../../server/modules/account-lifecycle/types.ts';
import type { AccountTelemetryErasureAdapter } from '../../server/modules/account-lifecycle/telemetryErasureContract.ts';
import { createWorkerD1DomainAdapters } from './workerD1DomainAdapters.ts';
import { createWorkerD1TelemetryErasureAdapter } from './workerTelemetryErasureAdapter.ts';
import { recordUserRevocationInD1 } from '../auth/authRevocationStore.ts';

export function createWorkerDomainAdapters(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter[] {
  return createWorkerD1DomainAdapters(db);
}

/**
 * Revokes opaque sessions and removes native identity links after all dependent data
 * has been erased. The legacy interface name is retained for compatibility only.
 */
export function createWorkerFailClosedAuthAdapter(db: D1DatabaseBinding): AuthIdentityDeletionAdapter {
  return {
    async deleteFirebaseAuthUser({ targetUid, jobId }) {
      const nowIso = new Date().toISOString();
      const revocation = await recordUserRevocationInD1({
        db: db as unknown as D1Database,
        uid: targetUid,
        action: 'DISABLE_USER',
        actorUid: targetUid,
        reason: `ACCOUNT_DELETION:${jobId}`,
        idempotencyKey: `account-deletion-auth-disable:${jobId}`,
      });
      if (!revocation.applied) throw new Error(`AUTH_SESSION_REVOCATION_FAILED:${revocation.reason}`);
      const sessions = await db.prepare(
        "UPDATE user_sessions SET status = 'REVOKED', revoked_at_iso = ?1, revoked_by_uid = ?2 WHERE uid = ?3 AND status = 'ACTIVE'",
      ).bind(nowIso, targetUid, targetUid).run();
      if (!sessions.success) throw new Error('AUTH_SESSION_REVOCATION_FAILED');
      const identities = await db.prepare('DELETE FROM auth_identities WHERE uid = ?1').bind(targetUid).run();
      if (!identities.success) throw new Error('AUTH_IDENTITY_PURGE_FAILED');
      return { targetUid, status: 'DELETED' as const, deletedAtIso: nowIso };
    },
  };
}

export function createWorkerTelemetryAdapter(db: D1DatabaseBinding): AccountTelemetryErasureAdapter {
  return createWorkerD1TelemetryErasureAdapter(db);
}

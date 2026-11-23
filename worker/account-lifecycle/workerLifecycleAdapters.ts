/**
 * Worker-side domain + auth adapters (Stage D hardening).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import type { AuthIdentityDeletionAdapter, UserOwnedDomainRepositoryAdapter } from '../../server/modules/account-lifecycle/types.ts';
import type { AccountTelemetryErasureAdapter } from '../../server/modules/account-lifecycle/telemetryErasureContract.ts';
import { createWorkerD1DomainAdapters } from './workerD1DomainAdapters.ts';
import { createWorkerD1TelemetryErasureAdapter } from './workerTelemetryErasureAdapter.ts';

export function createWorkerDomainAdapters(db: D1DatabaseBinding): UserOwnedDomainRepositoryAdapter[] {
  return createWorkerD1DomainAdapters(db);
}

export function createWorkerFailClosedAuthAdapter(): AuthIdentityDeletionAdapter {
  return {
    async deleteFirebaseAuthUser({ targetUid }) {
      void targetUid;
      throw new Error(
        'WORKER_IDENTITY_DELETION_BLOCKED: no trusted Worker-compatible identity admin adapter configured.',
      );
    },
  };
}

export function createWorkerTelemetryAdapter(db: D1DatabaseBinding): AccountTelemetryErasureAdapter {
  return createWorkerD1TelemetryErasureAdapter(db);
}
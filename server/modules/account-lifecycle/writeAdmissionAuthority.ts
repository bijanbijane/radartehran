/**
 * Canonical Write Admission authority semantics (D-H2-01).
 * D1 `account_write_blocks` is the durable source; this module maps rows to decisions only.
 */

import type { DurableUserWriteBlockRecord } from './types.ts';
import { AccountLifecycleError } from './types.ts';

export type WriteAdmissionDecision =
  | {
      readonly status: 'OPEN';
      readonly uid: string;
      readonly revision: number;
    }
  | {
      readonly status: 'CLOSED';
      readonly uid: string;
      readonly revision: number;
      readonly deletionJobId?: string | null;
      readonly reason?: string;
      readonly blockState?: string;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly code: string;
    };

/**
 * Lifecycle semantics (D1): absent row or `ACTIVE_WRITES_ALLOWED` ⇒ OPEN.
 * Any other durable write-block state ⇒ CLOSED.
 */
export function mapWriteBlockRowToAdmissionDecision(
  uid: string,
  block: DurableUserWriteBlockRecord | null,
): WriteAdmissionDecision {
  if (!block || block.state === 'ACTIVE_WRITES_ALLOWED') {
    return {
      status: 'OPEN',
      uid,
      revision: block?.revision ?? 0,
    };
  }
  return {
    status: 'CLOSED',
    uid,
    revision: block.revision,
    deletionJobId: block.activeDeletionJobId,
    reason: block.reason,
    blockState: block.state,
  };
}

export function assertWriteAdmissionPermitsMutation(decision: WriteAdmissionDecision): void {
  if (decision.status === 'UNAVAILABLE') {
    throw new AccountLifecycleError(
      'STORE_UNAVAILABLE',
      `Write admission unavailable (${decision.code}); mutation refused.`,
      503,
    );
  }
  if (decision.status === 'CLOSED') {
    throw new AccountLifecycleError(
      'USER_WRITES_BLOCKED_BY_DELETION',
      `Write operations are blocked for user "${decision.uid}" (revision=${decision.revision}).`,
      423,
    );
  }
}

export function isWriteAdmissionOpen(decision: WriteAdmissionDecision): boolean {
  return decision.status === 'OPEN';
}
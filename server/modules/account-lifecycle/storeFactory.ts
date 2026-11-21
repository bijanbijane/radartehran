/**
 * Explicit account lifecycle store composition (no runtime auto-fallback).
 */

import type { D1DatabaseBinding } from '../../../worker/db/types.ts';
import { D1AccountLifecycleStore } from '../../../worker/account-lifecycle/d1AccountLifecycleStore.ts';
import {
  FirestoreAndJournalAccountLifecycleStore,
  type NodeJournalAccountLifecycleStoreOptions,
} from './durableJobStore.ts';
import type { DurableAccountLifecycleStore, DurableAccountLifecycleStoreV2 } from './storeContract.ts';
import { AccountLifecycleStoreError } from './storeContract.ts';

export type AccountLifecycleStoreKind = 'NODE_EXPRESS_JOURNAL' | 'CLOUDFLARE_D1';

export function createNodeJournalAccountLifecycleStore(
  options?: NodeJournalAccountLifecycleStoreOptions,
): FirestoreAndJournalAccountLifecycleStore {
  return new FirestoreAndJournalAccountLifecycleStore(options);
}

export function createD1AccountLifecycleStore(db: D1DatabaseBinding): D1AccountLifecycleStore {
  if (!db) {
    throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Cannot create D1 store without binding.', 503);
  }
  return new D1AccountLifecycleStore(db);
}

export function createAccountLifecycleStore(params: {
  kind: 'NODE_EXPRESS_JOURNAL';
  journal?: NodeJournalAccountLifecycleStoreOptions;
}): DurableAccountLifecycleStore;
export function createAccountLifecycleStore(params: {
  kind: 'CLOUDFLARE_D1';
  db: D1DatabaseBinding;
}): DurableAccountLifecycleStoreV2;
export function createAccountLifecycleStore(
  params:
    | { kind: 'NODE_EXPRESS_JOURNAL'; journal?: NodeJournalAccountLifecycleStoreOptions }
    | { kind: 'CLOUDFLARE_D1'; db: D1DatabaseBinding },
): DurableAccountLifecycleStore | DurableAccountLifecycleStoreV2 {
  if (params.kind === 'NODE_EXPRESS_JOURNAL') {
    return createNodeJournalAccountLifecycleStore(params.journal);
  }
  return createD1AccountLifecycleStore(params.db);
}
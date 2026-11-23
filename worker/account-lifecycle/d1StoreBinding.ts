/**
 * Worker binding contract for account lifecycle D1 tables (Phase A).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import { ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION } from '../../server/modules/account-lifecycle/storeContract.ts';

export interface AccountLifecycleWorkerBindings {
  DB: D1DatabaseBinding;
}

export const ACCOUNT_LIFECYCLE_D1_TABLES = [
  'account_deletion_jobs',
  'account_write_blocks',
  'account_export_jobs',
  'account_privacy_consents',
  'account_lifecycle_audit',
  'account_data_requests',
  'account_deletion_batch_receipts',
  'account_deletion_execution_receipts',
  'account_deletion_retention_records',
] as const;

export function accountLifecycleSchemaVersion(): string {
  return ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION;
}

export { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
export { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';
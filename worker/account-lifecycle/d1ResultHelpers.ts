/**
 * Wrangler-compatible D1 row reader. A failed read is never interpreted as a
 * missing row because callers use null to establish idempotent absence.
 */
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import type { D1DatabaseBinding } from '../db/types.ts';

export async function d1FirstRow(
  db: D1DatabaseBinding,
  sql: string,
  ...binds: unknown[]
): Promise<Record<string, unknown> | null> {
  let stmt = db.prepare(sql);
  if (binds.length) stmt = stmt.bind(...binds);
  const result = await stmt.all<Record<string, unknown>>();
  if (!result.success || !Array.isArray(result.results)) {
    throw new AccountLifecycleStoreError(
      'STORE_UNAVAILABLE',
      'A required account-lifecycle D1 read could not be completed.',
      503,
    );
  }
  return result.results.length > 0 ? result.results[0] : null;
}

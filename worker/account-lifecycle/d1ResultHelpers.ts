/**
 * Wrangler-compatible D1 row readers (`.first()` may return only the first column on real D1).
 */

import type { D1DatabaseBinding } from '../db/types.ts';

export async function d1FirstRow(
  db: D1DatabaseBinding,
  sql: string,
  ...binds: unknown[]
): Promise<Record<string, unknown> | null> {
  let stmt = db.prepare(sql);
  if (binds.length) stmt = stmt.bind(...binds);
  const res = await stmt.all<Record<string, unknown>>();
  if (!res.success || res.results.length < 1) return null;
  return res.results[0];
}
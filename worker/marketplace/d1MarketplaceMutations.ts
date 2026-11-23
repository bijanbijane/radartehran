import type { D1Database, D1PreparedStatement } from '../types';

export type IdempotentMutationResult =
  | { status: 'created' | 'replayed'; resourceId: string }
  | { status: 'conflict' }
  | { status: 'not_committed' };

export async function persistIdempotentMutation(params: {
  db: D1Database;
  uid: string;
  operationName: string;
  idempotencyKey: string;
  requestHash: string;
  resourceId: string;
  createdAtIso: string;
  resourceStatements: D1PreparedStatement[];
}): Promise<IdempotentMutationResult> {
  const existing = await params.db.prepare(
    'SELECT request_hash, resource_id FROM market_mutation_idempotency WHERE uid = ?1 AND operation_name = ?2 AND idempotency_key = ?3 LIMIT 1',
  ).bind(params.uid, params.operationName, params.idempotencyKey)
    .first<{ request_hash: string; resource_id: string }>();

  if (existing) {
    return existing.request_hash === params.requestHash
      ? { status: 'replayed', resourceId: existing.resource_id }
      : { status: 'conflict' };
  }

  await params.db.batch([
    params.db.prepare(
      'INSERT OR IGNORE INTO market_mutation_idempotency (uid, operation_name, idempotency_key, request_hash, resource_id, created_at_iso) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(
      params.uid,
      params.operationName,
      params.idempotencyKey,
      params.requestHash,
      params.resourceId,
      params.createdAtIso,
    ),
    ...params.resourceStatements,
  ]);

  const persisted = await params.db.prepare(
    'SELECT request_hash, resource_id FROM market_mutation_idempotency WHERE uid = ?1 AND operation_name = ?2 AND idempotency_key = ?3 LIMIT 1',
  ).bind(params.uid, params.operationName, params.idempotencyKey)
    .first<{ request_hash: string; resource_id: string }>();

  if (!persisted) return { status: 'not_committed' };
  if (persisted.request_hash !== params.requestHash) return { status: 'conflict' };
  return { status: 'created', resourceId: persisted.resource_id };
}

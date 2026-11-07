import crypto from 'crypto';
import { CoreApiError, redactSensitiveErrorText } from './validationAndResponses';
import type {
  AuthenticatedPrincipal,
  IdempotencyAcquireResult,
  IdempotencyRecord,
  IdempotencyStoreAdapter,
  StructuredAuditEvent,
  TransactionContextLike,
  TransactionExecutionOptions,
  TransactionRunnerAdapter,
} from './types';

const SAFE_IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) {
      out[k] = canonicalizeJsonValue(record[k]);
    }
    return out;
  }
  return value;
}

export function computeRequestPayloadHash(payload: unknown): string {
  const canonical = JSON.stringify(canonicalizeJsonValue(payload ?? null));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function validateIdempotencyKey(rawKey: unknown): string {
  if (typeof rawKey !== 'string' || !SAFE_IDEMPOTENCY_KEY_REGEX.test(rawKey.trim())) {
    throw new CoreApiError(
      'IDEMPOTENCY_KEY_INVALID',
      400,
      'Idempotency-Key header must be 8-128 characters ([A-Za-z0-9._:-]).',
    );
  }
  return rawKey.trim();
}

export function buildScopedIdempotencyKey(actorUid: string, operation: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`${actorUid}::${operation}::${idempotencyKey}`, 'utf8').digest('hex');
}

export function createFirestoreIdempotencyStoreAdapter(
  txRunner: TransactionRunnerAdapter,
  collectionPath = 'idempotency_locks',
): IdempotencyStoreAdapter {
  return {
    async acquireLock<T = unknown>(params: {
      scopedKey: string;
      actorUid: string;
      operation: string;
      payloadHash: string;
      nowEpochMs: number;
      ttlMs: number;
    }): Promise<IdempotencyAcquireResult<T>> {
      const docPath = `${collectionPath}/${params.scopedKey}`;
      return txRunner.runTransaction(async (tx) => {
        const snap = await tx.get<IdempotencyRecord<T>>(docPath);
        const nowIso = new Date(params.nowEpochMs).toISOString();

        if (snap.exists && snap.data) {
          const existing = snap.data;
          const isExpired = typeof existing.expiresAtEpochMs === 'number' && params.nowEpochMs >= existing.expiresAtEpochMs;
          if (!isExpired) {
            if (existing.payloadHash !== params.payloadHash) {
              return { state: 'CONFLICT_PAYLOAD_MISMATCH', record: existing };
            }
            if (existing.status === 'COMPLETED') {
              return { state: 'REPLAY_COMPLETED', record: existing };
            }
            if (existing.status === 'IN_PROGRESS') {
              return { state: 'CONFLICT_IN_PROGRESS', record: existing };
            }
          }
        }

        const freshRecord: IdempotencyRecord<T> = {
          key: params.scopedKey,
          actorUid: params.actorUid,
          operation: params.operation,
          payloadHash: params.payloadHash,
          status: 'IN_PROGRESS',
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
          expiresAtEpochMs: params.nowEpochMs + params.ttlMs,
        };
        tx.set(docPath, freshRecord as unknown as Record<string, unknown>);
        return { state: 'ACQUIRED', record: freshRecord };
      });
    },

    async markCompleted<T = unknown>(params: {
      scopedKey: string;
      statusCode: number;
      responseBody: T;
      nowEpochMs: number;
    }): Promise<void> {
      const docPath = `${collectionPath}/${params.scopedKey}`;
      await txRunner.runTransaction(async (tx) => {
        tx.update(docPath, {
          status: 'COMPLETED',
          statusCode: params.statusCode,
          responseBody: params.responseBody,
          updatedAtIso: new Date(params.nowEpochMs).toISOString(),
        });
      });
    },

    async releaseOnFailure(params: { scopedKey: string; nowEpochMs: number }): Promise<void> {
      const docPath = `${collectionPath}/${params.scopedKey}`;
      await txRunner.runTransaction(async (tx) => {
        tx.update(docPath, { status: 'FAILED', updatedAtIso: new Date(params.nowEpochMs).toISOString() });
      });
    },
  };
}

export async function executeIdempotentMutation<T>(params: {
  store: IdempotencyStoreAdapter;
  actorUid: string;
  operation: string;
  idempotencyKey: string;
  requestPayload: unknown;
  ttlMs?: number;
  nowEpochMs?: number;
  mutationFn: () => Promise<{ statusCode?: number; body: T }>;
}): Promise<{ replayed: boolean; statusCode: number; body: T }> {
  const validKey = validateIdempotencyKey(params.idempotencyKey);
  const scopedKey = buildScopedIdempotencyKey(params.actorUid, params.operation, validKey);
  const payloadHash = computeRequestPayloadHash(params.requestPayload);
  const nowEpochMs = params.nowEpochMs ?? Date.now();
  const ttlMs = params.ttlMs ?? 24 * 60 * 60 * 1000;

  const acquired = await params.store.acquireLock<T>({
    scopedKey,
    actorUid: params.actorUid,
    operation: params.operation,
    payloadHash,
    nowEpochMs,
    ttlMs,
  });

  if (acquired.state === 'CONFLICT_PAYLOAD_MISMATCH') {
    throw new CoreApiError('IDEMPOTENCY_PAYLOAD_MISMATCH', 409, 'Idempotency-Key reused with different request payload.');
  }
  if (acquired.state === 'CONFLICT_IN_PROGRESS') {
    throw new CoreApiError('IDEMPOTENCY_IN_PROGRESS', 409, 'A mutation with this Idempotency-Key is currently in progress.');
  }
  if (acquired.state === 'REPLAY_COMPLETED') {
    return {
      replayed: true,
      statusCode: acquired.record.statusCode ?? 200,
      body: acquired.record.responseBody as T,
    };
  }

  try {
    const result = await params.mutationFn();
    const statusCode = result.statusCode ?? 200;
    await params.store.markCompleted({
      scopedKey,
      statusCode,
      responseBody: result.body,
      nowEpochMs: Date.now(),
    });
    return { replayed: false, statusCode, body: result.body };
  } catch (err) {
    try {
      await params.store.releaseOnFailure({ scopedKey, nowEpochMs: Date.now() });
    } catch {
      // Preserve primary mutation error
    }
    if (err instanceof CoreApiError) throw err;
    throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Durable mutation failed.');
  }
}

function isRetryableTransactionContentionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const obj = err as Record<string, unknown>;
  const code = typeof obj.code === 'string' ? obj.code.toUpperCase() : '';
  const msg = typeof obj.message === 'string' ? obj.message.toUpperCase() : '';
  return code === 'ABORTED' || code === '10' || msg.includes('ABORTED') || msg.includes('CROSS-TRANSACTION CONTENTION');
}

export async function runDurableTransaction<T>(
  runner: TransactionRunnerAdapter | null | undefined,
  options: TransactionExecutionOptions,
  workFn: (tx: TransactionContextLike) => Promise<T>,
): Promise<T> {
  if (!runner || typeof runner.runTransaction !== 'function') {
    throw new CoreApiError('PERSISTENCE_FAILED', 503, `Durable transaction runner unavailable for ${options.operationName}.`);
  }
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const baseBackoffMs = Math.max(5, Math.min(500, options.baseBackoffMs ?? 25));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runner.runTransaction(workFn);
    } catch (err) {
      lastError = err;
      if (err instanceof CoreApiError) throw err;
      if (attempt < maxAttempts && isRetryableTransactionContentionError(err)) {
        await new Promise((resolve) => setTimeout(resolve, baseBackoffMs * attempt));
        continue;
      }
      break;
    }
  }

  const message = lastError instanceof Error ? redactSensitiveErrorText(lastError.message) : 'Transaction failed to commit.';
  const isAborted = isRetryableTransactionContentionError(lastError);
  throw new CoreApiError(
    isAborted ? 'TRANSACTION_ABORTED' : 'PERSISTENCE_FAILED',
    isAborted ? 409 : 503,
    `Transaction "${options.operationName}" failed: ${message}`,
  );
}

export function redactEmailAddress(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '[redacted-email]';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

export function redactPiiAndSecretsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie|phone|mobile|nationalid|iban|card)/i;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = redactSensitiveErrorText(value).replace(/\b09\d{9}\b/g, '[REDACTED_IR_PHONE]');
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = redactPiiAndSecretsFromMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function createStructuredAuditEvent(params: {
  principal: Pick<AuthenticatedPrincipal, 'uid' | 'email' | 'role'> | null | undefined;
  correlationId: string;
  action: string;
  targetCollection: string;
  targetResourceId: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  nowIso?: string;
}): StructuredAuditEvent {
  return {
    eventId: `aud_${crypto.randomUUID()}`,
    timestampIso: params.nowIso ?? new Date().toISOString(),
    correlationId: params.correlationId,
    actorUid: params.principal?.uid ?? 'anonymous',
    actorEmailRedacted: params.principal?.email ? redactEmailAddress(params.principal.email) : 'anonymous',
    actorRole: params.principal?.role ?? 'guest',
    action: params.action,
    targetCollection: params.targetCollection,
    targetResourceId: params.targetResourceId,
    outcome: params.outcome,
    ...(params.reasonCode ? { reasonCode: params.reasonCode } : {}),
    metadata: redactPiiAndSecretsFromMetadata(params.metadata),
  };
}

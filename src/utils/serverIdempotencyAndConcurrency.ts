/**
 * @file src/utils/serverIdempotencyAndConcurrency.ts
 * @description PROMPT 106, PROMPT 107 & PROMPT 110: * ۱. جلوگیری از تکرار عملیات و Idempotency سراسری برای APIهای تغییر وضعیت (PROMPT 106)
 * ۲. کنترل همزمانی خوش‌بینانه (Optimistic Concurrency Control) و جلوگیری از Lost Update (PROMPT 107)
 * ۳. مدیریت چرخه حیات منابع، تایمرها، استریم‌ها و خاموشی ایمن فرآیند Node.js (PROMPT 110)
 */
import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
// ============================================================================
// PROMPT 106: SYSTEM-WIDE IDEMPOTENCY & DUPLICATE OPERATION PREVENTION
// ============================================================================

export type IdempotencyRecordStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';  export interface IdempotencyRecord<T = unknown> { operationId: string; idempotencyKey: string; scope: string; actorId: string; payloadFingerprint: string; status: IdempotencyRecordStatus; createdAtMs: number; updatedAtMs: number; expiresAtMs: number;
  httpStatus?: number; responseBody?: T; errorMessage?: string; }

export interface IdempotencyBeginOutcome<T = unknown> { status: 'PROCEED' | 'REPLAYED' | 'CONFLICT_IN_PROGRESS' | 'CONFLICT_PAYLOAD_MISMATCH' | 'RETRY_AFTER_FAILURE'; httpStatus: number; record: IdempotencyRecord<T>; }

function canonicalizeJsonValue(val: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 12 || val === null || typeof val !== 'object') return depth > 12 ? '[MAX_DEPTH]' : val;
  if (seen.has(val as object)) return '[CIRCULAR]';
  seen.add(val as object);
  if (Array.isArray(val)) return val.slice(0, 500).map((item) => canonicalizeJsonValue(item, depth + 1, seen));
  const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const v = (val as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = canonicalizeJsonValue(v, depth + 1, seen);
  }
  return out;
}

export function computeCanonicalPayloadFingerprint(payload: unknown): string { const canonicalStr = JSON.stringify(canonicalizeJsonValue(payload ?? {})); return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

export class IdempotencyLedger { private readonly store = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;
  private readonly inProgressTimeoutMs: number;

  constructor(options?: { ttlMs?: number; inProgressTimeoutMs?: number }) {
    this.ttlMs = options?.ttlMs ?? 24 * 60 * 60_000;
    this.inProgressTimeoutMs = options?.inProgressTimeoutMs ?? 30_000;
  }

  private compositeKey(scope: string, actorId: string, idempotencyKey: string): string {
    return `${scope}::${actorId || 'anon'}::${idempotencyKey.trim().slice(0, 128)}`;
  }

  beginExecution<T = unknown>(params: { scope: string; actorId: string; idempotencyKey: string; payload: unknown; nowMs?: number }): IdempotencyBeginOutcome<T> {
    const nowMs = params.nowMs ?? Date.now();
    const fingerprint = computeCanonicalPayloadFingerprint(params.payload);
    const key = this.compositeKey(params.scope, params.actorId, params.idempotencyKey);
    const existing = this.store.get(key) as IdempotencyRecord<T> | undefined;

    if (existing && existing.expiresAtMs > nowMs) {
      if (existing.payloadFingerprint !== fingerprint) {
        return { status: 'CONFLICT_PAYLOAD_MISMATCH', httpStatus: 409, record: existing };
      }
      const timedOutLock = existing.status === 'IN_PROGRESS' && nowMs - existing.updatedAtMs > this.inProgressTimeoutMs;
      if (existing.status === 'IN_PROGRESS' && !timedOutLock) {
        return { status: 'CONFLICT_IN_PROGRESS', httpStatus: 409, record: existing };
      }
      if (existing.status === 'COMPLETED') {
        return { status: 'REPLAYED', httpStatus: existing.httpStatus ?? 200, record: existing };
      }
      existing.status = 'IN_PROGRESS';
      existing.updatedAtMs = nowMs;
      existing.expiresAtMs = nowMs + this.ttlMs;
      return { status: 'RETRY_AFTER_FAILURE', httpStatus: 200, record: existing };
    }

    if (this.store.size >= 2000) {
      for (const [k, v] of this.store.entries()) {
        if (v.expiresAtMs <= nowMs) this.store.delete(k);
      }
      if (this.store.size >= 2000) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
    }

    const record: IdempotencyRecord<T> = {
      operationId: `op_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
      idempotencyKey: params.idempotencyKey.trim().slice(0, 128),
      scope: params.scope,
      actorId: params.actorId,
      payloadFingerprint: fingerprint,
      status: 'IN_PROGRESS',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
    };
    this.store.set(key, record);
    return { status: 'PROCEED', httpStatus: 200, record };
  }

  completeExecution<T = unknown>(params: {
    scope: string;
    actorId: string;
    idempotencyKey: string;
    operationId: string;
    httpStatus: number;
    responseBody: T;
    nowMs?: number;
  }): IdempotencyRecord<T> {
    const key = this.compositeKey(params.scope, params.actorId, params.idempotencyKey);
    const existing = this.store.get(key) as IdempotencyRecord<T> | undefined;
    if (!existing || existing.operationId !== params.operationId) {
      throw new Error('IDEMPOTENCY_OPERATION_MISMATCH');
    }
    existing.status = 'COMPLETED';
    existing.httpStatus = params.httpStatus;
    existing.responseBody = params.responseBody;
    existing.updatedAtMs = params.nowMs ?? Date.now();
    return existing;
  }

  failExecution(params: {
    scope: string;
    actorId: string;
    idempotencyKey: string;
    operationId: string;
    errorMessage: string;
    nowMs?: number;
  }): void {
    const key = this.compositeKey(params.scope, params.actorId, params.idempotencyKey);
    const existing = this.store.get(key);
    if (existing && existing.operationId === params.operationId) {
      existing.status = 'FAILED';
      existing.errorMessage = params.errorMessage;
      existing.updatedAtMs = params.nowMs ?? Date.now();
    }
  }
}

// ============================================================================
// PROMPT 107: OPTIMISTIC CONCURRENCY CONTROL & LOST UPDATE PREVENTION
// ============================================================================

export interface VersionedEntityRecord<T extends Record<string, unknown>> {
  entityKey: string;
  revision: number;
  etag: string;
  updatedAtIso: string;
  updatedBy: string;
  data: T;
}

export type ConcurrencyUpdateResult<T extends Record<string, unknown>> =
  | { ok: true; record: VersionedEntityRecord<T> }
  | { ok: false; httpStatus: 404 | 409 | 412; reason: string; currentRecord?: VersionedEntityRecord<T> };

export class OptimisticConcurrencyStore<T extends Record<string, unknown>> {
  private readonly records = new Map<string, VersionedEntityRecord<T>>();

  private buildEtag(entityKey: string, revision: number, data: T): string {
    const digest = computeCanonicalPayloadFingerprint(data).slice(0, 16);
    return `W/"${entityKey}-v${revision}-${digest}"`;
  }

  upsertInitial(entityKey: string, initialData: T, actorId: string, nowIso = new Date().toISOString()): VersionedEntityRecord<T> {
    const rec: VersionedEntityRecord<T> = {
      entityKey,
      revision: 1,
      etag: this.buildEtag(entityKey, 1, initialData),
      updatedAtIso: nowIso,
      updatedBy: actorId,
      data: { ...initialData },
    };
    this.records.set(entityKey, rec);
    return { ...rec, data: { ...rec.data } };
  }

  getRecord(entityKey: string): VersionedEntityRecord<T> | undefined {
    const r = this.records.get(entityKey);
    return r ? { ...r, data: { ...r.data } } : undefined;
  }

  applyPartialUpdate(params: {
    entityKey: string;
    expectedRevision?: number;
    ifMatchEtag?: string;
    patch: Partial<T>;
    actorId: string;
    nowIso?: string;
  }): ConcurrencyUpdateResult<T> {
    const current = this.records.get(params.entityKey);
    if (!current) {
      return { ok: false, httpStatus: 404, reason: 'ENTITY_NOT_FOUND' };
    }
    if (params.expectedRevision !== undefined && current.revision !== params.expectedRevision) {
      return {
        ok: false,
        httpStatus: 409,
        reason: `STALE_REVISION_CONFLICT: expected ${params.expectedRevision}, actual ${current.revision}`,
        currentRecord: { ...current, data: { ...current.data } },
      };
    }
    if (params.ifMatchEtag !== undefined && current.etag !== params.ifMatchEtag) {
      return {
        ok: false,
        httpStatus: 412,
        reason: 'ETAG_PRECONDITION_FAILED',
        currentRecord: { ...current, data: { ...current.data } },
      };
    }

    const mergedData: T = { ...current.data };
    for (const [k, v] of Object.entries(params.patch)) {
      if (v !== undefined && k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
        (mergedData as Record<string, unknown>)[k] = v;
      }
    }

    const nextRevision = current.revision + 1;
    const nextRecord: VersionedEntityRecord<T> = {
      entityKey: params.entityKey,
      revision: nextRevision,
      etag: this.buildEtag(params.entityKey, nextRevision, mergedData),
      updatedAtIso: params.nowIso ?? new Date().toISOString(),
      updatedBy: params.actorId,
      data: mergedData,
    };
    this.records.set(params.entityKey, nextRecord);
    return { ok: true, record: { ...nextRecord, data: { ...nextRecord.data } } };
  }
}

// ============================================================================
// PROMPT 110: PRODUCTION RESOURCE LIFECYCLE & NODE.JS PROCESS STABILITY
// ============================================================================

export class ProcessResourceLifecycleManager {
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly cleanupHooks = new Map<string, () => Promise<void> | void>();
  private shuttingDown = false;

  registerSingletonInterval(name: string, fn: () => void, intervalMs: number): void {
    const existing = this.intervals.get(name);
    if (existing) clearInterval(existing);
    const timer = setInterval(fn, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.intervals.set(name, timer);
  }
  registerCleanupHook(name: string, hook: () => Promise<void> | void): void {
    this.cleanupHooks.set(name, hook);
  }
  getDiagnostics(areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD'): { activeIntervals: string[]; registeredHooks: string[]; shuttingDown: boolean; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
    return {
      activeIntervals: [...this.intervals.keys()],
      registeredHooks: [...this.cleanupHooks.keys()],
      shuttingDown: this.shuttingDown,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(120, intlCurrency, 'en'),
    };
  }
  async executeGracefulShutdown(): Promise<{ clearedIntervals: number; executedHooks: number }> {
    if (this.shuttingDown) return { clearedIntervals: 0, executedHooks: 0 };
    this.shuttingDown = true;
    let clearedIntervals = 0;
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
      clearedIntervals++;
    }
    this.intervals.clear();
    let executedHooks = 0;
    for (const hook of this.cleanupHooks.values()) {
      try {
        await hook();
        executedHooks++;
      } catch { /* isolate individual shutdown hook failure */ }
    }
    this.cleanupHooks.clear();
    return { clearedIntervals, executedHooks };
  }
}
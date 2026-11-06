/**
 * @file src/utils/serverStoragePortabilityAndTracing.ts
 * @description PROMPT 116, PROMPT 119, PROMPT 121 & PROMPT 122:
 * ۱. قرارداد یکپارچه پرتابلیتی Object Storage، تشخیص قابلیت‌ها و ایمنی مهاجرت بدون تکرار یا حذف متادیتا (PROMPT 116)
 * ۲. ردیابی توزیع‌شده (Distributed Tracing) و مشاهده‌پذیری سرتاسری درخواست با AsyncLocalStorage (PROMPT 119)
 * ۳. ممیزی خودکار امنیت استاتیک/دینامیک (SAST/DAST Invariants) و سخت‌سازی محیط اجرای کانتینر/سرور (PROMPT 121 & 122)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { redactMetadataObject } from './serverForensicsAndIncidentResponse';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

// ============================================================================
// PROMPT 116: STORAGE PROVIDER PORTABILITY & MIGRATION SAFETY
// ============================================================================

export interface PortableStoredObject {
  objectKey: string; bytes: Buffer; contentType: string;
  sha256Hex: string; sizeBytes: number; customMetadata: Record<string, string>;
}

export interface PortableStorageAdapter {
  readonly providerName: string;
  putObject(input: {
    objectKey: string;
    bytes: Buffer;
    contentType: string;
    customMetadata?: Record<string, string>;
  }): Promise<PortableStoredObject>;
  getObject(objectKey: string, range?: { start: number; end: number }): Promise<PortableStoredObject | null>;
  headObject(objectKey: string): Promise<Omit<PortableStoredObject, 'bytes'> | null>;
  deleteObject(objectKey: string): Promise<{ deleted: boolean; alreadyAbsent: boolean }>;
}

export class PortableMemoryStorageAdapter implements PortableStorageAdapter {
  public readonly providerName: string;
  private readonly store = new Map<string, PortableStoredObject>();
  private simulateWriteFailure = false;

  constructor(providerName = 'PORTABLE_MEMORY_PROVIDER') {
    this.providerName = providerName;
  }

  setSimulateWriteFailure(fail: boolean): void {
    this.simulateWriteFailure = fail;
  }

  async putObject(input: {
    objectKey: string;
    bytes: Buffer;
    contentType: string;
    customMetadata?: Record<string, string>;
  }): Promise<PortableStoredObject> {
    if (this.simulateWriteFailure) throw new Error('STORAGE_WRITE_FAILED_NO_SILENT_FALLBACK');
    if (
      !input.objectKey || input.objectKey.length > 512 || input.objectKey.includes('..') ||
      input.objectKey.startsWith('/') || input.objectKey.includes('\\') || /[\u0000-\u001F\u007F]/.test(input.objectKey)
    ) {
      throw new Error('STORAGE_INVALID_OBJECT_KEY');
    }
    if (input.bytes.byteLength > 64 * 1024 * 1024) throw new Error('STORAGE_OBJECT_TOO_LARGE');
    const safeMetadata: Record<string, string> = {};
    if (input.customMetadata && typeof input.customMetadata === 'object') {
      for (const [k, v] of Object.entries(input.customMetadata).slice(0, 32)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (typeof v === 'string' && k.length <= 128 && v.length <= 1024) safeMetadata[k] = v;
      }
    }
    if (!this.store.has(input.objectKey) && this.store.size >= 1000) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    const sha256Hex = crypto.createHash('sha256').update(input.bytes).digest('hex');
    const stored: PortableStoredObject = {
      objectKey: input.objectKey,
      bytes: Buffer.from(input.bytes),
      contentType: input.contentType,
      sha256Hex,
      sizeBytes: input.bytes.byteLength,
      customMetadata: safeMetadata,
    };
    this.store.set(input.objectKey, stored);
    return { ...stored, bytes: Buffer.from(stored.bytes), customMetadata: { ...stored.customMetadata } };
  }

  async getObject(objectKey: string, range?: { start: number; end: number }): Promise<PortableStoredObject | null> {
    const item = this.store.get(objectKey);
    if (!item) return null;
    if (!range) {
      return { ...item, bytes: Buffer.from(item.bytes), customMetadata: { ...item.customMetadata } };
    }
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end >= item.bytes.byteLength) {
      throw new Error('STORAGE_INVALID_BYTE_RANGE');
    }
    const slice = item.bytes.subarray(range.start, range.end + 1);
    return {
      ...item,
      bytes: Buffer.from(slice),
      sizeBytes: slice.byteLength,
      customMetadata: { ...item.customMetadata },
    };
  }

  async headObject(objectKey: string): Promise<Omit<PortableStoredObject, 'bytes'> | null> {
    const item = this.store.get(objectKey);
    if (!item) return null;
    return {
      objectKey: item.objectKey,
      contentType: item.contentType,
      sha256Hex: item.sha256Hex,
      sizeBytes: item.sizeBytes,
      customMetadata: { ...item.customMetadata },
    };
  }

  async deleteObject(objectKey: string): Promise<{ deleted: boolean; alreadyAbsent: boolean }> {
    const existed = this.store.delete(objectKey);
    return { deleted: true, alreadyAbsent: !existed };
  }
}

export async function migrateAndVerifyStorageObjects(
  source: PortableStorageAdapter,
  target: PortableStorageAdapter,
  objectKeys: string[],
): Promise<{
  succeeded: number;
  skippedAlreadyIdentical: number;
  failed: number;
  failures: Array<{ objectKey: string; reason: string }>;
}> {
  let succeeded = 0;
  let skippedAlreadyIdentical = 0;
  const failures: Array<{ objectKey: string; reason: string }> = [];

  for (const key of objectKeys) {
    try {
      const srcObj = await source.getObject(key);
      if (!srcObj) {
        failures.push({ objectKey: key, reason: 'SOURCE_NOT_FOUND' });
        continue;
      }
      const existingHead = await target.headObject(key);
      if (existingHead && existingHead.sha256Hex === srcObj.sha256Hex && existingHead.contentType === srcObj.contentType && JSON.stringify(existingHead.customMetadata) === JSON.stringify(srcObj.customMetadata)) {
        skippedAlreadyIdentical++;
        continue;
      }
      const putRes = await target.putObject({
        objectKey: srcObj.objectKey,
        bytes: srcObj.bytes,
        contentType: srcObj.contentType,
        customMetadata: srcObj.customMetadata,
      });
      if (putRes.sha256Hex !== srcObj.sha256Hex || putRes.contentType !== srcObj.contentType) {
        failures.push({ objectKey: key, reason: 'POST_MIGRATION_CHECKSUM_MISMATCH' });
        continue;
      }
      succeeded++;
    } catch (err) {
      failures.push({ objectKey: key, reason: err instanceof Error ? err.message : 'MIGRATION_ERROR' });
    }
  }

  return {
    succeeded,
    skippedAlreadyIdentical,
    failed: failures.length,
    failures,
  };
}

// ============================================================================
// PROMPT 119: DISTRIBUTED TRACING & END-TO-END REQUEST OBSERVABILITY
// ============================================================================

export type TraceSpanLayer = 'HTTP_INGRESS' | 'AUTH' | 'BUSINESS_SERVICE' | 'DATABASE' | 'STORAGE' | 'EXTERNAL_API';

export interface TraceSpanRecord {
  traceId: string; spanId: string; parentSpanId?: string; requestId: string;
  operationName: string; layer: TraceSpanLayer; startTimeMs: number;
  durationMs: number; status: 'OK' | 'ERROR'; attributes: Record<string, unknown>;
}

interface ActiveTraceContext { traceId: string; requestId: string; currentSpanId?: string; }

export class DistributedTraceCollector {
  private readonly als = new AsyncLocalStorage<ActiveTraceContext>();
  private readonly spans: TraceSpanRecord[] = [];

  parseTraceparent(header?: string): { traceId: string; parentSpanId?: string } {
    if (header) {
      const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(header.trim());
      if (match && !/^0+$/.test(match[1]) && !/^0+$/.test(match[2])) {
        return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase() };
      }
    }
    return { traceId: crypto.randomBytes(16).toString('hex') };
  }

  async runInTraceContext<T>(params: { traceparentHeader?: string; requestId: string }, fn: () => Promise<T>): Promise<T> {
    const { traceId, parentSpanId } = this.parseTraceparent(params.traceparentHeader);
    return this.als.run({ traceId, requestId: params.requestId, currentSpanId: parentSpanId }, fn);
  }

  async withSpan<T>(operationName: string, layer: TraceSpanLayer, attributes: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    const ctx = this.als.getStore() ?? {
      traceId: crypto.randomBytes(16).toString('hex'),
      requestId: `req_${crypto.randomBytes(4).toString('hex')}`,
    };
    const spanId = crypto.randomBytes(8).toString('hex');
    const parentSpanId = ctx.currentSpanId;
    const startTimeMs = Date.now();
    let status: 'OK' | 'ERROR' = 'OK';
    try {
      return await this.als.run({ ...ctx, currentSpanId: spanId }, fn);
    } catch (err) {
      status = 'ERROR';
      throw err;
    } finally {
      const durationMs = Math.max(0, Date.now() - startTimeMs);
      if (this.spans.length >= 2000) this.spans.shift();
      this.spans.push({
        traceId: ctx.traceId, spanId, parentSpanId, requestId: ctx.requestId,
        operationName: String(operationName || '').slice(0, 128), layer, startTimeMs, durationMs, status,
        attributes: redactMetadataObject(attributes),
      });
    }
  }

  getSpansForTrace(traceId: string): TraceSpanRecord[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }
}

// ============================================================================
// PROMPTS 121 & 122: SAST / DAST & RUNTIME ENVIRONMENT HARDENING AUDIT
// ============================================================================

export function auditRuntimeEnvironmentAndSecurityPosture(
  env: Record<string, string | undefined> = process.env,
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'IRT',
): {
  passed: boolean;
  checks: Array<{ id: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }>;
  displayAreaUnitLabel: string;
  referenceValuationIntlText: string;
} {
  const checks: Array<{ id: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }> = [];
  const isProd = env.NODE_ENV === 'production';

  const debugEnabled = env.DEBUG === '*' || env.ENABLE_UNSAFE_DEBUG_ROUTES === 'true';
  checks.push({
    id: 'NO_UNSAFE_PRODUCTION_DEBUG_FLAGS',
    status: isProd && debugEnabled ? 'FAIL' : 'PASS',
    detail: isProd && debugEnabled ? 'Unsafe debug flags active in production' : 'Debug flags safe',
  });

  const hasViteSecretLeak = Object.keys(env).some(
    (k) => k.startsWith('VITE_') && Boolean(env[k]?.trim()) && /SECRET|PRIVATE_KEY|BOT_TOKEN|GEMINI_API_KEY|SERVICE_ACCOUNT|ADMIN_TOKEN|PASSWORD/i.test(k),
  );
  checks.push({
    id: 'NO_CLIENT_BUNDLE_SECRET_EXPOSURE',
    status: hasViteSecretLeak ? 'FAIL' : 'PASS',
    detail: hasViteSecretLeak ? 'Server secret prefixed with VITE_' : 'Client bundle env vars clean',
  });

  return {
    passed: checks.every((c) => c.status !== 'FAIL'),
    checks,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, intlCurrency),
  };
}

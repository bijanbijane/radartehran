/**
 * @file src/utils/webPlatformPwaAndPrivacyEngine.ts
 * @description Web Platform Compatibility, Safe Private-Browsing Storage Fallback, * Multi-Tier Cache-Control Policy, Stale Chunk Update Guard, External Link &
 * Reverse-Tabnabbing Protection, Data Lifecycle/Classification Catalog, Log Redaction, * CSV Formula-Injection Guard & Tamper-Evident Audit Trail (Sections 25 & 26 — Prompts 481 to 520).
 */
import crypto from 'node:crypto'; import { sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
// ============================================================================
// 1. PROMPTS 482 & 489 — BROWSER API CAPABILITY & PRIVATE-BROWSING STORAGE GUARD
// ============================================================================
export class SafeBrowserStorageAdapter { private readonly memoryFallback = new Map<string, string>(); private readonly forbiddenKeyPattern = /token|id_token|access_token|secret|password|private_key|admin_api|api_key|apikey|__proto__|constructor|prototype/i; setItem(key: string, value: string, backingStore?: Pick<Storage, 'setItem'> | null): {
    storedIn: 'NATIVE_STORAGE' | 'MEMORY_FALLBACK' | 'BLOCKED_SENSITIVE_KEY'; } { if (!key || this.forbiddenKeyPattern.test(key)) { return { storedIn: 'BLOCKED_SENSITIVE_KEY' }; }
    const safeVal = String(value).slice(0, 8192);
    if (!this.memoryFallback.has(key) && this.memoryFallback.size >= 500) { const oldest = this.memoryFallback.keys().next().value; if (oldest !== undefined) this.memoryFallback.delete(oldest); }
    if (backingStore) { try { backingStore.setItem(key, safeVal); this.memoryFallback.set(key, safeVal); return { storedIn: 'NATIVE_STORAGE' }; } catch {
        // Safari private browsing QuotaExceededError / SecurityError fallback
      } }
    this.memoryFallback.set(key, safeVal); return { storedIn: 'MEMORY_FALLBACK' }; }
  getItem(key: string, backingStore?: Pick<Storage, 'getItem'> | null): string | null { if (backingStore) { try { const v = backingStore.getItem(key);
        if (v !== null) return v; } catch {
        // Fallback to memory
      } }
    return this.memoryFallback.get(key) ?? null;
  }
  clearUserScopedDataOnLogout(): number { const count = this.memoryFallback.size; this.memoryFallback.clear(); return count; }
}
// ============================================================================
// 2. PROMPTS 485 & 492 — MULTI-TIER CACHE POLICY & STALE CHUNK RECOVERY
// ============================================================================
export type CacheResourceCategory = 'IMMUTABLE_HASHED_ASSET' | 'HTML_ENTRY_POINT' | 'PUBLIC_MARKET_REFERENCE' | 'USER_SPECIFIC_OR_ADMIN_API' | 'AUTHENTICATION_RESPONSE';
export function resolveResourceCacheControlPolicy(category: CacheResourceCategory): { cacheControlHeader: string; cdnCacheable: boolean; browserDiskCacheable: boolean } {
  switch (category) {
    case 'IMMUTABLE_HASHED_ASSET':
      return { cacheControlHeader: 'public, max-age=31536000, immutable', cdnCacheable: true, browserDiskCacheable: true };
    case 'HTML_ENTRY_POINT':
      return { cacheControlHeader: 'no-cache, no-store, must-revalidate', cdnCacheable: false, browserDiskCacheable: false };
    case 'PUBLIC_MARKET_REFERENCE':
      return { cacheControlHeader: 'public, max-age=60, stale-while-revalidate=300', cdnCacheable: true, browserDiskCacheable: true };
    case 'USER_SPECIFIC_OR_ADMIN_API':
    case 'AUTHENTICATION_RESPONSE':
      return { cacheControlHeader: 'private, no-store, no-cache, max-age=0', cdnCacheable: false, browserDiskCacheable: false };
  }
}
export function evaluateChunkLoadMismatchRecovery(params: {
  errorMessage: string; hasUnsavedFormChanges: boolean; alreadyReloadedInSession: boolean;
}): {
  isChunkMismatchError: boolean;
  action: 'PROMPT_NON_DESTRUCTIVE_REFRESH_BANNER' | 'AUTO_RELOAD_ONCE' | 'IGNORE_NOT_CHUNK_ERROR';
} {
  const isChunkMismatchError =
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(params.errorMessage);
  if (!isChunkMismatchError) return { isChunkMismatchError: false, action: 'IGNORE_NOT_CHUNK_ERROR' };
  if (params.hasUnsavedFormChanges || params.alreadyReloadedInSession) {
    return { isChunkMismatchError: true, action: 'PROMPT_NON_DESTRUCTIVE_REFRESH_BANNER' };
  }
  return { isChunkMismatchError: true, action: 'AUTO_RELOAD_ONCE' };
}
// ============================================================================
// 3. PROMPT 499 — EXTERNAL LINK, OPEN-REDIRECT & REVERSE-TABNABBING GUARD
// ============================================================================
export function validateExternalBrowserNavigationSafety(input: {
  rawUrl: string; opensInNewTab: boolean; isInternalRedirectParam?: boolean;
}): {
  safe: boolean; sanitizedHref: string; requiredRelAttribute: 'noopener noreferrer' | null; violationReason: string | null;
} {
  const trimmed = (input.rawUrl || '').trim();
  if (!trimmed) return { safe: false, sanitizedHref: '#', requiredRelAttribute: null, violationReason: 'EMPTY_URL' };
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return { safe: false, sanitizedHref: '#', requiredRelAttribute: null, violationReason: 'DANGEROUS_URL_SCHEME_BLOCKED' };
  }
  if (input.isInternalRedirectParam) {
    if (
      !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') ||
      trimmed.includes('..') || /[\u0000-\u001F\u007F]/.test(trimmed) || /^\/(%2f|%5c)/i.test(trimmed)
    ) {
      return { safe: false, sanitizedHref: '/', requiredRelAttribute: null, violationReason: 'OPEN_REDIRECT_BLOCKED' };
    }
    return { safe: true, sanitizedHref: trimmed, requiredRelAttribute: null, violationReason: null };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { safe: false, sanitizedHref: '#', requiredRelAttribute: null, violationReason: 'UNSUPPORTED_PROTOCOL' };
    }
    return {
      safe: true, sanitizedHref: parsed.toString(),
      requiredRelAttribute: input.opensInNewTab ? 'noopener noreferrer' : null, violationReason: null,
    };
  } catch {
    return { safe: false, sanitizedHref: '#', requiredRelAttribute: null, violationReason: 'MALFORMED_URL' };
  }
}
// ============================================================================
// 4. PROMPTS 501, 502 & 510 — DATA CLASSIFICATION & RETENTION LIFECYCLE
// ============================================================================
export type RadarDataCategory =
  | 'PUBLIC_MARKET_AGGREGATE' | 'USER_UI_PREFERENCES' | 'BUYER_ALERT_CONTACT_PII'
  | 'CONFIDENTIAL_B2B_SPONSOR_CRM' | 'AUTH_AND_SESSION_CREDENTIALS' | 'ADMIN_SECURITY_AUDIT_TRAIL';
export interface DataClassificationPolicy {
  category: RadarDataCategory; sensitivityLevel: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL_PII' | 'STRICT_SECRET';
  allowInApplicationLogs: boolean; allowInLocalCacheFile: boolean; retentionDays: number;
  deletionStrategy: 'IMMEDIATE_PURGE' | 'TOMBSTONE_AND_JOURNAL_CASCADE' | 'IMMUTABLE_RETENTION_WINDOW';
}
export const RADAR_DATA_CLASSIFICATION_CATALOG: Record<RadarDataCategory, DataClassificationPolicy> = {
  PUBLIC_MARKET_AGGREGATE: {
    category: 'PUBLIC_MARKET_AGGREGATE', sensitivityLevel: 'PUBLIC',
    allowInApplicationLogs: true, allowInLocalCacheFile: true, retentionDays: 365, deletionStrategy: 'IMMEDIATE_PURGE',
  },
  USER_UI_PREFERENCES: {
    category: 'USER_UI_PREFERENCES', sensitivityLevel: 'INTERNAL',
    allowInApplicationLogs: true, allowInLocalCacheFile: false, retentionDays: 90, deletionStrategy: 'IMMEDIATE_PURGE',
  },
  BUYER_ALERT_CONTACT_PII: {
    category: 'BUYER_ALERT_CONTACT_PII', sensitivityLevel: 'CONFIDENTIAL_PII',
    allowInApplicationLogs: false, allowInLocalCacheFile: false, retentionDays: 180, deletionStrategy: 'TOMBSTONE_AND_JOURNAL_CASCADE',
  },
  CONFIDENTIAL_B2B_SPONSOR_CRM: {
    category: 'CONFIDENTIAL_B2B_SPONSOR_CRM', sensitivityLevel: 'CONFIDENTIAL_PII',
    allowInApplicationLogs: false, allowInLocalCacheFile: false, retentionDays: 365, deletionStrategy: 'TOMBSTONE_AND_JOURNAL_CASCADE',
  },
  AUTH_AND_SESSION_CREDENTIALS: {
    category: 'AUTH_AND_SESSION_CREDENTIALS', sensitivityLevel: 'STRICT_SECRET',
    allowInApplicationLogs: false, allowInLocalCacheFile: false, retentionDays: 1, deletionStrategy: 'IMMEDIATE_PURGE',
  },
  ADMIN_SECURITY_AUDIT_TRAIL: {
    category: 'ADMIN_SECURITY_AUDIT_TRAIL', sensitivityLevel: 'INTERNAL',
    allowInApplicationLogs: true, allowInLocalCacheFile: false, retentionDays: 730, deletionStrategy: 'IMMUTABLE_RETENTION_WINDOW',
  },
};
// ============================================================================
// 5. PROMPTS 505, 513 & 514 — LOG REDACTION, CSV EXPORT GUARD & AUDIT CHAIN
const SENSITIVE_LOG_KEY_REGEX =
  /password|secret|token|authorization|cookie|api_key|private_key|phone|mobile|email|national_id|iban/i;
export function redactSensitiveLogPayload(
  rawObj: Record<string, unknown>,
  depth = 0,
  visited = new WeakSet<object>(),
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  if (!rawObj || typeof rawObj !== 'object' || depth > 8) return out;
  if (visited.has(rawObj)) return out;
  visited.add(rawObj);
  for (const [k, v] of Object.entries(rawObj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (SENSITIVE_LOG_KEY_REGEX.test(k)) {
      out[k] = '[REDACTED_SENSITIVE_FIELD]';
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/\b09\d{9}\b/g, '[REDACTED_IRAN_MOBILE]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSensitiveLogPayload(v as Record<string, unknown>, depth + 1, visited);
    } else {
      out[k] = v;
    }
  }
  return out;
}
/**
 * Neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) in CSV/Excel exports.
 */
export function sanitizeCsvExportCell(rawCell: unknown): string {
  const str = String(rawCell ?? '').replace(/\r?\n/g, ' ').trim();
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  const escapedQuotes = neutralized.replace(/"/g, '""');
  return `"${escapedQuotes}"`;
}
export interface TamperEvidentSecurityAuditRecord {
  sequenceNumber: number; timestampIsoUtc: string; actorUid: string; actionType: string; targetResourceId: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED'; correlationId: string; previousHash: string; entryHash: string;
  displayAreaUnitLabel?: string; auditLiabilityCapIntlText?: string;
}
export function appendTamperEvidentSecurityAuditRecord(
  chain: readonly TamperEvidentSecurityAuditRecord[],
  input: { timestampMs: number; actorUid: string; actionType: string; targetResourceId: string; outcome: 'SUCCESS' | 'DENIED' | 'FAILED'; correlationId: string },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): TamperEvidentSecurityAuditRecord {
  const prev = chain.length > 0 ? chain[chain.length - 1] : null;
  const sequenceNumber = (prev?.sequenceNumber ?? 0) + 1;
  const previousHash = prev?.entryHash ?? 'GENESIS_00000000000000000000000000000000';
  const timestampIsoUtc = new Date(input.timestampMs).toISOString();
  const actorUid = sanitizeInput(input.actorUid, 64) || 'anonymous';
  const actionType = sanitizeInput(input.actionType, 64);
  const targetResourceId = sanitizeInput(input.targetResourceId, 128);
  const correlationId = sanitizeInput(input.correlationId, 64);
  const canonical = `${sequenceNumber}|${timestampIsoUtc}|${actorUid}|${actionType}|${targetResourceId}|${input.outcome}|${correlationId}|${previousHash}`;
  const entryHash = crypto.createHash('sha256').update(canonical).digest('hex');
  return {
    sequenceNumber, timestampIsoUtc, actorUid, actionType, targetResourceId,
    outcome: input.outcome, correlationId, previousHash, entryHash,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    auditLiabilityCapIntlText: formatMillionTomanAsIntlCurrency(1000, intlCurrency),
  };
}
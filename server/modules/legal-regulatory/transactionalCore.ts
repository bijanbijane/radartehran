import crypto from 'node:crypto';
import {
  ComplianceRequirementRecord,
  LegalRegulatoryAuditRecord,
  NonAuthoritativeAiSummaryRecord,
  RegulatoryApplicabilityRuleRecord,
  RegulatoryChangeRecord,
  RegulatoryDocumentRecord,
  RegulatoryProvisionConflictRecord,
  RegulatoryProvisionRecord,
  RegulatorySourceRecord,
} from './types';
import { LegalRegulatoryError } from './validationAndAuthz';

export const LEGAL_REGULATORY_COLLECTIONS = {
  SOURCES: 'legal_regulatory_sources_v1',
  DOCUMENTS: 'legal_regulatory_documents_v1',
  PROVISIONS: 'legal_regulatory_provisions_v1',
  APPLICABILITY_RULES: 'legal_applicability_rules_v1',
  CHANGE_HISTORY: 'legal_change_records_v1',
  CONFLICTS: 'legal_conflict_records_v1',
  COMPLIANCE_REQUIREMENTS: 'legal_compliance_requirements_v1',
  AI_SUMMARIES: 'legal_ai_suggestions_v1',
  AUDIT_LOG: 'legal_regulatory_audit_v1',
  IDEMPOTENCY: 'legal_regulatory_idempotency_v1',
} as const;

export interface IdempotencyRecord<T = unknown> {
  key: string;
  operation: string;
  actorId: string;
  requestHash: string;
  responsePayload: T;
  createdAtIso: string;
  schemaVersion: 1;
}

/**
 * Canonical Unit-of-Work transaction contract for Legal & Regulatory Intelligence.
 * Enforces Firestore Read-before-Write: all `get*` methods read within the transaction,
 * and all `put*` methods stage writes in-memory to be flushed atomically after callback completion.
 */
export interface LegalRegulatoryTransaction {
  getSourceById(id: string): Promise<RegulatorySourceRecord | null>;
  getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null>;
  getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null>;
  getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null>;
  getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null>;
  getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null>;
  getIdempotencyRecord<T>(key: string, operation: string, actorId: string): Promise<IdempotencyRecord<T> | null>;

  putSource(record: RegulatorySourceRecord, expectedPreviousVersion: number): void;
  putDocument(record: RegulatoryDocumentRecord, expectedPreviousVersion: number): void;
  putProvision(record: RegulatoryProvisionRecord, expectedPreviousVersion: number): void;
  putChangeRecord(record: RegulatoryChangeRecord): void;
  putConflict(record: RegulatoryProvisionConflictRecord, expectedPreviousVersion: number): void;
  putApplicabilityRule(record: RegulatoryApplicabilityRuleRecord, expectedPreviousVersion: number): void;
  putComplianceRequirement(record: ComplianceRequirementRecord, expectedPreviousVersion: number): void;
  putAiSummaryRecord(record: NonAuthoritativeAiSummaryRecord): void;
  putAuditRecord(record: LegalRegulatoryAuditRecord): void;
  putIdempotencyRecord<T>(record: IdempotencyRecord<T>): void;
}

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export function assertValidIdempotencyKey(rawKey: unknown): string {
  if (typeof rawKey !== 'string') {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      `Idempotency-Key must be a non-empty string (1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters).`,
      400,
    );
  }
  const trimmed = rawKey.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      `Idempotency-Key length must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      400,
    );
  }
  return trimmed;
}

/**
 * Collision-resistant SHA-256 document ID for idempotency records using JSON array boundary encoding.
 */
export function buildIdempotencyDocumentId(operation: string, actorId: string, key: string): string {
  const validKey = assertValidIdempotencyKey(key);
  const canonicalInput = JSON.stringify([operation, actorId, validKey]);
  return crypto.createHash('sha256').update(canonicalInput, 'utf8').digest('hex');
}

export function computeIdempotencyDocumentId(actorId: string, operation: string, key: string): string {
  return buildIdempotencyDocumentId(operation, actorId, key);
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    // Preserve array element order because order can carry domain meaning.
    return value.map((item) => canonicalizeValue(item));
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val !== undefined) {
      sorted[key] = canonicalizeValue(val);
    }
  }
  return sorted;
}

export function computeCanonicalPayloadHash(payload: unknown): string {
  const canonicalJson = JSON.stringify(canonicalizeValue(payload));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

export function assertIdempotencyRecordMatches<T>(
  existing: IdempotencyRecord<T>,
  expectedRequestHash: string | undefined,
  operation: string,
  key: string,
): T {
  if (expectedRequestHash && existing.requestHash && existing.requestHash !== expectedRequestHash) {
    throw new LegalRegulatoryError(
      'IDEMPOTENCY_KEY_REUSED',
      `Idempotency key '${key}' for operation '${operation}' was already used with a different request payload.`,
      409,
      { operation, key },
    );
  }
  return structuredClone(existing.responsePayload);
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const src = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v !== undefined) {
      cleaned[k] = sanitizeForFirestore(v);
    }
  }
  return cleaned as T;
}

export function paginateSortedItems<T>(
  items: T[],
  rawLimit?: number,
  cursor?: string,
): import('./types').PaginatedResult<T> {
  const limit = Math.max(1, Math.min(100, Math.floor(typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 20)));
  let startIndex = 0;
  if (cursor && cursor.trim().length > 0) {
    const parsed = Number.parseInt(cursor.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      startIndex = parsed;
    }
  }
  const slice = items.slice(startIndex, startIndex + limit);
  const nextIndex = startIndex + slice.length;
  return {
    items: slice,
    nextCursor: nextIndex < items.length ? String(nextIndex) : null,
    limit,
    totalMatched: items.length,
  };
}

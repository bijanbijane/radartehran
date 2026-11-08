import { LegalRegulatoryError, normalizePaginationLimit } from './validationAndAuthz';
import {
  ComplianceRequirementRecord,
  LegalRegulatoryAuditRecord,
  NonAuthoritativeAiSummaryRecord,
  PaginatedResult,
  RegulatoryApplicabilityRuleRecord,
  RegulatoryChangeRecord,
  RegulatoryDocumentRecord,
  RegulatoryProvisionConflictRecord,
  RegulatoryProvisionRecord,
  RegulatorySourceRecord,
} from './types';

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
  responsePayload: T;
  createdAtIso: string;
}

export interface LegalRegulatoryStore {
  getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null>;
  saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void>;

  getSourceById(id: string): Promise<RegulatorySourceRecord | null>;
  saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord>;
  listSources(): Promise<RegulatorySourceRecord[]>;

  getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null>;
  saveDocument(record: RegulatoryDocumentRecord, expectedPreviousVersion?: number): Promise<RegulatoryDocumentRecord>;
  listDocumentsBySource(sourceId: string): Promise<RegulatoryDocumentRecord[]>;

  getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null>;
  saveProvision(
    record: RegulatoryProvisionRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionRecord>;
  listProvisions(): Promise<RegulatoryProvisionRecord[]>;

  saveChangeRecord(record: RegulatoryChangeRecord): Promise<RegulatoryChangeRecord>;
  listChangeRecordsForProvision(provisionId: string): Promise<RegulatoryChangeRecord[]>;

  getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null>;
  saveConflictRecord(
    record: RegulatoryProvisionConflictRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionConflictRecord>;
  listConflictRecords(): Promise<RegulatoryProvisionConflictRecord[]>;

  getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null>;
  saveApplicabilityRule(
    record: RegulatoryApplicabilityRuleRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryApplicabilityRuleRecord>;
  listApplicabilityRules(): Promise<RegulatoryApplicabilityRuleRecord[]>;

  getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null>;
  saveComplianceRequirement(
    record: ComplianceRequirementRecord,
    expectedPreviousVersion?: number,
  ): Promise<ComplianceRequirementRecord>;
  listComplianceRequirements(): Promise<ComplianceRequirementRecord[]>;

  saveAiSummaryRecord(record: NonAuthoritativeAiSummaryRecord): Promise<NonAuthoritativeAiSummaryRecord>;
  listAiSummariesForTarget(
    targetEntityType: NonAuthoritativeAiSummaryRecord['targetEntityType'],
    targetEntityId: string,
  ): Promise<NonAuthoritativeAiSummaryRecord[]>;

  appendAuditRecord(record: LegalRegulatoryAuditRecord): Promise<void>;
  listAuditRecords(limit?: number): Promise<LegalRegulatoryAuditRecord[]>;
}

export function paginateSortedItems<T extends { id: string }>(
  sortedItems: T[],
  limitRaw?: number,
  cursor?: string | null,
): PaginatedResult<T> {
  const limit = normalizePaginationLimit(limitRaw);
  let startIndex = 0;
  if (cursor && cursor.trim() !== '') {
    const foundIdx = sortedItems.findIndex((item) => item.id === cursor.trim());
    if (foundIdx >= 0) {
      startIndex = foundIdx + 1;
    }
  }
  const slice = sortedItems.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < sortedItems.length && slice.length > 0 ? slice[slice.length - 1].id : null;
  return {
    items: slice,
    nextCursor,
    limit,
    totalMatched: sortedItems.length,
  };
}

export class DeterministicLegalRegulatoryStore implements LegalRegulatoryStore {
  private readonly sources = new Map<string, RegulatorySourceRecord>();
  private readonly documents = new Map<string, RegulatoryDocumentRecord>();
  private readonly provisions = new Map<string, RegulatoryProvisionRecord>();
  private readonly rules = new Map<string, RegulatoryApplicabilityRuleRecord>();
  private readonly changes = new Map<string, RegulatoryChangeRecord>();
  private readonly conflicts = new Map<string, RegulatoryProvisionConflictRecord>();
  private readonly complianceReqs = new Map<string, ComplianceRequirementRecord>();
  private readonly aiSummaries = new Map<string, NonAuthoritativeAiSummaryRecord>();
  private readonly audits: LegalRegulatoryAuditRecord[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private failNextWritesCount = 0;

  public simulateNextWriteFailure(count = 1): void {
    this.failNextWritesCount = Math.max(0, count);
  }

  private checkSimulatedFailure(): void {
    if (this.failNextWritesCount > 0) {
      this.failNextWritesCount -= 1;
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        'Simulated persistence write failure in DeterministicLegalRegulatoryStore.',
        503,
      );
    }
  }

  private assertOptimisticVersion(
    entityType: string,
    id: string,
    existingVersion: number | undefined,
    expectedPreviousVersion?: number,
  ): void {
    if (expectedPreviousVersion === undefined) return;
    const actual = existingVersion ?? 0;
    if (actual !== expectedPreviousVersion) {
      throw new LegalRegulatoryError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Concurrent modification conflict on ${entityType} '${id}': expected version ${expectedPreviousVersion}, found ${actual}.`,
        409,
        { entityType, id, expectedPreviousVersion, actualVersion: actual },
      );
    }
  }

  private saveVersionedEntity<T extends { id: string; version: number }>(
    map: Map<string, T>,
    entityType: string,
    record: T,
    expectedPreviousVersion?: number,
  ): Promise<T> {
    this.checkSimulatedFailure();
    const existing = map.get(record.id);
    this.assertOptimisticVersion(entityType, record.id, existing?.version, expectedPreviousVersion);
    const cloned = structuredClone(record);
    map.set(record.id, cloned);
    return Promise.resolve(structuredClone(cloned));
  }

  async getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null> {
    const existing = this.idempotency.get(`${operation}::${actorId}::${key}`);
    return existing ? (structuredClone(existing.responsePayload) as T) : null;
  }

  async saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void> {
    this.checkSimulatedFailure();
    this.idempotency.set(`${operation}::${actorId}::${key}`, {
      key,
      operation,
      actorId,
      responsePayload: structuredClone(payload),
      createdAtIso: new Date().toISOString(),
    });
  }

  async getSourceById(id: string): Promise<RegulatorySourceRecord | null> {
    const found = this.sources.get(id);
    return found ? structuredClone(found) : null;
  }

  saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord> {
    return this.saveVersionedEntity(this.sources, 'RegulatorySource', record, expectedPreviousVersion);
  }

  async listSources(): Promise<RegulatorySourceRecord[]> {
    return Array.from(this.sources.values())
      .map((s) => structuredClone(s))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null> {
    const found = this.documents.get(id);
    return found ? structuredClone(found) : null;
  }

  saveDocument(
    record: RegulatoryDocumentRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryDocumentRecord> {
    return this.saveVersionedEntity(this.documents, 'RegulatoryDocument', record, expectedPreviousVersion);
  }

  async listDocumentsBySource(sourceId: string): Promise<RegulatoryDocumentRecord[]> {
    return Array.from(this.documents.values())
      .filter((d) => d.sourceId === sourceId)
      .map((d) => structuredClone(d))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null> {
    const found = this.provisions.get(id);
    return found ? structuredClone(found) : null;
  }

  saveProvision(
    record: RegulatoryProvisionRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionRecord> {
    return this.saveVersionedEntity(this.provisions, 'RegulatoryProvision', record, expectedPreviousVersion);
  }

  async listProvisions(): Promise<RegulatoryProvisionRecord[]> {
    return Array.from(this.provisions.values())
      .map((p) => structuredClone(p))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveChangeRecord(record: RegulatoryChangeRecord): Promise<RegulatoryChangeRecord> {
    this.checkSimulatedFailure();
    const cloned = structuredClone(record);
    this.changes.set(record.id, cloned);
    return structuredClone(cloned);
  }

  async listChangeRecordsForProvision(provisionId: string): Promise<RegulatoryChangeRecord[]> {
    return Array.from(this.changes.values())
      .filter((c) => c.targetProvisionId === provisionId)
      .map((c) => structuredClone(c))
      .sort((a, b) => a.previousProvisionVersion - b.previousProvisionVersion);
  }

  async getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null> {
    const found = this.conflicts.get(id);
    return found ? structuredClone(found) : null;
  }

  saveConflictRecord(
    record: RegulatoryProvisionConflictRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionConflictRecord> {
    return this.saveVersionedEntity(this.conflicts, 'RegulatoryConflict', record, expectedPreviousVersion);
  }

  async listConflictRecords(): Promise<RegulatoryProvisionConflictRecord[]> {
    return Array.from(this.conflicts.values())
      .map((c) => structuredClone(c))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null> {
    const found = this.rules.get(id);
    return found ? structuredClone(found) : null;
  }

  saveApplicabilityRule(
    record: RegulatoryApplicabilityRuleRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryApplicabilityRuleRecord> {
    return this.saveVersionedEntity(this.rules, 'ApplicabilityRule', record, expectedPreviousVersion);
  }

  async listApplicabilityRules(): Promise<RegulatoryApplicabilityRuleRecord[]> {
    return Array.from(this.rules.values())
      .map((r) => structuredClone(r))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null> {
    const found = this.complianceReqs.get(id);
    return found ? structuredClone(found) : null;
  }

  saveComplianceRequirement(
    record: ComplianceRequirementRecord,
    expectedPreviousVersion?: number,
  ): Promise<ComplianceRequirementRecord> {
    return this.saveVersionedEntity(
      this.complianceReqs,
      'ComplianceRequirement',
      record,
      expectedPreviousVersion,
    );
  }

  async listComplianceRequirements(): Promise<ComplianceRequirementRecord[]> {
    return Array.from(this.complianceReqs.values())
      .map((c) => structuredClone(c))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveAiSummaryRecord(record: NonAuthoritativeAiSummaryRecord): Promise<NonAuthoritativeAiSummaryRecord> {
    this.checkSimulatedFailure();
    const cloned = structuredClone(record);
    this.aiSummaries.set(record.id, cloned);
    return structuredClone(cloned);
  }

  async listAiSummariesForTarget(
    targetEntityType: NonAuthoritativeAiSummaryRecord['targetEntityType'],
    targetEntityId: string,
  ): Promise<NonAuthoritativeAiSummaryRecord[]> {
    return Array.from(this.aiSummaries.values())
      .filter((s) => s.targetEntityType === targetEntityType && s.targetEntityId === targetEntityId)
      .map((s) => structuredClone(s))
      .sort((a, b) => b.generatedAtIso.localeCompare(a.generatedAtIso));
  }

  async appendAuditRecord(record: LegalRegulatoryAuditRecord): Promise<void> {
    this.checkSimulatedFailure();
    this.audits.push(structuredClone(record));
  }

  async listAuditRecords(limit = 50): Promise<LegalRegulatoryAuditRecord[]> {
    const clamped = normalizePaginationLimit(limit);
    return this.audits.slice(-clamped).map((a) => structuredClone(a));
  }
}

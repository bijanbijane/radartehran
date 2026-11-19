import {
  assertIdempotencyRecordMatches,
  buildIdempotencyDocumentId,
  IdempotencyRecord,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryTransaction,
  paginateSortedItems,
} from './transactionalCore';
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
import { LegalRegulatoryError, normalizePaginationLimit } from './validationAndAuthz';

export { LEGAL_REGULATORY_COLLECTIONS, paginateSortedItems };
export type { IdempotencyRecord, LegalRegulatoryTransaction };

export interface LegalRegulatoryStore {
  runTransaction<T>(operation: (transaction: LegalRegulatoryTransaction) => Promise<T>): Promise<T>;

  getIdempotentResult<T>(key: string, operation: string, actorId: string, requestHash?: string): Promise<T | null>;
  saveIdempotentResult<T>(
    key: string,
    operation: string,
    actorId: string,
    payload: T,
    requestHash?: string,
  ): Promise<void>;

  getSourceById(id: string): Promise<RegulatorySourceRecord | null>;
  saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord>;
  listSources(): Promise<RegulatorySourceRecord[]>;

  getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null>;
  saveDocument(record: RegulatoryDocumentRecord, expectedPreviousVersion?: number): Promise<RegulatoryDocumentRecord>;
  listDocumentsBySource(sourceId: string): Promise<RegulatoryDocumentRecord[]>;

  getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null>;
  saveProvision(record: RegulatoryProvisionRecord, expectedPreviousVersion?: number): Promise<RegulatoryProvisionRecord>;
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

type StagedMemoryWrite =
  | { kind: 'SOURCE'; record: RegulatorySourceRecord; expectedPreviousVersion: number }
  | { kind: 'DOCUMENT'; record: RegulatoryDocumentRecord; expectedPreviousVersion: number }
  | { kind: 'PROVISION'; record: RegulatoryProvisionRecord; expectedPreviousVersion: number }
  | { kind: 'CHANGE'; record: RegulatoryChangeRecord }
  | { kind: 'CONFLICT'; record: RegulatoryProvisionConflictRecord; expectedPreviousVersion: number }
  | { kind: 'RULE'; record: RegulatoryApplicabilityRuleRecord; expectedPreviousVersion: number }
  | { kind: 'COMPLIANCE'; record: ComplianceRequirementRecord; expectedPreviousVersion: number }
  | { kind: 'AI'; record: NonAuthoritativeAiSummaryRecord }
  | { kind: 'AUDIT'; record: LegalRegulatoryAuditRecord }
  | { kind: 'IDEMPOTENCY'; docId: string; record: IdempotencyRecord<unknown> };

/**
 * Deterministic in-memory transactional store strictly for isolated unit tests.
 * Prohibited in production factories and never used as a fallback by FirestoreLegalRegulatoryStore.
 */
export class DeterministicLegalRegulatoryStore implements LegalRegulatoryStore {
  private readonly sources = new Map<string, RegulatorySourceRecord>();
  private readonly documents = new Map<string, RegulatoryDocumentRecord>();
  private readonly provisions = new Map<string, RegulatoryProvisionRecord>();
  private readonly changeRecords = new Map<string, RegulatoryChangeRecord>();
  private readonly conflicts = new Map<string, RegulatoryProvisionConflictRecord>();
  private readonly applicabilityRules = new Map<string, RegulatoryApplicabilityRuleRecord>();
  private readonly complianceRequirements = new Map<string, ComplianceRequirementRecord>();
  private readonly aiSummaries = new Map<string, NonAuthoritativeAiSummaryRecord>();
  private readonly auditRecords: LegalRegulatoryAuditRecord[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord<unknown>>();
  private remainingWriteFailures = 0;
  private failNextTxAtWriteIndex: number | null = null;
  private failNextTxOnKind: StagedMemoryWrite['kind'] | null = null;

  public simulateNextWriteFailure(count = 1): void {
    this.remainingWriteFailures = Math.max(0, count);
  }

  public simulateNextTransactionFailureAtWriteIndex(writeIndex: number): void {
    this.failNextTxAtWriteIndex = writeIndex;
  }

  public simulateNextTransactionFailureOnKind(kind: StagedMemoryWrite['kind']): void {
    this.failNextTxOnKind = kind;
  }

  private assertWriteAvailable(): void {
    if (this.remainingWriteFailures > 0) {
      this.remainingWriteFailures -= 1;
      throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Simulated persistence write outage.', 503);
    }
  }

  private assertVersionMatch<T extends { version: number }>(
    map: Map<string, T>,
    id: string,
    expectedPreviousVersion: number | undefined,
    entityName: string,
  ): void {
    if (expectedPreviousVersion === undefined) return;
    const current = map.get(id);
    const currentVersion = current ? current.version : 0;
    if (currentVersion !== expectedPreviousVersion) {
      throw new LegalRegulatoryError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Concurrent modification conflict on ${entityName} '${id}': expected version ${expectedPreviousVersion}, found ${currentVersion}.`,
        409,
        { entityName, id, expectedPreviousVersion, actualVersion: currentVersion },
      );
    }
  }

  public async runTransaction<T>(operation: (transaction: LegalRegulatoryTransaction) => Promise<T>): Promise<T> {
    this.assertWriteAvailable();
    const staged: StagedMemoryWrite[] = [];
    let flushing = false;

    const assertReadable = (): void => {
      if (flushing) {
        throw new LegalRegulatoryError(
          'PERSISTENCE_UNAVAILABLE',
          'Transaction protocol violation: attempted read after write flush began.',
          503,
        );
      }
    };

    const tx: LegalRegulatoryTransaction = {
      getSourceById: async (id) => {
        assertReadable();
        const found = this.sources.get(id);
        return found ? structuredClone(found) : null;
      },
      getDocumentById: async (id) => {
        assertReadable();
        const found = this.documents.get(id);
        return found ? structuredClone(found) : null;
      },
      getProvisionById: async (id) => {
        assertReadable();
        const found = this.provisions.get(id);
        return found ? structuredClone(found) : null;
      },
      getConflictById: async (id) => {
        assertReadable();
        const found = this.conflicts.get(id);
        return found ? structuredClone(found) : null;
      },
      getApplicabilityRuleById: async (id) => {
        assertReadable();
        const found = this.applicabilityRules.get(id);
        return found ? structuredClone(found) : null;
      },
      getComplianceRequirementById: async (id) => {
        assertReadable();
        const found = this.complianceRequirements.get(id);
        return found ? structuredClone(found) : null;
      },
      getIdempotencyRecord: async <R>(key: string, op: string, actorId: string) => {
        assertReadable();
        const docId = buildIdempotencyDocumentId(op, actorId, key);
        const found = this.idempotency.get(docId);
        return found ? (structuredClone(found) as IdempotencyRecord<R>) : null;
      },

      putSource: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'SOURCE', record: structuredClone(record), expectedPreviousVersion }),
      putDocument: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'DOCUMENT', record: structuredClone(record), expectedPreviousVersion }),
      putProvision: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'PROVISION', record: structuredClone(record), expectedPreviousVersion }),
      putChangeRecord: (record) => staged.push({ kind: 'CHANGE', record: structuredClone(record) }),
      putConflict: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'CONFLICT', record: structuredClone(record), expectedPreviousVersion }),
      putApplicabilityRule: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'RULE', record: structuredClone(record), expectedPreviousVersion }),
      putComplianceRequirement: (record, expectedPreviousVersion) =>
        staged.push({ kind: 'COMPLIANCE', record: structuredClone(record), expectedPreviousVersion }),
      putAiSummaryRecord: (record) => staged.push({ kind: 'AI', record: structuredClone(record) }),
      putAuditRecord: (record) => staged.push({ kind: 'AUDIT', record: structuredClone(record) }),
      putIdempotencyRecord: <R>(record: IdempotencyRecord<R>) => {
        const docId = buildIdempotencyDocumentId(record.operation, record.actorId, record.key);
        staged.push({ kind: 'IDEMPOTENCY', docId, record: structuredClone({ ...record, schemaVersion: 1 }) });
      },
    };

    const result = await operation(tx);
    flushing = true;

    // Validate all CAS assertions and simulated failures BEFORE mutating any map (atomic rollback).
    const failAt = this.failNextTxAtWriteIndex;
    this.failNextTxAtWriteIndex = null;
    const failKind = this.failNextTxOnKind;
    this.failNextTxOnKind = null;

    for (let idx = 0; idx < staged.length; idx += 1) {
      const write = staged[idx];
      if (failAt !== null && idx === failAt) {
        throw new LegalRegulatoryError(
          'PERSISTENCE_UNAVAILABLE',
          `Simulated mid-transaction failure at write index ${idx}; all staged writes rolled back.`,
          503,
        );
      }
      if (failKind !== null && write.kind === failKind) {
        throw new LegalRegulatoryError(
          'PERSISTENCE_UNAVAILABLE',
          `Simulated mid-transaction failure while committing ${write.kind}; all staged writes rolled back.`,
          503,
        );
      }
      if (write.kind === 'SOURCE') this.assertVersionMatch(this.sources, write.record.id, write.expectedPreviousVersion, 'RegulatorySource');
      if (write.kind === 'DOCUMENT') this.assertVersionMatch(this.documents, write.record.id, write.expectedPreviousVersion, 'RegulatoryDocument');
      if (write.kind === 'PROVISION') this.assertVersionMatch(this.provisions, write.record.id, write.expectedPreviousVersion, 'RegulatoryProvision');
      if (write.kind === 'CONFLICT') this.assertVersionMatch(this.conflicts, write.record.id, write.expectedPreviousVersion, 'ProvisionConflict');
      if (write.kind === 'RULE') this.assertVersionMatch(this.applicabilityRules, write.record.id, write.expectedPreviousVersion, 'ApplicabilityRule');
      if (write.kind === 'COMPLIANCE') this.assertVersionMatch(this.complianceRequirements, write.record.id, write.expectedPreviousVersion, 'ComplianceRequirement');
    }

    // Commit all staged writes atomically.
    for (const write of staged) {
      switch (write.kind) {
        case 'SOURCE':
          this.sources.set(write.record.id, write.record);
          break;
        case 'DOCUMENT':
          this.documents.set(write.record.id, write.record);
          break;
        case 'PROVISION':
          this.provisions.set(write.record.id, write.record);
          break;
        case 'CHANGE':
          this.changeRecords.set(write.record.id, write.record);
          break;
        case 'CONFLICT':
          this.conflicts.set(write.record.id, write.record);
          break;
        case 'RULE':
          this.applicabilityRules.set(write.record.id, write.record);
          break;
        case 'COMPLIANCE':
          this.complianceRequirements.set(write.record.id, write.record);
          break;
        case 'AI':
          this.aiSummaries.set(write.record.id, write.record);
          break;
        case 'AUDIT':
          this.auditRecords.push(write.record);
          break;
        case 'IDEMPOTENCY':
          this.idempotency.set(write.docId, write.record);
          break;
      }
    }

    return result;
  }

  async getIdempotentResult<T>(
    key: string,
    operation: string,
    actorId: string,
    requestHash?: string,
  ): Promise<T | null> {
    const docId = buildIdempotencyDocumentId(operation, actorId, key);
    const existing = this.idempotency.get(docId);
    if (!existing) return null;
    return assertIdempotencyRecordMatches(existing as IdempotencyRecord<T>, requestHash, operation, key);
  }

  async saveIdempotentResult<T>(
    key: string,
    operation: string,
    actorId: string,
    payload: T,
    requestHash = '',
  ): Promise<void> {
    await this.runTransaction(async (tx) => {
      tx.putIdempotencyRecord({
        key,
        operation,
        actorId,
        requestHash,
        responsePayload: structuredClone(payload),
        createdAtIso: new Date().toISOString(),
        schemaVersion: 1,
      });
    });
  }

  async getSourceById(id: string): Promise<RegulatorySourceRecord | null> {
    const found = this.sources.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord> {
    const expected = expectedPreviousVersion ?? (this.sources.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putSource(record, expected);
    });
    return structuredClone(record);
  }

  async listSources(): Promise<RegulatorySourceRecord[]> {
    return Array.from(this.sources.values()).map((r) => structuredClone(r)).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null> {
    const found = this.documents.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveDocument(record: RegulatoryDocumentRecord, expectedPreviousVersion?: number): Promise<RegulatoryDocumentRecord> {
    const expected = expectedPreviousVersion ?? (this.documents.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putDocument(record, expected);
    });
    return structuredClone(record);
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

  async saveProvision(record: RegulatoryProvisionRecord, expectedPreviousVersion?: number): Promise<RegulatoryProvisionRecord> {
    const expected = expectedPreviousVersion ?? (this.provisions.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putProvision(record, expected);
    });
    return structuredClone(record);
  }

  async listProvisions(): Promise<RegulatoryProvisionRecord[]> {
    return Array.from(this.provisions.values()).map((p) => structuredClone(p)).sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveChangeRecord(record: RegulatoryChangeRecord): Promise<RegulatoryChangeRecord> {
    await this.runTransaction(async (tx) => {
      tx.putChangeRecord(record);
    });
    return structuredClone(record);
  }

  async listChangeRecordsForProvision(provisionId: string): Promise<RegulatoryChangeRecord[]> {
    return Array.from(this.changeRecords.values())
      .filter((c) => c.targetProvisionId === provisionId)
      .map((c) => structuredClone(c))
      .sort((a, b) => a.previousProvisionVersion - b.previousProvisionVersion);
  }

  async getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null> {
    const found = this.conflicts.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveConflictRecord(
    record: RegulatoryProvisionConflictRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionConflictRecord> {
    const expected = expectedPreviousVersion ?? (this.conflicts.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putConflict(record, expected);
    });
    return structuredClone(record);
  }

  async listConflictRecords(): Promise<RegulatoryProvisionConflictRecord[]> {
    return Array.from(this.conflicts.values()).map((c) => structuredClone(c)).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null> {
    const found = this.applicabilityRules.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveApplicabilityRule(
    record: RegulatoryApplicabilityRuleRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryApplicabilityRuleRecord> {
    const expected = expectedPreviousVersion ?? (this.applicabilityRules.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putApplicabilityRule(record, expected);
    });
    return structuredClone(record);
  }

  async listApplicabilityRules(): Promise<RegulatoryApplicabilityRuleRecord[]> {
    return Array.from(this.applicabilityRules.values()).map((r) => structuredClone(r)).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null> {
    const found = this.complianceRequirements.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveComplianceRequirement(
    record: ComplianceRequirementRecord,
    expectedPreviousVersion?: number,
  ): Promise<ComplianceRequirementRecord> {
    const expected = expectedPreviousVersion ?? (this.complianceRequirements.get(record.id)?.version ?? 0);
    await this.runTransaction(async (tx) => {
      tx.putComplianceRequirement(record, expected);
    });
    return structuredClone(record);
  }

  async listComplianceRequirements(): Promise<ComplianceRequirementRecord[]> {
    return Array.from(this.complianceRequirements.values()).map((r) => structuredClone(r)).sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveAiSummaryRecord(record: NonAuthoritativeAiSummaryRecord): Promise<NonAuthoritativeAiSummaryRecord> {
    await this.runTransaction(async (tx) => {
      tx.putAiSummaryRecord(record);
    });
    return structuredClone(record);
  }

  async listAiSummariesForTarget(
    targetEntityType: NonAuthoritativeAiSummaryRecord['targetEntityType'],
    targetEntityId: string,
  ): Promise<NonAuthoritativeAiSummaryRecord[]> {
    return Array.from(this.aiSummaries.values())
      .filter((a) => a.targetEntityType === targetEntityType && a.targetEntityId === targetEntityId)
      .map((a) => structuredClone(a))
      .sort((a, b) => b.generatedAtIso.localeCompare(a.generatedAtIso));
  }

  async appendAuditRecord(record: LegalRegulatoryAuditRecord): Promise<void> {
    await this.runTransaction(async (tx) => {
      tx.putAuditRecord(record);
    });
  }

  async listAuditRecords(limit = 50): Promise<LegalRegulatoryAuditRecord[]> {
    const clamped = normalizePaginationLimit(limit);
    return this.auditRecords.slice(-clamped).reverse().map((r) => structuredClone(r));
  }
}

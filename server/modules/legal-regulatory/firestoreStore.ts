import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import {
  FirestoreLegalRegulatoryTransactionRunner,
  resolveProductionAdminFirestore,
} from './firestoreTransactionRunner';
import { LegalRegulatoryStore } from './store';
import {
  assertIdempotencyRecordMatches,
  buildIdempotencyDocumentId,
  IdempotencyRecord,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryTransaction,
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

export interface FirestoreLegalRegulatoryStoreOptions {
  /**
   * Optional real Firebase Admin Firestore instance (or Firestore Emulator client in tests).
   * When omitted, resolves the canonical Firebase Admin Firestore instance fail-closed.
   */
  db?: AdminFirestore | null;
  transactionRunner?: FirestoreLegalRegulatoryTransactionRunner;
  dbProvider?: () => AdminFirestore | null | undefined;
}

/**
 * Durable fail-closed Firestore store for Legal & Regulatory Intelligence.
 * Contains ZERO in-memory fallback: any Firestore outage, misconfiguration, or
 * transaction failure throws LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', ..., 503).
 */
export class FirestoreLegalRegulatoryStore implements LegalRegulatoryStore {
  private readonly explicitDb?: AdminFirestore | null;
  private readonly explicitRunner?: FirestoreLegalRegulatoryTransactionRunner;
  private readonly dbProvider?: () => AdminFirestore | null | undefined;

  constructor(options?: FirestoreLegalRegulatoryStoreOptions) {
    this.explicitDb = options?.db;
    this.explicitRunner = options?.transactionRunner;
    this.dbProvider = options?.dbProvider;
  }

  private requireDb(): AdminFirestore {
    if (this.explicitRunner) {
      return this.explicitRunner.getFirestore();
    }
    try {
      if (this.explicitDb !== undefined) {
        if (!this.explicitDb) {
          throw new LegalRegulatoryError(
            'PERSISTENCE_UNAVAILABLE',
            'Firestore persistence client is null or unconfigured for legal-regulatory store.',
            503,
          );
        }
        return this.explicitDb;
      }
      if (this.dbProvider) {
        const provided = this.dbProvider();
        if (!provided) {
          throw new LegalRegulatoryError(
            'PERSISTENCE_UNAVAILABLE',
            'Firestore persistence provider returned no database instance for legal-regulatory store.',
            503,
          );
        }
        return provided;
      }
      return resolveProductionAdminFirestore();
    } catch (err) {
      if (err instanceof LegalRegulatoryError) throw err;
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        `Firestore initialization failed for legal-regulatory store: ${(err as Error).message}`,
        503,
      );
    }
  }

  private requireTransactionRunner(): FirestoreLegalRegulatoryTransactionRunner {
    if (this.explicitRunner) {
      return this.explicitRunner;
    }
    return new FirestoreLegalRegulatoryTransactionRunner(this.requireDb());
  }

  private async executeFirestoreOp<T>(operationLabel: string, fn: (db: AdminFirestore) => Promise<T>): Promise<T> {
    const db = this.requireDb();
    try {
      return await fn(db);
    } catch (err) {
      if (err instanceof LegalRegulatoryError) throw err;
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        `Firestore operation '${operationLabel}' failed: ${(err as Error).message}`,
        503,
      );
    }
  }

  public async runTransaction<T>(operation: (transaction: LegalRegulatoryTransaction) => Promise<T>): Promise<T> {
    const runner = this.requireTransactionRunner();
    return runner.run(operation);
  }

  async getIdempotentResult<T>(
    key: string,
    operation: string,
    actorId: string,
    requestHash?: string,
  ): Promise<T | null> {
    return this.executeFirestoreOp('getIdempotentResult', async (db) => {
      const docId = buildIdempotencyDocumentId(operation, actorId, key);
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY).doc(docId).get();
      if (!snap.exists || !snap.data()) return null;
      const record = snap.data() as unknown as IdempotencyRecord<T>;
      return assertIdempotencyRecordMatches(record, requestHash, operation, key);
    });
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
        responsePayload: payload,
        createdAtIso: new Date().toISOString(),
        schemaVersion: 1,
      });
    });
  }

  async getSourceById(id: string): Promise<RegulatorySourceRecord | null> {
    return this.executeFirestoreOp('getSourceById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.SOURCES).doc(id).get();
      return snap.exists ? (snap.data() as unknown as RegulatorySourceRecord) : null;
    });
  }

  async saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getSourceById(record.id) : null;
      tx.putSource(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listSources(): Promise<RegulatorySourceRecord[]> {
    return this.executeFirestoreOp('listSources', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.SOURCES).limit(500).get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatorySourceRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  async getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null> {
    return this.executeFirestoreOp('getDocumentById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS).doc(id).get();
      return snap.exists ? (snap.data() as unknown as RegulatoryDocumentRecord) : null;
    });
  }

  async saveDocument(
    record: RegulatoryDocumentRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryDocumentRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getDocumentById(record.id) : null;
      tx.putDocument(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listDocumentsBySource(sourceId: string): Promise<RegulatoryDocumentRecord[]> {
    return this.executeFirestoreOp('listDocumentsBySource', async (db) => {
      const snap = await db
        .collection(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS)
        .where('sourceId', '==', sourceId)
        .limit(200)
        .get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatoryDocumentRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  async getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null> {
    return this.executeFirestoreOp('getProvisionById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS).doc(id).get();
      return snap.exists ? (snap.data() as unknown as RegulatoryProvisionRecord) : null;
    });
  }

  async saveProvision(
    record: RegulatoryProvisionRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getProvisionById(record.id) : null;
      tx.putProvision(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listProvisions(): Promise<RegulatoryProvisionRecord[]> {
    return this.executeFirestoreOp('listProvisions', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS).limit(500).get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatoryProvisionRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  async saveChangeRecord(record: RegulatoryChangeRecord): Promise<RegulatoryChangeRecord> {
    await this.runTransaction(async (tx) => {
      tx.putChangeRecord(record);
    });
    return structuredClone(record);
  }

  async listChangeRecordsForProvision(provisionId: string): Promise<RegulatoryChangeRecord[]> {
    return this.executeFirestoreOp('listChangeRecordsForProvision', async (db) => {
      const snap = await db
        .collection(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY)
        .where('targetProvisionId', '==', provisionId)
        .limit(200)
        .get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatoryChangeRecord)
        .sort((a, b) => a.previousProvisionVersion - b.previousProvisionVersion);
    });
  }

  async getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null> {
    return this.executeFirestoreOp('getConflictById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS).doc(id).get();
      return snap.exists ? (snap.data() as unknown as RegulatoryProvisionConflictRecord) : null;
    });
  }

  async saveConflictRecord(
    record: RegulatoryProvisionConflictRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionConflictRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getConflictById(record.id) : null;
      tx.putConflict(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listConflictRecords(): Promise<RegulatoryProvisionConflictRecord[]> {
    return this.executeFirestoreOp('listConflictRecords', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS).limit(250).get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatoryProvisionConflictRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  async getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null> {
    return this.executeFirestoreOp('getApplicabilityRuleById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES).doc(id).get();
      return snap.exists ? (snap.data() as unknown as RegulatoryApplicabilityRuleRecord) : null;
    });
  }

  async saveApplicabilityRule(
    record: RegulatoryApplicabilityRuleRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryApplicabilityRuleRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getApplicabilityRuleById(record.id) : null;
      tx.putApplicabilityRule(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listApplicabilityRules(): Promise<RegulatoryApplicabilityRuleRecord[]> {
    return this.executeFirestoreOp('listApplicabilityRules', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES).limit(500).get();
      return snap.docs
        .map((d) => d.data() as unknown as RegulatoryApplicabilityRuleRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  async getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null> {
    return this.executeFirestoreOp('getComplianceRequirementById', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS).doc(id).get();
      return snap.exists ? (snap.data() as unknown as ComplianceRequirementRecord) : null;
    });
  }

  async saveComplianceRequirement(
    record: ComplianceRequirementRecord,
    expectedPreviousVersion?: number,
  ): Promise<ComplianceRequirementRecord> {
    await this.runTransaction(async (tx) => {
      const existing = expectedPreviousVersion === undefined ? await tx.getComplianceRequirementById(record.id) : null;
      tx.putComplianceRequirement(record, expectedPreviousVersion ?? (existing?.version ?? 0));
    });
    return structuredClone(record);
  }

  async listComplianceRequirements(): Promise<ComplianceRequirementRecord[]> {
    return this.executeFirestoreOp('listComplianceRequirements', async (db) => {
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS).limit(500).get();
      return snap.docs
        .map((d) => d.data() as unknown as ComplianceRequirementRecord)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
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
    return this.executeFirestoreOp('listAiSummariesForTarget', async (db) => {
      const snap = await db
        .collection(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES)
        .where('targetEntityType', '==', targetEntityType)
        .where('targetEntityId', '==', targetEntityId)
        .limit(100)
        .get();
      return snap.docs
        .map((d) => d.data() as unknown as NonAuthoritativeAiSummaryRecord)
        .sort((a, b) => b.generatedAtIso.localeCompare(a.generatedAtIso));
    });
  }

  async appendAuditRecord(record: LegalRegulatoryAuditRecord): Promise<void> {
    await this.runTransaction(async (tx) => {
      tx.putAuditRecord(record);
    });
  }

  async listAuditRecords(limit = 50): Promise<LegalRegulatoryAuditRecord[]> {
    return this.executeFirestoreOp('listAuditRecords', async (db) => {
      const clamped = normalizePaginationLimit(limit);
      const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG).limit(clamped).get();
      return snap.docs.map((d) => d.data() as unknown as LegalRegulatoryAuditRecord);
    });
  }
}

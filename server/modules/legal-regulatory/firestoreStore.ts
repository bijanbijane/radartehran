import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  DeterministicLegalRegulatoryStore,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryStore,
} from './store';
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

export class FirestoreLegalRegulatoryStore implements LegalRegulatoryStore {
  private readonly fallbackStore = new DeterministicLegalRegulatoryStore();

  private getDb() {
    if (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') {
      return null;
    }
    return getFirebaseAdminFirestoreForServer();
  }

  private async upsertWithVersion<T extends { id: string; version: number }>(
    collectionName: string,
    record: T,
    expectedPreviousVersion: number | undefined,
    fallbackSave: () => Promise<T>,
  ): Promise<T> {
    const db = this.getDb();
    if (!db) {
      return fallbackSave();
    }
    try {
      const docRef = db.collection(collectionName).doc(record.id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const currentVersion = snap.exists ? ((snap.data()?.version as number | undefined) ?? 0) : 0;
        if (expectedPreviousVersion !== undefined && currentVersion !== expectedPreviousVersion) {
          throw new LegalRegulatoryError(
            'CONCURRENT_MODIFICATION_CONFLICT',
            `Concurrent modification conflict in '${collectionName}' for '${record.id}': expected version ${expectedPreviousVersion}, found ${currentVersion}.`,
            409,
          );
        }
        tx.set(docRef, record);
      });
      return structuredClone(record);
    } catch (err) {
      if (err instanceof LegalRegulatoryError) throw err;
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        `Firestore transaction failed on collection '${collectionName}': ${(err as Error).message}`,
        503,
      );
    }
  }

  async getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getIdempotentResult(key, operation, actorId);
    const docId = `${operation}_${actorId}_${key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY).doc(docId).get();
    if (!snap.exists) return null;
    return (snap.data()?.responsePayload as T) ?? null;
  }

  async saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.saveIdempotentResult(key, operation, actorId, payload);
    const docId = `${operation}_${actorId}_${key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    await db.collection(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY).doc(docId).set({
      key,
      operation,
      actorId,
      responsePayload: payload,
      createdAtIso: new Date().toISOString(),
    });
  }

  async getSourceById(id: string): Promise<RegulatorySourceRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getSourceById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.SOURCES).doc(id).get();
    return snap.exists ? (snap.data() as RegulatorySourceRecord) : null;
  }

  saveSource(record: RegulatorySourceRecord, expectedPreviousVersion?: number): Promise<RegulatorySourceRecord> {
    return this.upsertWithVersion(LEGAL_REGULATORY_COLLECTIONS.SOURCES, record, expectedPreviousVersion, () =>
      this.fallbackStore.saveSource(record, expectedPreviousVersion),
    );
  }

  async listSources(): Promise<RegulatorySourceRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listSources();
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.SOURCES).limit(500).get();
    return snap.docs.map((d) => d.data() as RegulatorySourceRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getDocumentById(id: string): Promise<RegulatoryDocumentRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getDocumentById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS).doc(id).get();
    return snap.exists ? (snap.data() as RegulatoryDocumentRecord) : null;
  }

  saveDocument(
    record: RegulatoryDocumentRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryDocumentRecord> {
    return this.upsertWithVersion(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS, record, expectedPreviousVersion, () =>
      this.fallbackStore.saveDocument(record, expectedPreviousVersion),
    );
  }

  async listDocumentsBySource(sourceId: string): Promise<RegulatoryDocumentRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listDocumentsBySource(sourceId);
    const snap = await db
      .collection(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS)
      .where('sourceId', '==', sourceId)
      .limit(200)
      .get();
    return snap.docs.map((d) => d.data() as RegulatoryDocumentRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getProvisionById(id: string): Promise<RegulatoryProvisionRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getProvisionById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS).doc(id).get();
    return snap.exists ? (snap.data() as RegulatoryProvisionRecord) : null;
  }

  saveProvision(
    record: RegulatoryProvisionRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionRecord> {
    return this.upsertWithVersion(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS, record, expectedPreviousVersion, () =>
      this.fallbackStore.saveProvision(record, expectedPreviousVersion),
    );
  }

  async listProvisions(): Promise<RegulatoryProvisionRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listProvisions();
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS).limit(500).get();
    return snap.docs.map((d) => d.data() as RegulatoryProvisionRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveChangeRecord(record: RegulatoryChangeRecord): Promise<RegulatoryChangeRecord> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.saveChangeRecord(record);
    await db.collection(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY).doc(record.id).set(record);
    return structuredClone(record);
  }

  async listChangeRecordsForProvision(provisionId: string): Promise<RegulatoryChangeRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listChangeRecordsForProvision(provisionId);
    const snap = await db
      .collection(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY)
      .where('targetProvisionId', '==', provisionId)
      .limit(200)
      .get();
    return snap.docs
      .map((d) => d.data() as RegulatoryChangeRecord)
      .sort((a, b) => a.previousProvisionVersion - b.previousProvisionVersion);
  }

  async getConflictById(id: string): Promise<RegulatoryProvisionConflictRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getConflictById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS).doc(id).get();
    return snap.exists ? (snap.data() as RegulatoryProvisionConflictRecord) : null;
  }

  saveConflictRecord(
    record: RegulatoryProvisionConflictRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryProvisionConflictRecord> {
    return this.upsertWithVersion(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS, record, expectedPreviousVersion, () =>
      this.fallbackStore.saveConflictRecord(record, expectedPreviousVersion),
    );
  }

  async listConflictRecords(): Promise<RegulatoryProvisionConflictRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listConflictRecords();
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS).limit(250).get();
    return snap.docs
      .map((d) => d.data() as RegulatoryProvisionConflictRecord)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getApplicabilityRuleById(id: string): Promise<RegulatoryApplicabilityRuleRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getApplicabilityRuleById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES).doc(id).get();
    return snap.exists ? (snap.data() as RegulatoryApplicabilityRuleRecord) : null;
  }

  saveApplicabilityRule(
    record: RegulatoryApplicabilityRuleRecord,
    expectedPreviousVersion?: number,
  ): Promise<RegulatoryApplicabilityRuleRecord> {
    return this.upsertWithVersion(
      LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES,
      record,
      expectedPreviousVersion,
      () => this.fallbackStore.saveApplicabilityRule(record, expectedPreviousVersion),
    );
  }

  async listApplicabilityRules(): Promise<RegulatoryApplicabilityRuleRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listApplicabilityRules();
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES).limit(500).get();
    return snap.docs
      .map((d) => d.data() as RegulatoryApplicabilityRuleRecord)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.getComplianceRequirementById(id);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS).doc(id).get();
    return snap.exists ? (snap.data() as ComplianceRequirementRecord) : null;
  }

  saveComplianceRequirement(
    record: ComplianceRequirementRecord,
    expectedPreviousVersion?: number,
  ): Promise<ComplianceRequirementRecord> {
    return this.upsertWithVersion(
      LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS,
      record,
      expectedPreviousVersion,
      () => this.fallbackStore.saveComplianceRequirement(record, expectedPreviousVersion),
    );
  }

  async listComplianceRequirements(): Promise<ComplianceRequirementRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listComplianceRequirements();
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS).limit(500).get();
    return snap.docs
      .map((d) => d.data() as ComplianceRequirementRecord)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveAiSummaryRecord(record: NonAuthoritativeAiSummaryRecord): Promise<NonAuthoritativeAiSummaryRecord> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.saveAiSummaryRecord(record);
    await db.collection(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES).doc(record.id).set(record);
    return structuredClone(record);
  }

  async listAiSummariesForTarget(
    targetEntityType: NonAuthoritativeAiSummaryRecord['targetEntityType'],
    targetEntityId: string,
  ): Promise<NonAuthoritativeAiSummaryRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listAiSummariesForTarget(targetEntityType, targetEntityId);
    const snap = await db
      .collection(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES)
      .where('targetEntityType', '==', targetEntityType)
      .where('targetEntityId', '==', targetEntityId)
      .limit(100)
      .get();
    return snap.docs
      .map((d) => d.data() as NonAuthoritativeAiSummaryRecord)
      .sort((a, b) => b.generatedAtIso.localeCompare(a.generatedAtIso));
  }

  async appendAuditRecord(record: LegalRegulatoryAuditRecord): Promise<void> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.appendAuditRecord(record);
    await db.collection(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG).doc(record.id).set(record);
  }

  async listAuditRecords(limit = 50): Promise<LegalRegulatoryAuditRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallbackStore.listAuditRecords(limit);
    const clamped = normalizePaginationLimit(limit);
    const snap = await db.collection(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG).limit(clamped).get();
    return snap.docs.map((d) => d.data() as LegalRegulatoryAuditRecord);
  }
}

import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  buildIdempotencyDocumentId,
  IdempotencyRecord,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryTransaction,
  sanitizeForFirestore,
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
import { LegalRegulatoryError } from './validationAndAuthz';

interface StagedFirestoreWrite {
  collectionName: string;
  docId: string;
  data: Record<string, unknown>;
  expectedPreviousVersion?: number;
}

/**
 * Resolves the canonical Firebase Admin Firestore instance fail-closed.
 * Throws LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', ..., 503) if unavailable
 * or blocked in test isolation mode. Zero in-memory fallback.
 */
export function resolveProductionAdminFirestore(): AdminFirestore {
  try {
    if (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        'Firestore persistence is disabled in test environment (PREVENT_PROD_FIREBASE_IN_TEST=true).',
        503,
      );
    }
    const db = getFirebaseAdminFirestoreForServer();
    if (!db) {
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        'Firebase Admin Firestore instance is unavailable for legal-regulatory store.',
        503,
      );
    }
    return db;
  } catch (err) {
    if (err instanceof LegalRegulatoryError) throw err;
    throw new LegalRegulatoryError(
      'PERSISTENCE_UNAVAILABLE',
      `Firestore initialization failed for legal-regulatory store: ${(err as Error).message}`,
      503,
    );
  }
}

/**
 * Native Firestore Transaction Runner for Legal & Regulatory Intelligence.
 * Guarantees Read-before-Write ordering, optimistic concurrency control (CAS),
 * multi-document atomicity, and fail-closed 503 mapping on infrastructure errors.
 */
export class FirestoreLegalRegulatoryTransactionRunner {
  constructor(private readonly db: AdminFirestore) {
    if (!db) {
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        'FirestoreLegalRegulatoryTransactionRunner requires a valid Firebase Admin Firestore instance.',
        503,
      );
    }
  }

  public getFirestore(): AdminFirestore {
    return this.db;
  }

  public async run<T>(operation: (tx: LegalRegulatoryTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.runTransaction(async (firestoreTx) => {
        const readVersions = new Map<string, number>();
        const stagedWrites: StagedFirestoreWrite[] = [];
        let flushingWrites = false;

        const readDoc = async <R>(collectionName: string, docId: string): Promise<R | null> => {
          if (flushingWrites) {
            throw new LegalRegulatoryError(
              'PERSISTENCE_UNAVAILABLE',
              'Transaction protocol violation: attempted read after write flush phase began.',
              503,
            );
          }
          const docRef = this.db.collection(collectionName).doc(docId);
          const snap = await firestoreTx.get(docRef);
          const key = `${collectionName}/${docId}`;
          const data = snap.exists ? (snap.data() as Record<string, unknown> | undefined) : undefined;
          const version = data && typeof data.version === 'number' ? data.version : 0;
          readVersions.set(key, snap.exists ? version : 0);
          return snap.exists && data ? (structuredClone(data) as R) : null;
        };

        const stageWrite = (
          collectionName: string,
          docId: string,
          record: unknown,
          expectedPreviousVersion?: number,
        ): void => {
          stagedWrites.push({
            collectionName,
            docId,
            data: sanitizeForFirestore(structuredClone(record) as Record<string, unknown>),
            expectedPreviousVersion,
          });
        };

        const txContext: LegalRegulatoryTransaction = {
          getSourceById: (id) => readDoc<RegulatorySourceRecord>(LEGAL_REGULATORY_COLLECTIONS.SOURCES, id),
          getDocumentById: (id) => readDoc<RegulatoryDocumentRecord>(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS, id),
          getProvisionById: (id) => readDoc<RegulatoryProvisionRecord>(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS, id),
          getConflictById: (id) =>
            readDoc<RegulatoryProvisionConflictRecord>(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS, id),
          getApplicabilityRuleById: (id) =>
            readDoc<RegulatoryApplicabilityRuleRecord>(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES, id),
          getComplianceRequirementById: (id) =>
            readDoc<ComplianceRequirementRecord>(LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS, id),
          getIdempotencyRecord: <R>(key: string, op: string, actorId: string) => {
            const docId = buildIdempotencyDocumentId(op, actorId, key);
            return readDoc<IdempotencyRecord<R>>(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY, docId);
          },

          putSource: (record, expectedPreviousVersion) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.SOURCES, record.id, record, expectedPreviousVersion),
          putDocument: (record, expectedPreviousVersion) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.DOCUMENTS, record.id, record, expectedPreviousVersion),
          putProvision: (record, expectedPreviousVersion) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS, record.id, record, expectedPreviousVersion),
          putChangeRecord: (record) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.CHANGE_HISTORY, record.id, record),
          putConflict: (record, expectedPreviousVersion) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.CONFLICTS, record.id, record, expectedPreviousVersion),
          putApplicabilityRule: (record, expectedPreviousVersion) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.APPLICABILITY_RULES, record.id, record, expectedPreviousVersion),
          putComplianceRequirement: (record, expectedPreviousVersion) =>
            stageWrite(
              LEGAL_REGULATORY_COLLECTIONS.COMPLIANCE_REQUIREMENTS,
              record.id,
              record,
              expectedPreviousVersion,
            ),
          putAiSummaryRecord: (record) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.AI_SUMMARIES, record.id, record),
          putAuditRecord: (record) =>
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG, record.id, record),
          putIdempotencyRecord: <R>(record: IdempotencyRecord<R>) => {
            const docId = buildIdempotencyDocumentId(record.operation, record.actorId, record.key);
            stageWrite(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY, docId, { ...record, schemaVersion: 1 });
          },
        };

        const result = await operation(txContext);

        // Complete all remaining CAS version reads strictly before issuing any write.
        for (const write of stagedWrites) {
          if (write.expectedPreviousVersion === undefined) continue;
          const key = `${write.collectionName}/${write.docId}`;
          if (!readVersions.has(key)) {
            await readDoc(write.collectionName, write.docId);
          }
          const currentVersion = readVersions.get(key) ?? 0;
          if (currentVersion !== write.expectedPreviousVersion) {
            throw new LegalRegulatoryError(
              'CONCURRENT_MODIFICATION_CONFLICT',
              `Concurrent modification conflict in '${write.collectionName}' for '${write.docId}': expected version ${write.expectedPreviousVersion}, found ${currentVersion}.`,
              409,
              {
                collectionName: write.collectionName,
                id: write.docId,
                expectedPreviousVersion: write.expectedPreviousVersion,
                actualVersion: currentVersion,
              },
            );
          }
        }

        // Flush all staged writes atomically after all reads and CAS assertions succeeded.
        flushingWrites = true;
        for (const write of stagedWrites) {
          const docRef = this.db.collection(write.collectionName).doc(write.docId);
          firestoreTx.set(docRef, write.data);
        }

        return result;
      });
    } catch (err) {
      if (err instanceof LegalRegulatoryError) throw err;
      throw new LegalRegulatoryError(
        'PERSISTENCE_UNAVAILABLE',
        `Firestore transaction failed: ${(err as Error).message}`,
        503,
      );
    }
  }
}

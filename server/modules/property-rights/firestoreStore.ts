import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { clampPaginationLimit, PropertyRightsError } from './sharesAndValidation';
import {
  DeterministicPropertyRightsStore,
  PROPERTY_RIGHTS_COLLECTIONS,
  PropertyRightsStore,
} from './store';
import {
  OwnershipDisputeRecord,
  OwnershipEvidenceRecord,
  OwnershipInterestRecord,
  PropertyEncumbranceRecord,
  PropertyRightRecord,
  PropertyRightsHistoryEventRecord,
  TenureInterestRecord,
} from './types';

export class FirestorePropertyRightsStore implements PropertyRightsStore {
  private readonly fallback = new DeterministicPropertyRightsStore();

  private getDb() {
    if (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') {
      return null;
    }
    return getFirebaseAdminFirestoreForServer();
  }

  private async upsertVersioned<T extends { id: string; version: number }>(
    collectionName: string,
    record: T,
    expectedPreviousVersion: number | undefined,
    fallbackFn: () => Promise<T>,
  ): Promise<T> {
    const db = this.getDb();
    if (!db) return fallbackFn();
    try {
      const ref = db.collection(collectionName).doc(record.id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const currentVersion = snap.exists ? ((snap.data()?.version as number | undefined) ?? 0) : 0;
        if (expectedPreviousVersion !== undefined && currentVersion !== expectedPreviousVersion) {
          throw new PropertyRightsError(
            'CONCURRENT_MODIFICATION_CONFLICT',
            `Concurrent modification conflict in '${collectionName}' for '${record.id}': expected v${expectedPreviousVersion}, found v${currentVersion}.`,
            409,
          );
        }
        tx.set(ref, record);
      });
      return structuredClone(record);
    } catch (err) {
      if (err instanceof PropertyRightsError) throw err;
      throw new PropertyRightsError(
        'PERSISTENCE_UNAVAILABLE',
        `Firestore transaction failed on '${collectionName}': ${(err as Error).message}`,
        503,
      );
    }
  }

  async getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getIdempotentResult(key, operation, actorId);
    const docId = `${operation}_${actorId}_${key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.IDEMPOTENCY).doc(docId).get();
    return snap.exists ? ((snap.data()?.responsePayload as T) ?? null) : null;
  }

  async saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void> {
    const db = this.getDb();
    if (!db) return this.fallback.saveIdempotentResult(key, operation, actorId, payload);
    const docId = `${operation}_${actorId}_${key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    await db.collection(PROPERTY_RIGHTS_COLLECTIONS.IDEMPOTENCY).doc(docId).set({
      key,
      operation,
      actorId,
      responsePayload: payload,
      createdAtIso: new Date().toISOString(),
    });
  }

  async getOwnershipInterestById(id: string): Promise<OwnershipInterestRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getOwnershipInterestById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.OWNERSHIP_INTERESTS).doc(id).get();
    return snap.exists ? (snap.data() as OwnershipInterestRecord) : null;
  }

  saveOwnershipInterest(
    record: OwnershipInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipInterestRecord> {
    return this.upsertVersioned(
      PROPERTY_RIGHTS_COLLECTIONS.OWNERSHIP_INTERESTS,
      record,
      expectedPreviousVersion,
      () => this.fallback.saveOwnershipInterest(record, expectedPreviousVersion),
    );
  }

  async listOwnershipInterestsByProperty(propertyId: string): Promise<OwnershipInterestRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listOwnershipInterestsByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.OWNERSHIP_INTERESTS)
      .where('propertyRef.propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as OwnershipInterestRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async listOwnershipInterestsByParty(partyId: string): Promise<OwnershipInterestRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listOwnershipInterestsByParty(partyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.OWNERSHIP_INTERESTS)
      .where('partyRef.partyId', '==', partyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as OwnershipInterestRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getPropertyRightById(id: string): Promise<PropertyRightRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getPropertyRightById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.NON_OWNERSHIP_RIGHTS).doc(id).get();
    return snap.exists ? (snap.data() as PropertyRightRecord) : null;
  }

  savePropertyRight(record: PropertyRightRecord, expectedPreviousVersion?: number): Promise<PropertyRightRecord> {
    return this.upsertVersioned(
      PROPERTY_RIGHTS_COLLECTIONS.NON_OWNERSHIP_RIGHTS,
      record,
      expectedPreviousVersion,
      () => this.fallback.savePropertyRight(record, expectedPreviousVersion),
    );
  }

  async listPropertyRightsByProperty(propertyId: string): Promise<PropertyRightRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listPropertyRightsByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.NON_OWNERSHIP_RIGHTS)
      .where('propertyRef.propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as PropertyRightRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getTenureInterestById(id: string): Promise<TenureInterestRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getTenureInterestById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.TENURE_INTERESTS).doc(id).get();
    return snap.exists ? (snap.data() as TenureInterestRecord) : null;
  }

  saveTenureInterest(
    record: TenureInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<TenureInterestRecord> {
    return this.upsertVersioned(
      PROPERTY_RIGHTS_COLLECTIONS.TENURE_INTERESTS,
      record,
      expectedPreviousVersion,
      () => this.fallback.saveTenureInterest(record, expectedPreviousVersion),
    );
  }

  async listTenureInterestsByProperty(propertyId: string): Promise<TenureInterestRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listTenureInterestsByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.TENURE_INTERESTS)
      .where('propertyRef.propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as TenureInterestRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getEncumbranceById(id: string): Promise<PropertyEncumbranceRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getEncumbranceById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.ENCUMBRANCES).doc(id).get();
    return snap.exists ? (snap.data() as PropertyEncumbranceRecord) : null;
  }

  saveEncumbrance(
    record: PropertyEncumbranceRecord,
    expectedPreviousVersion?: number,
  ): Promise<PropertyEncumbranceRecord> {
    return this.upsertVersioned(
      PROPERTY_RIGHTS_COLLECTIONS.ENCUMBRANCES,
      record,
      expectedPreviousVersion,
      () => this.fallback.saveEncumbrance(record, expectedPreviousVersion),
    );
  }

  async listEncumbrancesByProperty(propertyId: string): Promise<PropertyEncumbranceRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listEncumbrancesByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.ENCUMBRANCES)
      .where('propertyRef.propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as PropertyEncumbranceRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async getEvidenceById(id: string): Promise<OwnershipEvidenceRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getEvidenceById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.EVIDENCE_RECORDS).doc(id).get();
    return snap.exists ? (snap.data() as OwnershipEvidenceRecord) : null;
  }

  async findEvidenceBySourceAndReference(
    propertyId: string,
    issuingSourceAuthority: string,
    documentReferenceNumber: string,
  ): Promise<OwnershipEvidenceRecord | null> {
    const db = this.getDb();
    if (!db) {
      return this.fallback.findEvidenceBySourceAndReference(
        propertyId,
        issuingSourceAuthority,
        documentReferenceNumber,
      );
    }
    const allForProp = await this.listEvidenceByProperty(propertyId);
    const normSrc = issuingSourceAuthority.trim().toLowerCase();
    const normRef = documentReferenceNumber.trim().toLowerCase();
    return (
      allForProp.find(
        (e) =>
          e.issuingSourceAuthority.trim().toLowerCase() === normSrc &&
          e.documentReferenceNumber.trim().toLowerCase() === normRef,
      ) ?? null
    );
  }

  saveEvidence(
    record: OwnershipEvidenceRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipEvidenceRecord> {
    return this.upsertVersioned(
      PROPERTY_RIGHTS_COLLECTIONS.EVIDENCE_RECORDS,
      record,
      expectedPreviousVersion,
      () => this.fallback.saveEvidence(record, expectedPreviousVersion),
    );
  }

  async listEvidenceByProperty(propertyId: string): Promise<OwnershipEvidenceRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listEvidenceByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.EVIDENCE_RECORDS)
      .where('propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as OwnershipEvidenceRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  async appendHistoryEvent(
    event: PropertyRightsHistoryEventRecord,
  ): Promise<PropertyRightsHistoryEventRecord> {
    const db = this.getDb();
    if (!db) return this.fallback.appendHistoryEvent(event);
    await db.collection(PROPERTY_RIGHTS_COLLECTIONS.HISTORY_EVENTS).doc(event.id).set(event);
    return structuredClone(event);
  }

  async listHistoryEventsByProperty(
    propertyId: string,
    limit?: number,
  ): Promise<PropertyRightsHistoryEventRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listHistoryEventsByProperty(propertyId, limit);
    const clamped = clampPaginationLimit(limit ?? 100);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.HISTORY_EVENTS)
      .where('propertyId', '==', propertyId)
      .limit(clamped)
      .get();
    return snap.docs.map((d) => d.data() as PropertyRightsHistoryEventRecord);
  }

  async getDisputeById(id: string): Promise<OwnershipDisputeRecord | null> {
    const db = this.getDb();
    if (!db) return this.fallback.getDisputeById(id);
    const snap = await db.collection(PROPERTY_RIGHTS_COLLECTIONS.DISPUTES).doc(id).get();
    return snap.exists ? (snap.data() as OwnershipDisputeRecord) : null;
  }

  saveDispute(
    record: OwnershipDisputeRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipDisputeRecord> {
    return this.upsertVersioned(PROPERTY_RIGHTS_COLLECTIONS.DISPUTES, record, expectedPreviousVersion, () =>
      this.fallback.saveDispute(record, expectedPreviousVersion),
    );
  }

  async listDisputesByProperty(propertyId: string): Promise<OwnershipDisputeRecord[]> {
    const db = this.getDb();
    if (!db) return this.fallback.listDisputesByProperty(propertyId);
    const snap = await db
      .collection(PROPERTY_RIGHTS_COLLECTIONS.DISPUTES)
      .where('propertyId', '==', propertyId)
      .limit(250)
      .get();
    return snap.docs.map((d) => d.data() as OwnershipDisputeRecord).sort((a, b) => a.id.localeCompare(b.id));
  }
}

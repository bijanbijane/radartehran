import { clampPaginationLimit, PropertyRightsError } from './sharesAndValidation';
import {
  OwnershipDisputeRecord,
  OwnershipEvidenceRecord,
  OwnershipInterestRecord,
  PropertyEncumbranceRecord,
  PropertyRightRecord,
  PropertyRightsHistoryEventRecord,
  TenureInterestRecord,
} from './types';

export const PROPERTY_RIGHTS_COLLECTIONS = {
  OWNERSHIP_INTERESTS: 'property_ownership_interests_v1',
  NON_OWNERSHIP_RIGHTS: 'property_non_ownership_rights_v1',
  TENURE_INTERESTS: 'property_tenure_interests_v1',
  ENCUMBRANCES: 'property_encumbrances_v1',
  EVIDENCE_RECORDS: 'property_rights_evidence_v1',
  HISTORY_EVENTS: 'property_rights_history_v1',
  DISPUTES: 'property_rights_disputes_v1',
  IDEMPOTENCY: 'property_rights_idempotency_v1',
} as const;

export interface PropertyRightsStore {
  getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null>;
  saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void>;

  getOwnershipInterestById(id: string): Promise<OwnershipInterestRecord | null>;
  saveOwnershipInterest(
    record: OwnershipInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipInterestRecord>;
  listOwnershipInterestsByProperty(propertyId: string): Promise<OwnershipInterestRecord[]>;
  listOwnershipInterestsByParty(partyId: string): Promise<OwnershipInterestRecord[]>;

  getPropertyRightById(id: string): Promise<PropertyRightRecord | null>;
  savePropertyRight(
    record: PropertyRightRecord,
    expectedPreviousVersion?: number,
  ): Promise<PropertyRightRecord>;
  listPropertyRightsByProperty(propertyId: string): Promise<PropertyRightRecord[]>;

  getTenureInterestById(id: string): Promise<TenureInterestRecord | null>;
  saveTenureInterest(
    record: TenureInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<TenureInterestRecord>;
  listTenureInterestsByProperty(propertyId: string): Promise<TenureInterestRecord[]>;

  getEncumbranceById(id: string): Promise<PropertyEncumbranceRecord | null>;
  saveEncumbrance(
    record: PropertyEncumbranceRecord,
    expectedPreviousVersion?: number,
  ): Promise<PropertyEncumbranceRecord>;
  listEncumbrancesByProperty(propertyId: string): Promise<PropertyEncumbranceRecord[]>;

  getEvidenceById(id: string): Promise<OwnershipEvidenceRecord | null>;
  findEvidenceBySourceAndReference(
    propertyId: string,
    issuingSourceAuthority: string,
    documentReferenceNumber: string,
  ): Promise<OwnershipEvidenceRecord | null>;
  saveEvidence(
    record: OwnershipEvidenceRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipEvidenceRecord>;
  listEvidenceByProperty(propertyId: string): Promise<OwnershipEvidenceRecord[]>;

  appendHistoryEvent(event: PropertyRightsHistoryEventRecord): Promise<PropertyRightsHistoryEventRecord>;
  listHistoryEventsByProperty(propertyId: string, limit?: number): Promise<PropertyRightsHistoryEventRecord[]>;

  getDisputeById(id: string): Promise<OwnershipDisputeRecord | null>;
  saveDispute(
    record: OwnershipDisputeRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipDisputeRecord>;
  listDisputesByProperty(propertyId: string): Promise<OwnershipDisputeRecord[]>;
}

export class DeterministicPropertyRightsStore implements PropertyRightsStore {
  private readonly interests = new Map<string, OwnershipInterestRecord>();
  private readonly rights = new Map<string, PropertyRightRecord>();
  private readonly tenures = new Map<string, TenureInterestRecord>();
  private readonly encumbrances = new Map<string, PropertyEncumbranceRecord>();
  private readonly evidence = new Map<string, OwnershipEvidenceRecord>();
  private readonly historyEvents: PropertyRightsHistoryEventRecord[] = [];
  private readonly disputes = new Map<string, OwnershipDisputeRecord>();
  private readonly idempotency = new Map<string, unknown>();
  private failNextWritesCount = 0;

  public simulateNextWriteFailure(count = 1): void {
    this.failNextWritesCount = Math.max(0, count);
  }

  private checkFailure(): void {
    if (this.failNextWritesCount > 0) {
      this.failNextWritesCount -= 1;
      throw new PropertyRightsError(
        'PERSISTENCE_UNAVAILABLE',
        'Simulated persistence write failure in DeterministicPropertyRightsStore.',
        503,
      );
    }
  }

  private saveVersioned<T extends { id: string; version: number }>(
    map: Map<string, T>,
    entityName: string,
    record: T,
    expectedPreviousVersion?: number,
  ): Promise<T> {
    this.checkFailure();
    const existing = map.get(record.id);
    if (expectedPreviousVersion !== undefined) {
      const actual = existing?.version ?? 0;
      if (actual !== expectedPreviousVersion) {
        throw new PropertyRightsError(
          'CONCURRENT_MODIFICATION_CONFLICT',
          `Concurrent modification conflict on ${entityName} '${record.id}': expected v${expectedPreviousVersion}, found v${actual}.`,
          409,
          { entityName, id: record.id, expectedPreviousVersion, actualVersion: actual },
        );
      }
    }
    const cloned = structuredClone(record);
    map.set(record.id, cloned);
    return Promise.resolve(structuredClone(cloned));
  }

  async getIdempotentResult<T>(key: string, operation: string, actorId: string): Promise<T | null> {
    const val = this.idempotency.get(`${operation}::${actorId}::${key}`);
    return val ? (structuredClone(val) as T) : null;
  }

  async saveIdempotentResult<T>(key: string, operation: string, actorId: string, payload: T): Promise<void> {
    this.checkFailure();
    this.idempotency.set(`${operation}::${actorId}::${key}`, structuredClone(payload));
  }

  async getOwnershipInterestById(id: string): Promise<OwnershipInterestRecord | null> {
    const found = this.interests.get(id);
    return found ? structuredClone(found) : null;
  }

  saveOwnershipInterest(
    record: OwnershipInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipInterestRecord> {
    return this.saveVersioned(this.interests, 'OwnershipInterest', record, expectedPreviousVersion);
  }

  async listOwnershipInterestsByProperty(propertyId: string): Promise<OwnershipInterestRecord[]> {
    return Array.from(this.interests.values())
      .filter((i) => i.propertyRef.propertyId === propertyId)
      .map((i) => structuredClone(i))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async listOwnershipInterestsByParty(partyId: string): Promise<OwnershipInterestRecord[]> {
    return Array.from(this.interests.values())
      .filter((i) => i.partyRef.partyId === partyId)
      .map((i) => structuredClone(i))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getPropertyRightById(id: string): Promise<PropertyRightRecord | null> {
    const found = this.rights.get(id);
    return found ? structuredClone(found) : null;
  }

  savePropertyRight(record: PropertyRightRecord, expectedPreviousVersion?: number): Promise<PropertyRightRecord> {
    return this.saveVersioned(this.rights, 'PropertyRight', record, expectedPreviousVersion);
  }

  async listPropertyRightsByProperty(propertyId: string): Promise<PropertyRightRecord[]> {
    return Array.from(this.rights.values())
      .filter((r) => r.propertyRef.propertyId === propertyId)
      .map((r) => structuredClone(r))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getTenureInterestById(id: string): Promise<TenureInterestRecord | null> {
    const found = this.tenures.get(id);
    return found ? structuredClone(found) : null;
  }

  saveTenureInterest(
    record: TenureInterestRecord,
    expectedPreviousVersion?: number,
  ): Promise<TenureInterestRecord> {
    return this.saveVersioned(this.tenures, 'TenureInterest', record, expectedPreviousVersion);
  }

  async listTenureInterestsByProperty(propertyId: string): Promise<TenureInterestRecord[]> {
    return Array.from(this.tenures.values())
      .filter((t) => t.propertyRef.propertyId === propertyId)
      .map((t) => structuredClone(t))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getEncumbranceById(id: string): Promise<PropertyEncumbranceRecord | null> {
    const found = this.encumbrances.get(id);
    return found ? structuredClone(found) : null;
  }

  saveEncumbrance(
    record: PropertyEncumbranceRecord,
    expectedPreviousVersion?: number,
  ): Promise<PropertyEncumbranceRecord> {
    return this.saveVersioned(this.encumbrances, 'PropertyEncumbrance', record, expectedPreviousVersion);
  }

  async listEncumbrancesByProperty(propertyId: string): Promise<PropertyEncumbranceRecord[]> {
    return Array.from(this.encumbrances.values())
      .filter((e) => e.propertyRef.propertyId === propertyId)
      .map((e) => structuredClone(e))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getEvidenceById(id: string): Promise<OwnershipEvidenceRecord | null> {
    const found = this.evidence.get(id);
    return found ? structuredClone(found) : null;
  }

  async findEvidenceBySourceAndReference(
    propertyId: string,
    issuingSourceAuthority: string,
    documentReferenceNumber: string,
  ): Promise<OwnershipEvidenceRecord | null> {
    const normSource = issuingSourceAuthority.trim().toLowerCase();
    const normRef = documentReferenceNumber.trim().toLowerCase();
    for (const ev of this.evidence.values()) {
      if (
        ev.propertyId === propertyId &&
        ev.issuingSourceAuthority.trim().toLowerCase() === normSource &&
        ev.documentReferenceNumber.trim().toLowerCase() === normRef
      ) {
        return structuredClone(ev);
      }
    }
    return null;
  }

  saveEvidence(
    record: OwnershipEvidenceRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipEvidenceRecord> {
    return this.saveVersioned(this.evidence, 'OwnershipEvidence', record, expectedPreviousVersion);
  }

  async listEvidenceByProperty(propertyId: string): Promise<OwnershipEvidenceRecord[]> {
    return Array.from(this.evidence.values())
      .filter((e) => e.propertyId === propertyId)
      .map((e) => structuredClone(e))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async appendHistoryEvent(
    event: PropertyRightsHistoryEventRecord,
  ): Promise<PropertyRightsHistoryEventRecord> {
    this.checkFailure();
    const cloned = structuredClone(event);
    this.historyEvents.push(cloned);
    return structuredClone(cloned);
  }

  async listHistoryEventsByProperty(
    propertyId: string,
    limit?: number,
  ): Promise<PropertyRightsHistoryEventRecord[]> {
    const clamped = clampPaginationLimit(limit ?? 100);
    return this.historyEvents
      .filter((h) => h.propertyId === propertyId)
      .slice(-clamped)
      .map((h) => structuredClone(h));
  }

  async getDisputeById(id: string): Promise<OwnershipDisputeRecord | null> {
    const found = this.disputes.get(id);
    return found ? structuredClone(found) : null;
  }

  saveDispute(
    record: OwnershipDisputeRecord,
    expectedPreviousVersion?: number,
  ): Promise<OwnershipDisputeRecord> {
    return this.saveVersioned(this.disputes, 'OwnershipDispute', record, expectedPreviousVersion);
  }

  async listDisputesByProperty(propertyId: string): Promise<OwnershipDisputeRecord[]> {
    return Array.from(this.disputes.values())
      .filter((d) => d.propertyId === propertyId)
      .map((d) => structuredClone(d))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

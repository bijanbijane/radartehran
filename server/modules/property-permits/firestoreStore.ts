import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  IssuingAuthorityRecord,
  PermitAmendmentOrRenewalRecord,
  PermitApplicationRecord,
  PermitAuditEvent,
  PermitCategoryCode,
  PermitConditionRecord,
  PermitDeadlineRecord,
  PermitFeeRecord,
  PermitIdempotencyRecord,
  PermitInspectionRecord,
  PermitRecord,
} from './types';
import { ACTIVE_APPLICATION_WORKFLOW_STATES, PropertyPermitsStore } from './store';

export const PERMITS_FIRESTORE_COLLECTIONS = {
  authorities: 'permit_issuing_authorities',
  applications: 'permit_applications',
  permits: 'permit_records',
  conditions: 'permit_conditions',
  amendmentsAndRenewals: 'permit_amendments_renewals',
  inspections: 'permit_inspections',
  fees: 'permit_fees',
  deadlines: 'permit_deadlines',
  auditEvents: 'permit_audit_events',
  idempotencyKeys: 'permit_idempotency_keys',
} as const;

export class FirestorePropertyPermitsStore implements PropertyPermitsStore {
  private get db() {
    const firestore = getFirebaseAdminFirestoreForServer();
    if (!firestore) {
      throw new Error('Firebase Admin Firestore is not initialized for PropertyPermitsStore');
    }
    return firestore;
  }

  async saveAuthority(authority: IssuingAuthorityRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.authorities)
      .doc(authority.id)
      .set(authority);
  }

  async getAuthorityById(id: string): Promise<IssuingAuthorityRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.authorities)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as IssuingAuthorityRecord) : null;
  }

  async listAuthoritiesByCity(citySlug: string): Promise<IssuingAuthorityRecord[]> {
    const normalized = citySlug.trim().toLowerCase();
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.authorities)
      .where('jurisdictionScope.citySlug', '==', normalized)
      .limit(100)
      .get();
    return snap.docs.map((d) => d.data() as IssuingAuthorityRecord);
  }

  async saveApplication(application: PermitApplicationRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.applications)
      .doc(application.id)
      .set(application);
  }

  async getApplicationById(id: string): Promise<PermitApplicationRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.applications)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitApplicationRecord) : null;
  }

  async listApplicationsByProperty(propertyId: string, limit = 50): Promise<PermitApplicationRecord[]> {
    const bounded = Math.min(Math.max(1, limit), 100);
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.applications)
      .where('subjectRef.propertyId', '==', propertyId)
      .limit(bounded)
      .get();
    return snap.docs
      .map((d) => d.data() as PermitApplicationRecord)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findActiveSubmittedApplications(
    propertyId: string,
    permitCategory: PermitCategoryCode,
    issuingAuthorityId: string
  ): Promise<PermitApplicationRecord[]> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.applications)
      .where('subjectRef.propertyId', '==', propertyId)
      .where('permitCategory', '==', permitCategory)
      .where('issuingAuthorityId', '==', issuingAuthorityId)
      .limit(50)
      .get();
    return snap.docs
      .map((d) => d.data() as PermitApplicationRecord)
      .filter((app) => ACTIVE_APPLICATION_WORKFLOW_STATES.has(app.workflowStatus));
  }

  async savePermit(permit: PermitRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.permits)
      .doc(permit.id)
      .set(permit);
  }

  async getPermitById(id: string): Promise<PermitRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.permits)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitRecord) : null;
  }

  async listPermitsByProperty(propertyId: string, limit = 50): Promise<PermitRecord[]> {
    const bounded = Math.min(Math.max(1, limit), 100);
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.permits)
      .where('subjectRef.propertyId', '==', propertyId)
      .limit(bounded)
      .get();
    return snap.docs
      .map((d) => d.data() as PermitRecord)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveCondition(condition: PermitConditionRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.conditions)
      .doc(condition.id)
      .set(condition);
  }

  async getConditionById(id: string): Promise<PermitConditionRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.conditions)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitConditionRecord) : null;
  }

  async listConditionsByPermit(permitId: string): Promise<PermitConditionRecord[]> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.conditions)
      .where('permitId', '==', permitId)
      .limit(100)
      .get();
    return snap.docs.map((d) => d.data() as PermitConditionRecord);
  }

  async saveAmendmentOrRenewal(record: PermitAmendmentOrRenewalRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.amendmentsAndRenewals)
      .doc(record.id)
      .set(record);
  }

  async getAmendmentOrRenewalById(id: string): Promise<PermitAmendmentOrRenewalRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.amendmentsAndRenewals)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitAmendmentOrRenewalRecord) : null;
  }

  async listAmendmentsOrRenewalsByPermit(permitId: string): Promise<PermitAmendmentOrRenewalRecord[]> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.amendmentsAndRenewals)
      .where('targetPermitId', '==', permitId)
      .limit(100)
      .get();
    return snap.docs.map((d) => d.data() as PermitAmendmentOrRenewalRecord);
  }

  async saveInspection(inspection: PermitInspectionRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.inspections)
      .doc(inspection.id)
      .set(inspection);
  }

  async getInspectionById(id: string): Promise<PermitInspectionRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.inspections)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitInspectionRecord) : null;
  }

  async listInspectionsBySubject(targetId: string): Promise<PermitInspectionRecord[]> {
    const [byPermit, byApp] = await Promise.all([
      this.db
        .collection(PERMITS_FIRESTORE_COLLECTIONS.inspections)
        .where('permitId', '==', targetId)
        .limit(50)
        .get(),
      this.db
        .collection(PERMITS_FIRESTORE_COLLECTIONS.inspections)
        .where('applicationId', '==', targetId)
        .limit(50)
        .get(),
    ]);
    const map = new Map<string, PermitInspectionRecord>();
    for (const doc of byPermit.docs) map.set(doc.id, doc.data() as PermitInspectionRecord);
    for (const doc of byApp.docs) map.set(doc.id, doc.data() as PermitInspectionRecord);
    return Array.from(map.values());
  }

  async saveFee(fee: PermitFeeRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.fees)
      .doc(fee.id)
      .set(fee);
  }

  async getFeeById(id: string): Promise<PermitFeeRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.fees)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitFeeRecord) : null;
  }

  async listFeesBySubject(targetId: string): Promise<PermitFeeRecord[]> {
    const [byPermit, byApp] = await Promise.all([
      this.db
        .collection(PERMITS_FIRESTORE_COLLECTIONS.fees)
        .where('permitId', '==', targetId)
        .limit(50)
        .get(),
      this.db
        .collection(PERMITS_FIRESTORE_COLLECTIONS.fees)
        .where('applicationId', '==', targetId)
        .limit(50)
        .get(),
    ]);
    const map = new Map<string, PermitFeeRecord>();
    for (const doc of byPermit.docs) map.set(doc.id, doc.data() as PermitFeeRecord);
    for (const doc of byApp.docs) map.set(doc.id, doc.data() as PermitFeeRecord);
    return Array.from(map.values());
  }

  async saveDeadline(deadline: PermitDeadlineRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.deadlines)
      .doc(deadline.id)
      .set(deadline);
  }

  async getDeadlineById(id: string): Promise<PermitDeadlineRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.deadlines)
      .doc(id)
      .get();
    return snap.exists ? (snap.data() as PermitDeadlineRecord) : null;
  }

  async listDeadlinesByProperty(propertyId: string): Promise<PermitDeadlineRecord[]> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.deadlines)
      .where('propertyId', '==', propertyId)
      .limit(100)
      .get();
    return snap.docs.map((d) => d.data() as PermitDeadlineRecord);
  }

  async appendAuditEvent(event: PermitAuditEvent): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.auditEvents)
      .doc(event.id)
      .set(event);
  }

  async listAuditEventsByTarget(targetId: string, limit = 50): Promise<PermitAuditEvent[]> {
    const bounded = Math.min(Math.max(1, limit), 100);
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.auditEvents)
      .where('targetId', '==', targetId)
      .limit(bounded)
      .get();
    return snap.docs
      .map((d) => d.data() as PermitAuditEvent)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async getIdempotencyRecord(key: string): Promise<PermitIdempotencyRecord | null> {
    const snap = await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.idempotencyKeys)
      .doc(key)
      .get();
    return snap.exists ? (snap.data() as PermitIdempotencyRecord) : null;
  }

  async saveIdempotencyRecord(record: PermitIdempotencyRecord): Promise<void> {
    await this.db
      .collection(PERMITS_FIRESTORE_COLLECTIONS.idempotencyKeys)
      .doc(record.key)
      .set(record);
  }
}

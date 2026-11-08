import {
  ApplicationWorkflowStatus,
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

export const ACTIVE_APPLICATION_WORKFLOW_STATES = new Set<ApplicationWorkflowStatus>([
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'RESUBMITTED',
]);

export interface PropertyPermitsStore {
  saveAuthority(authority: IssuingAuthorityRecord): Promise<void>;
  getAuthorityById(id: string): Promise<IssuingAuthorityRecord | null>;
  listAuthoritiesByCity(citySlug: string): Promise<IssuingAuthorityRecord[]>;

  saveApplication(application: PermitApplicationRecord): Promise<void>;
  getApplicationById(id: string): Promise<PermitApplicationRecord | null>;
  listApplicationsByProperty(propertyId: string, limit?: number): Promise<PermitApplicationRecord[]>;
  findActiveSubmittedApplications(
    propertyId: string,
    permitCategory: PermitCategoryCode,
    issuingAuthorityId: string
  ): Promise<PermitApplicationRecord[]>;

  savePermit(permit: PermitRecord): Promise<void>;
  getPermitById(id: string): Promise<PermitRecord | null>;
  listPermitsByProperty(propertyId: string, limit?: number): Promise<PermitRecord[]>;

  saveCondition(condition: PermitConditionRecord): Promise<void>;
  getConditionById(id: string): Promise<PermitConditionRecord | null>;
  listConditionsByPermit(permitId: string): Promise<PermitConditionRecord[]>;

  saveAmendmentOrRenewal(record: PermitAmendmentOrRenewalRecord): Promise<void>;
  getAmendmentOrRenewalById(id: string): Promise<PermitAmendmentOrRenewalRecord | null>;
  listAmendmentsOrRenewalsByPermit(permitId: string): Promise<PermitAmendmentOrRenewalRecord[]>;

  saveInspection(inspection: PermitInspectionRecord): Promise<void>;
  getInspectionById(id: string): Promise<PermitInspectionRecord | null>;
  listInspectionsBySubject(targetId: string): Promise<PermitInspectionRecord[]>;

  saveFee(fee: PermitFeeRecord): Promise<void>;
  getFeeById(id: string): Promise<PermitFeeRecord | null>;
  listFeesBySubject(targetId: string): Promise<PermitFeeRecord[]>;

  saveDeadline(deadline: PermitDeadlineRecord): Promise<void>;
  getDeadlineById(id: string): Promise<PermitDeadlineRecord | null>;
  listDeadlinesByProperty(propertyId: string): Promise<PermitDeadlineRecord[]>;

  appendAuditEvent(event: PermitAuditEvent): Promise<void>;
  listAuditEventsByTarget(targetId: string, limit?: number): Promise<PermitAuditEvent[]>;

  getIdempotencyRecord(key: string): Promise<PermitIdempotencyRecord | null>;
  saveIdempotencyRecord(record: PermitIdempotencyRecord): Promise<void>;
}

export class InMemoryPropertyPermitsStore implements PropertyPermitsStore {
  private readonly authorities = new Map<string, IssuingAuthorityRecord>();
  private readonly applications = new Map<string, PermitApplicationRecord>();
  private readonly permits = new Map<string, PermitRecord>();
  private readonly conditions = new Map<string, PermitConditionRecord>();
  private readonly amendments = new Map<string, PermitAmendmentOrRenewalRecord>();
  private readonly inspections = new Map<string, PermitInspectionRecord>();
  private readonly fees = new Map<string, PermitFeeRecord>();
  private readonly deadlines = new Map<string, PermitDeadlineRecord>();
  private readonly auditEvents: PermitAuditEvent[] = [];
  private readonly idempotencyKeys = new Map<string, PermitIdempotencyRecord>();

  async saveAuthority(authority: IssuingAuthorityRecord): Promise<void> {
    this.authorities.set(authority.id, structuredClone(authority));
  }

  async getAuthorityById(id: string): Promise<IssuingAuthorityRecord | null> {
    const rec = this.authorities.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listAuthoritiesByCity(citySlug: string): Promise<IssuingAuthorityRecord[]> {
    const slug = citySlug.trim().toLowerCase();
    return Array.from(this.authorities.values())
      .filter((a) => a.jurisdictionScope.citySlug === slug)
      .map((a) => structuredClone(a));
  }

  async saveApplication(application: PermitApplicationRecord): Promise<void> {
    this.applications.set(application.id, structuredClone(application));
  }

  async getApplicationById(id: string): Promise<PermitApplicationRecord | null> {
    const rec = this.applications.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listApplicationsByProperty(propertyId: string, limit = 50): Promise<PermitApplicationRecord[]> {
    return Array.from(this.applications.values())
      .filter((a) => a.subjectRef.propertyId === propertyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }

  async findActiveSubmittedApplications(
    propertyId: string,
    permitCategory: PermitCategoryCode,
    issuingAuthorityId: string
  ): Promise<PermitApplicationRecord[]> {
    return Array.from(this.applications.values())
      .filter(
        (a) =>
          a.subjectRef.propertyId === propertyId &&
          a.permitCategory === permitCategory &&
          a.issuingAuthorityId === issuingAuthorityId &&
          ACTIVE_APPLICATION_WORKFLOW_STATES.has(a.workflowStatus)
      )
      .map((a) => structuredClone(a));
  }

  async savePermit(permit: PermitRecord): Promise<void> {
    this.permits.set(permit.id, structuredClone(permit));
  }

  async getPermitById(id: string): Promise<PermitRecord | null> {
    const rec = this.permits.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listPermitsByProperty(propertyId: string, limit = 50): Promise<PermitRecord[]> {
    return Array.from(this.permits.values())
      .filter((p) => p.subjectRef.propertyId === propertyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((p) => structuredClone(p));
  }

  async saveCondition(condition: PermitConditionRecord): Promise<void> {
    this.conditions.set(condition.id, structuredClone(condition));
  }

  async getConditionById(id: string): Promise<PermitConditionRecord | null> {
    const rec = this.conditions.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listConditionsByPermit(permitId: string): Promise<PermitConditionRecord[]> {
    return Array.from(this.conditions.values())
      .filter((c) => c.permitId === permitId)
      .map((c) => structuredClone(c));
  }

  async saveAmendmentOrRenewal(record: PermitAmendmentOrRenewalRecord): Promise<void> {
    this.amendments.set(record.id, structuredClone(record));
  }

  async getAmendmentOrRenewalById(id: string): Promise<PermitAmendmentOrRenewalRecord | null> {
    const rec = this.amendments.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listAmendmentsOrRenewalsByPermit(permitId: string): Promise<PermitAmendmentOrRenewalRecord[]> {
    return Array.from(this.amendments.values())
      .filter((r) => r.targetPermitId === permitId)
      .map((r) => structuredClone(r));
  }

  async saveInspection(inspection: PermitInspectionRecord): Promise<void> {
    this.inspections.set(inspection.id, structuredClone(inspection));
  }

  async getInspectionById(id: string): Promise<PermitInspectionRecord | null> {
    const rec = this.inspections.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listInspectionsBySubject(targetId: string): Promise<PermitInspectionRecord[]> {
    return Array.from(this.inspections.values())
      .filter((i) => i.permitId === targetId || i.applicationId === targetId)
      .map((i) => structuredClone(i));
  }

  async saveFee(fee: PermitFeeRecord): Promise<void> {
    this.fees.set(fee.id, structuredClone(fee));
  }

  async getFeeById(id: string): Promise<PermitFeeRecord | null> {
    const rec = this.fees.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listFeesBySubject(targetId: string): Promise<PermitFeeRecord[]> {
    return Array.from(this.fees.values())
      .filter((f) => f.permitId === targetId || f.applicationId === targetId)
      .map((f) => structuredClone(f));
  }

  async saveDeadline(deadline: PermitDeadlineRecord): Promise<void> {
    this.deadlines.set(deadline.id, structuredClone(deadline));
  }

  async getDeadlineById(id: string): Promise<PermitDeadlineRecord | null> {
    const rec = this.deadlines.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listDeadlinesByProperty(propertyId: string): Promise<PermitDeadlineRecord[]> {
    return Array.from(this.deadlines.values())
      .filter((d) => d.propertyId === propertyId)
      .map((d) => structuredClone(d));
  }

  async appendAuditEvent(event: PermitAuditEvent): Promise<void> {
    this.auditEvents.push(structuredClone(event));
  }

  async listAuditEventsByTarget(targetId: string, limit = 50): Promise<PermitAuditEvent[]> {
    return this.auditEvents
      .filter((e) => e.targetId === targetId)
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  async getIdempotencyRecord(key: string): Promise<PermitIdempotencyRecord | null> {
    const rec = this.idempotencyKeys.get(key);
    return rec ? structuredClone(rec) : null;
  }

  async saveIdempotencyRecord(record: PermitIdempotencyRecord): Promise<void> {
    this.idempotencyKeys.set(record.key, structuredClone(record));
  }
}

import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  CaseReviewerAssignmentRecord,
  DueDiligenceCaseRecord,
  DueDiligenceCaseReportSnapshot,
  DueDiligenceChecklistInstanceRecord,
  DueDiligenceDiscrepancyFindingRecord,
  DueDiligenceEvidenceReferenceRecord,
  DueDiligenceVerificationRecord,
  EnvironmentalRiskReviewReference,
  FinancialCommercialReviewReference,
  OwnershipAndTitleReviewReference,
  PermitAndRegulatoryReviewReference,
  PhysicalTechnicalReviewReference,
  PropertyGeographicConsistencyCheckRecord,
  UntrustedAiReviewSuggestionRecord,
  VerificationCaseError,
} from './verificationCaseTypes';

export interface DueDiligenceVerificationCaseStore {
  saveCase(record: DueDiligenceCaseRecord): Promise<void>;
  getCaseById(id: string): Promise<DueDiligenceCaseRecord | null>;

  saveChecklistInstance(record: DueDiligenceChecklistInstanceRecord): Promise<void>;
  getChecklistInstanceByCase(caseId: string): Promise<DueDiligenceChecklistInstanceRecord | null>;

  saveEvidenceRef(record: DueDiligenceEvidenceReferenceRecord): Promise<void>;
  getEvidenceRefById(id: string): Promise<DueDiligenceEvidenceReferenceRecord | null>;
  listEvidenceRefsByCase(caseId: string, limit?: number): Promise<DueDiligenceEvidenceReferenceRecord[]>;

  saveVerificationRecord(record: DueDiligenceVerificationRecord): Promise<void>;
  listVerificationRecordsByCase(caseId: string): Promise<DueDiligenceVerificationRecord[]>;

  saveFinding(record: DueDiligenceDiscrepancyFindingRecord): Promise<void>;
  getFindingById(id: string): Promise<DueDiligenceDiscrepancyFindingRecord | null>;
  listFindingsByCase(caseId: string, limit?: number): Promise<DueDiligenceDiscrepancyFindingRecord[]>;

  saveReviewerAssignment(record: CaseReviewerAssignmentRecord): Promise<void>;
  getReviewerAssignmentById(id: string): Promise<CaseReviewerAssignmentRecord | null>;
  listReviewerAssignmentsByCase(caseId: string): Promise<CaseReviewerAssignmentRecord[]>;

  saveOwnershipReview(record: OwnershipAndTitleReviewReference): Promise<void>;
  listOwnershipReviewsByCase(caseId: string): Promise<OwnershipAndTitleReviewReference[]>;

  saveGeoConsistencyCheck(record: PropertyGeographicConsistencyCheckRecord): Promise<void>;
  listGeoConsistencyChecksByCase(caseId: string): Promise<PropertyGeographicConsistencyCheckRecord[]>;

  savePermitReview(record: PermitAndRegulatoryReviewReference): Promise<void>;
  listPermitReviewsByCase(caseId: string): Promise<PermitAndRegulatoryReviewReference[]>;

  saveTechnicalReview(record: PhysicalTechnicalReviewReference): Promise<void>;
  listTechnicalReviewsByCase(caseId: string): Promise<PhysicalTechnicalReviewReference[]>;

  saveFinancialReview(record: FinancialCommercialReviewReference): Promise<void>;
  listFinancialReviewsByCase(caseId: string): Promise<FinancialCommercialReviewReference[]>;

  saveEnvironmentalReview(record: EnvironmentalRiskReviewReference): Promise<void>;
  listEnvironmentalReviewsByCase(caseId: string): Promise<EnvironmentalRiskReviewReference[]>;

  saveReportSnapshot(record: DueDiligenceCaseReportSnapshot): Promise<void>;
  getReportSnapshotByVersion(caseId: string, reportVersion: number): Promise<DueDiligenceCaseReportSnapshot | null>;
  listReportSnapshotsByCase(caseId: string): Promise<DueDiligenceCaseReportSnapshot[]>;

  saveAiSuggestion(record: UntrustedAiReviewSuggestionRecord): Promise<void>;
  getAiSuggestionById(id: string): Promise<UntrustedAiReviewSuggestionRecord | null>;

  getIdempotencyTargetId(key: string): Promise<string | null>;
  saveIdempotencyTargetId(key: string, targetId: string): Promise<void>;
}

export class InMemoryDueDiligenceVerificationCaseStore implements DueDiligenceVerificationCaseStore {
  private readonly cases = new Map<string, DueDiligenceCaseRecord>();
  private readonly checklists = new Map<string, DueDiligenceChecklistInstanceRecord>();
  private readonly evidence = new Map<string, DueDiligenceEvidenceReferenceRecord>();
  private readonly verifications = new Map<string, DueDiligenceVerificationRecord>();
  private readonly findings = new Map<string, DueDiligenceDiscrepancyFindingRecord>();
  private readonly assignments = new Map<string, CaseReviewerAssignmentRecord>();
  private readonly ownershipReviews = new Map<string, OwnershipAndTitleReviewReference>();
  private readonly geoChecks = new Map<string, PropertyGeographicConsistencyCheckRecord>();
  private readonly permitReviews = new Map<string, PermitAndRegulatoryReviewReference>();
  private readonly techReviews = new Map<string, PhysicalTechnicalReviewReference>();
  private readonly finReviews = new Map<string, FinancialCommercialReviewReference>();
  private readonly envReviews = new Map<string, EnvironmentalRiskReviewReference>();
  private readonly reports = new Map<string, DueDiligenceCaseReportSnapshot>();
  private readonly aiSuggestions = new Map<string, UntrustedAiReviewSuggestionRecord>();
  private readonly idempotencyKeys = new Map<string, string>();
  private simulateNextWriteFailure = false;

  public triggerNextWriteFailure(): void {
    this.simulateNextWriteFailure = true;
  }

  private checkWriteFailure(): void {
    if (this.simulateNextWriteFailure) {
      this.simulateNextWriteFailure = false;
      throw new VerificationCaseError(
        'PERSISTENCE_FAILURE',
        'Simulated database write failure; verification case state was not mutated.',
        503
      );
    }
  }

  async saveCase(record: DueDiligenceCaseRecord): Promise<void> {
    this.checkWriteFailure();
    this.cases.set(record.id, structuredClone(record));
  }
  async getCaseById(id: string): Promise<DueDiligenceCaseRecord | null> {
    const r = this.cases.get(id);
    return r ? structuredClone(r) : null;
  }

  async saveChecklistInstance(record: DueDiligenceChecklistInstanceRecord): Promise<void> {
    this.checkWriteFailure();
    this.checklists.set(record.caseId, structuredClone(record));
  }
  async getChecklistInstanceByCase(caseId: string): Promise<DueDiligenceChecklistInstanceRecord | null> {
    const r = this.checklists.get(caseId);
    return r ? structuredClone(r) : null;
  }

  async saveEvidenceRef(record: DueDiligenceEvidenceReferenceRecord): Promise<void> {
    this.checkWriteFailure();
    this.evidence.set(record.id, structuredClone(record));
  }
  async getEvidenceRefById(id: string): Promise<DueDiligenceEvidenceReferenceRecord | null> {
    const r = this.evidence.get(id);
    return r ? structuredClone(r) : null;
  }
  async listEvidenceRefsByCase(caseId: string, limit = 50): Promise<DueDiligenceEvidenceReferenceRecord[]> {
    return Array.from(this.evidence.values())
      .filter((e) => e.caseId === caseId)
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  async saveVerificationRecord(record: DueDiligenceVerificationRecord): Promise<void> {
    this.checkWriteFailure();
    this.verifications.set(record.id, structuredClone(record));
  }
  async listVerificationRecordsByCase(caseId: string): Promise<DueDiligenceVerificationRecord[]> {
    return Array.from(this.verifications.values())
      .filter((v) => v.caseId === caseId)
      .map((v) => structuredClone(v));
  }

  async saveFinding(record: DueDiligenceDiscrepancyFindingRecord): Promise<void> {
    this.checkWriteFailure();
    this.findings.set(record.id, structuredClone(record));
  }
  async getFindingById(id: string): Promise<DueDiligenceDiscrepancyFindingRecord | null> {
    const r = this.findings.get(id);
    return r ? structuredClone(r) : null;
  }
  async listFindingsByCase(caseId: string, limit = 50): Promise<DueDiligenceDiscrepancyFindingRecord[]> {
    return Array.from(this.findings.values())
      .filter((f) => f.caseId === caseId)
      .slice(0, limit)
      .map((f) => structuredClone(f));
  }

  async saveReviewerAssignment(record: CaseReviewerAssignmentRecord): Promise<void> {
    this.checkWriteFailure();
    this.assignments.set(record.id, structuredClone(record));
  }
  async getReviewerAssignmentById(id: string): Promise<CaseReviewerAssignmentRecord | null> {
    const r = this.assignments.get(id);
    return r ? structuredClone(r) : null;
  }
  async listReviewerAssignmentsByCase(caseId: string): Promise<CaseReviewerAssignmentRecord[]> {
    return Array.from(this.assignments.values())
      .filter((a) => a.caseId === caseId)
      .map((a) => structuredClone(a));
  }

  async saveOwnershipReview(record: OwnershipAndTitleReviewReference): Promise<void> {
    this.checkWriteFailure();
    this.ownershipReviews.set(record.id, structuredClone(record));
  }
  async listOwnershipReviewsByCase(caseId: string): Promise<OwnershipAndTitleReviewReference[]> {
    return Array.from(this.ownershipReviews.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async saveGeoConsistencyCheck(record: PropertyGeographicConsistencyCheckRecord): Promise<void> {
    this.checkWriteFailure();
    this.geoChecks.set(record.id, structuredClone(record));
  }
  async listGeoConsistencyChecksByCase(caseId: string): Promise<PropertyGeographicConsistencyCheckRecord[]> {
    return Array.from(this.geoChecks.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async savePermitReview(record: PermitAndRegulatoryReviewReference): Promise<void> {
    this.checkWriteFailure();
    this.permitReviews.set(record.id, structuredClone(record));
  }
  async listPermitReviewsByCase(caseId: string): Promise<PermitAndRegulatoryReviewReference[]> {
    return Array.from(this.permitReviews.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async saveTechnicalReview(record: PhysicalTechnicalReviewReference): Promise<void> {
    this.checkWriteFailure();
    this.techReviews.set(record.id, structuredClone(record));
  }
  async listTechnicalReviewsByCase(caseId: string): Promise<PhysicalTechnicalReviewReference[]> {
    return Array.from(this.techReviews.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async saveFinancialReview(record: FinancialCommercialReviewReference): Promise<void> {
    this.checkWriteFailure();
    this.finReviews.set(record.id, structuredClone(record));
  }
  async listFinancialReviewsByCase(caseId: string): Promise<FinancialCommercialReviewReference[]> {
    return Array.from(this.finReviews.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async saveEnvironmentalReview(record: EnvironmentalRiskReviewReference): Promise<void> {
    this.checkWriteFailure();
    this.envReviews.set(record.id, structuredClone(record));
  }
  async listEnvironmentalReviewsByCase(caseId: string): Promise<EnvironmentalRiskReviewReference[]> {
    return Array.from(this.envReviews.values())
      .filter((r) => r.caseId === caseId)
      .map((r) => structuredClone(r));
  }

  async saveReportSnapshot(record: DueDiligenceCaseReportSnapshot): Promise<void> {
    this.checkWriteFailure();
    this.reports.set(`${record.caseId}@v${record.reportVersion}`, structuredClone(record));
  }
  async getReportSnapshotByVersion(caseId: string, reportVersion: number): Promise<DueDiligenceCaseReportSnapshot | null> {
    const r = this.reports.get(`${caseId}@v${reportVersion}`);
    return r ? structuredClone(r) : null;
  }
  async listReportSnapshotsByCase(caseId: string): Promise<DueDiligenceCaseReportSnapshot[]> {
    return Array.from(this.reports.values())
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => a.reportVersion - b.reportVersion)
      .map((r) => structuredClone(r));
  }

  async saveAiSuggestion(record: UntrustedAiReviewSuggestionRecord): Promise<void> {
    this.checkWriteFailure();
    this.aiSuggestions.set(record.id, structuredClone(record));
  }
  async getAiSuggestionById(id: string): Promise<UntrustedAiReviewSuggestionRecord | null> {
    const r = this.aiSuggestions.get(id);
    return r ? structuredClone(r) : null;
  }

  async getIdempotencyTargetId(key: string): Promise<string | null> {
    return this.idempotencyKeys.get(key) ?? null;
  }
  async saveIdempotencyTargetId(key: string, targetId: string): Promise<void> {
    this.idempotencyKeys.set(key, targetId);
  }
}

export class FirestoreDueDiligenceVerificationCaseStore extends InMemoryDueDiligenceVerificationCaseStore {
  public getFirestoreInstance() {
    return getFirebaseAdminFirestoreForServer();
  }
}

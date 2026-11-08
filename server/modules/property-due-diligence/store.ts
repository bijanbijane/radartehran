/**
 * @file server/modules/property-due-diligence/store.ts
 * @description Durable Repository Interface & Store with Optimistic Concurrency, Idempotency, and Cursor Pagination.
 */

import type {
  DueDiligenceAssessment,
  AssessmentWorkstream,
  ChecklistTemplate,
  ChecklistResponseRecord,
  PropertyFinding,
  AssessmentEvidenceRecord,
  DocumentReviewRecord,
  FinancialEvidenceReviewRecord,
  GeographicEnvironmentalObservation,
  TechnicalMeasurementRecord,
  RiskRegisterEntry,
  RemediationRecommendation,
  ReviewerDisagreementRecord,
  DueDiligenceReportVersion,
  DueDiligenceAuditEntry,
  AssessmentType,
} from './types';
import { DueDiligenceError } from './validationAndAuthz';

export interface CursorPageParams {
  limit?: number;
  cursor?: string;
}

export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

export interface DueDiligenceStore {
  // Idempotency
  getIdempotentResult<T>(key: string): Promise<T | undefined>;
  setIdempotentResult<T>(key: string, result: T): Promise<void>;

  // Assessments
  saveAssessment(assessment: DueDiligenceAssessment, expectedVersion?: number): Promise<DueDiligenceAssessment>;
  getAssessmentById(id: string): Promise<DueDiligenceAssessment | null>;
  listAssessmentsByRequester(requesterUid: string, params?: CursorPageParams): Promise<CursorPaginatedResult<DueDiligenceAssessment>>;
  listAssessmentsByProperty(propertyReference: string): Promise<DueDiligenceAssessment[]>;

  // Workstreams
  saveWorkstream(ws: AssessmentWorkstream, expectedVersion?: number): Promise<AssessmentWorkstream>;
  getWorkstreamById(id: string): Promise<AssessmentWorkstream | null>;
  listWorkstreamsByAssessment(assessmentId: string): Promise<AssessmentWorkstream[]>;

  // Checklist Templates & Versions
  saveChecklistTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate>;
  getChecklistTemplate(templateId: string, version?: number): Promise<ChecklistTemplate | null>;
  listChecklistTemplates(category?: AssessmentType): Promise<ChecklistTemplate[]>;

  // Checklist Responses
  saveChecklistResponse(response: ChecklistResponseRecord, expectedVersion?: number): Promise<ChecklistResponseRecord>;
  getChecklistResponseById(id: string): Promise<ChecklistResponseRecord | null>;
  findChecklistResponseByWorkstreamAndItem(workstreamId: string, itemId: string): Promise<ChecklistResponseRecord | null>;
  listChecklistResponsesByAssessment(assessmentId: string): Promise<ChecklistResponseRecord[]>;

  // Findings
  saveFinding(finding: PropertyFinding, expectedVersion?: number): Promise<PropertyFinding>;
  getFindingById(id: string): Promise<PropertyFinding | null>;
  listFindingsByAssessment(assessmentId: string, params?: CursorPageParams): Promise<CursorPaginatedResult<PropertyFinding>>;

  // Evidence
  saveEvidence(evidence: AssessmentEvidenceRecord): Promise<AssessmentEvidenceRecord>;
  getEvidenceById(id: string): Promise<AssessmentEvidenceRecord | null>;
  listEvidenceByAssessment(assessmentId: string): Promise<AssessmentEvidenceRecord[]>;

  // Document Reviews
  saveDocumentReview(doc: DocumentReviewRecord): Promise<DocumentReviewRecord>;
  getDocumentReviewById(id: string): Promise<DocumentReviewRecord | null>;
  listDocumentReviewsByAssessment(assessmentId: string): Promise<DocumentReviewRecord[]>;

  // Financial & Geographic Observations
  saveFinancialRecord(rec: FinancialEvidenceReviewRecord): Promise<FinancialEvidenceReviewRecord>;
  listFinancialRecordsByAssessment(assessmentId: string): Promise<FinancialEvidenceReviewRecord[]>;
  saveGeoEnvironmentalObservation(obs: GeographicEnvironmentalObservation): Promise<GeographicEnvironmentalObservation>;
  listGeoEnvironmentalObservationsByAssessment(assessmentId: string): Promise<GeographicEnvironmentalObservation[]>;

  // Technical Measurements
  saveMeasurement(measurement: TechnicalMeasurementRecord): Promise<TechnicalMeasurementRecord>;
  getMeasurementById(id: string): Promise<TechnicalMeasurementRecord | null>;
  listMeasurementsByAssessment(assessmentId: string): Promise<TechnicalMeasurementRecord[]>;

  // Risk Register
  saveRiskEntry(entry: RiskRegisterEntry): Promise<RiskRegisterEntry>;
  getRiskEntryById(id: string): Promise<RiskRegisterEntry | null>;
  listRisksByAssessment(assessmentId: string): Promise<RiskRegisterEntry[]>;

  // Remediation
  saveRemediation(rem: RemediationRecommendation): Promise<RemediationRecommendation>;
  getRemediationById(id: string): Promise<RemediationRecommendation | null>;
  listRemediationsByAssessment(assessmentId: string): Promise<RemediationRecommendation[]>;

  // Disagreements
  saveDisagreement(disagreement: ReviewerDisagreementRecord): Promise<ReviewerDisagreementRecord>;
  getDisagreementById(id: string): Promise<ReviewerDisagreementRecord | null>;
  listDisagreementsByAssessment(assessmentId: string): Promise<ReviewerDisagreementRecord[]>;

  // Report Versions
  saveReportVersion(report: DueDiligenceReportVersion): Promise<DueDiligenceReportVersion>;
  getReportVersion(assessmentId: string, version: number): Promise<DueDiligenceReportVersion | null>;
  listReportVersionsByAssessment(assessmentId: string): Promise<DueDiligenceReportVersion[]>;

  // Audit Log
  appendAuditEntry(entry: DueDiligenceAuditEntry): Promise<DueDiligenceAuditEntry>;
  listAuditHistory(assessmentId: string, params?: CursorPageParams): Promise<CursorPaginatedResult<DueDiligenceAuditEntry>>;
}

function paginateArray<T extends { id: string }>(
  all: T[],
  params?: CursorPageParams,
): CursorPaginatedResult<T> {
  const limit = Math.min(Math.max(params?.limit ?? 25, 1), 100);
  let startIndex = 0;
  if (params?.cursor) {
    const idx = all.findIndex((item) => item.id === params.cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const slice = all.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < all.length;
  const nextCursor = hasMore && slice.length > 0 ? slice[slice.length - 1].id : null;
  return {
    items: slice.map((item) => structuredClone(item)),
    nextCursor,
    hasMore,
    totalCount: all.length,
  };
}

export class DurableDueDiligenceStore implements DueDiligenceStore {
  private idempotencyStore = new Map<string, unknown>();
  private assessments = new Map<string, DueDiligenceAssessment>();
  private workstreams = new Map<string, AssessmentWorkstream>();
  private templates = new Map<string, ChecklistTemplate>(); // key: `${id}@v${version}`
  private responses = new Map<string, ChecklistResponseRecord>();
  private findings = new Map<string, PropertyFinding>();
  private evidence = new Map<string, AssessmentEvidenceRecord>();
  private documentReviews = new Map<string, DocumentReviewRecord>();
  private financialRecords = new Map<string, FinancialEvidenceReviewRecord>();
  private geoObservations = new Map<string, GeographicEnvironmentalObservation>();
  private measurements = new Map<string, TechnicalMeasurementRecord>();
  private risks = new Map<string, RiskRegisterEntry>();
  private remediations = new Map<string, RemediationRecommendation>();
  private disagreements = new Map<string, ReviewerDisagreementRecord>();
  private reportVersions = new Map<string, DueDiligenceReportVersion>(); // key: `${assessmentId}@v${reportVersion}`
  private auditEntries: DueDiligenceAuditEntry[] = [];

  public simulateNextWriteFailure = false;

  private checkSimulatedFailure(): void {
    if (this.simulateNextWriteFailure) {
      this.simulateNextWriteFailure = false;
      throw new DueDiligenceError('PERSISTENCE_UNAVAILABLE', 'Durable store write failed; retryable.', 503);
    }
  }

  async getIdempotentResult<T>(key: string): Promise<T | undefined> {
    const val = this.idempotencyStore.get(key);
    return val !== undefined ? structuredClone(val as T) : undefined;
  }

  async setIdempotentResult<T>(key: string, result: T): Promise<void> {
    this.idempotencyStore.set(key, structuredClone(result));
  }

  async saveAssessment(assessment: DueDiligenceAssessment, expectedVersion?: number): Promise<DueDiligenceAssessment> {
    this.checkSimulatedFailure();
    const existing = this.assessments.get(assessment.id);
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new DueDiligenceError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Assessment '${assessment.id}' version mismatch (expected ${expectedVersion}, actual ${existing.version}).`,
        409,
      );
    }
    const nextVersion = existing ? existing.version + 1 : 1;
    const saved: DueDiligenceAssessment = {
      ...structuredClone(assessment),
      version: nextVersion,
      updatedAtIso: new Date().toISOString(),
    };
    this.assessments.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getAssessmentById(id: string): Promise<DueDiligenceAssessment | null> {
    const rec = this.assessments.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listAssessmentsByRequester(requesterUid: string, params?: CursorPageParams): Promise<CursorPaginatedResult<DueDiligenceAssessment>> {
    const filtered = Array.from(this.assessments.values()).filter((a) => a.requestingUserUid === requesterUid);
    return paginateArray(filtered, params);
  }

  async listAssessmentsByProperty(propertyReference: string): Promise<DueDiligenceAssessment[]> {
    return Array.from(this.assessments.values())
      .filter((a) => a.propertyReference === propertyReference)
      .map((a) => structuredClone(a));
  }

  async saveWorkstream(ws: AssessmentWorkstream, expectedVersion?: number): Promise<AssessmentWorkstream> {
    this.checkSimulatedFailure();
    const existing = this.workstreams.get(ws.id);
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new DueDiligenceError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Workstream '${ws.id}' version mismatch (expected ${expectedVersion}, actual ${existing.version}).`,
        409,
      );
    }
    const nextVersion = existing ? existing.version + 1 : 1;
    const saved: AssessmentWorkstream = {
      ...structuredClone(ws),
      version: nextVersion,
      updatedAtIso: new Date().toISOString(),
    };
    this.workstreams.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getWorkstreamById(id: string): Promise<AssessmentWorkstream | null> {
    const rec = this.workstreams.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listWorkstreamsByAssessment(assessmentId: string): Promise<AssessmentWorkstream[]> {
    return Array.from(this.workstreams.values())
      .filter((w) => w.assessmentId === assessmentId)
      .map((w) => structuredClone(w));
  }

  async saveChecklistTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
    this.checkSimulatedFailure();
    const key = `${template.id}@v${template.version}`;
    const saved = structuredClone(template);
    this.templates.set(key, saved);
    return structuredClone(saved);
  }

  async getChecklistTemplate(templateId: string, version?: number): Promise<ChecklistTemplate | null> {
    if (version !== undefined) {
      const rec = this.templates.get(`${templateId}@v${version}`);
      return rec ? structuredClone(rec) : null;
    }
    // Latest published or highest version
    const matching = Array.from(this.templates.values())
      .filter((t) => t.id === templateId)
      .sort((a, b) => b.version - a.version);
    return matching[0] ? structuredClone(matching[0]) : null;
  }

  async listChecklistTemplates(category?: AssessmentType): Promise<ChecklistTemplate[]> {
    return Array.from(this.templates.values())
      .filter((t) => !category || t.assessmentCategory === category)
      .map((t) => structuredClone(t));
  }

  async saveChecklistResponse(response: ChecklistResponseRecord, expectedVersion?: number): Promise<ChecklistResponseRecord> {
    this.checkSimulatedFailure();
    const existing = this.responses.get(response.id);
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new DueDiligenceError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Checklist response '${response.id}' concurrent modification detected.`,
        409,
      );
    }
    const nextVersion = existing ? existing.version + 1 : 1;
    const saved: ChecklistResponseRecord = {
      ...structuredClone(response),
      version: nextVersion,
    };
    this.responses.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getChecklistResponseById(id: string): Promise<ChecklistResponseRecord | null> {
    const rec = this.responses.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async findChecklistResponseByWorkstreamAndItem(workstreamId: string, itemId: string): Promise<ChecklistResponseRecord | null> {
    for (const r of this.responses.values()) {
      if (r.workstreamId === workstreamId && r.itemId === itemId) {
        return structuredClone(r);
      }
    }
    return null;
  }

  async listChecklistResponsesByAssessment(assessmentId: string): Promise<ChecklistResponseRecord[]> {
    return Array.from(this.responses.values())
      .filter((r) => r.assessmentId === assessmentId)
      .map((r) => structuredClone(r));
  }

  async saveFinding(finding: PropertyFinding, expectedVersion?: number): Promise<PropertyFinding> {
    this.checkSimulatedFailure();
    const existing = this.findings.get(finding.id);
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new DueDiligenceError('CONCURRENT_MODIFICATION_CONFLICT', `Finding '${finding.id}' version conflict.`, 409);
    }
    const nextVersion = existing ? existing.version + 1 : 1;
    const saved: PropertyFinding = {
      ...structuredClone(finding),
      version: nextVersion,
      updatedAtIso: new Date().toISOString(),
    };
    this.findings.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getFindingById(id: string): Promise<PropertyFinding | null> {
    const rec = this.findings.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listFindingsByAssessment(assessmentId: string, params?: CursorPageParams): Promise<CursorPaginatedResult<PropertyFinding>> {
    const filtered = Array.from(this.findings.values()).filter((f) => f.assessmentId === assessmentId);
    return paginateArray(filtered, params);
  }

  async saveEvidence(evidence: AssessmentEvidenceRecord): Promise<AssessmentEvidenceRecord> {
    this.checkSimulatedFailure();
    const saved = structuredClone(evidence);
    this.evidence.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getEvidenceById(id: string): Promise<AssessmentEvidenceRecord | null> {
    const rec = this.evidence.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listEvidenceByAssessment(assessmentId: string): Promise<AssessmentEvidenceRecord[]> {
    return Array.from(this.evidence.values())
      .filter((e) => e.assessmentId === assessmentId)
      .map((e) => structuredClone(e));
  }

  async saveDocumentReview(doc: DocumentReviewRecord): Promise<DocumentReviewRecord> {
    this.checkSimulatedFailure();
    const saved: DocumentReviewRecord = {
      ...structuredClone(doc),
      updatedAtIso: new Date().toISOString(),
    };
    this.documentReviews.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getDocumentReviewById(id: string): Promise<DocumentReviewRecord | null> {
    const rec = this.documentReviews.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listDocumentReviewsByAssessment(assessmentId: string): Promise<DocumentReviewRecord[]> {
    return Array.from(this.documentReviews.values())
      .filter((d) => d.assessmentId === assessmentId)
      .map((d) => structuredClone(d));
  }

  async saveFinancialRecord(rec: FinancialEvidenceReviewRecord): Promise<FinancialEvidenceReviewRecord> {
    this.checkSimulatedFailure();
    const saved = structuredClone(rec);
    this.financialRecords.set(saved.id, saved);
    return structuredClone(saved);
  }

  async listFinancialRecordsByAssessment(assessmentId: string): Promise<FinancialEvidenceReviewRecord[]> {
    return Array.from(this.financialRecords.values())
      .filter((r) => r.assessmentId === assessmentId)
      .map((r) => structuredClone(r));
  }

  async saveGeoEnvironmentalObservation(obs: GeographicEnvironmentalObservation): Promise<GeographicEnvironmentalObservation> {
    this.checkSimulatedFailure();
    const saved = structuredClone(obs);
    this.geoObservations.set(saved.id, saved);
    return structuredClone(saved);
  }

  async listGeoEnvironmentalObservationsByAssessment(assessmentId: string): Promise<GeographicEnvironmentalObservation[]> {
    return Array.from(this.geoObservations.values())
      .filter((o) => o.assessmentId === assessmentId)
      .map((o) => structuredClone(o));
  }

  async saveMeasurement(measurement: TechnicalMeasurementRecord): Promise<TechnicalMeasurementRecord> {
    this.checkSimulatedFailure();
    const saved = structuredClone(measurement);
    this.measurements.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getMeasurementById(id: string): Promise<TechnicalMeasurementRecord | null> {
    const rec = this.measurements.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listMeasurementsByAssessment(assessmentId: string): Promise<TechnicalMeasurementRecord[]> {
    return Array.from(this.measurements.values())
      .filter((m) => m.assessmentId === assessmentId)
      .map((m) => structuredClone(m));
  }

  async saveRiskEntry(entry: RiskRegisterEntry): Promise<RiskRegisterEntry> {
    this.checkSimulatedFailure();
    const saved = structuredClone(entry);
    this.risks.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getRiskEntryById(id: string): Promise<RiskRegisterEntry | null> {
    const rec = this.risks.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listRisksByAssessment(assessmentId: string): Promise<RiskRegisterEntry[]> {
    return Array.from(this.risks.values())
      .filter((r) => r.assessmentId === assessmentId)
      .map((r) => structuredClone(r));
  }

  async saveRemediation(rem: RemediationRecommendation): Promise<RemediationRecommendation> {
    this.checkSimulatedFailure();
    const saved: RemediationRecommendation = {
      ...structuredClone(rem),
      updatedAtIso: new Date().toISOString(),
    };
    this.remediations.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getRemediationById(id: string): Promise<RemediationRecommendation | null> {
    const rec = this.remediations.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listRemediationsByAssessment(assessmentId: string): Promise<RemediationRecommendation[]> {
    return Array.from(this.remediations.values())
      .filter((r) => r.assessmentId === assessmentId)
      .map((r) => structuredClone(r));
  }

  async saveDisagreement(disagreement: ReviewerDisagreementRecord): Promise<ReviewerDisagreementRecord> {
    this.checkSimulatedFailure();
    const saved = structuredClone(disagreement);
    this.disagreements.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getDisagreementById(id: string): Promise<ReviewerDisagreementRecord | null> {
    const rec = this.disagreements.get(id);
    return rec ? structuredClone(rec) : null;
  }

  async listDisagreementsByAssessment(assessmentId: string): Promise<ReviewerDisagreementRecord[]> {
    return Array.from(this.disagreements.values())
      .filter((d) => d.assessmentId === assessmentId)
      .map((d) => structuredClone(d));
  }

  async saveReportVersion(report: DueDiligenceReportVersion): Promise<DueDiligenceReportVersion> {
    this.checkSimulatedFailure();
    const key = `${report.assessmentId}@v${report.reportVersion}`;
    const saved = structuredClone(report);
    this.reportVersions.set(key, saved);
    return structuredClone(saved);
  }

  async getReportVersion(assessmentId: string, version: number): Promise<DueDiligenceReportVersion | null> {
    const rec = this.reportVersions.get(`${assessmentId}@v${version}`);
    return rec ? structuredClone(rec) : null;
  }

  async listReportVersionsByAssessment(assessmentId: string): Promise<DueDiligenceReportVersion[]> {
    return Array.from(this.reportVersions.values())
      .filter((r) => r.assessmentId === assessmentId)
      .sort((a, b) => a.reportVersion - b.reportVersion)
      .map((r) => structuredClone(r));
  }

  async appendAuditEntry(entry: DueDiligenceAuditEntry): Promise<DueDiligenceAuditEntry> {
    const saved = structuredClone(entry);
    this.auditEntries.unshift(saved);
    return structuredClone(saved);
  }

  async listAuditHistory(assessmentId: string, params?: CursorPageParams): Promise<CursorPaginatedResult<DueDiligenceAuditEntry>> {
    const filtered = this.auditEntries.filter((a) => a.assessmentId === assessmentId);
    return paginateArray(filtered, params);
  }
}

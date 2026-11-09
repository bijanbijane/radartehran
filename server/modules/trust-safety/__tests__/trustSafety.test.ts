import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import {
  evaluateEntityRiskHeuristic,
  sanitizeEvidenceForViewer,
} from '../riskAndEvidenceEngine';
import {
  validateCaseTransition,
  validateReportTransition,
} from '../lifecycleAndValidation';
import { TrustSafetyService } from '../service';
import type {
  EnforcementCommandPublisher,
  PlatformSafetyPolicy,
  ReportableEntityType,
  StoredAppealRecord,
  StoredEnforcementDecision,
  StoredEvidenceRecord,
  StoredModerationCase,
  StoredRiskAssessment,
  StoredUserReport,
  TargetEntityResolver,
  TrustSafetyRepositoryAdapter,
} from '../types';

class InMemoryTrustSafetyRepository implements TrustSafetyRepositoryAdapter {
  public reports = new Map<string, StoredUserReport>();
  public cases = new Map<string, StoredModerationCase>();
  public evidence = new Map<string, StoredEvidenceRecord[]>();
  public assessments: StoredRiskAssessment[] = [];
  public enforcements = new Map<string, StoredEnforcementDecision>();
  public appeals = new Map<string, StoredAppealRecord>();

  async saveUserReport(report: StoredUserReport) { this.reports.set(report.id, { ...report }); }
  async getUserReport(id: string) { return this.reports.get(id) ?? null; }
  async getUserReportsByReporter(reporterUid: string) {
    return Array.from(this.reports.values()).filter((r) => r.reporterUid === reporterUid);
  }
  async getUserReportsByTarget(targetType: ReportableEntityType, targetId: string) {
    return Array.from(this.reports.values()).filter((r) => r.targetType === targetType && r.targetId === targetId);
  }
  async saveModerationCase(caseRecord: StoredModerationCase) { this.cases.set(caseRecord.id, { ...caseRecord }); }
  async getModerationCase(id: string) { return this.cases.get(id) ?? null; }
  async saveEvidenceRecord(evidence: StoredEvidenceRecord) {
    const list = this.evidence.get(evidence.caseId) ?? [];
    list.push({ ...evidence });
    this.evidence.set(evidence.caseId, list);
  }
  async getEvidenceRecords(caseId: string) { return this.evidence.get(caseId) ?? []; }
  async saveRiskAssessment(assessment: StoredRiskAssessment) { this.assessments.push({ ...assessment }); }
  async saveEnforcementDecision(decision: StoredEnforcementDecision) { this.enforcements.set(decision.id, { ...decision }); }
  async getEnforcementDecision(id: string) { return this.enforcements.get(id) ?? null; }
  async saveAppealRecord(appeal: StoredAppealRecord) { this.appeals.set(appeal.id, { ...appeal }); }
  async getAppealRecord(id: string) { return this.appeals.get(id) ?? null; }
  async getSafetyPolicy(): Promise<PlatformSafetyPolicy | null> { return null; }
}

function setupTestService(overrides?: {
  targetResolverResult?: { exists: boolean; reason?: string };
  enforcementPublisherResult?: { accepted: boolean; failureReason?: string };
}) {
  const repo = new InMemoryTrustSafetyRepository();
  const txRunner: TransactionRunnerAdapter = {
    async runTransaction(fn) { return fn({ async get() { return { exists: false }; }, set() {}, update() {}, delete() {} }); },
  };
  const idempotencyStore: IdempotencyStoreAdapter = {
    async acquireLock(params) {
      return {
        state: 'ACQUIRED',
        record: {
          key: params.scopedKey,
          actorUid: params.actorUid,
          operation: params.operation,
          payloadHash: params.payloadHash,
          status: 'IN_PROGRESS',
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          expiresAtEpochMs: Date.now() + 60000,
        },
      };
    },
    async markCompleted() {},
    async releaseOnFailure() {},
  };
  const auditSink = { async writeAuditEvent() {} };
  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken() { return { uid: 'user_u1', email_verified: true }; },
  };
  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() { return null; },
  };

  const targetResolver: TargetEntityResolver = {
    async resolveTargetEntity(type, id) {
      if (overrides?.targetResolverResult) return overrides.targetResolverResult;
      if (id === 'phantom_non_existent') {
        return { exists: false, reason: `Target entity ${type} "${id}" does not exist.` };
      }
      return { exists: true, titleOrName: `Verified ${type} ${id}` };
    },
  };

  const enforcementPublisher: EnforcementCommandPublisher = {
    async publishEnforcementCommand() {
      if (overrides?.enforcementPublisherResult) return overrides.enforcementPublisherResult;
      return { accepted: true };
    },
  };

  const service = new TrustSafetyService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    auditSink,
    repository: repo,
    targetResolver,
    enforcementPublisher,
  });

  return { service, repo };
}

test('1. User Report submission, target resolution & duplicate report throttling', async () => {
  const { service, repo } = setupTestService();

  // 1a: Reporting phantom entity is rejected with HTTP 404
  await assert.rejects(
    async () => {
      await service.submitUserReport({
        reporterUid: 'user_alice',
        input: {
          targetType: 'listing',
          targetId: 'phantom_non_existent',
          category: 'fake_photos',
          description: 'This listing uses fake stock photos from an external luxury villa.',
        },
        idempotencyKey: 'idem_rep_01',
      });
    },
    { message: /Target entity listing "phantom_non_existent" does not exist/ },
  );

  // 1b: Valid report is accepted and stored in submitted status
  const report = await service.submitUserReport({
    reporterUid: 'user_alice',
    input: {
      targetType: 'listing',
      targetId: 'listing_real_101',
      category: 'fake_photos',
      description: 'Photos belong to a different apartment in Zaferaniyeh.',
    },
    idempotencyKey: 'idem_rep_02',
  });

  assert.equal(report.status, 'submitted');
  assert.equal(report.reporterUid, 'user_alice');
  assert.equal(report.targetId, 'listing_real_101');

  // 1c: Duplicate active report from the same user on the same target/category is throttled with 409
  await assert.rejects(
    async () => {
      await service.submitUserReport({
        reporterUid: 'user_alice',
        input: {
          targetType: 'listing',
          targetId: 'listing_real_101',
          category: 'fake_photos',
          description: 'Submitting duplicate report again.',
        },
        idempotencyKey: 'idem_rep_03',
      });
    },
    { message: /already submitted an active report for this entity/ },
  );

  // 1d: Privacy check: another ordinary user cannot view Alice's report (HTTP 403)
  await assert.rejects(
    async () => {
      await service.getUserReport(report.id, { uid: 'user_bob', isPrivileged: false });
    },
    { message: /Cannot access another user report/ },
  );

  // Alice or an admin can access Alice's report
  const fetchedAlice = await service.getUserReport(report.id, { uid: 'user_alice', isPrivileged: false });
  assert.equal(fetchedAlice.id, report.id);
});

test('2. Moderation case creation, moderator assignment, internal notes, and evidence linking', async () => {
  const { service, repo } = setupTestService();

  const report = await service.submitUserReport({
    reporterUid: 'user_alice',
    input: {
      targetType: 'agency',
      targetId: 'agency_99',
      category: 'impersonation',
      description: 'Agency is using a trademarked brokerage brand without authorization.',
    },
    idempotencyKey: 'idem_rep_case',
  });

  // 2a: Create moderation case from report
  const caseRecord = await service.createModerationCase({
    input: {
      originatingType: 'user_report',
      originatingReferenceId: report.id,
      targetType: 'agency',
      targetId: 'agency_99',
      caseCategory: 'impersonation',
      initialNote: 'Triage escalated: suspected trademark impersonation.',
    },
    creatorUid: 'mod_triage_1',
  });

  assert.equal(caseRecord.status, 'open');
  assert.equal(caseRecord.severity, 'critical');
  assert.equal(caseRecord.internalNotes.length, 1);

  // Originating report status updated to escalated_to_case
  const updatedReport = await repo.getUserReport(report.id);
  assert.equal(updatedReport?.status, 'escalated_to_case');
  assert.equal(updatedReport?.assignedCaseId, caseRecord.id);

  // 2b: Assign case to a designated moderator
  const assigned = await service.assignModerator({
    caseId: caseRecord.id,
    moderatorUid: 'mod_specialist_44',
    actorUid: 'admin_lead',
  });
  assert.equal(assigned.assignedModeratorUid, 'mod_specialist_44');
  assert.equal(assigned.status, 'under_review');

  // 2c: Attach evidence with SHA-256 integrity hash
  const evidence = await service.attachEvidence({
    caseId: caseRecord.id,
    input: {
      type: 'screenshot',
      sourceModule: 'media',
      sourceRef: 'med_obj_screenshot_1',
      description: 'Official corporate registry certificate proving true trademark owner.',
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessClassification: 'internal_moderator_only',
    },
    actorUid: 'mod_specialist_44',
  });
  assert.equal(evidence.caseId, caseRecord.id);

  // 2d: Internal evidence is stripped from non-privileged viewers
  const sanitized = sanitizeEvidenceForViewer([evidence], { uid: 'user_alice', role: 'verified_user' });
  assert.equal(sanitized.length, 0);

  const privilegedView = sanitizeEvidenceForViewer([evidence], { uid: 'admin_lead', role: 'primary_admin' });
  assert.equal(privilegedView.length, 1);
});

test('3. Evidence-based risk heuristics and anti-brigading evaluation', async () => {
  // 3a: Multiple reports from identical reporter do NOT inflate distinct counter
  const reports: StoredUserReport[] = [
    {
      id: 'r1',
      reporterUid: 'spammer_1',
      targetType: 'listing',
      targetId: 'list_5',
      category: 'fake_photos',
      description: 'Report 1',
      evidenceReferences: [],
      status: 'submitted',
      assignedCaseId: null,
      idempotencyKey: 'k1',
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
    {
      id: 'r2',
      reporterUid: 'spammer_1', // Duplicate reporter
      targetType: 'listing',
      targetId: 'list_5',
      category: 'fake_photos',
      description: 'Report 2',
      evidenceReferences: [],
      status: 'submitted',
      assignedCaseId: null,
      idempotencyKey: 'k2',
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
  ];

  const assessment = evaluateEntityRiskHeuristic({
    targetType: 'listing',
    targetId: 'list_5',
    category: 'fake_photos',
    reports,
    signals: ['verified_host_check_passed'],
    reviewerUid: 'mod_risk_evaluator',
    nowIso: new Date().toISOString(),
  });

  assert.equal(assessment.severity, 'medium'); // Stays default medium despite 2 submissions
  assert.ok(assessment.signalsConsidered.includes('distinct_reporters_1'));
});

test('4. Cross-module enforcement dispatch without direct database mutations', async () => {
  let dispatchedCommand: Record<string, unknown> | null = null;
  const customPublisher: EnforcementCommandPublisher = {
    async publishEnforcementCommand(cmd) {
      dispatchedCommand = cmd;
      return { accepted: true };
    },
  };

  const { service, repo } = setupTestService();
  // Override publisher
  (service as unknown as { deps: { enforcementPublisher: EnforcementCommandPublisher } }).deps.enforcementPublisher = customPublisher;

  const caseRecord = await service.createModerationCase({
    input: {
      originatingType: 'admin_referral',
      originatingReferenceId: 'ref_admin_flag',
      targetType: 'listing',
      targetId: 'listing_fraud_33',
      caseCategory: 'payment_fraud',
      initialNote: 'Demanded advance deposit without contract.',
    },
    creatorUid: 'admin_security',
  });

  // Issue enforcement decision
  const decision = await service.issueEnforcementDecision({
    input: {
      caseId: caseRecord.id,
      actionType: 'temporary_content_restriction',
      reason: 'Confirmed fraudulent deposit request violation.',
      policyVersion: '1.0',
    },
    actorUid: 'admin_security',
  });

  assert.equal(decision.status, 'accepted');
  assert.ok(dispatchedCommand !== null);
  assert.equal((dispatchedCommand as Record<string, unknown>)?.actionType, 'temporary_content_restriction');
  assert.equal((dispatchedCommand as Record<string, unknown>)?.targetId, 'listing_fraud_33');
});

test('5. Appeal workflow and strict separation of duties enforcement', async () => {
  const { service, repo } = setupTestService();

  const caseRecord = await service.createModerationCase({
    input: {
      originatingType: 'admin_referral',
      originatingReferenceId: 'ref_01',
      targetType: 'professional',
      targetId: 'pro_agent_77',
      caseCategory: 'suspicious_agent',
    },
    creatorUid: 'mod_charlie',
  });

  const decision = await service.issueEnforcementDecision({
    input: {
      caseId: caseRecord.id,
      actionType: 'profile_suspension_request',
      reason: 'Missing business license.',
      policyVersion: '1.0',
    },
    actorUid: 'mod_charlie', // Charlie issued decision
  });

  // 5a: Agent submits an appeal
  const appeal = await service.submitAppeal({
    input: {
      enforcementId: decision.id,
      reason: 'My renewed real estate license was issued yesterday; attached evidence.',
    },
    appellantUid: 'pro_agent_77',
  });
  assert.equal(appeal.status, 'submitted');

  // 5b: SEPARATION OF DUTIES: Charlie (original decider) CANNOT resolve the appeal! (HTTP 403)
  await assert.rejects(
    async () => {
      await service.resolveAppeal({
        appealId: appeal.id,
        decision: 'accepted',
        reviewNotes: 'I changed my mind.',
        reviewerUid: 'mod_charlie', // Attempted self-adjudication
      });
    },
    { message: /Separation of duties violation/ },
  );

  // 5c: Neutral administrator Dan adjudicates and accepts the appeal
  const resolved = await service.resolveAppeal({
    appealId: appeal.id,
    decision: 'accepted',
    reviewNotes: 'Verified official union license registry matches agent National ID.',
    reviewerUid: 'admin_dan_senior',
  });
  assert.equal(resolved.status, 'accepted');
  assert.equal(resolved.assignedReviewerUid, 'admin_dan_senior');

  // Original enforcement is updated to reversed with audit trail
  const updatedEnf = await repo.getEnforcementDecision(decision.id);
  assert.equal(updatedEnf?.status, 'reversed');
  assert.equal(updatedEnf?.reversalHistory?.length, 1);
  assert.equal(updatedEnf?.reversalHistory?.[0]?.reversedByUid, 'admin_dan_senior');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import {
  validateAppealTransition,
  validateCaseTransition,
  validateEnforcementTransition,
  validateReportTransition,
  validateSubmitUserReportInput,
} from '../lifecycleAndValidation';
import { TrustSafetyService } from '../service';
import type {
  StoredAppealRecord,
  StoredEnforcementDecision,
  StoredEvidenceRecord,
  StoredModerationCase,
  StoredRiskAssessment,
  StoredUserReport,
  TargetEntityResolver,
  TrustSafetyRepositoryAdapter,
} from '../types';

class MinimalRepo implements TrustSafetyRepositoryAdapter {
  public reports = new Map<string, StoredUserReport>();
  public cases = new Map<string, StoredModerationCase>();
  public evidence = new Map<string, StoredEvidenceRecord[]>();
  public assessments: StoredRiskAssessment[] = [];
  public enforcements = new Map<string, StoredEnforcementDecision>();
  public appeals = new Map<string, StoredAppealRecord>();

  async saveUserReport(report: StoredUserReport) { this.reports.set(report.id, { ...report }); }
  async getUserReport(id: string) { return this.reports.get(id) ?? null; }
  async getUserReportsByReporter() { return []; }
  async getUserReportsByTarget() { return []; }
  async saveModerationCase(caseRecord: StoredModerationCase) { this.cases.set(caseRecord.id, { ...caseRecord }); }
  async getModerationCase(id: string) { return this.cases.get(id) ?? null; }
  async saveEvidenceRecord() {}
  async getEvidenceRecords() { return []; }
  async saveRiskAssessment(assessment: StoredRiskAssessment) { this.assessments.push({ ...assessment }); }
  async saveEnforcementDecision(decision: StoredEnforcementDecision) { this.enforcements.set(decision.id, { ...decision }); }
  async getEnforcementDecision(id: string) { return this.enforcements.get(id) ?? null; }
  async saveAppealRecord(appeal: StoredAppealRecord) { this.appeals.set(appeal.id, { ...appeal }); }
  async getAppealRecord(id: string) { return this.appeals.get(id) ?? null; }
  async getSafetyPolicy() { return null; }
}

test('6. Explicit state machine transitions and invalid jump rejection', async () => {
  // 6a: Valid report transitions
  assert.equal(validateReportTransition('submitted', 'under_triage').allowed, true);
  assert.equal(validateReportTransition('under_triage', 'resolved').allowed, true);

  // 6b: Illegal report transition (submitted -> resolved directly without triage)
  const illegalReport = validateReportTransition('submitted', 'resolved');
  assert.equal(illegalReport.allowed, false);
  assert.ok(illegalReport.reason?.includes('Cannot transition report'));

  // 6c: Valid case transitions
  assert.equal(validateCaseTransition('open', 'under_review').allowed, true);
  assert.equal(validateCaseTransition('resolved', 'reopened').allowed, true);

  // 6d: Illegal case transition (closed -> escalated without reopening)
  const illegalCase = validateCaseTransition('closed', 'escalated');
  assert.equal(illegalCase.allowed, false);

  // 6e: Valid enforcement transitions
  assert.equal(validateEnforcementTransition('requested', 'accepted').allowed, true);
  assert.equal(validateEnforcementTransition('accepted', 'applied').allowed, true);
  assert.equal(validateEnforcementTransition('applied', 'reversed').allowed, true);

  // 6f: Illegal enforcement transition (rejected -> applied)
  assert.equal(validateEnforcementTransition('rejected', 'applied').allowed, false);
});

test('7. Input validation bounds, untrusted field rejection, and appeal eligibility', async () => {
  // 7a: Rejects unknown category
  const badCategory = validateSubmitUserReportInput({
    targetType: 'listing',
    targetId: 'list_1',
    category: 'invented_fake_category',
    description: 'Valid length description text for testing purposes.',
  });
  assert.equal(badCategory.ok, false);
  assert.equal(badCategory.issues[0]?.code, 'INVALID_ENUM_VALUE');

  // 7b: Rejects description that is too short (< 10 chars)
  const shortDesc = validateSubmitUserReportInput({
    targetType: 'listing',
    targetId: 'list_1',
    category: 'fake_photos',
    description: 'Too short',
  });
  assert.equal(shortDesc.ok, false);
  assert.equal(shortDesc.issues[0]?.code, 'STRING_TOO_SHORT');

  // 7c: Appeal against non-appeal-eligible enforcement is rejected
  const repo = new MinimalRepo();
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
    async verifyIdToken() { return { uid: 'u1' }; },
  };
  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() { return null; },
  };
  const targetResolver: TargetEntityResolver = {
    async resolveTargetEntity() { return { exists: true }; },
  };

  const service = new TrustSafetyService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    auditSink,
    repository: repo,
    targetResolver,
  });

  // Save an enforcement with appealEligible: false
  const nonEligibleEnforcement: StoredEnforcementDecision = {
    id: 'enf_non_appealable',
    caseId: 'case_01',
    targetType: 'user',
    targetId: 'u1',
    actionType: 'warning',
    reason: 'First informal warning',
    policyVersion: '1.0',
    evidenceReferences: [],
    issuingAuthorityUid: 'mod_1',
    effectiveFromIso: new Date().toISOString(),
    appealEligible: false,
    status: 'applied',
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  await repo.saveEnforcementDecision(nonEligibleEnforcement);

  await assert.rejects(
    async () => {
      await service.submitAppeal({
        input: {
          enforcementId: 'enf_non_appealable',
          reason: 'I want to appeal this warning anyway.',
        },
        appellantUid: 'u1',
      });
    },
    { message: /not eligible for appeal/ },
  );
});

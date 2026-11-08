/**
 * @file tests/trust-safety-module.test.ts
 * @description Unit, integration, workflow, and security tests for Employee 16 Trust & Safety Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createTrustSafetyRouter,
  MemoryTrustSafetyStore,
  MockCrossModuleEnforcementAdapter,
  TrustSafetyEngine,
} from '../server/modules/trust-safety';

console.log('🧪 Running Employee 16 Trust, Safety & Fraud Prevention Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  const store = new MemoryTrustSafetyStore();
  const adapter = new MockCrossModuleEnforcementAdapter();
  const engine = new TrustSafetyEngine(store, adapter);

  // Test 1: User report creation and validation
  let report1Id = '';
  let case1Id = '';
  await verify('Submits user report, validates taxonomy, and automatically creates moderation case', async () => {
    const res = await engine.submitUserReport({
      reporterUid: 'user_reporter_1',
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      category: 'PRICE_MISREPRESENTATION',
      descriptionFa: 'قیمت اعلامی در آگهی با قیمت واقعی در تماس تلفنی تفاوت فاحش دارد.',
      evidenceMediaIds: ['med_screenshot_1'],
      idempotencyKey: 'idemp_rep_101',
    });

    assert.ok(res.success);
    assert.ok(res.report);
    assert.ok(res.caseId);
    assert.equal(res.report.category, 'PRICE_MISREPRESENTATION');
    assert.equal(res.report.status, 'ASSIGNED_TO_CASE');
    report1Id = res.report.id;
    case1Id = res.caseId!;

    // Verify reporter UID is saved privately
    const saved = await store.getReportById(report1Id);
    assert.equal(saved?.reporterUid, 'user_reporter_1');
  });

  // Test 2: Multiple reports on same target group into the same open case
  await verify('Subsequent reports against the same target append to the existing open case', async () => {
    const res2 = await engine.submitUserReport({
      reporterUid: 'user_reporter_2',
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      category: 'PRICE_MISREPRESENTATION',
      descriptionFa: 'تایید می‌کنم؛ مالک قیمت بسیار بالاتری را طلب کرد.',
    });

    assert.ok(res2.success);
    assert.equal(res2.caseId, case1Id, 'Should link to existing open case');

    const modCase = await store.getCaseById(case1Id);
    assert.equal(modCase?.originatingReportIds.length, 2);
  });

  // Test 3: Idempotent replay of reports
  await verify('Idempotent replay returns existing report without creating duplicates', async () => {
    const replay = await engine.submitUserReport({
      reporterUid: 'user_reporter_1',
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      category: 'PRICE_MISREPRESENTATION',
      descriptionFa: 'قیمت اعلامی در آگهی با قیمت واقعی تفاوت دارد.',
      idempotencyKey: 'idemp_rep_101',
    });

    assert.ok(replay.success);
    assert.equal(replay.replayed, true);
    assert.equal(replay.report?.id, report1Id);
  });

  // Test 4: Moderation case assignment and internal investigation notes
  await verify('Assigns case to moderator and records confidential internal investigation notes', async () => {
    const assignRes = await engine.assignCase(case1Id, 'mod_hamid_1');
    assert.ok(assignRes.success);
    assert.equal(assignRes.modCase?.assignedModeratorUid, 'mod_hamid_1');
    assert.equal(assignRes.modCase?.status, 'UNDER_REVIEW');

    const noteRes = await engine.addInvestigationNote(case1Id, 'mod_hamid_1', 'استعلام از سامانه معاملات نشان‌دهنده مغایرت قیمت است.');
    assert.ok(noteRes.success);

    const modCase = await store.getCaseById(case1Id);
    assert.equal(modCase?.internalInvestigationNotes.length, 1);
    assert.ok(modCase?.internalInvestigationNotes[0].noteFa.includes('استعلام'));
  });

  // Test 5: Risk assessment scoring and policy versioning
  await verify('Records evidence-based risk assessment with severity and policy versioning', async () => {
    const riskRes = await engine.recordRiskAssessment({
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      riskLevel: 'HIGH',
      dimensions: ['MISLEADING_DATA', 'FINANCIAL_HARM'],
      riskScore: 82,
      evidenceIdsConsidered: ['med_screenshot_1'],
      policyVersion: 'policy_v2.0',
      assessedByUid: 'mod_hamid_1',
      reasoningFa: 'ثبت قیمت ساختگی جهت فریب خریداران و اخلال در تخمین هدونیک',
    });

    assert.ok(riskRes.success);
    assert.ok(riskRes.assessment);
    assert.equal(riskRes.assessment.riskScore, 82);
    assert.equal(riskRes.assessment.policyVersion, 'policy_v2.0');
  });

  // Test 6: Enforcement request dispatched to owning module via adapter
  let decision1Id = '';
  await verify('Requests enforcement action and confirms execution via owning module adapter', async () => {
    const enfRes = await engine.requestEnforcement({
      caseId: case1Id,
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      actionType: 'CONTENT_REMOVAL_REQUEST',
      reasonFa: 'فایل به علت درج قیمت جعلی و گمراه‌کننده از انتشار خارج شد.',
      policyVersion: 'policy_v2.0',
      evidenceIds: ['med_screenshot_1'],
      issuingAuthorityUid: 'mod_hamid_1',
      isAppealEligible: true,
    });

    assert.ok(enfRes.success);
    assert.ok(enfRes.decision);
    assert.equal(enfRes.decision.executionStatus, 'APPLIED');
    assert.equal(adapter.dispatchedDecisions.length, 1);
    decision1Id = enfRes.decision.id;
  });

  // Test 7: Handling enforcement rejection by owning module
  await verify('Handles enforcement rejection when target module cannot apply sanction', async () => {
    adapter.setSimulateFailure(true);

    const failEnf = await engine.requestEnforcement({
      caseId: case1Id,
      targetType: 'LISTING',
      targetId: 'listing_fake_99',
      actionType: 'ACCOUNT_RESTRICTION_REQUEST',
      reasonFa: 'مسدودسازی حساب کاربر',
      policyVersion: 'policy_v2.0',
      evidenceIds: [],
      issuingAuthorityUid: 'mod_hamid_1',
    });

    assert.equal(failEnf.success, false);
    assert.equal(failEnf.decision?.executionStatus, 'FAILED');
    assert.ok(failEnf.errors?.[0].includes('رد کرد'));

    adapter.setSimulateFailure(false);
  });

  // Test 8: Appeal submission by affected user
  let appeal1Id = '';
  await verify('Affected user submits appeal with supporting evidence', async () => {
    const appealRes = await engine.submitAppeal({
      enforcementDecisionId: decision1Id,
      appellantUid: 'user_owner_listing_99',
      appealReasonFa: 'قیمت اعلامی در متن آگهی اشتباه تایپی بوده و مستندات مالکیت ارسال می‌گردد.',
      supportingEvidenceMediaIds: ['med_contract_doc_1'],
    });

    assert.ok(appealRes.success);
    assert.ok(appealRes.appeal);
    assert.equal(appealRes.appeal.status, 'SUBMITTED');
    appeal1Id = appealRes.appeal.id;
  });

  // Test 9: Strict separation of duties blocks original decider from reviewing appeal
  await verify('Strictly forbids original issuing authority from reviewing their own enforcement appeal', async () => {
    // mod_hamid_1 was the issuing authority of decision1
    const unauthReview = await engine.reviewAppeal({
      appealId: appeal1Id,
      reviewerUid: 'mod_hamid_1', // Self-review attempt!
      decision: 'ACCEPTED',
      reviewNotesFa: 'خودم تصمیمم را پس می‌گیرم',
    });

    assert.equal(unauthReview.success, false);
    assert.ok(unauthReview.errors?.[0].includes('SEPARATION_OF_DUTIES_VIOLATION'));
  });

  // Test 10: Independent moderator reviews appeal and reverses enforcement
  await verify('Independent reviewer accepts appeal and reverses enforcement action via adapter', async () => {
    const reviewRes = await engine.reviewAppeal({
      appealId: appeal1Id,
      reviewerUid: 'mod_supervisor_ali_2', // Independent senior moderator
      decision: 'ACCEPTED',
      reviewNotesFa: 'مستندات مالکیت و توضیحات اشتباه تایپی تایید شد. محدودیت رفع می‌گردد.',
    });

    assert.ok(reviewRes.success);
    assert.equal(reviewRes.appeal?.status, 'ACCEPTED');

    const decisionUpdated = await store.getEnforcementDecisionById(decision1Id);
    assert.equal(decisionUpdated?.executionStatus, 'REVERSED');
    assert.equal(adapter.reversedDecisions.length, 1);
  });

  // Test 11: Moderation case lifecycle transitions
  await verify('Transitions case through state machine to RESOLVED and CLOSED', async () => {
    const resRes = await engine.transitionCaseStatus(case1Id, 'RESOLVED', 'پرونده با رسیدگی به اعتراض مختومه شد.');
    assert.ok(resRes.success);
    assert.equal(resRes.modCase?.status, 'RESOLVED');

    const closeRes = await engine.transitionCaseStatus(case1Id, 'CLOSED');
    assert.ok(closeRes.success);
    assert.equal(closeRes.modCase?.status, 'CLOSED');

    // Invalid transition from CLOSED to RESOLVED directly
    const invalidTrans = await engine.transitionCaseStatus(case1Id, 'RESOLVED');
    assert.equal(invalidTrans.success, false);
    assert.ok(invalidTrans.errors?.[0].includes('غیرمجاز'));
  });

  // Test 12: Account Lifecycle GDPR reporter anonymization
  await verify('Account Lifecycle integration anonymizes reporter identity on data deletion requests', async () => {
    const anonRes = await store.anonymizeReporterData('user_reporter_1');
    assert.ok(anonRes.anonymizedCount >= 1);

    const postAnon = await store.getReportById(report1Id);
    assert.equal(postAnon?.reporterUid, 'ANONYMIZED_USER');
  });

  // Test 13: Express API routes integration
  await verify('Express API router mounts report submission, appeal, and case endpoints', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/trust-safety', createTrustSafetyRouter(engine));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/trust-safety`;

    try {
      // 1. POST /api/trust-safety/reports
      const postRes = await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-uid': 'cust_express_reporter',
        },
        body: JSON.stringify({
          targetType: 'PROFESSIONAL',
          targetId: 'pro_express_suspect',
          category: 'UNVERIFIED_CREDENTIALS',
          descriptionFa: 'مشاور بدون پروانه کسب خود را مدیر دفتر معرفی کرده است.',
        }),
      });
      assert.equal(postRes.status, 201);
      const postJson = (await postRes.json()) as any;
      assert.ok(postJson.ok);
      assert.ok(postJson.data.reportId);

      // 2. GET /api/trust-safety/my-reports
      const myRes = await fetch(`${baseUrl}/my-reports`, {
        headers: { 'x-test-uid': 'cust_express_reporter' },
      });
      assert.equal(myRes.status, 200);
      const myJson = (await myRes.json()) as any;
      assert.ok(myJson.ok);
      assert.ok(myJson.data.reports.length >= 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log(`\n🎉 ALL ${passed} EMPLOYEE 16 TRUST & SAFETY TESTS PASSED!`);
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});

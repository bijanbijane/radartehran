/**
 * @file tests/dispute-resolution-module.test.ts
 * @description Unit, integration, workflow, privacy, and fail-closed security tests (DR-A01..DR-A06)
 * for Employee 53 Dispute Resolution Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import type { DelegatedAdminStoreAdapter, FirebaseTokenVerifierAdapter } from '../server/modules/core';
import {
  createDisputeRouter,
  DisputeResolutionEngine,
  MemoryDisputeStore,
} from '../server/modules/dispute-resolution';

console.log('🧪 Running Employee 53 Dispute Resolution & Case Management Backend Tests...\n');

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

const mockTokenVerifier: FirebaseTokenVerifierAdapter = {
  verifyIdToken: async (token: string) => {
    if (token === 'tok_claimant_web_1') {
      return { uid: 'web_user_1', email: 'webuser1@radartehran.ir', email_verified: true };
    }
    if (token === 'tok_intruder_99_123456') {
      return { uid: 'intruder_user_2', email: 'intruder@radartehran.ir', email_verified: true };
    }
    if (token === 'tok_staff_mediator') {
      return { uid: 'staff_mediator_1', email: 'staff@radartehran.ir', email_verified: true };
    }
    if (token === 'tok_unverified_123456') {
      return { uid: 'unverified_9', email: 'u9@radartehran.ir', email_verified: false };
    }
    throw new Error('INVALID_TOKEN');
  },
};

const mockAdminStore: DelegatedAdminStoreAdapter = {
  getDelegatedAdminByUid: async (uid: string) =>
    uid === 'staff_mediator_1' ? { uid, role: 'delegated_admin', active: true } : null,
};

async function runAllTests() {
  const store = new MemoryDisputeStore();
  const engine = new DisputeResolutionEngine(store);

  let case1Id = '';
  let claim1Id = '';
  let proposal1Id = '';

  // Test 1: Case creation
  await verify('Creates dispute case, validates input, and enforces idempotency', async () => {
    const res = await engine.createDisputeCase('user_claimant_1', {
      category: 'DEPOSIT_REFUND',
      titleFa: 'عدم استرداد ودیعه اجاره در موعد تخلیه',
      descriptionFa: 'موجر پس از تحویل کلید و تخلیه ملک از استرداد کامل ودیعه استنکاف می‌ورزد.',
      respondentUid: 'user_respondent_1',
      propertyReferenceId: 'prop_apt_789',
      idempotencyKey: 'idem_case_test_001',
    });

    assert.ok(res.caseRecord.id);
    assert.equal(res.isExisting, false);
    assert.equal(res.caseRecord.status, 'SUBMITTED');
    case1Id = res.caseRecord.id;

    const dup = await engine.createDisputeCase('user_claimant_1', {
      category: 'DEPOSIT_REFUND',
      titleFa: 'عدم استرداد ودیعه اجاره در موعد تخلیه',
      descriptionFa: 'موجر پس از تحویل کلید و تخلیه ملک از استرداد کامل ودیعه استنکاف می‌ورزد.',
      respondentUid: 'user_respondent_1',
      idempotencyKey: 'idem_case_test_001',
    });
    assert.equal(dup.isExisting, true);
    assert.equal(dup.caseRecord.id, case1Id);
  });

  // Test 2: Validation rejection on self-dispute
  await verify('Rejects case creation where claimant equals respondent', async () => {
    await assert.rejects(
      async () => {
        await engine.createDisputeCase('user_same_1', {
          category: 'SALE_PURCHASE',
          titleFa: 'اختلاف فروش با خود',
          descriptionFa: 'شرح فرضی طولانی برای تست یکسان بودن طرفین اختلاف.',
          respondentUid: 'user_same_1',
        });
      },
      (err: any) => err.message.includes('SELF_DISPUTE_FORBIDDEN'),
    );
  });

  // Test 3: Add claim to case
  await verify('Allows claimant to submit structured claim with requested remedy and amount', async () => {
    const claim = await engine.addClaim('user_claimant_1', case1Id, {
      titleFa: 'مطالبه کل مبلغ ودیعه قرض‌الحسنه',
      factualAccountFa: 'ملک در تاریخ اول مهر تحویل شده و تسویه‌حساب صورت پذیرفته است.',
      requestedRemedyFa: 'واریز فوری مبلغ ودیعه به شماره حساب شاکی',
      claimedAmountRials: 500_000_000,
      currency: 'IRR',
    });
    assert.ok(claim.claimId);
    claim1Id = claim.claimId;

    await assert.rejects(
      async () => {
        await engine.addClaim('intruder_99', case1Id, {
          titleFa: 'ادعای غیرمجاز',
          factualAccountFa: 'شرح ادعای کاربر نامربوط به پرونده',
          requestedRemedyFa: 'غرامت',
        });
      },
      (err: any) => err.message.includes('FORBIDDEN_CLAIM_CREATION'),
    );
  });

  // Test 4: Submit response to claim
  await verify('Allows respondent to submit stance and response statement', async () => {
    const resp = await engine.submitClaimResponse('user_respondent_1', claim1Id, {
      stance: 'PARTIALLY_ADMITTED',
      statementFa: 'مبلغ ودیعه مورد قبول است اما هزینه تعمیرات کسر خواهد شد.',
    });
    assert.equal(resp.stance, 'PARTIALLY_ADMITTED');

    await assert.rejects(
      async () => {
        await engine.submitClaimResponse('stranger_33', claim1Id, {
          stance: 'DENIED',
          statementFa: 'پاسخ نامربوط',
        });
      },
      (err: any) => err.message.includes('FORBIDDEN_RESPONSE'),
    );
  });

  // Test 5: Evidence confidentiality filtering
  await verify('Attaches evidence and enforces privacy confidentiality filtering', async () => {
    const pubEv = await engine.attachEvidence('user_claimant_1', case1Id, {
      evidenceType: 'CONTRACT',
      descriptionFa: 'قرارداد اجاره نامه رسمی با کد رهگیری',
      sourceMediaId: 'media_lease_contract_pdf',
      confidentiality: 'PARTIES_VISIBLE',
    });
    await engine.attachEvidence('user_claimant_1', case1Id, {
      evidenceType: 'MESSAGES',
      descriptionFa: 'مکاتبات خصوصی حساس جهت اطلاع میانجی‌گر',
      sourceMediaId: 'media_private_chat_png',
      confidentiality: 'MEDIATOR_ONLY',
    });

    const partyView = await engine.getCaseSummary('user_respondent_1', case1Id, false);
    assert.equal(partyView.evidence.length, 1);
    assert.equal(partyView.evidence[0].evidenceId, pubEv.evidenceId);

    const staffView = await engine.getCaseSummary('staff_user', case1Id, true);
    assert.equal(staffView.evidence.length, 2);
  });

  // Test 6: Mediation session
  await verify('Schedules mediation session and strictly hides mediator private notes from parties', async () => {
    const session = await engine.scheduleMediationSession('mediator_99', case1Id, {
      scheduledAtIso: '2026-12-01T10:00:00Z',
      agendaFa: 'بررسی هزینه‌های ادعایی نقاشی و زمان‌بندی تسویه',
      mediatorPrivateNotesFa: 'شاکی مصالحه‌پذیر است.',
    });
    assert.ok(session.sessionId);

    const partySummary = await engine.getCaseSummary('user_claimant_1', case1Id, false);
    assert.equal(partySummary.sessions[0].mediatorPrivateNotesFa, undefined);

    const mediatorSummary = await engine.getCaseSummary('mediator_99', case1Id, true);
    assert.ok(mediatorSummary.sessions[0].mediatorPrivateNotesFa);
  });

  // Test 7: Negotiation proposal & bilateral acceptance
  await verify('Creates negotiation proposal and triggers bilateral settlement agreement upon dual signatures', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const proposal = await engine.createNegotiationProposal('user_respondent_1', case1Id, {
      proposalTermsFa: 'موجر مبلغ ۴۷۰ میلیون ریال را ظرف ۴۸ ساعت واریز می‌نماید.',
      proposedFinancialRemedyRials: 470_000_000,
      validUntilIso: futureDate,
    });
    proposal1Id = proposal.proposalId;

    const outcome = await engine.acceptProposal('user_claimant_1', proposal1Id);
    assert.equal(outcome.proposal.status, 'ACCEPTED');
    assert.equal(outcome.settlementAgreement?.status, 'SIGNED');
    assert.equal((await store.getCaseById(case1Id))?.status, 'SETTLEMENT_ACCEPTED');
  });

  // Test 8: State machine transitions & unauthorized actor block
  await verify('Validates state machine transitions, blocks unauthorized strangers, and blocks illegal state jumps', async () => {
    await assert.rejects(
      async () => {
        await engine.transitionCaseStatus('stranger_attacker', case1Id, 'RESOLVED', 'تغییر وضعیت غیرمجاز');
      },
      (err: any) => err.message.includes('FORBIDDEN_CASE_TRANSITION'),
    );

    await assert.rejects(
      async () => {
        await engine.transitionCaseStatus('admin_1', case1Id, 'DRAFT', 'پرش غیرمجاز به پیش‌نویس', true);
      },
      (err: any) => err.message.includes('TRANSITION_FORBIDDEN'),
    );

    const resolvedCase = await engine.transitionCaseStatus('admin_1', case1Id, 'RESOLVED', 'تعهدات ایفا شد.', true);
    assert.equal(resolvedCase.status, 'RESOLVED');
  });

  // Test 9: Resolution outcome recording + unauthorized guard
  await verify('Records final resolution outcome with resolver authorization and blocks plain parties/strangers', async () => {
    await assert.rejects(
      async () => {
        await engine.recordResolutionOutcome('user_claimant_1', case1Id, {
          outcomeType: 'AGREEMENT_REACHED',
          explanationFa: 'تلاش برای ثبت نتیجه بدون نقش ناظر',
        });
      },
      (err: any) => err.message.includes('FORBIDDEN_RESOLUTION'),
    );

    const closed = await engine.recordResolutionOutcome(
      'admin_1',
      case1Id,
      {
        outcomeType: 'AGREEMENT_REACHED',
        explanationFa: 'مبلغ توافق‌شده واریز گردید و پرونده مختومه شد.',
      },
      true,
    );
    assert.equal(closed.status, 'RESOLVED');
    assert.equal(closed.resolutionOutcome?.outcomeType, 'AGREEMENT_REACHED');
  });

  // Test 10: Timeline
  await verify('Records append-only chronological timeline events', async () => {
    const timeline = await store.getTimelineForCase(case1Id);
    assert.ok(timeline.length >= 6);
  });

  // Test 11: Export & GDPR anonymization
  await verify('Supports GDPR data export and privacy anonymization', async () => {
    const exported = await store.exportPartyDisputes('user_claimant_1');
    assert.equal(exported.cases.length, 1);

    const anon = await store.anonymizePartyData('user_claimant_1');
    assert.ok(anon.anonymizedCount >= 1);
    const postAnon = await store.getCaseById(case1Id);
    assert.equal(postAnon?.claimantUid, 'ANONYMIZED_USER');
  });

  // Test 12: DR-A01..DR-A06 Fail-Closed Security & IDOR Router Integration
  await verify('DR-A01..DR-A06 Dispute router enforces fail-closed auth, ignores x-test-* headers, blocks IDOR on timeline/cases, and authorizes verified staff', async () => {
    // DR-A01: No verifier fails closed with 503
    const appNoVerifier = express();
    appNoVerifier.use(express.json());
    appNoVerifier.use('/api/disputes', createDisputeRouter(engine, store));
    const srvNoVerifier = http.createServer(appNoVerifier);
    await new Promise<void>((resolve) => srvNoVerifier.listen(0, resolve));
    const portNoVerifier = (srvNoVerifier.address() as any).port;
    try {
      const res503 = await fetch(`http://127.0.0.1:${portNoVerifier}/api/disputes/my-cases`, {
        headers: { 'x-test-uid': 'web_user_1', 'x-test-role': 'admin' },
      });
      assert.equal(res503.status, 503);
    } finally {
      await new Promise<void>((resolve) => srvNoVerifier.close(() => resolve()));
    }

    const app = express();
    app.use(express.json());
    app.use('/api/disputes', createDisputeRouter(engine, store, mockTokenVerifier, { adminStore: mockAdminStore }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/disputes`;

    try {
      // DR-A02: Custom x-test-* headers without Bearer token rejected with 401
      const noTokenRes = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-uid': 'web_user_1', 'x-test-role': 'verified_user' },
        body: JSON.stringify({
          category: 'PROPERTY_DEFECT',
          titleFa: 'درخواست بدون توکن',
          descriptionFa: 'نباید بدون توکن فایربیس ایجاد شود.',
          respondentUid: 'web_seller_1',
        }),
      });
      assert.equal(noTokenRes.status, 401);

      // DR-A03: Valid Bearer creates case, lists /my-cases, views /cases/:id and /cases/:id/timeline
      const postRes = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_claimant_web_1' },
        body: JSON.stringify({
          category: 'PROPERTY_DEFECT',
          titleFa: 'معایب اساسی لوله‌کشی و تأسیسات',
          descriptionFa: 'پس از انعقاد قرارداد مشخص شد لوله‌کشی دچار ترکیدگی پنهان بوده است.',
          respondentUid: 'web_seller_1',
        }),
      });
      assert.equal(postRes.status, 201);
      const postJson = await postRes.json();
      const newCaseId = postJson.data.caseId;

      const listRes = await fetch(`${baseUrl}/my-cases`, {
        headers: { Authorization: 'Bearer tok_claimant_web_1' },
      });
      assert.equal(listRes.status, 200);
      const listJson = await listRes.json();
      assert.ok(listJson.data.cases.some((c: any) => c.id === newCaseId));

      const getRes = await fetch(`${baseUrl}/cases/${newCaseId}`, {
        headers: { Authorization: 'Bearer tok_claimant_web_1' },
      });
      assert.equal(getRes.status, 200);

      const timeRes = await fetch(`${baseUrl}/cases/${newCaseId}/timeline`, {
        headers: { Authorization: 'Bearer tok_claimant_web_1' },
      });
      assert.equal(timeRes.status, 200);

      // DR-A04: Intruder cannot view case or timeline even when passing x-test-role: admin
      const intruderCaseRes = await fetch(`${baseUrl}/cases/${newCaseId}`, {
        headers: { Authorization: 'Bearer tok_intruder_99_123456', 'x-test-role': 'admin' },
      });
      assert.equal(intruderCaseRes.status, 403);

      const intruderTimelineRes = await fetch(`${baseUrl}/cases/${newCaseId}/timeline`, {
        headers: { Authorization: 'Bearer tok_intruder_99_123456', 'x-test-role': 'admin' },
      });
      assert.equal(intruderTimelineRes.status, 403);

      // DR-A05: Non-party cannot transition or resolve case
      const intruderTransition = await fetch(`${baseUrl}/cases/${newCaseId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok_intruder_99_123456',
          'x-test-role': 'mediator',
        },
        body: JSON.stringify({ targetStatus: 'UNDER_REVIEW', reasonFa: 'تلاش غیرمجاز' }),
      });
      assert.equal(intruderTransition.status, 403);

      const claimantResolveAttempt = await fetch(`${baseUrl}/cases/${newCaseId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_claimant_web_1' },
        body: JSON.stringify({ outcomeType: 'AGREEMENT_REACHED', explanationFa: 'شاکی نباید راساً مختومه کند' }),
      });
      assert.equal(claimantResolveAttempt.status, 403);

      // DR-A06: Delegated staff mediator can inspect timeline and resolve case
      const staffTimelineRes = await fetch(`${baseUrl}/cases/${newCaseId}/timeline`, {
        headers: { Authorization: 'Bearer tok_staff_mediator' },
      });
      assert.equal(staffTimelineRes.status, 200);

      const staffResolveRes = await fetch(`${baseUrl}/cases/${newCaseId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_staff_mediator' },
        body: JSON.stringify({ outcomeType: 'AGREEMENT_REACHED', explanationFa: 'مختومه توسط ناظر تاییدشده.' }),
      });
      assert.equal(staffResolveRes.status, 200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log(`\n🎉 All ${passed} Dispute Resolution & Case Management tests passed successfully!\n`);
}

runAllTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

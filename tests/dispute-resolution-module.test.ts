/**
 * @file tests/dispute-resolution-module.test.ts
 * @description Unit, integration, workflow, privacy, and API tests for Employee 53 Dispute Resolution Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
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

async function runAllTests() {
  const store = new MemoryDisputeStore();
  const engine = new DisputeResolutionEngine(store);

  let case1Id = '';
  let claim1Id = '';
  let proposal1Id = '';

  // Test 1: Case creation with validation and idempotency
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
    assert.equal(res.caseRecord.category, 'DEPOSIT_REFUND');
    case1Id = res.caseRecord.id;

    // Idempotent duplicate call returns same case
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
      (err: any) => {
        assert.ok(err.message.includes('SELF_DISPUTE_FORBIDDEN'));
        return true;
      },
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
    assert.equal(claim.status, 'PENDING_RESPONSE');
    assert.equal(claim.claimedAmountRials, 500_000_000);
    claim1Id = claim.claimId;

    // Forbidden if non-claimant tries to add claim
    await assert.rejects(
      async () => {
        await engine.addClaim('intruder_99', case1Id, {
          titleFa: 'ادعای غیرمجاز',
          factualAccountFa: 'شرح ادعای کاربر نامربوط به پرونده',
          requestedRemedyFa: 'غرامت',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('FORBIDDEN_CLAIM_CREATION'));
        return true;
      },
    );
  });

  // Test 4: Submit response to claim
  await verify('Allows respondent to submit stance and response statement', async () => {
    const resp = await engine.submitClaimResponse('user_respondent_1', claim1Id, {
      stance: 'PARTIALLY_ADMITTED',
      statementFa: 'مبلغ ودیعه مورد قبول است اما هزینه تعمیرات نقاشی و کلید به مبلغ ۵۰ میلیون ریال کسر خواهد شد.',
    });

    assert.ok(resp.responseId);
    assert.equal(resp.stance, 'PARTIALLY_ADMITTED');

    // Forbidden if another user tries to respond
    await assert.rejects(
      async () => {
        await engine.submitClaimResponse('stranger_33', claim1Id, {
          stance: 'DENIED',
          statementFa: 'پاسخ نامربوط',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('FORBIDDEN_RESPONSE'));
        return true;
      },
    );
  });

  // Test 5: Evidence attachment and privacy confidentiality
  await verify('Attaches evidence and enforces privacy confidentiality filtering', async () => {
    // 1. Party visible evidence
    const pubEv = await engine.attachEvidence('user_claimant_1', case1Id, {
      evidenceType: 'CONTRACT',
      descriptionFa: 'قرارداد اجاره نامه رسمی با کد رهگیری',
      sourceMediaId: 'media_lease_contract_pdf',
      confidentiality: 'PARTIES_VISIBLE',
    });
    assert.ok(pubEv.evidenceId);

    // 2. Mediator only confidential evidence
    const privEv = await engine.attachEvidence('user_claimant_1', case1Id, {
      evidenceType: 'MESSAGES',
      descriptionFa: 'مکاتبات خصوصی حساس جهت اطلاع میانجی‌گر',
      sourceMediaId: 'media_private_chat_png',
      confidentiality: 'MEDIATOR_ONLY',
    });
    assert.ok(privEv.evidenceId);

    // Party view should only see PARTIES_VISIBLE
    const partyView = await engine.getCaseSummary('user_respondent_1', case1Id, false);
    assert.equal(partyView.evidence.length, 1);
    assert.equal(partyView.evidence[0].evidenceId, pubEv.evidenceId);

    // Staff/mediator view sees all evidence
    const staffView = await engine.getCaseSummary('staff_user', case1Id, true);
    assert.equal(staffView.evidence.length, 2);
  });

  // Test 6: Mediation session and private notes privacy
  await verify('Schedules mediation session and strictly hides mediator private notes from parties', async () => {
    const session = await engine.scheduleMediationSession('mediator_99', case1Id, {
      scheduledAtIso: '2026-12-01T10:00:00Z',
      agendaFa: 'بررسی هزینه‌های ادعایی نقاشی و زمان‌بندی تسویه',
      mediatorPrivateNotesFa: 'شاکی به نظر مصالحه‌پذیر می‌رسد اگر ۲۰ میلیون تخفیف نقاشی بپذیرد.',
    });
    assert.ok(session.sessionId);

    // Party summary has mediatorPrivateNotesFa scrubbed
    const partySummary = await engine.getCaseSummary('user_claimant_1', case1Id, false);
    assert.equal(partySummary.sessions[0].mediatorPrivateNotesFa, undefined);

    // Mediator view preserves private notes
    const mediatorSummary = await engine.getCaseSummary('mediator_99', case1Id, true);
    assert.ok(mediatorSummary.sessions[0].mediatorPrivateNotesFa);
  });

  // Test 7: Negotiation proposal and bilateral acceptance
  await verify('Creates negotiation proposal and triggers bilateral settlement agreement upon dual signatures', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const proposal = await engine.createNegotiationProposal('user_respondent_1', case1Id, {
      proposalTermsFa: 'موجر مبلغ ۴۷۰ میلیون ریال را ظرف ۴۸ ساعت به حساب مستأجر واریز و طرفین اعلام برائت ذمه می‌نمایند.',
      proposedFinancialRemedyRials: 470_000_000,
      validUntilIso: futureDate,
    });
    assert.ok(proposal.proposalId);
    assert.equal(proposal.status, 'PROPOSED');
    proposal1Id = proposal.proposalId;

    // Claimant accepts proposal
    const outcome = await engine.acceptProposal('user_claimant_1', proposal1Id);
    assert.equal(outcome.proposal.status, 'ACCEPTED');
    assert.ok(outcome.settlementAgreement);
    assert.equal(outcome.settlementAgreement.status, 'SIGNED');
    assert.equal(outcome.settlementAgreement.partyAcceptances.length, 2);
    assert.ok(outcome.settlementAgreement.partyAcceptances[0].signatureHash);
    assert.ok(outcome.settlementAgreement.partyAcceptances[1].signatureHash);

    // Case status should now be SETTLEMENT_ACCEPTED
    const updatedCase = await store.getCaseById(case1Id);
    assert.equal(updatedCase?.status, 'SETTLEMENT_ACCEPTED');
  });

  // Test 8: State machine transitions and validations
  await verify('Validates state machine transitions and blocks illegal state jumps', async () => {
    // Cannot transition directly from SETTLEMENT_ACCEPTED to DRAFT
    await assert.rejects(
      async () => {
        await engine.transitionCaseStatus('admin_1', case1Id, 'DRAFT', 'پرش غیرمجاز به پیش‌نویس');
      },
      (err: any) => {
        assert.ok(err.message.includes('TRANSITION_FORBIDDEN'));
        return true;
      },
    );

    // Valid transition from SETTLEMENT_ACCEPTED to RESOLVED
    const resolvedCase = await engine.transitionCaseStatus('admin_1', case1Id, 'RESOLVED', 'تعهدات مالی توافق‌نامه ایفا گردید.');
    assert.equal(resolvedCase.status, 'RESOLVED');
  });

  // Test 9: Resolution outcome recording
  await verify('Records final resolution outcome and closes dispute', async () => {
    const closed = await engine.recordResolutionOutcome('admin_1', case1Id, {
      outcomeType: 'AGREEMENT_REACHED',
      explanationFa: 'مبلغ توافق‌شده واریز گردید و پرونده با رضایت طرفین مختومه شد.',
    });
    assert.equal(closed.status, 'RESOLVED');
    assert.equal(closed.resolutionOutcome?.outcomeType, 'AGREEMENT_REACHED');
  });

  // Test 10: Timeline event recording
  await verify('Records append-only chronological timeline events', async () => {
    const timeline = await store.getTimelineForCase(case1Id);
    assert.ok(timeline.length >= 6);
    const eventTypes = timeline.map((e) => e.eventType);
    assert.ok(eventTypes.includes('CASE_CREATED'));
    assert.ok(eventTypes.includes('CLAIM_ADDED'));
    assert.ok(eventTypes.includes('RESPONSE_SUBMITTED'));
    assert.ok(eventTypes.includes('EVIDENCE_ATTACHED'));
    assert.ok(eventTypes.includes('PROPOSAL_MADE'));
    assert.ok(eventTypes.includes('SETTLEMENT_ACCEPTED'));
  });

  // Test 11: Data Export and Anonymization
  await verify('Supports GDPR data export and privacy anonymization', async () => {
    const exported = await store.exportPartyDisputes('user_claimant_1');
    assert.equal(exported.cases.length, 1);
    assert.equal(exported.claims.length, 1);
    assert.equal(exported.agreements.length, 1);

    const anon = await store.anonymizePartyData('user_claimant_1');
    assert.ok(anon.anonymizedCount >= 1);
    const postAnon = await store.getCaseById(case1Id);
    assert.equal(postAnon?.claimantUid, 'ANONYMIZED_USER');
  });

  // Test 12 & 13: Express API Integration
  await verify('Dispute Express router handles HTTP endpoints properly', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/disputes', createDisputeRouter(engine, store));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/disputes`;

    try {
      // 1. POST /cases
      const postRes = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-uid': 'web_user_1', 'x-test-role': 'verified_user' },
        body: JSON.stringify({
          category: 'PROPERTY_DEFECT',
          titleFa: 'معایب اساسی لوله‌کشی و تأسیسات',
          descriptionFa: 'پس از انعقاد قرارداد مشخص شد لوله‌کشی دچار ترکیدگی پنهان بوده است.',
          respondentUid: 'web_seller_1',
        }),
      });
      assert.equal(postRes.status, 201);
      const postJson = await postRes.json();
      assert.ok(postJson.ok);
      const newCaseId = postJson.data.caseId;

      // 2. GET /my-cases
      const listRes = await fetch(`${baseUrl}/my-cases`, {
        headers: { 'x-test-uid': 'web_user_1', 'x-test-role': 'verified_user' },
      });
      assert.equal(listRes.status, 200);
      const listJson = await listRes.json();
      assert.ok(listJson.ok);
      assert.ok(listJson.data.cases.some((c: any) => c.id === newCaseId));

      // 3. GET /cases/:caseId
      const getRes = await fetch(`${baseUrl}/cases/${newCaseId}`, {
        headers: { 'x-test-uid': 'web_user_1', 'x-test-role': 'verified_user' },
      });
      assert.equal(getRes.status, 200);
      const getJson = await getRes.json();
      assert.ok(getJson.ok);
      assert.equal(getJson.data.caseRecord.id, newCaseId);

      // 4. GET /cases/:caseId/timeline
      const timeRes = await fetch(`${baseUrl}/cases/${newCaseId}/timeline`, {
        headers: { 'x-test-uid': 'web_user_1', 'x-test-role': 'verified_user' },
      });
      assert.equal(timeRes.status, 200);
      const timeJson = await timeRes.json();
      assert.ok(timeJson.ok);
      assert.ok(timeJson.data.timeline.length >= 1);
    } finally {
      server.close();
    }
  });

  console.log(`\n🎉 All ${passed} Dispute Resolution & Case Management tests passed successfully!\n`);
}

runAllTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

/**
 * @fileoverview Comprehensive Verification Suite for Employee 4 — Crowd Claims and Market Observations Backend
 * (`server/modules/crowd-data/crowdData.test.ts`).
 *
 * Covers:
 * 1. Claim ownership & provenance preservation
 * 2. Moderation workflow, state transitions, and audit history
 * 3. Duplicate claim detection
 * 4. Epistemic firewall between Crowd Claims and Market Observations
 * 5. Market observation validation, anomaly quarantine, and safe aggregation (zero synthetic data)
 * 6. Invalid neighborhood and cross-city reference rejection
 * 7. Concurrent updates & optimistic concurrency control (CAS revision)
 */

import assert from 'node:assert/strict';
import {
  CROWD_DATA_PROVENANCE_MODEL,
  CrowdDataDomainError,
  createCrowdDataModuleFacade,
  type ActorContext,
} from './index';

const USER_ALICE: ActorContext = { uid: 'user_alice_01', isAdmin: false, sessionId: 'sess_alice' };
const USER_BOB: ActorContext = { uid: 'user_bob_02', isAdmin: false, sessionId: 'sess_bob' };
const ADMIN_MOD: ActorContext = { uid: 'admin_moderator_01', isAdmin: true, sessionId: 'sess_mod' };
const FIXED_NOW_MS = Date.parse('2026-05-10T10:00:00.000Z');

async function runTests(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Claim Ownership, Provenance, Evidence & Audit History
  // -------------------------------------------------------------------------
  {
    const { crowdClaims } = createCrowdDataModuleFacade();
    const claim = await crowdClaims.submitClaim(
      USER_ALICE,
      {
        cityId: 'tehran',
        hoodId: 1,
        streetName: 'خیابان فرشته، الهیه',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 340,
        sqm: 140,
        narrativeFa: 'قرارداد فروش واحد ۱۴۰ متری در خیابان فرشته با سند تک برگ ثبت شد.',
        submissionChannel: 'WEB_APP',
        evidenceRefs: [
          {
            type: 'REDACTED_CONTRACT_IMAGE',
            storageObjectKey: 'claims/2026/05/contract_fereshteh_140.jpg',
            sha256Digest: 'a'.repeat(64),
            descriptionFa: 'تصویر مبایعه‌نامه با حذف اطلاعات هویتی طرفین',
          },
        ],
      },
      FIXED_NOW_MS
    );

    assert.equal(claim.epistemicClass, 'UNVERIFIED_CROWD_CLAIM');
    assert.equal(claim.authoritativeDataEligible, false);
    assert.equal(claim.state, 'SUBMITTED');
    assert.equal(claim.provenance.authorUid, USER_ALICE.uid);
    assert.equal(claim.provenance.submissionChannel, 'WEB_APP');
    assert.equal(claim.evidenceRefs.length, 1);
    assert.equal(claim.revision, 1);
    assert.equal(claim.auditHistory.length, 1);
    assert.equal(claim.auditHistory[0].eventType, 'CLAIM_SUBMITTED');

    // Non-owner (Bob) cannot edit Alice's claim
    await assert.rejects(
      () =>
        crowdClaims.updateOwnClaim(USER_BOB, {
          claimId: claim.claimId,
          narrativeFa: 'تلاش کاربر غیرمالک برای تغییر متن گزارش ثبت‌شده در فرشته.',
        }),
      (err: unknown) => err instanceof CrowdDataDomainError && err.code === 'FORBIDDEN_NOT_OWNER'
    );

    // Non-owner (Bob) cannot withdraw Alice's claim
    await assert.rejects(
      () => crowdClaims.withdrawOwnClaim(USER_BOB, claim.claimId, 'Unauthorized withdrawal'),
      (err: unknown) => err instanceof CrowdDataDomainError && err.code === 'FORBIDDEN_NOT_OWNER'
    );

    // Owner (Alice) can update her own claim
    const updated = await crowdClaims.updateOwnClaim(
      USER_ALICE,
      {
        claimId: claim.claimId,
        expectedRevision: 1,
        narrativeFa: 'قرارداد قطعی واحد ۱۴۰ متری طبقه سوم در خیابان فرشته الهیه ثبت شد.',
      },
      FIXED_NOW_MS + 5_000
    );
    assert.equal(updated.revision, 2);
    assert.equal(updated.auditHistory.length, 2);
    assert.equal(updated.auditHistory[1].eventType, 'CLAIM_UPDATED_BY_OWNER');
  }

  // -------------------------------------------------------------------------
  // 2. Moderation Workflow, Accepted/Rejected/Disputed States & Conflict Guards
  // -------------------------------------------------------------------------
  {
    const { crowdClaims } = createCrowdDataModuleFacade();
    const claim = await crowdClaims.submitClaim(
      USER_ALICE,
      {
        cityId: 'karaj',
        hoodId: 101,
        streetName: 'عظیمیه، میدان مهران',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 118,
        narrativeFa: 'معامله آپارتمان ۱۱۵ متری در میدان مهران عظیمیه کرج انجام شد.',
      },
      FIXED_NOW_MS
    );

    // Regular user cannot moderate
    await assert.rejects(
      () =>
        crowdClaims.moderateClaim(USER_BOB, {
          claimId: claim.claimId,
          targetState: 'ACCEPTED',
          reason: 'Trying to approve without admin privileges',
        }),
      (err: unknown) => err instanceof CrowdDataDomainError && err.code === 'FORBIDDEN_ADMIN_REQUIRED'
    );

    // Admin moves to UNDER_REVIEW -> ACCEPTED
    const inReview = await crowdClaims.moderateClaim(
      ADMIN_MOD,
      {
        claimId: claim.claimId,
        targetState: 'UNDER_REVIEW',
        reason: 'Entering moderator queue for document cross-check',
      },
      FIXED_NOW_MS + 1_000
    );
    assert.equal(inReview.state, 'UNDER_REVIEW');

    const accepted = await crowdClaims.moderateClaim(
      ADMIN_MOD,
      {
        claimId: claim.claimId,
        targetState: 'ACCEPTED',
        reason: 'Verified against local field survey range for Azimiyeh',
      },
      FIXED_NOW_MS + 2_000
    );
    assert.equal(accepted.state, 'ACCEPTED');
    assert.equal(accepted.epistemicClass, 'MODERATED_CROWD_CLAIM');
    assert.equal(accepted.authoritativeDataEligible, false);

    // Community member Bob disputes the accepted claim
    const disputed = await crowdClaims.disputeClaim(
      USER_BOB,
      claim.claimId,
      'قیمت اعلام‌شده مربوط به واحد تجاری است نه مسکونی.',
      accepted.revision,
      FIXED_NOW_MS + 3_000
    );
    assert.equal(disputed.state, 'DISPUTED');
    assert.equal(disputed.epistemicClass, 'UNVERIFIED_CROWD_CLAIM');
    assert.equal(disputed.disputeCount, 1);

    // Moderator rejects after dispute review
    const rejected = await crowdClaims.moderateClaim(
      ADMIN_MOD,
      {
        claimId: claim.claimId,
        targetState: 'REJECTED',
        reason: 'Confirmed unit was commercial zoning; rejected for residential claim feed.',
      },
      FIXED_NOW_MS + 4_000
    );
    assert.equal(rejected.state, 'REJECTED');
    assert.equal(rejected.auditHistory.length, 5);
  }

  // -------------------------------------------------------------------------
  // 3. Duplicate Claim Detection
  // -------------------------------------------------------------------------
  {
    const { crowdClaims } = createCrowdDataModuleFacade();
    const first = await crowdClaims.submitClaim(
      USER_ALICE,
      {
        cityId: 'mashhad',
        hoodId: 201,
        streetName: 'بلوار سجاد، خیابان حامد جنوبی',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 136,
        narrativeFa: 'فروش آپارتمان ۱۲۰ متری نوساز در خیابان حامد جنوبی بلوار سجاد مشهد.',
      },
      FIXED_NOW_MS
    );
    assert.equal(first.duplicateCheck.isDuplicate, false);

    const duplicateSub = await crowdClaims.submitClaim(
      USER_BOB,
      {
        cityId: 'mashhad',
        hoodId: 201,
        streetName: 'بلوار سجاد خیابان حامد جنوبی',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 136.5,
        narrativeFa: 'فروش آپارتمان ۱۲۰ متری نوساز در خیابان حامد جنوبی بلوار سجاد مشهد.',
      },
      FIXED_NOW_MS + 1_000
    );
    assert.equal(duplicateSub.duplicateCheck.isDuplicate, true);
    assert.equal(duplicateSub.duplicateCheck.primaryDuplicateClaimId, first.claimId);
    assert.equal(duplicateSub.duplicateCheck.matches[0].classification, 'CONFIRMED_DUPLICATE');
  }

  // -------------------------------------------------------------------------
  // 4. Invalid Neighborhood References & Cross-City Scope Rejection
  // -------------------------------------------------------------------------
  {
    const { crowdClaims, marketObservations } = createCrowdDataModuleFacade();

    // Non-existent neighborhood ID
    await assert.rejects(
      () =>
        crowdClaims.submitClaim(USER_ALICE, {
          cityId: 'tehran',
          hoodId: 9999,
          streetName: 'خیابان ولیعصر',
          category: 'DEAL_PRICE_REPORT',
          assertedBuyPerSqmMillionToman: 150,
          narrativeFa: 'گزارش قیمت در محله نامعتبر برای تست اعتبارسنجی.',
        }),
      (err: unknown) =>
        err instanceof CrowdDataDomainError && err.code === 'INVALID_NEIGHBORHOOD_REFERENCE'
    );

    // Cross-city mismatch: hoodId 101 belongs to Karaj, not Tehran
    await assert.rejects(
      () =>
        marketObservations.submitObservation(USER_ALICE, {
          cityId: 'tehran',
          hoodId: 101,
          streetName: 'میدان مهران',
          dealType: 'BUY',
          sqm: 110,
          pricePerSqmMillionToman: 115,
          sourceType: 'VETTED_MARKET_FEED',
          externalReferenceId: 'feed_krj_101',
          observedAtIso: new Date(FIXED_NOW_MS - 3_600_000).toISOString(),
        }),
      (err: unknown) => err instanceof CrowdDataDomainError && err.code === 'CITY_NEIGHBORHOOD_MISMATCH'
    );
  }

  // -------------------------------------------------------------------------
  // 5. Epistemic Firewall, Observation Validation & Safe Aggregation (Zero Synthetic Data)
  // -------------------------------------------------------------------------
  {
    const { crowdClaims, marketObservations } = createCrowdDataModuleFacade();

    const userClaim = await crowdClaims.submitClaim(
      USER_ALICE,
      {
        cityId: 'isfahan',
        hoodId: 301,
        streetName: 'مرداویج، خیابان فارابی شمالی',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 146,
        narrativeFa: 'گزارش مردمی معامله در مرداویج اصفهان خیابان فارابی شمالی.',
      },
      FIXED_NOW_MS
    );

    // Attempting to convert a crowd claim into a market observation MUST fail closed
    await assert.rejects(
      () =>
        marketObservations.submitObservation(
          ADMIN_MOD,
          {
            cityId: 'isfahan',
            hoodId: 301,
            streetName: 'خیابان فارابی شمالی',
            dealType: 'BUY',
            sqm: 120,
            pricePerSqmMillionToman: 146,
            sourceType: 'USER_REPORTED_RAW',
            externalReferenceId: userClaim.claimId,
            sourceClaimId: userClaim.claimId,
            observedAtIso: new Date(FIXED_NOW_MS).toISOString(),
          },
          FIXED_NOW_MS
        ),
      (err: unknown) =>
        err instanceof CrowdDataDomainError && err.code === 'EPISTEMIC_FIREWALL_VIOLATION'
    );

    // Submit 1 raw observation and 1 anomalous (unit mismatch) observation in Isfahan 301
    const rawObs = await marketObservations.submitObservation(
      USER_ALICE,
      {
        cityId: 'isfahan',
        hoodId: 301,
        streetName: 'خیابان فارابی شمالی',
        dealType: 'BUY',
        sqm: 130,
        pricePerSqmMillionToman: 144,
        sourceType: 'OFFICIAL_DEED_REGISTRY',
        externalReferenceId: 'deed_isf_301_001',
        observedAtIso: new Date(FIXED_NOW_MS - 7_200_000).toISOString(),
      },
      FIXED_NOW_MS
    );
    assert.equal(rawObs.verificationState, 'RAW_UNVERIFIED');
    assert.equal(rawObs.epistemicClass, 'RAW_MARKET_OBSERVATION');

    const anomalousObs = await marketObservations.submitObservation(
      USER_ALICE,
      {
        cityId: 'isfahan',
        hoodId: 301,
        streetName: 'خیابان ملاصدرا',
        dealType: 'BUY',
        sqm: 100,
        pricePerSqmMillionToman: 145_000_000, // Unit scale error (Toman instead of Million Toman)
        sourceType: 'USER_REPORTED_RAW',
        externalReferenceId: 'raw_isf_301_bad_scale',
        observedAtIso: new Date(FIXED_NOW_MS - 3_600_000).toISOString(),
      },
      FIXED_NOW_MS
    );
    assert.equal(anomalousObs.verificationState, 'QUARANTINED');

    // Before verification: aggregation must return null derivedMetrics and NEVER synthesize data
    const preVerifyAgg = await marketObservations.aggregateVerifiedMarketObservations(
      'isfahan',
      301,
      FIXED_NOW_MS
    );
    assert.equal(preVerifyAgg.rawObservationCount, 1);
    assert.equal(preVerifyAgg.quarantinedObservationCount, 1);
    assert.equal(preVerifyAgg.verifiedActiveObservationCount, 0);
    assert.equal(preVerifyAgg.status, 'INSUFFICIENT_VERIFIED_OBSERVATIONS');
    assert.equal(preVerifyAgg.syntheticFallbackUsed, false);
    assert.equal(preVerifyAgg.derivedMetrics, null);

    // Verify 2 valid observations and re-aggregate
    const rawObs2 = await marketObservations.submitObservation(
      USER_BOB,
      {
        cityId: 'isfahan',
        hoodId: 301,
        streetName: 'چهارباغ بالا',
        dealType: 'BUY',
        sqm: 115,
        pricePerSqmMillionToman: 148,
        sourceType: 'VERIFIED_ESCROW_CONTRACT',
        externalReferenceId: 'escrow_isf_301_002',
        observedAtIso: new Date(FIXED_NOW_MS - 1_800_000).toISOString(),
      },
      FIXED_NOW_MS
    );

    await marketObservations.moderateObservation(
      ADMIN_MOD,
      {
        observationId: rawObs.observationId,
        action: 'VERIFY',
        verificationMethod: 'REGISTRY_MATCH',
        qualityControlNotes: 'Matched against official notary deed registry record.',
      },
      FIXED_NOW_MS + 1_000
    );
    await marketObservations.moderateObservation(
      ADMIN_MOD,
      {
        observationId: rawObs2.observationId,
        action: 'VERIFY',
        verificationMethod: 'ADMIN_AUDIT',
        qualityControlNotes: 'Verified escrow contract settlement.',
      },
      FIXED_NOW_MS + 2_000
    );

    const postVerifyAgg = await marketObservations.aggregateVerifiedMarketObservations(
      'isfahan',
      301,
      FIXED_NOW_MS + 3_000
    );
    assert.equal(postVerifyAgg.status, 'AGGREGATED_FROM_VERIFIED');
    assert.equal(postVerifyAgg.syntheticFallbackUsed, false);
    assert.equal(postVerifyAgg.verifiedActiveObservationCount, 2);
    assert.equal(postVerifyAgg.quarantinedObservationCount, 1);
    assert.ok(postVerifyAgg.derivedMetrics !== null);
    assert.equal(postVerifyAgg.derivedMetrics.epistemicClass, 'DERIVED_MARKET_METRIC');
    assert.equal(postVerifyAgg.derivedMetrics.medianBuyPerSqmMillionToman, 146);
  }

  // -------------------------------------------------------------------------
  // 6. Concurrent Updates & Optimistic Concurrency Control (CAS Revision)
  // -------------------------------------------------------------------------
  {
    const { crowdClaims } = createCrowdDataModuleFacade();
    const claim = await crowdClaims.submitClaim(
      USER_ALICE,
      {
        cityId: 'tehran',
        hoodId: 2,
        streetName: 'سعادت‌آباد، میدان کاج',
        category: 'STREET_LIQUIDITY_SHIFT',
        narrativeFa: 'افزایش محسوس بازدید خریداران مصرفی در میدان کاج سعادت‌آباد.',
      },
      FIXED_NOW_MS
    );

    // 5 concurrent disputes without expectedRevision should serialize cleanly without lost updates
    await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        crowdClaims.disputeClaim(
          USER_BOB,
          claim.claimId,
          `گزارش اختلاف میدانی شماره ${idx + 1} در میدان کاج`,
          undefined,
          FIXED_NOW_MS + (idx + 1) * 100
        )
      )
    );

    const afterConcurrentDisputes = await crowdClaims.getClaimById(claim.claimId);
    assert.ok(afterConcurrentDisputes !== null);
    assert.equal(afterConcurrentDisputes.disputeCount, 5);
    assert.equal(afterConcurrentDisputes.revision, 6);
    assert.equal(afterConcurrentDisputes.auditHistory.length, 6);

    // Two concurrent updates passing the SAME expectedRevision (6) -> exactly one succeeds, one throws 409
    const concurrentStaleResults = await Promise.allSettled([
      crowdClaims.moderateClaim(ADMIN_MOD, {
        claimId: claim.claimId,
        targetState: 'UNDER_REVIEW',
        reason: 'Concurrent moderation attempt A',
        expectedRevision: 6,
      }),
      crowdClaims.moderateClaim(ADMIN_MOD, {
        claimId: claim.claimId,
        targetState: 'REJECTED',
        reason: 'Concurrent moderation attempt B',
        expectedRevision: 6,
      }),
    ]);

    const fulfilled = concurrentStaleResults.filter((r) => r.status === 'fulfilled');
    const rejected = concurrentStaleResults.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const conflictErr = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      conflictErr instanceof CrowdDataDomainError &&
        conflictErr.code === 'CONCURRENT_MODIFICATION_CONFLICT'
    );
  }

  assert.equal(CROWD_DATA_PROVENANCE_MODEL.epistemicFirewallEnforced, true);
  assert.equal(CROWD_DATA_PROVENANCE_MODEL.syntheticDataGenerationAllowed, false);
  console.log('ALL EMPLOYEE-4 CROWD-DATA DOMAIN TESTS PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

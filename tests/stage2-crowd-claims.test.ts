/**
 * @file tests/stage2-crowd-claims.test.ts
 * @description Stage 2.1 Verification Suite — Knowledge Graph & Crowd Claims Cell
 * Tests user-attributed STAGE_COMMUNITY submission, 40% price plausibility check,
 * shadowBanned voter neutralization, automatic VERIFIED_REFERENCE promotion,
 * contributor reputation/trustWeight rewards, and Express API endpoints.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  evaluateClaimPlausibility,
  getOrCreateContributorProfile,
  processClaimVoteAndPromotion,
  resetCrowdClaimsMemoryStoreForTests,
  setContributorShadowBanStatus,
  submitCrowdClaim,
} from '../src/cells/knowledge-crowd/crowdClaimsEngine';
import { registerCrowdClaimsRoutes } from '../src/cells/knowledge-crowd/crowdClaimsRoutes';
import type { ContributorProfileDocument, CrowdClaimDocument } from '../src/cells/knowledge-crowd/crowdClaimsTypes';

console.log('🧠 Running Stage 2.1 — Knowledge Graph & Crowd Claims Cell Tests...\n');

async function requestJson(
  baseUrl: string,
  method: 'GET' | 'POST',
  pathUrl: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data };
}

async function runTests(): Promise<void> {
  let passed = 0;

  // Test 1: Plausibility check penalizes >40% price deviation without evidenceMediaObjectIds
  {
    resetCrowdClaimsMemoryStoreForTests();
    const unverifiedOutlier = evaluateClaimPlausibility({
      category: 'PRICE_OBSERVATION',
      estimatedPriceSqm: 220, // +83% deviation vs 120 base price
      baseHoodPriceSqm: 120,
      evidenceMediaObjectIds: [],
      narrativeText: 'واحد در این کوچه متری ۲۲۰ میلیون معامله شد ولی بدون مدرک تصویری.',
    });
    assert.equal(unverifiedOutlier.flaggedUnverifiedPriceOutlier, true);
    assert.ok(
      unverifiedOutlier.aiPlausibilityScore < 70,
      `Expected low plausibility score (< 70) for >40% price deviation without evidence, got ${unverifiedOutlier.aiPlausibilityScore}`,
    );

    const reasonableObservation = evaluateClaimPlausibility({
      category: 'PRICE_OBSERVATION',
      estimatedPriceSqm: 132, // +10% deviation vs 120 base price
      baseHoodPriceSqm: 120,
      evidenceMediaObjectIds: [],
      narrativeText: 'معامله واقعی یک واحد نوساز در کوچه گلستان سوم با قیمت متری ۱۳۲ میلیون تومان.',
    });
    assert.equal(reasonableObservation.flaggedUnverifiedPriceOutlier, false);
    assert.ok(
      reasonableObservation.aiPlausibilityScore >= 70,
      `Expected plausibility score >= 70 for reasonable price claim, got ${reasonableObservation.aiPlausibilityScore}`,
    );
    passed++;
    console.log('  ✅ 1. evaluateClaimPlausibility penalizes >40% unverified price outliers and approves realistic claims');
  }

  // Test 2: Immediate STAGE_COMMUNITY submission and protection against shadowBanned vote manipulation
  {
    resetCrowdClaimsMemoryStoreForTests();
    getOrCreateContributorProfile('author_resident_1', {
      displayName: 'مریم رضایی (ساکن محله)',
      roleBadge: 'LOCAL_RESIDENT',
      trustWeight: 1.2,
    });

    const claim = await submitCrowdClaim({
      targetLevel: 'STREET_SEGMENT',
      cityId: 'tehran',
      hoodId: 1,
      streetName: 'کوچه مهرگان چهارم',
      coords: { lat: 35.7575, lng: 51.4100 },
      category: 'ALLEY_LIVABILITY',
      parkingScore: 8,
      noiseLevelScore: 9,
      safetyScore: 9,
      slopeType: 'FLAT',
      narrativeText: 'کوچه مهرگان چهارم بسیار دنج، مشجر و دارای جای پارک مناسب در شب است.',
      authorUid: 'author_resident_1',
      authorDisplayName: 'مریم رضایی (ساکن محله)',
      authorRoleBadge: 'LOCAL_RESIDENT',
    });

    assert.equal(claim.epistemicState, 'STAGE_COMMUNITY', 'New claim must enter STAGE_COMMUNITY immediately');
    assert.equal(claim.authorUid, 'author_resident_1');
    assert.equal(claim.authorTrustWeightAtSubmission, 1.2);
    assert.ok(claim.aiPlausibilityScore >= 70);

    // Create a shadow-banned attacker with high nominal trustWeight and verify zero effect
    getOrCreateContributorProfile('malicious_bot_99', {
      displayName: 'ربات دستکاری‌کننده',
      roleBadge: 'VERIFIED_REALTOR',
      trustWeight: 5.0,
      shadowBanned: true,
    });
    setContributorShadowBanStatus('malicious_bot_99', true);

    const shadowVoteRes = await processClaimVoteAndPromotion({
      claimId: claim.claimId,
      voterUid: 'malicious_bot_99',
      direction: 'UP',
    });

    assert.equal(shadowVoteRes.effectiveVoteWeight, 0, 'Shadow-banned voter must have 0 effective weight');
    assert.equal(shadowVoteRes.claim.weightedConsensusScore, 0, 'Consensus score must remain 0 after shadow-banned vote');
    assert.equal(shadowVoteRes.claim.upvoteCount, 0, 'Upvote count must ignore shadow-banned voter');
    assert.equal(shadowVoteRes.claim.epistemicState, 'STAGE_COMMUNITY', 'Shadow-banned voter must never trigger promotion');
    assert.equal(shadowVoteRes.promotedToVerifiedReference, false);
    passed++;
    console.log('  ✅ 2. Immediate STAGE_COMMUNITY creation & zero-impact neutralization of shadowBanned voters');
  }

  // Test 3: End-to-End Express API Routes, Street Filtering, Auto-Promotion to VERIFIED_REFERENCE, and Reputation Rewards
  {
    resetCrowdClaimsMemoryStoreForTests();
    const app = express();
    app.use(express.json());
    registerCrowdClaimsRoutes(app);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Seed contributor profiles with known trust weights
      getOrCreateContributorProfile('author_ali', {
        displayName: 'علی محمدی',
        roleBadge: 'LOCAL_RESIDENT',
        trustWeight: 1.15,
      });
      getOrCreateContributorProfile('voter_realtor_1', {
        displayName: 'کارشناس رسمی ۱',
        roleBadge: 'VERIFIED_REALTOR',
        trustWeight: 1.8,
      });
      getOrCreateContributorProfile('voter_expert_2', {
        displayName: 'کارشناس رسمی ۲',
        roleBadge: 'OFFICIAL_EXPERT',
        trustWeight: 1.5,
      });
      getOrCreateContributorProfile('voter_shadow_ban', {
        displayName: 'کاربر شدوبن',
        roleBadge: 'CITIZEN',
        trustWeight: 4.5,
        shadowBanned: true,
      });

      // 3.1 Submit claim via POST /api/v1/claims
      const postRes = await requestJson(baseUrl, 'POST', '/api/v1/claims', {
        targetLevel: 'STREET_SEGMENT',
        cityId: 'tehran',
        hoodId: 5,
        streetName: 'خیابان بهار شمالی',
        coords: { lat: 35.72, lng: 51.43 },
        category: 'PRICE_OBSERVATION',
        estimatedPriceSqm: 128,
        baseHoodPriceSqmOverride: 125,
        parkingScore: 7,
        noiseLevelScore: 8,
        safetyScore: 9,
        slopeType: 'FLAT',
        narrativeText: 'واحد ۹۵ متری در کوچه بهار شمالی به قیمت متری ۱۲۸ میلیون تومان هفته گذشته معامله شد.',
        authorUid: 'author_ali',
        authorDisplayName: 'علی محمدی',
        authorRoleBadge: 'LOCAL_RESIDENT',
      });

      assert.equal(postRes.status, 201);
      const createdClaim = postRes.data.claim as CrowdClaimDocument;
      assert.equal(createdClaim.epistemicState, 'STAGE_COMMUNITY');
      assert.equal(createdClaim.streetNameNormalized, 'بهار شمالی');
      assert.ok(createdClaim.aiPlausibilityScore >= 70);

      // 3.2 Shadow-banned user tries to downvote via POST /api/v1/claims/:claimId/vote
      const shadowVote = await requestJson(baseUrl, 'POST', `/api/v1/claims/${createdClaim.claimId}/vote`, {
        voterUid: 'voter_shadow_ban',
        direction: 'DOWN',
      });
      assert.equal(shadowVote.status, 200);
      assert.equal(shadowVote.data.effectiveVoteWeight, 0);
      assert.equal((shadowVote.data.claim as CrowdClaimDocument).weightedConsensusScore, 0);

      // 3.3 First legitimate voter (trustWeight = 1.8) upvotes -> consensus = 1.8 (< 3.0, stays STAGE_COMMUNITY)
      const vote1 = await requestJson(baseUrl, 'POST', `/api/v1/claims/${createdClaim.claimId}/vote`, {
        voterUid: 'voter_realtor_1',
        direction: 'UP',
      });
      assert.equal(vote1.status, 200);
      assert.equal(vote1.data.promotedToVerifiedReference, false);
      assert.equal((vote1.data.claim as CrowdClaimDocument).weightedConsensusScore, 1.8);
      assert.equal((vote1.data.claim as CrowdClaimDocument).epistemicState, 'STAGE_COMMUNITY');

      // 3.4 Second legitimate voter (trustWeight = 1.5) upvotes -> consensus = 3.3 (>= 3.0 & plausibility >= 70 -> promotes to VERIFIED_REFERENCE!)
      const vote2 = await requestJson(baseUrl, 'POST', `/api/v1/claims/${createdClaim.claimId}/vote`, {
        voterUid: 'voter_expert_2',
        direction: 'UP',
      });
      assert.equal(vote2.status, 200);
      assert.equal(vote2.data.promotedToVerifiedReference, true);
      const promotedClaim = vote2.data.claim as CrowdClaimDocument;
      assert.equal(promotedClaim.epistemicState, 'VERIFIED_REFERENCE');
      assert.equal(promotedClaim.weightedConsensusScore, 3.3);
      assert.ok(promotedClaim.promotedToReferenceAtIso);

      // 3.5 Verify GET /api/v1/claims/hood/:hoodId with streetName filter & crowdVerifiedDealMedianPerSqm
      const hoodGet = await requestJson(
        baseUrl,
        'GET',
        `/api/v1/claims/hood/5?streetName=${encodeURIComponent('بهار شمالی')}`,
      );
      assert.equal(hoodGet.status, 200);
      const verifiedList = hoodGet.data.VERIFIED_REFERENCE as CrowdClaimDocument[];
      const communityList = hoodGet.data.STAGE_COMMUNITY as CrowdClaimDocument[];
      assert.equal(verifiedList.length, 1);
      assert.equal(communityList.length, 0);
      assert.equal(verifiedList[0].claimId, createdClaim.claimId);
      assert.equal(hoodGet.data.crowdVerifiedDealMedianPerSqm, 128);
      assert.equal(hoodGet.data.crowdPriceObservationCount, 1);

      // 3.6 Verify GET /api/v1/contributors/:uid rewards (+25 reputationPoints and +0.05 trustWeight)
      const contribGet = await requestJson(baseUrl, 'GET', '/api/v1/contributors/author_ali');
      assert.equal(contribGet.status, 200);
      const profile = contribGet.data.profile as ContributorProfileDocument;
      assert.equal(profile.reputationPoints, 25, 'Author must receive +25 reputationPoints upon promotion');
      assert.equal(profile.trustWeight, 1.2, 'Author trustWeight must increase by +0.05 from 1.15 to 1.20');
      assert.equal(profile.verifiedClaimsCount, 1);
      assert.ok(profile.topSpecialtyHoodIds.includes(5));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    passed++;
    console.log('  ✅ 3. Express API routes, street filtering, auto-promotion to VERIFIED_REFERENCE, crowd deal median calibration, and +25/+0.05 contributor rewards');
  }

  console.log(`\n🎉 ALL ${passed} STAGE 2.1 CROWD CLAIMS TESTS PASSED!\n`);
}

runTests().catch((err) => {
  console.error('❌ Stage 2.1 Crowd Claims Test Failed:', err);
  process.exit(1);
});

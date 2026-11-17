/**
 * @file tests/stage2-crowd-claims.test.ts
 * @description Stage 2.1 + RT-SOCIAL-WAVE1-SECURITY-001 Verification Suite
 * Tests user-attributed STAGE_COMMUNITY submission, 40% price plausibility check,
 * shadowBanned voter neutralization, VERIFIED_REFERENCE promotion, and strict
 * Firebase ID Token identity boundary enforcement (CC-A01..CC-A12).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { type Request } from 'express';
import {
  evaluateClaimPlausibility,
  getOrCreateContributorProfile,
  processClaimVoteAndPromotion,
  queryNeighborhoodCrowdClaims,
  resetCrowdClaimsMemoryStoreForTests,
  setContributorShadowBanStatus,
  submitCrowdClaim,
} from '../src/cells/knowledge-crowd/crowdClaimsEngine';
import { registerCrowdClaimsRoutes } from '../src/cells/knowledge-crowd/crowdClaimsRoutes';
import type { ContributorProfileDocument, CrowdClaimDocument } from '../src/cells/knowledge-crowd/crowdClaimsTypes';

console.log('🧠 Running Stage 2.1 + Security CC-A01..CC-A12 Crowd Claims Tests...\n');

async function requestJson(
  baseUrl: string,
  method: 'GET' | 'POST',
  pathUrl: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const mergedHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (body) mergedHeaders['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data };
}

const TOKEN_DIRECTORY: Record<string, { authorized: boolean; statusCode: number; uid?: string; reason?: string }> = {
  tok_author_ali: { authorized: true, statusCode: 200, uid: 'author_ali' },
  tok_voter_realtor_1: { authorized: true, statusCode: 200, uid: 'voter_realtor_1' },
  tok_voter_expert_2: { authorized: true, statusCode: 200, uid: 'voter_expert_2' },
  tok_voter_shadow_ban: { authorized: true, statusCode: 200, uid: 'voter_shadow_ban' },
  tok_citizen_plain: { authorized: true, statusCode: 200, uid: 'citizen_plain_77' },
  tok_unverified: { authorized: false, statusCode: 403, reason: 'EMAIL_NOT_VERIFIED' },
  tok_expired: { authorized: false, statusCode: 401, reason: 'EXPIRED_FIREBASE_TOKEN' },
};

async function mockVerifyUserAuth(req: Request) {
  const raw = String(req.headers.authorization || '').trim();
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token || !TOKEN_DIRECTORY[token]) {
    return { authorized: false, statusCode: 401, reason: 'INVALID_OR_REVOKED_FIREBASE_TOKEN' };
  }
  return TOKEN_DIRECTORY[token];
}

async function runTests(): Promise<void> {
  let passed = 0;

  // Test 1: Plausibility check
  {
    resetCrowdClaimsMemoryStoreForTests();
    const unverifiedOutlier = evaluateClaimPlausibility({
      category: 'PRICE_OBSERVATION',
      estimatedPriceSqm: 220,
      baseHoodPriceSqm: 120,
      evidenceMediaObjectIds: [],
      narrativeText: 'واحد در این کوچه متری ۲۲۰ میلیون معامله شد ولی بدون مدرک تصویری.',
    });
    assert.equal(unverifiedOutlier.flaggedUnverifiedPriceOutlier, true);
    assert.ok(unverifiedOutlier.aiPlausibilityScore < 70);

    const reasonableObservation = evaluateClaimPlausibility({
      category: 'PRICE_OBSERVATION',
      estimatedPriceSqm: 132,
      baseHoodPriceSqm: 120,
      evidenceMediaObjectIds: [],
      narrativeText: 'معامله واقعی یک واحد نوساز در کوچه گلستان سوم با قیمت متری ۱۳۲ میلیون تومان.',
    });
    assert.equal(reasonableObservation.flaggedUnverifiedPriceOutlier, false);
    assert.ok(reasonableObservation.aiPlausibilityScore >= 70);
    passed++;
    console.log('  ✅ 1. evaluateClaimPlausibility penalizes >40% unverified price outliers and approves realistic claims');
  }

  // Test 2: Immediate STAGE_COMMUNITY creation & shadowBanned neutralization
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

    assert.equal(claim.epistemicState, 'STAGE_COMMUNITY');
    assert.equal(claim.authorUid, 'author_resident_1');
    assert.equal(claim.authorTrustWeightAtSubmission, 1.2);
    assert.ok(claim.aiPlausibilityScore >= 70);

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

    assert.equal(shadowVoteRes.effectiveVoteWeight, 0);
    assert.equal(shadowVoteRes.claim.weightedConsensusScore, 0);
    assert.equal(shadowVoteRes.claim.upvoteCount, 0);
    assert.equal(shadowVoteRes.claim.epistemicState, 'STAGE_COMMUNITY');
    assert.equal(shadowVoteRes.promotedToVerifiedReference, false);
    passed++;
    console.log('  ✅ 2. Immediate STAGE_COMMUNITY creation & zero-impact neutralization of shadowBanned voters');
  }

  // Test 3: End-to-End Authenticated Express Routes + Identity Boundary Matrix CC-A01..CC-A12
  {
    resetCrowdClaimsMemoryStoreForTests();
    const app = express();
    app.use(express.json());
    registerCrowdClaimsRoutes(app, { verifyUserAuth: mockVerifyUserAuth });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
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

      // CC-A01: POST /api/v1/claims without Authorization fails closed (401) without touching Engine
      const noAuthPost = await requestJson(baseUrl, 'POST', '/api/v1/claims', {
        hoodId: 5,
        streetName: 'خیابان بهار شمالی',
        category: 'PRICE_OBSERVATION',
        authorUid: 'author_ali',
        narrativeText: 'متن تستی که بدون توکن نباید ثبت شود.',
      });
      assert.equal(noAuthPost.status, 401);
      assert.equal(queryNeighborhoodCrowdClaims(5).totalMatchedCount, 0);

      // CC-A02: Expired / invalid token -> 401
      const expiredPost = await requestJson(
        baseUrl,
        'POST',
        '/api/v1/claims',
        { hoodId: 5, streetName: 'بهار', narrativeText: 'گزارش با توکن منقضی نباید ثبت شود.' },
        { Authorization: 'Bearer tok_expired' },
      );
      assert.equal(expiredPost.status, 401);

      // CC-A03: Unverified email -> 403
      const unverifiedPost = await requestJson(
        baseUrl,
        'POST',
        '/api/v1/claims',
        { hoodId: 5, streetName: 'بهار', narrativeText: 'ایمیل تاییدنشده نباید ثبت شود.' },
        { Authorization: 'Bearer tok_unverified' },
      );
      assert.equal(unverifiedPost.status, 403);

      // CC-A06: Authenticated user spoofing mismatched authorUid in body -> 403 UID_SPOOFING_FORBIDDEN
      const spoofPost = await requestJson(
        baseUrl,
        'POST',
        '/api/v1/claims',
        {
          hoodId: 5,
          streetName: 'بهار',
          authorUid: 'victim_uid_999',
          narrativeText: 'تلاش جعل شناسه نویسنده در بدنه درخواست.',
        },
        { Authorization: 'Bearer tok_author_ali' },
      );
      assert.equal(spoofPost.status, 403);
      assert.equal(spoofPost.data.code, 'UID_SPOOFING_FORBIDDEN');
      assert.equal(queryNeighborhoodCrowdClaims(5).totalMatchedCount, 0);

      // CC-A07: Client spoofing authorRoleBadge: 'OFFICIAL_EXPERT' on citizen account is ignored (server resolves CITIZEN)
      const badgeSpoofPost = await requestJson(
        baseUrl,
        'POST',
        '/api/v1/claims',
        {
          hoodId: 9,
          streetName: 'خیابان ولیعصر',
          category: 'ALLEY_LIVABILITY',
          authorRoleBadge: 'OFFICIAL_EXPERT',
          narrativeText: 'وضعیت پیاده‌رو و دسترسی حمل‌ونقل در این خیابان مناسب است.',
        },
        { Authorization: 'Bearer tok_citizen_plain' },
      );
      assert.equal(badgeSpoofPost.status, 201);
      assert.equal((badgeSpoofPost.data.claim as CrowdClaimDocument).authorUid, 'citizen_plain_77');
      assert.equal((badgeSpoofPost.data.claim as CrowdClaimDocument).authorRoleBadge, 'CITIZEN');

      // CC-A05: Valid authenticated claim without authorUid in body uses verified token UID + server profile
      const postRes = await requestJson(
        baseUrl,
        'POST',
        '/api/v1/claims',
        {
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
          authorDisplayName: 'علی محمدی',
        },
        { Authorization: 'Bearer tok_author_ali' },
      );

      assert.equal(postRes.status, 201);
      const createdClaim = postRes.data.claim as CrowdClaimDocument;
      assert.equal(createdClaim.authorUid, 'author_ali');
      assert.equal(createdClaim.authorRoleBadge, 'LOCAL_RESIDENT');
      assert.equal(createdClaim.epistemicState, 'STAGE_COMMUNITY');
      assert.equal(createdClaim.streetNameNormalized, 'بهار شمالی');
      assert.ok(createdClaim.aiPlausibilityScore >= 70);

      // CC-A08: Vote without Authorization -> 401
      const noAuthVote = await requestJson(baseUrl, 'POST', `/api/v1/claims/${createdClaim.claimId}/vote`, {
        voterUid: 'voter_realtor_1',
        direction: 'UP',
      });
      assert.equal(noAuthVote.status, 401);

      // CC-A09: Vote spoofing different voterUid -> 403 UID_SPOOFING_FORBIDDEN
      const spoofVote = await requestJson(
        baseUrl,
        'POST',
        `/api/v1/claims/${createdClaim.claimId}/vote`,
        { voterUid: 'other_user_uid', direction: 'UP' },
        { Authorization: 'Bearer tok_voter_realtor_1' },
      );
      assert.equal(spoofVote.status, 403);
      assert.equal(spoofVote.data.code, 'UID_SPOOFING_FORBIDDEN');

      // Shadow-banned authenticated voter votes via POST /api/v1/claims/:claimId/vote
      const shadowVote = await requestJson(
        baseUrl,
        'POST',
        `/api/v1/claims/${createdClaim.claimId}/vote`,
        { direction: 'DOWN' },
        { Authorization: 'Bearer tok_voter_shadow_ban' },
      );
      assert.equal(shadowVote.status, 200);
      assert.equal(shadowVote.data.effectiveVoteWeight, 0);
      assert.equal((shadowVote.data.claim as CrowdClaimDocument).weightedConsensusScore, 0);

      // CC-A10: First legitimate voter upvotes -> consensus 1.8
      const vote1 = await requestJson(
        baseUrl,
        'POST',
        `/api/v1/claims/${createdClaim.claimId}/vote`,
        { direction: 'UP' },
        { Authorization: 'Bearer tok_voter_realtor_1' },
      );
      assert.equal(vote1.status, 200);
      assert.equal(vote1.data.promotedToVerifiedReference, false);
      assert.equal((vote1.data.claim as CrowdClaimDocument).weightedConsensusScore, 1.8);

      // Second legitimate voter upvotes -> promotes to VERIFIED_REFERENCE
      const vote2 = await requestJson(
        baseUrl,
        'POST',
        `/api/v1/claims/${createdClaim.claimId}/vote`,
        { direction: 'UP' },
        { Authorization: 'Bearer tok_voter_expert_2' },
      );
      assert.equal(vote2.status, 200);
      assert.equal(vote2.data.promotedToVerifiedReference, true);
      const promotedClaim = vote2.data.claim as CrowdClaimDocument;
      assert.equal(promotedClaim.epistemicState, 'VERIFIED_REFERENCE');
      assert.equal(promotedClaim.weightedConsensusScore, 3.3);
      assert.ok(promotedClaim.promotedToReferenceAtIso);

      // CC-A11: Public read GET /api/v1/claims/hood/:hoodId works without Authorization
      const hoodGet = await requestJson(
        baseUrl,
        'GET',
        `/api/v1/claims/hood/5?streetName=${encodeURIComponent('بهار شمالی')}`,
      );
      assert.equal(hoodGet.status, 200);
      const verifiedList = hoodGet.data.verifiedReferenceClaims as CrowdClaimDocument[];
      const legacyVerifiedList = hoodGet.data.VERIFIED_REFERENCE as CrowdClaimDocument[];
      assert.equal(verifiedList.length, 1);
      assert.equal(legacyVerifiedList.length, 1);
      assert.equal(hoodGet.data.crowdVerifiedDealMedianPerSqm, 128);

      // CC-A12: Public read GET /api/v1/contributors/:uid works without Authorization
      const contribGet = await requestJson(baseUrl, 'GET', '/api/v1/contributors/author_ali');
      assert.equal(contribGet.status, 200);
      const profile = contribGet.data.profile as ContributorProfileDocument;
      assert.equal(profile.reputationPoints, 25);
      assert.equal(profile.trustWeight, 1.2);
      assert.equal(profile.verifiedClaimsCount, 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    passed++;
    console.log('  ✅ 3. CC-A01..CC-A12 authenticated Crowd Claims routes, anti-spoofing, promotion, and public reads verified');
  }

  // Test 4 (CC-A04): Unavailable verifier fails closed with 503
  {
    resetCrowdClaimsMemoryStoreForTests();
    const app503 = express();
    app503.use(express.json());
    registerCrowdClaimsRoutes(app503, {
      verifyUserAuth: async () => {
        throw new Error('AUTH_SERVICE_DOWN');
      },
    });
    const server503 = http.createServer(app503);
    await new Promise<void>((resolve) => server503.listen(0, '127.0.0.1', resolve));
    const port503 = (server503.address() as { port: number }).port;
    try {
      const res503 = await requestJson(
        `http://127.0.0.1:${port503}`,
        'POST',
        '/api/v1/claims',
        { hoodId: 5, streetName: 'بهار', narrativeText: 'درخواست هنگام قطع سرویس تایید هویت.' },
        { Authorization: 'Bearer some_valid_looking_token_123456' },
      );
      assert.equal(res503.status, 503);
      assert.equal(res503.data.code, 'AUTH_PROVIDER_UNAVAILABLE');
    } finally {
      await new Promise<void>((resolve) => server503.close(() => resolve()));
    }
    passed++;
    console.log('  ✅ 4. CC-A04 verifier outage fails closed with HTTP 503');
  }

  console.log(`\n🎉 ALL ${passed} STAGE 2.1 + SECURITY CROWD CLAIMS TESTS PASSED!\n`);
}

runTests().catch((err) => {
  console.error('❌ Stage 2.1 Crowd Claims Test Failed:', err);
  process.exit(1);
});

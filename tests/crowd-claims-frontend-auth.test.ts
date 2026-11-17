/**
 * @file tests/crowd-claims-frontend-auth.test.ts
 * @description Stage 1 (RT-SOCIAL-WAVE1-SECURITY-001) Frontend Auth Regression Tests (FC-A01..FC-A05)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCrowdClaimRequestBody,
  buildCrowdVoteRequestBody,
  getCrowdAuthorizedHeaders,
  resolveCrowdMutationHttpError,
} from '../src/components/stage2/crowdClaimsClientHelper';

async function runTests() {
  let passed = 0;

  // FC-A01: Unauthenticated user receives Persian prompt and cannot authorize requests; component source has zero random UIDs
  {
    const panelSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx'),
      'utf-8',
    );
    assert.equal(panelSrc.includes('sessionAuthorUid'), false, 'sessionAuthorUid must be removed completely');
    assert.equal(panelSrc.includes('sessionVoterUid'), false, 'sessionVoterUid must be removed completely');
    assert.ok(panelSrc.includes('onAuthStateChanged'), 'Panel must subscribe to Firebase onAuthStateChanged');
    assert.ok(panelSrc.includes('data.verifiedReferenceClaims ?? data.VERIFIED_REFERENCE'));
    assert.ok(panelSrc.includes('formatMillionTomanAsIntlCurrency'));

    const res = await getCrowdAuthorizedHeaders(null);
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.messageFa.includes('وارد'));
    passed++;
    console.log('  ✅ FC-A01. Signed-out state blocks mutations & component uses real Firebase auth without synthetic UIDs');
  }

  // FC-A02: Empty token or failing getIdToken aborts before network request
  {
    const emptyTokenUser = { uid: 'u1', getIdToken: async () => '   ' };
    const emptyRes = await getCrowdAuthorizedHeaders(emptyTokenUser);
    assert.equal(emptyRes.ok, false);

    const throwingUser = {
      uid: 'u1',
      getIdToken: async () => {
        throw new Error('TOKEN_ERROR');
      },
    };
    const errRes = await getCrowdAuthorizedHeaders(throwingUser);
    assert.equal(errRes.ok, false);
    if (!errRes.ok) assert.ok(errRes.messageFa.includes('توکن'));
    passed++;
    console.log('  ✅ FC-A02. Empty or throwing getIdToken aborts safely with Persian error');
  }

  // FC-A03: Request payloads never send authorUid or voterUid
  {
    const claimBody = buildCrowdClaimRequestBody({
      hoodId: 5,
      cityKey: 'tehran',
      authorDisplayName: 'علی',
      category: 'PRICE_OBSERVATION',
      claimType: 'VERIFIED_FACT_CANDIDATE',
      streetName: 'خیابان بهار',
      narrativeText: 'گزارش واقعی معامله',
      intlCurrency: 'USD',
    });
    assert.equal('authorUid' in claimBody, false, 'authorUid must never be sent in body');
    assert.equal('voterUid' in claimBody, false);

    const voteBody = buildCrowdVoteRequestBody('UP');
    assert.equal('voterUid' in voteBody, false, 'voterUid must never be sent in vote body');
    assert.equal(voteBody.direction, 'UP');
    passed++;
    console.log('  ✅ FC-A03. Client request payloads exclude authorUid and voterUid completely');
  }

  // FC-A04: Signed-in user attaches Authorization Bearer <token>
  {
    const okUser = { uid: 'uid_verified_1', getIdToken: async () => 'firebase_id_token_abc12345' };
    const authRes = await getCrowdAuthorizedHeaders(okUser);
    assert.equal(authRes.ok, true);
    if (authRes.ok) {
      assert.equal(authRes.headers.Authorization, 'Bearer firebase_id_token_abc12345');
      assert.equal(authRes.headers['Content-Type'], 'application/json');
    }
    passed++;
    console.log('  ✅ FC-A04. Authenticated user produces Bearer Authorization header');
  }

  // FC-A05: 401 message prompts Persian re-login & vote error handler reverts optimistic state
  {
    const msg401 = resolveCrowdMutationHttpError(401, { code: 'UNAUTHORIZED' });
    assert.ok(msg401.includes('منقضی') || msg401.includes('دوباره وارد'));
    const panelSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx'),
      'utf-8',
    );
    assert.ok(panelSrc.includes('applyDelta(prev, -1)'), 'Optimistic vote must roll back on failure');
    assert.ok(panelSrc.includes('delete next[claimId]'), 'votedIds must roll back on failure');
    passed++;
    console.log('  ✅ FC-A05. HTTP 401 shows Persian re-login prompt and optimistic votes roll back on failure');
  }

  console.log(`\n🎉 ALL ${passed} FRONTEND CROWD CLAIMS AUTH TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error('❌ Frontend Crowd Claims Auth Test Failed:', err);
  process.exit(1);
});

/**
 * @file tests/stage2-valuation-and-socioeconomic.test.ts
 * @description Stage 2.2 Verification Suite — MAD Outlier Engine & Socioeconomic Intelligence Rollup Cell
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  aggregateNeighborhoodResearchRollup,
  resetSocioeconomicRollupsForTests,
} from '../src/cells/socioeconomic-intelligence/socioeconomicRollupEngine';
import { registerSocioeconomicRoutes } from '../src/cells/socioeconomic-intelligence/socioeconomicRoutes';
import type {
  NeighborhoodResearchRollupDocument,
  ResearchBehavioralEvent,
} from '../src/cells/socioeconomic-intelligence/socioeconomicTypes';
import {
  computeServerValuationSeal,
  filterOutliersUsingMAD,
  normalizePriceByCityIndex,
  type RawPriceObservation,
} from '../src/cells/valuation-authority/robustValuationEngine';
import {
  DEFAULT_CASPER_DECISION_WEIGHTS,
  evaluateCasperNeighborhoodDecision,
} from '../src/cells/socioeconomic-intelligence/casperDecisionEngine';

console.log('📊 Running Stage 2.2 — MAD Valuation & Socioeconomic Rollup Tests...\n');

async function runTests(): Promise<void> {
  let passed = 0;

  // Test 1: Inflation Normalization & MAD Outlier Rejection (|P_i - M| > 2.5 * MAD)
  {
    const adjusted = normalizePriceByCityIndex(100, 200, 250);
    assert.equal(adjusted, 125, 'Price must scale by currentCityIndex / recordedCityIndex');

    const observations: RawPriceObservation[] = [
      { id: 'deal-1', priceSqm: 118, sourceType: 'VERIFIED_DEAL', ageDays: 3 },
      { id: 'deal-2', priceSqm: 120, sourceType: 'VERIFIED_DEAL', ageDays: 5 },
      { id: 'deal-3', priceSqm: 122, sourceType: 'APPROVED_BARGAIN', ageDays: 10 },
      { id: 'claim-4', priceSqm: 119, sourceType: 'VERIFIED_CLAIM', ageDays: 15 },
      { id: 'seed-5', priceSqm: 121, sourceType: 'AI_SEED', ageDays: 30 },
      // Speculator fake listing trying to pump the neighborhood average
      { id: 'fake-speculator-high', priceSqm: 260, sourceType: 'AI_SEED', ageDays: 1 },
      // Fake low-ball bait listing
      { id: 'fake-bait-low', priceSqm: 45, sourceType: 'AI_SEED', ageDays: 1 },
    ];

    const summary = filterOutliersUsingMAD(observations);
    assert.equal(summary.medianPriceSqm, 120, 'Median M must be 120');
    assert.equal(summary.madValue, 2, 'MAD = Median(|P_i - 120|) across [2,0,2,1,1,140,75] must be 2');
    assert.equal(summary.outlierCount, 2, 'Both 260 and 45 exceed 2.5 * MAD (5) and must be flagged as outliers');

    const highOutlier = summary.evaluatedObservations.find((o) => o.id === 'fake-speculator-high');
    const lowOutlier = summary.evaluatedObservations.find((o) => o.id === 'fake-bait-low');
    assert.equal(highOutlier?.isOutlier, true);
    assert.equal(highOutlier?.combinedWeight, 0);
    assert.equal(lowOutlier?.isOutlier, true);
    assert.ok(
      summary.weightedReferencePriceSqm >= 118 && summary.weightedReferencePriceSqm <= 122,
      `Weighted reference price must resist outliers (got ${summary.weightedReferencePriceSqm})`,
    );

    const seed30Days = summary.evaluatedObservations.find((o) => o.id === 'seed-5');
    assert.ok(seed30Days && Math.abs(seed30Days.recencyDecayFactor - 0.5) < 0.001, '30-day half-life decay must be 0.5');
    passed++;
    console.log('  ✅ 1. MAD outlier filter (|P_i - M| > 2.5 * MAD), 30-day half-life decay, and inflation normalization verified');
  }

  // Test 2: k-Anonymity Privacy Lock (distinctSessionCount < 15 -> null behavioral metrics)
  {
    resetSocioeconomicRollupsForTests();
    const fewEvents: ResearchBehavioralEvent[] = Array.from({ length: 12 }, (_, idx) => ({
      sessionId: `unique_human_session_${idx + 1}`,
      cityId: 'tehran',
      hoodId: 1,
      samplingProbability: 0.5,
      searcherBudgetPerSqm: 100,
      observedListingPriceSqm: 140,
      activeAttentionMs: 20000,
      liked: true,
      unliked: idx % 3 === 0,
      previousHoodId: 2,
      nextHoodId: 3,
    }));

    const { rollup } = await aggregateNeighborhoodResearchRollup({
      cityId: 'tehran',
      hoodId: 1,
      periodKey: '1405-08',
      behavioralEvents: fewEvents,
    });

    assert.equal(rollup.distinctSessionCount, 12);
    assert.equal(rollup.kAnonymitySatisfied, false);
    assert.equal(rollup.affordabilityStressIndex, null, 'affordabilityStressIndex must be null when sessions < 15');
    assert.equal(rollup.priceAttentionElasticity, null, 'priceAttentionElasticity must be null when sessions < 15');
    assert.equal(rollup.hesitationRatePct, null, 'hesitationRatePct must be null when sessions < 15');
    assert.equal(rollup.displacementMatrix, null, 'displacementMatrix must be null when sessions < 15');
    assert.equal(rollup.citationCode, 'RADAR-REF-TEHRAN-H1-1405-08');
    passed++;
    console.log('  ✅ 2. k-anonymity privacy lock strictly nulls behavioral metrics when distinctSessionCount < 15');
  }

  // Test 3: Full Socioeconomic Rollup (k >= 15), Displacement Matrix, Affordability Stress, and Express Routes
  {
    resetSocioeconomicRollupsForTests();
    const app = express();
    app.use(express.json());
    registerSocioeconomicRoutes(app, {
      verifyAdminAuth: async (req) => {
        const token = req.headers['x-test-admin'];
        return token === 'valid'
          ? { ok: true, status: 200, message: 'ok' }
          : { ok: false, status: 403, message: 'ADMIN_FORBIDDEN' };
      },
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Unauthenticated call must fail closed (403)
      const unauthTriggerRes = await fetch(`${baseUrl}/api/admin/rollups/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityId: 'tehran', hoodId: 4 }),
      });
      assert.equal(unauthTriggerRes.status, 403, 'Admin rollup trigger must reject unauthenticated calls');

      // 16 distinct human sessions (>= 15 threshold)
      const richEvents: ResearchBehavioralEvent[] = Array.from({ length: 16 }, (_, idx) => ({
        sessionId: `verified_session_${idx + 1}`,
        cityId: 'tehran',
        hoodId: 4,
        samplingProbability: 0.25, // w_i = 4.0
        searcherBudgetPerSqm: 100,
        observedListingPriceSqm: idx < 8 ? 165 : 150,
        activeAttentionMs: idx < 8 ? 12000 : 24000,
        liked: idx < 10,
        unliked: idx < 2, // 2 unlikes out of 10 likes -> 20% hesitation rate
        previousHoodId: idx < 10 ? 1 : idx < 14 ? 2 : 3,
        nextHoodId: idx < 9 ? 6 : idx < 13 ? 7 : 8,
      }));

      const triggerRes = await fetch(`${baseUrl}/api/admin/rollups/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-admin': 'valid' },
        body: JSON.stringify({
          cityId: 'tehran',
          hoodId: 4,
          periodKey: '1405-08',
          priceObservations: [
            { id: 'p1', priceSqm: 150, sourceType: 'VERIFIED_DEAL', ageDays: 2 },
            { id: 'p2', priceSqm: 150, sourceType: 'VERIFIED_DEAL', ageDays: 4 },
            { id: 'p3', priceSqm: 152, sourceType: 'APPROVED_BARGAIN', ageDays: 6 },
            { id: 'p4', priceSqm: 148, sourceType: 'VERIFIED_CLAIM', ageDays: 8 },
            { id: 'p5-outlier', priceSqm: 310, sourceType: 'AI_SEED', ageDays: 1 },
          ],
          behavioralEvents: richEvents,
        }),
      });
      assert.equal(triggerRes.status, 200);
      const triggerBody = (await triggerRes.json()) as { rollup: NeighborhoodResearchRollupDocument };
      const rollup = triggerBody.rollup;

      assert.equal(rollup.distinctSessionCount, 16);
      assert.equal(rollup.kAnonymitySatisfied, true);
      assert.equal(rollup.totalWeightedSampleSize, 64, '16 events with p_i=0.25 (w_i=4) must total 64');
      assert.equal(rollup.medianPriceSqm, 150);
      assert.equal(rollup.affordabilityStressIndex, 1.5, 'Median price 150 / searcher budget 100 = 1.50');
      assert.equal(rollup.hesitationRatePct, 20, '2 unlikes / 10 likes = 20%');
      assert.ok(rollup.priceAttentionElasticity !== null && rollup.priceAttentionElasticity < 0);
      assert.ok(rollup.displacementMatrix);
      assert.equal(rollup.displacementMatrix.topInflowFromHoodIds[0].hoodId, 1);
      assert.equal(rollup.displacementMatrix.topOutflowToHoodIds[0].hoodId, 6);
      assert.equal(rollup.citationCode, 'RADAR-REF-TEHRAN-H4-1405-08');

      // Verify GET /api/v1/reference/hood/:hoodId/rollup
      const getRes = await fetch(`${baseUrl}/api/v1/reference/hood/4/rollup?cityId=tehran&periodKey=1405-08`);
      assert.equal(getRes.status, 200);
      const getJson = (await getRes.json()) as {
        rollup: NeighborhoodResearchRollupDocument;
        executiveSynthesis: { compositeReadinessScore: number; pillars: { targetTabId: string }[] };
      };
      assert.equal(getJson.rollup.citationCode, 'RADAR-REF-TEHRAN-H4-1405-08');
      assert.ok(getJson.executiveSynthesis && getJson.executiveSynthesis.pillars.length === 6);

      // Verify POST /api/v1/valuation/verify-seal & direct computeServerValuationSeal
      const directSeal = computeServerValuationSeal({ cityId: 'tehran', hoodId: 1, sqm: 100, buildYear: 1403 });
      assert.ok(directSeal.sealSignature.length === 64);
      const sealRes = await fetch(`${baseUrl}/api/v1/valuation/verify-seal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityId: 'tehran', hoodId: 1, sqm: 100, buildYear: 1403 }),
      });
      assert.equal(sealRes.status, 200);
      const sealJson = (await sealRes.json()) as { seal: { sealSignature: string; fastSaleFactor: number } };
      assert.equal(sealJson.seal.sealSignature, directSeal.sealSignature);
      assert.equal(sealJson.seal.fastSaleFactor, 0.88);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    passed++;
    console.log('  ✅ 3. Full k>=15 socioeconomic rollup, displacement matrix, affordability stress, citation code, and Hedonic seal verified');
  }

  // Test 4: CASPER Epistemic Data Layer Separation, Cognitive Bias Guardrails & MCDA Sensitivity
  {
    const undervaluedEval = evaluateCasperNeighborhoodDecision(
      {
        hoodId: 8,
        hoodName: 'پونک',
        askingPricePerSqm: 146,
        estimatedDealPricePerSqm: 138,
        iqrLowPerSqm: 131,
        iqrHighPerSqm: 147,
        validSampleCount: 28,
        rejectedFraudCount: 3,
        confidenceScore: 91,
        marketStatus: 'undervalued',
        marketRegime: 'BALANCED',
        overallScore: 8.4,
        transitScore: 8.6,
        safetyScore: 8.2,
        rahn80m: 1650,
        intlCurrency: 'USD',
      },
      DEFAULT_CASPER_DECISION_WEIGHTS,
    );

    assert.equal(undervaluedEval.epistemicLayers.length, 4, 'Must decompose into 4 explicit epistemic layers');
    assert.equal(undervaluedEval.epistemicLayers[0].status, 'VERIFIED_OBSERVATION');
    assert.equal(undervaluedEval.epistemicLayers[1].status, 'UNVERIFIED_CLAIM');
    assert.equal(undervaluedEval.epistemicLayers[2].status, 'MODEL_INFERENCE');
    assert.equal(undervaluedEval.epistemicLayers[3].status, 'FIELD_VERIFICATION_REQUIRED');
    assert.equal(undervaluedEval.decisionVerdict, 'OPTIMAL_BUY');
    assert.ok(undervaluedEval.riskAdjustedUtilityScore >= 76);

    const bubbleEval = evaluateCasperNeighborhoodDecision(
      {
        hoodId: 1,
        hoodName: 'فرمانیه',
        askingPricePerSqm: 340,
        estimatedDealPricePerSqm: 295,
        iqrLowPerSqm: 265,
        iqrHighPerSqm: 350,
        validSampleCount: 9,
        rejectedFraudCount: 5,
        confidenceScore: 68,
        marketStatus: 'bubble',
        marketRegime: 'HOT',
        overallScore: 7.5,
        transitScore: 6.2,
        safetyScore: 8.0,
        rahn80m: 3200,
        intlCurrency: 'USD',
      },
      { priceWeight: 60, commuteWeight: 10, environmentWeight: 10, liquidityWeight: 10, safetyWeight: 10 },
    );

    assert.equal(bubbleEval.epistemicLayers[0].status, 'LOW_SAMPLE_CAUTION');
    assert.ok(bubbleEval.anchoringPremiumPct >= 14);
    assert.ok(bubbleEval.overpaymentRisk80mMillion >= 3500);
    assert.equal(bubbleEval.biasAlerts.find((b) => b.id === 'anchoring')?.severity, 'HIGH');
    assert.equal(bubbleEval.biasAlerts.find((b) => b.id === 'fomo')?.severity, 'HIGH');
    assert.notEqual(bubbleEval.decisionVerdict, 'OPTIMAL_BUY');
    passed++;
    console.log('  ✅ 4. CASPER 4-layer epistemic separation, cognitive bias alerts, and MCDA counterfactual sensitivity verified');
  }

  console.log(`\n🎉 ALL ${passed} STAGE 2.2 VALUATION & SOCIOECONOMIC TESTS PASSED!\n`);
}

runTests().catch((err) => {
  console.error('❌ Stage 2.2 Valuation & Socioeconomic Test Failed:', err);
  process.exit(1);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../src/data/multiCityData';
import { evaluateCasperNeighborhoodDecision } from '../src/cells/socioeconomic-intelligence/casperDecisionEngine';
import {
  buildNeighborhoodEpistemicDossier,
  computeConfidenceScoreDecomposition,
} from '../src/cells/decision-epistemology/epistemicDecisionEngine';
import { synthesizeExecutiveDecisionReport } from '../src/cells/decision-epistemology/unifiedDecisionSynthesisEngine';
import { computeLiquidityDepthAndTom } from '../src/utils/liquidityDepthAndTomEngine';
import { computeInflationAdjustedPrice } from '../src/utils/fxInflationDriftEngine';
import { evaluateDeedImpact } from '../src/utils/deedLegitimacyShieldEngine';
import { mergeEffectiveBargains } from '../src/utils/marketDataIntegrity';
import {
  assertValidClaimStateTransition,
  assertValidPolicyStateTransition,
  evaluatePolicyCoverageStatusWithLimitations,
  validateSettlementCalculations,
} from '../server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine';

describe('RADAR TEHRAN — Six Fundamental Crises Regression Suite', () => {
  it('Crisis 1: enforces policy/claim transitions, contractual deductible floor, and coverage limitations', () => {
    assertValidPolicyStateTransition('DRAFT', 'SUBMITTED');
    assert.throws(() => assertValidPolicyStateTransition('CANCELLED', 'ACTIVE'), /INVALID_POLICY_STATE_TRANSITION/);
    assertValidClaimStateTransition('APPROVED', 'SETTLEMENT_PENDING');
    assert.throws(() => assertValidClaimStateTransition('CLOSED', 'UNDER_REVIEW'), /INVALID_CLAIM_STATE_TRANSITION/);

    assert.throws(
      () =>
        validateSettlementCalculations({
          verifiedEligibleLossAmount: 200_000_000,
          deductibleAppliedAmount: 5_000_000,
          approvedSettlementAmount: 180_000_000,
          rejectedAmount: 15_000_000,
          applicableCoverageLimit: 300_000_000,
          contractualMinimumDeductible: 20_000_000,
        }),
      /DEDUCTIBLE_BELOW_CONTRACTUAL_MINIMUM/,
    );

    const report = evaluatePolicyCoverageStatusWithLimitations({
      policy: {
        policyId: 'pol_test',
        status: 'ACTIVE',
        verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
        providerConfirmedActive: true,
        coverageStartIso: '2026-01-01T00:00:00.000Z',
        coverageEndIso: '2027-01-01T00:00:00.000Z',
        insuredPropertyCanonicalIds: ['prop_1'],
        policyholderIsConfirmedPropertyOwner: true,
        financialStructure: {
          currency: 'IRR',
          paymentFrequency: 'ANNUAL',
          quotedPremiumAmount: null,
          issuedPremiumAmount: 100,
          clientReportedPaidAmount: 100,
          authoritativeConfirmedPaidAmount: 100,
          outstandingPremiumAmount: 0,
          refundedPremiumAmount: 0,
          authoritativePaymentRefIds: [],
          defaultDeductibleMethod: 'FIXED_AMOUNT',
          defaultDeductibleValue: 20,
        },
      } as any,
      coverages: [
        {
          coverageId: 'cov_1',
          policyId: 'pol_test',
          coverageCategory: 'FIRE',
          insuredAssetCanonicalIds: ['prop_1'],
          effectiveStartIso: '2026-01-01T00:00:00.000Z',
          effectiveEndIso: '2027-01-01T00:00:00.000Z',
        } as any,
      ],
      exclusions: [],
      asOfIso: '2026-03-01T00:00:00.000Z',
      queryRiskCategory: 'FIRE',
      queryAssetCanonicalId: 'prop_1',
      incidentDateIso: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(report.queriedRiskEvaluation.applicabilityConclusion, 'ELIGIBLE_SUBJECT_TO_ADJUSTMENT');
  });

  it('Crisis 2: zero-sample neighborhood decision avoids fake iqrLow=1 and false illiquidity veto', () => {
    const punak = INITIAL_NEIGHBORHOODS.find((n) => n.zone.includes('۵')) ?? INITIAL_NEIGHBORHOODS[0];
    const liq = computeLiquidityDepthAndTom({
      basePriceSqm: 372,
      unitAreaSqm: 80,
      zone: punak.zone,
      hasElevator: true,
      floor: 2,
      isBargainPrice: false,
    });
    const evalRes = evaluateCasperNeighborhoodDecision({
      hoodId: punak.id,
      hoodName: punak.name,
      askingPricePerSqm: 400,
      estimatedDealPricePerSqm: 372,
      iqrLowPerSqm: 0,
      iqrHighPerSqm: 0,
      validSampleCount: 0,
      rejectedFraudCount: 0,
      confidenceScore: 0,
      marketStatus: 'balanced',
      marketRegime: 'BALANCED',
      overallScore: 7.8,
      transitScore: 7.5,
      safetyScore: 8.0,
      liquidityScore: liq.liquidityScore,
      rahn80m: 3200,
      targetSqm: 80,
    });
    assert.ok(evalRes.targetOfferPerSqm >= 300, 'targetOfferPerSqm must not anchor to synthetic iqrLow=1');
    assert.ok(!evalRes.epistemicLayers[0].primaryMetricFa.includes('1 تا'), 'Observed layer must not display 1 تا X');
    assert.equal(evalRes.dimensionScores.liquidityUtility >= 48, true, 'Intrinsic liquidity must not fall below 48 due to 0 samples');
    assert.equal(evalRes.vetoReasonsFa.some((r) => r.includes('قفل نقدشوندگی')), false);
  });

  it('Crisis 3: calibrated negotiation floor never exceeds seller asking price', () => {
    const asking = 400;
    const calibratedBase = Math.round(asking * 0.93);
    const deed = evaluateDeedImpact(calibratedBase, 'TEK_BARG_OFFICIAL');
    const fx = computeInflationAdjustedPrice({ basePriceSqm: deed.discountedPriceSqm, dataAgeDays: 0, cityZone: 'منطقه ۵' });
    const floor = Math.min(asking, fx.adjustedCurrentPriceSqm);
    assert.ok(floor <= asking, `Expected negotiation floor (${floor}) <= asking (${asking})`);
  });

  it('Crisis 4: mergeEffectiveBargains merges incoming live-divar listings without dropping them', () => {
    const base = [
      { id: 'seed-1', type: 'خرید' as const, sqm: 85, priceText: '۳۴ میلیارد', floor: 3, buildAge: 5, street: 'پونک', title: 'پونک ۸۵ متری', discountPercent: 7, buyerProfitText: '۲ میلیارد' },
    ];
    const live = [
      { id: 'live-divar-901', type: 'خرید' as const, sqm: 92, priceText: '۳۵ میلیارد', floor: 4, buildAge: 3, street: 'سردار جنگل', title: 'آگهی زنده دیوار', discountPercent: 10, buyerProfitText: '۳.۵ میلیارد' },
    ];
    const merged = mergeEffectiveBargains(base, live, 11);
    assert.equal(merged.some((b) => b.id === 'live-divar-901'), true);
    assert.equal(merged.some((b) => b.id === 'seed-1'), true);
  });

  it('Crisis 5: zero-sample epistemic dossier & synthesis report do not fabricate 1 sample or 56% confidence', () => {
    const sampleHood = INITIAL_NEIGHBORHOODS[0];
    const zeroDecomp = computeConfidenceScoreDecomposition({
      validSampleCount: 0,
      rejectedFraudCount: 0,
      askingPricePerSqm: sampleHood.buyPerSqm,
      iqrLowPerSqm: Math.round(sampleHood.buyPerSqm * 0.94),
      iqrHighPerSqm: Math.round(sampleHood.buyPerSqm * 1.05),
    });
    assert.equal(zeroDecomp.totalConfidencePct, 0);
    assert.equal(zeroDecomp.sampleSufficiencyPoints, 0);

    const dossier = buildNeighborhoodEpistemicDossier({
      cityId: 'tehran',
      hoodId: sampleHood.id,
      hoodName: sampleHood.name,
      buyPerSqm: sampleHood.buyPerSqm,
      rahn80m: sampleHood.rahn80m,
    });
    assert.ok(!dossier.provenanceLayers[0].currentValueSummaryFa.includes('۱ نمونه پالایش‌شده'));
    assert.ok(!dossier.provenanceLayers[0].currentValueSummaryFa.includes('۰ نمونه'));

    const synth = synthesizeExecutiveDecisionReport(sampleHood.id, sampleHood.name, 'tehran', sampleHood.buyPerSqm);
    assert.equal(synth.askingPricePerSqm, sampleHood.buyPerSqm, 'Must not invent fake +8.5% seller asking markup');
    const epistemicPillar = synth.pillars.find((p) => p.id === 'EPISTEMIC');
    assert.ok(epistemicPillar && epistemicPillar.score < 35, `Expected zero-sample epistemic score < 35, got ${epistemicPillar?.score}`);
    assert.ok(synth.readinessScore <= 72 && synth.verdictId !== 'IMMEDIATE_EXECUTION', 'Zero-sample synthesis must not emit IMMEDIATE_EXECUTION');
  });

  it('Crisis 6: non-Tehran cities have distinct dynamic median rahn80m instead of hardcoded Tehran 1200', () => {
    const mashhadVals = MULTI_CITY_CONFIGS.mashhad.neighborhoods.map((n) => n.rahn80m).filter((v) => v > 0).sort((a, b) => a - b);
    const mashhadMedian = mashhadVals[Math.floor(mashhadVals.length / 2)];
    assert.notEqual(mashhadMedian, 1200, 'Dynamic city median rahn80m for Mashhad must reflect local market, not Tehran 1200');
  });
});

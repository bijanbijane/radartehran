/** @file src/features/onboarding/tests/stage48DecisionToolsArchitecture.test.ts — Stage 48 Acceptance & Architecture Suite */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateGeometricAreaWithProvenance,
  calculateRenovationEstimateAndDiff,
  compareNeighborhoodsWeightedTool,
  comparePropertiesDecisionTool,
  compareServiceOffersTool,
  filterByMandatoryAndScorePreferences,
  recordInitialPropertyObservation,
  shareAndVersionDecisionScenario,
  summarizeMaintenanceCostsSeparated,
  validateProjectScheduleDependencies,
} from '../services/decisionSupportToolsEngine';
import {
  STAGE48_BOUNDARIES_8,
  STAGE48_DT_COMPONENT_IDS_40,
  STAGE48_FORBIDDEN_DETERMINISTIC_PHRASES_FA,
  STAGE48_UI_DT_TASKS_35,
  STAGE48_UX_EVENTS_19,
  STAGE49_MONITORING_AXES_16,
} from '../services/decisionSupportToolsTypes';
import {
  INITIAL_STAGE48_ACTIVITIES,
  INITIAL_STAGE48_MAINTENANCE_COSTS,
  INITIAL_STAGE48_PROPERTIES,
  INITIAL_STAGE48_RENOVATION_OPS,
  INITIAL_STAGE48_SCENARIO,
  STAGE48_SERVICE_OFFERS,
} from '../services/stage48DecisionToolsFixtures';

describe('Stage 48 (RT-UI-DECISION-TOOLS-001) Acceptance & Architecture Suite', () => {
  it('T48-00: enforces 8 boundaries, 40 DT component IDs, 19 UX events, 35 UI-DT tasks, 6 forbidden phrases, and 16 Stage 49 preview axes', () => {
    assert.equal(STAGE48_BOUNDARIES_8.length, 8);
    assert.equal(STAGE48_DT_COMPONENT_IDS_40.length, 40);
    assert.equal(STAGE48_DT_COMPONENT_IDS_40[0], 'DT-01');
    assert.equal(STAGE48_DT_COMPONENT_IDS_40[39], 'DT-40');
    assert.equal(STAGE48_UX_EVENTS_19.length, 19);
    assert.equal(STAGE48_UI_DT_TASKS_35.length, 35);
    assert.equal(STAGE48_FORBIDDEN_DETERMINISTIC_PHRASES_FA.length, 6);
    assert.equal(STAGE49_MONITORING_AXES_16.length, 16);
  });

  it('T48-01, T48-02, T48-03, T48-15 (Acceptance Tests 1, 2, 3, 15): compares properties with manual vs database distinction, blocks missing price from becoming 0, and supports mobile step wizard', () => {
    const comp = comparePropertiesDecisionTool(INITIAL_STAGE48_PROPERTIES, true);
    assert.equal(comp.rows[0].sourceBadgeFa, 'ثبت‌شده در پایگاه رادار');
    assert.equal(comp.rows[1].sourceBadgeFa, 'ورودی دستی کاربر (خارج از پایگاه)');
    assert.equal(comp.mobileStepWizardActive, true);
    assert.equal(comp.dependsOnWideTableInMobile, false);

    const missingPriceProps = INITIAL_STAGE48_PROPERTIES.map((p, i) =>
      i === 1 ? { ...p, basePriceMillionToman: null } : p,
    );
    const missingComp = comparePropertiesDecisionTool(missingPriceProps, false);
    assert.equal(missingComp.canCompareTotalCost, false);
    assert.equal(missingComp.missingPriceSubstitutedWithZero, false);
    assert.equal(missingComp.rows[1].totalOwnershipCostM, null);
    assert.equal(
      missingComp.limitationMessageFa,
      'مقایسه هزینه کل ممکن نیست؛ اطلاعات قیمت گزینه دوم ثبت نشده است.',
    );
  });

  it('T48-04 & §14.3 (Acceptance Test 4): weighted neighborhood comparison discloses formula, skips missing criteria without zero-substitution, and separates mandatory filters from preference scores', () => {
    const res = compareNeighborhoodsWeightedTool({
      neighborhoods: [
        { hoodId: 'h1', nameFa: 'سعادت‌آباد', scoresByCriterion: { transit: 8, school: 9 } },
        { hoodId: 'h2', nameFa: 'پونک', scoresByCriterion: { transit: 8.5, school: null } },
      ],
      weights: { transit: 2, school: 3 },
    });
    assert.equal(res[0].calculableCriteriaCount, 2);
    assert.equal(res[1].calculableCriteriaCount, 1);
    assert.deepEqual(res[1].missingCriteria, ['school']);
    assert.equal(res[1].missingReplacedWithZero, false);

    const mandatoryCheck = filterByMandatoryAndScorePreferences({
      candidates: [
        { id: 'over_budget_high_score', priceM: 25000, preferenceScore: 99 },
        { id: 'in_budget_valid', priceM: 21000, preferenceScore: 84 },
      ],
      maxMandatoryBudgetM: 22000,
    });
    assert.deepEqual(mandatoryCheck.rankedEligibleIds, ['in_budget_valid']);
    assert.deepEqual(mandatoryCheck.excludedOverBudgetIds, ['over_budget_high_score']);
  });

  it('T48-05 (Acceptance Test 5): service offer comparison identifies cheapest, most complete scope, and shortest time without declaring a single absolute winner', () => {
    const offers = compareServiceOffersTool(STAGE48_SERVICE_OFFERS);
    assert.equal(offers.declaresAbsoluteWinner, false);
    assert.equal(offers.cheapestOfferId, 'off-48-2');
    assert.equal(offers.mostCompleteScopeOfferId, 'off-48-1');
    assert.equal(offers.shortestDurationOfferId, 'off-48-2');
  });

  it('T48-06, T48-07, T48-12 (Acceptance Tests 6, 7, 12): renovation cost estimate computes C_total + C_reserve and preserves previous scenario diff on material price update', () => {
    const baseCalc = calculateRenovationEstimateAndDiff({
      operations: INITIAL_STAGE48_RENOVATION_OPS,
      reservePercent: 10,
      previousScenario: INITIAL_STAGE48_SCENARIO,
    });
    assert.ok(baseCalc.cTotalM > 0);
    assert.ok(baseCalc.cBudgetM > baseCalc.cTotalM);

    const updatedOps = INITIAL_STAGE48_RENOVATION_OPS.map((op, i) =>
      i === 0 ? { ...op, unitPriceM: op.unitPriceM + 1.5 } : op,
    );
    const nextCalc = calculateRenovationEstimateAndDiff({
      operations: updatedOps,
      reservePercent: 10,
      previousScenario: { ...INITIAL_STAGE48_SCENARIO, totalResultM: baseCalc.cBudgetM },
    });
    assert.equal(nextCalc.previousVersionPreserved, true);
    assert.ok(nextCalc.deltaFromPreviousM > 0);
  });

  it('T48-08, T48-09, T48-10, T48-11 (Acceptance Tests 8, 9, 10, 11): detects project dependency conflict, separates 3 maintenance cost buckets, calculates geometric area without overwriting deed area, and forbids سالم است in property observation', () => {
    const sched = validateProjectScheduleDependencies(INITIAL_STAGE48_ACTIVITIES);
    assert.equal(sched.hasConflict, true);
    assert.equal(sched.isBindingContractorCommitment, false);

    const maint = summarizeMaintenanceCostsSeparated(INITIAL_STAGE48_MAINTENANCE_COSTS);
    assert.equal(maint.completedM, 14.5);
    assert.equal(maint.plannedM, 32.0);
    assert.equal(maint.reserveM, 18.0);
    assert.equal(maint.mergedWithoutDistinction, false);

    const area = calculateGeometricAreaWithProvenance({
      widthM: 8,
      lengthM: 12,
      measurementKind: 'مساحت هندسی محاسبه‌شده',
      deedAreaSqm: 94.5,
    });
    assert.equal(area.valid, true);
    if (area.valid) {
      assert.equal(area.areaSqm, 96);
      assert.equal(area.perimeterM, 40);
      assert.equal(area.replacesDeedAreaAutomatically, false);
    }

    const obs = recordInitialPropertyObservation({
      titleFa: 'بازدید سقف',
      locationFa: 'اتاق خواب',
      candidateStatus: 'سالم است',
      noteFa: 'بدون ترک ظاهری',
    });
    assert.equal(obs.status, 'بدون مشاهده مشکل ظاهری');
    assert.equal(obs.isStructuralHealthCertificate, false);
    assert.equal(obs.declaresDefinitiveTechnicalRootCause, false);
  });

  it('T48-13 & T48-14 (Acceptance Tests 13 & 14): selective scenario sharing strips private phone unless explicitly consented and preserves historical method version', () => {
    const shared = shareAndVersionDecisionScenario({
      scenario: INITIAL_STAGE48_SCENARIO,
      shareWithRole: 'invited_specialist',
      includePrivateOwnerPhone: true,
      explicitUserConsentForPrivateData: false,
      newEngineMethodVersion: 'v6.5-DT',
    });
    assert.equal(shared.sharedOwnerPhoneIncluded, false);
    assert.equal(shared.historicalResultBoundToMethodVersion, 'v6.4-DT');
    assert.equal(shared.historicalResultOverwrittenSilently, false);
  });
});

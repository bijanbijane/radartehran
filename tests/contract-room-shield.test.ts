import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateContractShield,
  STAGING_PROFILES,
} from '../src/utils/contractRoomShieldEngine.js';

test('calculateContractShield splits total price exactly across 3 milestones for ready deed', () => {
  const diagnosis = calculateContractShield(12000, 'READY_DEED_STANDARD');
  assert.equal(diagnosis.totalPriceMillion, 12000);
  assert.equal(diagnosis.stages.length, 3);

  const [s1, s2, s3] = diagnosis.stages;
  assert.equal(s1.recommendedPct, 50);
  assert.equal(s1.amountMillionToman, 6000);
  assert.equal(s2.recommendedPct, 40);
  assert.equal(s2.amountMillionToman, 4800);
  assert.equal(s3.recommendedPct, 10);
  assert.equal(s3.amountMillionToman, 1200);

  const sum = s1.amountMillionToman + s2.amountMillionToman + s3.amountMillionToman;
  assert.equal(sum, 12000, 'Sum of all stages must strictly equal total price');
});

test('calculateContractShield enforces 25% deed milestone for brand-new property with pending deed', () => {
  const diagnosis = calculateContractShield(20000, 'BRAND_NEW_PENDING_DEED');
  assert.equal(diagnosis.stages[2].recommendedPct, 25);
  assert.equal(diagnosis.stages[2].amountMillionToman, 5000);

  const sum = diagnosis.stages.reduce((acc, s) => acc + s.amountMillionToman, 0);
  assert.equal(sum, 20000);
});

test('calculateContractShield calculates symmetric daily penalty proportional to transaction value', () => {
  const diag10B = calculateContractShield(10000);
  const diag20B = calculateContractShield(20000);

  assert.ok(diag10B.symmetricDailyPenaltyMillion > 0);
  assert.ok(diag20B.symmetricDailyPenaltyMillion > diag10B.symmetricDailyPenaltyMillion);
  assert.equal(diag10B.symmetricDailyPenaltyMillion, 15);
  assert.equal(diag20B.symmetricDailyPenaltyMillion, 30);
});

test('calculateContractShield includes 1403 Kateb mandate, 4 safety clauses, and psychological defenses', () => {
  const diag = calculateContractShield(15000);

  assert.equal(diag.katebSystemMandate.appliesToGreenDeeds, true);
  assert.ok(diag.katebSystemMandate.description.includes('کاتب'));

  assert.ok(diag.safetyClauses.length >= 4);
  for (const c of diag.safetyClauses) {
    assert.ok(c.title.length > 5);
    assert.ok(c.clauseDraft.length > 20);
    assert.ok(c.whyCrucial.length > 10);
  }

  assert.ok(diag.psychologicalCounterTactics.length >= 3);
  for (const t of diag.psychologicalCounterTactics) {
    assert.ok(t.brokerTrap.length > 10);
    assert.ok(t.calmCounterResponse.length > 15);
  }
});

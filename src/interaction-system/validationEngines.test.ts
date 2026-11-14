/** @file src/interaction-system/validationEngines.test.ts — Fast Node unit tests for RT-UI-VALIDATION-001 & RT-UI-IMPLEMENT-001 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLLED_MIGRATION_AUDIT,
  CORE_USER_JOURNEYS,
  DEFAULT_UI_ROLLOUT_FLAGS,
  DEVICE_TEST_MATRIX,
  IMPLEMENTATION_PACKAGES_IMP,
  IMPLEMENTATION_PROHIBITIONS_DEV,
  MAP_QA_SCENARIOS_12,
  PAGE_QA_CHECKLIST_15,
  PERFORMANCE_BUDGETS,
  PILOT_MAP_SCOPE_ITEMS,
  PROTOTYPE_SCOPE_VP,
  QA_VALIDATION_DOMAINS,
  STAGE_10_ACCEPTANCE_COUNT,
  STAGE_10_DELIVERABLE_DOCS,
  STAGE_11_ACCEPTANCE_COUNT,
  VALIDATION_GATES,
} from './contracts/validationAndImplementContract';
import {
  aggregatePrivacySafeUxHealth,
  calculateIssuePriorityScore,
  canPassValidationGate,
  createEmptyUxHealthBucket,
  evaluatePerformanceBudget,
  getDefaultUiRolloutFlags,
  rollbackAllControlledFlags,
  toggleRolloutFlagSafe,
} from './validationEngines';

test('RT-UI-VALIDATION-001 & RT-UI-IMPLEMENT-001 contracts encode exact scope counts', () => {
  assert.equal(QA_VALIDATION_DOMAINS.length, 5);
  assert.equal(PROTOTYPE_SCOPE_VP.length, 14);
  assert.equal(CORE_USER_JOURNEYS.length, 5);
  assert.equal(DEVICE_TEST_MATRIX.length, 8);
  assert.equal(PERFORMANCE_BUDGETS.mapMetrics.length, 6);
  assert.equal(VALIDATION_GATES.length, 4);
  assert.equal(STAGE_10_DELIVERABLE_DOCS.length, 9);
  assert.equal(STAGE_10_ACCEPTANCE_COUNT, 30);
  assert.equal(STAGE_11_ACCEPTANCE_COUNT, 18);
  assert.equal(PILOT_MAP_SCOPE_ITEMS.length, 16);
  assert.equal(DEFAULT_UI_ROLLOUT_FLAGS.length, 6);
  assert.equal(IMPLEMENTATION_PROHIBITIONS_DEV.length, 12);
  assert.equal(MAP_QA_SCENARIOS_12.length, 12);
  assert.equal(IMPLEMENTATION_PACKAGES_IMP.length, 8);
  assert.equal(PAGE_QA_CHECKLIST_15.length, 15);
  assert.equal(CONTROLLED_MIGRATION_AUDIT.length, 6);
});

test('Stage 10 issue priority scoring and S0/S1 Gate blocking enforce Design Freeze safety', () => {
  assert.equal(calculateIssuePriorityScore(5, 4, 3), 60);
  assert.equal(calculateIssuePriorityScore(99, 0, -2), 5 * 1 * 1);

  const blocked = canPassValidationGate([
    {
      id: 'ISS-101',
      pageId: 'VP-03',
      componentId: 'C-PANEL',
      scenarioId: 'TEST-01',
      severity: 'S1',
      impact: 5,
      frequency: 4,
      recoveryDifficulty: 4,
      descriptionFa: 'نمایش قیمت متعلق به محله اشتباه',
      status: 'open',
    },
    {
      id: 'ISS-102',
      pageId: 'VP-01',
      componentId: 'C-CARD',
      scenarioId: 'TEST-02',
      severity: 'S3',
      impact: 2,
      frequency: 2,
      recoveryDifficulty: 1,
      descriptionFa: 'فاصله جزئی کارت',
      status: 'open',
    },
  ]);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockingIssues.length, 1);

  const cleared = canPassValidationGate([
    {
      id: 'ISS-101',
      pageId: 'VP-03',
      componentId: 'C-PANEL',
      scenarioId: 'TEST-01',
      severity: 'S1',
      impact: 5,
      frequency: 4,
      recoveryDifficulty: 4,
      descriptionFa: 'نمایش قیمت متعلق به محله اشتباه',
      status: 'verified',
    },
    {
      id: 'ISS-102',
      pageId: 'VP-01',
      componentId: 'C-CARD',
      scenarioId: 'TEST-02',
      severity: 'S3',
      impact: 2,
      frequency: 2,
      recoveryDifficulty: 1,
      descriptionFa: 'فاصله جزئی کارت',
      status: 'open',
    },
  ]);
  assert.equal(cleared.allowed, true);
});

test('Core Web Vitals evaluation, non-PII UX Health aggregation, and UI_FLAGS rollback behave deterministically', () => {
  assert.equal(
    evaluatePerformanceBudget({ lcpMs: 1850, inpMs: 120, cls: 0.04, selectionLatencyMs: 180 }).passedAll,
    true,
  );
  assert.equal(
    evaluatePerformanceBudget({ lcpMs: 3100, inpMs: 120, cls: 0.04, selectionLatencyMs: 180 }).lcpOk,
    false,
  );

  let health = createEmptyUxHealthBucket();
  health = aggregatePrivacySafeUxHealth(health, { kind: 'map_select', latencyMs: 100 });
  health = aggregatePrivacySafeUxHealth(health, { kind: 'map_select', latencyMs: 200 });
  health = aggregatePrivacySafeUxHealth(health, { kind: 'search_empty' });
  assert.equal(health.mapSelections, 2);
  assert.equal(health.avgSelectionLatencyMs, 150);
  assert.equal(health.zeroResultSearches, 1);

  const flags = toggleRolloutFlagSafe(getDefaultUiRolloutFlags(), 'new_valuation_flow', true);
  assert.equal(flags.find((f) => f.key === 'new_valuation_flow')?.enabled, true);

  const rolledBack = rollbackAllControlledFlags(flags);
  assert.equal(rolledBack.find((f) => f.key === 'new_valuation_flow')?.enabled, false);
  assert.equal(rolledBack.find((f) => f.key === 'new_map_shell')?.enabled, true);
});

/** @file src/interaction-system/interactionSystem.test.ts — Fast Node unit tests for RT-UI-INTERACTION-001 & RT-UI-VALIDATION-001 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_LIMITS,
  INTERACTION_ACCEPTANCE_CRITERIA,
  INTERACTION_MATRIX_INT,
  INTERACTION_PROHIBITIONS_INTX,
  MOTION_DURATION_TOKENS_MS,
  STAGE_10_QA_SCENARIOS,
  STAGE_9_REFERENCE_DOCS,
  STATE_DOMAIN_OWNERSHIP,
} from './contracts/interactionContract';
import {
  applyDraftFilters,
  buildFourPartInteractionError,
  buildPrivacySafeInteractionEvent,
  createDualFilterState,
  createIdempotentRequestKey,
  createLatestRequestGuard,
  discardDraftFilters,
  getActiveFilterChips,
  hasMapViewportMovedSignificantly,
  removeAppliedFilterChip,
  transitionModuleContext,
  validateComparisonSelection,
} from './interactionEngines';

test('RT-UI-INTERACTION-001 contracts enforce 5 state domains, 24 INT entries, 25 INTX prohibitions, 25 acceptance checks, and 4 reference docs', () => {
  assert.deepEqual(
    STATE_DOMAIN_OWNERSHIP.map((d) => d.domain),
    ['navigation', 'map', 'query', 'form', 'data']
  );
  assert.equal(INTERACTION_MATRIX_INT.length, 24);
  assert.equal(INTERACTION_PROHIBITIONS_INTX.length, 25);
  assert.equal(INTERACTION_ACCEPTANCE_CRITERIA.length, 25);
  assert.deepEqual(STAGE_9_REFERENCE_DOCS, [
    'RT-UI-INTERACTION-001',
    'RT-UI-STATE-001',
    'RT-UI-FLOW-001',
    'RT-UI-INTERACTION-QA-001',
  ]);
  assert.equal(MOTION_DURATION_TOKENS_MS.fast, 120);
  assert.equal(MOTION_DURATION_TOKENS_MS.standard, 180);
  assert.equal(MOTION_DURATION_TOKENS_MS.panel, 220);
  assert.equal(MOTION_DURATION_TOKENS_MS.sheet, 260);
  assert.equal(COMPARISON_LIMITS.maxNeighborhoods, 4);
  assert.equal(COMPARISON_LIMITS.maxProperties, 5);
  assert.equal(STAGE_10_QA_SCENARIOS.length, 4);
});

test('LatestRequestGuard prevents stale slower response from overwriting newer query (e.g. پاسداران -> ونک)', () => {
  const guard = createLatestRequestGuard();
  const reqPassdaran = guard.issue('پاسداران');
  const reqVanak = guard.issue('ونک');
  assert.equal(reqPassdaran.signal?.aborted, true);
  assert.equal(guard.isCurrent(reqPassdaran), false);
  assert.equal(guard.isCurrent(reqVanak), true);
  guard.cancelAll();
  assert.equal(guard.isCurrent(reqVanak), false);
});

test('DualFilterState separates Draft from Applied filters and removes single chips independently', () => {
  let state = createDualFilterState({ dealType: 'rent', hasParking: true, minSqm: 70, maxSqm: 150 });
  state = { ...state, draft: { ...state.draft, hasElevator: true } };
  // Applied still does not include draft-only hasElevator until explicitly applied
  assert.equal(state.applied.hasElevator, false);
  assert.equal(getActiveFilterChips(state.applied).some((c) => c.key === 'hasElevator'), false);

  state = discardDraftFilters(state);
  assert.equal(state.draft.hasElevator, false);

  state = { ...state, draft: { ...state.draft, hasElevator: true, hasStorage: true } };
  state = applyDraftFilters(state);
  assert.equal(state.applied.hasElevator, true);
  assert.equal(state.applied.hasStorage, true);

  state = removeAppliedFilterChip(state, 'hasParking');
  assert.equal(state.applied.hasParking, false);
  assert.equal(state.applied.hasElevator, true);
});

test('Map bounds change, module context transition, 4-part error, comparison parity, idempotency, and privacy telemetry behave deterministically', () => {
  const baseBounds = { north: 35.8, south: 35.65, east: 51.5, west: 51.3, zoom: 12 };
  assert.equal(hasMapViewportMovedSignificantly(baseBounds, baseBounds), false);
  assert.equal(hasMapViewportMovedSignificantly(baseBounds, { ...baseBounds, north: 35.85 }), true);

  const tx = transitionModuleContext('properties', 'properties', {
    hoodId: 5,
    dealMode: 'buy',
    targetDealMode: 'rent',
    buyBudgetMillion: 12000,
    lens: 'heatmap',
  });
  assert.equal(tx.preservedHoodId, 5);
  assert.equal(tx.preservedBuyBudget, null);
  assert.deepEqual(tx.strippedIncompatibleFilters, ['buyBudgetMillion']);
  assert.ok(tx.userNoticeFa?.includes('اجاره'));

  const err = buildFourPartInteractionError({
    whatHappened: 'اطلاعات لایه قیمت دریافت نشد.',
    affectedModule: 'لایه قیمت',
    unaffectedModulesNote: 'سایر لایه‌های نقشه فعال هستند.',
    previousStatePreserved: true,
    retryActionLabel: 'دریافت این لایه را دوباره امتحان کنید',
  });
  assert.equal(err.previousStatePreserved, true);
  assert.ok(err.formattedMessageFa.includes('سایر لایه‌های نقشه فعال هستند'));

  assert.equal(
    validateComparisonSelection('neighborhood', [
      { id: 1, unit: 'sqm', period: '1405-08', metricType: 'median_deal' },
      { id: 2, unit: 'sqm', period: '1405-08', metricType: 'median_deal' },
    ]).valid,
    true
  );
  assert.equal(
    validateComparisonSelection('neighborhood', [
      { id: 1, unit: 'sqm', period: '1405-08', metricType: 'ask_avg' },
      { id: 2, unit: 'sqm', period: '1405-08', metricType: 'median_deal' },
    ]).valid,
    false
  );
  assert.equal(
    validateComparisonSelection(
      'neighborhood',
      [1, 2, 3, 4, 5].map((id) => ({ id, unit: 'sqm', period: '1405-08', metricType: 'median_deal' }))
    ).valid,
    false
  );

  assert.equal(
    createIdempotentRequestKey({ hoodId: 5, sqm: 95, buildYear: 1398, attemptNonce: 'abc' }),
    'val-5-95-1398-abc'
  );

  const evt = buildPrivacySafeInteractionEvent({
    eventId: 'ev-1',
    eventType: 'valuation_submit',
    module: 'tools',
    outcome: 'success',
    durationMs: 145,
    metadata: { hoodId: 5, phone: '09120000000', email: 'a@b.com', rawInput: 'secret', sqm: 95 },
  });
  assert.equal(evt.privacyClassification, 'non_pii');
  assert.equal('phone' in evt.metadata, false);
  assert.equal('email' in evt.metadata, false);
  assert.equal('rawInput' in evt.metadata, false);
  assert.equal(evt.metadata.sqm, 95);
});

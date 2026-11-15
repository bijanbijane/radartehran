import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_RESULTS_PRESENTATION_019_SPEC_ID,
  RT_FE_STAGE20_BRIDGE_SPEC_ID,
  RT_RESULTS_LAYERS_9,
  RT_RESULTS_VIEW_REGISTRY_9,
  RT_RESULTS_STATES_10,
  RT_RESULTS_COLUMN_PRESETS_4,
  RT_RESULTS_EXECUTION_PHASES_12,
  RT_RESULTS_DELIVERABLES_23,
  formatResultFieldValue,
  evaluateResultSetIntegrity,
  evaluateSelectionModel,
  evaluateComparisonSet,
  resolveColumnPreferences,
  sanitizeResultsTelemetryEvent,
} from '../services/rtFeResultsPresentation019Engine';

test('Stage 19 (RT-FE-RESULTS-PRESENTATION-019): verifies 9 layers, 9 view modes, 10 states, 4 presets, 12 phases, 23 deliverables, and Stage 20 bridge', () => {
  assert.equal(RT_FE_RESULTS_PRESENTATION_019_SPEC_ID, 'RT-FE-RESULTS-PRESENTATION-019');
  assert.equal(RT_FE_STAGE20_BRIDGE_SPEC_ID, 'RT-FE-DATA-VISUALIZATION-020');
  assert.equal(RT_RESULTS_LAYERS_9.length, 9);
  assert.equal(RT_RESULTS_VIEW_REGISTRY_9.length, 9);
  assert.equal(RT_RESULTS_STATES_10.length, 10);
  assert.equal(RT_RESULTS_COLUMN_PRESETS_4.length, 4);
  assert.equal(RT_RESULTS_EXECUTION_PHASES_12.length, 12);
  assert.equal(RT_RESULTS_DELIVERABLES_23.length, 23);
  assert.equal(RT_RESULTS_DELIVERABLES_23[0]?.id, 'RT-FE-RESULTS-OUT-001');
  assert.equal(RT_RESULTS_DELIVERABLES_23[22]?.id, 'RT-FE-RESULTS-OUT-023');
});

test('Stage 19: distinguishes real zero from missing/confidential data, converts IRR to IRT without mutating raw value, and blocks query mismatch or private leaks', () => {
  const realZero = formatResultFieldValue({ rawValue: 0, fieldType: 'number' });
  assert.equal(realZero.isZero, true);
  assert.equal(realZero.availability, 'present');
  assert.equal(realZero.displayText, '۰');

  const missingVal = formatResultFieldValue({ rawValue: null, fieldType: 'number' });
  assert.equal(missingVal.isZero, false);
  assert.equal(missingVal.availability, 'missing');
  assert.equal(missingVal.displayText, 'داده ناموجود');

  const confidentialVal = formatResultFieldValue({ rawValue: 999, fieldType: 'number', availability: 'confidential' });
  assert.equal(confidentialVal.availability, 'confidential');
  assert.match(confidentialVal.displayText, /محرمانه/);

  const priceFmt = formatResultFieldValue({ rawValue: 125_000_000_000, fieldType: 'currency_irr_to_irt' });
  assert.equal(priceFmt.rawValue, 125_000_000_000);
  assert.match(priceFmt.displayText, /تومان/);

  const staleMix = evaluateResultSetIntegrity({
    activeQueryId: 'q-new',
    incomingQueryId: 'q-old',
    completeness: 'complete',
    isPublicContext: true,
    exposedFields: ['area', 'pricePerSqm'],
  });
  assert.equal(staleMix.accepted, false);

  const leakCheck = evaluateResultSetIntegrity({
    activeQueryId: 'q-new',
    incomingQueryId: 'q-new',
    completeness: 'partial',
    isPublicContext: true,
    exposedFields: ['area', 'ownerPhone', 'adminNotes'],
  });
  assert.equal(leakCheck.accepted, false);
  assert.deepEqual(leakCheck.leakedPrivateFields, ['ownerPhone', 'adminNotes']);
});

test('Stage 19: separates page vs query selection, rejects cross-unit comparison, resolves column preference hierarchy, and strips telemetry PII', () => {
  const pageSel = evaluateSelectionModel({
    selection: { mode: 'explicit', ids: ['p-1', 'p-2'] },
    pageTotal: 50,
    queryTotal: 5000,
  });
  assert.equal(pageSel.effectiveCount, 2);
  assert.equal(pageSel.backendRevalidationRequired, true);

  const querySel = evaluateSelectionModel({
    selection: { mode: 'all_matching', queryId: 'q-north', excludedIds: ['p-7'] },
    pageTotal: 50,
    queryTotal: 5000,
  });
  assert.equal(querySel.effectiveCount, 4999);
  assert.equal(querySel.requiresBulkConfirmation, true);

  const unitMismatch = evaluateComparisonSet([
    { id: 'n-1', entityType: 'Neighborhood', unit: 'IRT/sqm', period: '1405-08', value: 120 },
    { id: 'n-2', entityType: 'Neighborhood', unit: 'IRR/sqm', period: '1405-08', value: 1300 },
  ]);
  assert.equal(unitMismatch.comparable, false);

  const validMissingCmp = evaluateComparisonSet([
    { id: 'n-1', entityType: 'Neighborhood', unit: 'IRT/sqm', period: '1405-08', value: 120 },
    { id: 'n-2', entityType: 'Neighborhood', unit: 'IRT/sqm', period: '1405-07', value: null },
  ]);
  assert.equal(validMissingCmp.comparable, true);
  assert.equal(validMissingCmp.warningsFa.length, 2);

  const prefs = resolveColumnPreferences({
    registeredColumns: ['propertyType', 'area', 'neighborhood', 'pricePerSqm'],
    featureDefault: ['propertyType', 'area'],
    workspacePref: ['area', 'neighborhood'],
    userPref: ['area', 'pricePerSqm', 'ghostColumn'],
  });
  assert.equal(prefs.sourceLevel, 'user');
  assert.deepEqual(prefs.resolvedColumns, ['area', 'pricePerSqm']);
  assert.deepEqual(prefs.droppedUndefined, ['ghostColumn']);

  const tel = sanitizeResultsTelemetryEvent({
    event: 'bulk_action_triggered',
    entityType: 'Property',
    viewMode: 'table',
    activeColumnsCount: 6,
    extra: { ownerPhone: '09120000000', exactAddress: 'secret' },
  });
  assert.deepEqual(tel.strippedSensitiveFields, ['ownerPhone', 'exactAddress']);
  assert.equal('ownerPhone' in tel.safeEvent, false);
});

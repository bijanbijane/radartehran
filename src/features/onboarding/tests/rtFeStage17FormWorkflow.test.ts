import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_FORM_WORKFLOW_017_SPEC_ID,
  RT_FE_STAGE18_BRIDGE_SPEC_ID,
  RT_FORM_LAYERS_8,
  RT_FORM_REGISTRY_SAMPLE_7,
  RT_FORM_SEMANTIC_FIELDS_11,
  RT_FORM_WORKFLOW_STATES_9,
  RT_FORM_UPLOAD_STATES_9,
  RT_FORM_ADMIN_RISK_5,
  RT_FORM_EXECUTION_PHASES_12,
  RT_FORM_DELIVERABLES_30,
  normalizePersianNumericInput,
  convertMoneyValue,
  validatePropertyAndListingForm,
  evaluateDraftAndAutosaveTransition,
  evaluateWorkflowTransition,
  evaluateBulkImportBatch,
  sanitizeFormTelemetryEvent,
} from '../services/rtFeFormWorkflow017Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stage 17 (RT-FE-FORM-WORKFLOW-017)', () => {
  it('verifies 8 layers, 7 canonical form IDs, 11 semantic fields, 9 workflow & upload states, 5 admin risks, 12 phases, 30 deliverables, and Stage 18 bridge', () => {
    assert.equal(RT_FE_FORM_WORKFLOW_017_SPEC_ID, 'RT-FE-FORM-WORKFLOW-017');
    assert.equal(RT_FE_STAGE18_BRIDGE_SPEC_ID, 'RT-FE-SEARCH-FILTER-018');
    assert.equal(RT_FORM_LAYERS_8.length, 8);
    assert.equal(RT_FORM_REGISTRY_SAMPLE_7.length, 7);
    assert.equal(RT_FORM_SEMANTIC_FIELDS_11.length, 11);
    assert.equal(RT_FORM_WORKFLOW_STATES_9.length, 9);
    assert.equal(RT_FORM_UPLOAD_STATES_9.length, 9);
    assert.equal(RT_FORM_ADMIN_RISK_5.length, 5);
    assert.equal(RT_FORM_EXECUTION_PHASES_12.length, 12);
    assert.equal(RT_FORM_DELIVERABLES_30.length, 30);
    assert.equal(RT_FORM_DELIVERABLES_30[0]?.id, 'OUT-001');
    assert.equal(RT_FORM_DELIVERABLES_30[29]?.id, 'OUT-030');
  });

  it('normalizes Persian/Arabic digits & separators without destroying raw text, converts IRR/IRT cleanly, and separates Error vs Warning', () => {
    const faNum = normalizePersianNumericInput('۱۲٬۵۰۰٬۰۰۰٬۰۰۰');
    assert.equal(faNum.rawPreserved, '۱۲٬۵۰۰٬۰۰۰٬۰۰۰');
    assert.equal(faNum.parsedNumber, 12500000000);

    const arNum = normalizePersianNumericInput('١٢٥٠,000');
    assert.equal(arNum.parsedNumber, 1250000);

    assert.deepEqual(convertMoneyValue({ amount: 500, currency: 'IRT' }, 'IRR'), { amount: 5000, currency: 'IRR' });
    assert.deepEqual(convertMoneyValue({ amount: 5000, currency: 'IRR' }, 'IRT'), { amount: 500, currency: 'IRT' });

    const divZero = validatePropertyAndListingForm({ areaSqm: 0, dealType: 'sale', salePriceToman: 5000, neighborhoodMedianPerSqmToman: 120 });
    assert.equal(divZero.canSubmit, false);
    assert.ok(divZero.issues.some((i) => i.code === 'INVALID_AREA' && i.severity === 'error'));

    const unusualWarn = validatePropertyAndListingForm({ areaSqm: 100, dealType: 'sale', salePriceToman: 40000, neighborhoodMedianPerSqmToman: 120 });
    assert.equal(unusualWarn.canSubmit, true);
    assert.equal(unusualWarn.computedPricePerSqm, 400);
    assert.ok(unusualWarn.issues.some((i) => i.code === 'UNUSUAL_PRICE_BAND' && i.severity === 'warning'));

    const rentOk = validatePropertyAndListingForm({ areaSqm: 90, dealType: 'rent', depositToman: 1500, neighborhoodMedianPerSqmToman: 120 });
    assert.equal(rentOk.canSubmit, true);
  });

  it('guards Draft/Autosave conflict & storage, enforces Workflow review gates, handles Partial Import batches, and strips form PII', () => {
    assert.equal(
      evaluateDraftAndAutosaveTransition({ isSensitiveForm: true, storageTarget: 'local_storage_only', expectedVersion: 1, serverVersion: 1, isOffline: false, serverConfirmedSave: true }).status,
      'BlockedStorage',
    );
    assert.equal(
      evaluateDraftAndAutosaveTransition({ isSensitiveForm: true, storageTarget: 'server_draft_api', expectedVersion: 2, serverVersion: 3, isOffline: false, serverConfirmedSave: true }).status,
      'Conflict',
    );
    assert.equal(
      evaluateDraftAndAutosaveTransition({ isSensitiveForm: true, storageTarget: 'server_draft_api', expectedVersion: 3, serverVersion: 3, isOffline: false, serverConfirmedSave: false }).status,
      'Saving',
    );
    assert.equal(
      evaluateDraftAndAutosaveTransition({ isSensitiveForm: true, storageTarget: 'server_draft_api', expectedVersion: 3, serverVersion: 3, isOffline: false, serverConfirmedSave: true }).status,
      'Saved',
    );

    assert.equal(evaluateWorkflowTransition({ from: 'review', to: 'published', hasReviewerPermission: false, hasUnitPeriodAndSource: true }).allowed, false);
    assert.equal(evaluateWorkflowTransition({ from: 'review', to: 'published', hasReviewerPermission: true, hasUnitPeriodAndSource: false }).allowed, false);
    assert.equal(evaluateWorkflowTransition({ from: 'draft', to: 'published', hasReviewerPermission: true, hasUnitPeriodAndSource: true }).allowed, false);
    assert.equal(evaluateWorkflowTransition({ from: 'review', to: 'published', hasReviewerPermission: true, hasUnitPeriodAndSource: true }).allowed, true);

    const batch = evaluateBulkImportBatch([
      { rowNumber: 1, valid: true },
      { rowNumber: 2, valid: false, errorFa: 'کد محله نامعتبر' },
    ]);
    assert.equal(batch.status, 'partial');
    assert.equal(batch.accepted, 1);
    assert.equal(batch.rejected, 1);

    const telemetry = sanitizeFormTelemetryEvent({
      event: 'validation_failed',
      formId: 'property.create',
      durationMs: 900,
      extra: { phoneNumber: '0912', priceAmount: 5000, freeText: 'abc' },
    });
    assert.deepEqual(telemetry.strippedSensitiveFields.sort(), ['freeText', 'phoneNumber', 'priceAmount']);
    assert.equal('phoneNumber' in telemetry.safeEvent, false);
  });
});

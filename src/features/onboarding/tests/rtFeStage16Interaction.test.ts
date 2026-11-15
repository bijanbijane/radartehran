import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_INTERACTION_PATTERNS_016_SPEC_ID,
  RT_FE_STAGE17_BRIDGE_SPEC_ID,
  RT_INT_MODEL_STEPS_5,
  RT_INT_CATEGORIES_16,
  RT_INT_STATES_13,
  RT_INT_CONFIRMATION_LEVELS_5,
  RT_INT_RECOVERY_STRATEGIES_8,
  RT_INT_MOTION_TOKENS_5,
  RT_INT_EXECUTION_PHASES_10,
  RT_INT_DELIVERABLES_30,
  evaluateControlInteractionTrigger,
  evaluateActionConfirmationAndFeedback,
  evaluateSelectionAndToolbar,
  registerShortcutSafely,
  resolveMotionTiming,
  sanitizeInteractionTelemetryEvent,
} from '../services/rtFeInteraction016Engine';

describe('Tehran Radar Comprehensive Frontend Roadmap — Stage 16 (RT-FE-INTERACTION-PATTERNS-016)', () => {
  it('verifies 5 model steps, 16 categories, 13 states, 5 C0-C4 levels, 8 recovery strategies, 5 motion tokens, 10 phases, 30 deliverables, and Stage 17 bridge', () => {
    assert.equal(RT_FE_INTERACTION_PATTERNS_016_SPEC_ID, 'RT-FE-INTERACTION-PATTERNS-016');
    assert.equal(RT_FE_STAGE17_BRIDGE_SPEC_ID, 'RT-FE-FORM-WORKFLOW-017');
    assert.equal(RT_INT_MODEL_STEPS_5.length, 5);
    assert.equal(RT_INT_CATEGORIES_16.length, 16);
    assert.equal(RT_INT_STATES_13.length, 13);
    assert.equal(RT_INT_CONFIRMATION_LEVELS_5.length, 5);
    assert.equal(RT_INT_RECOVERY_STRATEGIES_8.length, 8);
    assert.equal(RT_INT_MOTION_TOKENS_5.length, 5);
    assert.equal(RT_INT_EXECUTION_PHASES_10.length, 10);
    assert.equal(RT_INT_DELIVERABLES_30.length, 30);
    assert.equal(RT_INT_DELIVERABLES_30[0]?.id, 'RT-FE-INT-OUT-001');
    assert.equal(RT_INT_DELIVERABLES_30[29]?.id, 'RT-FE-INT-OUT-030');
  });

  it('prevents double submission, blocks offline false success, enforces C0-C4 confirmation, honest progress, and bulk partial results', () => {
    assert.equal(evaluateControlInteractionTrigger({ currentState: 'Disabled', requiresServer: true }).accepted, false);
    assert.equal(evaluateControlInteractionTrigger({ currentState: 'Loading', allowConcurrent: false, requiresServer: true }).accepted, false);
    assert.equal(evaluateControlInteractionTrigger({ currentState: 'Idle', isOffline: true, requiresServer: true }).accepted, false);
    assert.equal(evaluateControlInteractionTrigger({ currentState: 'Idle', isOffline: false, requiresServer: true }).nextState, 'Loading');

    const c0 = evaluateActionConfirmationAndFeedback({
      riskLevel: 'C0',
      entityLabelFa: 'آگهی',
      totalTargets: 1,
      succeededTargets: 1,
      failedTargets: 0,
      hasReliableProgress: false,
    });
    assert.equal(c0.requiresConfirmation, false);
    assert.equal(c0.progressMode, 'indeterminate-honest');

    const c4Partial = evaluateActionConfirmationAndFeedback({
      riskLevel: 'C4',
      entityLabelFa: 'رکورد تأییدشده',
      totalTargets: 10,
      succeededTargets: 7,
      failedTargets: 3,
      hasReliableProgress: true,
    });
    assert.equal(c4Partial.requiresConfirmation, true);
    assert.equal(c4Partial.requiresTwoStepConfirm, true);
    assert.equal(c4Partial.actionResult.status, 'partial');
    assert.equal(c4Partial.progressMode, 'determinate-percentage');
  });

  it('governs 3-state hierarchical selection, duplicate shortcut prevention, reduced-motion timing, and PII-free interaction telemetry', () => {
    assert.equal(evaluateSelectionAndToolbar({ selectedIds: [], totalAvailableChildren: 4 }).parentCheckState, 'unchecked');
    assert.equal(evaluateSelectionAndToolbar({ selectedIds: ['1'], totalAvailableChildren: 4 }).parentCheckState, 'indeterminate');
    const twoSelected = evaluateSelectionAndToolbar({ selectedIds: ['1', '2'], totalAvailableChildren: 4 });
    assert.equal(twoSelected.showSelectionToolbar, true);
    assert.equal(twoSelected.canCompareProperties, true);
    assert.equal(evaluateSelectionAndToolbar({ selectedIds: ['1', '2', '3', '4'], totalAvailableChildren: 4 }).parentCheckState, 'checked');

    assert.equal(registerShortcutSafely(['Ctrl+K', 'Escape'], 'ctrl+k').registered, false);
    assert.equal(registerShortcutSafely(['Ctrl+K'], 'Alt+M').registered, true);

    assert.equal(resolveMotionTiming('panel', true).durationMs, 0);
    assert.equal(resolveMotionTiming('panel', false).durationMs, 220);

    const telemetry = sanitizeInteractionTelemetryEvent({
      event: 'interaction_completed',
      interactionId: 'INT-004',
      featureId: 'FEAT-PROP-001',
      status: 'completed',
      durationMs: 140,
      extra: { password: 'x', keystrokes: ['a'], paymentData: 'card' },
    });
    assert.deepEqual(telemetry.strippedFields.sort(), ['keystrokes', 'password', 'paymentData']);
    assert.equal('password' in telemetry.safeEvent, false);
  });
});

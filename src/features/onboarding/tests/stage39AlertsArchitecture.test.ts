/** @file src/features/onboarding/tests/stage39AlertsArchitecture.test.ts — Stage 39 Acceptance Scenarios */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE39_DESIGN_COMPONENT_IDS,
  aggregateRepeatedPropertyEvents,
  evaluateAlertTriggerQualification,
  shouldDeliverNotificationInQuietHours,
  transitionMonitoringLifecycle,
} from '../services/monitoringAlertsEngine';

test('Stage 39 (RT-UI-ALERTS-001): enforces cooldown, stale/sample guards, quiet-hours security exception, and pause lifecycle', () => {
  assert.equal(STAGE39_DESIGN_COMPONENT_IDS.length, 20);

  const baseRule = {
    ruleId: 'r1',
    monitoringId: 'm1',
    subjectKind: 'property' as const,
    subjectTitleFa: 'سعادت‌آباد ۱۱۸م',
    thresholdKind: 'percent_change' as const,
    thresholdValue: 5,
    unitFa: '٪',
    comparisonBasisFa: 'دوره قبل',
    frequency: 'daily_digest' as const,
    cooldownHours: 24,
    paused: false,
    requiresSampleSufficiency: false,
  };

  // Scenario 1: Asking price drop explicitly names "قیمت پیشنهادی آگهی"
  const priceDrop = evaluateAlertTriggerQualification({
    rule: baseRule,
    observedChangePctOrValue: -6,
    uniqueSampleCount: 1,
    minRequiredSamples: 1,
    dataAgeDays: 1,
    maxAllowedAgeDays: 7,
    hoursSinceLastSimilarNotification: 30,
  });
  assert.equal(priceDrop.shouldEmitNotification, true);
  assert.ok(priceDrop.safeWordingFa.includes('قیمت پیشنهادی آگهی'));

  // Scenario 2: Stale data suppresses fresh market change alert
  const staleRes = evaluateAlertTriggerQualification({
    rule: baseRule,
    observedChangePctOrValue: -8,
    uniqueSampleCount: 15,
    minRequiredSamples: 10,
    dataAgeDays: 20,
    maxAllowedAgeDays: 7,
    hoursSinceLastSimilarNotification: 30,
  });
  assert.equal(staleRes.shouldEmitNotification, false);

  // Scenario 3: Cooldown blocks duplicate notifications within 24h & aggregation summarizes repeats
  const dupRes = evaluateAlertTriggerQualification({
    rule: baseRule,
    observedChangePctOrValue: -7,
    uniqueSampleCount: 15,
    minRequiredSamples: 10,
    dataAgeDays: 1,
    maxAllowedAgeDays: 7,
    hoursSinceLastSimilarNotification: 4,
  });
  assert.equal(dupRes.shouldEmitNotification, false);
  assert.ok(aggregateRepeatedPropertyEvents('واحد الف', 3).includes('۳ نوبت') || aggregateRepeatedPropertyEvents('واحد الف', 3).includes('3 نوبت'));

  // Scenario 4: Paused monitoring stops emitting alerts until resumed
  const pausedRule = { ...baseRule, paused: true };
  assert.equal(
    evaluateAlertTriggerQualification({
      rule: pausedRule,
      observedChangePctOrValue: -10,
      uniqueSampleCount: 20,
      minRequiredSamples: 10,
      dataAgeDays: 1,
      maxAllowedAgeDays: 7,
      hoursSinceLastSimilarNotification: 48,
    }).shouldEmitNotification,
    false,
  );
  const mon = {
    id: 'm1',
    kind: 'neighborhood' as const,
    titleFa: 'نیاوران',
    status: 'active' as const,
    activeAlertRuleCount: 1,
    startedAtLabelFa: '۱۴۰۵',
    lastChangeSummaryFa: '—',
    targetRoute: '/tehran/niavaran',
  };
  assert.equal(transitionMonitoringLifecycle(mon, 'pause').status, 'paused');
  assert.equal(transitionMonitoringLifecycle(mon, 'resume').status, 'active');

  // Scenario 7: Neighborhood index with insufficient sample count emits qualified non-conclusive message
  const lowSampleRes = evaluateAlertTriggerQualification({
    rule: { ...baseRule, subjectKind: 'neighborhood', requiresSampleSufficiency: true },
    observedChangePctOrValue: -8,
    uniqueSampleCount: 4,
    minRequiredSamples: 10,
    dataAgeDays: 1,
    maxAllowedAgeDays: 7,
    hoursSinceLastSimilarNotification: 30,
  });
  assert.ok(lowSampleRes.safeWordingFa.includes('حجم نمونه برای نتیجه‌گیری درباره روند بازار کافی نیست'));

  // Quiet hours suppress market alerts at 23:00 but NEVER suppress account_security
  const settings = {
    inAppEnabled: true,
    browserPushConsentGranted: true,
    emailConsentGranted: false,
    smsConsentGranted: false,
    quietHoursStartHour: 22,
    quietHoursEndHour: 8,
    dailyNonEssentialCap: 10,
    securityAlertsMandatoryAlwaysOn: true as const,
  };
  assert.equal(shouldDeliverNotificationInQuietHours({ category: 'properties', currentHour24: 23, settings }).allowedExternalPush, false);
  assert.equal(shouldDeliverNotificationInQuietHours({ category: 'account_security', currentHour24: 23, settings }).allowedExternalPush, true);
});

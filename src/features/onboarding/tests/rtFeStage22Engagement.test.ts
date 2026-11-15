import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_ENGAGEMENT_022_SPEC_ID,
  RT_FE_STAGE23_BRIDGE_SPEC_ID,
  RT_ENG_CONCEPTS_10,
  RT_ENG_LAYERS_9,
  RT_ENG_FOLLOW_SCOPES_6,
  RT_ENG_WATCH_RULE_TYPES_8,
  RT_ENG_DELIVERABLES_35,
  evaluateConceptSeparationPolicy,
  evaluateEntityReferenceAndFavorite,
  evaluateTagUniqueness,
  evaluateWatchRuleAndNoiseFilter,
  evaluateNoteConflictAndShareAccess,
  evaluateNotificationPipelineAndTelemetry,
} from '../services/rtFeEngagement022Engine';

test('Stage 22 (RT-FE-ENTITY-ENGAGEMENT-022): verifies 10 concepts, 9 layers, 6 follow scopes, 8 watch rule types, 35 deliverables & Stage 23 bridge', () => {
  assert.equal(RT_FE_ENGAGEMENT_022_SPEC_ID, 'RT-FE-ENTITY-ENGAGEMENT-022');
  assert.equal(RT_FE_STAGE23_BRIDGE_SPEC_ID, 'RT-FE-NOTIFICATION-COMMUNICATION-023');
  assert.equal(RT_ENG_CONCEPTS_10.length, 10);
  assert.equal(RT_ENG_LAYERS_9.length, 9);
  assert.equal(RT_ENG_FOLLOW_SCOPES_6.length, 6);
  assert.equal(RT_ENG_WATCH_RULE_TYPES_8.length, 8);
  assert.equal(RT_ENG_DELIVERABLES_35.length, 35);
  assert.equal(RT_ENG_DELIVERABLES_35[0].id, 'RT-FE-ENGAGEMENT-OUT-001');
  assert.equal(RT_ENG_DELIVERABLES_35[34].id, 'RT-FE-ENGAGEMENT-OUT-035');
});

test('Stage 22: enforces concept separation, EntityReference & session-derived ownership, and Persian Arabic/ZWNJ tag deduplication', () => {
  const removeFav = evaluateConceptSeparationPolicy({ action: 'remove_favorite' });
  assert.equal(removeFav.preservesFollows, true);
  assert.equal(removeFav.preservesCollections, true);
  assert.equal(removeFav.preservesNotes, true);

  const deleteCol = evaluateConceptSeparationPolicy({ action: 'delete_collection' });
  assert.equal(deleteCol.preservesUnderlyingEntity, true);
  assert.equal(deleteCol.preservesEntityHistory, true);

  const cancelFollow = evaluateConceptSeparationPolicy({ action: 'cancel_follow' });
  assert.equal(cancelFollow.preservesEntityHistory, true);

  const spoofCheck = evaluateEntityReferenceAndFavorite({
    entityType: 'property',
    entityId: 'prop-1042',
    existingFavoriteKeySet: ['property:prop-1042'],
    clientSentOwnerUserId: 'user-other',
    embedsFullEntitySnapshot: true,
  });
  assert.equal(spoofCheck.valid, false);
  assert.equal(spoofCheck.idempotentDuplicateDetected, true);
  assert.equal(spoofCheck.sessionDerivedOwnerOnly, false);
  assert.equal(spoofCheck.issues.length, 2);

  const dupTag = evaluateTagUniqueness({
    title: 'گزينه\u200Cخريد',
    existingNormalizedTags: ['گزینه خرید'],
  });
  assert.equal(dupTag.valid, false);
  assert.equal(dupTag.duplicate, true);
  assert.equal(dupTag.normalizedTitle, 'گزینه خرید');

  const uniqueTag = evaluateTagUniqueness({
    title: 'سرمایه‌گذاری',
    existingNormalizedTags: ['گزینه خرید'],
  });
  assert.equal(uniqueTag.valid, true);
});

test('Stage 22: rejects vague watch rules, suppresses formatting/digit noise, guards note version conflicts & revoked share tokens, and isolates telemetry PII', () => {
  const vague = evaluateWatchRuleAndNoiseFilter({
    field: '',
    operator: '',
    isVagueNaturalPhrase: true,
    previousRawText: '۱۴۵۰۰',
    currentRawText: '14500',
    previousCanonicalValue: 14500,
    currentCanonicalValue: 14500,
  });
  assert.equal(vague.ruleAccepted, false);

  const noise = evaluateWatchRuleAndNoiseFilter({
    field: 'askingSalePrice',
    operator: 'decrease_percent',
    threshold: 5,
    unit: 'percent',
    previousRawText: '۱۴۵۰۰',
    currentRawText: '14500',
    previousCanonicalValue: 14500,
    currentCanonicalValue: 14500,
  });
  assert.equal(noise.ruleAccepted, true);
  assert.equal(noise.noiseSuppressed, true);
  assert.equal(noise.materialChangeDetected, false);

  const conflictAndShare = evaluateNoteConflictAndShareAccess({
    clientNoteVersion: 2,
    serverNoteVersion: 3,
    shareTokenExpired: false,
    shareTokenRevoked: true,
    clientClaimedRole: 'editor',
    grantedRole: 'viewer',
  });
  assert.equal(conflictAndShare.requiresConflictResolution, true);
  assert.equal(conflictAndShare.noteSaveAllowed, false);
  assert.equal(conflictAndShare.shareAccessAllowed, false);
  assert.equal(conflictAndShare.resolvedRole, 'viewer');
  assert.equal(conflictAndShare.issues.length, 3);

  const notifyOut = evaluateNotificationPipelineAndTelemetry({
    incomingEventId: 'evt-900',
    seenEventIds: ['evt-900'],
    incomingPriority: 'critical',
    targetBatchHasNormalAlerts: true,
    quietHoursActive: true,
    telemetryPayload: {
      action: 'create_watch_rule',
      noteContent: 'خیلی عالی برای خرید شخصی',
      shareToken: 'tok-secret-88',
      entityType: 'property',
    },
  });
  assert.equal(notifyOut.shouldEmitNotification, false);
  assert.equal(notifyOut.canMergeIntoNormalBatch, false);
  assert.equal(notifyOut.deliveryAction, 'deduplicated_skip');
  assert.deepEqual(notifyOut.strippedPiiKeys.sort(), ['noteContent', 'shareToken']);
});

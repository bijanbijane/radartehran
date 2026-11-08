import assert from 'node:assert/strict';
import {
  createPropertyViewingsModuleFacade, InMemoryPropertyViewingsStore,
  ViewingActorContext, ViewingError,
} from '../index';
const hostActor: ViewingActorContext = {
  userId: 'host_agent_01', role: 'AUTHORIZED_HOST',
  brokerageOrganizationId: 'borg_teh_01', };
const buyerActor: ViewingActorContext = {
  userId: 'buyer_user_101', role: 'BUYER_OR_TENANT',
};
const secondBuyerActor: ViewingActorContext = {
  userId: 'buyer_user_202', role: 'BUYER_OR_TENANT',
};
const ownerActor: ViewingActorContext = {
  userId: 'owner_user_500', role: 'PROPERTY_OWNER',
};
const strangerActor: ViewingActorContext = {
  userId: 'unauthorized_viewer', role: 'BUYER_OR_TENANT',
};
async function expectViewingError(
  fn: () => Promise<unknown>, expectedCode: string
): Promise<ViewingError> {
  try {
    await fn();
    assert.fail(`Expected ViewingError(${expectedCode}) but succeeded`);
  } catch (err) {
    assert.ok(err instanceof ViewingError, `Expected ViewingError, got ${String(err)}`);
    assert.equal(err.code, expectedCode);
    return err;
  }
}
async function runTests() {
  console.log('Running Property Viewing & Appointment Scheduling 32-scenario test suite...');
  const store = new InMemoryPropertyViewingsStore();
  const facade = createPropertyViewingsModuleFacade({ store });
  // 2. Invalid property references
  await expectViewingError(
    () =>
      facade.createViewingRequest(buyerActor, {
        propertyId: 'invalid_prop_999', hostUserId: hostActor.userId,
        appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T09:00:00.000Z',
        requestedEndIso: '2026-06-10T10:00:00.000Z', timezoneId: 'Asia/Tehran',
        locationOrMeetingSummary: 'Lobby', }),
    'INVALID_PROPERTY_REFERENCE'
  );
  // 3. Property access authorization (restricted off-market property denied to unauthorized viewer)
  await expectViewingError(
    () =>
      facade.createViewingRequest(strangerActor, {
        propertyId: 'restricted_offmarket_01', hostUserId: hostActor.userId,
        appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T09:00:00.000Z',
        requestedEndIso: '2026-06-10T10:00:00.000Z', timezoneId: 'Asia/Tehran',
        locationOrMeetingSummary: 'Private villa', }),
    'UNAUTHORIZED_PROPERTY_VIEWING_ACCESS'
  );
  // 4. Host authorization (unaffiliated agent cannot host viewing merely because listing is public)
  await expectViewingError(
    () =>
      facade.createViewingRequest(buyerActor, {
        propertyId: 'prop_teh_101', hostUserId: 'unaffiliated_agent_99',
        appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T09:00:00.000Z',
        requestedEndIso: '2026-06-10T10:00:00.000Z', timezoneId: 'Asia/Tehran',
        locationOrMeetingSummary: 'Lobby', }),
    'UNAUTHORIZED_HOST_OR_AGENT'
  );
  // 7 & 9. Timezone handling & invalid time ranges
  await expectViewingError(
    () =>
      facade.registerAvailabilityWindow(hostActor, {
        availabilityType: 'ONE_TIME_AVAILABLE', startIso: '2026-06-10T08:00:00.000Z',
        endIso: '2026-06-10T12:00:00.000Z', timezoneId: 'Invalid/Timezone_Name',
      }), 'INVALID_TIMEZONE'
  );
  await expectViewingError(
    () =>
      facade.registerAvailabilityWindow(hostActor, {
        availabilityType: 'ONE_TIME_AVAILABLE', startIso: '2026-06-10T12:00:00.000Z',
        endIso: '2026-06-10T08:00:00.000Z', timezoneId: 'Asia/Tehran',
      }), 'INVALID_TIME_RANGE'
  );
  // 5 & 6. Availability registration & recurring availability validation
  await expectViewingError(
    () =>
      facade.registerAvailabilityWindow(hostActor, {
        availabilityType: 'RECURRING_AVAILABLE', startIso: '2026-06-01T00:00:00.000Z',
        endIso: '2026-06-30T00:00:00.000Z', timezoneId: 'Asia/Tehran',
        recurrenceRule: { daysOfWeek: [], localStartTimeHm: '14:00', localEndTimeHm: '10:00' }, }),
    'VALIDATION_FAILED'
  );
  const availWindow = await facade.registerAvailabilityWindow(hostActor, {
    id: 'vavail_teh_01', propertyId: 'prop_teh_101',
    availabilityType: 'ONE_TIME_AVAILABLE', startIso: '2026-06-10T08:00:00.000Z',
    endIso: '2026-06-10T12:00:00.000Z', timezoneId: 'Asia/Tehran',
    capacity: 2, bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15, minAdvanceNoticeMinutes: 60,
    maxAdvanceHorizonDays: 14, });
  assert.equal(availWindow.timezoneId, 'Asia/Tehran');
  // 8. Daylight-saving transitions (America/New_York spring-forward March 8, 2026)
  const dstHost: ViewingActorContext = { userId: 'host_ny_dst', role: 'AUTHORIZED_HOST' };
  await facade.registerAvailabilityWindow(dstHost, {
    propertyId: 'prop_ny_01', availabilityType: 'RECURRING_AVAILABLE',
    startIso: '2026-03-08T13:00:00.000Z', // 09:00 EDT after spring forward
    endIso: '2026-03-08T16:00:00.000Z', // 12:00 EDT
    timezoneId: 'America/New_York',
    recurrenceRule: { daysOfWeek: [0], localStartTimeHm: '09:00', localEndTimeHm: '12:00' },
    minAdvanceNoticeMinutes: 30, maxAdvanceHorizonDays: 30,
  });
  const dstSlots = await facade.generateViewingSlots({
    propertyId: 'prop_ny_01', hostUserId: dstHost.userId,
    rangeStartIso: '2026-03-08T13:00:00.000Z', rangeEndIso: '2026-03-08T16:00:00.000Z',
    slotDurationMinutes: 60, asOfIso: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(dstSlots.length, 3);
  assert.ok(dstSlots[0].localStartDisplay.includes('09:00 (America/New_York)'));
  // 10 & 13. Viewing slot generation & buffer duration handling (60m slot + 15m before + 15m after = 90m step -> 3 slots: 08:00, 09:30, 11:00)
  const slots = await facade.generateViewingSlots({
    propertyId: 'prop_teh_101', hostUserId: hostActor.userId,
    rangeStartIso: '2026-06-10T08:00:00.000Z', rangeEndIso: '2026-06-10T12:00:00.000Z',
    slotDurationMinutes: 60, asOfIso: '2026-06-05T08:00:00.000Z',
  });
  assert.equal(slots.length, 3);
  assert.equal(slots[0].startIso, '2026-06-10T08:00:00.000Z');
  assert.equal(slots[1].startIso, '2026-06-10T09:30:00.000Z');
  assert.equal(slots[2].startIso, '2026-06-10T11:00:00.000Z');
  // 11. Minimum booking notice violation (< 60 minutes before start)
  await expectViewingError(
    () =>
      facade.createViewingRequest(buyerActor, {
        propertyId: 'prop_teh_101', hostUserId: hostActor.userId,
        appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T08:00:00.000Z',
        requestedEndIso: '2026-06-10T09:00:00.000Z', timezoneId: 'Asia/Tehran',
        locationOrMeetingSummary: 'Main gate',
        nowIso: '2026-06-10T07:30:00.000Z', // only 30 mins notice
      }), 'MIN_BOOKING_NOTICE_VIOLATION'
  );
  // 12. Maximum booking horizon exceeded (> 14 days in advance)
  await expectViewingError(
    () =>
      facade.createViewingRequest(buyerActor, {
        propertyId: 'prop_teh_101', hostUserId: hostActor.userId,
        appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T08:00:00.000Z',
        requestedEndIso: '2026-06-10T09:00:00.000Z', timezoneId: 'Asia/Tehran',
        locationOrMeetingSummary: 'Main gate',
        nowIso: '2026-05-01T00:00:00.000Z', // 40 days ahead
      }), 'MAX_BOOKING_HORIZON_EXCEEDED'
  );
  // 1 & 29. Viewing request creation + Idempotency
  const appt1 = await facade.createViewingRequest(buyerActor, {
    id: 'vappt_01', propertyId: 'prop_teh_101',
    listingId: 'list_teh_101', hostUserId: hostActor.userId,
    brokerageOrganizationId: 'borg_teh_01', appointmentType: 'IN_PERSON_VIEWING',
    requestedStartIso: '2026-06-10T08:00:00.000Z', requestedEndIso: '2026-06-10T09:00:00.000Z',
    timezoneId: 'Asia/Tehran', capacity: 2,
    locationOrMeetingSummary: 'Punak Tower A Lobby', idempotencyKey: 'idem_view_req_01',
    nowIso: '2026-06-05T08:00:00.000Z', isSyntheticTestFixture: true,
  });
  assert.equal(appt1.status, 'PENDING_HOST_CONFIRMATION');
  const idemAppt1 = await facade.createViewingRequest(buyerActor, {
    propertyId: 'prop_teh_101', hostUserId: hostActor.userId,
    appointmentType: 'IN_PERSON_VIEWING', requestedStartIso: '2026-06-10T08:00:00.000Z',
    requestedEndIso: '2026-06-10T09:00:00.000Z', timezoneId: 'Asia/Tehran',
    locationOrMeetingSummary: 'Punak Tower A Lobby', idempotencyKey: 'idem_view_req_01',
    nowIso: '2026-06-05T08:00:00.000Z', });
  assert.equal(idemAppt1.id, appt1.id);
  // 17. Temporary reservation expiration
  const expiredHold = await facade.createTemporarySlotHold(buyerActor, {
    propertyId: 'prop_teh_101', hostUserId: hostActor.userId,
    startIso: '2026-06-10T08:00:00.000Z', endIso: '2026-06-10T09:00:00.000Z',
    holdDurationMinutes: 5, nowIso: '2026-06-05T08:00:00.000Z',
  });
  await expectViewingError(
    () =>
      facade.confirmViewingReservation(hostActor, {
        appointmentId: appt1.id, slotHoldId: expiredHold.id,
        nowIso: '2026-06-05T08:10:00.000Z', // 10 minutes later -> hold expired
      }), 'HOLD_EXPIRED_OR_INVALID'
  );
  // 18, 14 & 15. Host confirmation workflow, double-booking prevention & concurrent booking attempts
  // Client cannot self-confirm
  await expectViewingError(
    () => facade.confirmViewingReservation(buyerActor, { appointmentId: appt1.id }), 'INSUFFICIENT_PRIVILEGE'
  );
  // Create competing appointment for exact same slot
  const competingAppt = await facade.createViewingRequest(secondBuyerActor, {
    id: 'vappt_competing_02', propertyId: 'prop_teh_101',
    hostUserId: hostActor.userId, appointmentType: 'IN_PERSON_VIEWING',
    requestedStartIso: '2026-06-10T08:00:00.000Z', requestedEndIso: '2026-06-10T09:00:00.000Z',
    timezoneId: 'Asia/Tehran', locationOrMeetingSummary: 'Punak Tower A Lobby',
    nowIso: '2026-06-05T08:00:00.000Z', isSyntheticTestFixture: true,
  });
  // Fire two concurrent confirmations for the same slot; exactly one succeeds and one fails with SCHEDULING_CONFLICT_DOUBLE_BOOKING
  const concurrentResults = await Promise.allSettled([
    facade.confirmViewingReservation(hostActor, { appointmentId: appt1.id, nowIso: '2026-06-05T08:01:00.000Z' }),
    facade.confirmViewingReservation(hostActor, { appointmentId: competingAppt.id, nowIso: '2026-06-05T08:01:00.000Z' }),
  ]);
  const fulfilled = concurrentResults.filter((r) => r.status === 'fulfilled');
  const rejected = concurrentResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0].reason as ViewingError).code, 'SCHEDULING_CONFLICT_DOUBLE_BOOKING');
  // 16 & 19. Capacity enforcement & participant invitation permissions
  await expectViewingError(
    () =>
      facade.inviteParticipant(strangerActor, {
        appointmentId: appt1.id, participantId: 'guest_01',
        role: 'ADDITIONAL_INVITED_PARTICIPANT', }),
    'INSUFFICIENT_PRIVILEGE'
  );
  const withGuest1 = await facade.inviteParticipant(buyerActor, {
    appointmentId: appt1.id, participantId: 'spouse_user_102',
    role: 'ADDITIONAL_INVITED_PARTICIPANT', canViewAccessInstructions: false,
  });
  //Invitation is not treated as confirmed attendance until accepted
  assert.equal(withGuest1.participants[1].invitationStatus, 'INVITED');
  assert.equal(withGuest1.participants[1].confirmationStatus, 'UNCONFIRMED');
  // Capacity is 2 (buyer + spouse = 2) -> inviting a 3rd participant fails with CAPACITY_EXCEEDED
  await expectViewingError(
    () =>
      facade.inviteParticipant(buyerActor, {
        appointmentId: appt1.id, participantId: 'extra_guest_103',
        role: 'ADDITIONAL_INVITED_PARTICIPANT', }),
    'CAPACITY_EXCEEDED'
  );
  // 20. Unauthorized rescheduling & valid rescheduling with history preservation
  await expectViewingError(
    () =>
      facade.rescheduleAppointment(strangerActor, {
        appointmentId: appt1.id, newStartIso: '2026-06-10T09:30:00.000Z',
        newEndIso: '2026-06-10T10:30:00.000Z', reasonCategory: 'HACK_ATTEMPT',
      }), 'INSUFFICIENT_PRIVILEGE'
  );
  const rescheduledAppt = await facade.rescheduleAppointment(hostActor, {
    appointmentId: appt1.id, newStartIso: '2026-06-10T09:30:00.000Z',
    newEndIso: '2026-06-10T10:30:00.000Z', reasonCategory: 'TRAFFIC_DELAY',
  });
  assert.equal(rescheduledAppt.status, 'RESCHEDULED');
  assert.equal(rescheduledAppt.rescheduleHistory.length, 1);
  assert.equal(rescheduledAppt.rescheduleHistory[0].originalStartIso, '2026-06-10T08:00:00.000Z');
  // 22. Private access instruction protection & permanent credential rejection
  await expectViewingError(
    () =>
      facade.registerAccessCoordinationReference(hostActor, {
        appointmentId: appt1.id, accessMethod: 'HOST_ACCOMPANIES_VISITORS',
        validityStartIso: '2026-06-10T09:00:00.000Z', validityEndIso: '2026-06-10T11:00:00.000Z',
        restrictedAccessInstructions: 'Building Master Password is 9999', authorizationSourceRef: 'mandate_01',
      }), 'PERMANENT_CREDENTIAL_FORBIDDEN'
  );
  await facade.registerAccessCoordinationReference(hostActor, {
    appointmentId: appt1.id, accessMethod: 'HOST_ACCOMPANIES_VISITORS',
    validityStartIso: '2026-06-10T09:00:00.000Z', validityEndIso: '2026-06-10T11:00:00.000Z',
    restrictedAccessInstructions: 'Meet host at North Security Desk with temporary visitor badge #42',
    authorizationSourceRef: 'mandate_01', });
  await expectViewingError(
    () => facade.retrieveAuthorizedAccessInstructions(strangerActor, appt1.id, '2026-06-10T09:30:00.000Z'),
    'ACCESS_INSTRUCTIONS_EXPIRED_OR_RESTRICTED'
  );
  // Also expired after validityEndIso
  await expectViewingError(
    () => facade.retrieveAuthorizedAccessInstructions(buyerActor, appt1.id, '2026-06-10T12:00:00.000Z'),
    'ACCESS_INSTRUCTIONS_EXPIRED_OR_RESTRICTED'
  );
  const validAccess = await facade.retrieveAuthorizedAccessInstructions(
    buyerActor, appt1.id,
    '2026-06-10T09:30:00.000Z'
  );
  assert.ok(validAccess.disclosedToUserIds.includes(buyerActor.userId));
  // 23. Virtual meeting link privacy & consent-gated recording
  await expectViewingError(
    () =>
      facade.createVirtualViewingSessionReference(hostActor, {
        appointmentId: appt1.id, meetingProviderRef: 'approved_provider_meet',
        privateMeetingUrlRef: 'https://meet.example/private-session-123',
        recordingConsentGranted: false, recordingRef: 'rec_illegal_without_consent',
      }), 'VALIDATION_FAILED'
  );
  await facade.createVirtualViewingSessionReference(hostActor, {
    appointmentId: appt1.id, meetingProviderRef: 'approved_provider_meet',
    privateMeetingUrlRef: 'https://meet.example/private-session-123',
    recordingConsentGranted: false, });
  await expectViewingError(
    () => facade.retrieveVirtualViewingSessionReference(strangerActor, appt1.id), 'INSUFFICIENT_PRIVILEGE'
  );
  const virtSession = await facade.retrieveVirtualViewingSessionReference(buyerActor, appt1.id);
  assert.equal(virtSession.privateMeetingUrlRef, 'https://meet.example/private-session-123');
  // 24 & 25. Attendance recording authorization & self-reported vs host-reported attendance
  await expectViewingError(
    () =>
      facade.recordAttendance(strangerActor, {
        appointmentId: appt1.id, participantId: buyerActor.userId,
        attendanceState: 'ATTENDED', verificationMethod: 'Unauthorized claim',
      }), 'INSUFFICIENT_PRIVILEGE'
  );
  const selfAtt = await facade.recordAttendance(buyerActor, {
    appointmentId: appt1.id, participantId: buyerActor.userId,
    attendanceState: 'ATTENDED', verificationMethod: 'Buyer check-in note',
  });
  assert.equal(selfAtt.provenance, 'PARTICIPANT_SELF_REPORTED');
  const hostAtt = await facade.recordAttendance(hostActor, {
    appointmentId: appt1.id, participantId: buyerActor.userId,
    attendanceState: 'ATTENDED', verificationMethod: 'Host visual sign-in sheet',
  });
  assert.equal(hostAtt.provenance, 'HOST_REPORTED');
  // 26. Feedback visibility permissions (private comments stripped for property owner)
  await facade.recordViewingFeedback(buyerActor, {
    appointmentId: appt1.id, interestClassification: 'CONSIDERING_AN_OFFER',
    privateComments: 'Private buyer note: willing to bid up to 92B Rials if kitchen is renovated.',
    ownerApprovedSummary: 'Buyer liked natural light; inquiring about kitchen appliances.',
    discloseSummaryToOwnerOrListingRep: true, });
  const ownerViewFeedback = await facade.retrieveViewingFeedbackForActor(ownerActor, appt1.id);
  assert.equal(ownerViewFeedback.length, 1);
  assert.equal('privateComments' in ownerViewFeedback[0], false);
  assert.equal(ownerViewFeedback[0].ownerApprovedSummary, 'Buyer liked natural light; inquiring about kitchen appliances.');
  await expectViewingError(
    () => facade.retrieveViewingFeedbackForActor(strangerActor, appt1.id), 'INSUFFICIENT_PRIVILEGE'
  );
  // 21. Cancellation history preservation (cancel a 3rd appointment)
  const apptToCancel = await facade.createViewingRequest(buyerActor, {
    id: 'vappt_cancel_03', propertyId: 'prop_teh_101',
    hostUserId: hostActor.userId, appointmentType: 'IN_PERSON_VIEWING',
    requestedStartIso: '2026-06-12T08:00:00.000Z', requestedEndIso: '2026-06-12T09:00:00.000Z',
    timezoneId: 'Asia/Tehran', locationOrMeetingSummary: 'Lobby',
    nowIso: '2026-06-05T08:00:00.000Z', isSyntheticTestFixture: true,
  });
  const cancelledAppt = await facade.cancelAppointment(buyerActor, {
    appointmentId: apptToCancel.id, cancellationReason: 'Travel schedule change',
    cancelledAtIso: '2026-06-11T08:00:00.000Z', });
  assert.equal(cancelledAppt.status, 'CANCELLED');
  assert.equal(cancelledAppt.cancellationRecord?.classification, 'STANDARD_NOTICE');
  // 27 & 28. Notification event creation & delivery claims not being fabricated
  const history = await facade.retrieveAppointmentHistory(hostActor, appt1.id);
  assert.ok(history.notifications.length >= 3);
  for (const notif of history.notifications) {
    assert.notEqual(notif.deliveryStage, 'DELIVERED_VERIFIED');
    assert.equal(notif.deliveryStage, 'ACCEPTED_BY_PROVIDER');
  }
  // Operational metrics report
  const metrics = await facade.retrieveOperationalViewingMetrics(hostActor, {
    propertyId: 'prop_teh_101',
    period: { fromIso: '2026-06-01T00:00:00.000Z', toIso: '2026-06-30T00:00:00.000Z' },
    timezoneId: 'Asia/Tehran', });
  assert.equal(metrics.metrics.totalViewingRequests.value, 3);
  assert.equal(metrics.metrics.completedViewings.value, 1);
  assert.equal(metrics.metrics.cancelledAppointments.value, 1);
  // 30. Persistence failure handling
  store.triggerNextWriteFailure();
  await expectViewingError(
    () =>
      facade.cancelAppointment(hostActor, {
        appointmentId: competingAppt.id, cancellationReason: 'Should fail on simulated write failure',
      }), 'PERSISTENCE_FAILURE'
  );
  const unchangedCompeting = await facade.retrieveAppointment(hostActor, competingAppt.id);
  assert.equal(unchangedCompeting.status, 'PENDING_HOST_CONFIRMATION');
  // 31. Pagination limits validation
  await expectViewingError(
    () => facade.retrieveHostSchedule(hostActor, hostActor.userId, 500), 'VALIDATION_FAILED'
  );
  // 32. Prevention of cross-module direct writes
  await expectViewingError(
    () => facade.adapters.externalWriteGuard.attemptDirectExternalModuleWrite('server/modules/bargains'),
    'INSUFFICIENT_PRIVILEGE'
  );
  console.log('All 32 Property Viewing & Appointment Scheduling test scenarios passed!');
}
runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

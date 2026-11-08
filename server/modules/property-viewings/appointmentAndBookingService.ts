import crypto from 'crypto';
import {
  AppointmentParticipantRecord, ParticipantRole,
  PropertyViewingAppointmentRecord, ViewingActorContext,
  ViewingAppointmentType, ViewingBookingStatus,
  ViewingError, ViewingNotificationEventRecord,
} from './types';
import {
  assertCanReadAppointment, assertValidBookingTransition,
  intervalsOverlapWithBuffer, normalizeBoundedLimit,
  validateIanaTimezone, validateTimeRange,
} from './validationAndTimezone';
import { PropertyViewingsExternalAdapters } from './adapters';
import { PropertyViewingsStore } from './store';
export class AppointmentAndBookingService {
  constructor(
    private readonly store: PropertyViewingsStore,
    private readonly adapters: PropertyViewingsExternalAdapters
  ) {}
  private async emitNotificationEvent(
    appointmentId: string, eventType: ViewingNotificationEventRecord['eventType'],
    recipientUserId: string
  ): Promise<ViewingNotificationEventRecord> {
    const dispatch = await this.adapters.notifications.requestNotificationDispatch({
      appointmentId, eventType,
      recipientUserId, });
    const event: ViewingNotificationEventRecord = {
      id: `vnotif_${crypto.randomBytes(6).toString('hex')}`, appointmentId,
      eventType, recipientUserId,
      deliveryStage: dispatch.stage, providerReferenceId: dispatch.providerReferenceId,
      createdAtIso: new Date().toISOString(), };
    await this.store.appendNotificationEvent(event);
    return event;
  }
  async createViewingRequest(
    actor: ViewingActorContext, input: {
      id?: string;
      propertyId: string;
      listingId?: string;
      hostUserId: string;
      brokerageOrganizationId?: string;
      mandateId?: string;
      appointmentType: ViewingAppointmentType;
      requestedStartIso: string;
      requestedEndIso: string;
      timezoneId: string;
      capacity?: number;
      locationOrMeetingSummary: string;
      specialRequirements?: string;
      idempotencyKey?: string;
      nowIso?: string;
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<PropertyViewingAppointmentRecord> {
    if (input.idempotencyKey) {
      const existingId = await this.store.getIdempotencyAppointmentId(input.idempotencyKey);
      if (existingId) {
        const existing = await this.store.getAppointmentById(existingId);
        if (existing) return existing;
      }
    }
    const timezoneId = validateIanaTimezone(input.timezoneId);
    const { startMs, endMs, durationMinutes } = validateTimeRange(
      input.requestedStartIso, input.requestedEndIso
    );
    const propCheck = await this.adapters.propertyAndListing.validatePropertyViewingEligibility({
      propertyId: input.propertyId, listingId: input.listingId,
      callerUserId: actor.userId, });
    if (!propCheck.propertyExists) {
      throw new ViewingError('INVALID_PROPERTY_REFERENCE', propCheck.reason || 'Property not found.', 404);
    }
    if (!propCheck.viewingAllowed) {
      throw new ViewingError('UNAUTHORIZED_PROPERTY_VIEWING_ACCESS', propCheck.reason || 'Viewing not allowed.', 403);
    }
    const hostCheck = await this.adapters.brokerageAuth.verifyHostAuthorityForProperty({
      propertyId: input.propertyId, hostUserId: input.hostUserId,
      brokerageOrganizationId: input.brokerageOrganizationId, mandateId: input.mandateId,
    });
    if (!hostCheck.authorizedAsHost) {
      throw new ViewingError(
        'UNAUTHORIZED_HOST_OR_AGENT',
        hostCheck.reason || `Host '${input.hostUserId}' is not authorized to conduct viewings for property '${input.propertyId}'.`,
        403
      );
    }
    // Check host availability windows for min advance notice & max horizon if configured
    const hostWindows = await this.store.listAvailabilityWindowsByHost(input.hostUserId);
    const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime();
    for (const win of hostWindows.filter((w) => w.status === 'ACTIVE' && w.availabilityType !== 'UNAVAILABLE_BLACKOUT')) {
      if (startMs < nowMs + win.minAdvanceNoticeMinutes * 60000) {
        throw new ViewingError(
          'MIN_BOOKING_NOTICE_VIOLATION',
          `Viewing request violates host minimum advance notice of ${win.minAdvanceNoticeMinutes} minutes.`, 400
        );
      }
      if (startMs > nowMs + win.maxAdvanceHorizonDays * 24 * 60 * 60 * 1000) {
        throw new ViewingError(
          'MAX_BOOKING_HORIZON_EXCEEDED',
          `Viewing request exceeds host maximum booking horizon of ${win.maxAdvanceHorizonDays} days.`, 400
        );
      }
    }
    const now = new Date().toISOString();
    const appointmentId = input.id || `vappt_${crypto.randomBytes(6).toString('hex')}`;
    const requesterParticipant: AppointmentParticipantRecord = {
      participantId: actor.userId, appointmentId,
      role: 'REQUESTING_BUYER', invitationStatus: 'ACCEPTED',
      confirmationStatus: 'CONFIRMED', invitedAtIso: now,
      respondedAtIso: now, canViewAccessInstructions: true,
    };
    const record: PropertyViewingAppointmentRecord = {
      id: appointmentId, propertyId: input.propertyId,
      listingId: input.listingId, requestingUserId: actor.userId,
      hostUserId: input.hostUserId, brokerageOrganizationId: input.brokerageOrganizationId,
      mandateId: input.mandateId, appointmentType: input.appointmentType,
      requestedStartIso: input.requestedStartIso, requestedEndIso: input.requestedEndIso,
      timezoneId, durationMinutes,
      capacity: input.capacity ?? (input.appointmentType === 'GROUP_VIEWING' ? 5 : 1),
      participants: [requesterParticipant], status: 'PENDING_HOST_CONFIRMATION',
      locationOrMeetingSummary: input.locationOrMeetingSummary, accessCoordinationStatus: 'NOT_COORDINATED',
      specialRequirements: input.specialRequirements, rescheduleHistory: [],
      version: 1, isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveAppointment(record);
    if (input.idempotencyKey) {
      await this.store.saveIdempotencyAppointmentId(input.idempotencyKey, record.id);
    }
    await this.emitNotificationEvent(record.id, 'VIEWING_REQUESTED', record.hostUserId);
    return record;
  }
  async retrieveAppointment(
    actor: ViewingActorContext, appointmentId: string
  ): Promise<PropertyViewingAppointmentRecord> {
    const appt = await this.store.getAppointmentById(appointmentId);
    if (!appt) {
      throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${appointmentId}' not found.`, 404);
    }
    assertCanReadAppointment(actor, appt);
    return appt;
  }
  async retrieveAuthorizedPropertyViewingSchedule(
    actor: ViewingActorContext, propertyId: string,
    limit?: number
  ): Promise<PropertyViewingAppointmentRecord[]> {
    const bounded = normalizeBoundedLimit(limit, 25, 100);
    const list = await this.store.listAppointmentsByProperty(propertyId, bounded);
    return list.filter((a) => {
      try {
        assertCanReadAppointment(actor, a);
        return true;
      } catch {
        return false;
      }
    });
  }
  async confirmViewingReservation(
    actor: ViewingActorContext, input: {
      appointmentId: string;
      slotHoldId?: string;
      nowIso?: string;
      expectedVersion?: number;
    }
  ): Promise<PropertyViewingAppointmentRecord> {
    return this.store.runExclusiveBookingTransaction(async () => {
      const appt = await this.store.getAppointmentById(input.appointmentId);
      if (!appt) {
        throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
      }
      if (actor.userId !== appt.hostUserId && actor.role !== 'BROKERAGE_ADMIN') {
        throw new ViewingError(
          'INSUFFICIENT_PRIVILEGE',
          'Clients cannot self-confirm appointments; only the authorized host or brokerage admin may confirm.', 403
        );
      }
      if (input.expectedVersion !== undefined && appt.version !== input.expectedVersion) {
        throw new ViewingError('CONCURRENCY_CONFLICT', 'Appointment version mismatch.', 409);
      }
      assertValidBookingTransition(appt.status, 'CONFIRMED');
      const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime();
      if (input.slotHoldId) {
        const hold = await this.store.getSlotHoldById(input.slotHoldId);
        if (!hold || hold.status !== 'ACTIVE_HOLD' || new Date(hold.expiresAtIso).getTime() <= nowMs) {
          throw new ViewingError(
            'HOLD_EXPIRED_OR_INVALID', `Temporary slot hold '${input.slotHoldId}' has expired or is invalid.`,
            409
          );
        }
        await this.store.saveSlotHold({ ...hold, status: 'CONVERTED_TO_BOOKING' });
      }
      const startMs = new Date(appt.requestedStartIso).getTime();
      const endMs = new Date(appt.requestedEndIso).getTime();
      const [hostWindows, hostBookings, propBookings] = await Promise.all([
        this.store.listAvailabilityWindowsByHost(appt.hostUserId),
        this.store.listAppointmentsByHost(appt.hostUserId, 100),
        this.store.listAppointmentsByProperty(appt.propertyId, 100), ]);
      // Check blackout windows
      for (const blk of hostWindows.filter((w) => w.status === 'ACTIVE' && w.availabilityType === 'UNAVAILABLE_BLACKOUT')) {
        if (intervalsOverlapWithBuffer(startMs, endMs, new Date(blk.startIso).getTime(), new Date(blk.endIso).getTime())) {
          throw new ViewingError(
            'SCHEDULING_CONFLICT_DOUBLE_BOOKING', 'Requested time falls inside an unavailable blackout period.',
            409
          );
        }
      }
      // Check double-booking on host or property
      const allOtherConfirmed = [...hostBookings, ...propBookings].filter(
        (other) =>
          other.id !== appt.id &&
          (other.status === 'CONFIRMED' || other.status === 'RESCHEDULED')
      );
      for (const other of allOtherConfirmed) {
        const oStart = new Date(other.confirmedStartIso || other.requestedStartIso).getTime();
        const oEnd = new Date(other.confirmedEndIso || other.requestedEndIso).getTime();
        if (intervalsOverlapWithBuffer(startMs, endMs, oStart, oEnd)) {
          throw new ViewingError(
            'SCHEDULING_CONFLICT_DOUBLE_BOOKING',
            `Double-booking conflict with confirmed appointment '${other.id}'.`, 409
          );
        }
      }
      const now = new Date().toISOString();
      const updated: PropertyViewingAppointmentRecord = {
        ...appt, status: 'CONFIRMED',
        confirmedStartIso: appt.requestedStartIso, confirmedEndIso: appt.requestedEndIso,
        version: appt.version + 1, updatedAt: now,
      };
      await this.store.saveAppointment(updated);
      await this.emitNotificationEvent(updated.id, 'VIEWING_CONFIRMED', updated.requestingUserId);
      return updated;
    });
  }
  async recordHostConfirmation(
    actor: ViewingActorContext, appointmentId: string
  ): Promise<PropertyViewingAppointmentRecord> {
    return this.confirmViewingReservation(actor, { appointmentId });
  }
  async acceptOrRejectViewingRequest(
    actor: ViewingActorContext,
    input: { appointmentId: string; decision: 'CONFIRMED' | 'REJECTED'; reason?: string }
  ): Promise<PropertyViewingAppointmentRecord> {
    if (input.decision === 'CONFIRMED') {
      return this.confirmViewingReservation(actor, { appointmentId: input.appointmentId });
    }
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    if (actor.userId !== appt.hostUserId && actor.role !== 'BROKERAGE_ADMIN') {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Only host or admin may reject viewing request.', 403);
    }
    assertValidBookingTransition(appt.status, 'REJECTED');
    const updated: PropertyViewingAppointmentRecord = {
      ...appt, status: 'REJECTED',
      version: appt.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveAppointment(updated);
    return updated;
  }
  async inviteParticipant(
    actor: ViewingActorContext, input: {
      appointmentId: string;
      participantId: string;
      role: ParticipantRole;
      canViewAccessInstructions?: boolean;
    }
  ): Promise<PropertyViewingAppointmentRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    if (
      actor.userId !== appt.requestingUserId &&
      actor.userId !== appt.hostUserId &&
      actor.role !== 'BROKERAGE_ADMIN'
    ) {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Actor is not authorized to invite participants.', 403);
    }
    const activeParticipants = appt.participants.filter(
      (p) => p.invitationStatus !== 'REMOVED' && p.invitationStatus !== 'CANCELLED' && p.invitationStatus !== 'REJECTED'
    );
    if (activeParticipants.length >= appt.capacity) {
      throw new ViewingError(
        'CAPACITY_EXCEEDED',
        `Appointment '${appt.id}' has reached its maximum participant capacity (${appt.capacity}).`, 409
      );
    }
    const now = new Date().toISOString();
    // Invitation is NEVER treated as confirmed attendance
    const participant: AppointmentParticipantRecord = {
      participantId: input.participantId, appointmentId: appt.id,
      role: input.role, invitationStatus: 'INVITED',
      confirmationStatus: 'UNCONFIRMED', invitedAtIso: now,
      canViewAccessInstructions: input.canViewAccessInstructions ?? false, };
    const updated: PropertyViewingAppointmentRecord = {
      ...appt, participants: [...appt.participants, participant],
      version: appt.version + 1, updatedAt: now,
    };
    await this.store.saveAppointment(updated);
    await this.emitNotificationEvent(appt.id, 'PARTICIPANT_INVITATION_RECEIVED', input.participantId);
    return updated;
  }
  async acceptOrRejectInvitation(
    actor: ViewingActorContext, input: { appointmentId: string; decision: 'ACCEPTED' | 'REJECTED' }
  ): Promise<PropertyViewingAppointmentRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    const found = appt.participants.find((p) => p.participantId === actor.userId);
    if (!found) {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Caller is not an invited participant.', 403);
    }
    const now = new Date().toISOString();
    const updatedParticipants = appt.participants.map((p) =>
      p.participantId === actor.userId
        ? {
            ...p, invitationStatus: input.decision,
            confirmationStatus: (input.decision === 'ACCEPTED' ? 'CONFIRMED' : 'UNCONFIRMED') as AppointmentParticipantRecord['confirmationStatus'],
            respondedAtIso: now, }
        : p
    );
    const updated: PropertyViewingAppointmentRecord = {
      ...appt, participants: updatedParticipants,
      version: appt.version + 1, updatedAt: now,
    };
    await this.store.saveAppointment(updated);
    return updated;
  }
  async rescheduleAppointment(
    actor: ViewingActorContext, input: {
      appointmentId: string;
      newStartIso: string;
      newEndIso: string;
      reasonCategory: string;
    }
  ): Promise<PropertyViewingAppointmentRecord> {
    return this.store.runExclusiveBookingTransaction(async () => {
      const appt = await this.store.getAppointmentById(input.appointmentId);
      if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
      if (
        actor.userId !== appt.requestingUserId &&
        actor.userId !== appt.hostUserId &&
        actor.role !== 'BROKERAGE_ADMIN'
      ) {
        throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Unauthorized actor cannot reschedule appointment.', 403);
      }
      const { startMs, endMs, durationMinutes } = validateTimeRange(input.newStartIso, input.newEndIso);
      assertValidBookingTransition(appt.status, 'RESCHEDULED');
      const [hostBookings, propBookings] = await Promise.all([
        this.store.listAppointmentsByHost(appt.hostUserId, 100),
        this.store.listAppointmentsByProperty(appt.propertyId, 100), ]);
      const otherConfirmed = [...hostBookings, ...propBookings].filter(
        (other) => other.id !== appt.id && (other.status === 'CONFIRMED' || other.status === 'RESCHEDULED')
      );
      for (const other of otherConfirmed) {
        const oStart = new Date(other.confirmedStartIso || other.requestedStartIso).getTime();
        const oEnd = new Date(other.confirmedEndIso || other.requestedEndIso).getTime();
        if (intervalsOverlapWithBuffer(startMs, endMs, oStart, oEnd)) {
          throw new ViewingError(
            'SCHEDULING_CONFLICT_DOUBLE_BOOKING', `Replacement time conflicts with appointment '${other.id}'.`,
            409
          );
        }
      }
      const now = new Date().toISOString();
      const historyEntry = {
        id: `vres_${crypto.randomBytes(6).toString('hex')}`,
        originalStartIso: appt.confirmedStartIso || appt.requestedStartIso,
        originalEndIso: appt.confirmedEndIso || appt.requestedEndIso, requestedNewStartIso: input.newStartIso,
        requestedNewEndIso: input.newEndIso, requestedByUserId: actor.userId,
        reasonCategory: input.reasonCategory, hostResponse: 'APPROVED' as const,
        finalConfirmedStartIso: input.newStartIso, finalConfirmedEndIso: input.newEndIso,
        recordedAtIso: now, };
      const updated: PropertyViewingAppointmentRecord = {
        ...appt, requestedStartIso: input.newStartIso,
        requestedEndIso: input.newEndIso, confirmedStartIso: input.newStartIso,
        confirmedEndIso: input.newEndIso, durationMinutes,
        status: 'RESCHEDULED', rescheduleHistory: [...appt.rescheduleHistory, historyEntry],
        version: appt.version + 1, updatedAt: now,
      };
      await this.store.saveAppointment(updated);
      await this.emitNotificationEvent(updated.id, 'VIEWING_RESCHEDULED', updated.requestingUserId);
      return updated;
    });
  }
  async cancelAppointment(
    actor: ViewingActorContext, input: {
      appointmentId: string;
      cancellationReason: string;
      cancelledAtIso?: string;
    }
  ): Promise<PropertyViewingAppointmentRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    if (
      actor.userId !== appt.requestingUserId &&
      actor.userId !== appt.hostUserId &&
      actor.role !== 'BROKERAGE_ADMIN'
    ) {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Not authorized to cancel appointment.', 403);
    }
    assertValidBookingTransition(appt.status, 'CANCELLED');
    const cancelledAt = input.cancelledAtIso ?? new Date().toISOString();
    const scheduledStartMs = new Date(appt.confirmedStartIso || appt.requestedStartIso).getTime();
    const noticeMinutes = Math.max(0, Math.round((scheduledStartMs - new Date(cancelledAt).getTime()) / 60000));
    const updated: PropertyViewingAppointmentRecord = {
      ...appt, status: 'CANCELLED',
      cancellationRecord: {
        cancelledByUserId: actor.userId, cancellationReason: input.cancellationReason,
        cancelledAtIso: cancelledAt, noticePeriodMinutes: noticeMinutes,
        classification:
          actor.userId === appt.hostUserId
            ? 'HOST_INITIATED'
            : noticeMinutes < 180
            ? 'LATE_NOTICE'
            : 'STANDARD_NOTICE', },
      version: appt.version + 1, updatedAt: cancelledAt,
    };
    await this.store.saveAppointment(updated);
    await this.emitNotificationEvent(updated.id, 'VIEWING_CANCELLED', updated.hostUserId);
    return updated;
  }
  async retrieveAppointmentHistory(
    actor: ViewingActorContext, appointmentId: string
  ): Promise<{
    appointment: PropertyViewingAppointmentRecord;
    rescheduleHistory: PropertyViewingAppointmentRecord['rescheduleHistory'];
    cancellationRecord?: PropertyViewingAppointmentRecord['cancellationRecord'];
    notifications: ViewingNotificationEventRecord[];
  }> {
    const appt = await this.retrieveAppointment(actor, appointmentId);
    const notifications = await this.store.listNotificationEventsByAppointment(appt.id);
    return {
      appointment: appt, rescheduleHistory: appt.rescheduleHistory,
      cancellationRecord: appt.cancellationRecord, notifications,
    };
  }
  async retrieveHostSchedule(
    actor: ViewingActorContext, hostUserId: string,
    limit?: number
  ): Promise<PropertyViewingAppointmentRecord[]> {
    if (actor.userId !== hostUserId && actor.role !== 'BROKERAGE_ADMIN' && actor.role !== 'PLATFORM_AUDITOR') {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Not authorized to view host schedule.', 403);
    }
    const bounded = normalizeBoundedLimit(limit, 25, 100);
    return this.store.listAppointmentsByHost(hostUserId, bounded);
  }
}

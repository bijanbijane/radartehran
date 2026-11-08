import crypto from 'crypto';
import {
  AccessCoordinationMethod,
  OperationalViewingMetricsReport,
  PropertyAccessCoordinationRecord,
  ViewingActorContext,
  ViewingAttendanceRecord,
  ViewingAttendanceState,
  ViewingError,
  ViewingFeedbackRecord,
  ViewingInterestClassification,
  VirtualViewingSessionRecord,
} from './types';
import {
  assertCanReadAppointment,
  assertNoPermanentAccessSecrets,
  projectFeedbackForViewer,
  validateIanaTimezone,
  validateTimeRange,
} from './validationAndTimezone';
import { PropertyViewingsStore } from './store';

export class AccessAttendanceFeedbackAndMetricsService {
  constructor(private readonly store: PropertyViewingsStore) {}

  async registerAccessCoordinationReference(
    actor: ViewingActorContext,
    input: {
      id?: string;
      appointmentId: string;
      accessMethod: AccessCoordinationMethod;
      validityStartIso: string;
      validityEndIso: string;
      restrictedAccessInstructions: string;
      authorizationSourceRef: string;
      restrictionsSummary?: string;
    }
  ): Promise<PropertyAccessCoordinationRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);

    if (
      actor.userId !== appt.hostUserId &&
      actor.role !== 'PROPERTY_OWNER' &&
      actor.role !== 'BROKERAGE_ADMIN'
    ) {
      throw new ViewingError(
        'INSUFFICIENT_PRIVILEGE',
        'Only the authorized host, property owner, or brokerage admin may register access coordination instructions.',
        403
      );
    }

    validateTimeRange(input.validityStartIso, input.validityEndIso);
    assertNoPermanentAccessSecrets(input.restrictedAccessInstructions);

    const now = new Date().toISOString();
    const record: PropertyAccessCoordinationRecord = {
      id: input.id || `vacc_${crypto.randomBytes(6).toString('hex')}`,
      appointmentId: appt.id,
      responsibleAuthorizedUserId: actor.userId,
      accessMethod: input.accessMethod,
      validityStartIso: input.validityStartIso,
      validityEndIso: input.validityEndIso,
      restrictedAccessInstructions: input.restrictedAccessInstructions,
      authorizationSourceRef: input.authorizationSourceRef,
      confirmationStatus: 'CONFIRMED',
      restrictionsSummary: input.restrictionsSummary,
      completionStatus: 'PENDING',
      createdByUserId: actor.userId,
      disclosedToUserIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveAccessCoordination(record);
    await this.store.saveAppointment({
      ...appt,
      accessCoordinationId: record.id,
      accessCoordinationStatus: 'CONFIRMED',
      version: appt.version + 1,
      updatedAt: now,
    });
    return record;
  }

  async retrieveAuthorizedAccessInstructions(
    actor: ViewingActorContext,
    appointmentId: string,
    asOfIso = new Date().toISOString()
  ): Promise<PropertyAccessCoordinationRecord> {
    const appt = await this.store.getAppointmentById(appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${appointmentId}' not found.`, 404);
    const access = await this.store.getAccessCoordinationByAppointment(appointmentId);
    if (!access) {
      throw new ViewingError('RESOURCE_NOT_FOUND', `No access coordination registered for '${appointmentId}'.`, 404);
    }

    const isHostOrAdmin = actor.userId === appt.hostUserId || actor.role === 'BROKERAGE_ADMIN';
    const participant = appt.participants.find(
      (p) => p.participantId === actor.userId && p.invitationStatus === 'ACCEPTED'
    );

    if (!isHostOrAdmin && (!participant || !participant.canViewAccessInstructions)) {
      throw new ViewingError(
        'ACCESS_INSTRUCTIONS_EXPIRED_OR_RESTRICTED',
        `User '${actor.userId}' is not authorized to view restricted access instructions for '${appointmentId}'.`,
        403
      );
    }

    const asOfMs = new Date(asOfIso).getTime();
    if (asOfMs > new Date(access.validityEndIso).getTime()) {
      throw new ViewingError(
        'ACCESS_INSTRUCTIONS_EXPIRED_OR_RESTRICTED',
        `Temporary access reference '${access.id}' expired at ${access.validityEndIso}.`,
        410
      );
    }

    const updated: PropertyAccessCoordinationRecord = {
      ...access,
      disclosedToUserIds: Array.from(new Set([...access.disclosedToUserIds, actor.userId])),
      updatedAt: asOfIso,
    };
    await this.store.saveAccessCoordination(updated);
    return updated;
  }

  async createVirtualViewingSessionReference(
    actor: ViewingActorContext,
    input: {
      id?: string;
      appointmentId: string;
      meetingProviderRef: string;
      privateMeetingUrlRef: string;
      recordingConsentGranted?: boolean;
      recordingRef?: string;
    }
  ): Promise<VirtualViewingSessionRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    if (actor.userId !== appt.hostUserId && actor.role !== 'BROKERAGE_ADMIN') {
      throw new ViewingError('INSUFFICIENT_PRIVILEGE', 'Only host or admin may create virtual viewing session.', 403);
    }

    const consent = input.recordingConsentGranted ?? false;
    if (input.recordingRef && !consent) {
      throw new ViewingError(
        'VALIDATION_FAILED',
        'Virtual session recording requires explicit recordingConsentGranted: true.',
        400
      );
    }

    const now = new Date().toISOString();
    const session: VirtualViewingSessionRecord = {
      id: input.id || `vvirt_${crypto.randomBytes(6).toString('hex')}`,
      appointmentId: appt.id,
      meetingProviderRef: input.meetingProviderRef,
      privateMeetingUrlRef: input.privateMeetingUrlRef,
      startIso: appt.confirmedStartIso || appt.requestedStartIso,
      endIso: appt.confirmedEndIso || appt.requestedEndIso,
      hostUserId: appt.hostUserId,
      authorizedParticipantIds: [
        appt.hostUserId,
        ...appt.participants
          .filter((p) => p.invitationStatus === 'ACCEPTED')
          .map((p) => p.participantId),
      ],
      sessionStatus: 'SCHEDULED',
      invitationDeliveryStatus: 'ACCEPTED_BY_PROVIDER',
      recordingConsentGranted: consent,
      recordingRef: consent ? input.recordingRef : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveVirtualSession(session);
    return session;
  }

  async retrieveVirtualViewingSessionReference(
    actor: ViewingActorContext,
    appointmentId: string
  ): Promise<VirtualViewingSessionRecord> {
    const session = await this.store.getVirtualSessionByAppointment(appointmentId);
    if (!session) throw new ViewingError('RESOURCE_NOT_FOUND', 'Virtual session not found.', 404);
    if (
      !session.authorizedParticipantIds.includes(actor.userId) &&
      actor.role !== 'BROKERAGE_ADMIN' &&
      actor.role !== 'PLATFORM_AUDITOR'
    ) {
      throw new ViewingError(
        'INSUFFICIENT_PRIVILEGE',
        `User '${actor.userId}' is not authorized to view private virtual meeting URL for '${appointmentId}'.`,
        403
      );
    }
    return session;
  }

  async recordAttendance(
    actor: ViewingActorContext,
    input: {
      id?: string;
      appointmentId: string;
      participantId: string;
      attendanceState: ViewingAttendanceState;
      verificationMethod: string;
      supportingEvidenceId?: string;
    }
  ): Promise<ViewingAttendanceRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);

    const isHostOrAdmin = actor.userId === appt.hostUserId || actor.role === 'BROKERAGE_ADMIN';
    const isSelfParticipant =
      actor.userId === input.participantId &&
      appt.participants.some((p) => p.participantId === actor.userId);

    if (!isHostOrAdmin && !isSelfParticipant) {
      throw new ViewingError(
        'INSUFFICIENT_PRIVILEGE',
        'Only the host or the participant themselves may record attendance.',
        403
      );
    }

    const provenance: ViewingAttendanceRecord['provenance'] = isHostOrAdmin
      ? 'HOST_REPORTED'
      : 'PARTICIPANT_SELF_REPORTED';

    const now = new Date().toISOString();
    const record: ViewingAttendanceRecord = {
      id: input.id || `vatt_${crypto.randomBytes(6).toString('hex')}`,
      appointmentId: appt.id,
      participantId: input.participantId,
      attendanceState: input.attendanceState,
      provenance,
      recordedByUserId: actor.userId,
      verificationMethod: input.verificationMethod,
      supportingEvidenceId: input.supportingEvidenceId,
      recordedAtIso: now,
    };

    await this.store.saveAttendance(record);

    // If host reports ATTENDED or NO_SHOW on a CONFIRMED/RESCHEDULED appointment, update appointment status
    if (isHostOrAdmin && (appt.status === 'CONFIRMED' || appt.status === 'RESCHEDULED')) {
      const nextStatus = input.attendanceState === 'NO_SHOW' ? 'NO_SHOW' : input.attendanceState === 'ATTENDED' ? 'COMPLETED' : appt.status;
      if (nextStatus !== appt.status) {
        await this.store.saveAppointment({
          ...appt,
          status: nextStatus,
          version: appt.version + 1,
          updatedAt: now,
        });
      }
    }

    return record;
  }

  async recordViewingFeedback(
    actor: ViewingActorContext,
    input: {
      id?: string;
      appointmentId: string;
      interestClassification: ViewingInterestClassification;
      privateComments: string;
      ownerApprovedSummary?: string;
      requestedFollowUp?: string;
      reportedPropertyConcerns?: string;
      discloseSummaryToOwnerOrListingRep: boolean;
    }
  ): Promise<ViewingFeedbackRecord> {
    const appt = await this.store.getAppointmentById(input.appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${input.appointmentId}' not found.`, 404);
    assertCanReadAppointment(actor, appt);

    const feedback: ViewingFeedbackRecord = {
      id: input.id || `vfdb_${crypto.randomBytes(6).toString('hex')}`,
      appointmentId: appt.id,
      propertyId: appt.propertyId,
      participantId: actor.userId,
      interestClassification: input.interestClassification,
      privateComments: input.privateComments,
      ownerApprovedSummary: input.ownerApprovedSummary,
      requestedFollowUp: input.requestedFollowUp,
      reportedPropertyConcerns: input.reportedPropertyConcerns,
      discloseSummaryToOwnerOrListingRep: input.discloseSummaryToOwnerOrListingRep,
      createdAtIso: new Date().toISOString(),
    };
    await this.store.saveFeedback(feedback);
    return feedback;
  }

  async retrieveViewingFeedbackForActor(
    actor: ViewingActorContext,
    appointmentId: string
  ): Promise<(Omit<ViewingFeedbackRecord, 'privateComments'> & { privateComments?: string })[]> {
    const appt = await this.store.getAppointmentById(appointmentId);
    if (!appt) throw new ViewingError('RESOURCE_NOT_FOUND', `Appointment '${appointmentId}' not found.`, 404);
    const allFeedback = await this.store.listFeedbackByAppointment(appointmentId);
    return allFeedback.map((f) => projectFeedbackForViewer(actor, f, appt));
  }

  async retrieveOperationalViewingMetrics(
    actor: ViewingActorContext,
    input: {
      propertyId: string;
      period: { fromIso: string; toIso: string };
      timezoneId: string;
    }
  ): Promise<OperationalViewingMetricsReport> {
    const timezoneId = validateIanaTimezone(input.timezoneId);
    const appointments = await this.store.listAppointmentsByProperty(input.propertyId, 100);
    if (appointments.length > 0) {
      assertCanReadAppointment(actor, appointments[0]);
    }

    const totalRequests = appointments.length;
    const confirmedCount = appointments.filter(
      (a) => a.status === 'CONFIRMED' || a.status === 'RESCHEDULED' || a.status === 'COMPLETED'
    ).length;
    const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;
    const cancelledCount = appointments.filter((a) => a.status === 'CANCELLED').length;
    const noShowCount = appointments.filter((a) => a.status === 'NO_SHOW').length;

    const now = new Date().toISOString();
    const makeMetric = (metricName: string, definition: string, value: number) => ({
      metricName,
      definition,
      value,
      measurementPeriod: input.period,
      timezoneId,
      inclusionCriteria: `Appointments recorded for property '${input.propertyId}'`,
      exclusionCriteria: 'Synthetic drafts never submitted',
      sourceRecordsCount: totalRequests,
      calculatedAtIso: now,
      dataCompletenessLimitations:
        'Reflects platform-scheduled viewings only; confirmed appointments are distinct from completed viewings and do not imply purchase demand.',
    });

    return {
      propertyId: input.propertyId,
      timezoneId,
      generatedAtIso: now,
      metrics: {
        totalViewingRequests: makeMetric(
          'totalViewingRequests',
          'Total viewing appointment requests created for this property.',
          totalRequests
        ),
        confirmedViewings: makeMetric(
          'confirmedViewings',
          'Count of appointments that reached CONFIRMED, RESCHEDULED, or COMPLETED.',
          confirmedCount
        ),
        completedViewings: makeMetric(
          'completedViewings',
          'Count of appointments verified as COMPLETED by host attendance.',
          completedCount
        ),
        cancelledAppointments: makeMetric(
          'cancelledAppointments',
          'Count of appointments in CANCELLED state.',
          cancelledCount
        ),
        noShowCount: makeMetric(
          'noShowCount',
          'Count of appointments recorded as NO_SHOW.',
          noShowCount
        ),
      },
    };
  }
}

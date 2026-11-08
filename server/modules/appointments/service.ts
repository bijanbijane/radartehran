/**
 * Primary Facade Service for Property Viewings & Appointments Module
 * (`server/modules/appointments/service.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import { randomUUID } from 'node:crypto';
import {
  EventOutboxPublisher,
  GeographyValidationAdapter,
  PropertyRegistryReferenceAdapter
} from './contracts.js';
import {
  acceptRescheduleWorkflow,
  proposeRescheduleWorkflow,
  recordAttendanceWorkflow,
  respondToInvitationWorkflow
} from './invitationsAndViewingService.js';
import { AppointmentRepository } from './repository.js';
import {
  detectSchedulingConflicts,
  generateRecurringOccurrences
} from './schedulingAndConflictsService.js';
import {
  AppointmentCategory,
  AppointmentDomainEvent,
  AppointmentLocation,
  AppointmentParticipant,
  AppointmentRecord,
  AttendanceStatus,
  CalendarQueryFilters,
  RecurringAppointmentSeries
} from './types.js';
import {
  assertValidStatusTransition,
  sanitizeAppointmentForViewer,
  validateAppointmentTimeWindow,
  validateBuffers
} from './validation.js';

export interface CreateAppointmentInput {
  appointmentType: AppointmentCategory;
  titleFa: string;
  descriptionFa?: string;
  organizerUserId: string;
  propertyId?: string;
  listingId?: string;
  crmLeadId?: string;
  providerId?: string;
  startIso: string;
  endIso: string;
  timezone?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  location: AppointmentLocation;
  participants: Array<Omit<AppointmentParticipant, 'appointmentId' | 'participantId' | 'attendanceStatus'>>;
  bypassConflictCheck?: boolean;
}

export class AppointmentService {
  constructor(
    private readonly repository: AppointmentRepository,
    private readonly outboxPublisher?: EventOutboxPublisher,
    private readonly geographyAdapter?: GeographyValidationAdapter,
    private readonly propertyAdapter?: PropertyRegistryReferenceAdapter
  ) {}

  private async emitEvent(
    eventType: AppointmentDomainEvent['eventType'],
    aggregateId: string,
    actorUserId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.outboxPublisher) return;
    const event: AppointmentDomainEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateId,
      aggregateType: 'appointment',
      actorUserId,
      payload,
      timestampIso: new Date().toISOString()
    };
    await this.outboxPublisher.publish(event);
  }

  async createAppointment(input: CreateAppointmentInput): Promise<AppointmentRecord> {
    const { durationMinutes } = validateAppointmentTimeWindow(input.startIso, input.endIso);
    const { bufferBeforeMinutes, bufferAfterMinutes } = validateBuffers(
      input.bufferBeforeMinutes,
      input.bufferAfterMinutes
    );

    // Validate property viewing requirements
    const isViewing =
      input.appointmentType === 'property_viewing' ||
      input.appointmentType === 'second_viewing' ||
      input.appointmentType === 'property_inspection';

    if (isViewing && !input.propertyId) {
      throw new Error('برای ثبت بازدید، شناسه ملک (propertyId) الزامی است.');
    }

    if (input.propertyId && this.propertyAdapter) {
      const exists = await this.propertyAdapter.verifyPropertyExists(input.propertyId);
      if (!exists) {
        throw new Error(`ملک با شناسه ${input.propertyId} در سامانه یافت نشد.`);
      }
    }

    // Geographic verification if neighborhood is specified
    if (input.location.cityId && input.location.hoodId && this.geographyAdapter) {
      const hoodExists = await this.geographyAdapter.verifyNeighborhoodExists(
        input.location.cityId,
        input.location.hoodId
      );
      if (!hoodExists) {
        throw new Error('محله جغرافیایی انتخاب‌شده در سامانه تعریف نشده است.');
      }
    }

    const participantUserIds = input.participants
      .map(p => p.userId)
      .filter((id): id is string => Boolean(id));

    // Conflict detection
    if (!input.bypassConflictCheck) {
      const conflicts = await detectSchedulingConflicts(this.repository, {
        participantUserIds,
        organizerUserId: input.organizerUserId,
        propertyId: input.propertyId,
        startIso: input.startIso,
        endIso: input.endIso,
        bufferBeforeMinutes,
        bufferAfterMinutes
      });

      if (conflicts.length > 0) {
        throw new Error(`تداخل در زمان‌بندی: ${conflicts.map(c => c.explanationFa).join(' | ')}`);
      }
    }

    const appointmentId = randomUUID();
    const nowIso = new Date().toISOString();

    // Secure initial location: hide exact street if it is viewing until confirmed
    const initialLocation: AppointmentLocation = {
      ...input.location,
      exactAddressDisclosed: isViewing ? false : input.location.exactAddressDisclosed
    };

    const participants: AppointmentParticipant[] = input.participants.map(p => ({
      ...p,
      participantId: randomUUID(),
      appointmentId,
      attendanceStatus: 'not_recorded'
    }));

    // Ensure organizer is represented
    if (!participants.some(p => p.userId === input.organizerUserId)) {
      participants.push({
        participantId: randomUUID(),
        appointmentId,
        userId: input.organizerUserId,
        nameFa: 'برگزارکننده',
        role: 'organizer',
        isOrganizer: true,
        invitationStatus: 'accepted',
        responseTimestampIso: nowIso,
        attendanceStatus: 'not_recorded'
      });
    }

    const record: AppointmentRecord = {
      appointmentId,
      appointmentType: input.appointmentType,
      titleFa: input.titleFa,
      descriptionFa: input.descriptionFa,
      organizerUserId: input.organizerUserId,
      propertyId: input.propertyId,
      listingId: input.listingId,
      crmLeadId: input.crmLeadId,
      providerId: input.providerId,
      startIso: input.startIso,
      endIso: input.endIso,
      timezone: input.timezone || 'Asia/Tehran',
      durationMinutes,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      location: initialLocation,
      participants,
      status: 'proposed',
      reschedulingHistory: [],
      isRecurringInstance: false,
      revision: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    await this.repository.save(record);
    await this.emitEvent('appointments.created', appointmentId, input.organizerUserId, { record });

    return record;
  }

  async respondToInvitation(
    appointmentId: string,
    userId: string,
    response: 'accepted' | 'declined' | 'tentative'
  ): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    const updated = respondToInvitationWorkflow(record, userId, response);
    await this.repository.save(updated);

    const eventType = response === 'accepted' ? 'appointments.participant_accepted' : 'appointments.participant_declined';
    await this.emitEvent(eventType, appointmentId, userId, { response });

    if (updated.status === 'confirmed' && record.status !== 'confirmed') {
      await this.emitEvent('appointments.confirmed', appointmentId, userId, { updated });
    }

    return updated;
  }

  async confirmAppointment(appointmentId: string, actorUserId: string): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    if (record.organizerUserId !== actorUserId) {
      throw new Error('تنها برگزارکننده مجاز به تایید نهایی جلسه است.');
    }

    assertValidStatusTransition(record.status, 'confirmed');

    const updated: AppointmentRecord = {
      ...record,
      status: 'confirmed',
      location: {
        ...record.location,
        exactAddressDisclosed: true
      },
      updatedAtIso: new Date().toISOString(),
      revision: record.revision + 1
    };

    await this.repository.save(updated);
    await this.emitEvent('appointments.confirmed', appointmentId, actorUserId, { updated });
    return updated;
  }

  async requestReschedule(
    appointmentId: string,
    proposerUserId: string,
    newStartIso: string,
    newEndIso: string,
    reasonFa?: string
  ): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    const conflicts = await detectSchedulingConflicts(this.repository, {
      participantUserIds: record.participants.map(p => p.userId).filter((id): id is string => Boolean(id)),
      organizerUserId: record.organizerUserId,
      propertyId: record.propertyId,
      startIso: newStartIso,
      endIso: newEndIso,
      bufferBeforeMinutes: record.bufferBeforeMinutes,
      bufferAfterMinutes: record.bufferAfterMinutes,
      excludeAppointmentId: appointmentId
    });

    if (conflicts.length > 0) {
      throw new Error(`تداخل در زمان‌بندی جدید: ${conflicts.map(c => c.explanationFa).join(' | ')}`);
    }

    const updated = proposeRescheduleWorkflow({
      appointment: record,
      proposerUserId,
      newStartIso,
      newEndIso,
      reasonFa
    });

    await this.repository.save(updated);
    await this.emitEvent('appointments.reschedule_requested', appointmentId, proposerUserId, {
      newStartIso,
      newEndIso,
      reasonFa
    });

    return updated;
  }

  async acceptReschedule(appointmentId: string, actorUserId: string): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    const updated = acceptRescheduleWorkflow(record, actorUserId);
    await this.repository.save(updated);
    await this.emitEvent('appointments.rescheduled', appointmentId, actorUserId, { updated });
    return updated;
  }

  async cancelAppointment(
    appointmentId: string,
    actorUserId: string,
    reasonFa: string
  ): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    const isOrganizer = record.organizerUserId === actorUserId;
    const isParticipant = record.participants.some(p => p.userId === actorUserId);
    if (!isOrganizer && !isParticipant) {
      throw new Error('فقط برگزارکننده یا شرکت‌کنندگان مجاز به لغو جلسه هستند.');
    }

    assertValidStatusTransition(record.status, 'cancelled');

    const updated: AppointmentRecord = {
      ...record,
      status: 'cancelled',
      cancellationReasonFa: reasonFa,
      cancelledByUserId: actorUserId,
      closedAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      revision: record.revision + 1
    };

    await this.repository.save(updated);
    await this.emitEvent('appointments.cancelled', appointmentId, actorUserId, { reasonFa });
    return updated;
  }

  async recordAttendance(
    appointmentId: string,
    recorderUserId: string,
    records: Array<{
      userId?: string;
      participantId?: string;
      status: AttendanceStatus;
      notesFa?: string;
    }>
  ): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    const updated = recordAttendanceWorkflow(record, recorderUserId, records);
    await this.repository.save(updated);

    if (updated.status === 'no_show') {
      await this.emitEvent('appointments.no_show_recorded', appointmentId, recorderUserId, { updated });
    } else {
      await this.emitEvent('appointments.attendance_updated', appointmentId, recorderUserId, { records });
    }

    return updated;
  }

  async completeAppointment(
    appointmentId: string,
    actorUserId: string,
    outcomeSummaryFa?: string
  ): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }

    if (record.organizerUserId !== actorUserId) {
      throw new Error('تنها برگزارکننده مجاز به اتمام جلسه است.');
    }

    assertValidStatusTransition(record.status, 'completed');

    const updated: AppointmentRecord = {
      ...record,
      status: 'completed',
      outcomeSummaryFa,
      closedAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      revision: record.revision + 1
    };

    await this.repository.save(updated);
    await this.emitEvent('appointments.completed', appointmentId, actorUserId, { outcomeSummaryFa });
    return updated;
  }

  async createRecurringSeries(seriesInput: {
    organizerUserId: string;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    firstOccurrenceStartIso: string;
    durationMinutes: number;
    maxOccurrences: number;
    seriesEndIso: string;
    template: CreateAppointmentInput;
  }): Promise<{ series: RecurringAppointmentSeries; createdAppointments: AppointmentRecord[] }> {
    const seriesId = randomUUID();
    const series: RecurringAppointmentSeries = {
      seriesId,
      organizerUserId: seriesInput.organizerUserId,
      appointmentTemplate: {
        appointmentType: seriesInput.template.appointmentType,
        titleFa: seriesInput.template.titleFa,
        descriptionFa: seriesInput.template.descriptionFa,
        organizerUserId: seriesInput.organizerUserId,
        propertyId: seriesInput.template.propertyId,
        listingId: seriesInput.template.listingId,
        durationMinutes: seriesInput.durationMinutes,
        bufferBeforeMinutes: seriesInput.template.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: seriesInput.template.bufferAfterMinutes ?? 0,
        location: seriesInput.template.location,
        participants: [],
        status: 'proposed',
        reschedulingHistory: [],
        timezone: seriesInput.template.timezone || 'Asia/Tehran',
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString()
      },
      frequency: seriesInput.frequency,
      firstOccurrenceStartIso: seriesInput.firstOccurrenceStartIso,
      durationMinutes: seriesInput.durationMinutes,
      maxOccurrences: seriesInput.maxOccurrences,
      seriesEndIso: seriesInput.seriesEndIso,
      status: 'active',
      createdAtIso: new Date().toISOString()
    };

    await this.repository.saveSeries(series);

    const occurrences = generateRecurringOccurrences(series);
    const createdAppointments: AppointmentRecord[] = [];

    for (const occ of occurrences) {
      const appt = await this.createAppointment({
        ...seriesInput.template,
        startIso: occ.startIso,
        endIso: occ.endIso,
        titleFa: `${seriesInput.template.titleFa} (نوبت ${occ.index})`
      });

      // Tag recurrence
      const tagged: AppointmentRecord = {
        ...appt,
        isRecurringInstance: true,
        recurrenceSeriesId: seriesId,
        revision: appt.revision + 1
      };
      await this.repository.save(tagged);
      createdAppointments.push(tagged);
    }

    return { series, createdAppointments };
  }

  async getAppointment(appointmentId: string, requestingUserId: string): Promise<AppointmentRecord> {
    const record = await this.repository.findById(appointmentId);
    if (!record) {
      throw new Error(`جلسه با شناسه ${appointmentId} یافت نشد.`);
    }
    return sanitizeAppointmentForViewer(record, requestingUserId);
  }

  async getCalendarView(
    filters: CalendarQueryFilters,
    requestingUserId: string
  ): Promise<{ appointments: AppointmentRecord[]; nextCursor?: string; totalCount: number }> {
    const result = await this.repository.queryCalendar(filters);
    const sanitized = result.appointments.map(a => sanitizeAppointmentForViewer(a, requestingUserId));
    return {
      appointments: sanitized,
      nextCursor: result.nextCursor,
      totalCount: result.totalCount
    };
  }
}

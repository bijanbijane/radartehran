/**
 * Property Transaction Viewings & Appointment Scheduling Workflow
 * (`server/modules/property-transactions/viewingsWorkflow.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type { PropertyTransactionRepository } from './repository';
import type { DealDomainEvent, ViewingAppointmentRecord } from './types';
import {
  DealValidationError,
  sanitizeText,
  validateIsoDateString,
  validateSafeFirestoreId,
  validateViewingDuration,
} from './validation';

export interface ViewingsWorkflowContext {
  repository: PropertyTransactionRepository;
  emitEvent: (
    eventType: DealDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DealDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function requestViewingWorkflow(
  ctx: ViewingsWorkflowContext,
  input: {
    listingId: string;
    dealId?: string;
    inquiryId?: string;
    hostUserId: string;
    scheduledStartTimeIso: string;
    durationMinutes: number;
    timeZone?: string;
  },
  actorUserId: string,
): Promise<ViewingAppointmentRecord> {
  const listingId = validateSafeFirestoreId(input.listingId, 'listingId');
  const startTimeIso = validateIsoDateString(input.scheduledStartTimeIso, 'scheduledStartTimeIso', true);
  const duration = validateViewingDuration(input.durationMinutes);

  const conflicts = await ctx.repository.listConfirmedViewingsForHost(
    input.hostUserId,
    startTimeIso,
    new Date(new Date(startTimeIso).getTime() + duration * 60 * 1000).toISOString(),
  );
  if (conflicts.length > 0) {
    throw new DealValidationError('VIEWING_SCHEDULE_CONFLICT', 'The requested host already has a confirmed viewing in this time window.');
  }

  const appointmentId = `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: ViewingAppointmentRecord = {
    appointmentId,
    dealId: input.dealId,
    inquiryId: input.inquiryId,
    listingId,
    requestingUserId: actorUserId,
    hostUserId: input.hostUserId,
    scheduledStartTimeIso: startTimeIso,
    durationMinutes: duration,
    timeZone: input.timeZone ?? 'Asia/Tehran',
    status: 'requested',
    disclosurePolicy: 'neighborhood_only',
    reschedulingHistory: [],
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveViewingAppointment(record);
  await ctx.emitEvent('viewing.requested', appointmentId, 'viewing', actorUserId, { hostUserId: input.hostUserId });
  return record;
}

export async function confirmViewingWorkflow(
  ctx: ViewingsWorkflowContext,
  appointmentId: string,
  actorUserId: string,
): Promise<ViewingAppointmentRecord> {
  const viewing = await ctx.repository.getViewingById(appointmentId);
  if (!viewing) throw new DealValidationError('VIEWING_NOT_FOUND', 'Viewing appointment not found.');
  if (viewing.hostUserId !== actorUserId) {
    throw new DealValidationError('UNAUTHORIZED_VIEWING_HOST', 'Only the designated host can confirm this viewing.');
  }

  viewing.status = 'confirmed';
  viewing.disclosurePolicy = 'exact_address_confirmed';
  viewing.updatedAtIso = new Date().toISOString();

  await ctx.repository.saveViewingAppointment(viewing);
  await ctx.emitEvent('viewing.confirmed', appointmentId, 'viewing', actorUserId, { requestingUserId: viewing.requestingUserId });
  return viewing;
}

export async function rescheduleViewingWorkflow(
  ctx: ViewingsWorkflowContext,
  appointmentId: string,
  newTimeIso: string,
  reason: string,
  actorUserId: string,
): Promise<ViewingAppointmentRecord> {
  const viewing = await ctx.repository.getViewingById(appointmentId);
  if (!viewing) throw new DealValidationError('VIEWING_NOT_FOUND', 'Viewing appointment not found.');
  if (viewing.requestingUserId !== actorUserId && viewing.hostUserId !== actorUserId) {
    throw new DealValidationError('UNAUTHORIZED_VIEWING_ACCESS', 'Only viewing participants can reschedule.');
  }

  const validNewTime = validateIsoDateString(newTimeIso, 'newStartTimeIso', true);
  viewing.reschedulingHistory.push({
    previousTimeIso: viewing.scheduledStartTimeIso,
    newTimeIso: validNewTime,
    proposedByUserId: actorUserId,
    timestampIso: new Date().toISOString(),
    reason: sanitizeText(reason, 200),
  });

  viewing.scheduledStartTimeIso = validNewTime;
  viewing.status = 'rescheduling_proposed';
  viewing.updatedAtIso = new Date().toISOString();

  await ctx.repository.saveViewingAppointment(viewing);
  await ctx.emitEvent('viewing.rescheduled', appointmentId, 'viewing', actorUserId, { newTimeIso: validNewTime });
  return viewing;
}

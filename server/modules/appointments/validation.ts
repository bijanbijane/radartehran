/**
 * Domain Validation & State Transitions for Appointments
 * (`server/modules/appointments/validation.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import { AppointmentLifecycleStatus, AppointmentLocation, AppointmentRecord } from './types.js';

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480; // 8 hours
export const MAX_BUFFER_MINUTES = 120; // 2 hours

export const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentLifecycleStatus, AppointmentLifecycleStatus[]> = {
  draft: ['proposed', 'cancelled'],
  proposed: ['awaiting_responses', 'confirmed', 'reschedule_requested', 'cancelled'],
  awaiting_responses: ['confirmed', 'reschedule_requested', 'cancelled', 'expired'],
  confirmed: ['in_progress', 'completed', 'reschedule_requested', 'cancellation_requested', 'cancelled', 'no_show'],
  reschedule_requested: ['proposed', 'awaiting_responses', 'confirmed', 'cancelled'],
  cancellation_requested: ['cancelled', 'confirmed'],
  in_progress: ['completed', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
  expired: []
};

export function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && value.includes('T');
}

export function validateAppointmentTimeWindow(
  startIso: string,
  endIso: string,
  allowPast: boolean = false
): { durationMinutes: number } {
  if (!isValidIsoDateTime(startIso)) {
    throw new Error('زمان شروع جلسه نامعتبر است (فرمت ISO الزامی است).');
  }
  if (!isValidIsoDateTime(endIso)) {
    throw new Error('زمان پایان جلسه نامعتبر است (فرمت ISO الزامی است).');
  }

  const startTime = new Date(startIso).getTime();
  const endTime = new Date(endIso).getTime();

  if (startTime >= endTime) {
    throw new Error('زمان شروع باید پیش از زمان پایان باشد.');
  }

  const durationMinutes = Math.round((endTime - startTime) / (60 * 1000));
  if (durationMinutes < MIN_DURATION_MINUTES) {
    throw new Error(`حداقل مدت زمان جلسه ${MIN_DURATION_MINUTES} دقیقه است.`);
  }
  if (durationMinutes > MAX_DURATION_MINUTES) {
    throw new Error(`حداکثر مدت زمان جلسه ${MAX_DURATION_MINUTES} دقیقه (۸ ساعت) است.`);
  }

  if (!allowPast) {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (startTime < fiveMinutesAgo) {
      throw new Error('جلسه نمی‌تواند در زمان گذشته تعیین شود.');
    }
  }

  return { durationMinutes };
}

export function validateBuffers(bufferBeforeMinutes?: number, bufferAfterMinutes?: number): {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
} {
  const before = bufferBeforeMinutes ?? 0;
  const after = bufferAfterMinutes ?? 0;

  if (before < 0 || before > MAX_BUFFER_MINUTES) {
    throw new Error(`بافر قبل از جلسه باید بین ۰ تا ${MAX_BUFFER_MINUTES} دقیقه باشد.`);
  }
  if (after < 0 || after > MAX_BUFFER_MINUTES) {
    throw new Error(`بافر بعد از جلسه باید بین ۰ تا ${MAX_BUFFER_MINUTES} دقیقه باشد.`);
  }

  return { bufferBeforeMinutes: before, bufferAfterMinutes: after };
}

/**
 * Checks if two appointments collide considering their respective buffer windows
 */
export function doIntervalsCollide(
  startAIso: string,
  endAIso: string,
  bufferBeforeA: number,
  bufferAfterA: number,
  startBIso: string,
  endBIso: string,
  bufferBeforeB: number,
  bufferAfterB: number
): boolean {
  const effectiveStartA = new Date(startAIso).getTime() - bufferBeforeA * 60 * 1000;
  const effectiveEndA = new Date(endAIso).getTime() + bufferAfterA * 60 * 1000;

  const effectiveStartB = new Date(startBIso).getTime() - bufferBeforeB * 60 * 1000;
  const effectiveEndB = new Date(endBIso).getTime() + bufferAfterB * 60 * 1000;

  return effectiveStartA < effectiveEndB && effectiveEndA > effectiveStartB;
}

export function assertValidStatusTransition(
  currentStatus: AppointmentLifecycleStatus,
  targetStatus: AppointmentLifecycleStatus
): void {
  if (currentStatus === targetStatus) return;

  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(
      `تغییر وضعیت از "${currentStatus}" به "${targetStatus}" مجاز نیست.`
    );
  }
}

/**
 * Masks physical address details unless explicitly authorized and confirmed
 */
export function sanitizeAppointmentLocation(location: AppointmentLocation): AppointmentLocation {
  if (location.exactAddressDisclosed) {
    return { ...location };
  }

  return {
    ...location,
    streetText: undefined,
    accessInstructionsMasked: undefined,
    exactAddressDisclosed: false
  };
}

/**
 * Sanitizes an appointment record for a viewer who may not have full address disclosure permission
 */
export function sanitizeAppointmentForViewer(
  appointment: AppointmentRecord,
  requestingUserId: string
): AppointmentRecord {
  const isParticipant = appointment.participants.some(p => p.userId === requestingUserId);
  const isOrganizer = appointment.organizerUserId === requestingUserId;
  const isConfirmed = appointment.status === 'confirmed' || appointment.status === 'in_progress' || appointment.status === 'completed';

  const shouldDisclose = isOrganizer || (isParticipant && isConfirmed);

  if (shouldDisclose) {
    return appointment;
  }

  return {
    ...appointment,
    location: sanitizeAppointmentLocation({
      ...appointment.location,
      exactAddressDisclosed: false
    })
  };
}

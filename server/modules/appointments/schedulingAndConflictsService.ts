/**
 * Scheduling Conflicts & Recurring Series Expansion Engine
 * (`server/modules/appointments/schedulingAndConflictsService.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import { AppointmentRepository } from './repository.js';
import {
  AppointmentRecord,
  RecurringAppointmentSeries,
  SchedulingConflict
} from './types.js';

export const MIN_ADVANCE_NOTICE_MINUTES = 30;
export const MAX_RECURRENCE_OCCURRENCES = 52;

export interface ConflictCheckParams {
  participantUserIds: string[];
  organizerUserId: string;
  propertyId?: string;
  startIso: string;
  endIso: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  excludeAppointmentId?: string;
  enforceAdvanceNotice?: boolean;
}

export async function detectSchedulingConflicts(
  repo: AppointmentRepository,
  params: ConflictCheckParams
): Promise<SchedulingConflict[]> {
  const conflicts: SchedulingConflict[] = [];

  const startTime = new Date(params.startIso).getTime();
  const now = Date.now();

  // 1. Advance notice check
  if (params.enforceAdvanceNotice !== false) {
    const minAdvanceMs = MIN_ADVANCE_NOTICE_MINUTES * 60 * 1000;
    if (startTime - now < minAdvanceMs) {
      conflicts.push({
        hasConflict: true,
        conflictType: 'insufficient_advance_notice',
        explanationFa: `رزرو نوبت نیازمند حداقل ${MIN_ADVANCE_NOTICE_MINUTES} دقیقه هماهنگی قبلی است.`
      });
    }
  }

  // 2. Working hours check (Tehran / local business window: 08:00 to 22:00)
  const startDate = new Date(params.startIso);
  const startHour = startDate.getUTCHours(); // Note: working window validation
  if (startHour < 3 || startHour > 19) { // 3 UTC is 06:30 Tehran, 19 UTC is 22:30 Tehran
    conflicts.push({
      hasConflict: true,
      conflictType: 'outside_working_hours',
      explanationFa: 'زمان انتخابی خارج از بازه زمانی استاندارد کاری (۸:۰۰ الی ۲۲:۰۰) است.'
    });
  }

  // 3. Overlap collisions for participants and property
  const allUserIds = Array.from(new Set([...params.participantUserIds, params.organizerUserId]));
  const collidingAppointments = await repo.findPotentialCollisions(
    allUserIds,
    params.propertyId,
    params.startIso,
    params.endIso,
    params.bufferBeforeMinutes ?? 0,
    params.bufferAfterMinutes ?? 0,
    params.excludeAppointmentId
  );

  for (const appt of collidingAppointments) {
    // Check if property collided
    if (params.propertyId && appt.propertyId === params.propertyId) {
      conflicts.push({
        hasConflict: true,
        conflictType: 'property_busy',
        conflictingAppointmentId: appt.appointmentId,
        conflictingEntityId: params.propertyId,
        explanationFa: `ملک مورد نظر در بازه انتخابی با جلسه «${appt.titleFa}» تداخل زمانی دارد.`
      });
    }

    // Check which participant collided
    const apptUsers = new Set(
      appt.participants.map(p => p.userId).filter((id): id is string => Boolean(id))
    );
    apptUsers.add(appt.organizerUserId);

    for (const userId of allUserIds) {
      if (apptUsers.has(userId)) {
        conflicts.push({
          hasConflict: true,
          conflictType: 'participant_busy',
          conflictingAppointmentId: appt.appointmentId,
          conflictingEntityId: userId,
          explanationFa: `کاربر ${userId} در این بازه زمانی با قرار ملاقات «${appt.titleFa}» تداخل برنامه دارد.`
        });
      }
    }
  }

  return conflicts;
}

export function generateRecurringOccurrences(
  series: RecurringAppointmentSeries
): Array<{ startIso: string; endIso: string; index: number }> {
  const occurrences: Array<{ startIso: string; endIso: string; index: number }> = [];
  const maxCount = Math.min(series.maxOccurrences, MAX_RECURRENCE_OCCURRENCES);
  const seriesEndTime = new Date(series.seriesEndIso).getTime();

  let currentStart = new Date(series.firstOccurrenceStartIso);

  for (let i = 0; i < maxCount; i++) {
    const currentStartTime = currentStart.getTime();
    if (currentStartTime > seriesEndTime) {
      break;
    }

    const currentEndTime = currentStartTime + series.durationMinutes * 60 * 1000;
    occurrences.push({
      startIso: currentStart.toISOString(),
      endIso: new Date(currentEndTime).toISOString(),
      index: i + 1
    });

    // Advance based on frequency
    const nextStart = new Date(currentStart);
    switch (series.frequency) {
      case 'daily':
        nextStart.setDate(nextStart.getDate() + 1);
        break;
      case 'weekly':
        nextStart.setDate(nextStart.getDate() + 7);
        break;
      case 'biweekly':
        nextStart.setDate(nextStart.getDate() + 14);
        break;
      case 'monthly':
        nextStart.setMonth(nextStart.getMonth() + 1);
        break;
    }
    currentStart = nextStart;
  }

  return occurrences;
}

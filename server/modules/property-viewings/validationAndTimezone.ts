import {
  PropertyViewingAppointmentRecord,
  ViewingActorContext,
  ViewingBookingStatus,
  ViewingError,
  ViewingFeedbackRecord,
} from './types';

export function validateIanaTimezone(timezoneId: string): string {
  const trimmed = (timezoneId ?? '').trim();
  if (!trimmed) {
    throw new ViewingError('INVALID_TIMEZONE', 'timezoneId must not be empty.', 400);
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    throw new ViewingError('INVALID_TIMEZONE', `Unrecognized IANA timezone identifier '${timezoneId}'.`, 400);
  }
}

export function validateTimeRange(startIso: string, endIso: string): { startMs: number; endMs: number; durationMinutes: number } {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new ViewingError(
      'INVALID_TIME_RANGE',
      `Invalid time range: start (${startIso}) must be strictly before end (${endIso}).`,
      400
    );
  }
  const durationMinutes = Math.round((endMs - startMs) / 60000);
  return { startMs, endMs, durationMinutes };
}

export function formatLocalTimeInZone(isoString: string, timezoneId: string): {
  dayOfWeek: number;
  hm: string;
  formatted: string;
} {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneId,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    dayOfWeek: dayMap[map.weekday] ?? 0,
    hm: `${hour}:${map.minute}`,
    formatted: `${map.year}-${map.month}-${map.day} ${hour}:${map.minute} (${timezoneId})`,
  };
}

export function intervalsOverlapWithBuffer(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0
): boolean {
  const expandedBStart = bStartMs - bufferBeforeMinutes * 60000;
  const expandedBEnd = bEndMs + bufferAfterMinutes * 60000;
  return aStartMs < expandedBEnd && aEndMs > expandedBStart;
}

const ALLOWED_BOOKING_TRANSITIONS: Record<ViewingBookingStatus, ViewingBookingStatus[]> = {
  DRAFT: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['PENDING_HOST_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  PENDING_HOST_CONFIRMATION: ['CONFIRMED', 'REJECTED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'],
  RESCHEDULE_REQUESTED: ['RESCHEDULED', 'CONFIRMED', 'REJECTED', 'CANCELLED'],
  RESCHEDULED: ['RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  COMPLETED: [],
  NO_SHOW: [],
  FAILED: [],
};

export function assertValidBookingTransition(
  current: ViewingBookingStatus,
  next: ViewingBookingStatus
): void {
  const allowed = ALLOWED_BOOKING_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new ViewingError(
      'INVALID_WORKFLOW_TRANSITION',
      `Invalid viewing appointment transition from '${current}' to '${next}'.`,
      409
    );
  }
}

export function assertCanReadAppointment(
  actor: ViewingActorContext,
  appointment: PropertyViewingAppointmentRecord
): void {
  if (actor.role === 'PLATFORM_AUDITOR') return;
  if (
    actor.userId === appointment.requestingUserId ||
    actor.userId === appointment.hostUserId ||
    appointment.participants.some((p) => p.participantId === actor.userId && p.invitationStatus !== 'REMOVED') ||
    (actor.brokerageOrganizationId && actor.brokerageOrganizationId === appointment.brokerageOrganizationId)
  ) {
    return;
  }
  throw new ViewingError(
    'INSUFFICIENT_PRIVILEGE',
    `User '${actor.userId}' is not authorized to view appointment '${appointment.id}'.`,
    403
  );
}

export function assertNoPermanentAccessSecrets(instructions: string): void {
  const lower = instructions.toLowerCase();
  if (
    lower.includes('master password') ||
    lower.includes('permanent pin') ||
    lower.includes('master key code')
  ) {
    throw new ViewingError(
      'PERMANENT_CREDENTIAL_FORBIDDEN',
      'Permanent access credentials or master passwords must never be stored in viewing access records.',
      400
    );
  }
}

export function projectFeedbackForViewer(
  actor: ViewingActorContext,
  feedback: ViewingFeedbackRecord,
  appointment: PropertyViewingAppointmentRecord
): Omit<ViewingFeedbackRecord, 'privateComments'> & { privateComments?: string } {
  if (actor.userId === feedback.participantId || actor.role === 'PLATFORM_AUDITOR') {
    return feedback;
  }
  const isHostOrOwner =
    actor.userId === appointment.hostUserId ||
    actor.role === 'PROPERTY_OWNER' ||
    actor.role === 'ASSIGNED_AGENT';

  if (isHostOrOwner && feedback.discloseSummaryToOwnerOrListingRep) {
    const { privateComments: _hidden, ...rest } = feedback;
    return rest;
  }
  throw new ViewingError(
    'INSUFFICIENT_PRIVILEGE',
    'Viewer is not authorized to access private viewing feedback.',
    403
  );
}

export function normalizeBoundedLimit(limit?: number, defaultLimit = 25, maxLimit = 100): number {
  if (limit === undefined) return defaultLimit;
  if (!Number.isFinite(limit) || limit < 1 || limit > maxLimit) {
    throw new ViewingError(
      'VALIDATION_FAILED',
      `Pagination limit must be between 1 and ${maxLimit} (got ${limit}).`,
      400
    );
  }
  return Math.floor(limit);
}

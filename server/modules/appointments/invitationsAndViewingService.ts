/**
 * Property Viewing, Invitations, Rescheduling & Attendance Workflows
 * (`server/modules/appointments/invitationsAndViewingService.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import {
  AppointmentRecord,
  AttendanceStatus,
  InvitationStatus
} from './types.js';
import {
  assertValidStatusTransition,
  validateAppointmentTimeWindow
} from './validation.js';

export interface ProposeRescheduleParams {
  appointment: AppointmentRecord;
  proposerUserId: string;
  newStartIso: string;
  newEndIso: string;
  reasonFa?: string;
}

export function proposeRescheduleWorkflow(params: ProposeRescheduleParams): AppointmentRecord {
  const { appointment, proposerUserId, newStartIso, newEndIso, reasonFa } = params;

  // Validate that user is either organizer or participant
  const isParticipant = appointment.participants.some(p => p.userId === proposerUserId);
  const isOrganizer = appointment.organizerUserId === proposerUserId;
  if (!isParticipant && !isOrganizer) {
    throw new Error('فقط برگزارکننده یا شرکت‌کنندگان مجاز به پیشنهاد تغییر زمان جلسه هستند.');
  }

  assertValidStatusTransition(appointment.status, 'reschedule_requested');
  const { durationMinutes } = validateAppointmentTimeWindow(newStartIso, newEndIso);

  const historyEntry = {
    previousStartIso: appointment.startIso,
    previousEndIso: appointment.endIso,
    newStartIso,
    newEndIso,
    proposedByUserId: proposerUserId,
    reasonFa,
    timestampIso: new Date().toISOString()
  };

  // Reset participant statuses for new proposed time
  const updatedParticipants = appointment.participants.map(p => {
    if (p.userId === proposerUserId) {
      return {
        ...p,
        invitationStatus: 'accepted' as InvitationStatus,
        responseTimestampIso: new Date().toISOString()
      };
    }
    return {
      ...p,
      invitationStatus: 'pending' as InvitationStatus,
      responseTimestampIso: undefined
    };
  });

  return {
    ...appointment,
    status: 'reschedule_requested',
    reschedulingHistory: [...appointment.reschedulingHistory, historyEntry],
    participants: updatedParticipants,
    updatedAtIso: new Date().toISOString(),
    revision: appointment.revision + 1
  };
}

export function acceptRescheduleWorkflow(
  appointment: AppointmentRecord,
  actorUserId: string
): AppointmentRecord {
  const isOrganizer = appointment.organizerUserId === actorUserId;
  if (!isOrganizer) {
    throw new Error('تنها برگزارکننده مجاز به تایید نهایی پیشنهاد تغییر زمان است.');
  }

  if (appointment.status !== 'reschedule_requested') {
    throw new Error('جلسه در وضعیت درخواست تغییر زمان نیست.');
  }

  const latestProposal = appointment.reschedulingHistory[appointment.reschedulingHistory.length - 1];
  if (!latestProposal) {
    throw new Error('تاریخچه‌ای برای تغییر زمان یافت نشد.');
  }

  const { durationMinutes } = validateAppointmentTimeWindow(
    latestProposal.newStartIso,
    latestProposal.newEndIso
  );

  assertValidStatusTransition(appointment.status, 'confirmed');

  return {
    ...appointment,
    startIso: latestProposal.newStartIso,
    endIso: latestProposal.newEndIso,
    durationMinutes,
    status: 'confirmed',
    updatedAtIso: new Date().toISOString(),
    revision: appointment.revision + 1
  };
}

export function respondToInvitationWorkflow(
  appointment: AppointmentRecord,
  userId: string,
  response: 'accepted' | 'declined' | 'tentative'
): AppointmentRecord {
  const participantIndex = appointment.participants.findIndex(p => p.userId === userId);
  if (participantIndex === -1) {
    throw new Error('کاربر در لیست شرکت‌کنندگان این جلسه وجود ندارد.');
  }

  const participant = appointment.participants[participantIndex];
  const updatedParticipant = {
    ...participant,
    invitationStatus: response,
    responseTimestampIso: new Date().toISOString()
  };

  const updatedParticipants = [...appointment.participants];
  updatedParticipants[participantIndex] = updatedParticipant;

  // Check if status should update
  let newStatus = appointment.status;
  if (response === 'declined' && participant.role === 'seller') {
    // If key host declined, we can mark reschedule_requested or await another response
  } else if (response === 'accepted') {
    const allAccepted = updatedParticipants.every(
      p => p.invitationStatus === 'accepted' || p.role === 'attendee'
    );
    if (allAccepted && appointment.status === 'awaiting_responses') {
      newStatus = 'confirmed';
    }
  }

  // If confirmed, disclose address for viewing appointments
  let updatedLocation = appointment.location;
  if (newStatus === 'confirmed' && !updatedLocation.exactAddressDisclosed) {
    updatedLocation = {
      ...updatedLocation,
      exactAddressDisclosed: true
    };
  }

  return {
    ...appointment,
    status: newStatus,
    location: updatedLocation,
    participants: updatedParticipants,
    updatedAtIso: new Date().toISOString(),
    revision: appointment.revision + 1
  };
}

export function recordAttendanceWorkflow(
  appointment: AppointmentRecord,
  recorderUserId: string,
  records: Array<{
    userId?: string;
    participantId?: string;
    status: AttendanceStatus;
    notesFa?: string;
  }>
): AppointmentRecord {
  const isOrganizer = appointment.organizerUserId === recorderUserId;
  const isAgent = appointment.participants.some(
    p => p.userId === recorderUserId && (p.role === 'real_estate_agent' || p.role === 'service_provider')
  );

  if (!isOrganizer && !isAgent) {
    throw new Error('فقط برگزارکننده یا مشاور جلسه مجاز به ثبت وضعیت حضور است.');
  }

  const updatedParticipants = appointment.participants.map(p => {
    const record = records.find(r => (r.userId && r.userId === p.userId) || (r.participantId && r.participantId === p.participantId));
    if (!record) return p;

    return {
      ...p,
      attendanceStatus: record.status,
      attendanceNotesFa: record.notesFa ?? p.attendanceNotesFa
    };
  });

  const didAnyoneAttend = updatedParticipants.some(p => p.attendanceStatus === 'attended');
  const nonOrganizerKeyParticipants = updatedParticipants.filter(p => !p.isOrganizer && p.role !== 'attendee');
  const didAllKeyNoShow =
    nonOrganizerKeyParticipants.length > 0 &&
    nonOrganizerKeyParticipants.every(p => p.attendanceStatus === 'did_not_attend');

  let targetStatus = appointment.status;
  if (didAllKeyNoShow) {
    targetStatus = 'no_show';
  } else if (didAnyoneAttend && appointment.status !== 'completed') {
    targetStatus = 'completed';
  }

  return {
    ...appointment,
    status: targetStatus,
    participants: updatedParticipants,
    updatedAtIso: new Date().toISOString(),
    revision: appointment.revision + 1
  };
}

/**
 * Property Viewings & Appointment Scheduling Domain Types
 * (`server/modules/appointments/types.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

export type AppointmentCategory =
  | 'property_viewing'
  | 'second_viewing'
  | 'property_inspection'
  | 'technical_assessment'
  | 'valuation_visit'
  | 'handover_meeting'
  | 'buyer_consultation'
  | 'seller_consultation'
  | 'contractor_visit'
  | 'maintenance_visit'
  | 'document_review'
  | 'other';

export type MeetingMode = 'in_person_at_property' | 'in_person_at_office' | 'in_person_at_provider' | 'online_meeting' | 'phone_call';

export type AppointmentLifecycleStatus =
  | 'draft'
  | 'proposed'
  | 'awaiting_responses'
  | 'confirmed'
  | 'reschedule_requested'
  | 'cancellation_requested'
  | 'cancelled'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'expired';

export type ParticipantRole =
  | 'organizer'
  | 'buyer'
  | 'seller'
  | 'property_owner'
  | 'real_estate_agent'
  | 'tenant'
  | 'landlord'
  | 'property_manager'
  | 'service_provider'
  | 'technical_inspector'
  | 'valuation_professional'
  | 'attendee';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'tentative' | 'expired' | 'revoked';

export type AttendanceStatus = 'not_recorded' | 'attended' | 'did_not_attend' | 'arrived_late' | 'excused' | 'unknown';

export interface AppointmentLocation {
  mode: MeetingMode;
  cityId?: string;
  hoodId?: number;
  hoodNameFa?: string;
  streetText?: string;
  exactAddressDisclosed: boolean;
  onlineMeetingUrl?: string;
  phoneDialInNumber?: string;
  accessInstructionsMasked?: string;
}

export interface AppointmentParticipant {
  participantId: string;
  appointmentId: string;
  userId?: string;
  nameFa: string;
  role: ParticipantRole;
  isOrganizer: boolean;
  invitationStatus: InvitationStatus;
  responseTimestampIso?: string;
  attendanceStatus: AttendanceStatus;
  attendanceNotesFa?: string;
  contactPhoneMasked?: string;
}

export interface AppointmentRecord {
  appointmentId: string;
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
  timezone: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  location: AppointmentLocation;
  participants: AppointmentParticipant[];
  status: AppointmentLifecycleStatus;
  reschedulingHistory: Array<{
    previousStartIso: string;
    previousEndIso: string;
    newStartIso: string;
    newEndIso: string;
    proposedByUserId: string;
    reasonFa?: string;
    timestampIso: string;
  }>;
  cancellationReasonFa?: string;
  cancelledByUserId?: string;
  outcomeSummaryFa?: string;
  isRecurringInstance: boolean;
  recurrenceSeriesId?: string;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
}

export interface RecurringAppointmentSeries {
  seriesId: string;
  organizerUserId: string;
  appointmentTemplate: Omit<AppointmentRecord, 'appointmentId' | 'startIso' | 'endIso' | 'isRecurringInstance' | 'recurrenceSeriesId' | 'revision'>;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  firstOccurrenceStartIso: string;
  durationMinutes: number;
  maxOccurrences: number;
  seriesEndIso: string;
  status: 'active' | 'cancelled';
  createdAtIso: string;
}

export interface SchedulingConflict {
  hasConflict: boolean;
  conflictType: 'participant_busy' | 'property_busy' | 'outside_working_hours' | 'insufficient_advance_notice';
  conflictingAppointmentId?: string;
  conflictingEntityId?: string;
  explanationFa: string;
}

export interface CalendarQueryFilters {
  userId?: string;
  propertyId?: string;
  organizerId?: string;
  status?: AppointmentLifecycleStatus;
  fromIso: string;
  toIso: string;
  limit: number;
  cursor?: string;
}

export interface AppointmentDomainEvent {
  eventId: string;
  eventType:
    | 'appointments.created'
    | 'appointments.proposed'
    | 'appointments.participant_invited'
    | 'appointments.participant_accepted'
    | 'appointments.participant_declined'
    | 'appointments.confirmed'
    | 'appointments.reschedule_requested'
    | 'appointments.rescheduled'
    | 'appointments.cancelled'
    | 'appointments.completed'
    | 'appointments.no_show_recorded'
    | 'appointments.attendance_updated';
  aggregateId: string;
  aggregateType: 'appointment' | 'participant' | 'series';
  actorUserId: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}

export type ViewingAppointmentType =
  | 'IN_PERSON_VIEWING'
  | 'GROUP_VIEWING'
  | 'VIRTUAL_VIEWING'
  | 'COMMERCIAL_VIEWING'
  | 'LAND_OR_SITE_VISIT'
  | 'FOLLOW_UP_VIEWING';

export type ViewingBookingStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'PENDING_HOST_CONFIRMATION'
  | 'CONFIRMED'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'FAILED';

export type ParticipantRole =
  | 'REQUESTING_BUYER'
  | 'PROSPECTIVE_TENANT'
  | 'PROPERTY_OWNER'
  | 'LANDLORD'
  | 'SELLER'
  | 'LISTING_REPRESENTATIVE'
  | 'ASSIGNED_AGENT'
  | 'AUTHORIZED_HOST'
  | 'ADDITIONAL_INVITED_PARTICIPANT';

export interface AppointmentParticipantRecord {
  participantId: string;
  appointmentId: string;
  role: ParticipantRole;
  invitationStatus: 'INVITED' | 'ACCEPTED' | 'REJECTED' | 'REMOVED' | 'CANCELLED';
  confirmationStatus: 'UNCONFIRMED' | 'CONFIRMED';
  participationRequirements?: string;
  invitedAtIso: string;
  respondedAtIso?: string;
  canViewAccessInstructions: boolean;
}

export interface RescheduleHistoryEntry {
  id: string;
  originalStartIso: string;
  originalEndIso: string;
  requestedNewStartIso: string;
  requestedNewEndIso: string;
  requestedByUserId: string;
  reasonCategory: string;
  hostResponse: 'PENDING' | 'APPROVED' | 'REJECTED';
  finalConfirmedStartIso?: string;
  finalConfirmedEndIso?: string;
  recordedAtIso: string;
}

export interface CancellationRecord {
  cancelledByUserId: string;
  cancellationReason: string;
  cancelledAtIso: string;
  noticePeriodMinutes: number;
  classification: 'STANDARD_NOTICE' | 'LATE_NOTICE' | 'HOST_INITIATED' | 'SYSTEM_EXPIRED';
  policyReferenceId?: string;
}

export interface PropertyViewingAppointmentRecord {
  id: string;
  propertyId: string;
  listingId?: string;
  requestingUserId: string;
  hostUserId: string;
  brokerageOrganizationId?: string;
  mandateId?: string;
  transactionRef?: string;
  appointmentType: ViewingAppointmentType;
  requestedStartIso: string;
  requestedEndIso: string;
  confirmedStartIso?: string;
  confirmedEndIso?: string;
  timezoneId: string;
  durationMinutes: number;
  capacity: number;
  participants: AppointmentParticipantRecord[];
  status: ViewingBookingStatus;
  locationOrMeetingSummary: string;
  accessCoordinationStatus: 'NOT_COORDINATED' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED';
  accessCoordinationId?: string;
  virtualSessionId?: string;
  specialRequirements?: string;
  rescheduleHistory: RescheduleHistoryEntry[];
  cancellationRecord?: CancellationRecord;
  version: number;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AvailabilityWindowType =
  | 'ONE_TIME_AVAILABLE'
  | 'RECURRING_AVAILABLE'
  | 'UNAVAILABLE_BLACKOUT'
  | 'TEMPORARY_OVERRIDE';

export interface HostAvailabilityWindowRecord {
  id: string;
  ownerUserId: string;
  ownerType: 'REAL_ESTATE_PROFESSIONAL' | 'PROPERTY_OWNER_OR_HOST' | 'BROKERAGE_ORGANIZATION' | 'ACCESS_COORDINATOR';
  propertyId?: string;
  availabilityType: AvailabilityWindowType;
  startIso: string;
  endIso: string;
  timezoneId: string;
  recurrenceRule?: {
    daysOfWeek: number[]; // 0=Sun..6=Sat in local timezone
    localStartTimeHm: string; // e.g. '09:00'
    localEndTimeHm: string; // e.g. '17:00'
  };
  status: 'ACTIVE' | 'INACTIVE';
  capacity: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minAdvanceNoticeMinutes: number;
  maxAdvanceHorizonDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookableViewingSlot {
  slotId: string;
  propertyId: string;
  hostUserId: string;
  availabilityWindowId: string;
  startIso: string;
  endIso: string;
  timezoneId: string;
  localStartDisplay: string;
  durationMinutes: number;
  remainingCapacity: number;
}

export interface TemporarySlotHoldRecord {
  id: string;
  propertyId: string;
  hostUserId: string;
  requestedByUserId: string;
  startIso: string;
  endIso: string;
  expiresAtIso: string;
  status: 'ACTIVE_HOLD' | 'CONVERTED_TO_BOOKING' | 'EXPIRED';
  createdAt: string;
}

export type AccessCoordinationMethod =
  | 'HOST_ACCOMPANIES_VISITORS'
  | 'ASSIGNED_AGENT_PROVIDES_ACCESS'
  | 'OWNER_REPRESENTATIVE_PROVIDES_ACCESS'
  | 'BUILDING_MANAGER_COORDINATES_ACCESS'
  | 'APPROVED_TEMPORARY_ACCESS_ARRANGEMENT';

export interface PropertyAccessCoordinationRecord {
  id: string;
  appointmentId: string;
  responsibleAuthorizedUserId: string;
  accessMethod: AccessCoordinationMethod;
  validityStartIso: string;
  validityEndIso: string;
  restrictedAccessInstructions: string;
  authorizationSourceRef: string;
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'EXPIRED';
  restrictionsSummary?: string;
  completionStatus: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  createdByUserId: string;
  disclosedToUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VirtualViewingSessionRecord {
  id: string;
  appointmentId: string;
  meetingProviderRef: string;
  privateMeetingUrlRef: string;
  startIso: string;
  endIso: string;
  hostUserId: string;
  authorizedParticipantIds: string[];
  sessionStatus: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  invitationDeliveryStatus: 'NOT_SENT' | 'REQUESTED' | 'ACCEPTED_BY_PROVIDER' | 'DELIVERED_VERIFIED';
  recordingConsentGranted: boolean;
  recordingRef?: string;
  createdAt: string;
  updatedAt: string;
}

export type ViewingAttendanceState =
  | 'EXPECTED'
  | 'CONFIRMED_ATTENDANCE'
  | 'ATTENDED'
  | 'PARTIALLY_ATTENDED'
  | 'NO_SHOW'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ViewingAttendanceRecord {
  id: string;
  appointmentId: string;
  participantId: string;
  attendanceState: ViewingAttendanceState;
  provenance: 'PARTICIPANT_SELF_REPORTED' | 'HOST_REPORTED' | 'SYSTEM_CONFIRMED';
  recordedByUserId: string;
  verificationMethod: string;
  supportingEvidenceId?: string;
  recordedAtIso: string;
}

export type ViewingInterestClassification =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'REQUIRES_ANOTHER_VIEWING'
  | 'REQUIRES_ADDITIONAL_INFORMATION'
  | 'CONSIDERING_AN_OFFER'
  | 'UNDECIDED';

export interface ViewingFeedbackRecord {
  id: string;
  appointmentId: string;
  propertyId: string;
  participantId: string;
  interestClassification: ViewingInterestClassification;
  privateComments: string;
  ownerApprovedSummary?: string;
  requestedFollowUp?: string;
  reportedPropertyConcerns?: string;
  discloseSummaryToOwnerOrListingRep: boolean;
  createdAtIso: string;
}

export type NotificationLifecycleStage =
  | 'EVENT_CREATED'
  | 'NOTIFICATION_REQUESTED'
  | 'ACCEPTED_BY_PROVIDER'
  | 'DELIVERED_VERIFIED';

export interface ViewingNotificationEventRecord {
  id: string;
  appointmentId: string;
  eventType:
    | 'VIEWING_REQUESTED'
    | 'HOST_CONFIRMATION_REQUIRED'
    | 'VIEWING_CONFIRMED'
    | 'VIEWING_RESCHEDULED'
    | 'VIEWING_CANCELLED'
    | 'VIEWING_APPROACHING'
    | 'PARTICIPANT_INVITATION_RECEIVED'
    | 'ACCESS_INSTRUCTIONS_AVAILABLE'
    | 'ATTENDANCE_RECORDED'
    | 'FEEDBACK_REQUESTED';
  recipientUserId: string;
  deliveryStage: NotificationLifecycleStage;
  providerReferenceId?: string;
  createdAtIso: string;
}

export interface OperationalViewingMetricEntry {
  metricName: string;
  definition: string;
  value: number;
  measurementPeriod: { fromIso: string; toIso: string };
  timezoneId: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  sourceRecordsCount: number;
  calculatedAtIso: string;
  dataCompletenessLimitations: string;
}

export interface OperationalViewingMetricsReport {
  propertyId?: string;
  hostUserId?: string;
  timezoneId: string;
  generatedAtIso: string;
  metrics: Record<string, OperationalViewingMetricEntry>;
}

export type ViewingActorRole =
  | 'BUYER_OR_TENANT'
  | 'PROPERTY_OWNER'
  | 'AUTHORIZED_HOST'
  | 'ASSIGNED_AGENT'
  | 'BROKERAGE_ADMIN'
  | 'PLATFORM_AUDITOR';

export interface ViewingActorContext {
  userId: string;
  role: ViewingActorRole;
  brokerageOrganizationId?: string;
}

export type ViewingErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'UNAUTHORIZED_PROPERTY_VIEWING_ACCESS'
  | 'UNAUTHORIZED_HOST_OR_AGENT'
  | 'INVALID_TIMEZONE'
  | 'INVALID_TIME_RANGE'
  | 'MIN_BOOKING_NOTICE_VIOLATION'
  | 'MAX_BOOKING_HORIZON_EXCEEDED'
  | 'SCHEDULING_CONFLICT_DOUBLE_BOOKING'
  | 'CAPACITY_EXCEEDED'
  | 'HOLD_EXPIRED_OR_INVALID'
  | 'INVALID_WORKFLOW_TRANSITION'
  | 'INSUFFICIENT_PRIVILEGE'
  | 'PERMANENT_CREDENTIAL_FORBIDDEN'
  | 'ACCESS_INSTRUCTIONS_EXPIRED_OR_RESTRICTED'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_FAILURE';

export class ViewingError extends Error {
  constructor(
    public readonly code: ViewingErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ViewingError';
  }
}

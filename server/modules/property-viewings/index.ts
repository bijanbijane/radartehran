export * from './types';
export * from './validationAndTimezone';
export * from './adapters';
export * from './store';
export * from './firestoreStore';
export * from './availabilityAndSlotService';
export * from './appointmentAndBookingService';
export * from './accessAttendanceFeedbackAndMetricsService';

import {
  createDefaultPropertyViewingsAdapters,
  PropertyViewingsExternalAdapters,
} from './adapters';
import { InMemoryPropertyViewingsStore, PropertyViewingsStore } from './store';
import { FirestorePropertyViewingsStore } from './firestoreStore';
import { AvailabilityAndSlotService } from './availabilityAndSlotService';
import { AppointmentAndBookingService } from './appointmentAndBookingService';
import { AccessAttendanceFeedbackAndMetricsService } from './accessAttendanceFeedbackAndMetricsService';

export interface PropertyViewingsModuleOptions {
  store?: PropertyViewingsStore;
  useFirestore?: boolean;
  adapters?: Partial<PropertyViewingsExternalAdapters>;
}

export function createPropertyViewingsModuleFacade(
  options: PropertyViewingsModuleOptions = {}
) {
  const store: PropertyViewingsStore =
    options.store ??
    (options.useFirestore
      ? new FirestorePropertyViewingsStore()
      : new InMemoryPropertyViewingsStore());

  const adapters = createDefaultPropertyViewingsAdapters(options.adapters);
  const availabilityAndSlotService = new AvailabilityAndSlotService(store);
  const appointmentAndBookingService = new AppointmentAndBookingService(store, adapters);
  const accessAttendanceFeedbackAndMetricsService = new AccessAttendanceFeedbackAndMetricsService(store);

  return {
    store,
    adapters,
    availabilityAndSlotService,
    appointmentAndBookingService,
    accessAttendanceFeedbackAndMetricsService,
    registerAvailabilityWindow: availabilityAndSlotService.registerAvailabilityWindow.bind(availabilityAndSlotService),
    updateAvailability: availabilityAndSlotService.updateAvailability.bind(availabilityAndSlotService),
    markUnavailablePeriod: availabilityAndSlotService.markUnavailablePeriod.bind(availabilityAndSlotService),
    generateViewingSlots: availabilityAndSlotService.generateViewingSlots.bind(availabilityAndSlotService),
    createTemporarySlotHold: availabilityAndSlotService.createTemporarySlotHold.bind(availabilityAndSlotService),
    createViewingRequest: appointmentAndBookingService.createViewingRequest.bind(appointmentAndBookingService),
    retrieveAppointment: appointmentAndBookingService.retrieveAppointment.bind(appointmentAndBookingService),
    retrieveAuthorizedPropertyViewingSchedule:
      appointmentAndBookingService.retrieveAuthorizedPropertyViewingSchedule.bind(appointmentAndBookingService),
    confirmViewingReservation: appointmentAndBookingService.confirmViewingReservation.bind(appointmentAndBookingService),
    recordHostConfirmation: appointmentAndBookingService.recordHostConfirmation.bind(appointmentAndBookingService),
    acceptOrRejectViewingRequest: appointmentAndBookingService.acceptOrRejectViewingRequest.bind(appointmentAndBookingService),
    inviteParticipant: appointmentAndBookingService.inviteParticipant.bind(appointmentAndBookingService),
    acceptOrRejectInvitation: appointmentAndBookingService.acceptOrRejectInvitation.bind(appointmentAndBookingService),
    rescheduleAppointment: appointmentAndBookingService.rescheduleAppointment.bind(appointmentAndBookingService),
    cancelAppointment: appointmentAndBookingService.cancelAppointment.bind(appointmentAndBookingService),
    retrieveAppointmentHistory: appointmentAndBookingService.retrieveAppointmentHistory.bind(appointmentAndBookingService),
    retrieveHostSchedule: appointmentAndBookingService.retrieveHostSchedule.bind(appointmentAndBookingService),
    registerAccessCoordinationReference:
      accessAttendanceFeedbackAndMetricsService.registerAccessCoordinationReference.bind(accessAttendanceFeedbackAndMetricsService),
    retrieveAuthorizedAccessInstructions:
      accessAttendanceFeedbackAndMetricsService.retrieveAuthorizedAccessInstructions.bind(accessAttendanceFeedbackAndMetricsService),
    createVirtualViewingSessionReference:
      accessAttendanceFeedbackAndMetricsService.createVirtualViewingSessionReference.bind(accessAttendanceFeedbackAndMetricsService),
    retrieveVirtualViewingSessionReference:
      accessAttendanceFeedbackAndMetricsService.retrieveVirtualViewingSessionReference.bind(accessAttendanceFeedbackAndMetricsService),
    recordAttendance: accessAttendanceFeedbackAndMetricsService.recordAttendance.bind(accessAttendanceFeedbackAndMetricsService),
    recordViewingFeedback: accessAttendanceFeedbackAndMetricsService.recordViewingFeedback.bind(accessAttendanceFeedbackAndMetricsService),
    retrieveViewingFeedbackForActor:
      accessAttendanceFeedbackAndMetricsService.retrieveViewingFeedbackForActor.bind(accessAttendanceFeedbackAndMetricsService),
    retrieveOperationalViewingMetrics:
      accessAttendanceFeedbackAndMetricsService.retrieveOperationalViewingMetrics.bind(accessAttendanceFeedbackAndMetricsService),
  };
}

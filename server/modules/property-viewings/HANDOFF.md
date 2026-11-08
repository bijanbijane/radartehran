# Integration Handoff — Property Viewing & Appointment Scheduling (`server/modules/property-viewings`)

## 1. Exclusive Ownership Compliance

All created files reside strictly inside `server/modules/property-viewings/`:
- `types.ts`
- `validationAndTimezone.ts`
- `adapters.ts`
- `store.ts`
- `firestoreStore.ts`
- `availabilityAndSlotService.ts`
- `appointmentAndBookingService.ts`
- `accessAttendanceFeedbackAndMetricsService.ts`
- `index.ts`
- `README.md`
- `HANDOFF.md`
- `__tests__/propertyViewings.test.ts`

Zero shared files were modified.

## 2. Firestore Collections (`VIEWINGS_FIRESTORE_COLLECTIONS`)

- `property_viewings_availability` (`ownerUserId` ASC)
- `property_viewings_slot_holds` (`propertyId` ASC, `hostUserId` ASC)
- `property_viewings_appointments` (`propertyId` ASC, `hostUserId` ASC)
- `property_viewings_access_coordination` (`appointmentId` ASC)
- `property_viewings_virtual_sessions` (`appointmentId` ASC)
- `property_viewings_attendance` (`appointmentId` ASC)
- `property_viewings_feedback` (`appointmentId` ASC)
- `property_viewings_notification_events` (`appointmentId` ASC)
- `property_viewings_idempotency`

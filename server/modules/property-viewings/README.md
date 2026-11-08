# Property Viewing & Appointment Scheduling Backend (`server/modules/property-viewings`)

## 1. Domain & Epistemic Responsibilities

1. **Availability & Slot Generation**:
   - Supports one-time, recurring (IANA timezone & DST-aware via `Intl.DateTimeFormat`), temporary override, and unavailable blackout windows.
   - Generates bookable viewing slots honoring duration, pre/post buffers, minimum advance notice, maximum booking horizon, active holds, and capacity.
2. **Concurrency-Safe Booking & Rescheduling**:
   - Uses `runExclusiveBookingTransaction` (Firestore transactions in production; serialized mutex queue in memory) so concurrent reservation attempts for the same slot never double-book a host or property.
   - Rescheduling preserves original appointment times in `rescheduleHistory`; cancellation preserves `cancellationRecord`.
3. **Access Coordination, Virtual Sessions, Attendance & Feedback**:
   - Never stores permanent credentials or master lock codes (`PERMANENT_CREDENTIAL_FORBIDDEN`).
   - Enforces validity expiration and participant permission checks on temporary access instructions and private virtual meeting URLs.
   - Distinguishes `PARTICIPANT_SELF_REPORTED` from `HOST_REPORTED` attendance.
   - Separates private feedback comments from owner-approved summary (`discloseSummaryToOwnerOrListingRep`).
   - Distinguishes notification event creation (`ACCEPTED_BY_PROVIDER`) from verified delivery (`DELIVERED_VERIFIED`).

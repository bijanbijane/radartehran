# Property Viewings & Appointment Scheduling Module

Exclusive Module Directory: `server/modules/appointments/`

## 1. Domain Overview & Responsibilities
This module provides a durable appointment scheduling and property viewing backend for real-estate workflows. It is completely isolated and follows clean domain-driven architecture with zero side-effects on shared core modules.

### Key Capabilities:
- **Property Viewings & Inspections**: In-person property visits, second viewings, technical inspections, and valuation visits.
- **Address Privacy Gating**: Physical property addresses remain masked (`exactAddressDisclosed: false`) during proposal/draft phases and are only revealed upon explicit confirmation by the organizer/agent.
- **Scheduling Conflicts & Buffer Engine**: Detects overlapping meetings for participants, organizers, and properties, incorporating pre- and post-meeting buffer windows.
- **Participant Invitations & Rescheduling**: Multi-party invitation states (`accepted`, `declined`, `tentative`), structured rescheduling proposals with full revision audit history.
- **Attendance & No-Show Tracking**: Records participant attendance status and automatically flags unattended sessions as `no_show`.
- **Recurring Series**: Automated generation of bounded occurrences (daily, weekly, biweekly, monthly) with conflict guards.
- **Calendar Views & Pagination**: Cursor-based date-range calendar queries with privacy sanitization.

## 2. Invariants & Data Ownership
- **Single Source of Truth**: This module owns appointment records, scheduling constraints, invitation states, and attendance history.
- **Non-Ownership**: Does NOT own user identity, property registry records, listing state, payment processing, or direct push notifications. External dependencies are consumed exclusively via adapters in `contracts.ts`.
- **Concurrency Control**: Enforces Optimistic Concurrency Control (CAS) using the `revision` field to prevent race conditions during concurrent bookings.
- **File Size Discipline**: Every file strictly complies with `< 500 lines` threshold.

## 3. Integration Interface
```ts
import { createAppointmentService } from './index.js';

const appointmentService = createAppointmentService({
  repository: new InMemoryAppointmentRepository(),
  outboxPublisher: eventPublisherAdapter
});
```

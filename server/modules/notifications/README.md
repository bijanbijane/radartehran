# Employee 8 — Notifications and Messaging Backend Module

## 1. Overview & Architectural Role
The Notifications and Messaging backend module (`server/modules/notifications/`) manages multi-channel in-app and external communications (In-App, SMS, Email) across Radartehran.

### Core Architectural Invariants
- **Decoupled Delivery Pipeline**: Notification persistence in Firestore (`/notifications/{notificationId}`) is strictly decoupled from external channel delivery attempts (`/notificationDeliveryJobs/{jobId}`).
- **Zero Data Loss on Gateway Failures**: If an external SMS/Email provider fails or times out, the stored notification is never deleted or corrupted. The delivery job transitions to `attempted` or `failed` according to retry limits (`maxRetries = 3`).
- **Strict Recipient Data Isolation**: Users may only query, mark as read, or archive notifications matching their verified Firebase `recipientUid`.
- **Anti-Injection Templating**: All template variables are strictly validated and HTML-escaped. Arbitrary code, script tags, or unapproved template variables are rejected before persistence.
- **Enforced Security Alerts**: While users can configure preferences for marketing or standard alerts, critical account security alerts (`account.security_alert`) are server-enforced and cannot be suppressed.

---

## 2. Directory Structure & Line Count Governance
All implementation files are strictly under the `500`-line ceiling:
```
server/modules/notifications/
├── types.ts                      # Canonical models, versioned schemas & adapter contracts (~177 lines)
├── templatesAndValidation.ts     # Versioned Persian templates & sanitization routines (~348 lines)
├── service.ts                    # Transactional notification & delivery engine (~467 lines)
├── routes.ts                     # Standalone Express router factory (~137 lines)
├── index.ts                      # Module barrel export (~4 lines)
├── README.md                     # Module documentation, contracts & integration guide
└── __tests__/
    └── notifications.test.ts     # Unit & integration test suite (~319 lines)
```

---

## 3. Canonical Versioned Data Schemas

1. **`/notifications/{notificationId}` (`StoredNotification`)**:
   - `id`: Unique identifier (`notif_{hex}`).
   - `recipientUid`: Verified Firebase UID.
   - `templateId`: Versioned template identifier (e.g., `bargain.approved`).
   - `category`: `'bargains' | 'buyer_alerts' | 'sponsorship' | 'crowd_claims' | 'security' | 'administrative' | 'promotional'`.
   - `eventType`: Canonical event string.
   - `titleFa` / `bodyFa`: Rendered and sanitized Persian text.
   - `variables`: Safe key-value pairs used for rendering.
   - `read`: Boolean flag.
   - `readAt`: Timestamp when marked read.
   - `archived`: Boolean flag.
   - `archivedAt`: Timestamp when archived.
   - `lifecycleState`: `'pending' | 'processing' | 'delivered' | 'failed' | 'cancelled'`.
   - `requestedChannels`: Eligible delivery channels.
   - `eventId`: Correlating trigger event ID.

2. **`/notificationPreferences/{recipientUid}` (`StoredNotificationPreferences`)**:
   - `recipientUid`: Verified user UID.
   - `inAppEnabled`: Boolean.
   - `emailEnabled`: Boolean.
   - `smsEnabled`: Boolean.
   - `securityAlertsEnabled`: Always enforced `true`.
   - `promotionalEnabled`: Boolean (default `false`).

3. **`/notificationDeliveryJobs/{jobId}` (`StoredNotificationDeliveryJob`)**:
   - `id`: `job_{notificationId}_{channel}`.
   - `notificationId`: Parent notification reference.
   - `recipientUid`: Target user.
   - `channel`: `'in_app' | 'email' | 'sms'`.
   - `lifecycleState`: `'queued' | 'attempted' | 'delivered' | 'failed' | 'cancelled'`.
   - `attemptCount`: Integer attempt counter.
   - `maxRetries`: Maximum retry ceiling (default 3).
   - `lastAttemptAt`: Timestamp of last gateway call.
   - `deliveredAt`: Timestamp of verified delivery.
   - `failureReason`: Recorded error message on gateway failures.
   - `providerReferenceId`: External provider message ID.

---

## 4. Event-Driven Notification Handlers

The module exports `dispatchEventNotification` to ingest events from other business modules without coupling:
- `bargain.submitted`: Notifies owner of successful submission and tracking code.
- `bargain.approved`: Notifies owner of listing publication in target neighborhood.
- `bargain.rejected`: Informs owner with verified rejection reason.
- `bargain.status_changed`: Alerts owner of listing status transitions.
- `buyer_alert.created` / `buyer_alert.updated`: Confirms alert search activation.
- `sponsor.application_submitted` / `approved` / `rejected`: Updates sponsor agency on placement state.
- `crowd_claim.accepted` / `rejected`: Notifies crowd contributor on review outcome.
- `account.security_alert`: Instant alert for sensitive actions or new logins.
- `admin.announcement`: Broadcast communication to target user groups or platform-wide.

---

## 5. API & Service Contracts

Mountable Express routes in `createNotificationsRouter`:
- `GET /`: Retrieve user notifications with `unreadOnly` filter, pagination limit, and cursor.
- `POST /:id/read`: Mark single notification as read or unread (`{ read: boolean }`).
- `POST /mark-all-read`: Mark all notifications as read for the authenticated recipient.
- `DELETE /:id`: Archive a notification.
- `GET /preferences`: Get recipient notification channel preferences.
- `PUT /preferences`: Update configurable channel preferences.
- `POST /admin/announcements`: Admin-only announcement broadcast.

---

## 6. Verification Summary
- **Tests**: `npx tsx --test server/modules/notifications/__tests__/notifications.test.ts` (4 passed, 0 failed).
- **Strict TypeScript**: `npx tsc --noEmit --strict ...` (0 errors).
- **Architecture**: `npm run arch:check` (0 errors, 0 warnings).
- **Build**: `compile_applet` (Build succeeded).

---

## 7. Integration Handoff for Integration Lead
1. **Mount Express Router**:
   - Mount `createNotificationsRouter(deps)` under `/api/v2/notifications` in `server.ts`.
2. **Wire External Delivery Adapter**:
   - Provide `ExternalChannelDeliveryProviderAdapter` implementation connecting to Kavenegar/Ghasedak (SMS) and SendGrid/SMTP (Email).
3. **Register Event Listeners**:
   - In event emitters (Bargains, Sponsors, Buyer Alerts), call `service.dispatchEventNotification(payload)` asynchronously without direct collection writes.
4. **Firestore Rules & Blueprint**:
   - Register `/notifications`, `/notificationPreferences`, and `/notificationDeliveryJobs` with recipient-only read access and server-only creation.

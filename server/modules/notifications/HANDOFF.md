# Employee 13 — Notifications and Messaging Backend (`server/modules/notifications/`)

## 1. Exclusive Ownership & Boundaries
- **Owned Directory**: `server/modules/notifications/`
- **Zero External Mutations**: Does not modify Bargains, Buyer Alerts, Sponsorship, Service Marketplace, Professional Verification, Crowd Claims, Market Analytics, Account Lifecycle, `server.ts`, or shared route registrations.
- **Provider Restrictions Enforced**:
  - Does not invent SMS, email, or push credentials.
  - Does not send real external messages during development.
  - Uses deterministic sandbox/dry-run adapters (`SandboxEmailDeliveryAdapter`, `SandboxSmsDeliveryAdapter`, `SandboxPushDeliveryAdapter`) and blocks unconfigured/unapproved external providers (`PROVIDER_NOT_CONFIGURED`).

---

## 2. Four-Stage Delivery Lifecycle Architecture

```text
STAGE 1: EVENT CREATION (Outbox Ingestion — `ingestEventToOutbox`)
  [Domain Event + idempotencyKey]
         |
         v
  (Deduplicate by source:eventType:recipientUid:idempotencyKey & redact PII)
         |
         v
  [NotificationOutboxEntry: PENDING_GENERATION]  <-- Durable atomic disk journal + Firestore
         |
         v
STAGE 2: NOTIFICATION GENERATION (`generateNotificationsFromOutbox`)
  (Evaluate UserNotificationPreferences + UserConsentAndOptOutRecord + Template rendering)
         |
         +---> [InAppNotificationRecord: UNREAD -> READ -> ARCHIVED]
         |
         +---> (If opted out / lacking consent) ---> [SUPPRESSED_PREFERENCE_OR_CONSENT]
         |
         +---> (If eligible) ----------------------> [DurableNotificationDeliveryJob: QUEUED_OUTBOX]
                                                               |
                                                               v
STAGE 3: DELIVERY ATTEMPTS (`dispatchDueDeliveryJobs` / `dispatchSingleDeliveryJob`)
  (Invoke Email / SMS / Push Provider Adapter with deduplicationKey)
         |
         +---> (Transient failure & attempts < maxAttempts) ---> [RETRY_SCHEDULED (Exp. Backoff)]
         |
         +---> (Permanent error or maxAttempts reached) -------> [FAILED_PERMANENT]
         |
         +---> (Provider API returns 200/202 Accepted)
                     |
                     v
         [PROVIDER_ACCEPTED_AWAITING_RECEIPT]
         (isConfirmedDelivered = false; confirmedDeliveredAtIso = null)
                     |
                     v
STAGE 4: DELIVERY CONFIRMATION (`confirmDeliveryReceipt`)
  (Signed provider webhook / carrier DLR receipt)
         |
         +---> (receiptStatus = DELIVERED) ----------> [DELIVERED_CONFIRMED (isConfirmedDelivered = true)]
         +---> (receiptStatus = TEMPORARY_FAILURE) --> [RETRY_SCHEDULED]
         +---> (receiptStatus = BOUNCED_PERMANENT) --> [FAILED_PERMANENT]
```

---

## 3. Supported Domain Event Sources & Contracts
All 8 domain event sources publish events via `NotificationDomainEventInput`:
1. `BARGAINS`: `BARGAIN_PUBLISHED`, `BARGAIN_PRICE_DROP`
2. `BUYER_ALERTS`: `BUYER_ALERT_MATCH_FOUND`
3. `SPONSORSHIP`: `SPONSOR_CAMPAIGN_APPROVED`, `SPONSOR_CAMPAIGN_EXPIRING`
4. `SERVICE_MARKETPLACE`: `SERVICE_QUOTE_RECEIVED`
5. `PROFESSIONAL_VERIFICATION`: `PRO_VERIFICATION_APPROVED`, `PRO_VERIFICATION_REJECTED`
6. `CROWD_CLAIMS`: `CROWD_CLAIM_MODERATED`
7. `MARKET_ANALYTICS`: `MARKET_PULSE_ANOMALY_DETECTED`
8. `ACCOUNT_LIFECYCLE`: `ACCOUNT_EXPORT_READY`, `ACCOUNT_DELETION_INITIATED`

---

## 4. Privacy, Consent & Redaction Guarantees
- **Contact-Free Previews**: `redactPrivateContactDetails` strips phone numbers, email addresses, bearer/API tokens, and national IDs from all variables, rendered previews, and error diagnostics; templates containing raw contact details in `previewTemplateFa` are rejected at registration (`PRIVACY_CONTACT_LEAK_IN_PREVIEW`).
- **Consent & Opt-Out Hierarchy**:
  - `globalOptOutAllNonCritical: true` suppresses `MARKET_ALERT`, `SERVICE_TRANSACTIONAL`, and `PROMOTIONAL_SPONSORSHIP` notifications (`SUPPRESSED_PREFERENCE_OR_CONSENT`), while allowing `CRITICAL_TRANSACTIONAL` (`ACCOUNT_LIFECYCLE` export/deletion security alerts).
  - `PROMOTIONAL_SPONSORSHIP` notifications require explicit `marketingSponsorshipConsentGranted: true`.
- **Redacted Operational Logs**: Operational logs hash recipient UIDs (`hashRecipientUidForLog`) and scrub all diagnostic strings before persistence.

---

## 5. Integration Handoff Guide
```ts
import { createNotificationsModuleFacade } from './server/modules/notifications/index.ts';

const notifications = createNotificationsModuleFacade();

// 1. Producer modules record an event in the durable outbox (outside DB transactions):
await notifications.engine.ingestEventToOutbox({
  source: 'BUYER_ALERTS',
  eventType: 'BUYER_ALERT_MATCH_FOUND',
  idempotencyKey: `alert_match_${alertId}_${windowKey}`,
  recipientUid,
  variables: { hoodNameFa: 'سعادت‌آباد', matchCount: 3 },
});

// 2. Background worker generates notifications & dispatches due jobs:
await notifications.engine.generateNotificationsFromOutbox();
await notifications.engine.dispatchDueDeliveryJobs();
```

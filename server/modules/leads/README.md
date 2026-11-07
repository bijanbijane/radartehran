# Employee 14 — Lead Management & Real Estate CRM Backend (`server/modules/leads/`)

## 1. Overview & Boundaries
The Lead Management and Real Estate CRM backend module (`server/modules/leads/`) manages property-related customer inquiries, prospective buyer/tenant workflows, lead assignments, communication logs, and transaction follow-up timelines across Tehran and Iranian metropolises.

### Exclusive Ownership & Boundaries:
- **Owned Directory**: `server/modules/leads/`
- **Zero Modification to Other Modules**: Does not modify Bargains, Buyer Alerts, Notifications, Property Services, Real Estate Professionals, `server.ts`, or shared schemas.
- **Clear Domain Distinctions**:
  - A **Lead** is an explicit customer inquiry or direct request for action (callback, visit, negotiation).
  - A **Buyer Alert** is an automated subscription matching new listings (managed by `buyer-alerts`).
  - A **Service Request** is a construction/renovation quote request (managed by `property-services`).
  - A **Successful Lead** is a CRM outcome, **NOT** proof of a legally registered deed or rental contract.

---

## 2. Lead Types
1. **Property Inquiry (`PROPERTY_INQUIRY`)**: User expresses interest in a specific approved listing (callback, property visit, negotiation, pricing inquiry).
2. **General Property Search Inquiry (`GENERAL_PROPERTY_REQUIREMENT`)**: Structured search criteria (city, neighborhood, budget range, sqm, rooms) routed to licensed brokers.
3. **Commercial & Office Inquiry (`COMMERCIAL_OFFICE_INQUIRY`)**: Specialized business inquiries for office space, retail units, shops, commercial buildings, warehouses, and industrial facilities.
4. **Agency & Professional Inquiry (`AGENCY_PROFESSIONAL_INQUIRY`)**: Direct inquiries routed to a verified real-estate professional, agency, or branch.

---

## 3. Controlled Lifecycle State Machine

```text
[NEW] -----------------> [AWAITING_ASSIGNMENT] ---------> [ASSIGNED]
  |                             |                             |
  +---------> [CANCELLED]       +---------> [CANCELLED]       +-----> [ACCEPTED]
  |                             |                             |          |
  +---------> [REJECTED]        +---------> [REJECTED]        +-----> [REJECTED_BY_ASSIGNEE]
  |                             |                                        |
  v                             v                                        v
[EXPIRED]                     [EXPIRED]                        [AWAITING_ASSIGNMENT]

[ACCEPTED]
  |
  +---> [CONTACT_ATTEMPTED] ---> [CONTACTED] ---> [FOLLOW_UP_REQUIRED]
  |           |                     |                     |
  +-----------+---------------------+---------------------+---> [VISIT_SCHEDULED]
  |                                                                   |
  +-------------------------------------------------------------------+---> [NEGOTIATION]
                                                                                |
                                                      +-------------------------+
                                                      |                         |
                                                      v                         v
                                                 [SUCCESSFUL]             [UNSUCCESSFUL]
```

- Every state change logs the actor UID, actor role, timestamp, reason, and transition history.
- Concurrency and optimistic locking prevent race conditions during status updates.

---

## 4. Privacy, Consent & Contact Data Access
- **Phone Numbers**: Strictly protected and never returned in public search, listing projections, or customer views.
- **Masking**: In summary professional views, phone numbers are masked (`0912***4567`).
- **Unmasked Access**: Allowed **only** when:
  1. The actor is the explicitly assigned professional or authorized agency manager.
  2. The customer has provided valid consent (`CustomerConsentRecord`) and has not withdrawn it.
  3. The request includes an explicit access purpose, which is permanently logged in `ContactAccessAuditEntry`.
- **Consent Records**: Auditable record containing customer UID, purpose, text version, communication channels, and timestamps.
- **Customer Notes vs. Internal Notes**: Customer notes are visible in the customer timeline; internal CRM notes are strictly hidden from customer projections.

---

## 5. Duplicate Detection & Abuse Prevention
- Conservative duplicate detection matches active leads from the same customer within 24 hours:
  - Exact match on target listing ID for property inquiries.
  - Same city, neighborhood, category, and transaction type for general property requirements.
- Idempotency keys prevent double submissions from network retries.

---

## 6. Integration Adapters
- `ListingVerificationAdapter`: Validates listing existence and approved moderation status in Bargains module.
- `ProfessionalVerificationAdapter`: Validates professional licenses and agency branch membership in Real Estate Professionals module.
- `GeographyVerificationAdapter`: Validates supported cities and neighborhood IDs.
- `NotificationEventPublisherAdapter`: Publishes minimal versioned events (`lead.created`, `lead.assigned`, `lead.status_changed`, `lead.closed`, `lead.consent_withdrawn`) to Notifications module without leaking phone numbers or private notes.

---

## 7. Account Lifecycle Compatibility
The repository provides:
- `exportCustomerLeads(customerUid)`: Exports all customer inquiries and public timeline activities for GDPR/privacy compliance.
- `anonymizeCustomerLeads(customerUid)`: Sanitizes name, replaces phone with anonymized placeholder, removes email, and sets `isAnonymized: true`.

---

## 8. Automated Testing
Run the comprehensive test suite:
```bash
npx tsx tests/lead-management-crm-module.test.ts
```

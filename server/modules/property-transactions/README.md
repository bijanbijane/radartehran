# Property Transaction & Deal Management Backend Module

Exclusive ownership: `server/modules/property-transactions/`

## 1. Core Purpose

The Property Transaction & Deal Management backend module coordinates the end-to-end deal lifecycle for property purchases and rentals in Tehran Radar. It manages inquiries, property viewings, purchase/rental offers, versioned counteroffers, milestones, and safe deal completion without duplicating canonical platform records.

## 2. Data Ownership Boundaries

### This Module Owns:
- Property inquiry records (`PropertyInquiryRecord`)
- Deal workflow records (`DealWorkflowRecord`)
- Deal participant roles & permissions (`DealParticipant`)
- Viewing appointment requests and schedules (`ViewingAppointmentRecord`)
- Purchase and rental offers (`DealOfferRecord`)
- Counteroffers and versioned negotiation history
- Deal milestone records (`DealMilestoneRecord`)
- Lifecycle state transitions and audit entries
- Transaction domain events (`DealDomainEvent`)

### This Module Does NOT Own:
- **Property Listings & Moderation**: Owned by the Bargains module. Checked via `BargainsListingValidationAdapter`.
- **Canonical Property Identity**: Owned by the Property Registry module. Consumed via `PropertyRegistryAdapter`.
- **Geographic Data & Address Centroids**: Owned by the Geography module. Consumed via `GeographyAddressDisclosureAdapter`.
- **User Authentication**: Obtained via verified principal tokens (`Core` module). Never trusts client-supplied UIDs or roles.
- **Direct Messaging Delivery**: References negotiation threads via `MessagingWorkflowAdapter`.
- **Notification Delivery**: Dispatched through `NotificationsOutboxAdapter`.
- **Payments & Escrow**: Does not collect money, hold escrow, or verify payment screenshots. Defined via future integration interface `FutureFinancialEscrowAdapter`.
- **Legal Validation**: Milestones track operational workflow progress only; they are explicitly disclaimed as non-legal determinations.

## 3. Financial Separation Invariants

- **Sale vs. Rental Separation**: Sale transactions require `purchasePriceMillionToman` (and optional earnest money). Rental transactions strictly require `depositMillionToman`, `monthlyRentMillionToman`, and `leaseDurationMonths`.
- **No Polymorphic Currency Conversion**: Currencies are strictly Iranian Toman (`IRT`). The system never converts rental deposit into sale price or invents synthetic conversion ratios.
- **Offer Immutability**: Submitted offers cannot be edited in-place; modifications require submitting a versioned counteroffer.

## 4. State Machine Transition Topology

```
initiated -> [participants_pending | active_negotiation | viewing_pending | cancelled]
active_negotiation -> [viewing_pending | offer_submitted | counteroffer_pending | cancelled | expired | disputed]
offer_submitted -> [counteroffer_pending | offer_accepted | active_negotiation | cancelled | expired]
counteroffer_pending -> [offer_submitted | offer_accepted | active_negotiation | cancelled | expired]
offer_accepted -> [awaiting_external_completion | disputed | cancelled]
awaiting_external_completion -> [completed | disputed | cancelled]
completed -> (Terminal)
cancelled -> [active_negotiation] (Consensus reopening only)
```

## 5. Address Disclosure Policy

- Inquiries and unconfirmed viewing requests expose neighborhood-level centroid and masked street name only (`neighborhood_only`).
- Exact address is only disclosed upon host confirmation of a viewing appointment (`exact_address_confirmed`).

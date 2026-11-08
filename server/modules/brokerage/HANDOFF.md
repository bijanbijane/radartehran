# Handoff Report: Real Estate Brokerage & Agency Management Backend (`server/modules/brokerage/`)

## 1. Exclusive Ownership & Directory Boundaries
- **Assigned Module Directory**: `server/modules/brokerage/`
- **Zero External Mutations**: Neither `server.ts`, global route catalogs, `firestore.rules`, `firebase-blueprint.json`, nor other employee modules or frontend components were modified.
- **Git Branch**: `feature/backend-brokerage`

---

## 2. Inventory of Created Files
All files reside strictly within `server/modules/brokerage/`:
1. `types.ts`: Complete domain models for agencies, branches, agent profiles, memberships, teams, representation mandates, listing assignments, commission agreements, credentials, and performance analytics.
2. `authorization.ts`: Agency-specific RBAC matrix (`ROLE_PERMISSIONS_MAP`, `ROLE_HIERARCHY_LEVEL`), role-escalation prevention, branch-scoping, and suspension guards.
3. `validation.ts`: Input sanitization, identifier checkers, allocation rule validators, and domain invariant guards.
4. `adapters.ts`: Explicit integration adapter contracts for Bargains, Property Transactions, Geography, Notifications, Trust & Safety, and Account Lifecycle.
5. `store.ts`: `BrokerageStore` interface and `DurableBrokerageStore` implementation supporting indexing, bounded pagination, optimistic concurrency versioning, and transaction resilience.
6. `agencyService.ts`: Lifecycle management for agencies, multi-branch hierarchies, operating status changes, and credential submissions.
7. `membershipService.ts`: Agent professional profiles, invitation lifecycles, role updates with anti-escalation enforcement, branch assignments, and teams.
8. `mandateService.ts`: Representation mandates, authority verification (`validateRepresentationAuthority`), and listing-agent assignments without unauthorized legal representation.
9. `commissionService.ts`: Commission agreements, calculation bases, versioning/amendment tracking, and guards against calculating payable amounts from unconfirmed deals.
10. `analyticsService.ts`: Agency activity logs, operational audit trails, and privacy-safe performance summaries.
11. `facade.ts`: `BrokerageFacade` bundling all sub-services and providing bridges for Account Lifecycle and Trust & Safety.
12. `routes.ts`: Module-local route dispatchers and error-mapping for integration lead mount.
13. `index.ts`: Clean barrel export.
14. `__tests__/brokerage.test.ts`: Automated test suite covering 11 critical feature categories and invariants.
15. `HANDOFF.md`: This integration and architectural handoff report.

---

## 3. Data Ownership & Boundary Rules
- **Owned by this Module**:
  - Agency records (`AgencyRecord`)
  - Agency branch records (`BranchRecord`)
  - Agent professional profiles (`AgentProfessionalProfile`)
  - Agency membership records (`AgencyMembershipRecord`)
  - Team structures (`AgencyTeamRecord`)
  - Representation mandate records (`RepresentationMandateRecord`)
  - Listing-to-agent assignment records (`ListingRepresentationRelationship`)
  - Commission agreement records (`CommissionAgreementRecord`)
  - Agency operational activity logs (`BrokerageActivityRecord`)
- **NOT Owned by this Module** (strictly delegated via adapters):
  - Global user authentication and principal identities (Core module)
  - Property listings and publishing state (Bargains module)
  - Property transaction negotiations, contracts, or offer workflows (Property Transactions module)
  - Payment processing, settlement, or banking (Finance/Payment services)
  - Geographic boundaries, city catalogs, or coordinates (Geography module)
  - Message delivery or email/SMS gateways (Notifications module)
  - Platform-wide enforcement and ban decisions (Trust & Safety module)

---

## 4. Key Architectural Invariants & Guarantees
1. **No Automatic Legal Representation**:
   An agent profile or listing assignment does *not* grant legal or advertising authority. Authority requires an active, unexpired, unrevoked `RepresentationMandateRecord` confirmed by the principal.
2. **Role Escalation Protection**:
   `validateRoleAssignmentPermission` ensures no user can self-promote or assign `agency_owner` privileges, and members cannot assign roles higher or equal to their own hierarchy level.
3. **Branch-Scoped Authority**:
   Branch managers can only manage memberships and listing assignments within their assigned branch.
4. **Unconfirmed Deal Protection**:
   `calculatePayableCommission` queries `TransactionReferenceAdapter`. If a deal is unconfirmed, total payable commission is strictly withheld (`ESTIMATED_PENDING_CONFIRMATION`) to prevent inaccurate financial records.
5. **Agency Suspension Blockade**:
   Suspended or closed agencies are blocked from creating new mandates, inviting members, or assigning listings.
6. **Account Lifecycle & GDPR Compliance**:
   `exportUserData` and `purgeOrAnonymizeUserData` allow clean account deletion and data export without cross-tenant leakage.

---

## 5. Integration Contracts & Route Registration for Integration Lead
To mount the brokerage routes in Express (`server.ts` or an administrative router):
```ts
import { createBrokerageModule, createBrokerageRouter } from './server/modules/brokerage';

const brokerageFacade = createBrokerageModule({
  listingAdapter: bargainsModuleAdapter,
  transactionAdapter: propertyTransactionsAdapter,
  geoAdapter: geographyAdapter,
  notificationSink: notificationsEventSink,
});

const router = createBrokerageRouter(brokerageFacade);

// Example route registrations:
// POST /api/agencies                     -> router.createAgency
// GET  /api/agencies/:agencyId           -> router.getAgency
// PUT  /api/agencies/:agencyId           -> router.updateAgency
// POST /api/agencies/:agencyId/status    -> router.setAgencyStatus
// POST /api/agencies/:agencyId/branches  -> router.createBranch
// GET  /api/agencies/:agencyId/branches  -> router.listBranches
// POST /api/brokerage/agent-profile      -> router.registerAgentProfile
// POST /api/brokerage/memberships/invite -> router.inviteMember
// POST /api/brokerage/memberships/accept -> router.acceptInvitation
// PUT  /api/brokerage/memberships/:id    -> router.updateMemberRole
// DELETE /api/brokerage/memberships/:id  -> router.terminateMember
// POST /api/brokerage/mandates           -> router.createMandate
// GET  /api/brokerage/mandates/validate  -> router.validateAuthority
// POST /api/brokerage/listings/assign    -> router.assignListing
// POST /api/brokerage/commissions        -> router.createCommissionAgreement
// GET  /api/brokerage/commissions/:id/calc -> router.calculateCommission
// GET  /api/agencies/:agencyId/performance -> router.getAgencyPerformance
```

---

## 6. Verification Status
- **Module Test Suite (`npx tsx server/modules/brokerage/__tests__/brokerage.test.ts`)**: 11/11 tests PASSED.
- **Architecture Boundaries (`npm run arch:check`)**: 0 errors, all file sizes and dependency directions verified.
- **TypeScript & Lint Validation (`compile_applet` & `lint_applet`)**: Build succeeded with 0 errors.

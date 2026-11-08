# Real Estate Brokerage & Agency Operations Backend (`server/modules/brokerage-operations`)

## 1. Domain & Epistemic Boundaries

1. **Affiliation vs. Client Representation vs. Transaction Execution**:
   - An active `OrganizationAgentAffiliationRecord` grants internal agency membership only; a terminated affiliation immediately loses all active permissions (`authorityPermissions: []`).
   - A `RepresentationMandateRecord` (`grantsTransactionExecutionAuthority: false`) requires explicit client acceptance (`ACCEPTED_BY_CLIENT`) before any representation action is exercised.
   - Restricted legal/financial actions (`SIGN_CONTRACT_ON_BEHALF_OF_CLIENT`, `TRANSFER_OWNERSHIP`, `RECEIVE_OR_HOLD_CLIENT_FUNDS`, `ACCEPT_BINDING_OFFER`, `CHANGE_CONTRACTUAL_TERMS`, `MAKE_LEGAL_DECLARATIONS`) are **never inferred** from a general mandate and require an `EXPLICITLY_VERIFIED` `MandateAuthorityScopeRecord` with supporting evidence.
2. **Qualifications & Jurisdiction**:
   - Creating a `ProfessionalProfileRecord` never implies a verified license.
   - Qualifications (`ProfessionalQualificationRecord`) distinguish `SELF_REPORTED`, `DOCUMENTED`, `PENDING_VERIFICATION`, `VERIFIED`, `EXPIRED`, `SUSPENDED`, `REVOKED`, and `REJECTED`. Licenses in one `citySlug` never automatically apply to another jurisdiction.
3. **Commission Agreements & Financial Separation**:
   - 8 lifecycle states (`PROPOSED_TERMS` through `PAYMENT_CONFIRMED` / `DISPUTED_OR_REVERSED`), immutable `versionHistory`, strict validation of internal allocations (100% sum for percentages; zero silent residual allocation), and strict separation between agreed, calculated, invoiced, participant-reported, and authoritatively confirmed payments (`processedByPlatform: false`).

## 2. Existing Domain Overlap & Reconciliation Contract

The repository also contains:
- `server/modules/brokerage`: earlier agency/membership/mandate prototype.
- `server/modules/real-estate-professionals`: public directory search for professionals.
- `server/modules/professional-verification`: credential state machine.

Per Employee 46 ownership rules, `server/modules/brokerage-operations/` does not modify those directories or write to their collections. See `HANDOFF.md` for the integration-lead adapter wiring contract.

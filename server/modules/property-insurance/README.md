# Property Insurance & Coverage Intelligence Backend Module

Exclusive Module Directory: `server/modules/property-insurance/`

## 1. Purpose & Non-Underwriting Boundaries
This module provides structured property insurance intelligence, coverage taxonomy matching, explainable eligibility rules evaluation, like-for-like policy comparisons, replacement-value adequacy checks, and user-authorized policy/claim reference tracking.

### Strict Invariants:
- **No Underwriting or Policy Issuance**: Does NOT underwrite risk, issue binding insurance policies, or guarantee claim payouts.
- **No Claims Adjudication**: Does NOT adjudicate legal liability or decide covered losses. Retains only user-authorized reference tracking metadata.
- **Replacement Cost vs Market Value**: Differentiates building replacement/reconstruction costs from market valuations. Identifies underinsurance / overinsurance exposure.
- **Coverage Taxonomy**: Structured classification across building perils, contents, third-party liability, and emergency accommodations.
- **Data Provenance & Freshness**: Distinguishes verified insurer information from unverified or stale data (> 180 days).
- **Decoupled Architecture**: Interacts with adjacent modules (Valuation, Geography, Due Diligence, Outbox) exclusively via adapter contracts in `contracts.ts`.

## 2. Integration Interface
```ts
import { createPropertyInsuranceService } from './index.js';

const insuranceService = createPropertyInsuranceService({
  repository: new InMemoryPropertyInsuranceRepository(),
  outboxPublisher: eventPublisherAdapter
});
```

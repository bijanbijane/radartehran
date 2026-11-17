# Wave-1 Architecture & Honest Operations Specification (Stages 4–28)

This document catalogs the Modular Monolith implementation across Stages 4a/4b through 28 on top of `server.ts`, Firestore, and React 19 + TypeScript (`src/features/`). All runtime statuses obey strict epistemic separation between `[Observed Fact]` and `[Assumption]` / `NOT_MEASURED` / `NOT_AVAILABLE` / `NOT_VERIFIED`.

## Stage Mapping

| Stage | Domain | Primary Module(s) | Epistemic & Security Guarantees |
| :--- | :--- | :--- | :--- |
| **4a / 4b** | Social & Client Auth Convergence | `src/features/community/pages/CommunityHubPage.tsx`, `src/features/knowledge/services/knowledgeApiClient.ts`, `src/features/valuation/services/valuationStorageAndApiClient.ts` | Explicit UI error + retry + cursor pagination; zero client-spoofed `x-verified-user-id` headers. |
| **5** | Trust & Safety Lifecycle | `server/modules/trust-safety/socialModerationLifecycle.ts`, `mountTrustSafetyRoutes.ts`, `src/features/admin/components/AdminCommunityModerationPanel.tsx` | Report dedupe, moderator claim lease locks, soft-delete sync to `socialPosts`, Separation of Duties (SoD) on appeals, immutable `socialModerationEvents`. |
| **6** | Durable Outbox & Fanout | `server/modules/notifications/socialOutboxWorker.ts` | Transactional `socialOutbox` lease worker, exponential backoff + jitter, `DEAD_LETTER` replay, self & hidden-target suppression, zero PII stored. |
| **7** | Persian Search & Feed Ranking | `server/modules/search/socialDiscoveryAndFeed.ts` | ZWNJ/Arabic/digit Persian normalizer, excludes hidden/deleted content, `social-feed-score-v1.0.0` with author diversity penalty, opaque cursor pagination. |
| **8** | Governed Telemetry & Taxonomy | `server/modules/analytics-research/platformTelemetryAndTaxonomy.ts` | Official taxonomy allowlist, `scrubTelemetryPii` (mobile/email/IBAN), daily-rotated session hashes, `k >= 5` anonymous rollup suppression, bot velocity flags. |
| **9–14** | Resilience, Cost, Gates & Rollout | `server/modules/platform-resilience/runtimeResilienceAndIncidents.ts`, `opsCostAndReleaseGovernance.ts` | 10-domain Failure Isolation Matrix, circuit degradation, cross-domain consistency check, `COST_NOT_MEASURED` / `INSUFFICIENT_PRODUCTION_DATA`, 10 Release Gates, `WAVE_A..WAVE_I` & 3-level rollback, AI Change Ledger (`C0..C4`). |
| **17–20** | Ecosystem, Legal & Commercial | `server/modules/legal-regulatory/ecosystemLegalGovernance.ts`, `server/modules/marketplace-billing/ecosystemCommercialEngine.ts` | Consent/takedown/legal-hold ledgers, `LEGAL_READY_WITH_LIMITATIONS` (`counselReviewRequired`), `[ASSUMPTION]` unit economics (`livePaymentGatewayEnabled: false`), `NOT_VERIFIED` commercial entry gate, `<= 3` pilot markets. |
| **21–22** | Product & Engineering Scale | `server/modules/platform-foundation/productLifecycleGovernance.ts`, `engineeringScaleGovernance.ts` | RICE with security/legal blocker override, `INCONCLUSIVE` under `sampleSize < 200`, Modular Monolith topology, `L0..L6` AI Agent RBAC locking `firestore.rules`, `server.ts`, `hedonicPricingEngine.ts`, and `architecture-baseline.json`. |
| **23** | Platform Intelligence & Decisions | `server/modules/analytics-research/platformIntelligenceEngine.ts` | Converged `/api/v1/telemetry/ingest` + `/api/v2/telemetry/events` audit, 7-group Metrics Catalog, Health Score returns `NOT_AVAILABLE` when telemetry is empty, `P0..P4` alert deduplication, human-gated decisions with reversal plans. |
| **24** | Automation & AI Orchestration | `server/modules/distributed-processing/automationGovernanceEngine.ts` | `A0..A5` risk classes, 11-state task lifecycle, SHA-256 input-bound `HumanApprovalRequest` (`computePayloadDigest`), independent `Kill Switch`, `COST_NOT_MEASURED`. |
| **26** | Integration Gateway Pilot | `server/modules/api-governance/integrationGatewayPilot.ts` | Extends `ssrfGuard.ts` (`validateWebhookDestinationUrl`), provider lifecycle (`PENDING..REVOKED`), TLS/redirect/MIME/payload contract, non-exposed secret metadata aliases, sandbox envelope (`retrievedAtIso` vs `observedAtIso`). |
| **27** | Data Exchange & Provenance | `server/modules/data-governance/dataExchangeLifecycle.ts` | Blocks unlicensed sources (`unlicensed-scrape-blocked`), uncertain duplicate merge (`REQUIRES_REVIEW`), preserves overwritten conflict history, freshness TTL (`FRESH..UNKNOWN`). |
| **28** | Real Estate & Urban Intelligence | `server/modules/market-intelligence/marketAndUrbanIntelligence.ts` | Reuses `calculateHedonicValuation` (`src/data/hedonicPricingEngine.ts`), strictly separates `ASKING_PRICE` vs `VERIFIED_TRANSACTION_PRICE` (`NOT_AVAILABLE`) and views vs demand, spatial clusters, non-destructive history snapshots. |

## Verification Reference
- `tests/stage4-5-6-7-8-convergence.test.ts`
- `tests/stage9-to-28-governance-intelligence.test.ts`
- `npm run lint && npm run arch:check && npm run test:rules:static`

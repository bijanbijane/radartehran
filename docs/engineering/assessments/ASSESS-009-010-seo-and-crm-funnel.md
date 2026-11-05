# Radar Tehran — Engineering Assessment Deliverable: ASSESS-009 & ASSESS-010
## Workstreams:
- `ASSESS-009`: Social Card, SSR SEO Meta & Share Deep-Link Fidelity
- `ASSESS-010`: Buyer Alert & Agency CRM Conversion Funnel Resilience
## Campaign: `CAMPAIGN-PROD-04: Discoverability, Viral Sharing & Conversion`
## Role / Owner: Member 03 & Member 06 — Full-Stack Conversion & SEO Engineers

---

## 1. Executive Summary & Objective
**Campaign PROD-04** completes the 4-campaign Master Product Assessment Roadmap (`docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md`) by verifying viral deep-link hydration, server-side OpenGraph/Schema.org metadata injection, and the resilience of the Buyer Alert and Agency Bargain CRM funnels.

---

## 2. Workstream `ASSESS-009`: Social Card & Deep-Link Fidelity Audit

| # | Discoverability & SEO Subsystem | Source Implementation | Verified Invariant | Status |
|---|---|---|---|---|
| 1 | **Cross-City Comparison Deep-Link Hydration** | `injectDynamicSeoMeta` (`src/utils/serverSeoAndSitemap.ts`) & `useAppUrlAndTitleSync.ts` | Resolves any multi-city comparison pair (`?compare=5-101` across Tehran, Karaj, Mashhad, Isfahan, Shiraz) using `getAllMultiCityNeighborhoods()` and injects `Schema.org/ItemList` JSON-LD. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Single-Neighborhood Canonical & OG Tags** | `injectDynamicSeoMeta` (`src/utils/serverSeoAndSitemap.ts`) | Automatically prepends `?city=<cityId>&hood=<id>` for non-Tehran neighborhoods and populates Persian `og:title`, `og:description`, and `Schema.org/Place` coordinates. | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **JSON-LD & Attribute Injection Hardening** | `serializeSafeJsonLd`, `escapeHtmlAttribute` (`src/utils/serverSeoAndSitemap.ts`) | Neutralizes `</script>`, `<!--`, and `$&` replacement patterns so untrusted query strings or titles can never break out of `<head>` tags. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 3. Workstream `ASSESS-010`: Buyer Alert & Agency CRM Conversion Funnel Audit

| # | Conversion Funnel Mechanism | Source Implementation | Verified Invariant | Status |
|---|---|---|---|---|
| 1 | **Single-Flight Submission Lock** | `acquireBargainSubmissionLock` (`src/utils/bargainSubmissionEngine.ts`) | Blocks concurrent double-clicks during bargain submission with a deterministic idempotency key. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Decoupled Media Attachment Retry** | `attachMediaToPublishedBargain` (`src/utils/bargainSubmissionEngine.ts`) | Allows retrying `POST /api/object-storage/attach-to-bargain` on flaky mobile networks without creating duplicate Firestore bargain documents. | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Firestore + Express Dual-Write Reconciliation** | `syncPublishedBargainToExpressServer` (`src/utils/bargainSubmissionEngine.ts`) | Synchronizes published bargains to `/api/bargains` with identical deterministic IDs and degrades gracefully to `partially_persisted` if offline. | `VERIFIED` (`TEST_EXECUTED`) |
| 4 | **Buyer Alert Strict Field Whitelist** | `handleRegisterBuyerAlert` (`src/components/useRadarCrudActions.ts`) | Sends only mutable keys (`['hoodName', 'fullName', 'phone', 'dealType', 'maxBudgetText', 'updatedAt']`) on updates to match `firestore.rules` line 398. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 4. Master Product Assessment Program Conclusion
With the verification of `ASSESS-009` and `ASSESS-010`, all four campaigns (`CAMPAIGN-PROD-01` through `CAMPAIGN-PROD-04`) and all ten assessment workstreams (`ASSESS-001` through `ASSESS-010`) defined in `docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md` are **100% COMPLETED & VERIFIED (`CAMPAIGN_COMPLETE`)**.

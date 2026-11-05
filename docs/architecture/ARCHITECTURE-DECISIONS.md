# Radar Tehran — Architecture Decisions Register (Cloud, AI & Commerce)
**Document ID**: `docs/architecture/ARCHITECTURE-DECISIONS.md`  
**Verification Date**: `2026-11-01`  
**Authority**: Master Engineering Protocol & Gold Master Cloud/AI/Commerce Architecture v1.0  
*(Complements [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) and [`/docs/adr-evolution-and-governance.md`](../adr-evolution-and-governance.md))*

---

## ADR-004: Cloudflare-First, Portable-by-Design Hybrid Topology
- **Status**: `ACCEPTED` (`2026-11-01`)
- **Context**: Radar Tehran requires high availability, low-latency static/map delivery, S3-compatible media storage, and AI Gateway governance, while preserving its working Node.js `sharp` image pipeline, Firestore real-time synchronization, and ability to switch hosting providers.
- **Decision**:
  1. Adopt a **Cloudflare-First, Portable-by-Design** architecture where Cloudflare DNS/CDN/WAF, Cloudflare R2 (via S3 Signature V4), and Cloudflare AI Gateway are the preferred edge and storage integrations.
  2. Retain the modular monolith Express + Node.js runtime (`server.ts`) for backend execution so `sharp` WebP media optimization, atomic disk caches, and `firebase-admin` token verification operate without breaking existing functionality.
  3. Keep all domain and valuation modules (`src/data/*`) 100% free of Cloudflare, Firebase, or Node.js runtime imports.
- **Rejected Alternatives**:
  - *Rewriting the entire backend into Cloudflare Workers immediately*: Rejected because `sharp` native binaries and local atomic fallback buckets rely on Node.js APIs, and an unverified full rewrite violates the non-destructive Master Engineering Protocol.
  - *Creating generic wrapper abstractions around every single library*: Rejected to avoid empty adapter bloat.

---

## ADR-005: Deterministic Hedonic Pricing Authority Over LLM Inference
- **Status**: `ACCEPTED` (`2026-11-01`)
- **Context**: Users rely on Radar Tehran for property valuation, fast-sale pricing (`FAST_SALE_FACTOR = 0.88`), mortgage simulations, and neighborhood comparisons. LLMs can hallucinate numbers or produce inconsistent valuations across identical requests.
- **Decision**:
  - `src/data/hedonicPricingEngine.ts` (`calculateHedonicValuation`) remains the **sole authoritative calculation engine** for property valuation.
  - AI models (whether Gemini or Cloudflare Workers AI) may parse natural-language search filters (`parseNaturalPersianHousingQuery`) or explain deterministic outputs (`VALUATION_EXPLANATION_SUMMARY`), but must never replace deterministic formulas or invent confidence percentages.
  - All AI outputs are checked by `evaluateAiOutputGroundednessAndAccuracy` before publication.

---

## ADR-006: Mandatory Separation & Labeling of Preview Simulations
- **Status**: `ACCEPTED` (`2026-11-01`)
- **Context**: In local development, preview environments, or when external API credentials (`GEMINI_API_KEY`, Cloudflare API tokens, or live payment settlement gateways) are not configured, the application provides deterministic fallbacks and interactive simulators.
- **Decision**:
  - Every simulated or fallback AI response must include `isSimulated: true` and the exact visible label:
    `SIMULATED — NOT A REAL AI RESPONSE`
  - Every simulated payment or x402 test transaction must include `isSimulation: true` and the exact visible label:
    `SIMULATION — NO REAL PAYMENT OR SETTLEMENT`
  - Simulated transactions are stored in a separate counter (`simulatedTransactionsCount`) and never mixed with `authorizedPaymentsCount` or `confirmedSettlementsCount`.

---

## ADR-007: Provider-Independent Commercial API, MCP & Conditional x402 Layer
- **Status**: `ACCEPTED` (`2026-11-01`)
- **Context**: Radar Tehran curates high-value neighborhood market indexes and analytical tools that can be commercialized via APIs and AI agent MCP tools, while buyer leads (`buyerLeads`) and user contact records contain sensitive PII.
- **Decision**:
  1. Enforce `auditDatasetCommercialEligibility` so PII datasets (`buyerLeads`, `sponsorRequests`, private user drafts) are permanently blocked (`403 FORBIDDEN_RESOURCE`) from commercial APIs and MCP tools.
  2. Expose versioned commercial APIs (`/api/v1/commerce/*`) and read-only authorized MCP tools (`/api/v1/mcp/execute`).
  3. Implement the standard `x402` challenge (`402 Payment Required` + `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-CONTEXT` headers) in a provider-independent engine (`src/utils/dataCommerceMcpAndMonetization.ts`), while keeping live Cloudflare Monetization Gateway activation conditional on verified seller account eligibility.

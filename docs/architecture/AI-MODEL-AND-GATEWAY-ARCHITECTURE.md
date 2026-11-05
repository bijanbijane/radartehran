# Radar Tehran — Central AI Model Management & AI Gateway Architecture
**Document ID**: `docs/architecture/AI-MODEL-AND-GATEWAY-ARCHITECTURE.md`  
**Verification Date**: `2026-11-01`  
**Authority**: Master Engineering Protocol & Gold Master Cloud/AI/Commerce Architecture v1.0

---

## 1. Architectural Separation of Concerns

Radar Tehran's AI architecture is strictly separated into seven independent responsibilities implemented across `src/utils/aiGovernanceAndObservability.ts`, `src/utils/aiModelRegistryAndGateway.ts`, and `src/utils/serverAiAndCommerceRoutes.ts`:

1. **AI Application Workflows**:
   - `intelligent_search`: Converts natural Persian housing search queries into validated, bounded structured filters (`parseNaturalPersianHousingQuery`).
   - `contract_legal_analysis`: Analyzes Iranian real-estate contract clauses (`مبایعه‌نامه` / `اجاره‌نامه`) with deterministic rule fallback (`/api/contract-check`).
   - `valuation_explanation`: Summarizes deterministic Hedonic valuation outputs (`calculateHedonicValuation`) without altering numeric results.
   - `data_extraction`: Extracts structured property attributes from untrusted descriptions with strict post-extraction schema validation.
   - `market_assistant`: Explains grounded neighborhood statistics (`selectGroundedAiNeighborhoodContext`) with mandatory uncertainty disclosure.
2. **Dynamic Model Registry (`OFFICIAL_AI_MODEL_REGISTRY`)**:
   - Stores verified model identifiers, provider metadata, hosting type, modalities, context windows, and pricing baselines.
3. **Model Selection & Routing (`AiModelRoutingManager`)**:
   - Maps each workflow to a primary verified model and a fallback strategy, supporting authenticated administrator updates, audit logging, and 1-click rollback to the previous verified configuration.
4. **Provider & AI Gateway Adapters**:
   - Supports direct Google GenAI SDK (`@google/genai`), Cloudflare AI Gateway proxy routing (`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/...`), Cloudflare Workers AI REST API, and local deterministic simulation.
5. **Prompt & Response Contracts (`buildSandboxedAiPromptEnvelope`)**:
   - Isolates `<AUTHORITATIVE_FACTS>` from `<UNTRUSTED_USER_CONTENT>` and strips tag/instruction injection attempts.
6. **Usage & Cost Tracking (`AiTokenUsageAndCostLedger`)**:
   - Enforces per-user window token quotas and single-prompt ceilings; distinguishes `PROVIDER_REPORTED` tokens from `CHARACTER_HEURISTIC_ESTIMATE` and separates estimated cost from actual billed cost.
7. **Evaluation & Quality Testing (`evaluateAiOutputGroundednessAndAccuracy`)**:
   - Verifies that every numeric claim in an AI response matches authoritative neighborhood facts within tolerance and discloses market uncertainty in Persian.

---

## 2. Verified Official AI Model Catalogue (`2026-11-01`)

| Official Model Identifier | Provider | Hosting Type | Modalities | Context Window | Pricing Baseline (Official) | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `gemini-2.5-flash` | Google DeepMind | `DIRECT_EXTERNAL_PROVIDER` / `AI_GATEWAY_ROUTED` | Text, Image, Audio, Video → Text | 1,048,576 tokens | $0.10 / 1M input · $0.40 / 1M output (est. baseline) | `IMPLEMENTED_IN_SOURCE` (Requires `GEMINI_API_KEY` for live inference) |
| `gemini-3-flash-preview` | Google DeepMind | `DIRECT_EXTERNAL_PROVIDER` / `AI_GATEWAY_ROUTED` | Text, Image, Audio → Text | 1,048,576 tokens | Preview tier / standard Flash billing | `IMPLEMENTED_IN_SOURCE` (Requires `GEMINI_API_KEY` for live inference) |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Meta (Workers AI) | `CLOUDFLARE_WORKERS_AI` | Text → Text | 128,000 tokens | $0.29 / 1M input · $2.25 / 1M output (via Workers AI Neurons) | `ARCHITECTURAL_PREPARATION_COMPLETE` (Requires Cloudflare Account ID + API Token) |
| `@cf/meta/llama-3.1-8b-instruct` | Meta (Workers AI) | `CLOUDFLARE_WORKERS_AI` | Text → Text | 128,000 tokens | Free tier eligible (10k Neurons/day) | `ARCHITECTURAL_PREPARATION_COMPLETE` (Requires Cloudflare Account ID + API Token) |
| `@cf/baai/bge-m3` | BAAI (Workers AI) | `CLOUDFLARE_WORKERS_AI` | Text → Embeddings (Multilingual / Persian) | 8,192 tokens | $0.012 / 1M tokens | `ARCHITECTURAL_PREPARATION_COMPLETE` |
| `local-deterministic-rule-engine-v1` | Radar Tehran Internal | `LOCAL_DETERMINISTIC_SIMULATION` | Structured Rules / Text | Deterministic | $0.00 (Local CPU) | `PREVIEW_VERIFIED` (Always labeled `SIMULATED — NOT A REAL AI RESPONSE` when used for AI preview) |

---

## 3. Mandatory Preview Simulation vs. Production Inference Separation

1. **Strict Simulation Labeling**:
   - Whenever an AI workflow executes in local preview mode, test mode, or without live upstream provider credentials (`GEMINI_API_KEY` / Cloudflare AI token), the response envelope MUST include:
     - `isSimulated: true`
     - `simulationBanner: "SIMULATED — NOT A REAL AI RESPONSE"`
     - `executionMode: "LOCAL_DETERMINISTIC_SIMULATION"`
2. **Authoritative Pricing Invariant**:
   - Property valuations are computed exclusively by `calculateHedonicValuation` (`src/data/hedonicPricingEngine.ts`). An LLM is never permitted to invent or override per-square-meter prices, `FAST_SALE_FACTOR` (`0.88`), or confidence percentages.
3. **Zero Client Secret Exposure**:
   - No API keys, Cloudflare Account IDs, or AI Gateway tokens are ever exposed in `VITE_*` variables, client bundles, or exported configuration previews.

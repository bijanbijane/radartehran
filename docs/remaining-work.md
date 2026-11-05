# Remaining Work, Release Prerequisites & External Dependencies

**Project**: رادار هوشمند محله‌ها و مسکن ایران (`Radar Maskan` — `RMEP-001` v4.1 & `PLAN-001`)

---

## 1. Release Prerequisite Before Production Cutover

1. **Deploy Updated `firestore.rules` & `firestore.indexes.json` to Live Firebase Project**:
   - **Target Project**: `gen-lang-client-0713157837` (Database ID: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`, configured in `firebase-applet-config.json`).
   - **Sandbox RPC Status**: Attempted automated deployment via Firebase `DeployRules` RPC; blocked by IAM (`GraphQL errors: The caller does not have permission`).
   - **Operator Action**: From an authenticated project owner environment, run:
     ```bash
     npm run test:rules
     firebase deploy --only firestore:rules,firestore:indexes --project gen-lang-client-0713157837
     ```

---

## 2. Optional External Credentials (Deterministic Fallbacks Active)

All core product capabilities, Gold Master Cloud/AI/Commerce ports (`PLAN-001`), RMEP-001 v4.1 persistent engineering state (`docs/engineering/RMEP-001/`), Admin Security boundaries, Firestore database persistence, security rules, multi-city radar, commission calculator, PropTech calculators, and interactive map tools are functional and verified. The following external integrations have deterministic fallbacks built in, and automatically upgrade to live external API calls when credentials are provided in `.env`:

| External Integration | Environment Variable | Current Behavior Without Key | Behavior When Key is Provided |
| :--- | :--- | :--- | :--- |
| **Gemini Live Search Grounding & Legal AI** | `GEMINI_API_KEY` | Uses keyless public market/macro scrapers in `/api/sync-real-prices`, deterministic NLP parser in `/api/v1/ai/intelligent-search`, and rule-based legal pattern matching in `/api/contract-check` (labeled `SIMULATED — NOT A REAL AI RESPONSE`). | Executes live Google Search grounding and structured LLM inference via `gemini-2.5-flash`. |
| **Cloudflare AI Gateway & Workers AI** | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, `CLOUDFLARE_API_TOKEN` | Routes through direct Google AI Studio or local deterministic fallback (`Model C`). | Routes AI workflows through Cloudflare AI Gateway with caching, rate limiting, and `@cf/meta/llama-3.3-70b-instruct-fp8-fast` support. |
| **x402 & Digital Data Commerce Settlement** | `X402_VERIFICATION_SECRET` | Issues RFC-compliant `402 Payment Required` challenges and isolated payment simulations (`SIMULATION — NO REAL PAYMENT OR SETTLEMENT`) with zero impact on settled revenue. | Verifies cryptographic `PAYMENT-SIGNATURE` headers and records authorized/settled institutional dataset transactions. |
| **Telegram Channel Bot Broadcast** | `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHANNEL_ID` | Generates formatted Telegram digest in `/api/telegram-digest` with 1-click clipboard copy. | Enables Admin-authenticated 1-click webhook broadcasting in `/api/send-telegram` to the target Telegram channel. |
| **Remote S3 / Cloudflare R2 Object Storage** | `OBJECT_STORAGE_ACCESS_KEY` & `OBJECT_STORAGE_SECRET_KEY` | Stores optimized WebP images (`<= 800px`) and MP4/WebM videos atomically in local server bucket (`.object-storage-bucket/`). | Synchronizes uploaded media objects to the allowlisted HTTPS S3/R2-compatible bucket using AWS Signature V4. |

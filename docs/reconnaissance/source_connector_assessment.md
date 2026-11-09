# Source Connector Assessment — Tehran Radar
## Evaluation of Existing Ingestion Engines, Storage Layers & New Adapters

- **Assessment Reference**: `RMEP-BLACKBOX-CONN-001`
- **Scope**: Ingestion Architecture, Cloudflare Workers, Node.js Express, D1 & Firestore

---

## 1. Evaluation of Existing Acquisition Connectors

| Existing Module | Current Responsibility | Strengths | Gaps & Limitations | Modernization Recommendation |
|---|---|---|---|---|
| `src/utils/freeLiveMarketScraper.ts` | Scraping macro rates (TGJU) & Divar asking prices | - Strict byte limits (`MAX_UPSTREAM_TEXT_BYTES`)<br>- Input sanitization<br>- Provenance tagging | - Focuses only on live listing portals<br>- Does not ingest CBI monthly statistical bulletins<br>- Lacks municipal open-data parser | Add modular adapter `CbiHousingMarketConnector` and `TehranMunicipalityStatisticalConnector` |
| `src/utils/serverMarketPulseEngine.ts` | Real-time Market Pulse & Air Quality aggregator | - Atomic disk cache (`.cache-data.json`, `0o600`)<br>- Debounced flushing (`400ms`)<br>- Open-Meteo REST integration | - Air quality hardcoded to 5 zones in Tehran<br>- Does not store multi-month historical price curves | Expose granular 22-district CBI index alongside real-time listing aggregator |
| `src/data/realMarketPriceAggregator.ts` | Aggregates deal price vs. asking price (Hedonic v6.4) | - Monotonic age/elevator factors<br>- Clear Fast-Sale factor (`0.88` / `0.93`) | - Uses static initial baseline seeds with live delta | Ingest CBI official transaction averages as the authoritative deal anchor |
| `worker/routes/healthAndMetadataRoutes.ts` | Cloudflare Edge worker metadata & SEO | - Sub-50ms Edge response<br>- XML Sitemap & Robots.txt generation | - Read-only edge reflection | Extend with D1-backed periodic crawler cache |

---

## 2. Architectural Rules for New Reconnaissance Connectors

1. **Unidirectional Dependency**:
   - `src/utils/reconnaissanceConnectors.ts` can import from `src/types/*` and `src/utils/*`, but **must never** import from `src/components/*` or React.
2. **File Size Compliance**:
   - Keep `src/utils/reconnaissanceConnectors.ts` strictly `< 300 lines` (below the soft warning threshold of `architecture-baseline.json`).
3. **Pure Ingestion Contracts**:
   - Every connector function must return a normalized, type-safe result with explicit error handling and zero uncaught promise rejections.
4. **Unit Test Parity**:
   - 100% test coverage in `tests/reconnaissance-connectors.test.ts`.

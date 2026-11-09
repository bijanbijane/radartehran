# Public Interface Inventory — Tehran Radar
## Technical Interfaces, Endpoints, Formats & Protocols

- **Inventory ID**: `RMEP-BLACKBOX-IFACE-001`
- **Validation Standard**: RFC-7231 / RFC-7946 / OpenGIS Standards
- **Inspection Date**: `2026-11-08`

---

## 1. Verified Public Interface Directory

| Interface ID | Target Organization | Endpoint / Resource URL | Protocol / Interface Type | Payload Format | Auth & Token Requirements | Inspection Status |
|---|---|---|---|---|---|---|
| `IFACE-001` | **Central Bank of Iran (CBI)** | `https://www.cbi.ir/simplelist/1982.aspx`<br>`https://www.cbi.ir/page/22533.aspx` | HTTPS / Static Publication Engine | HTML, PDF, XLSX | **None** (Public download) | **Verified** |
| `IFACE-002` | **Tehran Municipality Open Data** | `http://data.tehran.ir`<br>`http://data.tehran.ir/dataset` | HTTP / CKAN Open Data Engine | JSON API, CSV, XLSX | **None** (Open Data Portal) | **Verified** |
| `IFACE-003` | **Tehran Map & WebGIS** | `https://map.tehran.ir`<br>`https://map.tehran.ir/geoserver` | HTTPS / WMS, WMTS, Vector/Raster Tiles | PNG/JPEG Tiles, GeoJSON | **None** (Public web client layer) | **Verified** |
| `IFACE-004` | **Open-Meteo Air Quality Telemetry** | `https://air-quality-api.open-meteo.com/v1/air-quality` | HTTPS / REST GET | JSON (Strict schema) | **None** (Keyless public tier) | **Active in Production** |
| `IFACE-005` | **Statistical Center of Iran** | `https://www.amar.org.ir`<br>`https://www.amar.org.ir/english/Statistics-by-Topic` | HTTPS / ASP.NET Document Indexer | XLSX, PDF, ZIP | **None** (Public statistical archive) | **Verified** |
| `IFACE-006` | **Tehran Metro Network** | `https://metro.tehran.ir`<br>`https://metro.tehran.ir/station-guide` | HTTPS / Static Catalog & GIS Schematics | HTML, PDF, Vector Schematics | **None** (Public transit guide) | **Verified** |
| `IFACE-007` | **Divar Public Housing Search** | `https://divar.ir/s/tehran/real-estate`<br>`https://api.divar.ir/v8/web-search/tehran/real-estate` | HTTPS / JSON REST Query Endpoint | JSON (Bounded widgets) | **Public User-Agent** (Strict rate-limit, no scrape) | **Active in Scraper Engine** |
| `IFACE-008` | **Tehran Radar Internal Ingestion** | `/api/market-pulse/live`<br>`/api/market-pulse/deep-sync` | Express / Cloudflare Worker REST | JSON (Strict TypeScript contract) | Admin / Bearer / Public Rate-limited | **Verified** |

---

## 2. Rate Limits, Concurrency & Politeness Controls

To maintain standard internet citizenship and prevent service degradation:
1. **Request Cadence**:
   - `CBI` reports: Check once per week (published monthly).
   - `data.tehran.ir`: Check once per month.
   - `Open-Meteo Air Quality`: Polled on 60-second bounded debounce, cached for 1 hour.
   - `Divar / TGJU`: Bounded read with timeout (`AbortSignal.timeout(4500)`), maximum 350KB payload ceiling, strict circuit-breaker fallback.
2. **Payload Size Caps**:
   - Maximum upstream JSON response: 256 KB.
   - Maximum upstream HTML/text response: 350 KB.
   - Any response exceeding boundary is safely rejected to avoid memory exhaustion attacks.

# Geographic Reference Data Migration Recommendations

- **Document Path**: `server/modules/geography/docs/MIGRATION-RECOMMENDATIONS.md`
- **Owner**: Employee 8 — Geographic Reference Data Backend
- **Target**: Backend & Platform Engineering Teams

---

## 1. Migration Overview

Radartehran began as a Tehran-only application where a bare integer `hoodId` (e.g. `5` for Punak) was sufficient. With expansion into Karaj, Mashhad, Isfahan, and Shiraz, and future nationwide/international expansion, geographic references must be made globally unambiguous without breaking existing stored data.

---

## 2. Recommendations for Referenced Collections

### 2.1. Listings & Bargains (`/bargains`, `/bargainOwners`)
- **Current State**: Uses numeric `hoodId` (e.g. `hoodId: 28`) and string `city: "tehran"`.
- **Target Contract**:
  - Maintain backwards-compatible fields `hoodId: number` and `city: string`.
  - Add optional normalized `compositeHoodId: string` (e.g. `"tehran:28"` or `"shiraz:404"`).
  - Validation rule on write: Execute `validateCityNeighborhood(doc.city, doc.hoodId)`. If `reasonCode !== 'VALID'`, reject with HTTP `422`.

### 2.2. Buyer Alerts (`/buyerAlerts`)
- **Current State**: Stores `hoodId: number`, `canonicalPhone`, and optional city.
- **Target Contract**:
  - Enforce explicit `cityId` alongside `hoodId`.
  - For existing records where `cityId` is omitted, resolve via `getNeighborhoodsByNumericId(hoodId)`. Because IDs 1..80, 101..155, 201..240, 301..345, 401..445 are non-overlapping, historical backfill can safely infer `cityId` with 100% determinism.

### 2.3. Agency Sponsorships (`/neighborhoodOverrides`, `/sponsorRequests`)
- **Current State**: Keyed by `hoodId` (e.g. document ID `hoodId: 1` or `/publicSponsors/{hoodId}`).
- **Target Contract**:
  - When multi-city sponsorships are activated in Karaj, Mashhad, Isfahan, or Shiraz, use composite key `${cityId}_${hoodId}` for document IDs to prevent collision across future city numbering.

---

## 3. Deprecation and Record Lifecycle Policy

1. **No Silent Deletions**:
   - A geographic record must **never** be deleted from the canonical registry if referenced by active listings, buyer alerts, or resident votes.
2. **Controlled Status Transitions**:
   - `active`: Normal operational status.
   - `provisional`: Newly surveyed neighborhood undergoing address verification.
   - `deprecated`: Neighborhood merged or redistricted. Continues to resolve lookups, but returns a warning and points to a `redirect` target.
   - `redirect`: Pointer to the new canonical composite ID (e.g., when a satellite town becomes an independent municipality).

---

## 4. Phase-Gated Migration Roadmap

| Phase | Milestone | Scope | Risk |
|---|---|---|---|
| **Phase 1 (Current)** | Geographic Reference Backend (`server/modules/geography/`) | Standalone canonical module, zero changes to existing files, explicit interfaces. | Zero |
| **Phase 2** | Read-side Adoption | Other backend modules adopt `validateCityNeighborhood` and `getNeighborhood` for validation. | Very Low |
| **Phase 3** | Dual-write on Persistence | New records persist both `hoodId` and `compositeId`. | Low |
| **Phase 4** | Legacy Backfill | Run idempotent script to backfill `compositeId` on historical documents. | Low |

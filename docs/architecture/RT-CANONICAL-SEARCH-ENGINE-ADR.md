# RT-CANONICAL-SEARCH-ENGINE-ADR

**Status:** Accepted  
**Issue:** RT-SEARCH-CRITICAL-042  
**Date:** 2026-11-21

## Context

Global Search previously executed in the browser (`defaultSearchEngine`) and again in Express (`globalSearchAndGovernanceGateway`), with separate in-memory indexes and demo seed data presented as verified listings.

## Decision

1. **Single canonical runtime:** Search executes only on the server via `SearchIndexAndOrchestratorEngine` instantiated in `server/modules/search/searchCompositionRoot.ts`.
2. **API surface:** `POST /api/v2/search/query` is canonical; v1 routes delegate to the same application service.
3. **Authorization:** Caller identity is derived from verified auth headers only; client must not supply `userId` / `isAdmin` for access control.
4. **Dataset separation:** Demo fixtures live in `src/features/search/fixtures/demoSearchDocuments.ts` and load only when `ALLOW_DEMO_SEARCH_DATA=true` (or `NODE_ENV=test`).
5. **Verification vs ranking:** `qualityScore` / `popularityScore` affect ranking only; publication requires `metadata.sourceStatus` and domain verification fields.
6. **Reindex:** Durable jobs in `search-index-state.json`; no synchronous `COMPLETED` on enqueue.

## Consequences

- UI must use HTTP client (`searchQueryClient.ts`), not in-browser engine execution.
- Multi-instance production requires shared index store (follow-up); file-backed index is single-node durable for remediation 006.
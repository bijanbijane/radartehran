# Radar Tehran GIS Blockers

**Status date:** 2026-11-27

1. **No local checkout in the current GitHub-connected execution context.** Source files were edited through GitHub Contents API. The new tests, typecheck and full builds have not been executed in a local worktree.
2. **Canonical geography provider integration.** The NIPS/profile boundary contract requires an IRNI-owned, version-pinned, read-only geography provider. The existing branch records that the intended Worker Service Binding is not deployed/configured for the Radar API.
3. **NIPS durable storage.** NIPS persistence requires the database-owning IRNI Worker to expose a separately versioned and authenticated RPC. Do not add a direct Radar D1 binding or write into IRNI-owned `geo_*` tables.
4. **Authoritative data and licensing.** Production boundary and POI datasets, source references, licenses, retrieval dates and CRS metadata have not been assembled and verified by this work package.
5. **Topology validation is incomplete.** Polygon holes are now handled for point classification and ring structure checks, but hole containment, cross-ring intersections and MultiPolygon topology remain open.
6. **Active-boundary integrity.** Duplicate active versions within one entity history are not yet consistently rejected by durable snapshot validation and all read paths.
7. **CI diagnostic availability.** Prior PR #67 workflow jobs reported failures with empty step arrays and log retrieval returned `BlobNotFound`. Those failures are on a different branch/commit and must not be treated as results for this GIS branch. New GIS branch checks must be evaluated by exact SHA when available.

No production deployment, remote migration, live binding change, secret change or paid service activation was performed.

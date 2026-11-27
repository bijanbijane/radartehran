# RT-IRNI-EXPRESS-BRIDGE-001 — Neighborhood Profile Identity Bridge

**Status:** BLOCKED — architecture and source-contract prerequisites not satisfied  
**Repository scope:** `bijanbijane/radartehran` only  
**Review branch:** `feat/gis-spatial-integrity-2026-11-27`  
**Audit date:** 2026-11-27

## Decision

Do not wire the Worker-side IRNI identity resolver into the Express profile-evidence read model yet. Do not call the public IRNI canonical HTTP facade from Express as a substitute for a private bridge. Keep the profile-evidence endpoint fail-closed until a versioned, authenticated, replay-resistant bridge and a trusted source-registry resolver exist.

This is an explicit stop condition, not a claim that the profile feature is production-ready.

## Source evidence in Radar

1. `worker/types.ts` exposes `IRNI_GEOGRAPHY` as a Cloudflare Workers Service Binding typed as `IrniGeographicRpcBindingV2`. `wrangler.backend.jsonc` declares the binding to service `irni-api`. A declaration in source/configuration does not prove the remote service is deployed or that the binding is live in any environment.
2. `worker/irni/irniGeographicRpcV2Client.ts` validates RPC v2 responses, requires ACTIVE metadata with verified integrity, pins reads to a registry revision, and checks snapshot revision/checksum consistency.
3. `worker/irni/neighborhoodProfileIdentityResolver.ts` resolves only the three versioned Radar legacy alias encodings, requires unique eligible aliases converging on one canonical entity, and checks that the entity is an active, verified `URBAN_NEIGHBORHOOD`. Repository search found this resolver referenced by its tests and its own definition, but no production composition call site.
4. `worker/routes/irniCanonicalRpcV2Routes.ts` exposes a public read-only HTTP facade under `/api/v2/reference/irni/canonical`. That facade is useful for public canonical identity/reference reads; it is not an authenticated Worker-to-Express channel and must not be treated as one.
5. The IRNI v2 entity DTO contains a `boundaryReference` string and boundary status, not an authoritative Polygon/MultiPolygon payload, geometry hash, or approved source-evidence record. The approximate Worker neighborhood display geometry is not an authoritative geometry source.
6. `server/modules/geospatial/neighborhoodProfileBoundaryReadModel.ts` requires both `resolveIdentity` and `resolveSource`. It validates the locally stored boundary's active lifecycle, independent review, CRS, geometry digest, identity match, source registration, source authority, and verification status before emitting READY evidence.
7. `apps/api/server.ts` mounts `createProductionGeospatialModule()` without those resolvers. The profile-evidence route therefore correctly returns BLOCKED rather than inventing identity or source evidence.
8. Express runs as a separate Node process. It cannot access the Cloudflare Service Binding by reading `process.env` or importing the Worker RPC client. The existing strangler fallback is an HTTPS Worker-to-Express request path, not a Cloudflare Service Binding.

## Security requirements for any future bridge

A future bridge must be a dedicated, versioned internal contract. At minimum it must provide:

- Explicit contract name and version, operation allowlist, strict request/response schemas, bounded payloads, and no generic proxy behavior.
- Authenticated Worker-origin proof using a dedicated secret that is not reused for user sessions, lifecycle receipts, research HMAC, or other application purposes.
- Canonical request signing over method, exact path, timestamp, nonce, body digest, and contract version; constant-time signature comparison.
- Short timestamp acceptance window, nonce replay protection backed by a durable shared store, key rotation/version identifiers, and fail-closed behavior when any security dependency is unavailable.
- No trust in client-supplied identity headers. The Worker must strip such headers and mint its own signed assertion only after resolving the identity from the IRNI binding.
- Express must verify the assertion before using the identity. Correlation IDs are observability metadata, not authentication.
- No raw reviewer UID or other unnecessary account identifiers in public evidence DTOs.
- Explicit rate limits, audit events, redaction, and integration tests for missing/invalid/expired/replayed signatures, key mismatch, malformed payloads, wrong entity type, inactive entity, registry revision drift, and upstream unavailability.

The current `AUTH_INTERNAL_HMAC_SECRET` / Cloudflare session assertion implementation is for the authentication bridge. It must not be silently repurposed as the geography bridge key. A process-local nonce cache is not sufficient replay protection for a horizontally scaled production service.

## Missing upstream contract and data

The identity RPC alone cannot make profile evidence READY. Before implementation, the owning source system must expose a version-pinned, read-only geometry/source contract that binds all of the following to the same canonical entity and registry/source revision:

- canonical geographic entity ID and entity lifecycle/verification status;
- geometry payload or a durable geometry object reference that Radar can securely retrieve;
- geometry type, CRS, geometry version, and SHA-256 (or equivalent immutable digest);
- source dataset ID/version, source record key, provenance/evidence reference, licensing/authority assessment;
- boundary lifecycle/approval status and validity interval;
- registry revision/checksum and explicit compatibility guarantees.

The Radar-side source registry adapter must independently verify that the local boundary's `sourceProvenance` resolves to the same approved source metadata. A non-empty string or a canonical identity match is not source evidence.

## Required implementation order

1. Obtain and review the upstream IRNI geometry/source read contract and its deployed runtime state. Do not modify the IRNI repository as part of this Radar-only work.
2. Decide the trusted bridge topology and threat model, including durable replay storage, secret ownership/rotation, allowed caller identity, and production origin restrictions.
3. Implement a narrow Worker-to-Express identity assertion contract in Radar, with isolated key material and durable replay defense. Keep all public client-supplied bridge headers untrusted.
4. Implement Express verification and a resolver adapter that accepts only a valid signed assertion. Do not accept arbitrary identity values from request headers or query parameters.
5. Implement the trusted source-registry resolver and authoritative geometry retrieval/validation path. Identity and geometry verification remain separate trust domains.
6. Add end-to-end tests through the actual Worker fallback and Express route, including negative security and registry-drift cases.
7. Verify staging Service Binding deployment and runtime behavior before any production rollout.

## Explicit non-goals

- No call from Express to the public `/api/v2/reference/irni/canonical` facade as an implicit trust bridge.
- No direct Radar access to IRNI-owned D1.
- No approximate hexagons, centroids, names, numeric legacy IDs, or local display geometry as authority.
- No fabricated source registry, fake resolver, or hardcoded canonical identity.
- No production binding, secret, database, or deployment changes in this work package.

## Current release gate

Profile evidence remains BLOCKED until both canonical identity and trusted source evidence are independently verified in the production composition. A READY response must never be inferred from the Worker identity resolver alone.

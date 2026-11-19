# Integration Lead Handoff — `server/modules/legal-regulatory/` (`RT-SOCIAL-IMPL-030`)

## 1. Stage 30 Production API & Security Integration (`30-A`, `30-B`, `30-C`)

The Legal & Regulatory Intelligence module is mounted once in `server.ts` under `/api/v1/legal-regulatory` via `registerLegalRegulatoryRoutes(app, { checkRateLimit, getClientIp })`, backed by `createProductionLegalRegulatoryModule`, `FirestoreLegalRegulatoryStore`, and `FirestoreReadOnlyPropertyRegistryAdapter`.

---

## 2. Official 14-Endpoint Surface (`routes.ts`, `routeHandlers.ts`, `src/utils/expressRouteCatalog.ts`)

Base Path: `/api/v1/legal-regulatory`

- `GET /api/v1/legal-regulatory/provisions/search` → `handleSearchProvisions` → `applicabilityAndProfileService.searchProvisions(query, actor)` (PUBLIC, 30 req/min, Idempotency: Not Required)
- `GET /api/v1/legal-regulatory/sources/:sourceId` → `handleGetRegulatorySource` → `sourceAndProvisionService.getRegulatorySourceForViewer(sourceId, actor)` (PUBLIC, 60 req/min, Idempotency: Not Required)
- `POST /api/v1/legal-regulatory/sources` → `handleCreateRegulatorySource` → `sourceAndProvisionService.createRegulatorySource(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/sources/:sourceId/verify` → `handleVerifyRegulatorySource` → `sourceAndProvisionService.verifyRegulatorySource(sourceId, note, actor, expectedVersion, idempotencyKey)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/documents` → `handleCreateRegulatoryDocument` → `sourceAndProvisionService.createRegulatoryDocument(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `GET /api/v1/legal-regulatory/provisions/:provisionId` → `handleGetProvision` → `sourceAndProvisionService.getProvisionForViewer(provisionId, actor)` (PUBLIC, 60 req/min, Idempotency: Not Required)
- `GET /api/v1/legal-regulatory/provisions/:provisionId/as-of` → `handleGetProvisionAsOf` → `sourceAndProvisionService.getProvisionVersionAsOfDate(provisionId, asOfDateIso, actor)` (PUBLIC, 60 req/min, Idempotency: Not Required)
- `POST /api/v1/legal-regulatory/provisions` → `handleCreateProvision` → `sourceAndProvisionService.createRegulatoryProvision(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/provisions/:provisionId/changes` → `handleRecordProvisionChange` → `sourceAndProvisionService.recordRegulatoryChangeAndVersion(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/conflicts` → `handleRegisterProvisionConflict` → `sourceAndProvisionService.registerProvisionConflict(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/applicability-rules` → `handleCreateApplicabilityRule` → `applicabilityAndProfileService.createApplicabilityRule(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/compliance-requirements` → `handleCreateComplianceRequirement` → `applicabilityAndProfileService.createComplianceRequirement(body, actor)` (ADMIN, 20 req/min, Idempotency: Required)
- `POST /api/v1/legal-regulatory/property-profile/evaluate` → `handleEvaluatePropertyProfile` → `applicabilityAndProfileService.buildPropertyRegulatoryProfile(body, actor)` (VERIFIED_USER + server-verified property access, 10 req/min, Read-Only computational evaluation — Idempotency Not Required)
- `POST /api/v1/legal-regulatory/ai-summaries` → `handleRecordAiSummary` → `applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(body, actor)` (ADMIN, 5 req/min, Idempotency: Required)

---

## 3. Security, Persistence & Cross-Module Contracts

- **Actor Resolution (`actorResolver.ts`)**: Extracts UID exclusively from server-verified `verifyAdminApiAuthorization(..., { disallowStaticToken: true })` and `verifyAuthenticatedUserHeader(...)`. Ignores `x-legal-actor-id`, `x-legal-actor-role`, and static tokens (`server-secret-admin` / `system-admin-key`). Keeps `LEGAL_REVIEWER` disabled and fail-closed (`403`).
- **Property Registry Read-Only Authorization (`adapters.ts`, `property-registry/service.ts`)**: `PropertyContextReferenceAdapter.getPropertyCharacteristicsById({ propertyId, actorId })` returns discriminated `FOUND | NOT_FOUND | FORBIDDEN`. Verifies existence and registered ownership / active non-expired representative access fail-closed with zero write methods and zero blanket admin bypass. Authoritative snapshot fields cannot be overridden by caller `rawInput`.
- **Firestore Rules (`firestore.rules`) & Indexes (`firestore.indexes.json`)**: All 10 `legal_*_v1` collections enforce `allow read, write: if false;` for direct client SDK access. Only the proven multi-field equality index on `legal_ai_suggestions_v1` (`targetEntityType ASC`, `targetEntityId ASC`) is registered.
- **Error Handling, Validation & Redaction (`routeHandlers.ts`, `validationAndAuthz.ts`)**: Rejects unknown fields on mutating `POST` routes, prototype pollution keys, `NaN`/`Infinity`, oversized payloads (`413`), and invalid IDs/dates (`400`). Redacts private reviewer/owner fields deeply on public responses, enforces `Cache-Control: private, no-store` on all private/mutating/error responses, and attaches a `correlationId` to `500` responses with zero stack/internal leaks.

# Legal & Regulatory API Contract Baseline Matrix (`30-A-01`)

- **Parent Stage:** `RT-SOCIAL-IMPL-030-LEGAL-REGULATORY-PRODUCTION-API-INTEGRATION`
- **Baseline Step:** `30-A-01 — LEGAL-API-SERVICE-CONTRACT-BASELINE`
- **Base Path:** `/api/v1/legal-regulatory`
- **Router Entry:** `server/modules/legal-regulatory/routes.ts` (mounted once in `server.ts:216`)
- **Route Catalog:** `src/utils/expressRouteCatalog.ts` (`REGISTERED_API_ROUTES`)
- **Auth Source:** `src/utils/serverAdminAndTelegramSecurity.ts` via `server/modules/legal-regulatory/actorResolver.ts`

---

## 1. Access Policy Classification & Invariants

| Policy Token | Meaning | Enforcement |
|---|---|---|
| `PUBLIC_READ` | Unauthenticated or authenticated read of verified public regulatory entities | Strips `internalReviewerNotes` & `restrictedAuditMetadata`; rejects `UNVERIFIED` / `DRAFT_UNVERIFIED` with `403` for non-privileged callers |
| `AUTHENTICATED_READ` | Requires server-verified authenticated user (`uid`) | Returns `401 UNAUTHENTICATED` when unauthenticated |
| `REGULATORY_ADMIN_WRITE` | Requires server-verified `REGULATORY_ADMIN` via `verifyAdminRequest` (human UID only; static tokens rejected) | `401` if unauthenticated, `403` if non-admin; ignores `x-legal-actor-id` / `x-legal-actor-role` |
| `LEGAL_REVIEWER_WRITE` | **DISABLED (Fail-Closed `403`)** until a dedicated server-side reviewer role registry exists | Never granted from headers, request body, or static secrets |
| `PROPERTY_OWNER_OR_AUTHORIZED_USER` | Requires verified `uid` + server-side Property Registry ownership or active non-expired representative grant | Backend `REGULATORY_ADMIN` role alone NEVER grants access to private properties |

---

## 2. Exact 14-Endpoint × 12-Field Contract Matrix

### Endpoint 01 — Search Provisions
- **1. `method`:** `GET`
- **2. `path`:** `/api/v1/legal-regulatory/provisions/search`
- **3. `serviceOwner`:** `RegulatoryApplicabilityAndProfileService` (`server/modules/legal-regulatory/applicabilityAndProfileService.ts:85`)
- **4. `serviceMethod`:** `searchProvisions(query, actor)` (`applicabilityAndProfileService.ts:482` → `searchAndAiEngine.ts:62`)
- **5. `requestType`:** `LegalRegulatorySearchQuery` (`searchAndAiEngine.ts:28`)
- **6. `responseType`:** `PaginatedResult<PublicRegulatoryProvisionView>` (`types.ts:459`, `types.ts:200`)
- **7. `argumentsMapping`:** Query params (`keyword`, `issuingAuthority`, `countryCode`, `provinceId`, `cityId`, `districtNumber`, `neighborhoodId`, `sourceCategory`, `documentCategory`, `propertyCategory`, `publishedFromIso`, `publishedToIso`, `effectiveAsOfDateIso`, `includeHistoricalOrRepealed`, `includeUnverifiedDrafts`, `limit`, `cursor`) → `(query, actor)` (`routeHandlers.ts:324`)
- **8. `authentication`:** Public (optional Bearer auth; unauthenticated resolves to `PUBLIC_READER`)
- **9. `authorization`:** `PUBLIC_READ` (unverified drafts & private fields stripped for non-privileged viewers)
- **10. `operationType`:** `Read`
- **11. `idempotency`:** Not Required (pure read)
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `429 RATE_LIMIT_EXCEEDED`, `503 PERSISTENCE_UNAVAILABLE`, `500 INTERNAL_SERVER_ERROR`

### Endpoint 02 — Get Regulatory Source
- **1. `method`:** `GET`
- **2. `path`:** `/api/v1/legal-regulatory/sources/:sourceId`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `getRegulatorySourceForViewer(sourceId, actor)` (`sourceAndProvisionService.ts:287`)
- **5. `requestType`:** `{ sourceId: string }` (path param validated via `assertSafeEntityId`, `validationAndAuthz.ts:284`)
- **6. `responseType`:** `RegulatorySourceRecord | PublicRegulatorySourceView` (`types.ts:78`, `types.ts:103`)
- **7. `argumentsMapping`:** `(req.params.sourceId, actor)` (`routeHandlers.ts:356`)
- **8. `authentication`:** Public (optional Bearer auth)
- **9. `authorization`:** `PUBLIC_READ` (`403` for `UNVERIFIED` source if non-privileged; deep redaction applied)
- **10. `operationType`:** `Read`
- **11. `idempotency`:** Not Required (pure read)
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429 RATE_LIMIT_EXCEEDED`, `503 PERSISTENCE_UNAVAILABLE`

### Endpoint 03 — Create Regulatory Source
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/sources`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `createRegulatorySource(input, actor)` (`sourceAndProvisionService.ts:156`)
- **5. `requestType`:** `CreateRegulatorySourceInput` (`sourceAndProvisionService.ts:51`)
- **6. `responseType`:** `RegulatorySourceRecord` (`types.ts:78`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:370`)
- **8. `authentication`:** Required (`401 UNAUTHENTICATED`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required (`Idempotency-Key` header or body `1..255` chars; UoW + `legal_regulatory_idempotency_v1`)
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `409 IDEMPOTENCY_KEY_REUSED | CONFLICT_OR_DUPLICATE`, `413 PAYLOAD_TOO_LARGE`, `429 RATE_LIMIT_EXCEEDED`, `503 PERSISTENCE_UNAVAILABLE`

### Endpoint 04 — Verify Regulatory Source
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/sources/:sourceId/verify`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `verifyRegulatorySource(sourceId, verificationMethodNote, actor, expectedVersion?, idempotencyKey?)` (`sourceAndProvisionService.ts:229`)
- **5. `requestType`:** `{ sourceId: string; verificationMethodNote: string; expectedVersion?: number; idempotencyKey?: string }`
- **6. `responseType`:** `RegulatorySourceRecord` (`types.ts:78`)
- **7. `argumentsMapping`:** `(req.params.sourceId, body.verificationMethodNote, actor, body.expectedVersion, idempotencyKey)` (`routeHandlers.ts:376`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required (`Idempotency-Key` + optimistic CAS `expectedVersion`)
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONCURRENT_MODIFICATION_CONFLICT | IDEMPOTENCY_KEY_REUSED`, `413 PAYLOAD_TOO_LARGE`, `429`, `503`

### Endpoint 05 — Create Regulatory Document
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/documents`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `createRegulatoryDocument(input, actor)` (`sourceAndProvisionService.ts:305`)
- **5. `requestType`:** `CreateRegulatoryDocumentInput` (`sourceAndProvisionService.ts:75`)
- **6. `responseType`:** `RegulatoryDocumentRecord` (`types.ts:135`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:385`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `401`, `403`, `404 NOT_FOUND` (parent source), `409`, `413`, `429`, `503`

### Endpoint 06 — Get Regulatory Provision
- **1. `method`:** `GET`
- **2. `path`:** `/api/v1/legal-regulatory/provisions/:provisionId`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `getProvisionForViewer(provisionId, actor)` (`sourceAndProvisionService.ts:453`)
- **5. `requestType`:** `{ provisionId: string }`
- **6. `responseType`:** `RegulatoryProvisionRecord | PublicRegulatoryProvisionView` (`types.ts:169`, `types.ts:200`)
- **7. `argumentsMapping`:** `(req.params.provisionId, actor)` (`routeHandlers.ts:391`)
- **8. `authentication`:** Public (optional Bearer auth)
- **9. `authorization`:** `PUBLIC_READ` (`403` for `DRAFT_UNVERIFIED` / `UNVERIFIED` if non-privileged; deep redaction applied)
- **10. `operationType`:** `Read`
- **11. `idempotency`:** Not Required
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429`, `503`

### Endpoint 07 — Get Provision As-Of Date
- **1. `method`:** `GET`
- **2. `path`:** `/api/v1/legal-regulatory/provisions/:provisionId/as-of`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `getProvisionVersionAsOfDate(provisionId, asOfDateIso, actor)` (`sourceAndProvisionService.ts:438` → `changeAndConflictEngine.ts:208`)
- **5. `requestType`:** `{ provisionId: string; asOfDateIso: string }` (query `asOfDateIso` or `date` validated ISO)
- **6. `responseType`:** `{ provisionId: string; asOfDateIso: string; isInForceAtDate: boolean; matchedSnapshot: RegulatoryProvisionVersionSnapshot | null; lifecycleStatusAtDate: RegulatoryProvisionLifecycleStatus; explanation: string }` (`changeAndConflictEngine.ts:208`, `types.ts:154`)
- **7. `argumentsMapping`:** `(req.params.provisionId, asOfDateIso, actor)` (`routeHandlers.ts:405`)
- **8. `authentication`:** Public (optional Bearer auth)
- **9. `authorization`:** `PUBLIC_READ` (`403` for unverified drafts if non-privileged)
- **10. `operationType`:** `Read`
- **11. `idempotency`:** Not Required
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429`, `503`

### Endpoint 08 — Create Regulatory Provision
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/provisions`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `createRegulatoryProvision(input, actor)` (`sourceAndProvisionService.ts:360`)
- **5. `requestType`:** `CreateRegulatoryProvisionInput` (`sourceAndProvisionService.ts:91`)
- **6. `responseType`:** `RegulatoryProvisionRecord` (`types.ts:169`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:424`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `401`, `403`, `404`, `409`, `413`, `429`, `503`

### Endpoint 09 — Record Regulatory Change & Version
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/provisions/:provisionId/changes`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `recordRegulatoryChangeAndVersion(input, actor)` (`sourceAndProvisionService.ts:431` → `changeAndConflictEngine.ts:54`)
- **5. `requestType`:** `RecordRegulatoryChangeInput` (`changeAndConflictEngine.ts:24`)
- **6. `responseType`:** `{ updatedProvision: RegulatoryProvisionRecord; changeRecord: RegulatoryChangeRecord }` (`types.ts:169`, `types.ts:215`)
- **7. `argumentsMapping`:** `({ ...validatedBody, targetProvisionId: req.params.provisionId, expectedPreviousVersion, idempotencyKey }, actor)` (`routeHandlers.ts:430`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required (`Idempotency-Key` + `expectedPreviousVersion` CAS)
- **12. `errorContract`:** `400`, `401`, `403`, `404`, `409 CONCURRENT_MODIFICATION_CONFLICT | IDEMPOTENCY_KEY_REUSED`, `413`, `429`, `503`

### Endpoint 10 — Register Provision Conflict
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/conflicts`
- **3. `serviceOwner`:** `RegulatorySourceAndProvisionService` (`sourceAndProvisionService.ts:116`)
- **4. `serviceMethod`:** `registerProvisionConflict(input, actor)` (`sourceAndProvisionService.ts:446` → `changeAndConflictEngine.ts:263`)
- **5. `requestType`:** `RegisterProvisionConflictInput` (`changeAndConflictEngine.ts:43`)
- **6. `responseType`:** `RegulatoryProvisionConflictRecord` (`types.ts:232`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:445`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400 VALIDATION_ERROR` (e.g. self-conflict), `401`, `403`, `404`, `409`, `413`, `429`, `503`

### Endpoint 11 — Create Applicability Rule
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/applicability-rules`
- **3. `serviceOwner`:** `RegulatoryApplicabilityAndProfileService` (`applicabilityAndProfileService.ts:85`)
- **4. `serviceMethod`:** `createApplicabilityRule(input, actor)` (`applicabilityAndProfileService.ts:95`)
- **5. `requestType`:** `CreateApplicabilityRuleInput` (`applicabilityAndProfileService.ts:49`)
- **6. `responseType`:** `RegulatoryApplicabilityRuleRecord` (`types.ts:317`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:451`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400`, `401`, `403`, `404`, `409`, `413`, `429`, `503`

### Endpoint 12 — Create Compliance Requirement
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/compliance-requirements`
- **3. `serviceOwner`:** `RegulatoryApplicabilityAndProfileService` (`applicabilityAndProfileService.ts:85`)
- **4. `serviceMethod`:** `createComplianceRequirement(input, actor)` (`applicabilityAndProfileService.ts:174`)
- **5. `requestType`:** `CreateComplianceRequirementInput` (`applicabilityAndProfileService.ts:64`)
- **6. `responseType`:** `ComplianceRequirementRecord` (`types.ts:371`)
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:457`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400`, `401`, `403`, `404`, `409`, `413`, `429`, `503`

### Endpoint 13 — Evaluate Property Regulatory Profile
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/property-profile/evaluate`
- **3. `serviceOwner`:** `RegulatoryApplicabilityAndProfileService` (`applicabilityAndProfileService.ts:85`)
- **4. `serviceMethod`:** `buildPropertyRegulatoryProfile(rawInput, actor)` (`applicabilityAndProfileService.ts:269`)
- **5. `requestType`:** `PropertyRegulatoryEvaluationInput` (`types.ts:334`)
- **6. `responseType`:** `PropertyRegulatoryProfile` (`types.ts:411`) — deep-redacted via `redactPrivateFieldsDeep`
- **7. `argumentsMapping`:** When `propertyId` is present: `{ propertyId, transactionContext, asOfDateIso }` only (caller attributes stripped); otherwise `buildGeneralEvaluationInput(body)` (`routeHandlers.ts:463`)
- **8. `authentication`:** Required (`401 UNAUTHENTICATED`)
- **9. `authorization`:** `PROPERTY_OWNER_OR_AUTHORIZED_USER` (when `propertyId` supplied) / `AUTHENTICATED_READ` (hypothetical mode)
- **10. `operationType`:** `Read` (computational read-only evaluation; zero Firestore writes/transactions)
- **11. `idempotency`:** Not Required (verified from `applicabilityAndProfileService.ts:269-480`: performs only `list*` reads and read-only `getPropertyCharacteristicsById`, creates zero durable records and zero audit logs)
- **12. `errorContract`:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `413 PAYLOAD_TOO_LARGE`, `422 SNAPSHOT_INCONSISTENT`, `429`, `503 PERSISTENCE_UNAVAILABLE`

### Endpoint 14 — Record Non-Authoritative AI Summary
- **1. `method`:** `POST`
- **2. `path`:** `/api/v1/legal-regulatory/ai-summaries`
- **3. `serviceOwner`:** `RegulatoryApplicabilityAndProfileService` (`applicabilityAndProfileService.ts:85`)
- **4. `serviceMethod`:** `recordNonAuthoritativeAiSuggestion(input, actor)` (`applicabilityAndProfileService.ts:489` → `searchAndAiEngine.ts:156`)
- **5. `requestType`:** `RecordNonAuthoritativeAiSuggestionInput` (`searchAndAiEngine.ts:48`)
- **6. `responseType`:** `NonAuthoritativeAiSummaryRecord` (`types.ts:116`) — always `isAuthoritative: false`, `requiresHumanReview: true`
- **7. `argumentsMapping`:** `({ ...validatedBody, idempotencyKey }, actor)` (`routeHandlers.ts:497`)
- **8. `authentication`:** Required (`401`)
- **9. `authorization`:** `REGULATORY_ADMIN_WRITE` (`LEGAL_REVIEWER_WRITE` disabled `403`)
- **10. `operationType`:** `Write`
- **11. `idempotency`:** Required
- **12. `errorContract`:** `400`, `401`, `403`, `404`, `409`, `413`, `422 AUTHORITATIVE_AI_VIOLATION`, `429`, `503`

---

## 3. 6-Question Idempotency & Side-Effect Analysis (Observed from Source)

| # | Endpoint | Creates Durable Data? | Mutates Existing Data? | Writes Audit Record? | Multi-Step Tx? | Uses UoW (`runTransaction`)? | Calls Idempotency Ledger? | Decision |
|---|---|---|---|---|---|---|---|---|
| 01 | `GET /provisions/search` | No | No | No | No | No | No | **Not Required** |
| 02 | `GET /sources/:sourceId` | No | No | No | No | No | No | **Not Required** |
| 03 | `POST /sources` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 04 | `POST /sources/:sourceId/verify` | No | Yes (CAS) | Yes | Yes | Yes | Yes | **Required** |
| 05 | `POST /documents` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 06 | `GET /provisions/:provisionId` | No | No | No | No | No | No | **Not Required** |
| 07 | `GET /provisions/:provisionId/as-of` | No | No | No | No | No | No | **Not Required** |
| 08 | `POST /provisions` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 09 | `POST /provisions/:provisionId/changes` | Yes | Yes (CAS) | Yes | Yes | Yes | Yes | **Required** |
| 10 | `POST /conflicts` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 11 | `POST /applicability-rules` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 12 | `POST /compliance-requirements` | Yes | No | Yes | Yes | Yes | Yes | **Required** |
| 13 | `POST /property-profile/evaluate` | No | No | No | No | No | No | **Not Required (Read-Only Compute)** |
| 14 | `POST /ai-summaries` | Yes | Yes (Provision summary ref) | Yes | Yes | Yes | Yes | **Required** |

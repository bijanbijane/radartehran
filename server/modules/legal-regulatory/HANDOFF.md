# Integration Lead Handoff — `server/modules/legal-regulatory/` (`EMPLOYEE 39`)

## 1. Exclusive Ownership Compliance

All implementation, adapters, documentation, and test files for this task were created strictly inside `/server/modules/legal-regulatory/`. No shared files (`server.ts`, `src/utils/expressRouteCatalog.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase-blueprint.json`, `package.json`, `package-lock.json`, or other modules) were modified.

---

## 2. Shared-File Integration Requirements (For Integration Lead)

When mounting this module into the main Express application and Firestore deployment pipeline, the Integration Lead should apply the following updates:

### A. Express Route Registration (`server.ts` & `src/utils/expressRouteCatalog.ts`)
Mount the facade created via `createLegalRegulatoryModuleFacade()` under `/api/v1/legal-regulatory`:
- `GET /api/v1/legal-regulatory/provisions/search` → `applicabilityAndProfileService.searchProvisions(query, actor)`
- `GET /api/v1/legal-regulatory/sources/:sourceId` → `sourceAndProvisionService.getRegulatorySourceForViewer(sourceId, actor)`
- `POST /api/v1/legal-regulatory/sources` → `sourceAndProvisionService.createRegulatorySource(body, actor)`
- `POST /api/v1/legal-regulatory/sources/:sourceId/verify` → `sourceAndProvisionService.verifyRegulatorySource(sourceId, note, actor, expectedVersion)`
- `POST /api/v1/legal-regulatory/documents` → `sourceAndProvisionService.createRegulatoryDocument(body, actor)`
- `GET /api/v1/legal-regulatory/provisions/:provisionId` → `sourceAndProvisionService.getProvisionForViewer(provisionId, actor)`
- `GET /api/v1/legal-regulatory/provisions/:provisionId/as-of` → `sourceAndProvisionService.getProvisionVersionAsOfDate(provisionId, asOfDateIso)`
- `POST /api/v1/legal-regulatory/provisions` → `sourceAndProvisionService.createRegulatoryProvision(body, actor)`
- `POST /api/v1/legal-regulatory/provisions/:provisionId/changes` → `sourceAndProvisionService.recordRegulatoryChangeAndVersion(body, actor)`
- `POST /api/v1/legal-regulatory/conflicts` → `sourceAndProvisionService.registerProvisionConflict(body, actor)`
- `POST /api/v1/legal-regulatory/applicability-rules` → `applicabilityAndProfileService.createApplicabilityRule(body, actor)`
- `POST /api/v1/legal-regulatory/compliance-requirements` → `applicabilityAndProfileService.createComplianceRequirement(body, actor)`
- `POST /api/v1/legal-regulatory/property-profile/evaluate` → `applicabilityAndProfileService.buildPropertyRegulatoryProfile(body, actor)`
- `POST /api/v1/legal-regulatory/ai-summaries` → `applicabilityAndProfileService.recordNonAuthoritativeAiSuggestion(body, actor)`

### B. Required Firestore Composite Indexes (`firestore.indexes.json`)
Add the following composite indexes when deploying Firestore queries at scale:
1. Collection `legal_regulatory_documents_v1`: `sourceId ASC`, `effectiveFromIso DESC`
2. Collection `legal_change_records_v1`: `targetProvisionId ASC`, `previousProvisionVersion ASC`
3. Collection `legal_ai_suggestions_v1`: `targetEntityType ASC`, `targetEntityId ASC`, `generatedAtIso DESC`
4. Collection `legal_regulatory_provisions_v1`: `documentCategory ASC`, `verificationStatus ASC`, `effectiveFromIso DESC`

### C. Required Firestore Security Rules (`firestore.rules`)
All `legal_*_v1` collections are administered exclusively through backend Admin SDK routes (`allow read, write: if false;` for direct client SDK access, or read-only for verified documents if direct client reads are enabled in future phases).

### D. Cross-Module Adapter Wiring
- **Geography (`GeographyLookupAdapter`)**: Already wired by default to `defaultGeographicService` from `/server/modules/geography`.
- **Property Registry (`PropertyContextReferenceAdapter`)**: Pass an implementation backed by `PropertyRegistryService` into `createLegalRegulatoryModuleFacade({ propertyContextAdapter })` so `buildPropertyRegulatoryProfile({ propertyId })` resolves live property attributes read-only.

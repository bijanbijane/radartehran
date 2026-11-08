# Integration Lead Handoff — `server/modules/property-rights/` (`EMPLOYEE 43`)

## 1. Exclusive Ownership Compliance

All implementation, adapters, documentation, and test files were created strictly inside `/server/modules/property-rights/`. No shared files (`server.ts`, `src/utils/expressRouteCatalog.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase-blueprint.json`, `package.json`, `package-lock.json`, or other modules' files) were modified.

---

## 2. Shared-File Integration Requirements (For Integration Lead)

### A. Express Route Registration (`server.ts` & `src/utils/expressRouteCatalog.ts`)
Mount `createPropertyRightsModuleFacade()` under `/api/v1/property-rights`:
- `POST /api/v1/property-rights/interests` → `ownershipAndSharesService.registerOwnershipInterest(body, actor)`
- `GET /api/v1/property-rights/properties/:propertyId/interests` → `ownershipAndSharesService.retrievePropertyInterestsForViewer(propertyId, actor)`
- `GET /api/v1/property-rights/parties/:partyId/interests` → `ownershipAndSharesService.retrievePartyInterestsForViewer(partyId, actor)`
- `POST /api/v1/property-rights/interests/transfer` → `ownershipAndSharesService.transferOwnershipShare(body, actor)`
- `POST /api/v1/property-rights/interests/consolidate` → `ownershipAndSharesService.consolidateOwnershipShares(body, actor)`
- `POST /api/v1/property-rights/interests/:interestId/submit-verification` → `ownershipAndSharesService.submitInterestForVerification(interestId, evidenceIds, actor)`
- `POST /api/v1/property-rights/interests/:interestId/verification-decision` → `ownershipAndSharesService.recordVerificationDecision(body, actor)`
- `POST /api/v1/property-rights/rights` → `rightsEncumbrancesAndDisputesService.registerPropertyRight(body, actor)`
- `PATCH /api/v1/property-rights/rights/:rightId` → `rightsEncumbrancesAndDisputesService.amendOrTerminatePropertyRight(body, actor)`
- `POST /api/v1/property-rights/tenures` → `rightsEncumbrancesAndDisputesService.registerTenureInterest(body, actor)`
- `POST /api/v1/property-rights/encumbrances` → `rightsEncumbrancesAndDisputesService.registerEncumbrance(body, actor)`
- `POST /api/v1/property-rights/encumbrances/:encumbranceId/release` → `rightsEncumbrancesAndDisputesService.recordEncumbranceRelease(body, actor)`
- `POST /api/v1/property-rights/evidence` → `rightsEncumbrancesAndDisputesService.registerEvidenceReference(body, actor)`
- `POST /api/v1/property-rights/disputes` → `rightsEncumbrancesAndDisputesService.recordInterestDispute(body, actor)`
- `GET /api/v1/property-rights/properties/:propertyId/history` → `historyAndProfileService.getOwnershipAndRightsHistory(propertyId, actor, filterType)`
- `GET /api/v1/property-rights/properties/:propertyId/as-of` → `historyAndProfileService.getHistoricalPropertyStateAsOfDate(query, actor)`
- `GET /api/v1/property-rights/properties/:propertyId/disputes` → `historyAndProfileService.getUnresolvedConflictsAndDisputes(propertyId, actor)`
- `GET /api/v1/property-rights/properties/:propertyId/profile` → `historyAndProfileService.generatePropertyOwnershipAndRightsProfile(propertyId, actor, asOfDateIso)`

### B. Required Firestore Composite Indexes (`firestore.indexes.json`)
1. `property_ownership_interests_v1`: `propertyRef.propertyId ASC`, `effectiveFromIso DESC`
2. `property_ownership_interests_v1`: `partyRef.partyId ASC`, `effectiveFromIso DESC`
3. `property_non_ownership_rights_v1`: `propertyRef.propertyId ASC`, `effectiveFromIso DESC`
4. `property_encumbrances_v1`: `propertyRef.propertyId ASC`, `effectiveFromIso DESC`
5. `property_rights_history_v1`: `propertyId ASC`, `recordedAtIso DESC`
6. `property_rights_disputes_v1`: `propertyId ASC`, `disputeStatus ASC`

### C. Required Firestore Security Rules (`firestore.rules`)
Deny direct client SDK access (`allow read, write: if false;`) on all `property_*_v1` collections so all reads and mutations enforce backend role checks, enumeration protection, and PII redaction.

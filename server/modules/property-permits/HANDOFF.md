# Integration Handoff — Property Permits & Regulatory Approvals (`server/modules/property-permits`)

## 1. Exclusive Ownership Compliance

All files created for this task reside strictly inside `server/modules/property-permits/`:
- `server/modules/property-permits/types.ts`
- `server/modules/property-permits/validationAndAuthz.ts`
- `server/modules/property-permits/adapters.ts`
- `server/modules/property-permits/store.ts`
- `server/modules/property-permits/firestoreStore.ts`
- `server/modules/property-permits/authorityAndApplicationService.ts`
- `server/modules/property-permits/permitAndAmendmentService.ts`
- `server/modules/property-permits/inspectionsFeesAndDeadlinesService.ts`
- `server/modules/property-permits/index.ts`
- `server/modules/property-permits/README.md`
- `server/modules/property-permits/HANDOFF.md`
- `server/modules/property-permits/__tests__/propertyPermits.test.ts`

Zero shared files (`server.ts`, `src/utils/expressRouteCatalog.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase-blueprint.json`, `package.json`, or any other module's directory) were modified.

---

## 2. How the Integration Lead Wires This Module into `server.ts`

```ts
import { createPropertyPermitsModuleFacade } from './server/modules/property-permits';

const propertyPermitsModule = createPropertyPermitsModuleFacade({
  useFirestore: true,
  adapters: {
    // Optionally wire live adapters from server/modules/property-rights and server/modules/legal-regulatory
  },
});
```

---

## 3. Firestore Collections & Required Composite Indexes

When deploying Firestore rules and indexes globally, register the following collections defined in `PERMITS_FIRESTORE_COLLECTIONS` (`server/modules/property-permits/firestoreStore.ts`):
- `permit_issuing_authorities` (`jurisdictionScope.citySlug` ASC)
- `permit_applications` (`subjectRef.propertyId` ASC, `permitCategory` ASC, `issuingAuthorityId` ASC)
- `permit_records` (`subjectRef.propertyId` ASC)
- `permit_conditions` (`permitId` ASC)
- `permit_amendments_renewals` (`targetPermitId` ASC)
- `permit_inspections` (`permitId` ASC, `applicationId` ASC)
- `permit_fees` (`permitId` ASC, `applicationId` ASC)
- `permit_deadlines` (`propertyId` ASC)
- `permit_audit_events` (`targetId` ASC)
- `permit_idempotency_keys` (document ID = idempotency key)

---

## 4. Verification Command

```bash
npx tsx server/modules/property-permits/__tests__/propertyPermits.test.ts
```

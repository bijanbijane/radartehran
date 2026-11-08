# Integration Handoff — Real Estate Brokerage & Agency Operations (`server/modules/brokerage-operations`)

## 1. Exclusive Ownership Compliance

All created files reside strictly inside `server/modules/brokerage-operations/`:
- `types.ts`
- `validationAndAuthz.ts`
- `adapters.ts`
- `store.ts`
- `firestoreStore.ts`
- `orgBranchAndProfileService.ts`
- `mandateAssignmentAndCommissionService.ts`
- `engagementSupervisionAndReportingService.ts`
- `index.ts`
- `README.md`
- `HANDOFF.md`
- `__tests__/brokerageOperations.test.ts`

## 2. Reconciliation with Existing Modules (`brokerage`, `real-estate-professionals`, `professional-verification`)

- `server/modules/brokerage-operations` uses dedicated `brokerage_ops_*` Firestore collections (`BROKERAGE_OPS_COLLECTIONS` in `firestoreStore.ts`) so it never collides with `server/modules/brokerage` (`brokerage_agencies`, etc.) or `server/modules/real-estate-professionals`.
- The Integration Lead can inject bridge adapters into `createBrokerageOperationsModuleFacade({ adapters })` to synchronize verified qualifications from `server/modules/professional-verification` andapplicable legal rules from `server/modules/legal-regulatory`.

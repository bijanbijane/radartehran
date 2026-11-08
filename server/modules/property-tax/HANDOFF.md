# Handoff Report — Employee 50: Property Tax & Municipal Charges Backend (`server/modules/property-tax/`)

## 1. Repository & Git Status
- **Target Branch**: `feature/backend-property-tax`
- **Git Status Note**: The workspace container `/app/applet` does not contain an initialized `.git` repository (`fatal: not a git repository`). No git commit hash was fabricated. All changes are strictly isolated inside `/server/modules/property-tax/`.

## 2. Files Created Inside `server/modules/property-tax/`
- `server/modules/property-tax/types.ts`
- `server/modules/property-tax/store.ts`
- `server/modules/property-tax/authorityTaxRecordAndAssessmentService.ts`
- `server/modules/property-tax/obligationBillPaymentAndDeadlineService.ts`
- `server/modules/property-tax/exemptionDisputeAndReportingService.ts`
- `server/modules/property-tax/index.ts`
- `server/modules/property-tax/README.md`
- `server/modules/property-tax/HANDOFF.md`
- `server/modules/property-tax/__tests__/propertyTax.test.ts`

No files outside `server/modules/property-tax/` were modified.

## 3. Existing Tax Functionality Inspection & Non-Overlap
- Inspected existing codebase for tax functionality (`src/data/iranianRealEstateLaw.ts` and `src/components/SuperModulesLegalAndBuildingTabs.tsx` contain an educational frontend calculator `calculatePropertyTaxes` for estimating annual rental income tax and vacant home tax in Million Tomans).
- `server/modules/property-tax/` does **not** duplicate statutory rate tables (which belong to `server/modules/legal-regulatory/` and `src/data/iranianRealEstateLaw.ts`) and instead manages durable property-specific tax records, assessments, obligations, bills, municipal charges, payment status references, deadlines, exemptions, disputes, and reporting summaries.

## 4. Required Integration Work for Integration Lead
1. **Route Mounting (`server.ts` & `src/utils/expressRouteCatalog.ts`)**:
   - Mount `/api/property-tax/*` endpoints delegating to `createPropertyTaxModuleFacade()`.
2. **Firestore Security Rules & Indexes (`firestore.rules`, `firestore.indexes.json`, `firebase-blueprint.json`)**:
   - Provision collections `property_tax_authorities`, `property_tax_records`, `property_tax_assessments`, `property_tax_obligations`, `property_tax_bills`, `property_municipal_charges`, `property_tax_payments`, `property_tax_deadlines`, `property_tax_exemptions`, `property_tax_disputes`, `property_tax_parties`, `property_tax_documents`, and `property_tax_history` with composite indexes on `(propertyId, createdAt)` and `(propertyId, dueDateIso)`.
3. **Cross-Module Adapter Wiring**:
   - Wire `PropertyRegistryTaxAdapter`, `LegalRegulatoryTaxAdapter`, `PaymentsTaxAdapter`, `MediaTaxAdapter`, and `NotificationsTaxAdapter` to their respective backend module facades.

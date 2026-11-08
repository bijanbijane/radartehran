# Real Estate Transactions & Deal Management Backend Module (`server/modules/real-estate-transactions/`)

## 1. Module Responsibilities
Manages property sale and rental transactions, transaction participants and authority validation, purchase/rental offers and counteroffers, negotiation records with strict visibility scopes, versioned deal terms, transaction conditions, milestones, contract status references, closing workflows, handover coordination, cancellation/termination workflows, and completed transaction records.

This module **does not**:
- Act as a property registry, legal authority, payment processor, electronic signature provider, or brokerage CRM.
- Infer authority to sell or rent merely because a party created a transaction (`infersAuthorityFromTransactionCreationAlone: false`).
- Treat an accepted offer as a legally executed contract (`isLegallyExecutedContractByAcceptanceAlone: false`) or completed sale price (`isCompletedSalePrice: false`).
- Allow two competing offers to be accepted on the same transaction (`CONCURRENT_OFFER_ACCEPTANCE_CONFLICT`).
- Treat an uploaded PDF contract as legally executed without a signature-provider or official registration reference (`UPLOADED_PDF_NOT_EXECUTED_CONTRACT`, `provesLegalValidityFromPdfImageAlone: false`).
- Complete a closing workflow without verified payment confirmation from Payments and (for sale transactions) verified ownership transfer confirmation from Property Ownership & Rights (`CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION`).
- Allow a transaction to become `COMPLETED` without a `COMPLETED` closing record, or silently overwrite a completed transaction (`COMPLETED_TRANSACTION_IMMUTABLE`).
- Treat a listing asking price or accepted offer amount as a verified completed transaction price (`ASKING_PRICE_OR_OFFER_NOT_VERIFIED_COMPLETED_PRICE`).

## 2. Cross-Module Interfaces
- `PropertyRegistryTransactionAdapter`: Verifies canonical property existence.
- `PropertyOwnershipTransactionAdapter`: Verifies seller/landlord authority and ownership transfer confirmation.
- `BrokerageOperationsTransactionAdapter`: Verifies broker/agent representation mandate authority.
- `PaymentsTransactionAdapter`: Verifies deposit and final settlement payment confirmations.
- `MediaTransactionAdapter`: Verifies contract and supporting document references.
- `NotificationsTransactionAdapter`: Dispatches transaction lifecycle notifications.

## 3. Synthetic Example (Test Fixture Only)
```ts
// SYNTHETIC TEST FIXTURE ONLY — NOT A REAL PROPERTY TRANSACTION OR CONTRACT
const facade = createRealEstateTransactionsModuleFacade();
const tx = await facade.transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
  transactionType: 'PROPERTY_SALE',
  propertyId: 'prop-tehran-303',
  listingAskingPriceRials: 62_000_000_000,
  jurisdictionCitySlug: 'tehran',
  sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
  isSyntheticTestFixture: true,
});
```

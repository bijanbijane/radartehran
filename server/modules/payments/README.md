# Employee 15 — Payments, Wallet & Settlement Backend (`server/modules/payments/`)

## 1. Domain Overview & Boundaries
The Payments, Wallet, Billing, and Settlement backend module (`server/modules/payments/`) provides central, provider-agnostic financial transaction infrastructure for Tehran Radar.

### Strict Module Boundaries:
- **Owned Directory**: `server/modules/payments/`
- **Zero Inventions**: Does not invent fake payments, balances, or gateway integrations.
- **PCI-DSS Compliance**: Never stores raw credit/debit card numbers, CVVs, or bank credentials.
- **Provider-Independent**: Gateway adapters (`PaymentProviderAdapter`) decouple core accounting from payment processors.
- **Non-Ownership of Business Objects**: Does not own sponsorship packages (Sponsors), quotations/bookings (Property Services), or listing features (Bargains).

---

## 2. Double-Entry Accounting Ledger
- **Integer Minor Units**: No floating-point math; all monetary values are recorded as positive integers.
- **Balance Invariant**: For every journal transaction, `sum(DEBIT) == sum(CREDIT)` within the same currency.
- **Immutability**: Historical ledger entries are never edited or deleted; corrections are posted as reversing journal entries.

---

## 3. Payment Lifecycle State Machine

```text
[CREATED] ----------------> [PENDING] ----------------> [REDIRECT_REQUIRED]
    |                          |                              |
    +-----> [CANCELLED]        +-----> [FAILED]               v
    |                                                  [PROCESSING]
    v                                                         |
[EXPIRED]                                                     +-----> [SUCCEEDED]
                                                              |          |
                                                              |          +-----> [REFUND_PENDING]
                                                              |          |          |
                                                              v          v          v
                                                           [FAILED]  [DISPUTED] [REFUNDED]
```

- **Callback Security**: Browser return URLs are never treated as confirmation of payment. Direct server-to-server gateway verification is mandatory before transitioning to `SUCCEEDED`.
- **Idempotent Callbacks**: Duplicate gateway callbacks return the already-settled state without double-crediting accounts.

---

## 4. Wallet & Settlement Subsystems
- **Wallet Balances**: Derived from immutable posted ledger transactions. Negative balances and double-spending are strictly prevented.
- **Refund Controls**: Total cumulative refunds can never exceed the original paid amount.
- **Settlement Batches**: Net payable amounts are computed using `Gross - Commission - Refunds` with explicit policy version tracking.

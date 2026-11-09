# Property Valuation & Pricing Intelligence Backend Module (`server/modules/valuation/`)

## 1. Overview & Architectural Role
The Property Valuation and Pricing Intelligence backend module calculates explainable property value estimates, land residual valuations, rental deposit-rent conversions, and neighborhood market indicators based on verified neighborhood benchmarks and comparable listing records.

### Core Architectural Invariants
- **Explainable Estimates**: Every estimate exposes its underlying baseline price, distinct hedonic adjustments (age, floor, amenities, property category, land zoning, frontage, corner orientation), percentage impacts, valuation range (`[min, max]`), fast sale factor (`0.88x`), and explicit method limitations.
- **Strict Separation of Property Categories**:
  - `residential`: Hedonic age, floor, elevator, and amenities regressions.
  - `commercial`: Commercial foot-traffic premiums (+35%) and frontage weighting.
  - `office`: Administrative/commercial corridor position premiums (+15%).
  - `land`: Land residual strategy incorporating zoning (`commercial` +35%, `mixed` +18%, `agricultural` -50%), corner plot bonus (+8.5%), frontage width, and density permits.
- **Asking Price vs. Confirmed Transaction Distinction**:
  - Asking prices from unmoderated listings are **never** treated as confirmed transactions.
  - Data quality metrics explicitly report `confirmedTransactionCount` separately from `askingPriceCount`.
- **Rental & Deposit Equivalence**:
  - Deposit and monthly rent are distinct financial variables.
  - Configurable market conversion rate (default 3.0% / 30,000 Toman per million Rahn; customizable between 1.0% and 6.0%) computes equivalent full Rahn and full monthly rent without hardcoding a universal ratio.
- **Comparable Inclusion / Exclusion Transparency**: Each comparable record records its similarity score, inclusion status, and explicit exclusion reason (e.g. outlier price dispersion, or area divergence $> 50\%$).
- **No Direct DB Coupling**: Valuation consumes external domain data exclusively via `ValuationDataConsumerAdapter` (`getNeighborhoodBenchmark`, `queryComparableListings`).
- **Reproducible Historical Snapshots**: Every valuation calculation computes a deterministic SHA-256 hash of its inputs, allowing historical results to be persisted and reproduced.

---

## 2. Directory Structure & Line Count Governance
All files are strictly under the `500`-line ceiling:
```
server/modules/valuation/
├── types.ts                      # Domain models, valuation results, data quality & adapters (~187 lines)
├── validation.ts                 # Input validation & reproducible SHA-256 hash generation (~187 lines)
├── rentalAndLandEngine.ts        # Rental deposit equivalence & land valuation calculations (~143 lines)
├── service.ts                    # Hedonic regression, comparable analysis & market indicators (~436 lines)
├── routes.ts                     # Express router with standard error boundaries (~108 lines)
├── index.ts                      # Public barrel export (~5 lines)
├── README.md                     # Architecture, methodology, confidence framework & integration guide
└── __tests__/
    ├── valuation.test.ts         # Hedonic regression, commercial & reproducibility test suite (~194 lines)
    └── landAndRental.test.ts     # Land valuation, rental conversions & asking vs confirmed suite (~160 lines)
```

---

## 3. Valuation Methodology & Factor Adjustments

### A. Hedonic Formula
$$\text{Estimated Price Per Sqm} = \text{BasePricePerSqm} \times \left(1 + \sum \text{ImpactPercent}_i\right)$$
$$\text{Estimated Total} = \text{Estimated Price Per Sqm} \times \text{Sqm}$$

### B. Adjustments Implemented
1. **Building Age (`buildYear`)**:
   - Brand new (1405): `+6.5%`.
   - 1 to 4 years: `+2.0%` to `0.0%`.
   - 5 to 10 years: `-1.1% / year`.
   - $> 10$ years: Graduated depreciation down to `-25.0%`.
2. **Floor & Elevator (`floor`, `hasElevator`)**:
   - Basement / Ground: `-8.5%` / `-5.0%`.
   - Middle floors (2..4): Standard reference (`0%` to `+3.0%`).
   - Higher floors (5+): `+4.0%` to `+9.0%` (light and view premium).
   - Floors $\ge 3$ without elevator: Heavy penalty (`-3.5% / floor`).
3. **Amenities (`hasParking`, `hasStorage`, `hasElevator`)**:
   - Missing parking: `-7.5%`.
   - Missing storage: `-1.5%`.
   - Full amenities: `+1.5%` premium.
4. **Property Category Multipliers**:
   - Residential: Base standard.
   - Commercial: `+35%` commercial activity premium.
   - Office: `+15%` administrative/office position premium.
   - Land: Land residual methodology with zoning, frontage, corner orientation (+8.5%), and density permit adjustments.

---

## 4. Confidence & Data Quality Framework
Confidence is categorized into `'high' | 'moderate' | 'low' | 'insufficient_data'` based on:
- Number of approved comparable properties in the same neighborhood.
- Proportion of confirmed transactions vs. asking prices.
- Missing input fields (penalized if age or floor is unknown).
- Statistical dispersion among comparable prices per square meter.

---

## 5. Verification Summary
- **Tests**: `npx tsx --test server/modules/valuation/__tests__/*.test.ts` (7 passed, 0 failed across 2 suites).
- **Strict TypeScript**: `npx tsc --noEmit --strict ...` (0 errors).
- **Architecture Guardrails**: `npm run arch:check` (0 errors, 0 warnings).
- **Applet Compilation**: Verified.

---

## 6. Integration Handoff for Integration Lead
1. **Route Mounting**: Mount `createValuationRouter(deps)` under `/api/valuation`.
2. **Provide `ValuationDataConsumerAdapter`**:
   - Wire `getNeighborhoodBenchmark` to read base price per square meter and rahn from the Geography/Neighborhood dataset.
   - Wire `queryComparableListings` to fetch approved public listings from `/bargains` collection and verified transactions.
3. **Persistence**:
   - If historical snapshots are desired, wire `persistValuationSnapshot` to write to `/valuationSnapshots/{id}`.

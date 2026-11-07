# Employee 10 — Property Valuation & Market Intelligence Backend Module

## 1. Overview & Architectural Role
The Property Valuation and Market Intelligence backend module (`server/modules/valuation/`) calculates explainable property value estimates and neighborhood market indicators based on verified neighborhood benchmarks and comparable listing records.

### Core Architectural Invariants
- **Explainable Estimates**: Every estimate exposes its underlying baseline price, distinct hedonic adjustments (age, floor, amenities, property category), percentage impacts, valuation range (`[min, max]`), fast sale factor (`0.88x`), and explicit method limitations.
- **Strict Distinction of Property Categories**: Separate models are applied to residential, commercial, and office properties. Commercial and office valuations explicitly incorporate distinct commercial/office density premiums and risk disclaimers rather than blindly projecting residential formulas.
- **Comparable Inclusion / Exclusion Transparency**: Each comparable record records its similarity score, inclusion status, and explicit exclusion reason (e.g. outlier price dispersion, or area divergence $> 50\%$).
- **No Direct DB Coupling**: Valuation consumes external domain data exclusively via `ValuationDataConsumerAdapter` (`getNeighborhoodBenchmark`, `queryComparableListings`).
- **Reproducible Historical Snapshots**: Every valuation calculation computes a deterministic SHA-256 hash of its inputs, allowing historical results to be persisted and reproduced.

---

## 2. Directory Structure & Line Count Governance
All files are strictly under the `500`-line ceiling:
```
server/modules/valuation/
├── types.ts                      # Domain models, valuation result schemas, and consumer adapter (~140 lines)
├── validation.ts                 # Input validation & reproducible SHA-256 hash generation (~122 lines)
├── service.ts                    # Hedonic regression, comparable analysis & market intelligence (~396 lines)
├── index.ts                      # Public barrel export (~3 lines)
├── README.md                     # Architecture, methodology, confidence framework & integration guide
└── __tests__/
    └── valuation.test.ts         # Unit & integration test suite (~194 lines)
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

---

## 4. Confidence & Data Quality Framework
Confidence is categorized into `'high' | 'moderate' | 'low' | 'insufficient_data'` based on:
- Number of approved comparable properties in the same neighborhood.
- Missing input fields (penalized if age or floor is unknown).
- Statistical dispersion among comparable prices per square meter.

---

## 5. Verification Summary
- **Tests**: `npx tsx --test server/modules/valuation/__tests__/valuation.test.ts` (3 passed, 0 failed).
- **Strict TypeScript**: `npx tsc --noEmit --strict ...` (0 errors).
- **Architecture Guardrails**: `npm run arch:check` (0 errors, 0 warnings).
- **Applet Compilation**: Verified.

---

## 6. Integration Handoff for Integration Lead
1. **Provide `ValuationDataConsumerAdapter`**:
   - Wire `getNeighborhoodBenchmark` to read base price per square meter and rahn from the Geography/Neighborhood dataset.
   - Wire `queryComparableListings` to fetch approved public listings from `/bargains` collection.
2. **Persistence**:
   - If historical snapshots are desired, wire `persistValuationSnapshot` to write to `/valuationSnapshots/{id}`.

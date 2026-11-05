# Radar Tehran — Engineering Assessment Deliverable: ASSESS-006
## Workstream: Trade-Up, Asset Swap & Rent-vs-Buy Financial Model Validation (`ASSESS-006`)
## Campaign: `CAMPAIGN-PROD-02: PropTech Calculation & Valuation Accuracy Assessment`
## Role / Owner: Member 04 — Business Logic & PropTech Engineer

---

## 1. Executive Summary & Objective
Workstream **ASSESS-006** validates the financial engineering models governing residential property trade-ups (`evaluateTradeUpOptions`), Rent-vs-Buy capital allocation (`evaluateRentVsBuyInNeighborhood`), and direct Metro line commute matching (`checkDirectMetroCommute`) in `src/data/neighborhoodInsights.ts`.

---

## 2. Empirical Model Audit Matrix

| # | Financial / Geospatial Mechanism | Formula / Invariant Audited | Empirical Result | Status |
|---|---|---|---|---|
| 1 | **Current Home Depreciation & Land Floor** | $\text{AgeFactor} = \max(0.60, 1 - 0.012 \times \text{ageYears})$ | Prevents buildings $> 34$ years old from depreciating below their $60\%$ land equity value. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Closing Cost & Brokerage Friction** | $\text{NetProceeds} = \text{round}(\text{SaleValue} \times 0.99)$ | Automatically deducts $1\%$ seller friction (union commission + VAT + notary) before computing upgrade purchasing power. | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Mortgage Loan & Tenant Rahn Bridge** | $\text{Loan} = +1,200\text{M}$; $\text{NetCash} = \max(500, \text{TargetPrice} - \text{TargetRahn})$ | Accurately scales target neighborhood rahn by $(\text{targetNewSqm}/80) \times \text{rentAgeMultiplier}$ while enforcing a 500M Toman minimum cash floor. | `VERIFIED` (`TEST_EXECUTED`) |
| 4 | **Target Age Segment Multipliers** | `'new' = 1.00`, `'mid' = 0.88`, `'older' = 0.76` | Strict monotonic cost hierarchy across all candidate neighborhoods. | `VERIFIED` (`TEST_EXECUTED`) |
| 5 | **Rent-vs-Buy P/R Arbitrage** | $P/R < 6.2 \implies \text{BUY\_NOW}$; $P/R > 6.8 \implies \text{RENT\_AND\_INVEST}$ | Evaluates 3-year compounded wealth between real estate appreciation and gold/fixed-income yield on freed capital. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 3. Campaign PROD-02 Conclusion
With `ASSESS-004`, `ASSESS-005`, and `ASSESS-006` all empirically verified via automated test suites (`tests/assess-004-*.test.ts`, `tests/assess-005-*.test.ts`, `tests/assess-006-*.test.ts`), **Campaign PROD-02 (`PropTech Calculation & Valuation Accuracy Assessment`)** is formally complete (`CAMPAIGN_COMPLETE`).

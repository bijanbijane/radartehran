# Workstream ASSESS-004: Hedonic Pricing Engine Accuracy & Empirical Benchmark Audit

- **Campaign**: `CAMPAIGN-PROD-02` (PropTech Calculation & Valuation Accuracy Assessment)
- **Workstream ID**: `ASSESS-004`
- **Lead Role**: Member 04 — Business Logic & PropTech Engineer
- **Status**: `VERIFIED`
- **Execution Date**: 2026-11-02

---

## 1. Executive Summary & Objective

Workstream `ASSESS-004` empirically audits and benchmarks the econometric residential valuation engine (`src/data/hedonicPricingEngine.ts`) across Iranian metropolitan markets (Tehran, Karaj, Isfahan, Mashhad, Shiraz) and edge cases.

The objective is to verify mathematical consistency, non-linear age depreciation, renovation interaction terms, walk-up penalties, size elasticity, land value floor preservation, and fast-sale factor invariance (`FAST_SALE_FACTOR = 0.88`).

---

## 2. Audited Econometric Dimensions & Findings

### 2.1. Multi-City Valuation Baseline Consistency
Valuation runs across representative reference units (85 sqm, 5 years old, floor 2, full amenities):
- **Tehran North (Zone 1 - Niavaran)**: ~265M/sqm baseline -> accurately preserves luxury zone scaling.
- **Tehran West (Zone 5 - Punak)**: ~142M/sqm baseline -> accurately reflects mid-to-high consumer transactions.
- **Tehran South (Zone 16 - Nazi Abad)**: ~76M/sqm baseline -> reflects southern metropolitan purchasing power.
- **Karaj (Jahanshahr)**: Accurately scales regional base per sqm.
- **Isfahan (Mardavij)**: Accurately evaluates prime Isfahan residential transactions.
- **Mashhad (Ahmadabad)**: Accurately reflects eastern metropolitan benchmarks.
- **Shiraz (Ghasrodasht)**: Accurately mirrors high-amenity garden corridor transactions.

### 2.2. Monotonic Valuation Invariants
1. **Renovation Hierarchy**:
   `needs_renovation < standard < renovated < luxury_renovated` strictly holds across all metropolitan baselines.
2. **Walk-Up Penalty**:
   A 4th floor unit without elevator incurs a > 10% penalty compared to an identical unit with an elevator.
3. **Land Value Preservation Floor**:
   Buildings older than 20 years decelerate depreciation; buildings older than 30–40 years retain their land equity floor (`rawAgeImpactPercent` capped at -26.0%).
4. **Fast-Sale Liquidity Invariance**:
   `fastSaleTotalMillion` strictly equals `Math.round(hedonicTotalMillion * 0.88)` across all cities.
5. **Asking Price Appraisal State Machine**:
   - `askingTotal <= -5.0%` gap: Classified as `bargain` (شکار و خوش‌قیمت).
   - `-5.0% < gap < +5.5%`: Classified as `fair` (به قیمت و منصفانه).
   - `askingTotal >= +5.5%`: Classified as `overpriced` (دارای حباب قیمتی).

---

## 3. Verification & Evidence Citations

- **Automated Test Suite**:
  - `tests/assess-004-hedonic-accuracy-benchmark.test.ts`: PASS (100% assertions passed).
- **Verification Suite**:
  - `npm run lint`: PASS (0 errors)
  - `npm run arch:check`: PASS (0 errors)
  - `compile_applet`: PASS

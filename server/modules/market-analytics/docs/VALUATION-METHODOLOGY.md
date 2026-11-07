# Property Valuation & Market Analytics Methodology (`VALUATION-METHODOLOGY.md`)

- **Module**: `server/modules/market-analytics/`
- **Owner**: Employee 10 — Property Valuation and Market Analytics Backend
- **Model Version**: `v1.0.0-market-analytics-2026.11`
- **Status**: CANONICAL & REPRODUCIBLE

---

## 1. Core Epistemological & Valuation Principles

### 1.1. Five-Tier Evidence Classification
The engine strictly separates and labels five categories of market data:
1. **`verified_transaction`** (`معامله قطعی ثبت‌شده`): Actual completed transaction prices corroborated by contract or registry evidence.
   - Base Weight: `1.00`
   - Asking-to-Transaction Adjustment Factor: `1.00` (0% negotiation haircut).
2. **`approved_property_listing`** (`آگهی تاییدشده پلتفرم`): Vetted listings approved by platform moderation from the Bargains module.
   - Base Weight: `0.80`
   - Asking-to-Transaction Adjustment Factor: `0.94` (-6% negotiation spread adjustment).
3. **`public_asking_price`** (`قیمت اعلامی عمومی بازار`): Public seller/landlord asking prices.
   - Base Weight: `0.55`
   - Asking-to-Transaction Adjustment Factor: `0.92` (-8% negotiation spread adjustment).
4. **`user_submitted_observation`** (`گزارش میدانی کاربران`): Crowd-submitted quotes or local observations.
   - Base Weight: `0.45`
   - Asking-to-Transaction Adjustment Factor: `0.93` (-7% negotiation spread adjustment).
5. **`model_derived_estimate`** (`برآورد مشتق از مدل`): Outputs from prior model runs.
   - Base Weight: `0.00` (Strictly rejected at ingestion via `MODEL_DERIVED_EXCLUDED_FROM_PRIMARY_EVIDENCE` so model projections never self-reinforce).

> **Fundamental Invariant**: An asking price is never a completed transaction price. Non-transaction categories are explicitly converted to transaction-equivalent values via `askingToTransactionAdjustment` and reported in `dataSources` with both raw count share and effective weight share.

---

## 2. Strict Separation of Sale and Rental Markets

- Sale (`marketMode: 'sale'`) and Rental (`marketMode: 'rental'`) pipelines are completely isolated.
- Attempting to feed a rental observation into a sale valuation (or vice versa) triggers immediate exclusion with reason code `CROSS_MODE_CONTAMINATION`.
- **Rental Normalization**:
  - Rental observations may contain upfront deposit (`depositMillion` / Rahn), monthly rent (`monthlyRentMillion`), or both.
  - Total Rahn-Equivalent is computed as:
    $$\text{RahnEquivalent} = \text{depositMillion} + \frac{\text{monthlyRentMillion}}{\text{monthlyRentToRahnRate}}$$
    where $\text{monthlyRentToRahnRate} = 0.03$ (3% monthly conversion rate).

---

## 3. Missing-Data Safeguards & Quality Normalization

- **Never Treating Missing Data as Zero**:
  - In real-estate data, `floor = 0` means Ground Floor (-5.5% impact) and `buildingAgeYears = 0` means Brand New (+6.5% impact).
  - Treating `null` or `undefined` as `0` introduces severe bias.
  - `computeMissingSafeQualityIndex` treats `null` attributes as neutral (`0%` quality delta) and applies a conservative similarity weight reduction (`0.82`–`0.88`) in `computeComparableSimilarityScore`.
- **Price-Per-Square-Meter Guardrail**:
  - Price-per-square-meter (`perSqmMillion`) is calculated **only** when `sqm` is a valid finite number $\ge 20$. If `sqm` is `null`, `perSqmMillion` remains `null`.

---

## 4. Temporal Decay & Comparable Weighting

Each inlier comparable $i$ receives a combined weight:
$$W_i = W_{\text{source}}(c_i) \times S_{\text{similarity}}(i, \text{subject}) \times 2^{-\frac{\Delta t_i}{T_{1/2}}} \times \tau_i$$
where:
- $\Delta t_i$ is the observation age in days relative to `valuationTimestampIso`.
- $T_{1/2} = 45\text{ days}$ is the exponential recency half-life.
- Observations older than `maxObservationAgeDays` ($180\text{ days}$) or with future timestamps relative to `valuationTimestampIso` are excluded.

---

## 5. Statistical Outlier Detection

For sample sizes $n \ge 4$, `detectStatisticalOutliers` computes the 25th percentile ($Q_1$), median ($Q_2$), and 75th percentile ($Q_3$) using linear interpolation:
- $\text{IQR} = \max(Q_3 - Q_1, 0.04 \times Q_2)$
- $\text{LowerFence} = \max(0.35 \times Q_2, Q_1 - 1.5 \times \text{IQR})$
- $\text{UpperFence} = \min(2.50 \times Q_2, Q_3 + 1.5 \times \text{IQR})$

Observations outside $[\text{LowerFence}, \text{UpperFence}]$ are excluded from central/range estimation and recorded in `outlierReport.outliers`.

---

## 6. Evidence Sufficiency Gates & Refusal to Emit Unjustified Central Estimates

| Inlier Count ($n$) & Dispersion ($\text{CV}$) | Output Status | `isAuthoritativeEstimateAllowed` | `centralValue` | `estimatedRange` |
|---|---|---|---|---|
| $n < 3$ | `insufficient_evidence` | `false` | `null` | `null` |
| $3 \le n < 5$ (with $< 2$ verified deals) OR $\text{CV} > 0.28$ | `provisional_range_only` | `false` | `null` | Populated $[Q_1, Q_3]$ |
| $n \ge 5$ (or $n \ge 3$ with $\ge 2$ verified deals) AND $\text{CV} \le 0.28$ | `authoritative_estimate` | `true` | Populated | Populated |

---

## 7. Historical Trends: Observed Indicators vs. Inferred Trends

- **Zero Synthetic Gap-Filling**: If a historical period has fewer than `minSamplesPerPeriod` ($3$) valid observations, `indicatorType` is set to `'insufficient_period_sample'` and all numerical metrics for that period are `null`. Synthetic neighborhood observations are never generated to fill temporal or spatial gaps.
- **Explicit Distinction**: Individual time buckets are labeled `'observed_indicator'`, while multi-period trajectory is labeled `'inferred_trend'` accompanied by an explicit `predictiveClaimDisclaimer`.

# Mortgage & Real Estate Financing Intelligence Backend Module

Exclusive Module Directory: `server/modules/financing-intelligence/`

## 1. Domain Overview & Purpose
This module provides transparent financing information, explainable eligibility rules evaluation, like-for-like product comparisons, and deterministic scenario analysis (amortization schedules, LTV, affordability, early repayment, and refinancing) for real-estate purchases and developments.

### Important Invariants & Non-Ownership:
- **No Lending or Underwriting**: This module is strictly analytical and informative. It does NOT approve loans, issue credit, evaluate credit scores, or make binding offers.
- **No Direct Bank/Account Access**: Does NOT access personal bank accounts or credit bureau records.
- **Deterministic Calculations**: All financial calculations (Annuity, Linear German amortization, Interest-Only) adhere to versioned, documented formulas (`v1.4.0-deterministic`).
- **Explainable Eligibility**: Distinguishes published rule criteria matching from actual lender underwriting. Discloses unmet criteria with sources.
- **Data Provenance & Freshness**: Distinguishes verified institutions/products from unverified data; flags stale products exceeding 180 days.
- **Zero Modifications Outside Module**: Fully decoupled via adapter interfaces in `contracts.ts`.

## 2. Calculation Methodologies
1. **Equal Installments (Annuity / French Amortization)**:
   $$M = P \cdot \frac{r(1+r)^n}{(1+r)^n - 1}$$
2. **Equal Principal (Linear / German Amortization)**:
   $$PrincipalComponent = \frac{P}{n}, \quad MonthlyPayment = PrincipalComponent + (RemainingPrincipal \cdot r)$$
3. **Debt-To-Income (DTI) & Affordability**:
   $$ProjectedDTI = \frac{ExistingDebt + MonthlyInstallment}{NetIncome} \times 100$$
4. **Loan-To-Value (LTV)**:
   $$LTV = \frac{FinancingAmount}{PropertyValue} \times 100$$

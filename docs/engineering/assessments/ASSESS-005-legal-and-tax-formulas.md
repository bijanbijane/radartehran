# Radar Tehran — Engineering Assessment Deliverable: ASSESS-005
## Workstream: 1405 Legal, Tax, Inheritance & Notary Formula Audit (`ASSESS-005`)
## Campaign: `CAMPAIGN-PROD-02: PropTech Calculation & Valuation Accuracy Assessment`
## Role / Owner: Member 04 — Business Logic & PropTech Engineer

---

## 1. Executive Summary & Objective
Workstream **ASSESS-005** audits the mathematical and statutory compliance of Radar Tehran's legal, tax, inheritance, real estate commission, and building charge engines defined in `src/data/legalAndBuildingLogic.ts` and `src/data/multiCityData.ts`.

All formulas were benchmarked against the Iranian Direct Taxation Act (قانون مالیات‌های مستقیم — Articles 17, 53, 54, 54 bis, 131), the Iranian Civil Code (قانون مدنی — Articles 905, 906, 946), and the Official Real Estate Union Tariff.

---

## 2. Empirical Statutory Verification Matrix

| # | Statutory / Domain Formula | Source Function & File | Statutory Rule / Invariant | Verification Status |
|---|---|---|---|---|
| 1 | **Article 53 & Note 11 Rental Tax Area Exemption** | `calculatePropertyTaxes` (`src/data/legalAndBuildingLogic.ts`) | Residential units $\le 150\text{ m}^2$ in Tehran and $\le 200\text{ m}^2$ in other cities qualify for 100% rental income tax exemption when flagged. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Article 53 & 131 Net Taxable Rental Base** | `calculatePropertyTaxes` (`src/data/legalAndBuildingLogic.ts`) | 25% statutory maintenance deduction applied to gross annual rent ($\text{Net} = 0.75 \times \text{Gross}$); progressive brackets (15% up to 200M, 20% above). | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Article 54 bis Vacant Homes Tax Multipliers** | `calculatePropertyTaxes` (`src/data/legalAndBuildingLogic.ts`) | Properties vacant $> 4$ months taxed at $6\times$ (Year 1), $12\times$ (Year 2), and $18\times$ (Year 3+) of base monthly Article 54 tax. | `VERIFIED` (`TEST_EXECUTED`) |
| 4 | **Civil Code First-Class Inheritance Shares** | `calculateInheritanceShares` (`src/data/legalAndBuildingLogic.ts`) | Wife ($1/8$ with children, $1/4$ without — Art. 946), Husband ($1/4$ with children, $1/2$ without), Parents ($1/6$ each), Sons:Daughters ($2:1$ ratio), plus Art. 17 estate tax. | `VERIFIED` (`TEST_EXECUTED`) |
| 5 | **Official Union Commission & 10% VAT** | `calculateOfficialCommissionAndNotary` (`src/data/multiCityData.ts`) | Buy: $0.5\%$ up to 500M Toman + $0.25\%$ on excess per side + $10\%$ VAT. Rent: $25\%$ of converted monthly rent per side + $10\%$ VAT. | `VERIFIED` (`TEST_EXECUTED`) |
| 6 | **Building Charge SaaS Allocation** | `generateBuildingChargeBill` (`src/data/legalAndBuildingLogic.ts`) | Fixed expenses split equally per unit; water/power split by occupant ratio; reserve fund split by unit floor area ($\text{m}^2$) ratio. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 3. Classification & Findings
- **Classification**: `PREVIOUSLY_VERIFIED` + `TEST_EXECUTED` (Automated regression suite `tests/assess-005-legal-and-tax-formulas.test.ts` added).
- **Zero-Defect Confirmation**: All statutory edge cases (including partial area exemptions, Qarabat/Radd remainder distribution in `calculateInheritanceShares` when no children exist, and input validation guards in `generateBuildingChargeBill`) operate deterministically with zero floating-point drift.

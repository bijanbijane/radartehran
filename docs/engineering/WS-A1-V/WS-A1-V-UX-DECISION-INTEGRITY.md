# WS-A1-V — Deliverable 11: User Decision Quality, Cognitive Framing & Information Design Audit

**Workstream ID:** `WS-A1-V` (Section 23 & Section 26 Deliverable 11)  
**Inspected Views:** `NeighborhoodInspectorDrawer.tsx`, `NeighborhoodInspectorTabs.tsx`, `ProductIntelligenceView.tsx`, `CompareModal.tsx`, `HedonicValuationResultsColumn.tsx`, `MapLegend.tsx`, `OnboardingWizardModal.tsx`  
**Live Browser Evidence (`E1`):** Headless Chromium via `playwright-cli` at `http://localhost:3000/?hood=5&compare=5-14` and `http://localhost:3000/?hood=5&view=intelligence`  
**Methodological Discipline:** Every finding below strictly separates **(A) Directly Observed Interface Behavior**, **(B) Research-Grounded Psychological Interpretation**, and **(C) Unvalidated Design Hypotheses**. No psychological trait, emotional state, or financial vulnerability of any user is inferred.

---

## 1. Epistemic Communication Matrix (What the Interface Communicates vs. Conceals)

| Epistemic Dimension | Inspector Drawer & Market Tab (`NeighborhoodInspectorDrawer.tsx`, `NeighborhoodInspectorTabs.tsx`) | Product Intelligence View (`ProductIntelligenceView.tsx`) | Compare Modal (`CompareModal.tsx`) | Hedonic Calculator (`HedonicValuationResultsColumn.tsx`) |
|---|---|---|---|---|
| **What is known (Observed)** | Displays `observedSampleCount` (`۲ آگهی` for Punak) and `observedMedianPerSqm` (`۱۴۱ م.ت`). | **Misreports `۰ آگهی مستقیم`** because line 47 passes `[]` (`F-A1V-04`). | **Misreports `۰ آگهی`** because line 8 passes `[]` (`F-A1V-04`). | Displays user-supplied property attributes and neighborhood baseline `buyPerSqm`. |
| **What is estimated** | Explicitly labels `تخمین ترکیبی` and `برآورد سناریوی مذاکره (فرضی - غیرمعاملاتی)`. | Labels heuristic deal estimate as **`تخمین قیمت قطعی معاملات (مدل v6.4)`** (`line 65`) and **`جایگاه معامله قطعی`** (`line 191`). | Labels baseline as `پروفایل مرجع (۰ آگهی)`. | Labels output as hedonic model estimate (`v2.4.0`). |
| **What is uncertain** | Labels `۵۲/۱۰۰` as `شاخص پوشش شواهد (غیر احتمالاتی)` and states `فاصله اطمینان کالیبره‌شده آماری نیست`. | Displays `بازه معتبر آماری محله (IQR): 131.3 تا 154.3 م.ت` (computed from 12 PRNG rows!). | Does not display uncertainty intervals per neighborhood row. | Displays `دامنه حساسیت (±۳.۵٪)` and notes it is not a statistical confidence interval. |
| **What is missing** | States when `observedSampleCount === 0` (`پروفایل مرجع (بدون نمونه مشاهده‌شده)`). | Fails to disclose that `hood.bargains` were omitted by the view's `[]` call; fails to disclose when `iqrLowPerSqm` is synthetic. | Fails to disclose that `hood.bargains` were omitted by the modal's `[]` call. | Does not warn when invalid inputs (`sqm <= 0`) are clamped to `30m²`. |
| **What the model cannot establish** | Explicitly warns that no official transaction registry feed (کد رهگیری / ثبت املاک) is connected (`NeighborhoodInspectorTabs.tsx:216`). | **Conceals** the absence of transaction registry data behind `تخمین قیمت قطعی معاملات` and `همگرایی قیمت اعلامی با نرخ معامله`. | Does not state that scores are weighted heuristics rather than empirical returns. | Clearly states that extreme asking-price deviation (`> 35%`) is a statistical outlier and requires physical/legal verification (`hedonicPricingEngine.ts:251-256`). |

---

## 2. Cognitive & Decision-Integrity Findings (Structured by A / B / C)

### Concern 1: Authoritative Closing-Transaction Framing in `ProductIntelligenceView.tsx` (`F-A1V-04`)
- **A. Directly Observed Interface Behavior (`E1`, `E2`):**
  - In `src/components/views/ProductIntelligenceView.tsx`:
    - Line 65 renders: `تخمین قیمت قطعی معاملات (مدل v6.4)` (`Estimated Definitive Transaction Price (Model v6.4)`) above `hoodMetrics.estimatedDealPricePerSqm` (`130.6 میلیون تومان`) in an emerald-highlighted card (`bg-emerald-500/5 border-emerald-500/20`).
    - Line 116 renders: `همگرایی قیمت اعلامی با نرخ معامله` (`Convergence of Asking Price with Transaction Rate`).
    - Line 191 renders: `جایگاه معامله قطعی: صدک 56 محله` (`Definitive Transaction Position: 56th Percentile of Neighborhood`).
  - In reality (`src/data/realMarketPriceAggregator.ts:270`), `estimatedDealPricePerSqm` is simply `dayAnchorPrice * 0.93` (a hardcoded `7%` discount assumption off a static asking-price anchor).
- **B. Research-Grounded Psychological Interpretation:**
  - **Anchoring and Insufficient Adjustment (Tversky & Kahneman, 1974):** Presenting a specific one-decimal-place number (`130.6 میلیون تومان`) labeled as the "Definitive Transaction Price (`قیمت قطعی معاملات`)" establishes a potent numerical anchor for buyer/seller negotiations, even when the underlying number is a static asking baseline multiplied by `0.93`.
  - **Automation Bias & Over-Reliance (Parasuraman & Manzey, 2010; Lee & See, 2004):** Pairing authoritative institutional terminology (`قیمت قطعی معاملات`, `صدک 56 محله`, `مدل v6.4`) with green semantic styling (`emerald-400`) signals high algorithmic certainty where zero empirical transaction data exists.
- **C. Unvalidated Design Hypothesis:**
  - *Hypothesis (Not Measured in RADAR):* Users viewing `ProductIntelligenceView` may anchor their negotiation offers more aggressively around `130.6 م.ت` than users viewing the yellow-disclaimed `برآورد سناریوی مذاکره (فرضی - غیرمعاملاتی)` in `NeighborhoodInspectorTabs`. Validating this requires a controlled comprehension study.

---

### Concern 2: Cross-Component Provenance Contradiction on the Same Screen (`F-A1V-04`)
- **A. Directly Observed Interface Behavior (`E1`, `E2`):**
  - When viewing `http://localhost:3000/?hood=5&compare=5-14` or `?hood=5&view=intelligence`, the user sees two contradictory provenance statements for Punak (`پونک`) simultaneously:
    - `NeighborhoodInspectorDrawer.tsx` (lines 87–95): `منشا داده: تخمین ترکیبی (نمونه محدود: ۲ آگهی)` and `شاخص پوشش شواهد: ۵۲/۱۰۰ (پوشش محدود)`.
    - `ProductIntelligenceView.tsx` (line 53) and `CompareModal.tsx` (line 80): `منشا داده: پروفایل مرجع (۰ آگهی مستقیم)` / `پروفایل مرجع (۰ آگهی)`.
- **B. Research-Grounded Psychological Interpretation:**
  - **Trust Calibration Breakdown (Lee & See, 2004; Hoff & Bashir, 2015):** Internal inconsistency between two panels of the same analytical system undermines perceived system integrity and forces extraneous cognitive load (Sweller, 1988) as the user attempts to reconcile why the same neighborhood has `2` observed listings in one panel and `0` in another.
- **C. Unvalidated Design Hypothesis:**
  - *Hypothesis:* Resolving the `[]` bug so all views report identical sample counts (`۲ آگهی`) will improve user comprehension of data coverage without increasing perceived complexity.

---

### Concern 3: Synthetic PRNG Bounds Displayed as Statistical IQR (`F-A1V-03`)
- **A. Directly Observed Interface Behavior (`E1`, `E2`):**
  - When `observedSampleCount < 3` (which holds for **all** neighborhoods in `ProductIntelligenceView` due to `[]`, and for Punak in `NeighborhoodInspectorTabs` which has `2` listings), `agg.observedIqrLowPerSqm` is `null`, but both `NeighborhoodInspectorTabs.tsx:201` (`بازه منطقی محله: ۱۳۱.۳ – ۱۵۴.۳ م.ت`) and `ProductIntelligenceView.tsx:182` (`بازه معتبر آماری محله (IQR): 131.3 تا 154.3 م.ت`) display `agg.iqrLowPerSqm` and `agg.iqrHighPerSqm`, which are computed from 12 Mulberry32 PRNG synthetic samples!
- **B. Research-Grounded Psychological Interpretation:**
  - **Illusion of Validity & False Precision (Kahneman & Tversky, 1973):** Displaying exact decimal bounds (`131.3 تا 154.3 م.ت`) labeled as a "Valid Statistical Interquartile Range (`بازه معتبر آماری محله (IQR)`)" when fewer than 3 observations exist misleads decision-makers into believing the dispersion of the neighborhood market has been empirically measured.
- **C. Unvalidated Design Hypothesis:**
  - *Hypothesis:* Replacing synthetic IQR numbers with an explicit `"محاسبه بازه چارکی نیازمند حداقل ۳ نمونه مشاهده‌شده است"` state when `observedSampleCount < 3` will prevent false-precision anchoring.

---

## 3. Comparison Integrity & Decision Autonomy (Sections 23.1 & 23.2)

- **Comparison Integrity (`CompareModal.tsx`):**
  - Uses consistent definitions across columns (`buyPerSqm`, `rahn80m`, `growth6m`, `transitScore`, `liquidityScore`, `riskScore`).
  - **Defect (`F-A1V-04`):** Because `CompareModal.tsx:8` passes `[]` to `aggregateNeighborhoodMarketMetrics`, every neighborhood in the comparison table displays `پروفایل مرجع (۰ آگهی)`, concealing real differences in observed sample coverage between neighborhoods.
- **Decision Autonomy:**
  - The interface supports user-directed exploration (switching neighborhoods, adjusting hedonic parameters, toggling comparison items, inspecting factor breakdowns) and avoids dark patterns (no fake countdown timers, no fabricated "X people are viewing this property" scarcity prompts, no psychological profiling of the user).
  - **Remaining Autonomy Gap (Deferred to `WS-B` / `WP-3`):** In `useEvaluatedNeighborhoods.ts` and `MapLegend.tsx`, budget-fit status and overall neighborhood quality remain combined under `optimal` (`ارزنده‌ترین (تطابق کامل)`) vs `overpriced` (`خارج از بودجه`), and onboarding controls in `OnboardingWizardModal.tsx` remain to be decoupled in `WS-B`.

---

## 4. Accessibility & Comprehension Verification

- **RTL & Typography:** Verified in headless Chromium (`E1`); Persian numerals (`toPersianDigits`) are used consistently in `NeighborhoodInspectorDrawer.tsx` and `NeighborhoodInspectorTabs.tsx`, while `ProductIntelligenceView.tsx:182, 191` mixes Latin digits (`131.3`, `154.3`, `56`) inside Persian sentences (`بازه معتبر آماری محله (IQR): 131.3 تا 154.3 م.ت`).
- **Recommendations for Future User Research:**
  1. Conduct comprehension testing on whether non-technical homebuyers and real-estate agents understand the distinction between `شاخص پوشش شواهد (غیر احتمالاتی)` (`52/100`) and a statistical probability of accuracy.
  2. Test whether displaying `"بدون نمونه کافی برای محاسبه IQR"` when `N < 3` improves decision calibration compared to displaying baseline tolerance bands.

# 04 — `ASSESS-003`: First-Time Onboarding & Cognitive Friction

- **Workstream ID**: `ASSESS-003`
- **Canonical Evaluation Persona**:
  - **User Profile**: First-time home buyer (`خریدار بار اول`)
  - **Cash Savings (`نقدینگی اولیه`)**: **3.5 Billion Toman (`3,500` Million Toman)**
  - **Target Area (`متراژ هدف`)**: **~75 m²** (`46.67M Toman/m²` baseline cash purchasing power; up to `~5.45B` / `72.67M Toman/m²` when combining `+1.2B` mortgage and `~750M` tenant *rahn*)
  - **Target Geography**: **Tehran or Karaj (`تهران یا کرج`)**
  - **Transaction Mode**: **Buy (`خرید`)**
- **Primary Inspected Files**:
  - `src/components/OnboardingWizardModal.tsx` (267 lines)
  - `src/components/ExpansionModulesModal.tsx` (`reverse_budget` section, lines 50–156)
  - `src/components/SmartSuggestModal.tsx` (135 lines)
  - `src/components/views/ProductHomeView.tsx` (242 lines)
  - `src/components/views/ProductDiscoverView.tsx` (235 lines)
  - `src/components/listing/BudgetFitVerdict.tsx` (104 lines)
  - `src/components/listing/ListingVerdictHero.tsx` (122 lines)
  - `src/components/useAppUiState.ts` (128 lines)
  - `src/components/useAppUrlAndTitleSync.ts` (141 lines)
  - `src/components/useEvaluatedNeighborhoods.ts` (145 lines)

---

## 1. End-to-End Walkthrough of the Canonical Persona (`3.5B Toman`, `75m²`, `Buy`, `Tehran/Karaj`)

### Stage 1: Cold Landing (`http://localhost:3000/`) — Hostile Default State (`REPRODUCED_PROBLEM` | `INTERACTION_TESTED`)
1. **Onboarding Modal Never Opens Automatically**:
   - In `src/components/useAppUiState.ts` (`line 60`), `const [showOnboardingModal, setShowOnboardingModal] = useState(false);`.
   - In `src/components/OnboardingWizardModal.tsx` (`line 76`), `localStorage.setItem('tehran_radar_onboarded_v1', 'true')` is written when the user finishes or skips the wizard, **but `tehran_radar_onboarded_v1` is never read anywhere in the codebase on initial mount!**
2. **Default Parameters Contradict First-Time Buyer Reality**:
   - `primaryView` defaults to `'map'` (`useAppUiState.ts:84`).
   - `mode` defaults to `'rent'` (`deposit = 2800`M [2.8B Toman], `monthlyRent = 45`M).
   - `buyTotalBudget` defaults to **`24500`M (`24.5 Billion Toman`)** (`useAppUiState.ts:46`), which is **700% (`7×`) higher** than our canonical persona's `3.5B` Toman budget!
   - `selectedHoodId` defaults to `5` (`پونک` — `165M/m²`, `12.375B` for `75m²`).

### Stage 2: Attempting to Enter `3.5B Toman` & `75m²` — Four Competing Budget Entry Surfaces (`REPRODUCED_PROBLEM` | `INTERACTION_TESTED`)

Depending on which button the user taps first, they encounter one of **four different budget configuration UIs** with conflicting capabilities:

| Feature / Capability | Surface A: `OnboardingWizardModal.tsx` | Surface B: `ExpansionModulesModal.tsx` (`reverse_budget`) | Surface C: `FloatingTopBar.tsx` Budget Popover | Surface D: `SmartSuggestModal.tsx` |
| :--- | :--- | :--- | :--- | :--- |
| **Trigger Location** | `ProductHomeView` ("با بودجه من کجا؟") & `ProductDiscoverView` ("راهنمای گام‌به‌گام تطبیق بودجه") | `ProductGlobalHeader` calculator icon (`محاسبه با بودجه معکوس`) & `ProductToolsView` | `FloatingTopBar` on Map view (`بودجه: ...`) | `FloatingTopBar` (`پیشنهاد هوشمند`) |
| **UI Structure** | 3-Step Wizard (`هدف و متراژ` -> `تنظیم بودجه` -> `سبک زندگی`) | Single-page modal (`پیشنهاد هوشمند محله بر اساس بودجه`) | Compact floating popover over map | Recommendation modal with 4 sort tabs |
| **Buy Budget Input Range** | `500`M to `150,000`M (step `100`M) | `1,000`M to `50,000`M (step `500`M) | `1,500`M to `45,000`M (step `500`M) | **None** (cannot edit budget inside modal!) |
| **Quick Buy Presets** | `5B`, `10B`, `20B` (**No `3.5B` preset!**) | `5B`, `8B`, `12B`, `20B` (**No `3.5B` preset!**) | None | None |
| **Mortgage Booster (`وام مسکن +۱.۲ میلیارد`)** | **Yes** (`useLoanBooster`) | **Missing** | **Yes** (`وام مسکن (+۱.۲B)`) | **Missing** |
| **Tenant Rahn Booster (`قابلیت رهن واحد`)** | **Yes** (`useRahnBooster`, `+15%`) | **Missing** | **Yes** (`رهن مستأجر`) | **Missing** |
| **Building Age Multiplier (`سن بنای هدف`)** | **Yes** (Step 1: `نوساز 1.15x`, `میان‌سال 1.0x`, `قدیمی‌ساز 0.85x`) | **Missing** | **Missing** | **Missing** |
| **City Switcher (`تهران / کرج / ...`)** | **Missing** | **Missing** | Separate `<select>` outside popover | **Missing** |

**Cognitive Friction Impact**:
- A user who clicks the calculator icon in the top header (`محاسبه با بودجه معکوس`) opens `ExpansionModulesModal` (`reverse_budget`, `.playwright-cli/assess003-mobile-390x844-onboarding-step1.png`), where **the lowest preset button is `5 میلیارد`**, there are **no Mortgage (`وام`) or Tenant Rahn (`رهن مستأجر`) toggles**, and there is **no Building Age (`قدیمی‌ساز -۱۵٪`) selector**.
- With `3,500M` cash alone (`46.67M/m²` for `75m²`), `reverse_budget` shows `0` core Tehran neighborhoods and only distant satellite/county towns (`پرند`, `پیشوا`, `رباط‌کریم`). Yet if the user had opened `OnboardingWizardModal` instead and enabled `وام مسکن (+۱.۲B)` + `رهن مستأجر (+۱۵٪)` + `قدیمی‌ساز (۰.۸۵×)`, their effective purchasing power would rise to **`~64.3M/m²` (`~4.82B` effective on older stock)**, unlocking multiple southern Tehran and prime Karaj neighborhoods!

---

### Stage 3: Evaluating Results on `ProductHomeView` (`/?view=home&city=tehran&mode=buy&buy=3500&sqm=75`) — Contradictory Verdicts & Semantic Color Inversion (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)

When our canonical buyer visits `خانه` (`ProductHomeView`, `.playwright-cli/assess003-mobile-390x844-home-view.png`) with `mode=buy`, `buy=3500`, `sqm=75`:

1. **Contradiction Between Map/Filter Engine (`5` Matches) and `BudgetFitVerdict.tsx` (`0` Matches)**:
   - `useEvaluatedNeighborhoods.ts` evaluates all `86` Tehran Province areas and reports **`5` affordable (`green`) areas** (`شهر جدید پرند` at `42M/m²` = `3.15B`, `پیشوا و فیروزکوه` at `46M/m²` = `3.45B`, plus `پاکدشت`, `رباط‌کریم`, `شهریار و اندیشه`).
   - Directly below on `ProductHomeView`, `BudgetFitVerdict.tsx` calls `buildBudgetFitVerdict()`, which only evaluates a hardcoded subset of `20` central Tehran neighborhoods (`پونک`, `نواب`, `جمهوری`, `پیروزی`, etc.).
   - Consequently, `BudgetFitVerdict.tsx` displays the header `"محله‌های متناسب با بودجه شما"` (`20 محله بررسی شد`) followed by three cards (`نواب: ۱۰.۸۷۵ میلیارد`, `جمهوری: ۱۵ میلیارد`, `پیروزی: ۱۷.۶۲۵ میلیارد`)—every single one of which is **3× to 5× over the user's `3.5B` budget**!

2. **Semantic Color Inversion Bug in `BudgetFitVerdict.tsx` (`line 57`)**:
   - Inspecting `src/components/listing/BudgetFitVerdict.tsx` (`lines 55–59`):
     ```tsx
     <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
       {item.fitLabel}
     </span>
     ```
   - Because the badge hardcodes `bg-emerald-100 text-emerald-800` regardless of `item.fitLabel`, the negative verdict **`"جا نمی‌شود"` (Does Not Fit)** is rendered inside a **bright emerald-green success pill** on all three unaffordable cards!

3. **Un-synchronized Quick Scopes on `ProductHomeView` (`lines 25–30`)**:
   - `ProductHomeView` renders 4 quick budget chips at the top (`تا ۵ میلیارد`, `۵ تا ۸ میلیارد`, `۸ تا ۱۲ میلیارد`, `بالای ۱۲ میلیارد`).
   - Clicking `تا ۵ میلیارد` updates local component state `selectedBudgetScope` (which only changes the 3 static neighborhood names inside `QUICK_SCOPES`), **without updating `buyTotalBudget` in global app state**! Thus, clicking `تا ۵ میلیارد` while `buyTotalBudget` is `24,500M` (or `3,500M`) leaves `ListingVerdictHero` and `BudgetFitVerdict` out of sync with the selected chip.

---

### Stage 4: Discovering the `Karaj` (`کرج`) Alternative (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)

- Our persona is open to **Tehran or Karaj (`تهران یا کرج`)**.
- In `Tehran`, `3,500M` cash for `75m²` (`46.67M/m²`) matches `0` core city neighborhoods (`5` distant county towns).
- When switching `activeCity` to `karaj` (`/?view=map&city=karaj&mode=buy&buy=3500&sqm=75`, `.playwright-cli/assess003-karaj-390x844-map.png`), **`7` neighborhoods in Karaj match immediately** (`filterBadgeText: "7"`, `green: 3`, `yellow: 4`).
- **Friction**: Neither `OnboardingWizardModal`, `ExpansionModulesModal (reverse_budget)`, nor `BudgetFitVerdict` detects when a user's budget (`<= 5B` Toman) yields sparse results in central Tehran and offers a **1-tap Cross-City Affordability Bridge to Karaj (`کرج / البرز`)**. The user must manually locate the small `<select>` dropdown in `ProductGlobalHeader` and switch from `تهران` to `کرج`.

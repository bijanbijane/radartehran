# Radar Tehran Design Studio — Unified Purchasing-Power Onboarding
**Date:** 2026-11-27  
**Repository:** `bijanbijane/radartehran`  
**Baseline:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Design branch:** `design/mobile-neighborhood-inspector-2026-11-27`  
**Status:** UX architecture and handoff complete; no frontend implementation performed.

## 1. Objective
Create one canonical, cross-view workflow for people trying to find a neighborhood that fits their actual buying or renting constraints. It must work from Home, Discover, and Map without opening four different budget experiences with different capabilities.

Primary user outcome: **enter goal, area, budget, financial levers, city, and commute context once; receive a transparent set of matching neighborhoods and actionable alternatives.**

Canonical evaluation persona from the existing assessment: first-time buyer, 3.5B Toman cash, 75m² target, open to Tehran or Karaj. These values are a test persona, not assumed defaults for every user.

## 2. Evidence inspected
- `src/components/OnboardingWizardModal.tsx`
- `src/components/listing/BudgetFitVerdict.tsx`
- `src/components/useAppUiState.ts`
- `src/components/RadarWorkspaceShell.tsx`
- `src/components/useAppPersistenceAndDerivedState.ts`
- `src/data/neighborhoodListingSamples.ts`
- `docs/product-assessment/CAMPAIGN-PROD-01/04-assess-003-onboarding-friction.md`
- `docs/product-assessment/CAMPAIGN-PROD-01/06-proposed-design-blueprint.md`

## 3. Reconciliation: old assessment vs current source
The 2026-11-01 assessment contains several findings that are no longer accurate in the current `main` source:
1. The wizard already has 3.5B Toman among its quick presets (`2500, 3500, 5000, 10000, 20000` million).
2. The wizard already includes Buy/Rent, target area, building-age selection, housing-loan toggle, tenant-rahn deduction toggle, and a live effective purchasing-power figure.
3. `BudgetFitVerdict` already uses distinct emerald/amber/rose badge styles according to `line.fit`; the old semantic-color inversion finding is fixed.
4. `BudgetFitVerdict` already renders an affordability-bridge message when every returned line is over budget.
5. The onboarding completion flag is read by `useAppPersistenceAndDerivedState`, but the effect only opens the wizard when the URL explicitly contains `onboarding=1`. It does not automatically offer first-use onboarding on an ordinary first visit.

The following issues remain visible in current source:
- `showOnboardingModal` initializes to `false` in `useAppUiState`; first-time visitors are not automatically offered a contextual quick-start.
- The initial buy budget in `RadarWorkspaceShell` remains 24,500 million unless URL state overrides it; default mode remains rent.
- The wizard has no explicit city-selection control in its props or three-step UI; it receives only the currently evaluated neighborhood list.
- The wizard's results are ranked from the active `evaluatedNeighborhoods`; cross-city discovery is not a first-class step in this workflow.
- The budget verdict's Tehran path still calls the dated Tehran reference-table helper; the bridge copy suggests suburbs and Karaj but does not provide a direct, data-driven city-switch action.
- Building age, affordability levers, and recommendation scoring need a clear contract. A selected age segment must not silently be treated as additional cash.

## 4. Selected experience: one canonical engine, three entry points
All entry points should invoke the same canonical state and component:
- Home: “با بودجه من کجا؟”
- Discover: “تطبیق محله با بودجه”
- Map: “بودجه و فیلترها” / “یافتن محله با بودجه من”

These entry points may open in different presentation modes (quick inline summary, full wizard, or compact map filter), but they must share one validated state model and the same evaluation results. Do not maintain separate local budget values per surface.

## 5. Three-step flow
### Step 1 — هدف، شهر و متراژ
- Goal: خرید / رهن و اجاره.
- Geography: primary city plus optional nearby/alternative cities. Start with the currently selected city preselected.
- Target area: numeric field plus slider; retain the existing 30–400m² range unless domain validation says otherwise.
- Building age preference: نوساز / میان‌سال / قدیمی‌ساز. Explain that this changes the estimated property cost or rent scenario, not the user's cash balance.
- Keep the step short; use progressive disclosure for secondary preferences.

### Step 2 — بودجه و اهرم‌های مالی
**Buy mode**
- Cash budget with editable numeric field and slider.
- Preserve useful presets already in source, including 2.5B and 3.5B.
- Optional mortgage booster (+1.2B) with explicit eligibility/assumption disclosure.
- Optional tenant-deposit deduction, with a clear formula and explanation of what the toggle changes.
- Show a transparent calculation:
  - cash budget
  - assumed mortgage amount
  - tenant-rahn contribution/adjustment
  - resulting effective financial ceiling
- Do not add building-age discounts to cash purchasing power. Show age-adjusted estimated property price separately.

**Rent mode**
- Available deposit.
- Monthly rent ceiling.
- Show full-rahn equivalent and the conversion assumption (3%) as a visible, editable/explainable assumption rather than hidden arithmetic.

### Step 3 — رفت‌وآمد و نتیجه
- Optional work/commute hub.
- Show the number of matching neighborhoods and explain what “match” means.
- Present a small ranked list with:
  - neighborhood and city
  - fit status (fits / near limit / over)
  - estimated total price or deposit/rent basis
  - distance or commute context when available
  - data provenance and recency
  - one clear “مشاهده روی نقشه” action
- Allow selecting a result and closing the wizard into the map with that neighborhood selected.
- If there are no matches in the primary city, show a cross-city / provincial bridge using the actual evaluation results, not hardcoded example counts.

## 6. Affordability bridge interaction
When the active city returns zero or very few matching neighborhoods:
1. Explain the constraint in neutral language; do not imply the user has made a mistake.
2. Offer dynamically computed alternatives:
   - adjust target area;
   - enable eligible financial levers;
   - inspect nearby provincial areas;
   - compare another supported city such as Karaj.
3. Each option must be actionable and update the shared state before recalculating.
4. Show the resulting count and list after recalculation.
5. Never state that a neighborhood fits unless the current evaluation engine confirms it for the exact budget, area, mode, and selected assumptions.

The existing amber bridge paragraph in `BudgetFitVerdict` is a useful starting point, but static copy is not a substitute for a live action flow.

## 7. First-visit and returning-user behavior
- First visit: show a non-blocking quick-start prompt, not an unavoidable modal. Let the user dismiss it or launch the full wizard.
- Returning user: restore saved preferences only when the user has opted to save them; provide a visible “ویرایش بودجه و ترجیحات” action.
- URL parameters: explicit query values must take precedence over defaults and must not be overwritten by first-use onboarding.
- Do not silently replace existing user budgets with a new default. A new default is a product decision requiring separate validation; keep the current value unchanged until that decision is approved.
- Persist the completion state and preference state separately. “Wizard seen” is not the same as “preferences saved.”

## 8. Visual and interaction specification
- Reuse existing Vazirmatn and current design tokens.
- On mobile, use a full-height bottom sheet or focused full-screen flow with sticky progress and footer actions; avoid a desktop modal simply compressed to 320px.
- Keep one primary action per step and a clear Back action.
- Use compact input groups with explicit units; numeric values must use tabular numerals and bidi isolation.
- Minimum touch target: 44×44px for mode cards, toggles, presets, and navigation actions.
- Keep the result summary sticky or easily reachable; do not force users to scroll back to edit budget.
- Use emerald only for confirmed budget fit, amber for near-limit/conditional fit, and rose for over-budget. Pair every color with explicit text.
- Dark mode, keyboard, focus restoration, Escape behavior, and RTL must remain consistent with the existing dialog system.

## 9. Independent design critique
| Severity | Finding | Required correction |
|---|---|---|
| Critical | Four different entry points can still drift if they own separate state. | One shared canonical state/evaluation contract; presentation wrappers only. |
| Critical | A city switch without reevaluation can show stale results. | Every city/area/budget/leverage change must invalidate and recompute the result set. |
| High | Building age could be misrepresented as extra financial capacity. | Separate buyer funds from property-cost adjustments in both math and UI. |
| High | The current wizard has no explicit city selection. | Add primary/alternative geography selection and return selected neighborhood with city identity. |
| High | Existing affordability bridge is descriptive rather than actionable. | Replace static suggestion copy with real state-changing actions and verified updated counts. |
| Medium | First-use modal auto-launch can interrupt users. | Non-blocking prompt with explicit launch and dismiss actions. |
| Medium | A 3-step wizard can become too dense if all levers are exposed simultaneously. | Progressive disclosure and mode-specific controls; retain a visible calculation summary. |

**Decision:** accept the three-step shared workflow. Do not change default budget values or automatically force a modal until product analytics and owner approval establish the intended default and first-use policy.

## 10. Acceptance criteria
- [ ] Home, Discover, and Map open the same budget/goal state.
- [ ] No duplicate or divergent budget state exists between entry points.
- [ ] Explicit URL parameters override onboarding defaults.
- [ ] First-use prompt is non-blocking; returning-user behavior is deterministic.
- [ ] City and alternative-city selection trigger fresh evaluation.
- [ ] Buy and rent formulas are visible and auditable.
- [ ] Building-age adjustments are separate from available cash.
- [ ] Every result has a clear fit status and honest data provenance.
- [ ] The affordability bridge offers real actions, not static suggestions.
- [ ] A selected result opens the correct city/neighborhood on the map.
- [ ] 320×568, 390×844, tablet, desktop, RTL, dark mode, keyboard, and screen-reader checks pass.
- [ ] Lint, architecture checks, focused contract tests, and production build pass.

## 11. Next action
Create an interaction prototype for the three-step flow, then map all existing budget entry points and callbacks to the canonical state contract. Keep this as a design-first change; do not modify app code or financial algorithms until the owner explicitly authorizes implementation.

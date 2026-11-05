# Workstream ASSESS-002: Information Density & Drawer Architecture Audit

- **Campaign**: `CAMPAIGN-PROD-01` (Usability, Ergonomics & Mobile UX Assessment)
- **Workstream ID**: `ASSESS-002`
- **Lead Role**: Member 06 — Frontend & Product Experience Engineer
- **Status**: `VERIFIED`
- **Execution Date**: 2026-11-01

---

## 1. Executive Summary & Objective

Workstream `ASSESS-002` audits and refines the information architecture and visual density of the neighborhood inspector drawer (`src/components/NeighborhoodInspectorDrawer.tsx` and `src/components/NeighborhoodInspectorTabs.tsx`).

Prior to this workstream, secondary analytical cards (including `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart`) were rendered statically at the root of the drawer below all tabs. This forced users browsing non-market tabs (such as "فایل‌های زیر قیمت" [Bargains] and "امکانات و رای" [Votes/Amenities]) to scroll through over 800px of redundant price forecasting and historical bar charts, causing cognitive overload and visual fatigue.

---

## 2. Architectural Refinements Applied

1. **Context-Aware Secondary Analytics**:
   - `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart` are now contextually scoped to the "بازار و نمودار" (`market`) tab.
   - When users inspect market trends, they receive the full deep analytical suite: 6-month price trend, bubble indicator, purchasing power trend, monthly price bar points, future price forecast, and loan/deposit calculators.
2. **Context-Aware Neighborhood Photo Gallery**:
   - `NeighborhoodPhotoGallery` is conditionally rendered during "کارنامه و ترافیک" (`scorecard`) and "امکانات و رای" (`vote`), keeping landmark photos aligned with physical infrastructure and neighborhood character.
   - Prevents generic neighborhood landmark photos from cluttering property-specific photos inside the "فایل‌های زیر قیمت" (`bargains`) tab.
3. **Above-the-Fold Preservation**:
   - Preserves `anatomyTabsRef` above all secondary analytical cards on both mobile and desktop viewports, fully satisfying the `tests/buyer-alert-contract.test.ts` structural contract.
4. **Strict File Boundary Compliance**:
   - `src/components/NeighborhoodInspectorDrawer.tsx` compacted from 487 lines to 485 lines (comfortably below the 500-line ceiling mandated by `AGENTS.md`).

---

## 3. Verification & Evidence Citations

- **`tests/buyer-alert-contract.test.ts`**: PASS (`tabsIndex > 0 && forecastIndex > tabsIndex`).
- **`npm run lint`**: PASS (0 TypeScript errors).
- **`npm run arch:check`**: PASS (0 architectural violations).
- **`compile_applet`**: PASS (`Build succeeded - the applet is compiled`).

# RADAR TEHRAN — NIPS Neighborhood Profile UX Package

- Package ID: `RT-DESIGN-NIPS-PROFILE-001`
- Date: 2026-11-27
- Status: **Design handoff prepared; frontend implementation not started**
- Target: Existing neighborhood detail route `/areas/:slug`
- Repository baseline: `main@456dcacb387b908797756863b10da1f7104b658e`
- Design branch: `design/nips-neighborhood-profile-ux-2026-11-27`

## 1. Executive decision

Extend the existing full neighborhood detail page into the canonical NIPS profile experience. Keep the map inspector drawer as a compact, map-adjacent decision aid; do not place the complete 120-variable registry inside that constrained drawer.

The NIPS page must make four concepts independently legible:

1. Canonical neighborhood identity and profile linkage.
2. Structural coverage of the versioned catalog.
3. Actual value availability, quality, applicability, and provenance.
4. Profile lifecycle and publication eligibility.

A structurally complete profile must never look like a data-complete, quality-approved, or published profile by implication.

## 2. Repository-grounded findings

### Existing UI

- `src/components/views/NeighborhoodDetailView.tsx` already implements the full-page neighborhood route. It currently shows a neighborhood heading, overall livability score, four price/rent summary metrics, map/valuation/listing actions, comparison controls, and a six-axis livability section.
- `src/components/NeighborhoodInspectorDrawer.tsx` is the map-side inspector. It has five tabs (scorecard, market, bargains, reviews, vote), ranking shortcuts, and valuation/commission/legal actions. It is already a dense interaction surface.
- `src/styles/tokens.css`, `src/design-system/colorSystem.ts`, and `src/styles/fonts.css` define the existing visual system. Retain these foundations rather than introducing a parallel palette or font.

### NIPS source of truth inspected

- `docs/architecture/NEIGHBORHOOD-INTELLIGENCE-PROFILE-STANDARD-NIPS-1.0.0.md`
- `docs/architecture/NIPS-GOLDEN-REFERENCE-1.0.0.json`

The Golden Reference was inspected directly. It contains 12 categories and 120 variables. All 120 values are null; every item is marked `NO_REAL_VALUE_REFERENCE_ONLY` and `UNASSESSED_FOR_REAL_NEIGHBORHOOD`. The fixture is `REFERENCE_TEMPLATE_ONLY`, has no `geographicEntityId`, and explicitly is not a real neighborhood. It must never be shown as a real neighborhood profile or published.

The NIPS document separates structural completeness from data completeness and distinguishes:
- Applicability: `APPLICABLE_AT_NEIGHBORHOOD`, `PARENT_LEVEL_ONLY`, `NOT_APPLICABLE`, `NOT_ASSESSED`.
- Value status: `VERIFIED`, `OBSERVED_UNVERIFIED`, `ESTIMATED`, `DERIVED`, `HISTORICAL`, `NOT_COLLECTED`, `SOURCE_UNAVAILABLE`, `CONFLICTED`, `STALE`.
- Lifecycle: `PROFILE_MISSING`, `STRUCTURE_READY`, `IN_PROGRESS`, `QUALITY_REVIEW`, `COMPLETE`, `PUBLISHED`.

The profile relationship uses canonical `geographicEntityId`; legacy numeric IDs or names alone are not valid linkage keys. Catalog version 2.0.0 has 12 categories and 120 variable IDs. The 12 catalog categories are canonical; any shorter display grouping is only a UI projection.

### Active work that must not be duplicated

PR #68 is a Draft with mobile touch-target changes for the inspector drag handle and Map Legend close control. This package does not repeat or modify that work. PR #67 is a Draft backend NIPS runtime foundation; this handoff assumes neither that the runtime is complete nor that a production API is available.

## 3. Independent design critique

The existing neighborhood detail page is a useful overview, but it is not an NIPS profile:

- A six-axis livability summary is not equivalent to the official 12-category / 120-variable catalog.
- The current top-level price cards do not expose canonical variable IDs, applicability, data quality, geographic scope, provenance, or temporal validity.
- The current page has no independent representation of profile lifecycle or publication readiness.
- The current inspector drawer is too constrained to host a 120-variable registry without degrading its map-first purpose.

Do not delete the existing six-axis or market views. Retain them as a clearly labelled Radar summary/decision layer, separate from the canonical NIPS data registry. Do not present legacy seed/demo metrics as verified NIPS observations.

## 4. Concepts evaluated

| Direction | Strength | Weakness | Decision |
|---|---|---|---|
| Expand the existing detail route with a navigable NIPS registry | Reuses the established route; supports overview, 12-domain navigation, variable detail and evidence | Requires a clearer hierarchy than the current KPI-first page | **Selected** |
| One long page with 12 large accordions | Simple to build and responsive | Poor orientation in 120 variables; difficult to compare category status | Rejected |
| 120 variable dashboard tiles | High apparent information density | Too much visual noise; statuses and provenance become scan-hostile | Rejected |

## 5. Proposed information architecture

### A. Identity header

Show only fields returned by the canonical profile service:

- Official neighborhood name and alternative names.
- City / province / parent administrative hierarchy.
- Canonical `geographicEntityId` and profile ID (technical identifiers are copyable and bidi-isolated).
- NIPS standard version and catalog version.
- Current profile lifecycle state.
- Last profile update / selected as-of date.

When canonical identity is unresolved, show an explicit identity-resolution state. Do not infer linkage from the neighborhood name or old numeric ID.

### B. Profile overview

Use separate metrics for:
- Structural catalog coverage (required categories and variable IDs addressable).
- Variables with a value at the selected time.
- Quality-review backlog (conflicted, stale, or unverified values).
- Evidence/source coverage.

All percentages and totals must be returned by the backend or computed from a documented contract. Do not infer readiness from the existence of UI rows. In the Golden Reference preview, the correct summary is 12/12 categories, 120/120 reference variable slots, zero real values, and no canonical identity.

### C. Canonical 12-category navigation

| Code | Category | Variable count |
|---|---|---:|
| A | هویت جغرافیایی و ساختار مکانی | 10 |
| B | جمعیت‌شناسی و خانوار | 10 |
| C | موجودی مسکن و ویژگی‌های کالبدی | 12 |
| D | کاربری اراضی و فرم شهری | 13 |
| E | بازار ملک و آگهی‌ها | 13 |
| F | معاملات قطعی و بازار اجاره | 10 |
| G | دسترسی و حمل‌ونقل | 10 |
| H | خدمات عمومی و کاربری‌های شهری | 10 |
| I | محیط‌زیست و شرایط شهری | 8 |
| J | مخاطرات طبیعی و شهری | 7 |
| K | شاخص‌های اقتصادی-اجتماعی و توسعه شهری | 7 |
| L | کیفیت داده و پوشش اطلاعاتی | 10 |
| **Total** | **12 categories** | **120** |

Use code + title + count + data-state summary on each category item. Preserve catalog order. A selected category opens its variable list without losing the profile summary or the selected neighborhood context.

### D. Variable registry

Each variable row must separate its two status axes rather than compressing them into one ambiguous badge:

- Variable title and stable catalog ID.
- Value and unit, or an explicit empty-state reason.
- Applicability status.
- Value-quality status.
- Actual geographic scope / minimum supported level.
- Observation time and temporal validity where applicable.
- Source/provenance reference and method version where available.

A parent-level value must be visually distinguished from a neighborhood-level value and must not contribute to neighborhood completeness. A missing value is null plus status/reason, never a fabricated zero.

### E. Evidence and history

Provide a variable-level evidence panel with source identity, source class, observation time, valid time window, methodology/version, and permitted-use metadata when returned by the data service. Provide a profile revision timeline; do not imply immutable history or evidence access unless the backend exposes it.

### F. Lifecycle and publication

Represent the exact lifecycle states:
- PROFILE_MISSING
- STRUCTURE_READY
- IN_PROGRESS
- QUALITY_REVIEW
- COMPLETE
- PUBLISHED

Show the next blocking conditions, not just a progress percentage. `COMPLETE` and `PUBLISHED` must be gated by backend validation and publication authorization. UI must not expose a publish action unless a corresponding authorized API operation exists.

## 6. Interaction model

1. Open `/areas/:slug` and resolve the canonical profile by `geographicEntityId`.
2. Render a clear loading state, identity-resolution error, profile-missing state, or populated profile state.
3. Select one of the 12 categories; retain the header and current as-of context.
4. Search/filter the selected category by variable title/ID, applicability, quality, and freshness only when those fields are returned.
5. Open a variable to inspect source/evidence and temporal history.
6. Switch the as-of date only if the backend supports historical profile reads.
7. Return to the category list without losing filters or selected time.
8. Offer map context as a secondary action; the full profile should not obscure or replace map navigation.

No control should be presented as functional until its route or API action exists. Search/filter can be local over the loaded catalog only if the complete catalog is already present in the client.

## 7. Visual direction and design tokens

Preserve the current Radar design system:
- Primary brand: deep petroleum green `#176B63`; hover/deep state `#14534E`.
- Light canvas `#F6F8F6`, surface `#FFFFFF`, subtle surface `#F1F4F2`.
- Primary text `#182522`, secondary `#34433E`, subtle border `#DCE3DF`.
- Semantic colors: existing success / warning / danger / info tokens only.
- Dark theme: existing canvas `#0D1513`, surface `#131F1C`, primary text `#EEF4F2`.
- Font: existing self-hosted Vazirmatn (400/500/600/700).
- Spacing: existing 4px base scale; card radius 12px; panel radius 16px.

Use neutral surfaces for structure and reserve semantic colors for meaningful data states. Never rely on color alone: every status needs text and, where suitable, an icon. Avoid new gradients, map-style heat colors for quality states, decorative rings, or generic dashboard widgets.

## 8. Responsive and RTL behavior

- Mobile (<=767px): single-column page; compact identity header; metrics become a two-column or stacked summary; category selector becomes a horizontally scrollable or collapsible list; variable details become a full-width section or accessible sheet. Keep all primary touch targets >=44px and respect safe-area insets.
- Tablet (768–1023px): two-column category/variable layout where space allows; evidence panel moves below the variable content.
- Desktop (>=1024px): category navigation at the side, variable registry in the main region, evidence detail as a contextual side panel or drawer. Do not allocate a permanent third column when it makes variable names unreadable.
- RTL must be structural: use `dir="rtl"` for Persian content, isolate technical IDs and Latin source identifiers with LTR/bidi isolation, use logical spacing/borders, and verify icon direction and keyboard order. The current `Vazirmatn` font remains the baseline.
- Keyboard: full tab access, visible focus, predictable focus return from dialogs/drawers, and correct semantic tab/accordion behavior.

## 9. Data integrity and failure states

Required UI states:
- Loading profile.
- Canonical identity unresolved.
- Profile missing.
- Structure ready but data not collected.
- Variable not applicable.
- Parent-level-only value.
- Verified / observed unverified / estimated / derived.
- Historical / stale / conflicted / source unavailable.
- Source access restricted or evidence unavailable.
- Profile version/catalog mismatch (fail closed; do not silently relabel).
- Backend unavailable / stale cached profile with explicit timestamp.

Never:
- Treat null as zero.
- Count parent-level-only values as neighborhood measurements.
- Count not-applicable or not-assessed fields as real measurements.
- Label estimates as official transactions.
- Promote `STRUCTURE_READY` to `COMPLETE` merely because all 120 variable IDs exist.
- publish the Golden Reference as a neighborhood.

## 10. Implementation boundary

This is a design-only package. No frontend source, API contract, database schema, migration, Worker binding, production resource, or deployment was changed.

Before frontend implementation, reconcile the exact read API / DTO with the NIPS runtime owner (currently tracked in Draft PR #67). The frontend must consume the canonical profile service; it must not synthesize profile values from the legacy neighborhood seed data or write directly to the shared profile database.

## 11. Acceptance criteria for the UI build

- Existing `/areas/:slug` route remains the entry point unless product routing governance approves otherwise.
- All 12 categories appear in catalog order and total 120 variable IDs for catalog 2.0.0.
- Every variable can be inspected without losing the neighborhood/profile context.
- Applicability and value-quality are separate, explicit, and accessible.
- Actual values always display unit, scope, source, and time context when required by the contract.
- Parent-level values are visibly parent-level and excluded from neighborhood-completeness metrics.
- Structural and data completeness are separate metrics.
- Lifecycle state is not inferred from frontend heuristics.
- Golden Reference is visually marked reference-only and never rendered as a real profile.
- Mobile, tablet, desktop, light, dark, and Persian RTL behavior pass visual and interaction QA.
- The existing map inspector remains a compact decision tool and is not overloaded with 120-variable detail.

## 12. QA critic verdict

**Design direction accepted with implementation gates.**

Strength: The chosen route reuses the existing full-page neighborhood context, aligns the interface with NIPS 1.0.0, and protects the map inspector from overload.

Blocking risks before code implementation:
1. Backend read API and runtime lifecycle are not yet verified as production-ready.
2. The profile's canonical identity must be resolved; a display name is not sufficient.
3. Completeness and publication calculations must be backend-authoritative.
4. Existing legacy price/livability metrics must remain distinct from NIPS measurements.

Visual QA of the live rendered implementation is **not performed** in this package because no running application/browser screenshot was available in this execution. The interactive design preview is supplied in the ChatGPT response; this document is the implementation handoff, not proof of a deployed UI.

## 13. Session recovery

- Current package: `RT-DESIGN-NIPS-PROFILE-001`.
- Documentation branch: `design/nips-neighborhood-profile-ux-2026-11-27`.
- Application code changed: no.
- Documentation handoff: this file.
- Backend runtime dependency: Draft PR #67.
- Separate mobile touch-target change: Draft PR #68; not duplicated.
- Next design action: implement the selected visual direction against the confirmed read DTO, then capture and inspect the actual mobile/tablet/desktop rendering before design QA approval.

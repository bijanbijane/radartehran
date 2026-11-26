# Tehran Radar — Audit Implementation Register

- Register ID: TR-UX-AUDIT-IMPL-001
- Source specification: the complete design/UX audit in the immediately preceding assistant response; the user's accompanying execution order is `turn1file0`.
- Project: `bijanbijane/radartehran`
- Baseline branch: `docker/main-debug-2026-11-25`
- Baseline HEAD: `f5d24bc61ac82d09d95357e3c3d70fb886097db0`
- Baseline runtime: `radartehran-main-local` (Docker Compose, port 3001)
- Register status: OPEN — implementation and validation are not complete.
- Register accounting: 8 original findings/recommendation groups + 49 independently testable implementation requirements = 57 unique traceability rows.
- Environment boundary: local Docker only. No production deployment, production migration, merge, commit, or push is authorized by this order.

## 1. Source findings and recommendation groups

The prior audit explicitly named eight findings. This register preserves all eight and decomposes the associated recommendations into independently testable requirements.

| Finding | Source meaning | Required outcome | Status |
|---|---|---|---|
| FE-001 | The browser fails to mount React because runtime imports still expect Firebase Auth exports that the Cloudflare-session compatibility module does not provide. | Restore application boot without reintroducing legacy Firebase Auth. | VALIDATED — React root mounts and public routes render in the current Docker/browser state; the fix itself came from concurrent pre-existing auth-migration edits, not this implementation batch. |
| FE-002 | UI consumers still assume Firebase User methods such as `getIdToken`, popup auth and Firebase account deletion, while the canonical identity is `AuthUserSnapshot`. | One session-backed identity contract across UI, account, admin and APIs. | IN PROGRESS — two remaining FirebaseUser assumptions were removed, but legacy auth adapters and missing local session endpoints prevent full validation. |
| IA-001 | Central and unified route registries overlap and can drift. | One canonical source for route metadata, access, aliases, ownership, breadcrumbs and layouts. | VALIDATED — duplicate redirect table removed; central AppShell registration is now derived from the same public/admin route definitions; aliases resolve through the canonical registry. |
| IA-002 | `UnifiedSearchPage` exists but is not connected to a reachable route; `/search` resolves to area discovery. | Explicit and coherent search/discovery architecture; no dead search page. | IMPLEMENTED — NOT YET VALIDATED — /search is a distinct route with its own H1/SEO and connected UnifiedSearchPage; neighborhood-result navigation was browser-tested; all entity families are not yet end-to-end verified. |
| IA-003 | `RadarWorkspaceShell` carries too many unrelated global responsibilities. | Separate map workspace, public shell, account shell and admin shell with explicit contracts. | NOT STARTED |
| IA-004 | New six-section admin shell and legacy `AdminModal` are both mounted as page-level systems. | One admin shell/navigation/state owner while retaining required capabilities and access controls. | IN PROGRESS — duplicated guest gate copy removed, but AdminModal still owns legacy admin capabilities and remains mounted alongside the six-section admin shell for verified admins. |
| A11Y-001 | Mobile More dialog lacks a fully verified focus lifecycle (initial focus, Tab containment and focus restoration). | Complete keyboard and screen-reader dialog behavior. | IN PROGRESS — initial focus, Tab trap, Escape and focus restoration are browser-tested at 390×844; full screen-reader/axe and cross-device checks remain. |
| UX-001 | Public tools catalogue and `Radar UI Lab` are mixed in the same user-facing workspace. | Separate stable decision tools from experimental/lab features. | VALIDATED — UI Lab moved to /tools/lab, hidden from the public catalogue, gated by the Vite development flag, and browser-tested in development. |

## 2. Cross-cutting implementation requirements

| Requirement | Origin | Acceptance criteria | Validation | Status |
|---|---|---|---|---|
| AUTH-01 | FE-001 | All browser entry-point imports resolve; no missing named exports from `src/firebase.ts`; React mounts on `/`. | Browser console + DOM root + route smoke. | VALIDATED — root mounts React; direct browser checks show no Vite runtime overlay or missing auth export. |
| AUTH-02 | FE-001 | Firebase Auth SDK is not reintroduced as a runtime authentication dependency. | Import graph scan; build bundle/import checks. | IN PROGRESS — key entry-point auth dependencies were migrated, but legacy auth listeners/compat adapters remain in several admin/stage components. |
| AUTH-03 | FE-001 | Guest users can load public routes even when local Docker has no Cloudflare Worker session. | Browser route smoke in guest state. | VALIDATED — guest browser smoke shows public pages render without an authenticated Worker session; some cloud-backed data endpoints still return 404. |
| AUTH-04 | FE-002 | Components accept the canonical `AuthUserSnapshot`; no Firebase User-only method is assumed. | Type-check + importer scan. | IN PROGRESS — ProductUserSpaceView now consumes AuthUserSnapshot and the claims bridge has a structural boundary; remaining legacy consumers still need migration. |
| AUTH-05 | FE-002 | Google sign-in uses the session client's redirect flow; logout uses the session client's logout operation. | Source check + Worker-backed integration test where available. | BLOCKED — /api/auth/session is 404 in this local Compose environment; Google redirect start and logout cannot be validated end-to-end here. |
| AUTH-06 | FE-002 | Account export/deletion uses the D1 account APIs and does not call `deleteUser` from Firebase Auth. | Account service tests + request inspection. | IN PROGRESS — account export/deletion service tests and UID-isolation tests pass; full session-backed account lifecycle is blocked by missing local auth routes. |
| AUTH-07 | FE-002 | Authenticated API calls use the supported same-origin session/Worker assertion path; no fabricated bearer token. | API integration tests and request inspection. | BLOCKED — local /api/auth/session route is unavailable (HTTP 404); authenticated same-origin Worker assertions cannot be validated in this Docker stack. |
| NAV-01 | IA-001 | A single canonical registry owns path, aliases, view, subtab, title, layout, access, breadcrumb and visibility metadata. | Registry unit tests. | VALIDATED — canonical route metadata is held in public/admin route definitions; legacy AppShell registry is a derived compatibility projection, not a separate source table. |
| NAV-02 | IA-001 | Route lookup, redirects, breadcrumbs, menus and ownership derive from the canonical registry. | URL round-trip and route ownership tests. | VALIDATED — route lookup, aliases, URL resolution and ownership now use the unified registry; separate LEGACY_REDIRECTS map was removed. |
| NAV-03 | IA-001 | Existing public/admin routes and deep links remain valid or have explicit canonical redirects. | Exhaustive registered-path/alias tests. | VALIDATED — registered paths and aliases pass round-trip tests; explicit assertions cover eight former shell/shortcut URLs. |
| SEARCH-01 | IA-002 | Search has one explicit product role and route; duplicate search affordances have defined scope. | Route and UI tests. | VALIDATED — /search is a distinct route, removed from /areas aliases, exposed through discovery secondary navigation and given a dedicated page title/H1. |
| SEARCH-02 | IA-002 | `UnifiedSearchPage` is either connected as the true cross-entity search experience or removed only after equivalent functionality is accounted for. | Direct route test + result-type tests. | IMPLEMENTED — NOT YET VALIDATED — UnifiedSearchPage is mounted on /search; neighborhood results were followed to a real /areas/:id profile; property/listing/service/building detail journeys need further end-to-end work. |
| SEARCH-03 | IA-002 | Search supports the agreed entities (neighborhoods, property listings, market/knowledge content and service providers where searchable), keyboard operation, empty/error/loading states and result navigation. | Search unit, interaction and browser tests. | IN PROGRESS — cross-domain filters/results render; keyboard, empty/error/loading states and every result-family navigation have not all been validated. |
| SHELL-01 | IA-003 | Map-specific controls/state remain in a map workspace shell; non-map pages do not depend on map-only state. | Component dependency tests + route browser tests. | NOT STARTED |
| SHELL-02 | IA-003 | Public pages, account and admin have explicit layout boundaries and shared header/footer contracts. | Layout tests + screenshots. | NOT STARTED |
| SHELL-03 | IA-003 | Cross-module communication uses typed props/services/events rather than broad `any`-shaped global state where practical. | Type-check + dependency review. | NOT STARTED |
| ADMIN-01 | IA-004 | One admin shell owns navigation, active section and page lifecycle. | Admin route and state tests. | IN PROGRESS — guest sign-in duplication reduced; verified-admin page still includes the legacy modal system in addition to the six-section shell. |
| ADMIN-02 | IA-004 | All six administrative capabilities remain available with least-privilege authorization; legacy-only functionality is migrated before removal. | Role/permission tests + route tests. | IN PROGRESS — new content/data/users/operations/security components exist, but legacy CRM, leads, bargains, prices, backup and map-provider controls have not all been mapped to the new shell. |
| ADMIN-03 | IA-004 | No hidden always-open modal remains as a second admin page/state owner. | Component tree/browser inspection. | IN PROGRESS — duplicate guest gate copy removed; the legacy AdminModal is still mounted to preserve its old functionality pending a complete capability migration. |
| A11Y-01 | A11Y-001 | Mobile More uses dialog semantics, an accessible name, initial focus and focus containment. | Keyboard test + accessibility scan. | VALIDATED — mobile More dialog has dialog semantics, accessible name/description, focusable controls and initial focus. |
| A11Y-02 | A11Y-001 | Escape and close controls close the dialog; focus returns to the invoking control. | Keyboard interaction test. | VALIDATED — native browser test confirms Shift+Tab wraps to last, Tab wraps to first, Escape closes and focus restores to the opener. |
| A11Y-03 | A11Y-001 | Menu items have meaningful names, logical order, visible focus and correct current/expanded state. | Axe/browser keyboard audit. | IN PROGRESS — labels and ordering are present in the dialog; automated accessibility and screen-reader validation remains. |
| TOOLS-01 | UX-001 | Stable public decision tools are grouped by task: buy/rent, property/ad review, comparison/analysis. | Route/category tests. | VALIDATED — existing tool catalogue/category and contract-shield tests pass; public tool tasks remain separated from the lab entry. |
| TOOLS-02 | UX-001 | Radar UI Lab and experimental features are isolated from the public tools catalogue. | Browser/UI tests. | VALIDATED — /tools/lab is independent; /tools does not mount the lab; dev gating is source- and unit-test-verified. |
| TOOLS-03 | UX-001 | Existing tool actions, filters, calculators and feature-flag behavior remain functional after separation. | Existing tools tests + interaction tests. | VALIDATED — tool catalogue and contract-shield tests pass after lab isolation; production build also succeeds. |
| DS-01 | Audit §5 | Existing color, typography, spacing, radius, elevation, breakpoint and z-index tokens remain canonical; duplicate token sources are reconciled. | Token contract tests + CSS variable audit. | IN PROGRESS — design tokens remain in use and existing contract tests pass, but duplicate-token reconciliation was not exhaustive. |
| DS-02 | Audit §5 | Brand, semantic, cartographic and data-visualization palettes remain distinct; key text/control color pairs meet WCAG AA contrast. | Contrast calculation + rendered inspection. | IN PROGRESS — 20/20 color-system contract checks pass; full rendered-page contrast review remains. |
| DS-03 | Audit §5 | Vazirmatn, RTL/bidi behavior, Persian numerals and tabular numeric treatment are consistent across pages. | Typography test + representative screenshots. | IN PROGRESS — typography contract test passes; cross-page visual consistency and real-device RTL review remain. |
| DS-04 | Audit §5 | Shared geometry and component variants use consistent spacing, touch targets and responsive rules rather than page-specific drift. | CSS audit + screenshots. | IN PROGRESS — geometry/spacing contract tests pass; page-wide implementation consistency still needs visual inspection. |
| RESP-01 | Audit §7 | Validate at 360, 390, 768, 1024, 1280 and 1440 CSS-pixel viewports. | Browser screenshots and overflow assertions. | IN PROGRESS — 390×844 mobile viewport was used for the dialog focus test; all six target widths were not reviewed. |
| RESP-02 | Audit §7 | No unintended horizontal overflow, clipped content, unsafe-area collision or inaccessible navigation at supported viewports. | Browser DOM geometry + visual review. | IN PROGRESS — mobile dialog geometry and keyboard behavior were checked; site-wide overflow/safe-area review is outstanding. |
| JOURNEY-01 | Audit §6 | Neighborhood discovery flow remains coherent from map/search to quick inspector and full neighborhood profile. | Journey E2E. | IN PROGRESS — search-to-neighborhood-profile journey was browser-tested; map-to-inspector journey needs a separate full run. |
| JOURNEY-02 | Audit §6 | Property flow remains coherent from discovery/filtering through detail, save/compare and submission. | Journey E2E. | NOT STARTED |
| JOURNEY-03 | Audit §6 | Services flow clearly separates requester and provider paths from directory through detail, request and follow-up. | Journey E2E. | NOT STARTED |
| JOURNEY-04 | Audit §6 | Knowledge and community remain distinct: reference content versus user interaction/contribution. Deep links and back navigation work. | Journey E2E. | NOT STARTED |
| PAGE-01 | Audit §4/§9 | Home acts as a concise entry page and routes users to the primary next action. | Screenshot + interaction review. | NOT STARTED |
| PAGE-02 | Audit §4/§9 | Map remains the central GIS workspace; floating controls and neighborhood inspector do not overwhelm the map. | Desktop/mobile screenshots. | NOT STARTED |
| PAGE-03 | Audit §4/§9 | Discovery and neighborhood profile distinguish rapid search/results from durable reference detail. | Screenshots + route tests. | IN PROGRESS — search and neighborhood page navigation works in the browser; full page hierarchy review remains. |
| PAGE-04 | Audit §4/§9 | Market information is hierarchically organized as key indicators, trend, detail and methodology/provenance. | Screenshot + content review. | NOT STARTED |
| PAGE-05 | Audit §4/§9 | Property discovery and property detail support distinct tasks; submission does not compete with browsing. | Journey + screenshots. | NOT STARTED |
| PAGE-06 | Audit §4/§9 | Tools are task-oriented; experimental UI lab is separate. | Screenshot + interaction review. | IN PROGRESS — UI Lab was isolated from the catalogue; complete tool-page hierarchy and interaction review remains. |
| PAGE-07 | Audit §4/§9 | Services has clear requester/provider role separation. | Journey + screenshot. | NOT STARTED |
| PAGE-08 | Audit §4/§9 | Knowledge supports discovery, reading, related content and provenance. | Journey + screenshot. | NOT STARTED |
| PAGE-09 | Audit §4/§9 | Community organizes discussions, Q&A, data corrections, research and member identity without mixing it with the knowledge library. | Journey + screenshot. | NOT STARTED |
| PAGE-10 | Audit §4/§9 | Account separates overview, saved items, activity, contributions, notifications and preferences. | Journey + screenshot. | IN PROGRESS — account view identity typing was aligned; complete account journey/visual validation remains. |
| PAGE-11 | Audit §4/§9 | Admin remains a separate, role-gated operational workspace with six clear sections. | Admin role E2E + screenshot. | IN PROGRESS — guest gate is cleaner; verified-admin capability consolidation remains unresolved. |
| VAL-01 | Audit §11 | Build and type-check pass after implementation; failures are recorded, not hidden. | `npm run build`, `npm run typecheck`. | IN PROGRESS — production build passes and scoped TypeScript check passes for 17 affected/related files; full-repository typecheck was not completed. |
| VAL-02 | Audit §11 | Relevant unit, integration, route, navigation, accessibility and workflow tests pass. | Test commands listed in §5. | IN PROGRESS — 41/41 selected unit/architecture/account/tools/auth tests pass; full integration/E2E suite was not run. |
| VAL-03 | Audit §11 | Actual rendered mobile/tablet/desktop pages are reviewed; source-only checks are not treated as visual validation. | Browser screenshots + keyboard tests. | IN PROGRESS — real browser checks cover root, search, tools/lab, neighborhood detail and mobile dialog; full route/viewport/accessibility review remains. |

## 3. Page inventory and required treatment

| Page/module | Primary route | Required treatment |
|---|---|---|
| Home | `/` | Entry hierarchy and clear next actions. |
| Map/GIS workspace | `/map` | Preserve map centrality; organize layers, quick filters and inspector. |
| Discovery/neighborhood | `/areas`, `/areas/:slug` | Separate discovery from full neighborhood reference. |
| Geographic registry | `/areas/registry` | Keep canonical geography reference distinct from discovery. |
| Market | `/market` and subroutes | Indicators → trends → detail → methodology. |
| Properties | `/properties` and deep links | Separate browse, detail, save/compare and submission. |
| Tools | `/tools` | Task-oriented catalogue; isolate lab/experimental UI. |
| Services | `/services` | Directory, requester workflow and provider portal. |
| Knowledge | `/knowledge` | Searchable reference, articles, guide, glossary and methodology. |
| Community | `/community` | Discussions, Q&A, corrections, research and members. |
| Account | `/account` | Overview, saved, activity, contributions, notifications and settings. |
| Admin | `/admin` | Six role-gated sections in one shell. |

## 4. Baseline and preservation record

- Baseline origin: `https://github.com/bijanbijane/radartehran.git`
- Branch: `docker/main-debug-2026-11-25`
- HEAD: `f5d24bc61ac82d09d95357e3c3d70fb886097db0` (same commit as `origin/main` at inspection)
- At first inspection, 37 local changes/untracked files were recorded.
- During subsequent inspection, additional existing/parallel edits appeared, expanding the worktree to 36 modified tracked files plus the listed untracked local Docker/Firebase/Firestore files. These concurrent changes are not attributed to this implementation run and must not be reset, overwritten, or silently absorbed.
- Important overlapping edits already visible: Firebase retirement/session compatibility, AuthUserSnapshot type migrations, redirect-based login conversion, account export/deletion flow conversion, and public sitemap modifications.
- Docker container: `radartehran-main-local`, image `radartehran:main-dev`, host binding `127.0.0.1:3001`, last observed health `healthy`.
- Browser baseline before parallel edits: React did not mount; the browser reported that `/src/firebase.ts` did not export `auth`.
- Selected architecture tests had passed 22/22 earlier, but must be rerun against the current worktree.
- A full TypeScript check was attempted earlier and did not produce a trustworthy completion result; it must be rerun with controlled resource use.

## 5. Validation commands and evidence policy

Run only against the local Docker workspace.

- Build: `docker exec radartehran-main-local sh -lc 'npm run build'`
- Type check: `docker exec radartehran-main-local sh -lc 'npx tsc --noEmit -p tsconfig.json'`
- Navigation/design contract tests: `npx tsx --test src/navigation/navigationArchitecture.test.ts tests/navigation-configuration.test.ts tests/header-and-megamenu.test.ts src/design-system/designSystem.test.ts`
- Browser validation: open local route, inspect console/runtime exceptions, verify React mount and representative controls.
- Responsive validation: 360, 390, 768, 1024, 1280 and 1440 px.
- Accessibility validation: keyboard-only navigation, initial/contained/restored focus for dialogs, accessible names and visible focus.
- Never report a requirement as VALIDATED solely because code exists or a build passes.
- Keep separate counts for recommendation groups and acceptance requirements. A parent stays incomplete while any child remains incomplete.

## 6. Execution evidence and current findings

### Implemented and validated in this execution

- **A11Y-001 mobile More focus lifecycle:** in native Chrome at 390×844, the dialog opened, focused the close control initially, contained Shift+Tab (first → last) and Tab (last → first), closed on Escape and restored focus to the exact opener. The dialog had 9 visible focusable controls.
- **IA-001 route ownership:** route metadata is now held in public/admin route definitions. The former hand-maintained 8-route `CENTRAL_ROUTE_REGISTRY` was replaced with a derived compatibility projection; the independent hard-coded `LEGACY_REDIRECTS` map was removed. Former shell URLs are aliases on canonical routes. Tests explicitly cover `/login`, `/profile`, `/saved-searches`, `/escrow`, `/agency/workspace`, `/service/orders`, `/tools/compare` and `/admin/governance`.
- **IA-002 search integration:** `/search` is no longer an `/areas` alias; it has a distinct registry record, secondary-navigation entry, explicit H1 and search-specific title/description. The page rendered 188 results in the observed browser session. Selecting the Zafaraniyeh result navigated to `/areas/1` and rendered the neighborhood profile. Other entity-family detail journeys remain incomplete.
- **UX-001 UI Lab isolation:** `/tools/lab` is a separate beta route, hidden from ordinary navigation, guarded by the Vite development flag rather than `?dev=1`, and not mounted in `/tools`. Development browser navigation to the lab was observed.
- **FE-001 runtime:** the current local app mounts React and the browser shows no missing `auth` export/Vite runtime overlay. This resolution appeared in concurrent pre-existing auth-migration edits, so it is recorded as current-state evidence and not attributed to this implementation batch.
- **Admin guest gate:** duplicate heading/description in the new shell was removed. The legacy AdminModal sign-in UI remains as the guest entry point; authenticated-admin consolidation is not complete.
- **FE-002 type boundary:** ProductUserSpaceView now imports AuthUserSnapshot directly from authClient. A concurrent local deletion removed `src/platform/auth/identity/firebaseIdTokenClaims.ts`; the stale barrel export was removed from `src/platform/auth/index.ts`. The old `firebaseIdTokenClaims.test.ts` still imports the deleted file and is now an orphaned failing test, not a validated auth test.

### Validation evidence

- Latest stable selected architecture/design/account/tools test batch: **34 passed, 0 failed** (8.4s test duration). It deliberately excludes the stale `firebaseIdTokenClaims.test.ts` that references a concurrently deleted source file. A previous combined run after that deletion had 3 suite-import failures caused by that missing source file; after removing the dead barrel export, the 34-test subset passed.
- Navigation-only batch after explicit legacy alias assertions: **13 passed, 0 failed**.
- Scoped TypeScript check on **17 affected/related files**: **exit code 0**, no diagnostics.
- Production build via the actual project command `npm run build`: **success**, 3,059 modules transformed, Vite build **19.95s**.
- Build warnings remain: two circular chunk relationships (`data-neighborhoods`, `data-iran-provinces`, `app-core-shared`) and the main chunk is **709.14 kB**, above the 700 kB warning threshold.
- Browser smoke included `/`, `/map`, `/areas`, `/search`, `/areas/registry`, `/market`, `/properties`, `/tools`, `/tools/lab`, `/services`, `/knowledge`, `/community`, `/account` and `/admin`. No Vite overlay was observed in that sweep; direct journeys were separately followed for `/search`, `/tools/lab` and `/areas/1`.
- Scoped TypeScript check passed earlier for 17 affected files before the concurrent claims-adapter deletion; a new full-repository check and a post-deletion scoped check have **not** completed. Full E2E, axe/screen-reader testing, all six responsive target widths and all page journeys have **not** been completed.

### External/local environment blockers

- The local Docker server returns **HTTP 404** for `/api/auth/session` (two observed requests) and `/api/v1/market/state`. The source tree search did not find an Express route registering these endpoints. Google session start/refresh/logout and cloud-backed market synchronization therefore cannot be fully exercised in this Compose stack. No fake token or substitute auth path was introduced.
- `npm run arch:check` reports **9 blocking architecture findings** in unrelated/pre-existing backend/communications files: seven legacy ratchet overages plus `server/modules/communications/commsRoutes.ts` (557 lines) and `src/data/neighborhoodRemoteRepository.ts` (528 lines). The two latter files were already modified in the working tree before this implementation; none were rewritten here.
- During final verification the host reported several concurrent Docker validations (frontend/API typechecks, E2E smoke and Cloudflare marketplace tests). Two host requests to `/` and `/api/healthz` then timed out after 5 seconds (HTTP 000). Container health had previously been `healthy`; current responsiveness under that concurrent load is not verified. Those other sessions were left untouched.
- The concurrent deletion of `firebaseIdTokenClaims.ts` leaves `src/platform/auth/identity/firebaseIdTokenClaims.test.ts` stale; restore or replace that test only as part of the owner-approved Firebase retirement work, not by restoring the old Firebase adapter blindly.
- The current search adapter emits synthetic IDs for some result domains. Neighborhood selection was proven; property/listing/service/building detail routes are not all wired to authoritative domain records. Building results must not be presented as complete detail records until a real detail source is connected.
- `AdminModal` still contains legacy CRM, buyer leads, bargain moderation, price editing, backup/restore, tile-provider and security operations. These functions were not all mapped into the six-section admin shell. Removing the modal would cause feature loss, so it remains mounted pending a capability-by-capability migration.

### Coverage accounting (current)

- Original findings/recommendation groups: **8**.
- Independent implementation requirements: **49**.
- Total unique traceability rows: **57**.
- Fully validated recommendation groups: **3/8 (37.5%)** — FE-001 current runtime state, IA-001 route ownership, UX-001 lab isolation.
- Partially implemented groups: **4/8 (50.0%)** — FE-002, IA-002, IA-004, A11Y-001.
- Not started groups: **1/8 (12.5%)** — IA-003.
- Requirement-level status counts across all 57 rows: **14 VALIDATED (24.6%)**, **2 IMPLEMENTED — NOT YET VALIDATED**, **25 IN PROGRESS**, **14 NOT STARTED**, **2 BLOCKED**. A parent item is not called complete while any child remains open.

## 7. Continuation checkpoint

- Branch: `docker/main-debug-2026-11-25`.
- HEAD: `f5d24bc61ac82d09d95357e3c3d70fb886097db0` (no commit created).
- Worktree: contains numerous pre-existing/concurrent edits across auth migration, server, UI, Firestore and Docker files; none were reset. `public/sitemap.xml` and `public/robots.txt` are generated by `npm run build`; preserve those changes.
- Docker: `radartehran-main-local`, last observed `running healthy`, host `127.0.0.1:3001`.
- No commit, push, merge, production deployment or production data mutation was performed.
- Temporary `tsconfig.audit-scoped.json` was used for a 17-file scoped typecheck and removed; no temporary screenshot artifact remains in `docs/implementation/`.
- A final production build re-run after the concurrent claims-adapter deletion was stopped after several minutes without Vite progress (`transforming…` only). It is **not validated**. The previously successful 3,059-module production build predates that deletion.
- Remaining work: complete FE-002 auth consumers/API route availability; wire all search result entity families to real detail targets; consolidate AdminModal capabilities into the new admin shell; decouple map/public/account/admin shell responsibilities; finish responsive/visual/accessibility review and run the full repository test suite/typecheck/E2E.

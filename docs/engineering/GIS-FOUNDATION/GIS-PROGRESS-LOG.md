# GIS Progress Log

## 2026-11-27 — GIS foundation reconnaissance

- Inspected repository instructions, architecture policy, persistent engineering memory and execution state.
- Located existing geography engines, geospatial service, boundary version scaffold, profile evidence read model, Worker IRNI v2 identity resolver and profile tests.
- Confirmed canonical geography ownership is IRNI; Radar reads through the internal Workers Service Binding.
- Confirmed the Express profile read model remains fail-closed because identity and source-registry resolvers are not injected; approval remains denied without admin dependencies.
- Confirmed `computed_hex_fallback` is a visualization-only geometry and must not become analytical evidence.
- Confirmed geospatial state uses `AtomicJsonRepository('geospatial-state.json')` with optional remote snapshots, not a relational D1 schema. No GIS D1 binding appears in `wrangler.backend.jsonc`.
- Reviewed current Cloudflare D1 extension documentation. RTree runtime support remains unverified; no RTree migration is justified.
- Created this GIS workstream's architecture and execution-state records on the existing GIS branch.
- No tests, migrations, D1 probes, production writes, deployment, merge or release were executed.

## Next checkpoint

Resolve the storage owner and authenticated Worker/API bridge. Then add targeted regression coverage for the production fail-closed composition and approximate-geometry exclusion.

## 2026-11-27 — GIS-GUARD-001

- Implemented a defense-in-depth block in `buildNeighborhoodProfileBoundaryReadModel`: `sourceProvenance === 'computed_hex_fallback'` now produces `BOUNDARY_SOURCE_NON_AUTHORITATIVE` before any resolver can make the record publishable.
- Added a regression test that deliberately supplies a source resolver claiming `OFFICIAL_PRIMARY`; the fallback must still return BLOCKED with `evidence: null`.
- GitHub confirmed both source and test file updates on the GIS branch. The test was not executed in this session; it remains IMPLEMENTED_NOT_TESTED.


## 2026-11-27 — Branch-head reconciliation and GIS-GUARD-001 verification boundary

- Verified PR #72 remains open and Draft; its exact head at inspection was `439224c0ad44b4d80b8c2f735873a0a198049923`.
- Reconciled `GIS-EXECUTION-STATE.json` with that branch-head evidence in commit `40edd489763b2901cda896ede80737ceeadfb6d4`.
- Re-inspected `neighborhoodProfileBoundaryReadModel.ts` and its regression: `computed_hex_fallback` is blocked before identity/source resolvers can produce publishable evidence.
- Confirmed the guard test exists, but no local test command was executed and the hosted GIS jobs have no usable step/log diagnostics. Status remains IMPLEMENTED_NOT_TESTED.
- Confirmed Cloudflare's current D1 SQL documentation lists FTS5, JSON and math in its supported extension subset; the 2026-11-12 RTree export announcement does not establish Worker-runtime RTree SQL support. RTree remains UNVERIFIED.
- No production D1 schema, data, binding, deployment, merge or release was changed.
- Next exact action: obtain an executable test environment or usable hosted-runner diagnostics, then run the targeted profile-boundary test, geospatial suite, valuation-location suite and typecheck on the reconciled branch head. Keep PR #72 Draft.


## 2026-11-27 — Exact-head GIS runner retry and production wiring audit

- Reconciled the workstream against exact branch HEAD `0c69135b50b0ed59416f1f471ef18da64fbbbb6c`; execution state is now committed at `5939adf30927aee21719eeb3eed6800caae7cdb8`.
- Inspected the production Express composition and the complete geospatial router. The approval route does implement Firebase principal verification, admin/delegated-admin authorization and independent reviewer enforcement. The production bootstrap still calls `createProductionGeospatialModule()` with no dependencies, so the route intentionally fails closed. The blocker is missing production dependency wiring, not missing route-level authorization logic.
- Confirmed the GIS import function is not exposed by the current geospatial router; the internal service import path is not a public HTTP ingestion endpoint.
- Retried failed jobs for GIS workflow run [46005295667](https://github.com/bijanbijane/radartehran/actions/runs/46005295667). Attempt 2 again failed both jobs with `steps=null` and `logs_url=null`; no test or typecheck execution is evidenced.
- Updated `GIS-BLOCKERS.md` to distinguish implemented route safeguards from missing production dependencies, and to record the exact runner retry evidence.
- No application source code was changed in this checkpoint because the required trusted identity/source adapters and an authorized executable test environment are not available; fabricating adapters or weakening fail-closed behavior would be unsafe.
- Next: restore an operational runner/authorized checkout, then implement a supported authenticated IRNI identity bridge and trusted source resolver as independently testable adapters. Keep profile evidence blocked until both adapters are wired and verified.


## 2026-11-27 — Cloudflare-native GIS approval integration

- Audited the Firebase retirement architecture rather than wiring a new GIS feature to legacy Firebase Admin. The repository already contains a Worker D1-session assertion signer, Express HMAC verifier and globally mounted Express bridge middleware.
- Verified the bridge contract binds the short-lived assertion to HTTP method, exact path/query, correlation ID and Worker-hop marker; Express strips the private assertion header and stores the principal in request-scoped AsyncLocalStorage.
- Updated `server/modules/geospatial/routes.ts`: boundary approval now uses the verified Cloudflare session principal, requires the verified admin role flags, and does not fall back to Firebase if a Cloudflare session context is present.
- Added `tests/geospatial-cloudflare-session-approval.test.ts`, covering anonymous denial, non-admin denial and an independent admin reviewer. Added it to `npm run test:geospatial`.
- GitHub confirmed source, test and package-script commits through `f2374ae21de3cb16908d7cc6147f7a3566fd871a`. The new regression has not been executed.
- The shared `AUTH_INTERNAL_HMAC_SECRET` is required by both runtimes; code/docs evidence does not establish that it is provisioned. No secret was read or modified and no deployment was attempted.
- GIS workflow run [46006117704](https://github.com/bijanbijane/radartehran/actions/runs/46006117704) failed both jobs with `steps=null` and `logs_url=null`; no test or typecheck run can be inferred.
- Next: restore executable Node 22 verification, run the new route regression plus focused GIS/valuation/typecheck suites, and verify bridge configuration through an authorized read-only runtime check. Keep PR #72 Draft.


## 2026-11-27 — Independent-review HTTP coverage and runner diagnosis

- Extended `tests/geospatial-cloudflare-session-approval.test.ts` with an explicit administrator self-approval attempt by the boundary creator; the endpoint must return 403 before an independent administrator can approve the pending version.
- Confirmed the Worker proxy deletes any client-supplied session assertion, mints a request-bound assertion only after D1 session authentication, binds method/path/query/correlation ID, and sets the internal Worker-hop header. Express verifies the assertion before exposing the request-scoped principal.
- Confirmed `apps/api/server.ts` mounts the bridge middleware globally and mounts the production geospatial router. The Worker registry/fallback path for the new GIS endpoint is not yet demonstrated as active in a deployed environment.
- Latest exact-head GIS workflow [46009636806](https://github.com/bijanbijane/radartehran/actions/runs/46009636806) for `172ba3a83ce7f36d14a3f9ca78e4528d72d6fea2` failed both jobs with `steps=null` and `logs_url=null`. CI quality gates, Cloudflare native auth validation and IRNI RPC contract workflows triggered by the same commit showed the same pre-step failure pattern. This points to hosted runner/dispatch infrastructure; it does not establish test or code failure.
- Checked the authorized local execution route: the registered Desktop Commander device is offline. No local checkout or test command was available in this session.
- Execution state was reconciled in commit `fe5eda2b9351d766147c772f80367b9d1eef8924`. The new regression remains IMPLEMENTED_NOT_TESTED; no secret was read or changed, and no deployment, merge or production mutation occurred.
- Next: restore a working runner/authorized Node 22 checkout; execute the exact-head HTTP approval regression, GIS and valuation suites, and typecheck. Verify runtime bridge secret provisioning through an authorized read-only mechanism.


## 2026-11-27 — Cloudflare Worker runtime bridge audit

- Verified backend Worker and staging names from wrangler.backend.jsonc: radartehran-api and radartehran-api-staging.
- Inspected deployed Cloudflare Worker secret-binding names and plain-text variable names through read-only APIs. The API Worker has no AUTH_INTERNAL_HMAC_SECRET binding and no STRANGLER_ORIGIN_URL; the staging Worker has neither and has no secret bindings at all.
- Confirmed in source that the Worker router fails with AUTH_SESSION_BRIDGE_NOT_CONFIGURED when the HMAC secret is absent and the strangler fallback needs the origin variable. The Worker-side bridge therefore cannot operate with current settings. Express process environment remains unverified.
- Secret values were not requested, read, printed, provisioned or changed. No settings, deployment, production data or infrastructure were modified.
- Exact branch head 062740891fed40bd2bb39aa7ef902bb267eeebc5 has seven PR workflow runs marked failed; the GIS run https://github.com/bijanbijane/radartehran/actions/runs/46009917366 and sampled sibling jobs have steps=null and logs_url=null. No test execution can be inferred.
- PR metadata also reports failed Cloudflare Preview builds for the current commit. Build logs have not been inspected; root cause is unknown.
- Updated blocker and execution-state records with runtime evidence. No application source changes were made because secret provisioning and runtime activation require operator approval.
- Next: recover executable test capacity; inspect Preview build diagnostics; obtain explicit approval for non-production bridge configuration before changing it; keep PR #72 Draft.


## 2026-11-27 — Cloudflare Preview build root-cause analysis

- Retrieved the current branch's Cloudflare Workers Build record and log for build 290f16e3-e364-46b5-875d-73266852335c. The trigger runs `npm run build -w radartehran-frontend`, but dependency installation first executes `bun install --frozen-lockfile` under Bun 1.4.4.
- The build log reports `@tailwindcss/vite is in different dependency groups` between package.json and bun.lock, then stops before the frontend build command.
- Compared main and the GIS branch: bun.lock has the same blob SHA on both branches, and the relevant root package devDependency groups are unchanged. The stale Bun lockfile state therefore predates this GIS branch and is not caused by its geospatial changes.
- No lockfile was manually edited. Regenerating a Bun workspace lockfile requires the exact supported Bun version and a runnable dependency install; this session has neither a local online device nor usable GitHub Actions jobs. Do not hand-edit the generated lockfile.
- This Cloudflare Preview build failure is independent of the GitHub Actions pre-step failures. Root cause is established for the Preview build; test/typecheck execution remains unverified.


## 2026-11-27 — Bun workspace lockfile structure diagnosis and latest CI state

- Inspected the root manifest: it declares npm workspaces `apps/*` and `packages/*`. The frontend workspace independently declares `@tailwindcss/vite` in `devDependencies`; both root and frontend Vite configs import the plugin.
- The committed `bun.lock` does not represent this workspace graph: its `workspaces` object contains only the empty-root entry named `react-example`, with no `apps/frontend`, `apps/api` or `packages/*` workspace entries. It also records root `@tailwindcss/vite` under `dependencies`, whereas root `package.json` declares it under `devDependencies`.
- This explains the Bun 1.4.4 frozen-install mismatch more precisely than the initial dependency-group observation. A correct fix is to regenerate the lockfile with Bun 1.4.4 from the actual monorepo root/workspaces, then verify `bun install --frozen-lockfile`; do not hand-edit generated lock data or casually move a build-time plugin into production dependencies.
- Latest exact-head PR runs for `4d3755d274beca85988eba1cecafdec7e40fdd84`: GIS 46011798449, native-auth 46011798372 and backend triad 46011798588 all concluded failure with job `steps=null` and `logs_url=null`. All seven PR workflow runs returned for the commit have the same failed conclusion; no test step execution is evidenced.
- No tests/typecheck were run in this session. No application code, lockfile, Worker configuration, secret or production resource was changed.

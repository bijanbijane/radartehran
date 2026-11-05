# Radar Tehran — Team Engineering Architecture & GitHub Integration Protocol
## Document Version: 1.0.0 (Workstream: TEAM-SETUP-001)
## Author: Member 01 — Integration Lead & Technical Coordinator
## Authoritative Alignment: Version 22 Master Charter + Version 32 Execution Governance

---

## 1. Executive Summary & Objective

This document establishes the collaboration architecture, branch governance, quality gates, and integration protocol for a multi-agent engineering team (4 to 6 members) operating across separate working environments against a single canonical GitHub repository for **Radar Tehran** (`رادار مسکن کلانشهرهای ایران`).

The primary objective is to enable parallel, autonomous engineering without:
1. Creating overlapping or conflicting file edits.
2. Destabilizing the canonical application state.
3. Violating Version 32 execution budgets or architectural constraints (`< 500` lines, unidirectional dependencies).
4. Bypassing mandatory security and quality verification gates.

---

## 2. Actual Environment Discovery & Capability Report

A rigorous live inspection of the current Google AI Studio Build environment was conducted. Findings are classified per Version 32 evidentiary standards:

### 2.1. Git & Filesystem Inspection
- **Local `.git` Metadata Directory**: `FAILED` (`NOT_PRESENT`). The `/app/applet` container filesystem does not contain a local `.git` repository folder (`fatal: not a git repository`). The workspace files are mounted directly into the Linux container.
- **Git Binary / CLI**: `CONFIRMED`. `/usr/bin/git` is installed and operational (`git version 2.34.1`). However, because no `.git` metadata exists locally, git subcommands (`git status`, `git branch`, `git log`) require explicit repository initialization or clone to function within the container.
- **Environment Variables**: `CONFIRMED`. No GitHub tokens, repository URLs, or branch credentials are present in `process.env`. Environment variables are properly sanitized against credential leaks.
- **GitHub Actions Configuration**: `CONFIRMED`. The repository contains `.github/workflows/ci.yml` configuring quality gates for pushes and pull requests targeting `main` and `master`.

### 2.2. AI Studio Platform Synchronization Capabilities
- **Platform-Level Two-Way GitHub Synchronization**: `CONFIRMED` via platform documentation and metadata. Synchronization is managed through the AI Studio web control plane rather than the container shell.
- **Independent Branch Isolation Across Multiple Build Workspaces**: `NOT_VERIFIED` / `PLATFORM_LIMITATION`. AI Studio Build sessions connect directly to the repository's configured synchronization target (default branch `main`). The Build container does not provide a native UI selector or CLI hook to isolate each Build session into an independent remote git branch.
- **Multi-Agent Workspace Implication**: If multiple agents edit files concurrently in separate Build sessions synced to the same GitHub repository, direct platform pushes risk race conditions, overwrite collisions, and merge conflicts.
- **Architectural Solution**: A strict **Integration-Lead Centralized Gatekeeping Protocol** combined with GitHub-managed feature branches and Pull Requests must govern all cross-agent code merges.

---

## 3. Team Structure & Role Responsibility Matrix

The preferred configuration is a 6-role specialized engineering team. A fallback matrix for 5-agent and 4-agent configurations is also defined.

### 3.1. Six-Role Preferred Model

| Role | Title | Core Responsibilities | File & Subsystem Ownership |
|---|---|---|---|
| **Member 01** | **Integration Lead & Technical Coordinator** | Architecture governance, cross-agent coordination, branch management, PR review, final integration verification, and progress logging. | `docs/*`, `ARCHITECTURE.md`, `architecture-baseline.json`, `scripts/check-architecture.ts`, `.github/*` |
| **Member 02** | **Database & Persistence Engineer** | Firestore schema design, database indexes, data integrity, atomic disk persistence, and backup/restore architecture. | `firebase-blueprint.json`, `firestore.indexes.json`, `src/utils/serverObjectStorage.ts`, `src/utils/serverJournalAdapters.ts` |
| **Member 03** | **Backend & API Engineer** | Node.js/Express server architecture, API routing, rate limiting, request validation, health probes, and tile proxy. | `server.ts`, `src/utils/serverUtilityRoutes.ts`, `src/utils/serverSponsorAndBargainRoutes.ts`, `src/utils/serverDeliveryAndAbuseGuard.ts` |
| **Member 04** | **Business Logic & PropTech Engineer** | Canonical Hedonic pricing engine, municipal calculations, 1405 tax/inheritance rules, trade-up models, and multi-city datasets. | `src/data/*` (`hedonicPricingEngine.ts`, `superModulesLogic.ts`, `legalAndBuildingLogic.ts`, `multiCityData.ts`) |
| **Member 05** | **Security & Integration Engineer** | Firebase Auth/Admin SDK, Firestore security rules, Telegram Bot API proxy, AI Gemini API integration, and audit logging. | `firestore.rules`, `security_spec.md`, `src/utils/serverAdminAndTelegramSecurity.ts`, `src/utils/security.ts`, `src/firebase.ts` |
| **Member 06** | **Frontend & Product Experience Engineer** | React 19 architecture, Leaflet map controls, modal studios, drawer UX, RTL/Persian localization, and mobile responsiveness. | `src/App.tsx`, `src/components/*` (`FloatingTopBar.tsx`, `NeighborhoodInspectorDrawer.tsx`, `AppModalsPortal.tsx`, `RadarBottomNav.tsx`) |

### 3.2. Fallback Responsibility-Merging Matrix

When fewer than 6 agents are active, responsibilities must merge strictly along compatible domain boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        5-AGENT TEAM MATRIX                             │
│  • Member 01: Integration Lead & Technical Coordinator                 │
│  • Member 02: Database & Backend Engineer (Merges M02 + M03)           │
│  • Member 03: Business Logic & Domain Engineer (M04)                   │
│  • Member 04: Security & Integrations Engineer (M05)                   │
│  • Member 05: Frontend & UX Engineer (M06)                             │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        4-AGENT TEAM MATRIX                             │
│  • Member 01: Integration Lead & Security Coordinator (M01 + M05)      │
│  • Member 02: Database & Backend Engineer (M02 + M03)                  │
│  • Member 03: Business Logic & Domain Engineer (M04)                   │
│  • Member 04: Frontend & UX Engineer (M06)                             │
└────────────────────────────────────────────────────────────────────────┘
```

#### Overload & Incompatibility Risks:
- **Prohibited Merge**: Never merge Frontend (M06) with Security (M05) or Database (M02). UI velocity conflicts with strict security/rules invariants.
- **Overload Warning in 4-Agent Setup**: Merging Integration Lead with Security (M01 + M05) creates a verification bottleneck; independent verification for M01's security changes must be peer-reviewed by Member 02.

---

## 4. Git Branching Architecture

### 4.1. Branch Topology
1. **Canonical Branch (`main`)**:
   - Represents the single source of truth and production-ready application state.
   - Protected: Direct pushes and force pushes are strictly prohibited.
2. **Workstream Feature Branches (`work/<ROLE>-<ID>/<slug>`)**:
   - Short-lived, single-purpose branches dedicated to a specific bounded workstream.
   - Standard Naming Syntax:
     - `work/DB-001/firestore-schema-hardening`
     - `work/BE-001/api-rate-limit-resilience`
     - `work/BL-001/hedonic-multi-city-calibration`
     - `work/SEC-001/rules-rbac-verification`
     - `work/FE-001/mobile-bottom-sheet-redesign`
     - `work/QA-001/integration-regression-suite`

### 4.2. Workstream Lifecycle & Coordination
```
[DISCOVERED] ──> [TRIAGED] ──> [READY]
                                  │
                                  ▼ (Lead authorizes branch creation)
                       [Branch: work/ROLE-ID/slug]
                                  │
                                  ▼ (Batch 1 implementation)
                            [IN_PROGRESS]
                                  │
                                  ▼ (Local tests pass)
                            [Open Draft PR]
                                  │
                                  ▼ (CI Quality Gates & Peer Review)
                             [VERIFYING]
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
             [Auto-Merge / PR]         [Failed Criteria]
                     │                         │
                     ▼                         ▼
                 [VERIFIED]           [Corrective Batch <= 2]
```

### 4.3. Commit Message Conventions
All commit messages must strictly follow the structured Conventional Commits format with workstream attribution:
```
<type>(<scope>): <workstream-id> — <concise summary in English or Persian>

[Optional body detailing rationale, affected files, and verification level]

Ref: <WORKSTREAM_ID>
```
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
- Example: `feat(valuation): BL-001 — align age depreciation curve with 1405 market survey`

---

## 5. Pull Request Lifecycle & Review Protocol

Every proposed code integration into `main` must occur via a GitHub Pull Request adhering to this standardized structure:

### 5.1. Standard PR Template
```markdown
### Workstream Metadata
- **Workstream ID**: `[e.g., BE-001]`
- **Lead Responsible**: `[e.g., Member 03 — Backend Engineer]`
- **Risk Level**: `[R0 / R1 / R2 / R3]`
- **Budget State**: Batch `[1/3]`, Corrective Iterations `[0/2]`

### Objective & Scope
- Concise description of the problem solved and exact bounded scope.

### Affected Files & Boundaries
- List of modified files (all non-legacy files confirmed `< 500` lines).
- Confirmed zero architectural dependency violations.

### Verification Evidence
- [x] `npm run lint` (0 errors)
- [x] `npm run arch:check` (0 errors)
- [x] `npm test` (All unit/security/contract suites pass)
- [x] `npx tsx tests/stress-50-cycles.test.ts` (50/50 pass)
- [x] `compile_applet` / `npm run build` (Clean build)

### Risk Classification & Approvals
- [ ] Routine R0/R1/R2 (Eligible for Conditional Auto-Merge)
- [ ] High-Impact R3 (Requires explicit human user approval before merge)
```

---

## 6. Conditional Automatic Merging (Auto-Merge) Design

To facilitate autonomous progression while guaranteeing stability, GitHub Auto-merge is conditionally enabled subject to 10 non-negotiable gates:

### 6.1. The Ten Mandatory Auto-Merge Gates
A Pull Request is eligible for automatic merge if and only if **ALL** 10 conditions are satisfied:
1. **Gate 1 (CI Gate A)**: TypeScript static check and linting pass (`npm run lint`, `npm run typecheck`).
2. **Gate 2 (CI Gate B)**: Architectural boundary check passes (`npm run arch:check` with 0 errors and zero line-count ceiling breaches).
3. **Gate 3 (CI Gate C)**: Automated unit, security, and static rules suites pass (`npm test`).
4. **Gate 4 (CI Gate D)**: 50-cycle continuous stress test passes (`tests/stress-50-cycles.test.ts`).
5. **Gate 5 (CI Gate E)**: Object storage security, auth, and range tests pass (`tests/object-storage-*.test.ts`).
6. **Gate 6 (CI Gate F)**: Production bundle compilation passes (`npm run build`).
7. **Gate 7 (Branch Freshness)**: PR branch is strictly up-to-date with `main` (Strict linear history, no merge conflicts).
8. **Gate 8 (Peer Review)**: Minimum of 1 approving review from an authorized peer role (Author cannot review own PR).
9. **Gate 9 (Conversation Resolution)**: All PR discussion threads and audit comments are marked resolved.
10. **Gate 10 (Scope & Risk Guard)**: The PR does NOT contain R3 high-impact operations.

### 6.2. Strict R3 Human Approval Exclusions (No Auto-Merge)
Auto-merge is strictly **DISALLOWED** for:
- Database schema changes or Firestore rules alterations (`firestore.rules`).
- Deletion or migration of persisted cloud/disk datasets.
- Authentication/authorization logic or delegated admin access changes.
- Server production port, domain, or hosting configuration modifications.
- Modifications to the governance charter (`RADAR-TEHRAN-OPERATING-CHARTER.md`).

*Any PR containing R3 items must halt at `VERIFYING`, request explicit human user approval, and await manual merge.*

---

## 7. Cross-Agent Contracts & File Ownership Rules

To prevent merge conflicts and race conditions, file ownership is strictly delineated:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EXCLUSIVE FILE OWNERSHIP                        │
│                                                                        │
│  [Member 01 - Lead]    ──> docs/*, ARCHITECTURE.md, scripts/*          │
│  [Member 02 - Database]──> firebase-blueprint.json, firestore.indexes  │
│  [Member 03 - Backend] ──> server.ts, src/utils/server*.ts             │
│  [Member 04 - Logic]   ──> src/data/*                                  │
│  [Member 05 - Security]──> firestore.rules, src/utils/security.ts      │
│  [Member 06 - Frontend]──> src/App.tsx, src/components/*               │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.1. Interface Boundary & Contract-First Principles
1. **Pre-Implementation Declaration**: Before modifying code, an agent must publish the proposed data structure or API contract in `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`.
2. **Backend/Frontend Handshake**: Member 03 (Backend) must freeze endpoint URLs, request payload schemas, and response codes before Member 06 (Frontend) begins component integration.
3. **Domain Engine Invariant**: `src/data/hedonicPricingEngine.ts` is the single source of truth for property valuation. Member 06 must never implement ad-hoc valuation logic inside UI components.
4. **Architectural Direction**: Imports must flow strictly downstream:
   `src/App.tsx` / `server.ts` → `src/components/*` → `src/data/*` → `src/utils/*` → `src/types/*`.
   Zero upward dependencies are permitted.

---

## 8. Conflict Resolution & Recovery Protocol

If a synchronization conflict or merge collision occurs:
1. **Immediate Freeze**: The affected workstream transitions to `BLOCKED`.
2. **Rebase against Canonical `main`**: The agent must rebase their workstream branch onto the latest `origin/main` rather than creating a tangled merge commit.
3. **Compare-And-Swap (CAS) Rule**: If conflicting edits exist in shared utility files, Member 01 (Integration Lead) adjudicates the conflict based on Version 22 charter priorities.
4. **Best-Known-State Rollback**: If a merged change introduces undetected regressions in CI, Member 01 initiates an immediate atomic revert of the merge commit to restore the last known verified build.

---

## 9. Recommended Onboarding & Execution Sequence

To initialize the engineering team safely, the following sequenced onboarding order is established:

1. **Step 1: Integration Lead Setup (`TEAM-SETUP-001`)** — *Completed in this invocation.*
2. **Step 2: Database & Backend Handshake (`SETUP-002`)** — Onboard Member 02 and Member 03 to formalize API endpoints and Firestore data models.
3. **Step 3: Business Logic & Security Baseline (`SETUP-003`)** — Onboard Member 04 and Member 05 to lock mathematical formulas and audit security rules.
4. **Step 4: Frontend & Mobile Integration (`SETUP-004`)** — Onboard Member 06 to align UI components with validated backend and logic contracts.
5. **Step 5: Full Multi-Agent Parallel Operation** — Authorize independent workstream branches.

---

## 10. Summary of Feasibility & Known Limitations

| Capability Dimension | Live Environment Status | Technical Classification | Operational Protocol |
|---|---|---|---|
| Local Git CLI in Container | Installed (`v2.34.1`) | `CONFIRMED` | Available for local script operations. |
| Container `.git` Directory | Not Present (`fatal: not a git repo`) | `FAILED` | Sync managed by AI Studio platform layer. |
| GitHub CI Quality Gates | Configured in `.github/workflows/ci.yml` | `CONFIRMED` | Enforces Gates A–F on `main` and `master`. |
| AI Studio Independent Branch Isolation | Unsupported natively in container | `NOT_VERIFIED` | Requires Lead-coordinated PR workflow on GitHub. |
| Strict Non-Increasing Line Count | Monitored by `check-architecture.ts` | `CONFIRMED` | Enforced at build and pre-commit levels. |
| Conditional Auto-Merge with R3 Block | Defined in architecture plan | `PROPOSED` | Ready for repository owner activation. |

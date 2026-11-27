# QA Test Register

| Test ID | Layer | Scope | Command / Trigger | Status | Evidence |
|---|---|---|---|---|---|
| QA-T-001 | Contract / structural regression | NIPS 1.0.0 golden-reference identity, 12 categories, 120 unique variables, declared counts, required metadata, null reference values, and non-publication invariants | `npm run test:contracts` | Added; execution pending | `tests/nips-golden-reference.test.ts`; wired into `package.json` and CI Gate C |
| QA-T-002 | CI integration | Confirm QA branch contract test is executed by GitHub Actions | Draft PR CI run | Pending | No run observed yet |

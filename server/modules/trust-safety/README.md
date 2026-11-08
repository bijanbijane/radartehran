# Employee 16 — Trust, Safety & Fraud Prevention Backend (`server/modules/trust-safety/`)

## 1. Domain Architecture & Boundaries
The Trust, Safety, Abuse Prevention, and Fraud Risk Management backend module (`server/modules/trust-safety/`) coordinates platform-wide reporting, investigation, evidence management, and enforcement without taking ownership of other modules' private data or business state machines.

### Strict Boundaries & Principles:
- **Owned Directory**: `server/modules/trust-safety/`
- **Allegation vs. Proof**: A user report is an allegation, not proof of wrongdoing.
- **Risk Signal vs. Judgment**: A risk score is an indicator, not an automatic sanction.
- **Enforcement Ownership Rule**: This module issues structured enforcement commands (`REQUESTED`, `ACCEPTED`, `APPLIED`); target modules (Bargains, Real Estate Professionals, Core) apply the actual state transitions.
- **Reporter Privacy**: Reporter UIDs are kept strictly confidential and never leaked to reported parties.

---

## 2. Moderation Case State Machine

```text
[OPEN] ---------------------> [AWAITING_TRIAGE] -----------------> [UNDER_REVIEW]
  |                                 |                                     |
  +---------> [DISMISSED]           +---------> [DISMISSED]               +-----> [AWAITING_EVIDENCE]
  |                                                                       |          |
  v                                                                       +-----> [ESCALATED]
[CLOSED] <------------------ [RESOLVED] <---------------------------------+          |
  ^                                                                                  v
  |                                                                             [RESOLVED] / [DISMISSED]
  +------------------------- [REOPENED] <---------------------------------------------+
```

---

## 3. Separation of Duties in Appeals
- An affected user can submit an appeal against eligible enforcement decisions.
- **Strict Invariant**: The reviewer UID of an appeal **must not** match the `issuingAuthorityUid` of the original enforcement decision. Self-review of appeals is structurally forbidden.

---

## 4. Evidence & Media Integration
- Evidence metadata, provenance, and confidentiality classifications reside in Trust & Safety.
- Binary media uploads are delegated to the Media module; raw binary files are never stored in case documents.

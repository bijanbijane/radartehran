# Real Estate Development & Construction Project Management Backend Module

Exclusive ownership: `server/modules/development-projects/`

## 1. Core Purpose

The Real Estate Development & Construction Project Management backend module manages the complete lifecycle of construction, land development, and renovation projects. It orchestrates project phases, task dependencies (with DAG cycle detection), budget planning, cost classification, procurement deliveries, quality inspections, change orders, risks, and handover closeouts without creating competing sources of truth for canonical properties, payments, or contractor profiles.

## 2. Data Ownership Boundaries

### This Module Owns:
- Development project records (`DevelopmentProjectRecord`)
- Project participants and scoped roles (`ProjectParticipant`)
- Project phases (`ProjectPhaseRecord`)
- Tasks & dependency relations (`ProjectTaskRecord`)
- Baseline and revised schedules (`ProjectScheduleVersionRecord`)
- Cost entries & classifications (`ProjectCostEntryRecord`)
- Procurement requests & delivery tracking (`ProjectProcurementRequestRecord`)
- Permit workflow metadata (`ProjectPermitRecord`)
- Quality inspections & defect correction history (`ProjectQualityInspectionRecord`)
- Change orders & budget/schedule impacts (`ProjectChangeOrderRecord`)
- Project risks & active issues (`ProjectRiskRecord`, `ProjectIssueRecord`)
- Project handover & completion records (`ProjectHandoverRecord`)
- Domain activity events (`DevelopmentDomainEvent`)

### This Module Does NOT Own:
- **Canonical Properties & Buildings**: Consumed via `PropertyRegistryAssetAdapter`.
- **Geographic Entities & Coordinates**: Consumed via `GeographyReferenceAdapter`.
- **Contractor & Service Provider Profiles**: Consumed via `PropertyServicesProviderAdapter`.
- **Document & Media Storage Binaries**: Consumed via `MediaStorageReferenceAdapter`.
- **User Authentication**: Obtained via verified principal tokens (`Core` module).
- **Notification Delivery**: Dispatched via `NotificationsEventAdapter`.
- **Payments & Accounting**: Manages cost records and budget commitments, not money movement or escrow.
- **Safety Investigations**: Escalated to Trust & Safety via `SafetyIncidentEscalationAdapter`.

## 3. Key Invariants & Algorithms

1. **DAG Circular Dependency Detection**:
   - Depth-First Search (DFS) with 3-color node classification ensures no circular dependencies exist among tasks.
2. **Blocked Task Enforcement**:
   - Tasks cannot be marked `completed` if prerequisite tasks remain uncompleted.
   - When a prerequisite task finishes, dependent tasks automatically transition from `blocked` to `ready`.
3. **Cost Classification Rigor**:
   - Differentiates between `planned_estimate`, `forecast`, `approved_commitment`, and `confirmed_expenditure`.
   - Never infers confirmed expenditure from unapproved estimates.
4. **Quality & Handover Gate**:
   - Handover cannot be scheduled or project closed if unresolved `critical` defects exist.

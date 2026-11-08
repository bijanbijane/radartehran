# RADAR

**The Digital Infrastructure Platform for Iran’s Real Estate Ecosystem**

RADAR is an agency-first, B2B-enabled, B2C-facing platform designed to improve how real estate information, listings, professional relationships, and customer inquiries are created, managed, discovered, and connected across Iran.

RADAR is not intended to be just another property listing website. Its long-term direction is to become a structured digital infrastructure layer for the real estate and property services ecosystem.

---

## 1. Vision

Build a trusted, connected, and data-driven digital infrastructure for Iran’s real estate ecosystem.

RADAR aims to connect:

- Property seekers and consumers
- Real estate agencies
- Real estate consultants and professionals
- Property information and listings
- Customer inquiries and business workflows
- Data, services, and future industry integrations

The platform will evolve incrementally, starting with a focused agency workflow and a consumer-facing marketplace, then expanding into professional tools, services, and intelligence capabilities.

## 2. Product Strategy

| Dimension | Decision |
|---|---|
| Product | RADAR |
| Positioning | Digital Infrastructure Platform |
| Initial Market Entry | Agency-first |
| Geography | Iran |
| Property Model | Hybrid |
| Business Tools | Phased |
| Audience | B2B + B2C |
| Go-to-Market | B2B-enabled, B2C-facing |
| Initial Architecture | Modular Monolith |
| Core Design Approach | API-first, Domain-driven Design |

### 2.1 Agency-first

Agencies and real estate professionals are the initial supply-side entry point.

RADAR will first help agencies organize, publish, maintain, and manage property listings and customer inquiries.

This does not mean the platform is exclusively for agencies. Consumers remain a core audience from the beginning.

### 2.2 Iran-wide by design

RADAR's information architecture and geographic model must support the entire Iranian market.

However, nationwide architectural coverage does not mean simultaneous operational launch in every city.

Market activation, agency onboarding, and local supply development will be phased.

### 2.3 Hybrid Property Model

A listing can be created without an existing structured property record.

Over time, listings may be linked to structured property records as information becomes available and matching confidence improves.

This approach allows RADAR to acquire market supply without requiring complete property data at the point of entry.

### 2.4 Phased Business Tools

Business capabilities will be introduced incrementally.

The initial focus is listing management and essential inquiry handling. More advanced CRM, automation, analytics, and business intelligence will follow only when validated by real agency workflows.

---

## 3. Product Ecosystem

RADAR is designed as a modular platform with interconnected capabilities.

### 3.1 Property Marketplace

The consumer-facing marketplace provides:

- Property discovery
- Search and filtering
- Property listing details
- Location-based exploration
- Listing freshness indicators
- Agency and professional information
- Contact and inquiry workflows
- Reporting and safety mechanisms

### 3.2 Agency Workspace

The agency workspace is the initial operational core of RADAR.

Its responsibilities include:

- Agency registration and onboarding
- Organization membership
- Basic role and permission management
- Listing creation and management
- Draft and publication workflows
- Listing assignment and reassignment
- Listing quality and freshness management
- Inquiry reception and follow-up
- Basic operational visibility

The workspace should prioritize speed, accuracy, and operational efficiency rather than merely presenting dashboard statistics.

### 3.3 Professional Network

A structured environment for real estate professionals, including:

- Professional profiles
- Agency affiliations
- Professional roles
- Relevant credentials and verification status
- Professional relationships and future collaboration capabilities

### 3.4 Lead & CRM

A phased business capability for managing customer inquiries and agency relationships.

The initial implementation focuses on essential inquiry handling and assignment. Advanced CRM workflows are planned for later phases.

### 3.5 Services

A future ecosystem for connecting real estate professionals and consumers with relevant property-related services.

### 3.6 Intelligence

A future data and intelligence layer that may provide:

- Market insights
- Supply and demand indicators
- Geographic analysis
- Listing performance
- Data quality analysis
- Professional and agency performance insights

AI capabilities must be introduced progressively and grounded in reliable data.

---

## 4. Core Domain Principles

The following principles are architectural constraints, not optional implementation preferences.

### 4.1 Listing is not Property

A `Property` represents a real-world property.

A `Listing` represents a commercial offer to sell, rent, or otherwise market a property.

These are independent domain entities.

Consequences:

- A listing may exist before a property record is available.
- One property may be associated with multiple listings.
- Different agencies may publish independent listings for the same property.
- A listing may be linked to a property later.
- Uncertain property matches must not be merged automatically.
- Property identity must not depend on the lifecycle of an individual listing.

### 4.2 Creator is not Owner

The user who creates a listing is not necessarily:

- The legal owner of the property
- The agency representing the offer
- The current manager of the listing
- The person authorized to publish it

The original creator must remain part of the historical record.

### 4.3 Organization is not Property Owner

An agency may represent a property listing commercially.

This relationship must never be interpreted as proof of legal ownership.

Agency representation, legal ownership, and authorization to offer a property are separate concepts.

### 4.4 Assignment is Temporal

Listing and lead responsibilities can change.

Assignments must support:

- Responsible user
- Role or assignment type
- Start and end timestamps
- Assignment history
- Reason for reassignment
- Active or inactive status

Changing the current assignee must not erase previous responsibility records.

### 4.5 Authorization is Explicit

Being a member of an agency does not automatically grant permission to publish, edit, delete, or access every resource belonging to that agency.

Permissions must be evaluated through explicit organizational membership, role, scope, resource, and action.

### 4.6 Publication is Channel-specific

Listing publication in different channels must be managed independently.

A listing may be active in one channel and paused or unavailable in another.

A change in one channel must not unintentionally change publication status in other channels.

### 4.7 Lead Ownership is not Lead Assignment

The organization responsible for a lead and the individual responsible for handling it are separate concepts.

Customer information must be protected through explicit access controls and auditable operations.

### 4.8 Data Quality is not Verification

The platform must distinguish between:

- Data completeness and consistency
- Verification of a specific claim
- Legal or documentary review
- Trust and safety moderation

A verification indicator must never imply a level of checking that has not actually been performed.

---

## 5. Listing Responsibility Model

Every listing must support clear and independently traceable responsibility relationships.

| Concept | Meaning |
|---|---|
| Created By | User who originally created the listing |
| Represented By | Agency or organization commercially representing the offer |
| Managed By | User or users currently responsible for managing the listing |
| Authorized By | Person or authority that approved a relevant action |
| Published Through | Channels through which the listing is distributed |

These relationships must not be inferred from one another.

A listing may be created by one consultant, represented by an agency, managed by another consultant, authorized by an appropriate organizational authority, and published through multiple channels.

The system must preserve this history.

---

## 6. Architecture Principles

RADAR will initially use a **Modular Monolith** architecture.

The purpose is to maintain strong domain boundaries without introducing the operational complexity of distributed services too early.

### 6.1 Architectural Approach

- Domain-driven Design
- Bounded Contexts
- API-first development
- Explicit domain ownership
- Clear module boundaries
- Controlled cross-module communication
- Auditable business operations
- Incremental scalability
- Testable business rules

### 6.2 Core Bounded Contexts

The architecture is expected to include the following domains:

| Domain | Primary Responsibility |
|---|---|
| Identity & Access | Users, authentication, authorization |
| Organizations | Agencies, memberships, organizational roles |
| Property Registry | Structured property records and relationships |
| Marketplace | Listings, publication, search-facing workflows |
| Lead & CRM | Inquiries, leads, assignments, interactions |
| Location | Geographic hierarchy and location data |
| Trust & Safety | Reports, moderation, risk handling |
| Verification | Verification processes and evidence |
| Media | Image and file management |
| Search | Discovery and indexing |
| Notifications | User and business notifications |
| Platform Operations | Administration, audit, platform configuration |

Each domain must own its business rules and data responsibilities.

Technical modules must not become uncontrolled shortcuts around domain boundaries.

### 6.3 Technology Direction

The following stack represents the proposed technical direction. Specific versions and final dependencies must be validated against the implementation environment before adoption.

| Layer | Proposed Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | NestJS, TypeScript |
| Primary Database | PostgreSQL |
| Geographic Data | PostGIS |
| Cache / Background Processing | Redis, when justified |
| Media Storage | S3-compatible object storage |
| API | REST, OpenAPI |
| Architecture | Modular Monolith |

PostgreSQL should remain the initial source of truth.

A dedicated search engine or separate analytics infrastructure should be introduced only when actual workload and performance requirements justify it.

Microservices are not an initial architectural requirement.

---

## 7. Data and Geographic Strategy

### 7.1 Geographic Model

RADAR must support a structured, Iran-wide geographic hierarchy.

The model should account for:

- Provinces
- Counties
- Cities
- Districts and neighborhoods
- Smaller geographic areas where appropriate
- Geographic coordinates and boundaries
- Alternative and historical place names
- Differences between official administrative divisions and commonly used local names

Geographic records should use stable identifiers rather than relying exclusively on display names.

### 7.2 Data Provenance

Important data must have traceable origins.

The platform should be able to identify:

- Where information came from
- Who entered or modified it
- When it was created or updated
- Whether it was verified
- What evidence supports a verification claim
- Whether it has been modified, disputed, or superseded

### 7.3 Property Data Quality

Property matching and data quality must be treated as progressive processes.

The system should distinguish between:

- Confirmed matches
- Potential matches
- Non-matches
- Records requiring manual review

Uncertain records must not be automatically merged.

---

## 8. Trust, Safety, and Security

Trust is a foundational product capability.

RADAR must provide explicit mechanisms for:

- User authentication
- Organizational access control
- Membership lifecycle management
- Verification status
- Listing reporting
- Moderation workflows
- Evidence management
- Sensitive customer data protection
- Audit history
- Abuse and fraud prevention

Verification must be claim-specific.

For example, verifying a phone number does not establish professional qualification, property ownership, or legal authorization to offer a property.

Security-sensitive operations must be permission-controlled and auditable.

The platform must follow privacy-by-design principles and minimize unnecessary exposure of customer and organizational data.

---

## 9. MVP Scope

The MVP is designed to validate one central assumption:

**Can real estate agencies use RADAR as a reliable operational tool for organizing property listings and receiving qualified customer inquiries?**

### 9.1 MVP Capabilities

**Identity and Organizations**
- User registration and authentication
- Agency creation and onboarding
- Organization memberships
- Basic roles and permissions

**Listing Management**
- Create and edit listings
- Draft management
- Listing submission and publication workflow
- Media management
- Basic listing assignment
- Listing responsibility visibility
- Basic representation and authorization records
- Listing status history

**Hybrid Property Foundation**
- Independent listing creation
- Optional property linking
- Basic structured property records
- Manual review of uncertain property matches

**Consumer Marketplace**
- Listing discovery
- Search and filtering
- Listing detail pages
- Inquiry and contact actions

**Inquiry Handling**
- Inquiry creation
- Agency-level association
- Basic lead assignment
- Essential follow-up status

**Trust and Safety**
- Basic listing reports
- Moderation workflow
- Essential audit records
- Basic verification indicators

**Platform Foundations**
- Persian language support
- Right-to-left interface
- Responsive design
- Operational monitoring
- Backup and recovery foundations

### 9.2 Outside the Initial MVP

The following capabilities should not expand the initial scope unless validated by a specific business need:

- Full CRM automation
- Comprehensive agency ERP
- Advanced sales management
- Full service-provider marketplace
- AI-based property valuation
- Advanced market intelligence
- Public developer API
- Online transaction settlement
- Automated legal ownership verification
- Complex business automation

The Domain Model may account for future evolution without requiring all future capabilities to be implemented in the MVP.

---

## 10. Product Roadmap

The roadmap is phased. Progression between phases should depend on validated outcomes rather than calendar assumptions alone.

| Phase | Focus | Expected Outcome |
|---|---|---|
| 0. Foundation & Validation | Product foundations, domain model, agency research, technical groundwork | Validated product assumptions and implementation foundation |
| 1. Agency-led Marketplace | Agency onboarding, listing management, consumer discovery, inquiry handling | Working agency supply and consumer demand loop |
| 2. Professional Workspace | Better assignments, team workflows, operational tools, CRM foundations | Increased agency workflow value and retention |
| 3. Services & Intelligence | Service connections, analytics, market insights | Expanded ecosystem capabilities |
| 4. Infrastructure Expansion | Integrations, advanced data capabilities, broader industry connectivity | Scalable real estate infrastructure |

Each phase should have explicit entry conditions, measurable exit criteria, and validated user demand.

Geographic expansion must be based on actual local supply, agency onboarding capacity, data quality, and marketplace liquidity.

---

## 11. Go-to-Market Strategy

RADAR follows a B2B-enabled, B2C-facing strategy.

The initial market development process should prioritize agency activation rather than attempting to acquire consumers without sufficient property supply.

An Agency Pilot should include:

1. Selecting a representative group of agencies
2. Understanding their existing listing workflows
3. Onboarding agencies and their teams
4. Importing or entering initial listing data
5. Training users
6. Providing operational support
7. Measuring listing activity and freshness
8. Measuring inquiry handling and response
9. Evaluating repeat usage and retention

Pilot results should inform product priorities and quantitative MVP exit thresholds.

---

## 12. Success Metrics

RADAR should measure meaningful marketplace and workflow outcomes rather than superficial activity.

### North Star Metric

**Weekly Qualified Property Connections**

A qualified property connection represents a meaningful interaction between a property seeker and the responsible supply-side participant through a relevant listing.

Its operational definition must specify:

- What qualifies as a connection
- How duplicate interactions are handled
- How spam and invalid inquiries are excluded
- How attribution is assigned
- How organization and professional ownership are recorded

Clicks and repeated contact actions alone must not be counted as qualified connections.

### Supporting Metrics

**Supply**
- Activated Agencies
- Active Listings
- Listing Freshness Rate
- Listing Completeness
- Geographic Coverage

**Demand**
- Search Success Rate
- Relevant Listing Discovery
- Qualified Inquiries
- Qualified Property Connections

**Agency Workflow**
- Listing Creation Completion
- Time to Publish
- Assignment Completion
- Lead Follow-up Rate
- Agency Retention

**Trust and Data Quality**
- Report Rate
- Moderation Resolution Time
- Verification Coverage
- Potential Duplicate Rate
- Data Quality Score

Metrics must have documented definitions, data sources, and calculation rules before becoming formal performance targets.

Numerical thresholds must be established using research and pilot data, not arbitrary assumptions.

---

## 13. Repository Structure

The following is the intended logical repository organization. Actual paths and implementation details should follow the existing repository structure.

```text
radar/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── admin/
│
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── config/
│   └── contracts/
│
├── docs/
│   ├── strategy/
│   ├── architecture/
│   ├── domain/
│   ├── product/
│   ├── api/
│   └── operations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│
├── README.md
└── ...
```

This structure is a target organizational model, not a claim that all listed applications and packages have already been implemented.

### Documentation Principles

Project documentation should have clear ownership:

- Product Strategy defines why and where RADAR competes.
- Architecture defines how the system is structured.
- Domain Model defines entities, relationships, responsibilities, and business invariants.
- MVP Definition defines what is included in the initial product.
- API specifications define external and internal contracts.
- Operational documentation defines deployment, monitoring, recovery, and maintenance.

When documents conflict, the conflict must be resolved explicitly rather than silently interpreted differently by different contributors.

---

## 14. Engineering Principles

All implementation work should follow these principles:

1. Domain boundaries must remain explicit.
2. Business rules must not be duplicated across modules.
3. Authorization must be enforced on the server side.
4. Sensitive operations must be auditable.
5. Data ownership and provenance must be traceable.
6. Listing and Property must remain separate concepts.
7. Historical responsibility must be preserved.
8. API contracts must be documented.
9. Tests must cover business invariants and critical workflows.
10. Database changes must be version-controlled through migrations.
11. Error handling and observability must be designed into critical workflows.
12. Accessibility, responsiveness, Persian typography, and RTL must be treated as core requirements.

### Testing Priorities

Testing should cover:

- Domain invariants
- Organization membership and permission boundaries
- Listing lifecycle transitions
- Listing responsibility changes
- Property and Listing relationships
- Channel-specific publication
- Lead ownership and assignment
- Sensitive data access
- Moderation and verification workflows
- Critical end-to-end agency and consumer journeys

---

## 15. Non-goals and Explicit Constraints

RADAR must avoid the following premature or misleading directions:

- Becoming a generic listing portal without meaningful agency workflows
- Treating an agency as the legal owner of a listed property
- Treating a listing as the property itself
- Assuming the listing creator is its current manager
- Granting organization-wide access by default
- Automatically merging uncertain property records
- Treating a verification badge as universal proof of legal validity
- Launching all geographic markets simultaneously
- Building a full ERP before validating core agency workflows
- Introducing microservices before operational and domain complexity justify them
- Building AI features on top of unreliable or insufficient data
- Expanding the MVP without evidence of user demand

---

## 16. Open Decisions

The following topics require explicit validation and should not be treated as finalized merely because they appear in a high-level architecture:

- Final brand hierarchy and naming conventions
- Detailed legal and regulatory verification processes
- Agency onboarding and data-import standards
- Final permission matrix
- Detailed geographic reference data sources
- Property matching and deduplication thresholds
- Search infrastructure scaling strategy
- Pricing and monetization model
- Third-party integration priorities
- Quantitative MVP exit criteria
- Data retention and deletion policies

Open decisions must be documented and resolved through evidence, product requirements, or technical validation.

---

## 17. Fundamental Architecture Principle

Every important data record in RADAR must have:

- A clearly identified owner
- A traceable source
- A defined responsible party
- An explicit access boundary
- A history of relevant changes

This principle applies across users, agencies, properties, listings, inquiries, leads, and platform operations.

**RADAR must preserve the distinction between what a record represents, who created it, who is responsible for it, who is authorized to act on it, and what evidence supports it.**

---

## 18. Current Project Status

RADAR is in the product definition and architecture preparation stage.

The strategic direction and major architectural constraints have been established.

The next engineering milestones are:

1. Finalize the domain model.
2. Validate entity relationships and ownership rules.
3. Produce and review the ERDs.
4. Finalize the MVP requirements and permission boundaries.
5. Establish the repository and development conventions.
6. Begin implementation with the core agency and marketplace workflows.

Implementation readiness must be assessed against the actual state of the repository, validated specifications, and completed technical foundations.

---

**RADAR — Building the digital infrastructure for Iran’s real estate ecosystem.**

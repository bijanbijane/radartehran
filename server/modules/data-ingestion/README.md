# Employee 14 — External Data Ingestion & Data Governance Module

## 1. Overview & Architectural Role
The External Data Ingestion and Source-Governance module (`server/modules/data-ingestion/`) provides a secure, governed staging and audit pipeline for importing external structured datasets into the Radartehran platform without corrupting canonical domain boundaries.

### Architectural Invariant
- **Staging and Governance Only**: This module is **not** the canonical owner of bargains, neighborhoods, geography, or market observations. It strictly manages external source metadata, ingestion jobs, staged records, invalid/ambiguous quarantine, validation reports, and import reconciliation.
- **Approved Publication Gate**: Imported data never writes directly to destination tables or public endpoints. Data must pass through normalization, schema validation, quarantine isolation, deduplication, and administrative approval before being published to destination domains via the `DestinationDomainPublisherAdapter`.
- **Anti-Scraping & Legal Basis**: External sources without verified and approved legal and technical bases are rejected (`legalAndTechnicalBasisApproved: true` is strictly required). Unauthorized web scraping, credential scraping, or bypassing access controls is forbidden.

---

## 2. Directory Structure & Line Count Governance
All files adhere to the strict `< 500` lines ratchet limit:
```
server/modules/data-ingestion/
├── types.ts                      # Canonical models, provenance envelopes, and adapter contracts (~261 lines)
├── normalizationAndValidation.ts # Strict schema validators, CSV/JSON parsers & deduplication hashes (~452 lines)
├── service.ts                    # Durable transactional service with resumable cursor offset (~415 lines)
├── routes.ts                     # Isolated Express router factory with standard error boundaries (~153 lines)
├── index.ts                      # Module barrel export (~4 lines)
├── README.md                     # Architecture, workflow, and data-quality governance documentation
└── __tests__/
    └── dataIngestion.test.ts     # Complete unit & integration test suite (~452 lines)
```

---

## 3. Data-Quality & Governance Policy

### A. Zero Fabrication & Preservation of Raw Source
- Missing or invalid attributes (e.g., `cityId`, `hoodId`, price metrics) are **never fabricated** or guessed.
- Every staged or quarantined record preserves the exact original payload in `rawSourceRecord` alongside cryptographic hash digests (`rawPayloadHashSha256`, `recordFingerprint`).

### B. Quarantine Isolation (`/ingestionQuarantine/{jobId}_row_{rowIndex}`)
Records failing validation are immediately quarantined with detailed `ValidationIssue` reports. Quarantine reasons include:
1. `SCHEMA_VALIDATION_FAILED`: Missing required keys, invalid types, or out-of-range metrics.
2. `AMBIGUOUS_RECORD`: Unresolved conflicting source values across references.
3. `MALFORMED_ROW`: Structural parsing failures in CSV rows or JSON objects.

### C. Natural Key & Fingerprint Deduplication
Within each import job, duplicate rows are detected using two orthogonal indices:
1. Canonical content fingerprint: `ingestionDedupIndex/{jobId}_fp_{recordFingerprint}`.
2. Domain natural key: `ingestionDedupIndex/{jobId}_nk_{hex(naturalKey)}`.
Duplicates increment `duplicateSkippedCount` without polluting staged records.

### D. Repeatable & Resumable Batch Processing
- Batch imports maintain an explicit `cursorOffset`.
- If an import is interrupted (`status: 'interrupted'`), re-running the job safely skips all rows with `rowIndex < cursorOffset`, ensuring zero record loss and zero duplication.

### E. Reconciliation Reports (`/ingestionReconciliationReports/{jobId}`)
Guarantees mathematically verified accounting:
$$\text{processedCount} = \text{validStagedCount} + \text{duplicateSkippedCount} + \text{quarantinedInvalidCount}$$
Reports indicate whether the dataset is balanced (`reconciledBalanced: true`) and track remaining unprocessed rows.

---

## 4. Source Registry Schema (`StoredIngestionSource`)
Stored at `/ingestionSources/{sourceId}`:
- `id`: Unique identifier matching `^[a-zA-Z0-9_-]{3,80}$`.
- `sourceName`: Human-readable dataset/publisher title.
- `authorityOrPublisher`: Responsible institutional entity.
- `dataCategory`: Category (`geographic_reference`, `market_observations`, `economic_demographic_indicators`, `construction_development`, `public_property_statistics`, `official_city_neighborhood_datasets`, `other_structured_dataset`).
- `supportedSchemaVersion`: Compatible schema version (e.g., `1.0.0`).
- `licenseOrUsageTerms`: Permitted usage or open-data terms.
- `legalAndTechnicalBasisApproved`: Explicit boolean verification.
- `ownerUid`, `ownerEmail`: Authenticated administrator who registered the source.
- `status`: `'active' | 'suspended' | 'deprecated'`.
- `latestSourceVersion`, `latestJobId`: Track historical iterations and detect version shifts.

---

## 5. Provenance Tracking Envelope (`RecordProvenanceEnvelope`)
Attached to every staged and published record:
- `sourceId`, `sourceName`, `authorityOrPublisher`, `dataCategory`.
- `sourceVersion`, `schemaVersion`, `licenseOrUsageTerms`.
- `jobId`, `importMethod` (`manual_entry` | `structured_file`).
- `retrievalOrSubmissionDateIso`, `rowIndex`.
- `rawPayloadHashSha256`, `recordFingerprint`.
- `ingestedByUid`, `ingestedAtIso`.
- `approvedByUid`, `approvedAtIso` (stamped upon admin approval).

---

## 6. End-to-End Import Workflow
1. **Register Data Source** (`POST /sources`): Admin registers source with legal/technical basis assertions.
2. **Create Ingestion Job** (`POST /jobs`): Configures expected rows, versions, and import method.
3. **Ingest Batches / Files** (`POST /jobs/:jobId/batches` or `POST /jobs/:jobId/structured-file`): Ingests JSON arrays or CSV lines, parses, normalizes, detects duplicates, stages valid rows, quarantines invalid rows, and updates reconciliation metrics.
4. **Admin Moderation** (`POST /jobs/:jobId/moderate`): Admin reviews staged counts, reconciliation report, and approves or rejects the job.
5. **Publish to Owning Domain** (`POST /jobs/:jobId/publish`): Invokes `DestinationDomainPublisherAdapter.publishApprovedRecords()` to transfer approved staged records with full provenance.
6. **Reconciliation Inspection** (`GET /jobs/:jobId/reconciliation`): Audits record accounting.

---

## 7. Integration Handoff for Integration Lead
1. **Mount Router**: Mount `createDataIngestionRouter(deps)` under `/api/v2/admin/data-ingestion`.
2. **Wire Destination Adapter**: Connect `DestinationDomainPublisherAdapter` to downstream domains (`Geography`, `Market Analytics`).
3. **Firestore Blueprint & Security Rules**: Register the `/ingestionSources`, `/ingestionJobs`, `/ingestionStaging`, `/ingestionQuarantine`, and `/ingestionReconciliationReports` collections as server-managed Admin SDK entities.

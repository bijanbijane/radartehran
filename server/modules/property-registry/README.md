# Property Asset & Building Registry Backend Module (Employee 17)

## 1. Mission and Exclusive Ownership
- **Assigned Feature Branch**: `feature/backend-property-registry`
- **Exclusive Directory**: `server/modules/property-registry/`
- **Responsibility**: Authoritative registry for physical real estate assets, buildings, units, and land parcels across Tehran Radar, decoupled from ephemeral marketing listings (Bargains).

## 2. Architecture & Design Principles

### A. Separation of Physical Assets vs. Listings
- **Physical Property Asset (`StoredPropertyAsset`)**: Represents the durable physical entity in reality (land parcel, building, or unit). It persists independently of whether it is currently advertised or for sale.
- **Listing (`StoredAssetListingLink`)**: Advertisements owned by the Bargains module. Assets link to listings with explicit relationship types (`active_sale`, `active_rent`, `historical_sale`, `unverified_claim`), allowing a single physical property asset to have multiple historical listings across years without data duplication.
- **Pre-link Compatibility Checks**: Strict validation ensures that a listing cannot be linked to an asset unless geographic identifiers (`cityId`, `hoodId`) match exactly and area divergence is under 15%.

### B. Hierarchy of Physical Real Estate
1. **Land Parcel (`StoredLandParcel`)**: Ground-level cadastral and zoning entity with land use classification (`residential`, `commercial`, `mixed`, etc.).
2. **Building (`StoredBuilding`)**: Physical structure containing one or more units, tracking structural type, total floors, construction year, completion status, and common facilities.
3. **Building Unit (`StoredBuildingUnit`)**: Discrete interior unit inside a building with distinct unit number/ref, floor, area, usage type (`residential`, `commercial`, `office`, `storage`, `parking`).
4. **Property Asset (`StoredPropertyAsset`)**: The primary entity referencing parcel, building, and unit where applicable, or standalone for unbundled properties.

### C. Entity Resolution & Safe Duplicate Detection
- **No Automatic Irreversible Merges**: Duplicate candidates (`StoredDuplicateMatchCandidate`) are identified via heuristic scoring (`duplicateAndRelationshipEngine.ts`) and surfaced for human or authorized reviewer evaluation.
- **Scoring Heuristics**:
  - Exact building ID + matching unit reference: 90 score.
  - Same neighborhood, identical category, floor, and Jalali construction year with area divergence $\le 3\%$: 85 score.
  - Coordinate distance $\le 25\text{m}$ with matching category and area divergence $\le 5\%$: 80 score.
- **Non-Destructive Merge Architecture**:
  - Merging an asset does not delete records.
  - The secondary asset's status transitions to `merged`, with `mergedIntoAssetId` pointing to the primary asset.
  - The primary asset gains an alias in `aliases` preserving the legacy ID and merge timestamp.
  - Audit trail history records are logged for both primary and secondary assets.

### D. Location Privacy & Public Views
- Exact coordinates, private unit addresses, and provenance metadata are quarantined in `exactLocationPrivate`.
- Public API views (`PublicPropertyAssetView`) sanitized via `sanitizeAssetForPublicView()` strip private coordinates, aliases, and internal audit keys, exposing only coarse neighborhood geographic references.

## 3. Directory Layout
```
server/modules/property-registry/
├── __tests__/
│   └── propertyRegistry.test.ts          # Comprehensive unit test suite (5 subtests)
├── duplicateAndRelationshipEngine.ts     # Duplicate scoring & listing compatibility engines
├── index.ts                              # Module barrel re-export
├── lifecycleAndValidation.ts             # Input schemas, catalogs, and public sanitization
├── README.md                             # Canonical module documentation
├── routes.ts                             # Isolated Express Router
├── service.ts                            # Core PropertyRegistryService application logic
└── types.ts                              # Domain models, enums, adapters, and repositories
```

## 4. REST API Endpoint Inventory
The module exports an isolated Express router in `routes.ts`:

| Method | Path | Description | Access / Roles |
|---|---|---|---|
| `POST` | `/assets` | Register a new property asset | `authenticated` (agents, admins) |
| `GET` | `/assets/:id` | Fetch an asset by ID (with optional `?view=public`) | Public or authenticated |
| `GET` | `/assets` | Query assets with filters and pagination | Public or authenticated |
| `POST` | `/buildings` | Register a physical building | `authenticated` |
| `GET` | `/buildings/:id` | Fetch building details | Public or authenticated |
| `POST` | `/buildings/:buildingId/units` | Register a unit inside a building | `authenticated` |
| `GET` | `/buildings/:buildingId/units` | List all units inside a building | Public or authenticated |
| `POST` | `/parcels` | Register a land parcel | `authenticated` |
| `GET` | `/parcels/:id` | Fetch land parcel details | Public or authenticated |
| `GET` | `/assets/:id/duplicate-candidates` | Run duplicate detection for an asset | `admin`, `system` |
| `POST` | `/assets/merge` | Execute non-destructive merge | `admin`, `system` |
| `POST` | `/assets/:id/links` | Link asset to a Bargains listing | `authenticated` |
| `DELETE` | `/assets/:id/links/:listingId` | Unlink asset from a listing | `authenticated`, `admin` |
| `GET` | `/assets/:id/history` | Retrieve asset audit & provenance history | `admin`, `system` |

## 5. Verification Commands
Run the module tests and verification:
```bash
npx tsx --test server/modules/property-registry/__tests__/propertyRegistry.test.ts
```

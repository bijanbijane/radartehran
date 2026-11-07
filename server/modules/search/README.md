# Employee 9: Property Search and Discovery Backend

Module Directory: `/server/modules/search/`

## Architecture Overview
The Property Search and Discovery module provides a fast, read-model query engine for publicly approved property listings across Tehran and supported metropolitan cities.

### Key Architecture Rules & Invariants
1. **Single Source of Truth**:
   - `Bargains` (`ServerPublishedBargains` & validated multi-city neighborhood dataset) remains the exclusive canonical source of records.
   - The Search module does NOT create a second or disconnected listing database.
2. **Strict Access & Visibility Control**:
   - Listings with lifecycle states other than `approved` or `active` (e.g. `pending`, `rejected`, `archived`) are completely excluded from public search results.
   - Contact phone numbers are redacted unless public disclosure policy is explicitly met (`contactVisibility === 'publicly_visible'`).
3. **Persian Normalization & Search Quality**:
   - Query text normalizes Persian/Arabic digits, replaces Arabic letter variants (ي/ك ➔ ی/ک), strips invisible formatting tokens (ZWNJ/LRM/RLM), and handles punctuation.
   - Bounded Levenshtein distance handles minor single-character typos in neighborhood names without unbounded query expansion.
4. **Stable Sorting & Cursor Pagination**:
   - Tie-breaks every sort condition with document ID (`id.localeCompare`) ensuring deterministic, non-skipping pagination.
   - Uses cursor-based pagination with configurable page limits (`1..50`, default `20`).
5. **Query Cost Controls**:
   - Query parameters are bounded and validated (rejecting incompatible filters such as `minPrice > maxPrice`).
   - Limits response sizes and avoids unbounded joins or scans.

## Integration Handoff
To mount this module in the main application:
```typescript
import { registerPropertySearchRoutes } from './modules/search';

// Inside server setup:
registerPropertySearchRoutes(app, { checkRateLimit, getClientIp });
```

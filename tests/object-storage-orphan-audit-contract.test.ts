/**
 * Contract tests for the resumable Object Storage orphan-audit API.
 *
 * These are static regression checks, not HTTP integration tests.
 * Runtime behavior must also be exercised with a test Firestore database.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const routeSource = fs.readFileSync(
  path.join(
    rootDir,
    'src/utils/serverObjectStorage.ts',
  ),
  'utf8',
);

const helperSource = fs.readFileSync(
  path.join(
    rootDir,
    'src/utils/serverObjectStorageHelpers.ts',
  ),
  'utf8',
);

const securitySource = fs.readFileSync(
  path.join(
    rootDir,
    'src/utils/serverAdminAndTelegramSecurity.ts',
  ),
  'utf8',
);

// 1. The API must have distinct start, step and status routes.
assert.match(
  routeSource,
  /\/api\/object-storage\/admin\/orphan-audit\/jobs/,
  'Audit job creation route must exist',
);

assert.match(
  routeSource,
  /\/api\/object-storage\/admin\/orphan-audit\/jobs\/:auditId\/step/,
  'Resumable audit step route must exist',
);

assert.match(
  routeSource,
  /\/api\/object-storage\/admin\/orphan-audit\/jobs\/:auditId/,
  'Audit status and result route must exist',
);

// 2. Admin authorization must guard every route.
assert.match(
  routeSource,
  /verifyAdminApiAuthorization/,
  'Admin authorization helper must be used',
);

// 3. Pagination must use an explicit document ID cursor.
assert.match(
  routeSource,
  /orderBy\(FieldPath\.documentId\(\)\)/,
  'Audit query must have deterministic document ordering',
);

assert.match(
  routeSource,
  /startAfter\(job\.lastDocumentId\)/,
  'Audit must resume from its persisted cursor',
);

// 4. The scan must have bounded work.
assert.match(
  routeSource,
  /ORPHAN_AUDIT_MAX_PAGES_PER_STEP/,
);

assert.match(
  routeSource,
  /ORPHAN_AUDIT_MAX_TOTAL_PAGES/,
);

// 5. The job state and cursor must be persisted.
assert.match(
  routeSource,
  /persistOrphanAuditJob\(job\)/,
);

assert.match(
  routeSource,
  /lastDocumentId:\s*job\.lastDocumentId/,
);

// 6. The audit report must not itself delete media.
assert.match(
  routeSource,
  /deletionPerformed:\s*false/,
);

assert.match(
  routeSource,
  /classifyStoredObjectReference/,
);

// 7. The database accessor must reuse the validated configuration.
assert.match(
  securitySource,
  /getFirebaseAdminFirestoreForServer/,
);

assert.match(
  securitySource,
  /EXPECTED_FIRESTORE_DATABASE_ID/,
);

// 8. The record model must support retryable cleanup state.
assert.match(
  helperSource,
  /deletionState\?:\s*'active'\s*\|\s*'pending_delete'/,
);

// 9. A malformed report file must fail closed.
assert.match(
  routeSource,
  /ORPHAN_AUDIT_JOB_SCHEMA_INVALID/,
);

console.log(
  'Object Storage orphan-audit contract tests passed.',
);

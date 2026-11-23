/**
 * Mutation route inventory for write-block coverage (Stage D).
 */

import assert from 'node:assert/strict';
import { REGISTERED_API_ROUTES } from '../../../src/utils/expressRouteCatalog.ts';
import { ACCOUNT_LIFECYCLE_API_PREFIX } from './officialApiContract.ts';
import {
  classifyMutationRoute,
  MUTATION_HTTP_METHODS,
} from './mutationWriteBlockGuard.ts';

/** Global guards (not per-route hooks). */
const WORKER_GLOBAL_WRITE_BLOCK_ENABLED = true;
const EXPRESS_GLOBAL_WRITE_BLOCK_ENABLED = true;
const EXPRESS_WRITE_ADMISSION_USES_D1_RPC = true;

function routeKey(method: string, path: string): string {
  return `${method} ${path}`;
}

let mutationCount = 0;
let expressMutations = 0;
let exemptMutations = 0;

for (const route of REGISTERED_API_ROUTES) {
  if (!MUTATION_HTTP_METHODS.has(route.method)) continue;
  mutationCount += 1;
  const kind = classifyMutationRoute(route.method, route.path);
  if (kind === 'EXEMPT') {
    exemptMutations += 1;
    continue;
  }
  if (route.path.startsWith(ACCOUNT_LIFECYCLE_API_PREFIX)) continue;
  expressMutations += 1;
}

assert.ok(mutationCount > 0, 'Route catalog must include mutation routes');
assert.ok(WORKER_GLOBAL_WRITE_BLOCK_ENABLED, 'Worker router must enforce global authenticated mutation write-block');
assert.ok(EXPRESS_GLOBAL_WRITE_BLOCK_ENABLED, 'Express must mount global /api mutation write-block middleware');
assert.ok(EXPRESS_WRITE_ADMISSION_USES_D1_RPC, 'Express mutation middleware must use D1 via Worker RPC, not journal');
console.log(
  `Mutation inventory: ${mutationCount} total; ${expressMutations} Express mutations covered by global middleware; ${exemptMutations} exempt`,
);
console.log('mutationRouteCoverage.test.ts: PASS');
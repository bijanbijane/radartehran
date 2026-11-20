import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { enqueueReindexJob, getJobSnapshot, resetSearchIndexRepositoryForTests } from '../server/modules/search/searchIndexRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import { processPendingSearchReindexJobs } from '../server/modules/search/searchReindexWorker';
import { getCanonicalSearchEngine } from '../server/modules/search/searchCompositionRoot';

async function testReindexDoesNotCompleteImmediately() {
  const tmp = path.join(os.tmpdir(), `rt-reindex-${Date.now()}`);
  setRepositoryBaseDirForTests(tmp);
  resetSearchIndexRepositoryForTests();
  process.env.ALLOW_DEMO_SEARCH_DATA = 'true';
  const job = enqueueReindexJob({ scope: 'ALL', idempotencyKey: 'test-key-1' });
  assert.notEqual(job.status, 'COMPLETED');
  const engine = getCanonicalSearchEngine();
  await processPendingSearchReindexJobs(engine);
  const done = getJobSnapshot(job.jobId);
  assert.ok(done);
  assert.equal(done?.status, 'COMPLETED');
  assert.ok((done?.processedCount ?? 0) >= 0);
  setRepositoryBaseDirForTests(null);
  delete process.env.ALLOW_DEMO_SEARCH_DATA;
}

void testReindexDoesNotCompleteImmediately().then(() => console.log('search-reindex-durable-execution: ok'));
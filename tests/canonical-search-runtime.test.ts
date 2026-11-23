import assert from 'node:assert/strict';
import express from 'express';
import { registerGlobalSearchGovernanceAndAnalyticsRoutes } from '../server/modules/search/globalSearchAndGovernanceGateway';
import { resetSearchIndexRepositoryForTests } from '../server/modules/search/searchIndexRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import path from 'node:path';
import os from 'node:os';

async function withTestApp<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const tmp = path.join(os.tmpdir(), `rt-search-${Date.now()}`);
  setRepositoryBaseDirForTests(tmp);
  resetSearchIndexRepositoryForTests();
  process.env.ALLOW_DEMO_SEARCH_DATA = 'true';
  const app = express();
  app.use(express.json());
  registerGlobalSearchGovernanceAndAnalyticsRoutes(app, {
    checkRateLimit: () => true,
    getClientIp: () => '127.0.0.1',
  });
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    setRepositoryBaseDirForTests(null);
    delete process.env.ALLOW_DEMO_SEARCH_DATA;
  }
}

async function testV2SearchReturnsResults() {
  await withTestApp(async (base) => {
    const res = await fetch(`${base}/api/v2/search/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'سعادت‌آباد', scope: 'ALL', sort: 'RELEVANCE', filters: { cityId: 'tehran' } }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { totalCount: number; requestId: string };
    assert.ok(body.totalCount >= 0);
    assert.ok(body.requestId);
  });
}

void testV2SearchReturnsResults().then(() => console.log('canonical-search-runtime: ok'));
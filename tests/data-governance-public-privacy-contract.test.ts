import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { registerDataGovernanceRoutes } from '../server/modules/data-governance/dgovRoutes';
import { resetServerDgovRepositoryForTests } from '../server/modules/data-governance/dgovRepository';

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  registerDataGovernanceRoutes(app, { getIp: () => '127.0.0.1' });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3000;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    resetServerDgovRepositoryForTests();
  }
}

async function jsonGet(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

resetServerDgovRepositoryForTests();

await withServer(async (base) => {
  const claimsRes = await jsonGet(`${base}/api/v1/data-governance/claims`);
  assert.equal(claimsRes.status, 200);
  const claims = claimsRes.body.claims as Array<Record<string, unknown>>;
  for (const c of claims) {
    assert.equal('createdBy' in c, false);
    assert.equal('sourceId' in c, false);
    assert.equal('evidenceRefs' in c, false);
  }
  assert.equal(Array.isArray(claimsRes.body.auditLogs), true);
  assert.equal((claimsRes.body.auditLogs as unknown[]).length, 0);

  const corrRes = await jsonGet(`${base}/api/v1/data-corrections`);
  assert.equal(corrRes.status, 200);
  const proposals = corrRes.body.proposals as Array<Record<string, unknown>>;
  for (const p of proposals) {
    assert.equal('proposerUserId' in p, false);
    assert.equal('reviewerNoteFa' in p, false);
  }

  const adminRes = await jsonGet(`${base}/api/admin/data-governance/claims`);
  assert.equal(adminRes.status, 401);
});

console.log('data-governance-public-privacy-contract.test.ts PASS');
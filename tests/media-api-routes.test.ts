/**
 * RT-INFRA-011 — Media API route registration (isolated Express).
 */
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { registerMediaModuleRoutes } from '../server/modules/media/mediaRoutes';
import { createMediaModuleFacade, DeterministicByteStorageProvider } from '../server/modules/media';

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  const byteStorage = new DeterministicByteStorageProvider({
    environmentMode: 'development',
    durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
  });
  registerMediaModuleRoutes(app, { facade: createMediaModuleFacade({ byteStorage }) });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function runTests(): Promise<void> {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/media/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { routesMounted?: boolean; durableBackend?: string };
    assert.equal(body.routesMounted, true);
    assert.equal(body.durableBackend, 'memory');

    const unauth = await fetch(`${baseUrl}/api/media/uploads/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'x' }),
    });
    assert.equal(unauth.status, 401);

    const ownerList = await fetch(`${baseUrl}/api/media/owner/objects`);
    assert.equal(ownerList.status, 401);
  });

  let mountCount = 0;
  const app = express();
  const facade = createMediaModuleFacade({
    byteStorage: new DeterministicByteStorageProvider({
      environmentMode: 'development',
      durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
    }),
  });
  registerMediaModuleRoutes(app, { facade });
  registerMediaModuleRoutes(app, { facade });
  app.get('/_probe', (_req, res) => {
    mountCount += 1;
    res.status(200).end('ok');
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await fetch(`http://127.0.0.1:${port}/_probe`);
  server.close();
  assert.equal(mountCount, 1);

  console.log('[media-api-routes.test] PASS');
}

runTests().catch((error) => {
  console.error('[media-api-routes.test] FAIL', error);
  process.exit(1);
});
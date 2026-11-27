import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createInMemoryGeospatialModuleForTests } from '../server/modules/geospatial/moduleFactory';
import { createCloudflareSessionBridgeMiddleware } from '../src/utils/serverCloudflareSessionBridge';
import { createCloudflareSessionAssertion } from '../worker/auth/sessionAssertion';
import type { WorkerSessionPrincipal } from '../worker/auth/sessionAuth';

const SECRET = 'gis-cloudflare-approval-test-secret-with-at-least-32-bytes';
const CORRELATION_ID = 'gis_approval-12345678';
const ENTITY_ID = 'hood:tehran:77';
const GEOMETRY = {
  type: 'Polygon' as const,
  coordinates: [[
    [51.30, 35.70],
    [51.40, 35.70],
    [51.40, 35.80],
    [51.30, 35.80],
    [51.30, 35.70],
  ]],
};

function sessionPrincipal(uid: string, isAdmin: boolean): WorkerSessionPrincipal {
  return {
    authenticated: true,
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    phoneNumber: null,
    displayName: uid,
    isAdmin,
    isPrimaryAdmin: isAdmin,
    isDelegatedAdmin: false,
    authProvider: 'google',
    authTimeSeconds: Math.floor(Date.now() / 1000),
    statusCode: 200,
    reasonCode: 'SESSION_VERIFIED',
  };
}

async function assertionFor(uid: string, isAdmin: boolean, url: string): Promise<string> {
  return createCloudflareSessionAssertion({
    request: new Request(url, { method: 'POST' }),
    principal: sessionPrincipal(uid, isAdmin),
    secret: SECRET,
    correlationId: CORRELATION_ID,
  });
}

void (async () => {
  const { service, router } = createInMemoryGeospatialModuleForTests();
  const pending = await service.upsertNeighborhoodBoundary({
    actorUid: 'boundary-creator',
    entityId: ENTITY_ID,
    cityId: 'tehran',
    hoodId: 77,
    level: 'neighborhood',
    nameFa: 'محلهٔ آزمون ۷۷',
    geometry: GEOMETRY,
    sourceProvenance: 'gis_cloudflare_session_approval_test',
    autoApprove: false,
  });
  assert.equal(pending.status, 'PENDING_REVIEW');

  const path = `/api/v1/geospatial/neighborhood-boundaries/tehran/77/versions/${pending.id}/approve`;
  const url = `http://127.0.0.1${path}`;
  const app = express();
  app.use(createCloudflareSessionBridgeMiddleware({ AUTH_INTERNAL_HMAC_SECRET: SECRET }));
  app.use('/api/v1/geospatial', router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `http://127.0.0.1:${address.port}${path}`;

    const anonymous = await fetch(endpoint, {
      method: 'POST',
      headers: { 'x-correlation-id': CORRELATION_ID },
    });
    assert.equal(anonymous.status, 403);

    const memberAssertion = await assertionFor('ordinary-member', false, url);
    const nonAdmin = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-correlation-id': CORRELATION_ID,
        'x-radar-worker-hop': '1',
        'x-radar-session-assertion': memberAssertion,
      },
    });
    assert.equal(nonAdmin.status, 403);

    const creatorAdminAssertion = await assertionFor('boundary-creator', true, url);
    const selfApproval = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-correlation-id': CORRELATION_ID,
        'x-radar-worker-hop': '1',
        'x-radar-session-assertion': creatorAdminAssertion,
      },
    });
    assert.equal(selfApproval.status, 403);

    const adminAssertion = await assertionFor('independent-reviewer', true, url);
    const approved = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-correlation-id': CORRELATION_ID,
        'x-radar-worker-hop': '1',
        'x-radar-session-assertion': adminAssertion,
      },
    });
    assert.equal(approved.status, 200);
    assert.equal(service.getActiveBoundary(ENTITY_ID)?.reviewedByUid, 'independent-reviewer');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  console.log('geospatial-cloudflare-session-approval: ok');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

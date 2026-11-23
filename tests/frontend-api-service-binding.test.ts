import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchFrontendWorkerEdgeRequest } from '../apps/frontend/worker/router';
import type { WorkerEnv, WorkerRequestContext } from '../worker/types';

test('frontend Service Binding forwards user bearer and Firebase App Check tokens unchanged', async () => {
  const originalBody = JSON.stringify({ operation: 'read-only-health-probe' });
  const request = new Request('https://radartehran-frontend.example/api/internal/forwarding-contract', {
    method: 'POST',
    headers: {
      authorization: 'Bearer user-access-token-test-fixture',
      'x-firebase-appcheck': 'firebase-app-check-test-fixture',
      'content-type': 'application/json',
      'x-correlation-id': 'corr_forward_001',
    },
    body: originalBody,
  });

  let forwarded: Request | null = null;
  const env: WorkerEnv = {
    RADAR_API: {
      fetch: async (input) => {
        assert.ok(input instanceof Request);
        forwarded = input;
        return new Response(JSON.stringify({ status: 'ok', received: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  };

  const ctx: WorkerRequestContext = {
    request,
    env,
    url: new URL(request.url),
    requestId: 'req_forward_001',
    correlationId: 'corr_forward_001',
    method: 'POST',
    pathname: '/api/internal/forwarding-contract',
    clientIp: '127.0.0.1',
    trustedEdgeIp: false,
    environment: 'production',
    startedAtMs: Date.now(),
    routeId: 'SERVICE_BINDING_FORWARDING_TEST',
    implementationId: 'frontend-service-binding-test',
  };

  const result = await dispatchFrontendWorkerEdgeRequest(ctx);
  assert.ok(result);
  assert.equal(result.routePattern, 'API_SERVICE_BINDING');
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('x-radar-api-proxy'), 'service-binding');
  assert.ok(forwarded);
  assert.equal(forwarded.method, 'POST');
  assert.equal(new URL(forwarded.url).pathname, '/api/internal/forwarding-contract');
  assert.equal(forwarded.headers.get('authorization'), 'Bearer user-access-token-test-fixture');
  assert.equal(forwarded.headers.get('x-firebase-appcheck'), 'firebase-app-check-test-fixture');
  assert.equal(await forwarded.text(), originalBody);
});

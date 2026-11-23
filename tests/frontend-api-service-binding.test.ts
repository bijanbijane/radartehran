import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchFrontendWorkerEdgeRequest } from '../apps/frontend/worker/router';
import type { WorkerEnv, WorkerRequestContext } from '../worker/types';

test('frontend Service Binding forwards opaque session cookies and preserves backend Set-Cookie headers', async () => {
  const originalBody = JSON.stringify({ operation: 'read-only-health-probe' });
  const sessionCookie = '__Host-radar_session=' + 'A'.repeat(64);
  const request = new Request('https://radartehran-frontend.example/api/internal/forwarding-contract', {
    method: 'POST',
    headers: {
      cookie: sessionCookie,
      origin: 'https://radartehran-frontend.example',
      'content-type': 'application/json',
      'x-correlation-id': 'corr_forward_cookie_001',
    },
    body: originalBody,
  });

  const captured: { request?: Request } = {};
  const upstreamHeaders = new Headers({ 'content-type': 'application/json' });
  upstreamHeaders.append('set-cookie', '__Host-radar_session=rotated-session-token; Path=/; HttpOnly; Secure; SameSite=Lax');
  upstreamHeaders.append('set-cookie', '__Host-radar_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  const env: WorkerEnv = {
    RADAR_API: {
      fetch: async (input) => {
        assert.ok(input instanceof Request);
        captured.request = input;
        return new Response(JSON.stringify({ status: 'ok', received: true }), {
          status: 200,
          headers: upstreamHeaders,
        });
      },
    },
  };

  const ctx: WorkerRequestContext = {
    request,
    env,
    url: new URL(request.url),
    requestId: 'req_forward_cookie_001',
    correlationId: 'corr_forward_cookie_001',
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
  assert.ok(captured.request);
  const forwarded = captured.request;
  assert.equal(forwarded.method, 'POST');
  assert.equal(new URL(forwarded.url).pathname, '/api/internal/forwarding-contract');
  assert.equal(forwarded.headers.get('cookie'), sessionCookie);
  assert.equal(forwarded.headers.get('authorization'), null);
  assert.equal(forwarded.headers.get('x-firebase-appcheck'), null);
  assert.equal(await forwarded.text(), originalBody);
  const getSetCookie = (result.response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  assert.ok(getSetCookie, 'runtime must expose multiple Set-Cookie values without collapsing them');
  assert.equal(getSetCookie.call(result.response.headers).length, 2);
});


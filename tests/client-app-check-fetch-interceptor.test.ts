import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppCheckAwareFetch } from '../src/utils/clientAppCheck';

test('adds App Check token to same-origin API requests and preserves Firebase ID token', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createAppCheckAwareFetch(
    originalFetch,
    'https://radar.example',
    async () => 'firebase-app-check-token-fixture',
  );

  const request = new Request('https://radar.example/api/account/profile', {
    method: 'POST',
    headers: {
      authorization: 'Bearer firebase-id-token-fixture',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ update: true }),
  });
  const response = await wrappedFetch(request);
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].headers.get('authorization'), 'Bearer firebase-id-token-fixture');
  assert.equal(captured[0].headers.get('x-firebase-appcheck'), 'firebase-app-check-token-fixture');
  assert.equal(await captured[0].text(), JSON.stringify({ update: true }));
});

test('never forwards App Check tokens to third-party origins', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createAppCheckAwareFetch(
    originalFetch,
    'https://radar.example',
    async () => 'firebase-app-check-token-fixture',
  );

  await wrappedFetch('https://api.example.net/v1/resource');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].headers.has('x-firebase-appcheck'), false);
});

test('does not overwrite an explicit App Check token supplied by the caller', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createAppCheckAwareFetch(
    originalFetch,
    'https://radar.example',
    async () => 'replacement-token',
  );

  await wrappedFetch('https://radar.example/api/admin/worker-diagnostics', {
    headers: { 'X-Firebase-AppCheck': 'caller-token' },
  });
  assert.equal(captured[0].headers.get('x-firebase-appcheck'), 'caller-token');
});

test('preserves the request when App Check token acquisition fails', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createAppCheckAwareFetch(
    originalFetch,
    'https://radar.example',
    async () => { throw new Error('APP_CHECK_TOKEN_UNAVAILABLE'); },
  );

  await wrappedFetch('https://radar.example/api/account/profile', {
    headers: { authorization: 'Bearer firebase-id-token-fixture' },
  });
  assert.equal(captured[0].headers.get('authorization'), 'Bearer firebase-id-token-fixture');
  assert.equal(captured[0].headers.has('x-firebase-appcheck'), false);
});

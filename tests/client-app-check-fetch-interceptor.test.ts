import test from 'node:test';
import assert from 'node:assert/strict';
import type { FirebaseApp } from 'firebase/app';
import {
  createFirebaseAuthenticatedApiFetch,
  installClientAppCheckFetchInterceptor,
} from '../src/utils/clientAppCheck';

test('adds Firebase ID and App Check tokens to same-origin API requests', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createFirebaseAuthenticatedApiFetch(
    originalFetch,
    'https://radar.example',
    async () => 'firebase-id-token-fixture',
    async () => 'firebase-app-check-token-fixture',
  );

  const body = JSON.stringify({ update: true });
  const request = new Request('https://radar.example/api/account/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const response = await wrappedFetch(request);
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].headers.get('authorization'), 'Bearer firebase-id-token-fixture');
  assert.equal(captured[0].headers.get('x-firebase-appcheck'), 'firebase-app-check-token-fixture');
  assert.equal(await captured[0].text(), body);
});

test('never forwards Firebase tokens to third-party origins', async () => {
  const captured: Request[] = [];
  let tokenCalls = 0;
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createFirebaseAuthenticatedApiFetch(
    originalFetch,
    'https://radar.example',
    async () => { tokenCalls += 1; return 'id-token'; },
    async () => { tokenCalls += 1; return 'app-check-token'; },
  );

  await wrappedFetch('https://api.example.net/v1/resource');
  assert.equal(captured.length, 1);
  assert.equal(tokenCalls, 0);
  assert.equal(captured[0].headers.has('authorization'), false);
  assert.equal(captured[0].headers.has('x-firebase-appcheck'), false);
});

test('does not overwrite explicit Firebase tokens supplied by the caller', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createFirebaseAuthenticatedApiFetch(
    originalFetch,
    'https://radar.example',
    async () => 'replacement-id-token',
    async () => 'replacement-app-check-token',
  );

  await wrappedFetch('https://radar.example/api/admin/worker-diagnostics', {
    headers: {
      authorization: 'Bearer caller-id-token',
      'x-firebase-appcheck': 'caller-app-check-token',
    },
  });
  assert.equal(captured[0].headers.get('authorization'), 'Bearer caller-id-token');
  assert.equal(captured[0].headers.get('x-firebase-appcheck'), 'caller-app-check-token');
});

test('preserves the request when token acquisition fails', async () => {
  const captured: Request[] = [];
  const originalFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const wrappedFetch = createFirebaseAuthenticatedApiFetch(
    originalFetch,
    'https://radar.example',
    async () => { throw new Error('FIREBASE_ID_TOKEN_UNAVAILABLE'); },
    async () => { throw new Error('APP_CHECK_TOKEN_UNAVAILABLE'); },
  );

  await wrappedFetch('https://radar.example/api/account/profile');
  assert.equal(captured[0].headers.has('authorization'), false);
  assert.equal(captured[0].headers.has('x-firebase-appcheck'), false);
});

test('installs cleanly when window.fetch is a configurable getter-only property', async () => {
  const captured: Request[] = [];
  const baseFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const mockWin = { location: { origin: 'https://radar.example' } } as unknown as Pick<Window, 'fetch'> & {
    location: { origin: string };
  };
  Object.defineProperty(mockWin, 'fetch', {
    get: () => baseFetch,
    enumerable: true,
    configurable: true,
  });

  const installed = installClientAppCheckFetchInterceptor(
    {} as FirebaseApp,
    async () => 'id-token-getter-only',
    mockWin,
  );
  assert.equal(installed, true);

  await mockWin.fetch('https://radar.example/api/account/profile');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].headers.get('authorization'), 'Bearer id-token-getter-only');
});

test('installs cleanly when fetch is a getter-only property on Window prototype', async () => {
  const captured: Request[] = [];
  const baseFetch: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push(request);
    return new Response('ok', { status: 200 });
  };
  const proto = {};
  Object.defineProperty(proto, 'fetch', {
    get: () => baseFetch,
    enumerable: true,
    configurable: true,
  });
  const mockWin = Object.create(proto) as Pick<Window, 'fetch'> & { location: { origin: string } };
  mockWin.location = { origin: 'https://radar.example' };

  const installed = installClientAppCheckFetchInterceptor(
    {} as FirebaseApp,
    async () => 'id-token-proto-getter',
    mockWin,
  );
  assert.equal(installed, true);

  await mockWin.fetch('https://radar.example/api/account/profile');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].headers.get('authorization'), 'Bearer id-token-proto-getter');
});

test('degrades gracefully without throwing when window.fetch is non-configurable getter-only', () => {
  const baseFetch: typeof fetch = async () => new Response('ok', { status: 200 });
  const mockWin = { location: { origin: 'https://radar.example' } } as unknown as Pick<Window, 'fetch'> & {
    location: { origin: string };
  };
  Object.defineProperty(mockWin, 'fetch', {
    get: () => baseFetch,
    enumerable: true,
    configurable: false,
  });

  const installed = installClientAppCheckFetchInterceptor(
    {} as FirebaseApp,
    async () => 'id-token-frozen',
    mockWin,
  );
  assert.equal(installed, false);
  assert.equal(mockWin.fetch, baseFetch);
});

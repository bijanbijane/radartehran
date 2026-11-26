import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorkerAuthContext } from '../worker/auth/authorizationPolicy';
import { RADAR_SESSION_COOKIE } from '../worker/auth/sessionAuth';

test('anonymous Worker requests remain anonymous without calling an identity provider', async () => {
  const result = await resolveWorkerAuthContext(
    new Request('https://radartehran.ir/api/v1/private'),
    { env: { APP_URL: 'https://radartehran.ir' } },
  );
  assert.equal(result.authenticated, false);
  assert.equal(result.mode, 'anonymous');
  assert.equal(result.failureCode, undefined);
});

test('Firebase Bearer tokens are explicitly retired and never trigger JWKS network verification', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Firebase JWKS must not be fetched');
  };
  try {
    const result = await resolveWorkerAuthContext(
      new Request('https://radartehran.ir/api/private', {
        headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.old.token' },
      }),
      { env: { APP_URL: 'https://radartehran.ir' } },
    );
    assert.equal(result.authenticated, false);
    assert.equal(result.failureCode, 'FIREBASE_BEARER_TOKEN_RETIRED');
    assert.equal(result.failureStatusCode, 401);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('static admin tokens are rejected even without a bearer token', async () => {
  const result = await resolveWorkerAuthContext(
    new Request('https://radartehran.ir/api/admin', {
      headers: { 'x-admin-token': 'historical-admin-token' },
    }),
    { env: { APP_URL: 'https://radartehran.ir' } },
  );
  assert.equal(result.authenticated, false);
  assert.equal(result.failureCode, 'STATIC_ADMIN_TOKEN_RETIRED');
  assert.equal(result.failureStatusCode, 403);
});

test('duplicate Authorization headers fail closed', async () => {
  const headers = new Headers();
  headers.append('Authorization', 'Bearer one');
  headers.append('Authorization', 'Bearer two');
  const result = await resolveWorkerAuthContext(
    new Request('https://radartehran.ir/api/private', { headers }),
    { env: { APP_URL: 'https://radartehran.ir' } },
  );
  assert.equal(result.authenticated, false);
  assert.equal(result.failureCode, 'AMBIGUOUS_AUTH_HEADER');
  assert.equal(result.failureStatusCode, 400);
});

test('a present D1 session cookie fails closed when USER_DB is unavailable', async () => {
  const result = await resolveWorkerAuthContext(
    new Request('https://radartehran.ir/api/private', {
      headers: { cookie: RADAR_SESSION_COOKIE + '=' + 'A'.repeat(64) },
    }),
    { env: { APP_URL: 'https://radartehran.ir' } },
  );
  assert.equal(result.authenticated, false);
  assert.equal(result.failureCode, 'USER_DB_UNAVAILABLE');
  assert.equal(result.failureStatusCode, 503);
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthClient } from '../src/platform/auth/core/authClient';

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Cloudflare browser session AuthClient', () => {
  it('hydrates the browser identity from the same-origin D1 cookie session', async () => {
    const originalFetch = globalThis.fetch;
    let request: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    globalThis.fetch = async (input, options) => {
      request = input;
      init = options;
      return jsonResponse(200, {
        authenticated: true,
        user: {
          uid: 'usr_session_1',
          email: 'person@example.com',
          emailVerified: true,
          displayName: 'Session User',
          authProvider: 'google',
          isAdmin: true,
        },
      });
    };
    try {
      const client = new AuthClient();
      const user = await client.refreshSession();
      assert.equal(String(request), '/api/auth/session');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.cache, 'no-store');
      assert.equal(user?.uid, 'usr_session_1');
      assert.equal(user?.authProvider, 'google');
      assert.deepEqual(user?.customClaims, { isAdmin: true });
      assert.equal(client.getState(), 'READY');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('clears stale local identity when the server reports no active session', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse(200, { authenticated: false, user: null });
    try {
      const client = new AuthClient();
      client.setUser({
        uid: 'usr_stale',
        email: null,
        phoneNumber: null,
        displayName: null,
        emailVerified: false,
        authProvider: 'unknown',
        providerIds: [],
        isAnonymous: false,
      });
      await client.refreshSession();
      assert.equal(client.getUser(), null);
      assert.equal(client.getState(), 'UNAUTHENTICATED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sends logout to the server after immediately clearing local session state', async () => {
    const originalFetch = globalThis.fetch;
    let request: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    globalThis.fetch = async (input, options) => {
      request = input;
      init = options;
      return jsonResponse(200, { status: 'logged_out' });
    };
    try {
      const client = new AuthClient();
      client.setUser({
        uid: 'usr_logout',
        email: null,
        phoneNumber: null,
        displayName: null,
        emailVerified: false,
        authProvider: 'unknown',
        providerIds: [],
        isAnonymous: false,
      });
      await client.logout();
      assert.equal(client.getUser(), null);
      assert.equal(client.getState(), 'UNAUTHENTICATED');
      assert.equal(String(request), '/api/auth/logout');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.cache, 'no-store');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails closed when the session endpoint returns an HTTP error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse(503, { code: 'USER_DB_UNAVAILABLE' });
    try {
      const client = new AuthClient();
      await assert.rejects(client.refreshSession(), /USER_DB_UNAVAILABLE/);
      assert.equal(client.getUser(), null);
      assert.equal(client.getState(), 'UNAUTHENTICATED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

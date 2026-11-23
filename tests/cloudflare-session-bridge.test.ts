import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  createCloudflareSessionBridgeMiddleware,
  getCloudflareSessionContext,
  verifyCloudflareSessionAssertion,
} from '../src/utils/serverCloudflareSessionBridge';
import {
  createCloudflareSessionAssertion,
  CLOUDFLARE_SESSION_ASSERTION_TTL_MS,
} from '../worker/auth/sessionAssertion';
import type { WorkerSessionPrincipal } from '../worker/auth/sessionAuth';
import {
  verifyAuthenticatedUserHeader,
  verifyAdminApiAuthorization,
} from '../src/utils/serverAdminAndTelegramSecurity';

const SECRET = 'test-auth-session-bridge-secret-with-more-than-32-bytes';
const NOW = 1_800_000_000_000;
const CORRELATION_ID = 'cf_test-12345678';
const REQUEST_URL = 'https://radartehran.ir/api/account/profile?tab=security';

function principal(overrides: Partial<WorkerSessionPrincipal> = {}): WorkerSessionPrincipal {
  return {
    authenticated: true,
    uid: 'google:123456789',
    email: 'member@example.com',
    emailVerified: true,
    phoneNumber: null,
    displayName: 'Member',
    isAdmin: false,
    isPrimaryAdmin: false,
    isDelegatedAdmin: false,
    authProvider: 'google',
    authTimeSeconds: Math.floor(NOW / 1000),
    statusCode: 200,
    reasonCode: 'SESSION_VERIFIED',
    ...overrides,
  };
}

async function makeAssertion(
  session = principal(),
  request = new Request(REQUEST_URL, { method: 'POST' }),
  nowMs = NOW,
): Promise<string> {
  return createCloudflareSessionAssertion({
    request,
    principal: session,
    secret: SECRET,
    correlationId: CORRELATION_ID,
    nowMs,
  });
}

function bind(overrides: Partial<{
  method: string;
  path: string;
  correlationId: string;
  workerHop: string | undefined;
}> = {}) {
  return {
    method: 'POST',
    path: '/api/account/profile?tab=security',
    correlationId: CORRELATION_ID,
    workerHop: '1',
    ...overrides,
  };
}

function resign(assertion: string, mutate: (payload: Record<string, unknown>) => void): string {
  const [payloadPart] = assertion.split('.');
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<string, unknown>;
  mutate(payload);
  const nextPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SECRET).update(nextPayload).digest('base64url');
  return `${nextPayload}.${signature}`;
}

interface MiddlewareInvocation {
  readonly nextCalled: boolean;
  readonly statusCode?: number;
  readonly body?: unknown;
  readonly assertionHeaderAfter: unknown;
  readonly contextInNext: ReturnType<typeof getCloudflareSessionContext>;
}

async function invokeMiddleware(params: {
  readonly assertion?: string | string[];
  readonly secret?: string;
  readonly method?: string;
  readonly path?: string;
  readonly correlationId?: string;
  readonly workerHop?: string;
}): Promise<MiddlewareInvocation> {
  const headers: Record<string, string | string[] | undefined> = {
    'x-correlation-id': params.correlationId ?? CORRELATION_ID,
    'x-radar-worker-hop': params.workerHop ?? '1',
  };
  if (params.assertion !== undefined) headers['x-radar-session-assertion'] = params.assertion;
  const req = {
    headers,
    method: params.method ?? 'POST',
    originalUrl: params.path ?? '/api/account/profile?tab=security',
    url: params.path ?? '/api/account/profile?tab=security',
  } as unknown as Request;

  let statusCode: number | undefined;
  let body: unknown;
  let nextCalled = false;
  let contextInNext: ReturnType<typeof getCloudflareSessionContext> = null;
  const res = {
    setHeader() { return this; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;

  const middleware = createCloudflareSessionBridgeMiddleware(
    params.secret === undefined ? { AUTH_INTERNAL_HMAC_SECRET: SECRET } : { AUTH_INTERNAL_HMAC_SECRET: params.secret },
    () => NOW,
  );
  middleware(req, res, () => {
    nextCalled = true;
    contextInNext = getCloudflareSessionContext();
  });

  return {
    nextCalled,
    statusCode,
    body,
    assertionHeaderAfter: headers['x-radar-session-assertion'],
    contextInNext,
  };
}

describe('Cloudflare Worker -> Express session assertion bridge', () => {
  it('signs and verifies a D1 session against the exact method, path, query, correlation and hop', async () => {
    const assertion = await makeAssertion();
    const result = verifyCloudflareSessionAssertion(assertion, bind(), SECRET, NOW + 1_000);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.principal.uid, 'google:123456789');
      assert.equal(result.principal.email, 'member@example.com');
      assert.equal(result.principal.authProvider, 'google');
    }
  });

  it('supports a verified phone-only identity without inventing an email address', async () => {
    const phonePrincipal = principal({
      uid: 'phone:4f5b9c9d',
      email: null,
      emailVerified: false,
      phoneNumber: '+989121234567',
      authProvider: 'phone',
    });
    const assertion = await makeAssertion(phonePrincipal);
    const result = verifyCloudflareSessionAssertion(assertion, bind(), SECRET, NOW);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.principal.email, null);
      assert.equal(result.principal.phoneNumber, '+989121234567');
    }
  });

  it('rejects unauthenticated or unverified principals before signing', async () => {
    await assert.rejects(
      () => makeAssertion(principal({ authenticated: false })),
      /AUTH_SESSION_BRIDGE_PRINCIPAL_INVALID/,
    );
    await assert.rejects(
      () => makeAssertion(principal({ emailVerified: false })),
      /AUTH_SESSION_BRIDGE_PRINCIPAL_INVALID/,
    );
    await assert.rejects(
      () => makeAssertion(principal({ authProvider: 'unknown' })),
      /AUTH_SESSION_BRIDGE_PRINCIPAL_INVALID/,
    );
  });

  it('rejects signature tampering and a different shared secret', async () => {
    const assertion = await makeAssertion();
    const [payload, signature] = assertion.split('.');
    const tampered = `${payload.slice(0, -1)}A.${signature}`;

    const invalidSignature = verifyCloudflareSessionAssertion(tampered, bind(), SECRET, NOW);
    const wrongSecret = verifyCloudflareSessionAssertion(assertion, bind(), 'another-secret-that-is-also-over-32-bytes', NOW);

    assert.equal(invalidSignature.ok, false);
    if (!invalidSignature.ok) assert.equal(invalidSignature.code, 'AUTH_SESSION_ASSERTION_SIGNATURE_INVALID');
    assert.equal(wrongSecret.ok, false);
    if (!wrongSecret.ok) assert.equal(wrongSecret.code, 'AUTH_SESSION_ASSERTION_SIGNATURE_INVALID');
  });

  it('rejects method, path, query, correlation and Worker-hop mismatches', async () => {
    const assertion = await makeAssertion();
    const mismatches = [
      bind({ method: 'GET' }),
      bind({ path: '/api/account/profile?tab=other' }),
      bind({ path: '/api/account/profile' }),
      bind({ correlationId: 'cf_other-12345678' }),
      bind({ workerHop: undefined }),
    ];

    for (const binding of mismatches) {
      const result = verifyCloudflareSessionAssertion(assertion, binding, SECRET, NOW);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, 'AUTH_SESSION_ASSERTION_REQUEST_MISMATCH');
    }
  });

  it('rejects expired, future-issued and overlong assertions', async () => {
    const assertion = await makeAssertion();
    const expired = resign(assertion, payload => {
      payload.issuedAtMs = NOW - 31_000;
      payload.expiresAtMs = NOW - 1;
    });
    const future = resign(assertion, payload => {
      payload.issuedAtMs = NOW + 6_000;
      payload.expiresAtMs = NOW + 36_000;
    });
    const overlong = resign(assertion, payload => {
      payload.expiresAtMs = Number(payload.issuedAtMs) + CLOUDFLARE_SESSION_ASSERTION_TTL_MS + 1;
    });

    for (const token of [expired, future, overlong]) {
      const result = verifyCloudflareSessionAssertion(token, bind(), SECRET, NOW);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, 'AUTH_SESSION_ASSERTION_EXPIRED');
    }
  });

  it('fails closed when the shared secret is absent or too short', async () => {
    const assertion = await makeAssertion();
    const absent = verifyCloudflareSessionAssertion(assertion, bind(), undefined, NOW);
    const short = verifyCloudflareSessionAssertion(assertion, bind(), 'too-short', NOW);

    assert.equal(absent.ok, false);
    assert.equal(short.ok, false);
    if (!absent.ok) assert.equal(absent.statusCode, 503);
    if (!short.ok) assert.equal(short.code, 'AUTH_SESSION_BRIDGE_NOT_CONFIGURED');
  });

  it('removes the private header and exposes the principal only inside the Express request context', async () => {
    const assertion = await makeAssertion();
    const invocation = await invokeMiddleware({ assertion });

    assert.equal(invocation.nextCalled, true);
    assert.equal(invocation.assertionHeaderAfter, undefined);
    assert.equal(invocation.contextInNext?.uid, 'google:123456789');
    assert.equal(getCloudflareSessionContext(), null);
  });

  it('rejects malformed duplicate assertion headers and strips them before returning', async () => {
    const invocation = await invokeMiddleware({ assertion: ['part.one', 'part.two'] });

    assert.equal(invocation.nextCalled, false);
    assert.equal(invocation.statusCode, 400);
    assert.equal(invocation.assertionHeaderAfter, undefined);
    assert.deepEqual(invocation.body, {
      status: 'error',
      code: 'AUTH_SESSION_ASSERTION_HEADER_AMBIGUOUS',
    });
  });

  it('fails closed when the Express bridge secret is not provisioned', async () => {
    const assertion = await makeAssertion();
    const invocation = await invokeMiddleware({ assertion, secret: '' });

    assert.equal(invocation.nextCalled, false);
    assert.equal(invocation.statusCode, 503);
    assert.equal(invocation.assertionHeaderAfter, undefined);
    assert.deepEqual(invocation.body, {
      status: 'error',
      code: 'AUTH_SESSION_BRIDGE_NOT_CONFIGURED',
    });
  });

  it('keeps unauthenticated legacy requests working when no assertion header is present', async () => {
    const invocation = await invokeMiddleware({});

    assert.equal(invocation.nextCalled, true);
    assert.equal(invocation.contextInNext, null);
  });

  it('lets the legacy user authorization helper consume the verified context without a Firebase bearer token', async () => {
    const assertion = await makeAssertion();
    const reqHeaders = {
      'x-correlation-id': CORRELATION_ID,
      'x-radar-worker-hop': '1',
      'x-radar-session-assertion': assertion,
    };
    const req = {
      headers: reqHeaders,
      method: 'POST',
      originalUrl: '/api/account/profile?tab=security',
      url: '/api/account/profile?tab=security',
    } as unknown as Request;
    const res = {
      setHeader() { return this; },
      status(code: number) { return this; },
      json(value: unknown) { return this; },
    } as unknown as Response;

    let verified: Awaited<ReturnType<typeof verifyAuthenticatedUserHeader>> | undefined;
    const done = new Promise<void>((resolve, reject) => {
      createCloudflareSessionBridgeMiddleware(
        { AUTH_INTERNAL_HMAC_SECRET: SECRET },
        () => NOW,
      )(req, res, () => {
        void verifyAuthenticatedUserHeader({}, {}).then(value => {
          verified = value;
          resolve();
        }).catch(reject);
      });
    });
    await done;

    assert.equal(verified?.authorized, true);
    assert.equal(verified?.uid, 'google:123456789');
    assert.equal(verified?.authSource, 'cloudflare_session');
  });

  it('authorizes D1 primary and delegated admins without querying Firestore', async () => {
    const adminSessions = [
      principal({
        uid: 'google:primary',
        email: 'primary@example.com',
        isAdmin: true,
        isPrimaryAdmin: true,
      }),
      principal({
        uid: 'google:delegated',
        email: 'delegate@example.com',
        isAdmin: true,
        isDelegatedAdmin: true,
      }),
    ];

    for (const adminPrincipal of adminSessions) {
      const assertion = await makeAssertion(adminPrincipal);
      const req = {
        headers: {
          'x-correlation-id': CORRELATION_ID,
          'x-radar-worker-hop': '1',
          'x-radar-session-assertion': assertion,
        },
        method: 'POST',
        originalUrl: '/api/admin/example',
        url: '/api/admin/example',
      } as unknown as Request;
      const res = {
        setHeader() { return this; },
        status() { return this; },
        json() { return this; },
      } as unknown as Response;

      let outcome: Awaited<ReturnType<typeof verifyAdminApiAuthorization>> | undefined;
      const done = new Promise<void>((resolve, reject) => {
        createCloudflareSessionBridgeMiddleware(
          { AUTH_INTERNAL_HMAC_SECRET: SECRET, ADMIN_EMAIL: 'primary@example.com' },
          () => NOW,
        )(req, res, () => {
          void verifyAdminApiAuthorization({}, { ADMIN_EMAIL: 'primary@example.com' }).then(value => {
            outcome = value;
            resolve();
          }).catch(reject);
        });
      });
      await done;

      assert.equal(outcome?.authorized, true);
      assert.equal(outcome?.uid, adminPrincipal.uid);
      assert.match(outcome?.reason || '', /^AUTHORIZED_/);
    }
  });

  it('does not let a delegated D1 admin perform a primary-admin-only operation', async () => {
    const assertion = await makeAssertion(principal({
      email: 'delegate@example.com',
      isAdmin: true,
      isDelegatedAdmin: true,
    }));
    const req = {
      headers: {
        'x-correlation-id': CORRELATION_ID,
        'x-radar-worker-hop': '1',
        'x-radar-session-assertion': assertion,
      },
      method: 'POST',
      originalUrl: '/api/admin/primary-only',
      url: '/api/admin/primary-only',
    } as unknown as Request;
    const res = {
      setHeader() { return this; },
      status() { return this; },
      json() { return this; },
    } as unknown as Response;

    let outcome: Awaited<ReturnType<typeof verifyAdminApiAuthorization>> | undefined;
    const done = new Promise<void>((resolve, reject) => {
      createCloudflareSessionBridgeMiddleware(
        { AUTH_INTERNAL_HMAC_SECRET: SECRET },
        () => NOW,
      )(req, res, () => {
        void verifyAdminApiAuthorization({}, { ADMIN_EMAIL: 'primary@example.com' }, {
          requirePrimaryBootstrapAdmin: true,
        }).then(value => {
          outcome = value;
          resolve();
        }).catch(reject);
      });
    });
    await done;

    assert.equal(outcome?.authorized, false);
    assert.equal(outcome?.statusCode, 403);
    assert.equal(outcome?.reason, 'DELEGATED_ADMIN_FORBIDDEN_FOR_PRIMARY_OPERATION');
  });

  it('rejects internally inconsistent admin-role claims', async () => {
    const assertion = await makeAssertion();
    const inconsistent = resign(assertion, payload => {
      payload.isAdmin = false;
      payload.isPrimaryAdmin = true;
    });
    const result = verifyCloudflareSessionAssertion(inconsistent, bind(), SECRET, NOW);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'AUTH_SESSION_ASSERTION_CLAIMS_INVALID');
  });
});

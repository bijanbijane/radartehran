import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { isAuthSchemaReady, normalizePhone, verifyGoogleIdToken } from '../worker/routes/authRoutes';
import type { D1Database } from '../worker/types';

const CLIENT_ID = 'radar-web-client.apps.googleusercontent.com';
const NONCE = 'test-nonce-bound-to-oauth-state';

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

describe('Cloudflare phone-number normalization', () => {
  it('accepts Persian and Arabic numerals and normalizes them to E.164', () => {
    assert.equal(normalizePhone('۰۹۱۲۱۲۳۴۵۶۷'), '+989121234567');
    assert.equal(normalizePhone('٠٩١٢١٢٣٤٥٦٧'), '+989121234567');
    assert.equal(normalizePhone('+98 912 123 4567'), '+989121234567');
  });

  it('rejects malformed or non-Iranian phone numbers', () => {
    assert.equal(normalizePhone('0912123456'), null);
    assert.equal(normalizePhone('+12025550123'), null);
    assert.equal(normalizePhone('not-a-phone'), null);
  });
});

describe('Google OIDC ID-token verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = {
    ...(publicKey.export({ format: 'jwk' }) as JsonWebKey),
    kid: 'radar-test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const originalFetch = globalThis.fetch;

  before(() => {
    globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  function issueToken(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'radar-test-key' }));
    const claims = base64Url(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-subject-123',
      email: 'verified@example.com',
      email_verified: true,
      exp: now + 300,
      iat: now,
      nonce: NONCE,
      ...overrides,
    }));
    const signingInput = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
    return `${signingInput}.${base64Url(signature)}`;
  }

  it('rejects a multi-audience token whose authorized party is not the configured client', async () => {
    const token = issueToken({
      aud: [CLIENT_ID, 'another-client.apps.googleusercontent.com'],
      azp: 'another-client.apps.googleusercontent.com',
    });
    await assert.rejects(
      verifyGoogleIdToken(token, CLIENT_ID, NONCE),
      /GOOGLE_ID_TOKEN_AUTHORIZED_PARTY_INVALID/,
    );
  });

  it('requires azp when the token has multiple audiences', async () => {
    const token = issueToken({
      aud: [CLIENT_ID, 'another-client.apps.googleusercontent.com'],
    });
    await assert.rejects(
      verifyGoogleIdToken(token, CLIENT_ID, NONCE),
      /GOOGLE_ID_TOKEN_AUTHORIZED_PARTY_INVALID/,
    );
  });

  it('accepts a valid multi-audience token when azp matches the configured client', async () => {
    const token = issueToken({
      aud: [CLIENT_ID, 'another-client.apps.googleusercontent.com'],
      azp: CLIENT_ID,
    });
    const result = await verifyGoogleIdToken(token, CLIENT_ID, NONCE);
    assert.equal(result.sub, 'google-subject-123');
    assert.equal(result.email, 'verified@example.com');
    assert.equal(result.email_verified, true);
  });

  it('rejects an authorized-party claim that conflicts even with a single audience', async () => {
    const token = issueToken({ azp: 'unexpected-client.apps.googleusercontent.com' });
    await assert.rejects(
      verifyGoogleIdToken(token, CLIENT_ID, NONCE),
      /GOOGLE_ID_TOKEN_AUTHORIZED_PARTY_INVALID/,
    );
  });
});


describe('Cloudflare auth schema readiness', () => {
  it('fails closed when required USER_DB auth migrations are missing or partially applied', async () => {
    const db = {
      prepare: () => ({
        first: async () => { throw new Error('no such table: auth_oauth_states'); },
      }),
    } as unknown as D1Database;
    assert.equal(await isAuthSchemaReady(db), false);
  });

  it('accepts the auth schema only when the complete schema probe succeeds', async () => {
    const db = {
      prepare: () => ({
        first: async () => null,
      }),
    } as unknown as D1Database;
    assert.equal(await isAuthSchemaReady(db), true);
  });

  it('accepts Google sign-in when the Google/session schema is ready without requiring SMS-only migrations', async () => {
    let calls = 0;
    const db = {
      prepare: () => {
        calls += 1;
        return { first: async () => null };
      },
    } as unknown as D1Database;
    assert.equal(await isAuthSchemaReady(db), true);
    assert.equal(calls, 1);
  });

  it('fails closed for phone OTP when the SMS-specific schema is incomplete', async () => {
    let calls = 0;
    const db = {
      prepare: () => {
        calls += 1;
        return {
          first: async () => {
            if (calls === 2) throw new Error('no such column: code_hash');
            return null;
          },
        };
      },
    } as unknown as D1Database;
    assert.equal(await isAuthSchemaReady(db, true), false);
    assert.equal(calls, 2);
  });
});

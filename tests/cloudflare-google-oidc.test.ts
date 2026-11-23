import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGoogleIdToken } from '../worker/routes/authRoutes';

const CLIENT_ID = 'radar-web-client.apps.googleusercontent.com';
const NONCE = 'test-nonce-bound-to-oauth-state';

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

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

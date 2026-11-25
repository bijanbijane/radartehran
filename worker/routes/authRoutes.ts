/**
 * Cloudflare-native authentication endpoints: Google OIDC, Kavenegar SMS OTP, D1 identities and sessions.
 * No Firebase SDK, Firebase ID token, Firestore, or App Check dependency is used here.
 */
import { authenticateWorkerSession, buildClearedSessionCookie, buildSessionCookie, readSessionCookie, sha256Hex } from '../auth/sessionAuth';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { requireUserDb } from '../db/bindingResolver';
import type { D1Database, WorkerRequestContext } from '../types';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PHONE_CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface GoogleOAuthStateRow {
  nonce: string;
  code_verifier: string;
  return_path: string;
}

function assertSingleD1Write(
  result: { success: boolean; meta?: { changes?: number } },
  code: string,
): void {
  if (result.success !== true || Number(result.meta?.changes) !== 1) throw new Error(code);
}

function assertSuccessfulD1Batch(results: Array<{ success: boolean }>, expectedLength: number, code: string): void {
  if (!Array.isArray(results) || results.length !== expectedLength || results.some((result) => result.success !== true)) {
    throw new Error(code);
  }
}

/** Atomically consumes an unexpired OAuth state; concurrent callbacks cannot reuse it. */
export async function consumeGoogleOAuthState(
  db: D1Database,
  stateHash: string,
  nowMs = Date.now(),
): Promise<GoogleOAuthStateRow | null> {
  if (!/^[a-f0-9]{64}$/i.test(stateHash) || !Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  return db.prepare(
    `DELETE FROM auth_oauth_states
     WHERE state_hash = ?1 AND expires_at_ms > ?2
     RETURNING nonce, code_verifier, return_path`,
  ).bind(stateHash, nowMs).first<GoogleOAuthStateRow>();
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(atob(padded)) as T;
}

function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\r\n]/.test(raw)) return '/';
  return raw.slice(0, 512);
}

function readRequestCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  const matches: string[] = [];
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    matches.push(part.slice(separator + 1).trim());
  }
  return matches.length === 1 && matches[0] ? matches[0] : null;
}
function validMutationOrigin(ctx: WorkerRequestContext): boolean {
  const origin = ctx.request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(ctx.env.APP_URL || 'https://radartehran.ir').origin;
  } catch {
    return false;
  }
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const asciiDigits = raw.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const value = code >= 0x06f0 && code <= 0x06f9 ? code - 0x06f0 : code - 0x0660;
    return String(value);
  });
  const compact = asciiDigits.trim().replace(/[\s()-]/g, '');
  const normalized = /^00989\d{9}$/.test(compact)
    ? `+98${compact.slice(4)}`
    : /^09\d{9}$/.test(compact)
      ? `+98${compact.slice(1)}`
      : /^989\d{9}$/.test(compact)
        ? `+${compact}`
        : compact;
  return /^\+989\d{9}$/.test(normalized) ? normalized : null;
}

async function createOrResolveIdentity(
  db: D1Database,
  provider: 'google' | 'phone',
  subject: string,
  profile: { email?: string | null; emailVerified?: boolean; phone?: string | null; displayName?: string | null },
  linkUid?: string,
): Promise<{ uid: string; linked: boolean }> {
  const existing = await db.prepare(
    `SELECT i.uid, p.account_status
     FROM auth_identities i
     LEFT JOIN user_profiles p ON p.uid = i.uid
     WHERE i.provider = ?1 AND i.provider_subject = ?2
     LIMIT 1`,
  ).bind(provider, subject).first<{ uid: string; account_status: string | null }>();

  if (existing) {
    if (existing.account_status !== 'ACTIVE') throw new Error('ACCOUNT_NOT_ACTIVE');
    if (linkUid && existing.uid !== linkUid) throw new Error('IDENTITY_ALREADY_LINKED_TO_ANOTHER_ACCOUNT');
    const updated = await db.prepare(
      'UPDATE auth_identities SET email = ?1, email_verified = ?2, phone_e164 = ?3, last_authenticated_at_iso = ?4 WHERE provider = ?5 AND provider_subject = ?6 AND uid = ?7',
    ).bind(profile.email ?? null, profile.emailVerified ? 1 : 0, profile.phone ?? null, new Date().toISOString(), provider, subject, existing.uid).run();
    assertSingleD1Write(updated, 'AUTH_IDENTITY_WRITE_FAILED');
    return { uid: existing.uid, linked: false };
  }

  const uid = linkUid || `usr_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const identityStatement = db.prepare(
    `INSERT INTO auth_identities (
      provider, provider_subject, uid, email, email_verified, phone_e164, created_at_iso, last_authenticated_at_iso
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(provider, subject, uid, profile.email ?? null, profile.emailVerified ? 1 : 0, profile.phone ?? null, now);

  if (!linkUid) {
    const profileStatement = db.prepare(
      `INSERT INTO user_profiles (
        uid, display_name, preferred_city, preferred_language, area_unit, intl_currency,
        role, account_status, created_at_iso, updated_at_iso
      ) VALUES (?1, ?2, 'tehran', 'fa', 'sqm', 'USD', 'USER', 'ACTIVE', ?3, ?3)`,
    ).bind(uid, String(profile.displayName || '').trim().slice(0, 80), now);
    const results = await db.batch([profileStatement, identityStatement]);
    assertSuccessfulD1Batch(results, 2, 'AUTH_IDENTITY_CREATE_FAILED');
  } else {
    const owner = await db.prepare(
      'SELECT uid FROM user_profiles WHERE uid = ?1 AND account_status = \'ACTIVE\'',
    ).bind(uid).first<{ uid: string }>();
    if (!owner) throw new Error('ACCOUNT_NOT_ACTIVE');
    const inserted = await identityStatement.run();
    assertSingleD1Write(inserted, 'AUTH_IDENTITY_WRITE_FAILED');
  }
  return { uid, linked: Boolean(linkUid) };
}

async function issueSession(
  db: D1Database,
  request: Request,
  uid: string,
  provider: 'google' | 'phone',
): Promise<{ token: string; expiresAtIso: string }> {
  const token = randomToken(48);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const userAgent = (request.headers.get('user-agent') || '').replace(/[\r\n]/g, '').slice(0, 180);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipPrefix = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip.split('.').slice(0, 3).join('.');
  const inserted = await db.prepare(
    `INSERT INTO user_sessions (
      session_id, uid, device_label, user_agent_summary, ip_prefix, status,
      created_at_iso, last_seen_at_iso, token_hash, expires_at_iso, auth_provider
    ) VALUES (?1, ?2, 'web', ?3, ?4, 'ACTIVE', ?5, ?5, ?6, ?7, ?8)`,
  ).bind(crypto.randomUUID(), uid, userAgent, ipPrefix.slice(0, 64), now.toISOString(), tokenHash, expiresAt.toISOString(), provider).run();
  assertSingleD1Write(inserted, 'AUTH_SESSION_WRITE_FAILED');
  return { token, expiresAtIso: expiresAt.toISOString() };
}

export async function verifyGoogleIdToken(idToken: string, expectedAudience: string, expectedNonce: string): Promise<{
  sub: string; email: string; name?: string; email_verified: boolean;
}> {
  if (idToken.length > 12_000) throw new Error('GOOGLE_ID_TOKEN_TOO_LARGE');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('GOOGLE_ID_TOKEN_MALFORMED');
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(parts[0]);
  const claims = decodeBase64UrlJson<{
    iss?: string; aud?: string | string[]; azp?: string; sub?: string; email?: string; email_verified?: boolean;
    exp?: number; iat?: number; nonce?: string; name?: string;
  }>(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('GOOGLE_ID_TOKEN_HEADER_INVALID');

  const response = await fetch(GOOGLE_JWKS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error('GOOGLE_JWKS_UNAVAILABLE');
  const jwks = await response.json() as { keys?: JsonWebKey[] };
  const jwk = (jwks.keys || []).find((key) => {
    const candidate = key as JsonWebKey & { kid?: string; alg?: string; use?: string };
    return candidate.kid === header.kid && candidate.kty === 'RSA'
      && (!candidate.alg || candidate.alg === 'RS256')
      && (!candidate.use || candidate.use === 'sig');
  });
  if (!jwk) throw new Error('GOOGLE_SIGNING_KEY_NOT_FOUND');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signaturePart = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const signature = Uint8Array.from(atob(signaturePart + '='.repeat((4 - signaturePart.length % 4) % 4)), (c) => c.charCodeAt(0));
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput)) throw new Error('GOOGLE_ID_TOKEN_SIGNATURE_INVALID');

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss))) throw new Error('GOOGLE_ID_TOKEN_ISSUER_INVALID');
  if (!audiences.includes(expectedAudience)) throw new Error('GOOGLE_ID_TOKEN_AUDIENCE_INVALID');
  if ((audiences.length > 1 || claims.azp !== undefined) && claims.azp !== expectedAudience) {
    throw new Error('GOOGLE_ID_TOKEN_AUTHORIZED_PARTY_INVALID');
  }
  if (!claims.sub || claims.sub.length > 255 || !claims.email || claims.email_verified !== true) throw new Error('GOOGLE_ACCOUNT_NOT_VERIFIED');
  if (!Number.isSafeInteger(claims.exp) || Number(claims.exp) <= now - 30) throw new Error('GOOGLE_ID_TOKEN_EXPIRED');
  if (!Number.isSafeInteger(claims.iat) || Number(claims.iat) > now + 30 || Number(claims.iat) < now - 3600 - 30) {
    throw new Error('GOOGLE_ID_TOKEN_IAT_INVALID');
  }
  if (Number(claims.exp) <= Number(claims.iat) || Number(claims.exp) - Number(claims.iat) > 3600 + 60) {
    throw new Error('GOOGLE_ID_TOKEN_LIFETIME_INVALID');
  }
  if (claims.nonce !== expectedNonce) throw new Error('GOOGLE_ID_TOKEN_NONCE_MISMATCH');
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: claims.name, email_verified: true };
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendOtpSms(ctx: WorkerRequestContext, phone: string, code: string): Promise<string | null> {
  const apiKey = String(ctx.env.KAVENEGAR_API_KEY || '').trim();
  const template = String(ctx.env.KAVENEGAR_VERIFY_TEMPLATE || '').trim();
  if (!apiKey || !template) throw new Error('SMS_PROVIDER_NOT_CONFIGURED');
  const receptor = phone.startsWith('+98') ? `0${phone.slice(3)}` : phone;
  const url = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`);
  url.searchParams.set('receptor', receptor);
  url.searchParams.set('token', code);
  url.searchParams.set('template', template);
  url.searchParams.set('type', 'sms');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({})) as {
    return?: { status?: number; message?: string };
    entries?: { messageid?: number | string; status?: number; statustext?: string };
  };
  if (!response.ok || Number(payload.return?.status) !== 200) throw new Error('SMS_GATEWAY_REJECTED');
  return payload.entries?.messageid === undefined ? null : String(payload.entries.messageid);
}

function constantTimeStringMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
function errorRedirect(ctx: WorkerRequestContext, code: string): Response {
  const base = String(ctx.env.APP_URL || 'https://radartehran.ir');
  const url = new URL('/', base);
  url.searchParams.set('auth_error', code);
  return new Response(null, { status: 303, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

/**
 * Probe the complete auth/session schema before dispatching any auth route.
 * A missing or partially applied USER_DB migration must produce an explicit 503,
 * never a generic Worker exception or a partially created identity/session.
 */
export async function isAuthSchemaReady(db: D1Database, includePhoneSchema = false): Promise<boolean> {
  try {
    await db.prepare(`
      SELECT
        i.provider, i.provider_subject, i.uid, i.email, i.email_verified, i.phone_e164,
        i.created_at_iso, i.last_authenticated_at_iso,
        o.state_hash, o.nonce, o.code_verifier, o.return_path, o.expires_at_ms, o.created_at_ms,
        s.session_id, s.uid, s.device_label, s.user_agent_summary, s.ip_prefix, s.status,
        s.created_at_iso, s.last_seen_at_iso, s.token_hash, s.expires_at_iso, s.auth_provider,
        s.revoked_at_iso, s.revoked_by_uid,
        p.uid, p.display_name, p.account_status,
        w.watermark_key, w.watermark_value, a.uid, a.active
      FROM auth_identities AS i
      CROSS JOIN auth_oauth_states AS o
      CROSS JOIN user_sessions AS s
      JOIN user_profiles AS p ON p.uid = s.uid
      LEFT JOIN sync_watermarks AS w ON 1 = 0
      LEFT JOIN admin_role_bindings AS a ON 1 = 0
      LIMIT 0
    `).first();
    if (includePhoneSchema) {
      await db.prepare(`
        SELECT challenge_id, phone_e164, phone_hash, provider_reference, status, attempts,
               expires_at_ms, created_at_ms, verified_at_ms, ip_hash, code_hash
        FROM auth_phone_challenges
        LIMIT 0
      `).first();
    }
    return true;
  } catch {
    return false;
  }
}

export async function handleAuthWorkerRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { method, pathname, request, env } = ctx;
  if (!pathname.startsWith('/api/auth/')) return null;
  const dbRes = requireUserDb(env);
  if (!dbRes.ok) return jsonWorkerResponse(ctx, 503, { status: 'error', code: dbRes.code });
  const db = dbRes.db;
  const requiresPhoneSchema = pathname.startsWith('/api/auth/phone/');
  if (!await isAuthSchemaReady(db, requiresPhoneSchema)) {
    return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'AUTH_SCHEMA_NOT_READY' });
  }

  if (method === 'GET' && pathname === '/api/auth/google/start') {
    const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const redirectUri = String(env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() || `${String(env.APP_URL || 'https://radartehran.ir').replace(/\/$/, '')}/api/auth/google/callback`;
    if (!clientId) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'GOOGLE_OAUTH_NOT_CONFIGURED' });
    await db.prepare('DELETE FROM auth_oauth_states WHERE expires_at_ms <= ?1').bind(Date.now()).run();
    const state = randomToken(32);
    const nonce = randomToken(32);
    const codeVerifier = randomToken(48);
    const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(challenge))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const stateHash = await sha256Hex(state);
    const now = Date.now();
    const returnPath = safeReturnPath(new URL(request.url).searchParams.get('returnTo'));
    const stateInsert = await db.prepare(
      'INSERT INTO auth_oauth_states (state_hash, nonce, code_verifier, return_path, expires_at_ms, created_at_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(stateHash, nonce, codeVerifier, returnPath, now + OAUTH_STATE_TTL_MS, now).run();
    assertSingleD1Write(stateInsert, 'OAUTH_STATE_STORE_UNAVAILABLE');
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
    return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': `__Host-radar_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (method === 'GET' && pathname === '/api/auth/google/callback') {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    if (!state || !code || url.searchParams.has('error')) return errorRedirect(ctx, 'GOOGLE_OAUTH_DENIED');
    if (readRequestCookie(request, '__Host-radar_oauth_state') !== state) return errorRedirect(ctx, 'GOOGLE_OAUTH_STATE_COOKIE_MISMATCH');
    const stateHash = await sha256Hex(state);
    let stateRow: GoogleOAuthStateRow | null;
    try {
      stateRow = await consumeGoogleOAuthState(db, stateHash, Date.now());
    } catch {
      return errorRedirect(ctx, 'GOOGLE_OAUTH_STATE_STORE_UNAVAILABLE');
    }
    if (!stateRow) return errorRedirect(ctx, 'GOOGLE_OAUTH_STATE_INVALID');

    const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    const redirectUri = String(env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() || `${String(env.APP_URL || 'https://radartehran.ir').replace(/\/$/, '')}/api/auth/google/callback`;
    if (!clientId || !clientSecret) return errorRedirect(ctx, 'GOOGLE_OAUTH_NOT_CONFIGURED');

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: stateRow.code_verifier }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenResponse.ok) return errorRedirect(ctx, 'GOOGLE_OAUTH_EXCHANGE_FAILED');
    const tokenPayload = await tokenResponse.json() as { id_token?: string };
    if (!tokenPayload.id_token) return errorRedirect(ctx, 'GOOGLE_ID_TOKEN_MISSING');

    try {
      const google = await verifyGoogleIdToken(tokenPayload.id_token, clientId, stateRow.nonce);
      const identity = await createOrResolveIdentity(db, 'google', google.sub, {
        email: google.email, emailVerified: google.email_verified, displayName: google.name,
      });
      const session = await issueSession(db, request, identity.uid, 'google');
      const headers = new Headers({
        Location: new URL(safeReturnPath(stateRow.return_path), String(env.APP_URL || 'https://radartehran.ir')).toString(),
        'Cache-Control': 'no-store',
      });
      headers.append('Set-Cookie', buildSessionCookie(session.token, SESSION_TTL_SECONDS));
      headers.append('Set-Cookie', '__Host-radar_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
      const response = new Response(null, { status: 303, headers });
      return response;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'GOOGLE_AUTH_FAILED';
      return errorRedirect(ctx, /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'GOOGLE_AUTH_FAILED');
    }
  }

  if (method === 'POST' && pathname === '/api/auth/phone/start') {
    if (!validMutationOrigin(ctx)) return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'ORIGIN_FORBIDDEN' });
    const parsed = await readValidatedJsonBody(request, 4 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const phone = normalizePhone(parsed.body.phone);
    if (!phone) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_PHONE_NUMBER' });
    const piiHashSecret = String(env.AUTH_PII_HMAC_SECRET || '').trim();
    if (piiHashSecret.length < 32) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'AUTH_PII_HASH_SECRET_NOT_CONFIGURED' });
    const phoneHash = await hmacSha256Hex(piiHashSecret, `phone:${phone}`);
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
    const ipHash = await hmacSha256Hex(piiHashSecret, `ip:${clientIp}`);
    const now = Date.now();
    await db.prepare('DELETE FROM auth_phone_challenges WHERE created_at_ms < ?1').bind(now - 24 * 60 * 60 * 1000).run();
    const challengeId = crypto.randomUUID();
    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const codeHash = await hmacSha256Hex(piiHashSecret, `otp:${challengeId}:${otp}`);
    const reservation = await db.prepare(
      `INSERT INTO auth_phone_challenges (
        challenge_id, phone_e164, phone_hash, provider_reference, status, attempts,
        expires_at_ms, created_at_ms, ip_hash, code_hash
      )
      SELECT ?1, ?2, ?3, NULL, 'PENDING', 0, ?6, ?7, ?5, ?8
      WHERE (SELECT COUNT(*) FROM auth_phone_challenges WHERE phone_hash = ?3 AND created_at_ms > ?4) < 3
        AND (SELECT COUNT(*) FROM auth_phone_challenges WHERE ip_hash = ?5 AND created_at_ms > ?4) < 5`,
    ).bind(challengeId, phone, phoneHash, now - 10 * 60 * 1000, ipHash, now + PHONE_CHALLENGE_TTL_MS, now, codeHash).run();
    if (reservation.success !== true) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'PHONE_OTP_STORE_UNAVAILABLE' });
    if (Number(reservation.meta?.changes || 0) !== 1) return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'PHONE_OTP_RATE_LIMITED' });

    try {
      const providerReference = await sendOtpSms(ctx, phone, otp);
      const updated = await db.prepare('UPDATE auth_phone_challenges SET provider_reference = ?1 WHERE challenge_id = ?2 AND status = \'PENDING\'')
        .bind(providerReference, challengeId).run();
      assertSingleD1Write(updated, 'PHONE_OTP_STORE_UNAVAILABLE');
      return jsonWorkerResponse(ctx, 202, { status: 'ok', challengeId, expiresInSeconds: PHONE_CHALLENGE_TTL_MS / 1000 });
    } catch (error) {
      await db.prepare('UPDATE auth_phone_challenges SET status = \'EXPIRED\' WHERE challenge_id = ?1').bind(challengeId).run();
      const code = error instanceof Error ? error.message : 'SMS_SEND_FAILED';
      return jsonWorkerResponse(ctx, code === 'SMS_PROVIDER_NOT_CONFIGURED' ? 503 : code === 'SMS_PROVIDER_RATE_LIMITED' ? 429 : 502, { status: 'error', code });
    }
  }

  if (method === 'POST' && pathname === '/api/auth/phone/verify') {
    if (!validMutationOrigin(ctx)) return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'ORIGIN_FORBIDDEN' });
    const parsed = await readValidatedJsonBody(request, 4 * 1024);
    if (!parsed.ok) return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code });
    const challengeId = typeof parsed.body.challengeId === 'string' ? parsed.body.challengeId.trim() : '';
    const code = typeof parsed.body.code === 'string' ? parsed.body.code.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{4,10}$/.test(code)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OTP_INPUT' });
    const challenge = await db.prepare(
      'SELECT phone_e164, phone_hash, code_hash, status, attempts, expires_at_ms FROM auth_phone_challenges WHERE challenge_id = ?1 LIMIT 1',
    ).bind(challengeId).first<{ phone_e164: string; phone_hash: string; code_hash: string | null; status: string; attempts: number; expires_at_ms: number }>();
    const challengeExpiresAtMs = Number(challenge?.expires_at_ms);
    const challengeAttempts = Number(challenge?.attempts);
    if (
      !challenge ||
      challenge.status !== 'PENDING' ||
      !Number.isSafeInteger(challengeExpiresAtMs) ||
      challengeExpiresAtMs <= Date.now()
    ) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'OTP_CHALLENGE_EXPIRED' });
    }
    if (!Number.isSafeInteger(challengeAttempts) || challengeAttempts < 0 || challengeAttempts >= 5) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'OTP_CHALLENGE_ATTEMPTS_EXHAUSTED' });
    }
    const piiHashSecret = String(env.AUTH_PII_HMAC_SECRET || '').trim();
    if (new TextEncoder().encode(piiHashSecret).byteLength < 32) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'AUTH_PII_HASH_SECRET_NOT_CONFIGURED' });
    }
    const claim = await db.prepare(
      `UPDATE auth_phone_challenges
       SET status = 'LOCKED', attempts = attempts + 1
       WHERE challenge_id = ?1 AND status = 'PENDING' AND attempts < 5 AND expires_at_ms > ?2`,
    ).bind(challengeId, Date.now()).run();
    if (claim.success !== true) return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'OTP_CHALLENGE_STORE_UNAVAILABLE' });
    if (Number(claim.meta?.changes || 0) !== 1) return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'OTP_CHALLENGE_ALREADY_USED_OR_LOCKED' });

    try {
      const expectedCodeHash = await hmacSha256Hex(piiHashSecret, `otp:${challengeId}:${code}`);
      if (!challenge.code_hash || !constantTimeStringMatch(challenge.code_hash, expectedCodeHash)) {
        if (Number(challenge.attempts) + 1 < 5) {
          await db.prepare('UPDATE auth_phone_challenges SET status = \'PENDING\' WHERE challenge_id = ?1 AND status = \'LOCKED\'').bind(challengeId).run();
        }
        return jsonWorkerResponse(ctx, 401, { status: 'error', code: 'OTP_INVALID' });
      }
      const current = await authenticateWorkerSession(ctx);
      const identity = await createOrResolveIdentity(db, 'phone', challenge.phone_e164, {
        phone: challenge.phone_e164, emailVerified: false,
      }, current.authenticated ? current.uid || undefined : undefined);
      const session = await issueSession(db, request, identity.uid, 'phone');
      try {
        const finalized = await db.prepare(
          'UPDATE auth_phone_challenges SET status = \'VERIFIED\', verified_at_ms = ?1 WHERE challenge_id = ?2 AND status = \'LOCKED\'',
        ).bind(Date.now(), challengeId).run();
        assertSingleD1Write(finalized, 'OTP_CHALLENGE_FINALIZATION_FAILED');
      } catch (finalizationError) {
        const tokenHash = await sha256Hex(session.token);
        await db.prepare(
          'UPDATE user_sessions SET status = \'REVOKED\', revoked_at_iso = ?1, revoked_by_uid = ?2 WHERE token_hash = ?3 AND status = \'ACTIVE\'',
        ).bind(new Date().toISOString(), identity.uid, tokenHash).run().catch(() => undefined);
        throw finalizationError;
      }
      const response = jsonWorkerResponse(ctx, 200, { status: 'ok', linked: identity.linked, uid: identity.uid });
      const headers = new Headers(response.headers);
      headers.append('Set-Cookie', buildSessionCookie(session.token, SESSION_TTL_SECONDS));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      if (Number(challenge.attempts) + 1 < 5) {
        await db.prepare('UPDATE auth_phone_challenges SET status = \'PENDING\' WHERE challenge_id = ?1 AND status = \'LOCKED\'').bind(challengeId).run().catch(() => undefined);
      }
      const codeName = error instanceof Error ? error.message : 'PHONE_AUTH_FAILED';
      const status = codeName === 'IDENTITY_ALREADY_LINKED_TO_ANOTHER_ACCOUNT' ? 409 : 503;
      return jsonWorkerResponse(ctx, status, { status: 'error', code: codeName });
    }
  }

  if (method === 'GET' && pathname === '/api/auth/session') {
    const auth = await authenticateWorkerSession(ctx);
    if (!auth.authenticated) return jsonWorkerResponse(ctx, auth.statusCode === 503 ? 503 : 200, { status: 'ok', authenticated: false });
    return jsonWorkerResponse(ctx, 200, { status: 'ok', authenticated: true, user: { uid: auth.uid, email: auth.email, emailVerified: auth.emailVerified, phoneNumber: auth.phoneNumber, displayName: auth.displayName, isAdmin: auth.isAdmin, authProvider: auth.authProvider } });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    if (!validMutationOrigin(ctx)) return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'ORIGIN_FORBIDDEN' });
    const auth = await authenticateWorkerSession(ctx);
    const raw = readSessionCookie(request);
    if (auth.authenticated && raw) {
      const tokenHash = await sha256Hex(raw);
      const revoked = await db.prepare('UPDATE user_sessions SET status = \'REVOKED\', revoked_at_iso = ?1, revoked_by_uid = ?2 WHERE token_hash = ?3 AND status = \'ACTIVE\'')
        .bind(new Date().toISOString(), auth.uid, tokenHash).run();
      assertSingleD1Write(revoked, 'AUTH_SESSION_REVOKE_FAILED');
    }
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': buildClearedSessionCookie() },
    });
  }

  return null;
}

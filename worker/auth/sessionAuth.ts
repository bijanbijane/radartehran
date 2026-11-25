/**
 * Cloudflare-native opaque session authentication.
 * Browser credentials are HttpOnly cookies; no Firebase ID token or client-side bearer token is accepted.
 */
import { resolveUserDb } from '../db/bindingResolver';
import { resolveD1WritePauseState } from '../db/writePause';
import type { WorkerRequestContext } from '../types';

export const RADAR_SESSION_COOKIE = '__Host-radar_session';

export interface WorkerSessionPrincipal {
  authenticated: boolean;
  uid: string | null;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  isDelegatedAdmin: boolean;
  authProvider: 'google' | 'phone' | 'unknown' | null;
  authTimeSeconds: number | null;
  statusCode: 200 | 401 | 403 | 503;
  reasonCode: string;
}

function matchingCookieParts(request: Request, name: string): string[] {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const separator = part.indexOf('=');
      return separator > 0 && part.slice(0, separator).trim() === name;
    });
}

function readCookie(request: Request, name: string): string | null {
  const matches = matchingCookieParts(request, name);
  if (matches.length !== 1) return null;
  const separator = matches[0].indexOf('=');
  const value = matches[0].slice(separator + 1).trim();
  return /^[A-Za-z0-9_-]{40,128}$/.test(value) ? value : null;
}

export function hasRadarSessionCookie(request: Request): boolean {
  return matchingCookieParts(request, RADAR_SESSION_COOKIE).length > 0;
}

export function readSessionCookie(request: Request): string | null {
  return readCookie(request, RADAR_SESSION_COOKIE);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authenticateWorkerSession(
  ctx: WorkerRequestContext,
  sensitiveRoute = true,
  requireRecentAuth = false,
): Promise<WorkerSessionPrincipal> {
  const unauthenticated = (reasonCode = 'UNAUTHENTICATED', statusCode: 401 | 403 | 503 = 401): WorkerSessionPrincipal => ({
    authenticated: false,
    uid: null,
    email: null,
    emailVerified: false,
    phoneNumber: null,
    displayName: null,
    isAdmin: false,
    isPrimaryAdmin: false,
    isDelegatedAdmin: false,
    authProvider: null,
    authTimeSeconds: null,
    statusCode,
    reasonCode,
  });

  if (sensitiveRoute && !['GET', 'HEAD', 'OPTIONS'].includes(ctx.method)) {
    const origin = ctx.request.headers.get('origin');
    try {
      if (!origin || new URL(origin).origin !== new URL(ctx.env.APP_URL || ctx.url.origin).origin) {
        return unauthenticated('CSRF_ORIGIN_REJECTED', 403);
      }
    } catch {
      return unauthenticated('CSRF_ORIGIN_REJECTED', 403);
    }
  }

  const userDb = resolveUserDb(ctx.env);
  if (!userDb) return unauthenticated('USER_DB_UNAVAILABLE', 503);

  const rawToken = readSessionCookie(ctx.request);
  if (!rawToken) return unauthenticated();

  try {
    const tokenHash = await sha256Hex(rawToken);
    const row = await userDb
      .prepare(
        `SELECT s.session_id, s.uid, s.created_at_iso, s.last_seen_at_iso, s.expires_at_iso, s.auth_provider,
                p.account_status,
                p.display_name,
                (SELECT i.phone_e164 FROM auth_identities i WHERE i.uid = s.uid AND i.provider = 'phone' ORDER BY i.last_authenticated_at_iso DESC LIMIT 1) AS phone_number,
                (SELECT w.watermark_value FROM sync_watermarks w WHERE w.watermark_key = 'revoked_uid:' || s.uid LIMIT 1) AS revocation_watermark,
                (SELECT i.email FROM auth_identities i
                 WHERE i.uid = s.uid AND i.provider = 'google' AND i.email_verified = 1
                 ORDER BY i.last_authenticated_at_iso DESC LIMIT 1) AS email,
                EXISTS(
                  SELECT 1 FROM auth_identities i
                  WHERE i.uid = s.uid AND i.provider = 'google' AND i.email_verified = 1
                ) AS email_verified,
                EXISTS(
                  SELECT 1 FROM admin_role_bindings a
                  WHERE a.uid = s.uid AND a.active = 1
                ) AS delegated_admin
         FROM user_sessions s
         JOIN user_profiles p ON p.uid = s.uid
         WHERE s.token_hash = ?1 AND s.status = 'ACTIVE'
           AND s.expires_at_iso > ?2
         LIMIT 1`,
      )
      .bind(tokenHash, new Date().toISOString())
      .first<Record<string, unknown>>();

    if (!row || String(row.account_status) !== 'ACTIVE') return unauthenticated('SESSION_INVALID');
    const uid = String(row.uid || '');
    if (!uid) return unauthenticated('SESSION_INVALID');

    const nowMs = Date.now();
    const createdAtMs = Date.parse(String(row.created_at_iso || ''));
    const expiresAtMs = Date.parse(String(row.expires_at_iso || ''));
    if (
      !Number.isFinite(createdAtMs) ||
      createdAtMs <= 0 ||
      createdAtMs > nowMs + 60_000 ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= nowMs
    ) {
      return unauthenticated('SESSION_INVALID');
    }
    const createdAtSeconds = Math.floor(createdAtMs / 1000);
    const revocationWatermark = row.revocation_watermark;
    if (revocationWatermark === 'DISABLED') return unauthenticated('ACCOUNT_DISABLED');
    if (revocationWatermark !== null && revocationWatermark !== undefined && String(revocationWatermark).trim() !== '') {
      const parsedWatermark = Number(revocationWatermark);
      const revokedBeforeSeconds = parsedWatermark >= 1_000_000_000_000
        ? Math.floor(parsedWatermark / 1000)
        : parsedWatermark;
      if (!Number.isSafeInteger(revokedBeforeSeconds) || revokedBeforeSeconds < 1 || createdAtSeconds <= revokedBeforeSeconds) {
        return unauthenticated('SESSION_REVOKED');
      }
    }

    const email = typeof row.email === 'string' ? row.email.toLowerCase() : null;
    const configuredAdminEmail = String(ctx.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const isPrimaryAdmin = Boolean(email && configuredAdminEmail && email === configuredAdminEmail && row.email_verified === 1);
    const isDelegatedAdmin = row.delegated_admin === 1;
    const isAdmin = isPrimaryAdmin || isDelegatedAdmin;
    const authTimeSeconds = createdAtSeconds;
    if (requireRecentAuth) {
      const authAgeSeconds = Math.floor(Date.now() / 1000) - authTimeSeconds;
      if (!Number.isSafeInteger(authAgeSeconds) || authAgeSeconds < 0 || authAgeSeconds > 5 * 60) {
        return unauthenticated('RECENT_LOGIN_REQUIRED', 403);
      }
    }

    const d1WritesPaused = resolveD1WritePauseState(ctx.env).paused;
    const lastSeenMs = Date.parse(String(row.last_seen_at_iso || ''));
    if (!d1WritesPaused && (!Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > 5 * 60 * 1000)) {
      await userDb
        .prepare('UPDATE user_sessions SET last_seen_at_iso = ?1 WHERE session_id = ?2 AND status = \'ACTIVE\'')
        .bind(new Date().toISOString(), String(row.session_id))
        .run();
    }

    return {
      authenticated: true,
      uid,
      email,
      emailVerified: row.email_verified === 1,
      phoneNumber: typeof row.phone_number === 'string' ? row.phone_number : null,
      displayName: typeof row.display_name === 'string' ? row.display_name : null,
      isAdmin,
      isPrimaryAdmin,
      isDelegatedAdmin,
      authProvider: row.auth_provider === 'google' || row.auth_provider === 'phone' ? row.auth_provider : 'unknown',
      authTimeSeconds,
      statusCode: 200,
      reasonCode: 'SESSION_VERIFIED',
    };
  } catch {
    return unauthenticated('SESSION_STORE_UNAVAILABLE', 503);
  }
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${RADAR_SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;
}

export function buildClearedSessionCookie(): string {
  return `${RADAR_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Creates a short-lived, request-bound assertion after a Worker verifies a D1 session.
 * The assertion is intended only for the private Worker -> legacy Express hop.
 */
import type { WorkerSessionPrincipal } from './sessionAuth';

export const CLOUDFLARE_SESSION_ASSERTION_HEADER = 'x-radar-session-assertion';
export const CLOUDFLARE_SESSION_ASSERTION_TTL_MS = 30_000;

export interface CloudflareSessionAssertionPayload {
  readonly v: 1;
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly phoneNumber: string | null;
  readonly displayName: string | null;
  readonly isAdmin: boolean;
  readonly isPrimaryAdmin: boolean;
  readonly isDelegatedAdmin: boolean;
  readonly authProvider: 'google' | 'phone' | 'unknown';
  readonly authTimeSeconds: number | null;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly method: string;
  readonly path: string;
  readonly correlationId: string;
  readonly workerHop: 1;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isVerifiedSessionPrincipal(principal: WorkerSessionPrincipal): boolean {
  const hasVerifiedEmail = principal.emailVerified && Boolean(principal.email);
  const hasVerifiedPhone = principal.authProvider === 'phone' && Boolean(principal.phoneNumber);
  return principal.authenticated
    && Boolean(principal.uid)
    && (hasVerifiedEmail || hasVerifiedPhone)
    && (principal.authProvider === 'google' || principal.authProvider === 'phone');
}

export async function createCloudflareSessionAssertion(params: {
  readonly request: Request;
  readonly principal: WorkerSessionPrincipal;
  readonly secret: string;
  readonly correlationId: string;
  readonly nowMs?: number;
}): Promise<string> {
  const secret = params.secret.trim();
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error('AUTH_SESSION_BRIDGE_SECRET_INVALID');
  }
  if (!isVerifiedSessionPrincipal(params.principal)) {
    throw new Error('AUTH_SESSION_BRIDGE_PRINCIPAL_INVALID');
  }

  const url = new URL(params.request.url);
  const path = `${url.pathname}${url.search}`;
  const method = params.request.method.toUpperCase();
  const correlationId = params.correlationId.trim();
  if (!path.startsWith('/') || path.length > 2048 || !/^[A-Z]{3,10}$/.test(method)) {
    throw new Error('AUTH_SESSION_BRIDGE_REQUEST_INVALID');
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(correlationId)) {
    throw new Error('AUTH_SESSION_BRIDGE_CORRELATION_ID_INVALID');
  }

  const principal = params.principal;
  const issuedAtMs = params.nowMs ?? Date.now();
  const payload: CloudflareSessionAssertionPayload = {
    v: 1,
    uid: principal.uid!,
    email: principal.email,
    emailVerified: principal.emailVerified,
    phoneNumber: principal.phoneNumber,
    displayName: principal.displayName,
    isAdmin: principal.isAdmin,
    isPrimaryAdmin: principal.isPrimaryAdmin,
    isDelegatedAdmin: principal.isDelegatedAdmin,
    authProvider: principal.authProvider!,
    authTimeSeconds: principal.authTimeSeconds,
    issuedAtMs,
    expiresAtMs: issuedAtMs + CLOUDFLARE_SESSION_ASSERTION_TTL_MS,
    method,
    path,
    correlationId,
    workerHop: 1,
  };

  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies short-lived Worker assertions and exposes the verified identity per request.
 * The internal assertion header is removed before any downstream application middleware.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export const CLOUDFLARE_SESSION_ASSERTION_HEADER = 'x-radar-session-assertion';

export interface CloudflareSessionContext {
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
}

interface AssertionPayload extends CloudflareSessionContext {
  readonly v: 1;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly method: string;
  readonly path: string;
  readonly correlationId: string;
  readonly workerHop: 1;
}

export interface CloudflareAssertionRequestBinding {
  readonly method: string;
  readonly path: string;
  readonly correlationId: string;
  readonly workerHop: string | undefined;
}

export type CloudflareAssertionVerification =
  | { readonly ok: true; readonly principal: CloudflareSessionContext }
  | { readonly ok: false; readonly statusCode: 401 | 403 | 503; readonly code: string };

const sessionContext = new AsyncLocalStorage<CloudflareSessionContext>();
const fail = (statusCode: 401 | 403 | 503, code: string): CloudflareAssertionVerification => ({
  ok: false,
  statusCode,
  code,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isValidPayload(value: unknown): value is AssertionPayload {
  if (!isRecord(value)) return false;
  const provider = value.authProvider;
  const email = value.email;
  const phoneNumber = value.phoneNumber;
  const displayName = value.displayName;
  const uidValid = isNonEmptyBoundedString(value.uid, 255)
    && /^[A-Za-z0-9._:@+-]+$/.test(value.uid);
  const emailValid = email === null || isNonEmptyBoundedString(email, 254);
  const phoneValid = phoneNumber === null || isNonEmptyBoundedString(phoneNumber, 24);
  const displayNameValid = displayName === null
    || (typeof displayName === 'string' && displayName.length <= 120 && !/[\u0000-\u001f\u007f]/.test(displayName));
  const timeValid = value.authTimeSeconds === null
    || (Number.isSafeInteger(value.authTimeSeconds) && Number(value.authTimeSeconds) > 0);

  return value.v === 1
    && uidValid
    && emailValid
    && typeof value.emailVerified === 'boolean'
    && phoneValid
    && displayNameValid
    && typeof value.isAdmin === 'boolean'
    && typeof value.isPrimaryAdmin === 'boolean'
    && typeof value.isDelegatedAdmin === 'boolean'
    && (provider === 'google' || provider === 'phone' || provider === 'unknown')
    && timeValid
    && Number.isSafeInteger(value.issuedAtMs)
    && Number.isSafeInteger(value.expiresAtMs)
    && typeof value.method === 'string'
    && /^[A-Z]{3,10}$/.test(value.method)
    && typeof value.path === 'string'
    && value.path.startsWith('/')
    && value.path.length <= 2048
    && typeof value.correlationId === 'string'
    && /^[A-Za-z0-9._:-]{8,128}$/.test(value.correlationId)
    && value.workerHop === 1;
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length > 0 && decoded.toString('base64url') === value ? decoded : null;
}

export function verifyCloudflareSessionAssertion(
  assertion: string,
  binding: CloudflareAssertionRequestBinding,
  secretValue: string | undefined,
  nowMs = Date.now(),
): CloudflareAssertionVerification {
  const secret = String(secretValue || '').trim();
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    return fail(503, 'AUTH_SESSION_BRIDGE_NOT_CONFIGURED');
  }
  if (!assertion || assertion.length > 8192 || /\s/.test(assertion)) {
    return fail(401, 'AUTH_SESSION_ASSERTION_MALFORMED');
  }
  const parts = assertion.split('.');
  if (parts.length !== 2) return fail(401, 'AUTH_SESSION_ASSERTION_MALFORMED');
  const payloadBytes = decodeCanonicalBase64Url(parts[0]);
  const actualSignature = decodeCanonicalBase64Url(parts[1]);
  if (!payloadBytes || !actualSignature) return fail(401, 'AUTH_SESSION_ASSERTION_MALFORMED');

  const expectedSignature = crypto.createHmac('sha256', secret).update(parts[0], 'utf8').digest();
  if (actualSignature.length !== expectedSignature.length
      || !crypto.timingSafeEqual(actualSignature, expectedSignature)) {
    return fail(401, 'AUTH_SESSION_ASSERTION_SIGNATURE_INVALID');
  }

  let value: unknown;
  try {
    value = JSON.parse(payloadBytes.toString('utf8')) as unknown;
  } catch {
    return fail(401, 'AUTH_SESSION_ASSERTION_MALFORMED');
  }
  if (!isValidPayload(value)) return fail(401, 'AUTH_SESSION_ASSERTION_CLAIMS_INVALID');

  if (value.method !== binding.method.toUpperCase()
      || value.path !== binding.path
      || value.correlationId !== binding.correlationId
      || binding.workerHop !== '1') {
    return fail(403, 'AUTH_SESSION_ASSERTION_REQUEST_MISMATCH');
  }

  if (value.expiresAtMs <= nowMs
      || value.issuedAtMs > nowMs + 5_000
      || nowMs - value.issuedAtMs > 35_000
      || value.expiresAtMs <= value.issuedAtMs
      || value.expiresAtMs - value.issuedAtMs > 30_000) {
    return fail(401, 'AUTH_SESSION_ASSERTION_EXPIRED');
  }

  const verifiedGoogle = value.authProvider === 'google'
    && value.emailVerified
    && typeof value.email === 'string'
    && value.email.length > 0;
  const verifiedPhone = value.authProvider === 'phone'
    && typeof value.phoneNumber === 'string'
    && value.phoneNumber.length > 0;
  if (!verifiedGoogle && !verifiedPhone) {
    return fail(403, 'AUTH_SESSION_ASSERTION_IDENTITY_UNVERIFIED');
  }
  if (value.isAdmin !== (value.isPrimaryAdmin || value.isDelegatedAdmin)) {
    return fail(401, 'AUTH_SESSION_ASSERTION_CLAIMS_INVALID');
  }

  return {
    ok: true,
    principal: {
      uid: value.uid,
      email: value.email,
      emailVerified: value.emailVerified,
      phoneNumber: value.phoneNumber,
      displayName: value.displayName,
      isAdmin: value.isAdmin,
      isPrimaryAdmin: value.isPrimaryAdmin,
      isDelegatedAdmin: value.isDelegatedAdmin,
      authProvider: value.authProvider,
      authTimeSeconds: value.authTimeSeconds,
    },
  };
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value.includes(',') ? null : value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' && !value[0].includes(',')) {
    return value[0];
  }
  return null;
}

export function getCloudflareSessionContext(): CloudflareSessionContext | null {
  return sessionContext.getStore() ?? null;
}

export function createCloudflareSessionBridgeMiddleware(
  env: Record<string, string | undefined> = process.env,
  now: () => number = Date.now,
): RequestHandler {
  return (req: Request, res, next): void => {
    const rawAssertion = req.headers[CLOUDFLARE_SESSION_ASSERTION_HEADER];
    delete req.headers[CLOUDFLARE_SESSION_ASSERTION_HEADER];
    if (rawAssertion === undefined) {
      next();
      return;
    }

    const assertion = readSingleHeader(rawAssertion);
    if (!assertion) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(400).json({ status: 'error', code: 'AUTH_SESSION_ASSERTION_HEADER_AMBIGUOUS' });
      return;
    }

    const correlationHeader = readSingleHeader(req.headers['x-correlation-id']);
    const verified = verifyCloudflareSessionAssertion(assertion, {
      method: req.method,
      path: req.originalUrl || req.url || '/',
      correlationId: correlationHeader || '',
      workerHop: readSingleHeader(req.headers['x-radar-worker-hop']) || undefined,
    }, env.AUTH_INTERNAL_HMAC_SECRET, now());

    if (verified.ok === false) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(verified.statusCode).json({ status: 'error', code: verified.code });
      return;
    }
    sessionContext.run(verified.principal, next);
  };
};

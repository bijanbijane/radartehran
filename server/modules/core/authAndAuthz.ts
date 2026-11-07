import crypto from 'crypto';
import type { Request } from 'express';
import type {
  AdminAuthorizationPolicy,
  AuthenticatedPrincipal,
  AuthorizationDecision,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdentityExtractionResult,
  IdentityFailureCode,
  PermissionPolicy,
} from './types';

export const UNTRUSTED_REQUEST_IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  'uid',
  'userId',
  'authorUid',
  'ownerUid',
  'actorUid',
  'adminUid',
  'createdByUid',
  'role',
  'userRole',
  'isAdmin',
  'isDelegatedAdmin',
  'emailVerified',
  'claims',
]);

export function extractSingleBearerToken(
  req: Pick<Request, 'headers'>,
): { ok: true; token: string } | { ok: false; code: IdentityFailureCode; reason: string } {
  const rawAuthHeader = req.headers?.authorization;
  if (Array.isArray(rawAuthHeader)) {
    return { ok: false, code: 'AMBIGUOUS_AUTH_HEADER', reason: 'Multiple Authorization headers are not permitted.' };
  }
  if (typeof rawAuthHeader !== 'string' || !rawAuthHeader.trim()) {
    return { ok: false, code: 'MISSING_AUTH_HEADER', reason: 'Missing Authorization Bearer header.' };
  }
  const trimmed = rawAuthHeader.trim();
  if (trimmed.includes(',')) {
    return { ok: false, code: 'AMBIGUOUS_AUTH_HEADER', reason: 'Commas in Authorization header are not permitted.' };
  }
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (!match || !match[1]) {
    return { ok: false, code: 'MALFORMED_BEARER_TOKEN', reason: 'Authorization header must follow "Bearer <token>" syntax.' };
  }
  const token = match[1].trim();
  if (token.length < 16 || token.length > 4096) {
    return { ok: false, code: 'MALFORMED_BEARER_TOKEN', reason: 'Bearer token length is outside valid security bounds.' };
  }
  return { ok: true, token };
}

function classifyFirebaseVerifyError(err: unknown): { code: IdentityFailureCode; reason: string } {
  const errObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const rawCode = typeof errObj.code === 'string' ? errObj.code.toLowerCase() : '';
  const rawMsg = typeof errObj.message === 'string' ? errObj.message.toLowerCase() : '';

  if (rawCode.includes('id-token-expired') || rawMsg.includes('expired')) {
    return { code: 'EXPIRED_FIREBASE_TOKEN', reason: 'Firebase ID token has expired.' };
  }
  if (rawCode.includes('id-token-revoked') || rawMsg.includes('revoked')) {
    return { code: 'REVOKED_FIREBASE_TOKEN', reason: 'Firebase ID token has been revoked.' };
  }
  if (rawCode.includes('user-disabled') || rawMsg.includes('disabled')) {
    return { code: 'DISABLED_USER_IDENTITY', reason: 'User identity has been disabled.' };
  }
  if (rawCode.includes('argument-error') || rawMsg.includes('malformed')) {
    return { code: 'MALFORMED_BEARER_TOKEN', reason: 'Malformed Firebase ID token.' };
  }
  return { code: 'INVALID_FIREBASE_TOKEN', reason: 'Invalid or unverifiable Firebase ID token.' };
}

export async function extractAuthenticatedPrincipal(
  req: Pick<Request, 'headers'>,
  verifier: FirebaseTokenVerifierAdapter | null | undefined,
  options?: { requireVerifiedEmail?: boolean },
): Promise<IdentityExtractionResult> {
  const tokenResult = extractSingleBearerToken(req);
  if ('code' in tokenResult) {
    return { ok: false, failureCode: tokenResult.code, status: 401, reason: tokenResult.reason };
  }
  if (!verifier || typeof verifier.verifyIdToken !== 'function') {
    return {
      ok: false,
      failureCode: 'AUTH_PROVIDER_UNAVAILABLE',
      status: 503,
      reason: 'Authentication verifier is unavailable (fail-closed).',
    };
  }

  try {
    const decoded = await verifier.verifyIdToken(tokenResult.token, true);
    if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid.trim()) {
      return { ok: false, failureCode: 'INVALID_FIREBASE_TOKEN', status: 401, reason: 'Verified token missing subject UID.' };
    }
    if (verifier.expectedProjectId && typeof decoded.aud === 'string' && decoded.aud !== verifier.expectedProjectId) {
      return { ok: false, failureCode: 'PROJECT_AUDIENCE_MISMATCH', status: 401, reason: 'Token audience mismatch.' };
    }
    if (typeof verifier.isUserDisabled === 'function' && (await verifier.isUserDisabled(decoded.uid))) {
      return { ok: false, failureCode: 'DISABLED_USER_IDENTITY', status: 403, reason: 'User account is disabled.' };
    }

    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    const emailVerified = decoded.email_verified === true;
    if ((options?.requireVerifiedEmail ?? true) && (!email || !emailVerified)) {
      return { ok: false, failureCode: 'EMAIL_NOT_VERIFIED', status: 403, reason: 'Verified email address is required.' };
    }

    const principal: AuthenticatedPrincipal = {
      uid: decoded.uid.trim(),
      email,
      emailVerified,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      authTimeSeconds: typeof decoded.auth_time === 'number' ? decoded.auth_time : undefined,
      issuedAtSeconds: typeof decoded.iat === 'number' ? decoded.iat : undefined,
      expiresAtSeconds: typeof decoded.exp === 'number' ? decoded.exp : undefined,
      tenantId: decoded.firebase?.tenant,
      claims: { ...decoded },
    };
    return { ok: true, principal };
  } catch (err) {
    const classified = classifyFirebaseVerifyError(err);
    return {
      ok: false,
      failureCode: classified.code,
      status: classified.code === 'DISABLED_USER_IDENTITY' ? 403 : 401,
      reason: classified.reason,
    };
  }
}

export function stripUntrustedIdentityFields(payload: Record<string, unknown> | null | undefined): {
  sanitizedPayload: Record<string, unknown>;
  strippedFields: string[];
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { sanitizedPayload: {}, strippedFields: [] };
  }
  const sanitizedPayload: Record<string, unknown> = {};
  const strippedFields: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (UNTRUSTED_REQUEST_IDENTITY_FIELDS.has(key)) strippedFields.push(key);
    else sanitizedPayload[key] = value;
  }
  return { sanitizedPayload, strippedFields };
}

export function timingSafeSha256Equals(rawSecret: string, expectedHexHash: string): boolean {
  if (!rawSecret || !expectedHexHash || expectedHexHash.length !== 64) return false;
  const candidateHex = crypto.createHash('sha256').update(rawSecret, 'utf8').digest('hex');
  const bufA = Buffer.from(candidateHex, 'hex');
  const bufB = Buffer.from(expectedHexHash, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function verifyAdminOrDelegatedPrincipal(
  principal: AuthenticatedPrincipal | null | undefined,
  adminStore: DelegatedAdminStoreAdapter | null | undefined,
  policy: AdminAuthorizationPolicy = {},
): Promise<AuthorizationDecision> {
  if (!principal || !principal.uid) {
    return { allowed: false, status: 401, effectiveRole: 'guest', failureCode: 'MISSING_AUTH_HEADER', reason: 'Authenticated principal required.' };
  }
  if (policy.disallowStaticToken && principal.authMode === 'server_secret_token') {
    return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'STATIC_TOKEN_DISALLOWED', reason: 'Static server token disallowed.' };
  }
  if (typeof policy.maxAuthAgeSeconds === 'number' && policy.maxAuthAgeSeconds > 0) {
    const nowSec = policy.nowSeconds ?? Math.floor(Date.now() / 1000);
    const authTime = principal.authTimeSeconds ?? principal.issuedAtSeconds;
    if (typeof authTime !== 'number' || nowSec - authTime > policy.maxAuthAgeSeconds) {
      return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'RECENT_REAUTH_REQUIRED', reason: 'Recent re-authentication required.' };
    }
  }

  const normalizedPrimary = (policy.primaryAdminEmails ?? []).map((e) => e.trim().toLowerCase());
  if (principal.emailVerified && principal.email && normalizedPrimary.includes(principal.email.toLowerCase())) {
    return { allowed: true, status: 200, effectiveRole: 'primary_admin' };
  }
  if (policy.requirePrimaryBootstrapAdmin) {
    return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'INSUFFICIENT_ROLE', reason: 'Primary bootstrap admin required.' };
  }
  if (!adminStore || typeof adminStore.getDelegatedAdminByUid !== 'function') {
    return { allowed: false, status: 503, effectiveRole: principal.role, failureCode: 'AUTHZ_STORE_FAILURE', reason: 'Delegated admin store unavailable (fail-closed).' };
  }

  try {
    const record = await adminStore.getDelegatedAdminByUid(principal.uid);
    if (!record) {
      return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'INSUFFICIENT_ROLE', reason: 'Not an authorized admin.' };
    }
    if (record.disabled === true || record.active === false || record.role === 'revoked') {
      return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'DELEGATED_ADMIN_REVOKED', reason: 'Delegated admin revoked or disabled.' };
    }
    if (record.expiresAtIso) {
      const expMs = Date.parse(record.expiresAtIso);
      const nowMs = (policy.nowSeconds ?? Math.floor(Date.now() / 1000)) * 1000;
      if (!Number.isFinite(expMs) || nowMs >= expMs) {
        return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'DELEGATED_ADMIN_REVOKED', reason: 'Delegated admin grant expired.' };
      }
    }
    return { allowed: true, status: 200, effectiveRole: 'delegated_admin' };
  } catch {
    return { allowed: false, status: 503, effectiveRole: principal.role, failureCode: 'AUTHZ_STORE_FAILURE', reason: 'Delegated admin check failed (fail-closed).' };
  }
}

export async function authorizePrincipal(
  principal: AuthenticatedPrincipal | null | undefined,
  policy: PermissionPolicy,
  adminStore?: DelegatedAdminStoreAdapter | null,
  primaryAdminEmails?: string[],
  nowSeconds?: number,
): Promise<AuthorizationDecision> {
  if (!principal || !principal.uid) {
    return { allowed: false, status: 401, effectiveRole: 'guest', failureCode: 'MISSING_AUTH_HEADER', reason: 'Authentication required.' };
  }
  if (policy.disallowStaticToken && principal.authMode === 'server_secret_token') {
    return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'STATIC_TOKEN_DISALLOWED', reason: 'Static server token disallowed.' };
  }
  if (typeof policy.maxAuthAgeSeconds === 'number' && policy.maxAuthAgeSeconds > 0) {
    const nowSec = nowSeconds ?? Math.floor(Date.now() / 1000);
    const authTime = principal.authTimeSeconds ?? principal.issuedAtSeconds;
    if (typeof authTime !== 'number' || nowSec - authTime > policy.maxAuthAgeSeconds) {
      return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'RECENT_REAUTH_REQUIRED', reason: 'Recent authentication required.' };
    }
  }
  if (policy.minimumRole === 'primary_admin' || policy.minimumRole === 'delegated_admin') {
    return verifyAdminOrDelegatedPrincipal(principal, adminStore, {
      requirePrimaryBootstrapAdmin: policy.minimumRole === 'primary_admin',
      disallowStaticToken: policy.disallowStaticToken,
      maxAuthAgeSeconds: policy.maxAuthAgeSeconds,
      primaryAdminEmails,
      nowSeconds,
    });
  }
  if (!principal.emailVerified) {
    return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'EMAIL_NOT_VERIFIED', reason: 'Verified email required.' };
  }
  if (typeof policy.resourceOwnerUid === 'string') {
    const ownerUid = policy.resourceOwnerUid.trim();
    if (!ownerUid) {
      return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'RESOURCE_OWNERSHIP_MISMATCH', reason: 'Resource owner missing (fail-closed).' };
    }
    if (principal.uid === ownerUid) {
      return { allowed: true, status: 200, effectiveRole: 'verified_user' };
    }
    if (policy.allowAdminOverrideForOwnership) {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(principal, adminStore, {
        disallowStaticToken: policy.disallowStaticToken,
        maxAuthAgeSeconds: policy.maxAuthAgeSeconds,
        primaryAdminEmails,
        nowSeconds,
      });
      if (adminDecision.allowed) return adminDecision;
    }
    return { allowed: false, status: 403, effectiveRole: principal.role, failureCode: 'RESOURCE_OWNERSHIP_MISMATCH', reason: 'Principal does not own resource.' };
  }
  return { allowed: true, status: 200, effectiveRole: 'verified_user' };
}

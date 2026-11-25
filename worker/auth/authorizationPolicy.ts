/**
 * @file worker/auth/authorizationPolicy.ts
 * @description Cloudflare Worker authorization policy engine for Tehran Radar.
 * Enforces role-based, owner-based, admin, and service-to-service access controls
 * matching legacy Express semantics with zero Node.js/firebase-admin coupling.
 */
import { PRIMARY_BOOTSTRAP_ADMIN_EMAIL } from '../../src/utils/domainSecurityValidators';
import { EXPECTED_FIREBASE_PROJECT_ID } from '../../src/utils/serverConfigValidator';
import { isBootstrapAdminEmail, normalizeCanonicalEmailIdentity } from '../../src/utils/security';
import { verifyFirebaseIdToken, type VerifyFirebaseIdTokenOptions } from './firebaseTokenVerifier';
import { createWorkerRequestContext } from '../contextAndSecurity';
import { authenticateWorkerSession, hasRadarSessionCookie } from './sessionAuth';
import {
  isWorkerProductionEnvironment,
  resolveWorkerAppCheckMode,
  verifyWorkerAppCheck,
} from './appCheckVerifier';
import type { WorkerEnv } from '../types';
import type {
  AuthenticatedWorkerPrincipal,
  AuthorizationPolicyRequirement,
  SecurityAuditAction,
  SecurityAuditEvent,
  WorkerAuthContext,
  WorkerAuthorizationDecision,
} from './types';

export function constantTimeSecretMatch(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function extractSingleSecurityHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  targetNameLower: string
): { ok: true; value: string | undefined } | { ok: false; reason: 'AMBIGUOUS_AUTH_HEADER' } {
  let matched: string | string[] | undefined;
  let count = 0;

  const entries: Array<[string, string | string[] | undefined]> =
    typeof (headers as Headers).entries === 'function' && !(headers instanceof Array)
      ? Array.from((headers as Headers).entries())
      : Object.entries(headers as Record<string, string | string[] | undefined>);

  for (const [key, value] of entries) {
    if (key.toLowerCase() === targetNameLower && value !== undefined) {
      count += 1;
      matched = value;
    }
  }
  if (count > 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
  if (Array.isArray(matched)) {
    if (matched.length > 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
    matched = matched[0];
  }
  if (typeof matched === 'string') {
    if (matched.includes(',') || /[\r\n\u0000]/.test(matched)) {
      return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
    }
    return { ok: true, value: matched.trim() };
  }
  return { ok: true, value: undefined };
}

export interface ResolveWorkerAuthOptions {
  readonly expectedProjectId?: string;
  readonly adminApiSecret?: string;
  readonly adminEmail?: string;
  readonly delegatedAdminChecker?: (uid: string, email: string) => Promise<boolean>;
  readonly tokenVerifyOptions?: Partial<VerifyFirebaseIdTokenOptions>;
  /** When true, Firebase-authenticated requests must also pass App Check. */
  readonly requireAppCheck?: boolean;
  readonly env?: WorkerEnv;
}

export async function resolveWorkerAuthContext(
  request: Request,
  options: ResolveWorkerAuthOptions = {}
): Promise<WorkerAuthContext> {
  const correlationId =
    request.headers.get('x-correlation-id')?.trim() || `auth_${crypto.randomUUID()}`;
  const environment = 'production';
  const nowMs = Date.now();

  const authHeaderResult = extractSingleSecurityHeader(request.headers, 'authorization');
  if (!authHeaderResult.ok) {
    return {
      authenticated: false,
      mode: 'anonymous',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: 'AMBIGUOUS_AUTH_HEADER',
      failureStatusCode: 400,
      failureReason: 'ارسال هم‌زمان چندین هدر Authorization مجاز نیست.',
    };
  }

  const adminTokenResult = extractSingleSecurityHeader(request.headers, 'x-admin-token');
  if (!adminTokenResult.ok) {
    return {
      authenticated: false,
      mode: 'anonymous',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: 'AMBIGUOUS_AUTH_HEADER',
      failureStatusCode: 400,
      failureReason: 'ارسال هم‌زمان چندین هدر x-admin-token مجاز نیست.',
    };
  }

  const rawAdminToken = adminTokenResult.value;
  const rawAuthHeader = authHeaderResult.value;

  // 1. Service-to-service static admin secret authentication
  if (rawAdminToken && !rawAuthHeader) {
    const expectedSecret = options.adminApiSecret;
    if (expectedSecret && constantTimeSecretMatch(rawAdminToken, expectedSecret)) {
      const email = options.adminEmail || PRIMARY_BOOTSTRAP_ADMIN_EMAIL;
      const principal: AuthenticatedWorkerPrincipal = {
        uid: 'server-secret-admin',
        email,
        emailVerified: true,
        role: 'service_admin',
        authMode: 'server_secret_token',
        isPrimaryAdmin: true,
        isDelegatedAdmin: false,
        claims: { isServiceAdmin: true },
      };
      return {
        authenticated: true,
        mode: 'server_secret_token',
        principal,
        verifiedAtMs: nowMs,
        correlationId,
        environment,
      };
    }
    return {
      authenticated: false,
      mode: 'server_secret_token',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: 'INVALID_ADMIN_SECRET',
      failureStatusCode: 403,
      failureReason: 'کلید امنیتی مدیر سیستم نامعتبر است.',
    };
  }

  // 2. Prefer a verified Cloudflare-native HttpOnly session when its cookie is present.
  // A malformed, expired, revoked, or unverifiable session must fail closed; it must not
  // silently fall back to a second credential in the same request.
  if (hasRadarSessionCookie(request)) {
    const sessionContext = createWorkerRequestContext(request, options.env || {});
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase());
    const session = await authenticateWorkerSession(sessionContext, isMutation);
    if (!session.authenticated || !session.uid) {
      return {
        authenticated: false,
        mode: 'cloudflare_d1_session',
        principal: null,
        verifiedAtMs: nowMs,
        correlationId,
        environment,
        failureCode: session.reasonCode,
        failureStatusCode: session.statusCode === 200 ? 401 : session.statusCode,
        failureReason: session.reasonCode,
      };
    }
    const principal: AuthenticatedWorkerPrincipal = {
      uid: session.uid,
      email: session.email || undefined,
      emailVerified: session.emailVerified,
      role: session.isPrimaryAdmin ? 'primary_admin' : session.isDelegatedAdmin ? 'delegated_admin' : 'verified_user',
      authMode: 'cloudflare_d1_session',
      authTimeSeconds: session.authTimeSeconds || undefined,
      isPrimaryAdmin: session.isPrimaryAdmin,
      isDelegatedAdmin: session.isDelegatedAdmin,
      claims: {
        uid: session.uid,
        email: session.email,
        email_verified: session.emailVerified,
        phone_number: session.phoneNumber,
        auth_provider: session.authProvider,
        isAdmin: session.isAdmin,
      },
    };
    return {
      authenticated: true,
      mode: 'cloudflare_d1_session',
      principal,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
    };
  }

  // 3. No bearer token present -> Anonymous request
  if (!rawAuthHeader) {
    return {
      authenticated: false,
      mode: 'anonymous',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
    };
  }

  // 3. Validate Bearer scheme
  if (!rawAuthHeader.toLowerCase().startsWith('bearer ')) {
    return {
      authenticated: false,
      mode: 'anonymous',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: 'MISSING_BEARER_TOKEN',
      failureStatusCode: 401,
      failureReason: 'هدر احراز هویت باید با پیشوند Bearer ارسال شود.',
    };
  }

  const token = rawAuthHeader.slice(7).trim();
  const projectId = options.expectedProjectId || EXPECTED_FIREBASE_PROJECT_ID;

  const verifyResult = await verifyFirebaseIdToken(token, {
    expectedProjectId: projectId,
    ...options.tokenVerifyOptions,
  });

  if (!verifyResult.valid || !verifyResult.claims) {
    return {
      authenticated: false,
      mode: 'firebase_id_token',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: verifyResult.code || 'INVALID_FIREBASE_TOKEN',
      failureStatusCode: verifyResult.status === 200 ? 401 : verifyResult.status,
      failureReason: verifyResult.reason,
    };
  }

  if (options.requireAppCheck) {
    if (!options.env) {
      return {
        authenticated: false,
        mode: 'firebase_id_token',
        principal: null,
        verifiedAtMs: nowMs,
        correlationId,
        environment,
        failureCode: 'APP_CHECK_VERIFIER_CONFIGURATION_MISSING',
        failureStatusCode: 503,
        failureReason: 'App Check verification configuration is unavailable.',
      };
    }
    const appCheckMode = resolveWorkerAppCheckMode(options.env, { sensitiveRoute: true });
    const debugAllowlist = String(options.env.FIREBASE_APP_CHECK_DEBUG_ALLOWLIST || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const appCheckResult = await verifyWorkerAppCheck(request, {
      mode: appCheckMode,
      isProduction: isWorkerProductionEnvironment(options.env),
      expectedAppId: options.env.FIREBASE_APP_CHECK_APP_ID,
      expectedProjectId: projectId,
      expectedProjectNumber: options.env.FIREBASE_PROJECT_NUMBER,
      debugAllowlist,
    });
    if (!appCheckResult.allowed) {
      return {
        authenticated: false,
        mode: 'firebase_id_token',
        principal: null,
        verifiedAtMs: nowMs,
        correlationId,
        environment,
        failureCode: appCheckResult.reason,
        failureStatusCode: appCheckResult.statusCode === 503 ? 503 : appCheckResult.statusCode === 403 ? 403 : 401,
        failureReason: 'Firebase App Check verification failed.',
      };
    }
  }

  const claims = verifyResult.claims;
  const uid = String(claims.sub || claims.uid || '').trim();
  const email = normalizeCanonicalEmailIdentity(claims.email);
  const emailVerified = claims.email_verified === true;

  if (!emailVerified || !email) {
    return {
      authenticated: false,
      mode: 'firebase_id_token',
      principal: null,
      verifiedAtMs: nowMs,
      correlationId,
      environment,
      failureCode: 'EMAIL_NOT_VERIFIED',
      failureStatusCode: 403,
      failureReason: 'استفاده از این بخش نیازمند ایمیل تأییدشده است.',
    };
  }

  const isPrimary = isBootstrapAdminEmail(email) || email === (options.adminEmail || '').toLowerCase();
  let isDelegated = false;
  if (!isPrimary && options.delegatedAdminChecker) {
    try {
      isDelegated = await options.delegatedAdminChecker(uid, email);
    } catch {
      isDelegated = false;
    }
  }

  const role = isPrimary
    ? 'primary_admin'
    : isDelegated
      ? 'delegated_admin'
      : 'verified_user';

  const principal: AuthenticatedWorkerPrincipal = {
    uid,
    email,
    emailVerified,
    role,
    authMode: 'firebase_id_token',
    authTimeSeconds: typeof claims.auth_time === 'number' ? claims.auth_time : undefined,
    issuedAtSeconds: typeof claims.iat === 'number' ? claims.iat : undefined,
    expiresAtSeconds: typeof claims.exp === 'number' ? claims.exp : undefined,
    tenantId: claims.firebase?.tenant,
    isPrimaryAdmin: isPrimary,
    isDelegatedAdmin: isDelegated,
    claims,
  };

  return {
    authenticated: true,
    mode: 'firebase_id_token',
    principal,
    verifiedAtMs: nowMs,
    correlationId,
    environment,
  };
}

export function evaluateWorkerAuthorization(
  authCtx: WorkerAuthContext,
  req: AuthorizationPolicyRequirement
): WorkerAuthorizationDecision {
  const policy = req.policy;

  if (policy === 'PUBLIC') {
    return {
      allowed: true,
      statusCode: 200,
      reasonFa: 'دسترسی عمومی مجاز است.',
      reasonEn: 'Public access allowed.',
    };
  }

  if (!authCtx.authenticated || !authCtx.principal) {
    return {
      allowed: false,
      statusCode: authCtx.failureStatusCode || 401,
      failureCode: (authCtx.failureCode as WorkerAuthorizationDecision['failureCode']) || 'MISSING_BEARER_TOKEN',
      reasonFa: authCtx.failureReason || 'ورود به حساب کاربری الزامی است.',
      reasonEn: 'Authentication required.',
    };
  }

  const p = authCtx.principal;

  if (policy === 'VERIFIED_USER') {
    return {
      allowed: true,
      statusCode: 200,
      reasonFa: 'دسترسی کاربر تأییدشده مجاز است.',
      reasonEn: 'Verified user access allowed.',
    };
  }

  if (policy === 'RESOURCE_OWNER_OR_ADMIN') {
    const isOwner = Boolean(req.resourceOwnerUid && p.uid === req.resourceOwnerUid);
    const isAdmin = p.isPrimaryAdmin || p.isDelegatedAdmin || p.role === 'service_admin';
    if (isOwner || isAdmin) {
      return {
        allowed: true,
        statusCode: 200,
        reasonFa: isOwner ? 'دسترسی مالک منبع تأیید شد.' : 'دسترسی مدیر سیستم تأیید شد.',
        reasonEn: 'Resource owner or admin access granted.',
      };
    }
    return {
      allowed: false,
      statusCode: 403,
      failureCode: 'RESOURCE_OWNER_MISMATCH',
      reasonFa: 'شما مجاز به تغییر یا دسترسی به این منبع نیستید.',
      reasonEn: 'Resource owner mismatch.',
    };
  }

  if (policy === 'ADMIN') {
    const isAdmin = p.isPrimaryAdmin || p.isDelegatedAdmin || p.role === 'service_admin';
    if (isAdmin) {
      return {
        allowed: true,
        statusCode: 200,
        reasonFa: 'دسترسی مدیر سیستم تأیید شد.',
        reasonEn: 'Admin access granted.',
      };
    }
    return {
      allowed: false,
      statusCode: 403,
      failureCode: 'NOT_ADMIN_USER',
      reasonFa: 'این عملیات نیازمند دسترسی مدیریت است.',
      reasonEn: 'Admin authority required.',
    };
  }

  if (policy === 'PRIMARY_ADMIN') {
    if (req.allowServerSecretToken === false && p.authMode === 'server_secret_token') {
      return {
        allowed: false,
        statusCode: 403,
        failureCode: 'STATIC_ADMIN_TOKEN_FORBIDDEN_FOR_OPERATION',
        reasonFa: 'این عملیات صرفاً با حساب ادمین ارشد (Bootstrap) مجاز است.',
        reasonEn: 'Static admin token forbidden for primary admin operation.',
      };
    }
    if (p.isPrimaryAdmin) {
      return {
        allowed: true,
        statusCode: 200,
        reasonFa: 'دسترسی ادمین ارشد تأیید شد.',
        reasonEn: 'Primary admin access granted.',
      };
    }
    return {
      allowed: false,
      statusCode: 403,
      failureCode: 'INSUFFICIENT_ROLE',
      reasonFa: 'این عملیات صرفاً برای مدیر ارشد سیستم مجاز است.',
      reasonEn: 'Primary bootstrap admin required.',
    };
  }

  return {
    allowed: false,
    statusCode: 403,
    failureCode: 'INSUFFICIENT_ROLE',
    reasonFa: 'سیاست دسترسی ناشناخته است.',
    reasonEn: 'Unknown authorization policy.',
  };
}

export function buildSecurityAuditEvent(
  action: SecurityAuditAction,
  ctx: {
    clientIp: string;
    correlationId: string;
    path: string;
    method: string;
    actorUid?: string;
    actorEmail?: string;
    failureCode?: string;
    failureReason?: string;
  }
): SecurityAuditEvent {
  return {
    action,
    clientIp: ctx.clientIp,
    correlationId: ctx.correlationId,
    path: ctx.path,
    method: ctx.method,
    actorUid: ctx.actorUid,
    actorEmail: ctx.actorEmail,
    failureCode: ctx.failureCode,
    failureReason: ctx.failureReason,
    timestampIso: new Date().toISOString(),
  };
}

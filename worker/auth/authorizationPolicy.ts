/**
 * Cloudflare-native authorization policy.
 *
 * The only browser credential accepted is the opaque HttpOnly D1 session cookie.
 * Firebase ID tokens, App Check tokens, and static admin headers are retired.
 */
import { createWorkerRequestContext } from '../contextAndSecurity';
import { authenticateWorkerSession, hasRadarSessionCookie } from './sessionAuth';
import type { WorkerEnv } from '../types';
import type {
  AuthenticatedWorkerPrincipal,
  AuthorizationPolicyRequirement,
  SecurityAuditAction,
  SecurityAuditEvent,
  WorkerAuthContext,
  WorkerAuthorizationDecision,
} from './types';

export function extractSingleSecurityHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  targetNameLower: string,
): { ok: true; value: string | undefined } | { ok: false; reason: 'AMBIGUOUS_AUTH_HEADER' } {
  const entries: Array<[string, string | string[] | undefined]> =
    headers instanceof Headers
      ? Array.from(headers.entries())
      : Object.entries(headers);

  let matched: string | string[] | undefined;
  let count = 0;
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== targetNameLower || value === undefined) continue;
    count += 1;
    matched = value;
  }
  if (count > 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
  if (Array.isArray(matched)) {
    if (matched.length !== 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
    matched = matched[0];
  }
  if (typeof matched !== 'string') return { ok: true, value: undefined };
  if (matched.includes(',') || /[\r\n\u0000]/.test(matched)) {
    return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
  }
  return { ok: true, value: matched.trim() };
}

export interface ResolveWorkerAuthOptions {
  readonly env?: WorkerEnv;
}

function buildUnauthenticatedContext(
  correlationId: string,
  environment: WorkerAuthContext['environment'],
  failureCode?: string,
  failureStatusCode: 400 | 401 | 403 | 503 = 401,
): WorkerAuthContext {
  return {
    authenticated: false,
    mode: 'anonymous',
    principal: null,
    verifiedAtMs: Date.now(),
    correlationId,
    environment,
    ...(failureCode ? {
      failureCode,
      failureStatusCode,
      failureReason: failureCode,
    } : {}),
  };
}

/**
 * Resolves a native D1 session. There is deliberately no Firebase Bearer,
 * App Check, or static-admin fallback.
 */
export async function resolveWorkerAuthContext(
  request: Request,
  options: ResolveWorkerAuthOptions = {},
): Promise<WorkerAuthContext> {
  const env = options.env || {};
  const requestContext = createWorkerRequestContext(request, env);
  const correlationId = request.headers.get('x-correlation-id')?.trim() || requestContext.correlationId;
  const environment = requestContext.environment;

  const authorization = extractSingleSecurityHeader(request.headers, 'authorization');
  if (!authorization.ok) {
    return buildUnauthenticatedContext(correlationId, environment, 'AMBIGUOUS_AUTH_HEADER', 400);
  }
  const adminToken = extractSingleSecurityHeader(request.headers, 'x-admin-token');
  if (!adminToken.ok) {
    return buildUnauthenticatedContext(correlationId, environment, 'AMBIGUOUS_AUTH_HEADER', 400);
  }
  if (adminToken.value) {
    return buildUnauthenticatedContext(correlationId, environment, 'STATIC_ADMIN_TOKEN_RETIRED', 403);
  }

  // A present native cookie always owns the credential decision. If it is duplicated,
  // malformed, expired, or revoked, a Bearer header must never downgrade it to anonymous
  // or trigger a legacy Firebase fallback.
  if (hasRadarSessionCookie(request)) {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase());
    const session = await authenticateWorkerSession(requestContext, isMutation);
    if (!session.authenticated || !session.uid) {
      return {
        authenticated: false,
        mode: 'cloudflare_d1_session',
        principal: null,
        verifiedAtMs: Date.now(),
        correlationId,
        environment,
        failureCode: session.reasonCode || 'CLOUDFLARE_SESSION_INVALID',
        failureStatusCode: session.statusCode === 200 ? 401 : session.statusCode,
        failureReason: session.reasonCode || 'CLOUDFLARE_SESSION_INVALID',
      };
    }
    const principal: AuthenticatedWorkerPrincipal = {
      uid: session.uid,
      ...(session.email ? { email: session.email } : {}),
      emailVerified: session.emailVerified,
      role: session.isPrimaryAdmin
        ? 'primary_admin'
        : session.isDelegatedAdmin
          ? 'delegated_admin'
          : 'verified_user',
      authMode: 'cloudflare_d1_session',
      authTimeSeconds: session.authTimeSeconds || undefined,
      isPrimaryAdmin: session.isPrimaryAdmin,
      isDelegatedAdmin: session.isDelegatedAdmin,
      claims: {
        uid: session.uid,
        email: session.email,
        email_verified: session.emailVerified,
        phone_number: session.phoneNumber,
        display_name: session.displayName,
        auth_provider: session.authProvider,
        isAdmin: session.isAdmin,
      },
    };
    return {
      authenticated: true,
      mode: 'cloudflare_d1_session',
      principal,
      verifiedAtMs: Date.now(),
      correlationId,
      environment,
    };
  }

  if (authorization.value) {
    return buildUnauthenticatedContext(correlationId, environment, 'FIREBASE_BEARER_TOKEN_RETIRED', 401);
  }
  return buildUnauthenticatedContext(correlationId, environment);



}

export function evaluateWorkerAuthorization(
  authCtx: WorkerAuthContext,
  req: AuthorizationPolicyRequirement,
): WorkerAuthorizationDecision {
  const policy = req.policy;
  if (policy === 'PUBLIC') {
    return { allowed: true, statusCode: 200, reasonFa: 'دسترسی عمومی مجاز است.', reasonEn: 'Public access allowed.' };
  }

  if (!authCtx.authenticated || !authCtx.principal) {
    return {
      allowed: false,
      statusCode: authCtx.failureStatusCode || 401,
      failureCode: authCtx.failureCode as WorkerAuthorizationDecision['failureCode'] || 'SESSION_INVALID',
      reasonFa: authCtx.failureReason || 'ورود به حساب کاربری الزامی است.',
      reasonEn: 'Authentication required.',
    };
  }

  const principal = authCtx.principal;
  if (policy === 'VERIFIED_USER') {
    return { allowed: true, statusCode: 200, reasonFa: 'دسترسی کاربر تأییدشده مجاز است.', reasonEn: 'Verified user access allowed.' };
  }

  const isAdmin = principal.isPrimaryAdmin || principal.isDelegatedAdmin;
  if (policy === 'RESOURCE_OWNER_OR_ADMIN') {
    const isOwner = Boolean(req.resourceOwnerUid && principal.uid === req.resourceOwnerUid);
    return isOwner || isAdmin
      ? {
          allowed: true,
          statusCode: 200,
          reasonFa: isOwner ? 'دسترسی مالک منبع تأیید شد.' : 'دسترسی مدیر سیستم تأیید شد.',
          reasonEn: 'Resource owner or admin access granted.',
        }
      : {
          allowed: false,
          statusCode: 403,
          failureCode: 'RESOURCE_OWNER_MISMATCH',
          reasonFa: 'شما مجاز به تغییر یا دسترسی به این منبع نیستید.',
          reasonEn: 'Resource owner mismatch.',
        };
  }

  if (policy === 'ADMIN') {
    return isAdmin
      ? { allowed: true, statusCode: 200, reasonFa: 'دسترسی مدیر سیستم تأیید شد.', reasonEn: 'Admin access granted.' }
      : {
          allowed: false,
          statusCode: 403,
          failureCode: 'NOT_ADMIN_USER',
          reasonFa: 'این عملیات نیازمند دسترسی مدیریت است.',
          reasonEn: 'Admin authority required.',
        };
  }

  if (policy === 'PRIMARY_ADMIN') {
    if (principal.isPrimaryAdmin) {
      return { allowed: true, statusCode: 200, reasonFa: 'دسترسی ادمین ارشد تأیید شد.', reasonEn: 'Primary admin access granted.' };
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
  },
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

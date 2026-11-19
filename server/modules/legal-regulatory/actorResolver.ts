import type { Request } from 'express';
import {
  verifyAdminApiAuthorization,
  verifyAuthenticatedUserHeader,
  type AdminAuthVerificationResult,
  type VerifiedUserAuthResult,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import type { LegalRegulatoryActorContext } from './types';
import { LegalRegulatoryError } from './validationAndAuthz';

export type ExpressHeadersMap = Record<string, string | string[] | undefined>;

export interface LegalRegulatoryAuthDeps {
  verifyAdmin?: (headers: ExpressHeadersMap) => Promise<AdminAuthVerificationResult>;
  verifyUser?: (headers: ExpressHeadersMap) => Promise<VerifiedUserAuthResult>;
}

/**
 * Canonical Stage 30-A Actor Context contract (LEGAL_REVIEWER intentionally disabled).
 */
export interface LegalActorContext {
  actorId: string;
  role: 'PUBLIC_READER' | 'AUTHENTICATED_USER' | 'REGULATORY_ADMIN';
  authenticated: boolean;
}

export type LegalActorResolution =
  | {
      authorized: true;
      actor: LegalActorContext;
    }
  | {
      authorized: false;
      statusCode: 401 | 403;
      reason: string;
    };

/**
 * Resolves the authoritative Legal & Regulatory actor strictly from server-verified
 * Firebase Auth / Admin verification outputs (`src/utils/serverAdminAndTelegramSecurity.ts`).
 *
 * Security invariants (Stage 30-A / 30-B / 30-C):
 * - NEVER reads `x-legal-actor-id`, `x-legal-actor-role`, req.body, or req.query for identity/role.
 * - Extracts UID strictly from verified return fields:
 *     - `AdminAuthVerificationResult.uid` / `AdminAuthVerificationResult.actorUid`
 *     - `VerifiedUserAuthResult.uid`
 * - NEVER falls back to static strings like `'system-admin-key'` or `'server-secret-admin'`.
 * - Disallows static admin tokens (`disallowStaticToken: true`).
 * - Keeps `LEGAL_REVIEWER` disabled and fail-closed until a canonical server-side Legal Reviewer registry exists.
 */
export async function resolveLegalRegulatoryActor(
  req: Request,
  deps?: LegalRegulatoryAuthDeps,
): Promise<LegalRegulatoryActorContext> {
  const headers = (req.headers ?? {}) as ExpressHeadersMap;
  const verifyAdminFn =
    deps?.verifyAdmin ??
    ((h: ExpressHeadersMap) => verifyAdminApiAuthorization(h, process.env, { disallowStaticToken: true }));
  const verifyUserFn = deps?.verifyUser ?? ((h: ExpressHeadersMap) => verifyAuthenticatedUserHeader(h));

  const hasAuthHeader =
    typeof headers.authorization === 'string' && headers.authorization.trim().length > 0;
  const hasAdminTokenHeader =
    typeof headers['x-admin-token'] === 'string' && headers['x-admin-token'].trim().length > 0;

  if (!hasAuthHeader && !hasAdminTokenHeader) {
    return {
      actorId: 'anonymous-public-reader',
      role: 'PUBLIC_READER',
      isAuthenticated: false,
    };
  }

  const adminCheck = await verifyAdminFn(headers);
  if (adminCheck.statusCode === 503) {
    throw new LegalRegulatoryError(
      'PERSISTENCE_UNAVAILABLE',
      'Authorization service is temporarily unavailable.',
      503,
    );
  }
  const verifiedAdminUid =
    typeof adminCheck.uid === 'string' && adminCheck.uid.trim().length > 0
      ? adminCheck.uid.trim()
      : typeof adminCheck.actorUid === 'string' && adminCheck.actorUid.trim().length > 0
        ? adminCheck.actorUid.trim()
        : '';

  if (
    adminCheck.authorized &&
    verifiedAdminUid &&
    verifiedAdminUid !== 'server-secret-admin' &&
    verifiedAdminUid !== 'system-admin-key'
  ) {
    return {
      actorId: verifiedAdminUid,
      role: 'REGULATORY_ADMIN',
      isAuthenticated: true,
    };
  }

  const userCheck = await verifyUserFn(headers);
  if (userCheck.statusCode === 503) {
    throw new LegalRegulatoryError(
      'PERSISTENCE_UNAVAILABLE',
      'Authentication service is temporarily unavailable.',
      503,
    );
  }
  if (
    userCheck.authorized &&
    userCheck.authenticated &&
    typeof userCheck.uid === 'string' &&
    userCheck.uid.trim().length > 0
  ) {
    return {
      actorId: userCheck.uid.trim(),
      role: 'AUTHENTICATED_USER',
      isAuthenticated: true,
    };
  }

  return {
    actorId: 'anonymous-public-reader',
    role: 'PUBLIC_READER',
    isAuthenticated: false,
  };
}

/**
 * Resolves a request into the discriminated Stage 30-A LegalActorResolution union
 * enforcing the requested access tier (`PUBLIC` | `AUTHENTICATED` | `REGULATORY_ADMIN`).
 */
export async function resolveLegalActor(
  req: Request,
  requiredLevel: 'PUBLIC' | 'AUTHENTICATED' | 'REGULATORY_ADMIN' = 'PUBLIC',
  deps?: LegalRegulatoryAuthDeps,
): Promise<LegalActorResolution> {
  const ctx = await resolveLegalRegulatoryActor(req, deps);
  const canonicalRole: LegalActorContext['role'] =
    ctx.role === 'REGULATORY_ADMIN'
      ? 'REGULATORY_ADMIN'
      : ctx.role === 'AUTHENTICATED_USER'
        ? 'AUTHENTICATED_USER'
        : 'PUBLIC_READER';

  if (requiredLevel === 'AUTHENTICATED' && (!ctx.isAuthenticated || canonicalRole === 'PUBLIC_READER')) {
    return { authorized: false, statusCode: 401, reason: 'UNAUTHENTICATED' };
  }
  if (requiredLevel === 'REGULATORY_ADMIN') {
    if (!ctx.isAuthenticated || canonicalRole === 'PUBLIC_READER') {
      return { authorized: false, statusCode: 401, reason: 'UNAUTHENTICATED' };
    }
    if (canonicalRole !== 'REGULATORY_ADMIN') {
      return { authorized: false, statusCode: 403, reason: 'FORBIDDEN_ADMIN_REQUIRED' };
    }
  }

  return {
    authorized: true,
    actor: {
      actorId: ctx.actorId,
      role: canonicalRole,
      authenticated: ctx.isAuthenticated,
    },
  };
}

/**
 * Enforces that a mutation request is invoked by a server-verified REGULATORY_ADMIN.
 * LEGAL_REVIEWER remains fail-closed (403) until a dedicated server-side reviewer registry is connected.
 */
export function assertRegulatoryAdminMutationActor(actor: LegalRegulatoryActorContext): void {
  if (!actor || !actor.isAuthenticated || !actor.actorId || actor.role === 'PUBLIC_READER') {
    throw new LegalRegulatoryError(
      'UNAUTHENTICATED',
      'Valid server-verified authentication is required for legal-regulatory mutations.',
      401,
    );
  }
  if (actor.role !== 'REGULATORY_ADMIN') {
    throw new LegalRegulatoryError(
      'FORBIDDEN',
      'Regulatory admin privileges are required for this operation.',
      403,
    );
  }
}

/**
 * Enforces that a protected user route (e.g., property profile evaluation) has a verified user or admin actor.
 */
export function assertAuthenticatedLegalActor(actor: LegalRegulatoryActorContext): void {
  if (!actor || !actor.isAuthenticated || !actor.actorId || actor.role === 'PUBLIC_READER') {
    throw new LegalRegulatoryError(
      'UNAUTHENTICATED',
      'Authentication is required to access this legal-regulatory endpoint.',
      401,
    );
  }
}

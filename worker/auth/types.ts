/**
 * @file worker/auth/types.ts
 * @description Strongly-typed authentication and authorization models for Tehran Radar on Cloudflare Workers.
 * Preserves exact Firebase Authentication, App Check, and Admin authorization semantics.
 */
import type { ApiAccessPolicy } from '../../src/utils/expressRouteCatalog';
import type { DeploymentEnvironmentName } from '../types';

export type WorkerAuthMode = 'anonymous' | 'cloudflare_d1_session';

export type WorkerUserRole =
  | 'guest'
  | 'verified_user'
  | 'delegated_admin'
  | 'primary_admin'
  | 'service_admin';

export interface AuthenticatedWorkerPrincipal {
  readonly uid: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly role: WorkerUserRole;
  readonly authMode: WorkerAuthMode;
  readonly authTimeSeconds?: number;
  readonly issuedAtSeconds?: number;
  readonly expiresAtSeconds?: number;
  readonly tenantId?: string;
  readonly isPrimaryAdmin: boolean;
  readonly isDelegatedAdmin: boolean;
  readonly claims: Readonly<Record<string, unknown>>;
}

export interface WorkerAuthContext {
  readonly authenticated: boolean;
  readonly mode: WorkerAuthMode;
  readonly principal: AuthenticatedWorkerPrincipal | null;
  readonly verifiedAtMs: number;
  readonly correlationId: string;
  readonly environment: DeploymentEnvironmentName;
  readonly failureReason?: string;
  readonly failureCode?: string;
  readonly failureStatusCode?: 400 | 401 | 403 | 503;
}

export type AuthFailureCode =
  | 'AMBIGUOUS_AUTH_HEADER'
  | 'FIREBASE_BEARER_TOKEN_RETIRED'
  | 'STATIC_ADMIN_TOKEN_RETIRED'
  | 'NOT_ADMIN_USER'
  | 'INSUFFICIENT_ROLE'
  | 'RESOURCE_OWNER_MISMATCH'
  | 'SESSION_INVALID'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_DISABLED'
  | 'USER_DB_UNAVAILABLE'
  | 'SESSION_STORE_UNAVAILABLE'
  | 'CSRF_ORIGIN_REJECTED'
  | 'RECENT_LOGIN_REQUIRED';

export interface AuthorizationPolicyRequirement {
  readonly policy: ApiAccessPolicy;
  readonly resourceOwnerUid?: string;
  readonly requirePrimaryAdmin?: boolean;
  readonly maxAuthAgeSeconds?: number;
}

export interface WorkerAuthorizationDecision {
  readonly allowed: boolean;
  readonly statusCode: 200 | 400 | 401 | 403 | 503;
  readonly failureCode?: AuthFailureCode;
  readonly reasonFa: string;
  readonly reasonEn: string;
}

export type SecurityAuditAction =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'AUTHZ_DENIAL'
  | 'ADMIN_ACCESS_GRANTED'
  | 'PRIVILEGE_ESCALATION_BLOCKED'
  | 'TOKEN_VERIFY_FAILURE'
  | 'JWKS_ROTATION_OBSERVED'
  | 'JWKS_FETCH_ERROR'
  | 'APP_CHECK_FAILURE';

export interface SecurityAuditEvent {
  readonly action: SecurityAuditAction;
  readonly clientIp: string;
  readonly correlationId: string;
  readonly path: string;
  readonly method: string;
  readonly actorUid?: string;
  readonly actorEmail?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly timestampIso: string;
}

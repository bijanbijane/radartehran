/**
 * @file worker/auth/types.ts
 * @description Strongly-typed authentication and authorization models for Tehran Radar on Cloudflare Workers.
 * Preserves exact Firebase Authentication, App Check, and Admin authorization semantics.
 */
import type { ApiAccessPolicy } from '../../src/utils/expressRouteCatalog';
import type { DeploymentEnvironmentName } from '../types';

export type WorkerAuthMode =
  | 'anonymous'
  | 'firebase_id_token'
  | 'server_secret_token'
  | 'service_to_service';

export type WorkerUserRole =
  | 'guest'
  | 'verified_user'
  | 'delegated_admin'
  | 'primary_admin'
  | 'service_admin';

export interface FirebaseTokenHeader {
  readonly alg: string;
  readonly kid: string;
  readonly typ?: string;
}

export interface FirebaseIdTokenClaims {
  readonly iss: string;
  readonly aud: string;
  readonly auth_time: number;
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly phone_number?: string;
  readonly name?: string;
  readonly picture?: string;
  readonly firebase?: {
    identities?: Record<string, string[]>;
    sign_in_provider?: string;
    tenant?: string;
  };
  readonly [key: string]: unknown;
}

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
  | 'MISSING_BEARER_TOKEN'
  | 'AMBIGUOUS_AUTH_HEADER'
  | 'MALFORMED_BEARER_TOKEN'
  | 'INVALID_JWT_LENGTH'
  | 'MALFORMED_JWT'
  | 'UNSUPPORTED_SIGNING_ALGORITHM'
  | 'MISSING_KEY_IDENTIFIER'
  | 'UNKNOWN_KEY_IDENTIFIER'
  | 'INVALID_SIGNATURE'
  | 'TOKEN_PROJECT_MISMATCH'
  | 'TOKEN_ISSUER_MISMATCH'
  | 'MISSING_SUBJECT_UID'
  | 'EXPIRED_FIREBASE_TOKEN'
  | 'FUTURE_ISSUED_AT'
  | 'FUTURE_AUTH_TIME'
  | 'EMAIL_NOT_VERIFIED'
  | 'MISSING_EMAIL_CLAIM'
  | 'DISABLED_USER_IDENTITY'
  | 'REVOKED_FIREBASE_TOKEN'
  | 'INVALID_ADMIN_SECRET'
  | 'STATIC_ADMIN_TOKEN_FORBIDDEN_FOR_OPERATION'
  | 'RECENT_AUTHENTICATION_REQUIRED'
  | 'NOT_ADMIN_USER'
  | 'INSUFFICIENT_ROLE'
  | 'RESOURCE_OWNER_MISMATCH'
  | 'JWKS_FETCH_FAILED'
  | 'AUTH_PROVIDER_UNAVAILABLE';

export interface TokenVerificationResult {
  readonly valid: boolean;
  readonly claims?: FirebaseIdTokenClaims;
  readonly code?: AuthFailureCode;
  readonly status: 200 | 400 | 401 | 403 | 503;
  readonly reason: string;
}

export interface JwkRsaKey {
  readonly kty: string;
  readonly use?: string;
  readonly alg?: string;
  readonly kid: string;
  readonly n: string;
  readonly e: string;
}

export interface GoogleJwksResponse {
  readonly keys: readonly JwkRsaKey[];
}

export type AppCheckMode = 'disabled' | 'monitor' | 'enforced';

export interface WorkerAppCheckContext {
  readonly allowed: boolean;
  readonly mode: AppCheckMode;
  readonly appId?: string;
  readonly statusCode: 200 | 401 | 403;
  readonly reason: string;
}

export interface AuthorizationPolicyRequirement {
  readonly policy: ApiAccessPolicy;
  readonly resourceOwnerUid?: string;
  readonly allowServerSecretToken?: boolean;
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

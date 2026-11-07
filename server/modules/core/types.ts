import type { Request, Response } from 'express';

export type PrincipalRole =
  | 'guest'
  | 'verified_user'
  | 'delegated_admin'
  | 'primary_admin'
  | 'server_secret_admin';

export type IdentityFailureCode =
  | 'MISSING_AUTH_HEADER'
  | 'AMBIGUOUS_AUTH_HEADER'
  | 'MALFORMED_BEARER_TOKEN'
  | 'EXPIRED_FIREBASE_TOKEN'
  | 'REVOKED_FIREBASE_TOKEN'
  | 'DISABLED_USER_IDENTITY'
  | 'PROJECT_AUDIENCE_MISMATCH'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_FIREBASE_TOKEN'
  | 'AUTH_PROVIDER_UNAVAILABLE';

export interface AuthenticatedPrincipal {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: PrincipalRole;
  authMode: 'firebase_id_token' | 'server_secret_token';
  authTimeSeconds?: number;
  issuedAtSeconds?: number;
  expiresAtSeconds?: number;
  tenantId?: string;
  claims: Record<string, unknown>;
}

export interface IdentityExtractionResult {
  ok: boolean;
  principal?: AuthenticatedPrincipal;
  failureCode?: IdentityFailureCode;
  status?: number;
  reason?: string;
}

export interface DecodedFirebaseIdTokenLike {
  uid: string;
  email?: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  auth_time?: number;
  iat?: number;
  exp?: number;
  firebase?: {
    tenant?: string;
    sign_in_provider?: string;
  };
  [key: string]: unknown;
}

export interface FirebaseTokenVerifierAdapter {
  expectedProjectId?: string;
  verifyIdToken: (idToken: string, checkRevoked?: boolean) => Promise<DecodedFirebaseIdTokenLike>;
  isUserDisabled?: (uid: string) => Promise<boolean>;
}

export interface DelegatedAdminRecord {
  uid: string;
  email?: string;
  role?: 'admin' | 'delegated_admin' | 'revoked';
  active?: boolean;
  disabled?: boolean;
  expiresAtIso?: string;
}

export interface DelegatedAdminStoreAdapter {
  getDelegatedAdminByUid: (uid: string) => Promise<DelegatedAdminRecord | null>;
}

export interface AdminAuthorizationPolicy {
  requirePrimaryBootstrapAdmin?: boolean;
  disallowStaticToken?: boolean;
  maxAuthAgeSeconds?: number;
  primaryAdminEmails?: string[];
  allowStaticAdminSecretHash?: string;
  nowSeconds?: number;
}

export interface PermissionPolicy {
  minimumRole: 'verified_user' | 'delegated_admin' | 'primary_admin';
  resourceOwnerUid?: string;
  allowAdminOverrideForOwnership?: boolean;
  disallowStaticToken?: boolean;
  maxAuthAgeSeconds?: number;
}

export interface AuthorizationDecision {
  allowed: boolean;
  status: number;
  effectiveRole: PrincipalRole;
  reason?: string;
  failureCode?:
    | IdentityFailureCode
    | 'INSUFFICIENT_ROLE'
    | 'RESOURCE_OWNERSHIP_MISMATCH'
    | 'STATIC_TOKEN_DISALLOWED'
    | 'RECENT_REAUTH_REQUIRED'
    | 'DELEGATED_ADMIN_REVOKED'
    | 'AUTHZ_STORE_FAILURE';
}

export interface ValidationIssue {
  field: string;
  code:
    | 'REQUIRED_FIELD_MISSING'
    | 'UNKNOWN_FIELD_REJECTED'
    | 'UNTRUSTED_IDENTITY_FIELD'
    | 'INVALID_TYPE'
    | 'STRING_TOO_SHORT'
    | 'STRING_TOO_LONG'
    | 'INVALID_FORMAT'
    | 'NUMBER_OUT_OF_RANGE'
    | 'INVALID_ENUM_VALUE';
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export type FieldValidator<T> = (rawValue: unknown, fieldName: string) => ValidationResult<T>;

export type CanonicalApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'RATE_LIMITED'
  | 'TRANSACTION_ABORTED'
  | 'PERSISTENCE_FAILED'
  | 'INTERNAL_ERROR';

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: CanonicalApiErrorCode;
    message: string;
    correlationId: string;
    timestampIso: string;
    details?: ValidationIssue[] | Record<string, unknown>;
  };
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
  meta: {
    correlationId: string;
    timestampIso: string;
    idempotentReplay?: boolean;
  };
}

export interface PaginatedApiEnvelope<T> {
  ok: true;
  data: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    totalCount?: number;
  };
  meta: {
    correlationId: string;
    timestampIso: string;
  };
}

export interface NormalizedTimestamp {
  iso: string;
  epochMs: number;
  seconds: number;
  nanoseconds: number;
}

export interface PaginationCursorPayload {
  sortValue: string | number;
  docId: string;
  direction: 'asc' | 'desc';
}

export interface PaginationParams {
  limit: number;
  cursor: string | null;
  direction: 'asc' | 'desc';
}

export type IdempotencyStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface IdempotencyRecord<T = unknown> {
  key: string;
  actorUid: string;
  operation: string;
  payloadHash: string;
  status: IdempotencyStatus;
  statusCode?: number;
  responseBody?: T;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtEpochMs: number;
}

export interface IdempotencyAcquireResult<T = unknown> {
  state: 'ACQUIRED' | 'REPLAY_COMPLETED' | 'CONFLICT_IN_PROGRESS' | 'CONFLICT_PAYLOAD_MISMATCH';
  record: IdempotencyRecord<T>;
}

export interface IdempotencyStoreAdapter {
  acquireLock: <T = unknown>(params: {
    scopedKey: string;
    actorUid: string;
    operation: string;
    payloadHash: string;
    nowEpochMs: number;
    ttlMs: number;
  }) => Promise<IdempotencyAcquireResult<T>>;
  markCompleted: <T = unknown>(params: {
    scopedKey: string;
    statusCode: number;
    responseBody: T;
    nowEpochMs: number;
  }) => Promise<void>;
  releaseOnFailure: (params: { scopedKey: string; nowEpochMs: number }) => Promise<void>;
}

export interface TransactionContextLike {
  get: <T = Record<string, unknown>>(docPath: string) => Promise<{ exists: boolean; data?: T }>;
  set: (docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
  update: (docPath: string, data: Record<string, unknown>) => void;
  delete: (docPath: string) => void;
}

export interface TransactionRunnerAdapter {
  runTransaction: <T>(updateFn: (tx: TransactionContextLike) => Promise<T>) => Promise<T>;
}

export interface TransactionExecutionOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  operationName: string;
}

export interface StructuredAuditEvent {
  eventId: string;
  timestampIso: string;
  correlationId: string;
  actorUid: string;
  actorEmailRedacted: string;
  actorRole: PrincipalRole;
  action: string;
  targetCollection: string;
  targetResourceId: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reasonCode?: string;
  metadata: Record<string, unknown>;
}

export interface AuditEventSink {
  writeAuditEvent: (event: StructuredAuditEvent) => Promise<void>;
}

export type ExpressHandlerLike = (req: Request, res: Response) => Promise<void>;

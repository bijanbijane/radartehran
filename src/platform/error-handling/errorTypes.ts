/** @file src/platform/error-handling/errorTypes.ts — 3-Level Frontend Error Hierarchy (Application, Feature, Request) */
export type ErrorBoundaryLevel = 'application' | 'feature' | 'request';

export type FrontendErrorCategory =
  | 'NETWORK_OFFLINE'
  | 'REQUEST_TIMEOUT'
  | 'UNAUTHORIZED_401'
  | 'FORBIDDEN_403'
  | 'NOT_FOUND_404'
  | 'RESOURCE_LOCKED_423'
  | 'RATE_LIMITED_429'
  | 'SERVER_ERROR_5XX'
  | 'FEATURE_DISABLED'
  | 'VALIDATION_ERROR'
  | 'STORAGE_QUOTA'
  | 'CHUNK_LOAD_ERROR'
  | 'UNKNOWN_ERROR';

export interface NormalizedFrontendError {
  readonly code: string;
  readonly category: FrontendErrorCategory;
  readonly level: ErrorBoundaryLevel;
  readonly status?: number;
  readonly userMessageFa: string;
  readonly technicalMessage: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly correlationId: string;
  readonly timestampIso: string;
  readonly lockReasonFa?: string;
}

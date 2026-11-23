/**
 * Internal Write Admission RPC contract (Express → API Worker, D-H2-01).
 */

export const INTERNAL_WRITE_ADMISSION_RPC_PATH = '/api/internal/v1/lifecycle/write-admission';

export const WRITE_ADMISSION_RPC_SECRET_ENV = 'LIFECYCLE_WRITE_ADMISSION_RPC_SECRET';

export const WRITE_ADMISSION_WORKER_BASE_URL_ENV = 'LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL';

export const WRITE_ADMISSION_RPC_TIMESTAMP_HEADER = 'X-Lifecycle-RPC-Timestamp';

export const WRITE_ADMISSION_RPC_NONCE_HEADER = 'X-Lifecycle-RPC-Nonce';

export const WRITE_ADMISSION_RPC_SIGNATURE_HEADER = 'X-Lifecycle-RPC-Signature';

/** Accepted clock skew for RPC timestamps (seconds). */
export const WRITE_ADMISSION_RPC_MAX_SKEW_SECONDS = 60;

export interface WriteAdmissionRpcRequestBody {
  readonly targetUid: string;
  /** Omitted or "check" preserves the original read-only RPC contract. */
  readonly action?: 'check' | 'acquire' | 'release';
  readonly operationName?: string;
  readonly permitId?: string;
}
export interface WriteAdmissionRpcAcquireSuccessBody {
  readonly status: 'ok';
  readonly action: 'acquired';
  readonly decision: import('./writeAdmissionAuthority.ts').WriteAdmissionDecision;
  readonly permitId: string;
  readonly expiresAtMs: number;
}

export interface WriteAdmissionRpcReleaseSuccessBody {
  readonly status: 'ok';
  readonly action: 'released';
}


export interface WriteAdmissionRpcSuccessBody {
  readonly status: 'ok';
  readonly decision: import('./writeAdmissionAuthority.ts').WriteAdmissionDecision;
}

export interface WriteAdmissionRpcErrorBody {
  readonly status: 'error';
  readonly code: string;
}
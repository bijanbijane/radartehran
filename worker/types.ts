/**
 * @file worker/types.ts
 * @description Explicit TypeScript contracts for the Tehran Radar Cloudflare Worker runtime,
 * environment bindings, request context, observability records, and the Phase 2 Migration Register.
 */
import type { ApiAccessPolicy, ApiRouteMethod } from '../src/utils/expressRouteCatalog';
import type { IrniGeographicRpcBindingV2 } from './irni/irniGeographicRpcV2Types';

export interface WorkerAssetFetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export type DeploymentEnvironmentName = 'development' | 'preview' | 'staging' | 'production';
export type WorkerEnvironmentName = DeploymentEnvironmentName;

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<{
    results?: T[];
    success: boolean;
    meta?: { duration?: number; changes?: number };
  }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  raw?<T = unknown[]>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(
    statements: D1PreparedStatement[]
  ): Promise<Array<{ results?: T[]; success: boolean; meta?: { duration?: number; changes?: number } }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump?(): Promise<ArrayBuffer>;
}

export interface KVNamespace {
  get(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }
  ): Promise<any>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentDisposition?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
  sha256?: string | ArrayBuffer;
}

export interface R2ObjectMetadata {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: R2PutOptions['httpMetadata'];
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface R2Bucket {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: R2PutOptions
  ): Promise<R2ObjectMetadata | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } }
  ): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2ObjectMetadata | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ objects: R2ObjectMetadata[]; truncated: boolean; cursor?: string }>;
}

export interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  retry(options?: { delaySeconds?: number }): void;
  ack(): void;
}

export interface MessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: readonly QueueMessage<T>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}

export interface Queue<T = unknown> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch?(messages: Iterable<{ body: T; delaySeconds?: number }>): Promise<void>;
}

export interface DependencyCompatibilityEntry {
  readonly packageName: string;
  readonly currentUsage?: string;
  readonly rationale?: string;
  readonly officialStatus: 'WORKS_NATIVELY' | 'REQUIRES_POLYFILL_OR_ADAPTER' | 'NOT_SUPPORTED';
  readonly edgeReplacement: string;
}

/**
 * Explicit Cloudflare Worker environment bindings.
 * Avoids `any`-based access, undeclared bindings, or hardcoded secrets.
 */
export interface WorkerEnv {
  readonly ASSETS?: WorkerAssetFetcher;
  readonly ENVIRONMENT?: DeploymentEnvironmentName;
  readonly APP_ENV?: DeploymentEnvironmentName;
  readonly WORKER_ENV?: DeploymentEnvironmentName;
  readonly APP_URL?: string;
  readonly DB_WRITES_PAUSED_UNTIL_UTC?: string;
  readonly GOOGLE_OAUTH_CLIENT_ID?: string;
  readonly GOOGLE_OAUTH_CLIENT_SECRET?: string;
  readonly GOOGLE_OAUTH_REDIRECT_URI?: string;
  readonly KAVENEGAR_API_KEY?: string;
  readonly KAVENEGAR_VERIFY_TEMPLATE?: string;
  readonly AUTH_PII_HMAC_SECRET?: string;
  /** Shared HMAC secret for short-lived Worker -> Express session assertions. */
  readonly AUTH_INTERNAL_HMAC_SECRET?: string;
  readonly MARKET_PII_ENCRYPTION_KEY?: string;
  readonly MARKET_PII_HASH_SECRET?: string;
  readonly FIREBASE_PROJECT_ID?: string;
  readonly FIREBASE_PROJECT_NUMBER?: string;
  readonly FIREBASE_APP_CHECK_MODE?: 'disabled' | 'monitor' | 'enforced';
  readonly FIREBASE_APP_CHECK_APP_ID?: string;
  readonly FIREBASE_APP_CHECK_DEBUG_ALLOWLIST?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_API_SECRET?: string;
  readonly VALUATION_SEAL_SECRET?: string;
  readonly R2_MEDIA_BUCKET_NAME?: string;
  readonly R2_SIGNING_SECRET?: string;
  readonly OBJECT_STORAGE_SIGNING_SECRET?: string;
  readonly OBJECT_STORAGE_MAX_IMAGE_MB?: string;
  readonly OBJECT_STORAGE_MAX_VIDEO_MB?: string;
  readonly STRANGLER_FALLBACK_ENABLED?: string;
  readonly STRANGLER_ORIGIN_URL?: string;
  readonly MEDIA_BUCKET?: R2Bucket;
  /** Canonical User Database binding (`radar-user-db`). Preferred over legacy alias `DB`. */
  readonly USER_DB?: D1Database;
  /** Legacy compatibility alias for `USER_DB` (`radar-user-db`). Scheduled for phased retirement. */
  readonly DB?: D1Database;
  /** Physically isolated Behavioral Research Database binding (`radar-researcher-db`). */
  readonly RESEARCH_DB?: D1Database;
  readonly NEIGHBORHOOD_DB?: D1Database;
  // ABSOLUTE ARCHITECTURAL INVARIANT: No direct D1 binding for IRNI `radar-neighborhood-db`.
  readonly RESEARCH_HMAC_SECRET?: string;
  readonly RESEARCH_HMAC_KEY_VERSION?: string;
  readonly RESEARCH_HMAC_PREVIOUS_SECRETS?: string;
  readonly RESEARCH_K_ANONYMITY_MIN_COHORT?: string;
  readonly INTERNAL_LIFECYCLE_RPC_SECRET?: string;
  /** Dedicated HMAC key for lifecycle receipts; must differ from all other application secrets. */
  readonly LIFECYCLE_RECEIPT_HMAC_SECRET?: string;
  /** Dedicated key for keyed lifecycle compliance receipt digests; never reuse other HMAC secrets. */
  readonly LIFECYCLE_RECEIPT_HMAC_SECRET?: string;
  /** Internal read-only Service Binding to IRNI's canonical geography WorkerEntrypoint v2. */
  readonly IRNI_GEOGRAPHY?: IrniGeographicRpcBindingV2;
  readonly IRNI_PUBLISH_HMAC_SECRET?: string;
  readonly GEO_REGISTRY_EXPECTED_CONTRACT?: string;
  readonly GEO_REGISTRY_EXPECTED_ID_ALGORITHM?: string;
  readonly RADAR_QUEUE?: Queue;
  readonly RADAR_DLQ?: Queue;
  readonly MEDIA_QUEUE?: Queue;
  readonly DATA_SYNC_QUEUE?: Queue;
  readonly TELEMETRY_QUEUE?: Queue;
  readonly RADAR_KV?: KVNamespace;
  readonly EDGE_RATE_LIMITER?: RateLimitBinding;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface WorkerRequestContext {
  readonly request: Request;
  readonly env: WorkerEnv;
  readonly url: URL;
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: string;
  readonly pathname: string;
  readonly clientIp: string;
  readonly trustedEdgeIp: boolean;
  readonly environment: DeploymentEnvironmentName;
  readonly startedAtMs: number;
  routeId: string;
  implementationId: string;
  auth?: import('./auth/types').WorkerAuthContext;
  appCheck?: import('./auth/types').WorkerAppCheckContext;
}

export interface WorkerObservabilityRecord {
  readonly requestId: string;
  readonly correlationId: string;
  readonly routeId: string;
  readonly method: string;
  readonly pathname: string;
  readonly status: number;
  readonly durationMs: number;
  readonly migrationStatus?: string;
  readonly errorClassification?: string;
  readonly implementationId: string;
  readonly timestampIso: string;
}

export type RouteMigrationStatus =
  | 'NOT_STARTED'
  | 'DISCOVERED'
  | 'BLOCKED'
  | 'IMPLEMENTED'
  | 'TESTING'
  | 'VERIFIED'
  | 'READY_FOR_STAGING'
  | 'ROLLED_BACK';

export type RouteMigrationGroup =
  | 'GROUP_1A_HEALTH_AND_SEO_METADATA'
  | 'GROUP_1B_STATELESS_INTELLIGENCE_AND_COMMERCE'
  | 'GROUP_2_PUBLIC_MARKET_AND_GEO_READS'
  | 'GROUP_3_TELEMETRY_AND_EDGE_INGESTION'
  | 'GROUP_3A_CLOUDFLARE_NATIVE_AUTH'
  | 'GROUP_4_AUTHENTICATED_USER_WORKFLOWS'
  | 'GROUP_5_OBJECT_STORAGE_AND_MEDIA'
  | 'GROUP_6_ADMIN_GOVERNANCE_AND_SYNC';

export interface RouteMigrationControlEntry {
  readonly routeId: string;
  readonly method: ApiRouteMethod;
  readonly path: string;
  readonly mountClassification: 'ACTIVE_MOUNTED' | 'COMPATIBILITY_ALIAS' | 'UNMOUNTED_DOMAIN_MODULE';
  readonly aliasOfPath?: string;
  readonly expressSourceModule: string;
  readonly workerHandlerModule: string | null;
  readonly migrationGroup: RouteMigrationGroup;
  readonly status: RouteMigrationStatus;
  readonly activeRuntime: 'cloudflare_worker' | 'legacy_express_server';
  readonly authRequirement: ApiAccessPolicy;
  readonly rateLimitBucket: string;
  readonly rateLimitPerMinute: number;
  readonly usedByFrontend: boolean;
  readonly dependencies: readonly string[];
  readonly stateStorageTouchpoints: readonly string[];
  readonly externalApiTouchpoints: readonly string[];
  readonly rollbackStrategy: string;
  readonly blockerReason?: string;
}

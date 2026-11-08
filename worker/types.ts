/**
 * @file worker/types.ts
 * @description Explicit TypeScript contracts for the Tehran Radar Cloudflare Worker runtime,
 * environment bindings, request context, observability records, and the Phase 2 Migration Register.
 */
import type { ApiAccessPolicy, ApiRouteMethod } from '../src/utils/expressRouteCatalog';

export interface WorkerAssetFetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export type DeploymentEnvironmentName = 'development' | 'preview' | 'staging' | 'production';

/**
 * Explicit Cloudflare Worker environment bindings.
 * Avoids `any`-based access, undeclared bindings, or hardcoded secrets.
 */
export interface WorkerEnv {
  readonly ASSETS?: WorkerAssetFetcher;
  readonly ENVIRONMENT?: DeploymentEnvironmentName;
  readonly APP_ENV?: DeploymentEnvironmentName;
  readonly APP_URL?: string;
  readonly FIREBASE_PROJECT_ID?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_API_SECRET?: string;
  readonly VALUATION_SEAL_SECRET?: string;
  readonly MEDIA_BUCKET?: import('./storage/types').R2BucketBinding;
  readonly DB?: import('./db/types').D1DatabaseBinding;
  readonly MEDIA_QUEUE?: import('./queues/types').QueueBinding;
  readonly DATA_SYNC_QUEUE?: import('./queues/types').QueueBinding;
  readonly TELEMETRY_QUEUE?: import('./queues/types').QueueBinding;
  readonly RADAR_KV?: import('./cache/types').KVNamespaceBinding;
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

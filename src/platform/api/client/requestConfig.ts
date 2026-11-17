/** @file src/platform/api/client/requestConfig.ts — API Client Numeric Thresholds & Request Configuration */
export const DEFAULT_API_TIMEOUT_MS = 15_000;
export const HEAVY_API_TIMEOUT_MS = 30_000;
export const MAX_GET_RETRIES = 2;
export const MAX_MUTATION_RETRIES_WITHOUT_IDEMPOTENCY = 0;
export const MAX_API_ERROR_MESSAGE_BYTES = 2048;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PlatformApiRequestConfig<TBody = unknown> {
  readonly path?: string;
  readonly url?: string;
  readonly method?: HttpMethod;
  readonly body?: TBody;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly heavyOperation?: boolean;
  readonly heavy?: boolean;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
  readonly maxRetries?: number;
  readonly accountIdAtDispatch?: string | null;
  readonly workspaceIdAtDispatch?: string | null;
}

export interface ResolvedRequestPolicy {
  readonly method: HttpMethod;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly idempotencyKey?: string;
}

export function resolveRequestTimeoutMs(config: PlatformApiRequestConfig): number {
  if (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) {
    return Math.min(60_000, Math.max(500, config.timeoutMs));
  }
  return config.heavyOperation || config.heavy ? HEAVY_API_TIMEOUT_MS : DEFAULT_API_TIMEOUT_MS;
}

export function resolveAllowedRetries(config: PlatformApiRequestConfig): number {
  const method = (config.method ?? 'GET').toUpperCase() as HttpMethod;
  if (method === 'GET') {
    return typeof config.maxRetries === 'number'
      ? Math.max(0, Math.min(MAX_GET_RETRIES, config.maxRetries))
      : MAX_GET_RETRIES;
  }
  if (config.idempotencyKey && config.idempotencyKey.trim().length > 0) {
    return typeof config.maxRetries === 'number'
      ? Math.max(0, Math.min(MAX_GET_RETRIES, config.maxRetries))
      : MAX_GET_RETRIES;
  }
  return MAX_MUTATION_RETRIES_WITHOUT_IDEMPOTENCY;
}

export function resolveRequestPolicy(config: PlatformApiRequestConfig): ResolvedRequestPolicy {
  const method = (config.method ?? 'GET').toUpperCase() as HttpMethod;
  return {
    method,
    timeoutMs: resolveRequestTimeoutMs(config),
    maxRetries: resolveAllowedRetries(config),
    idempotencyKey: config.idempotencyKey,
  };
}

export function shouldRetryRequest(
  policy: ResolvedRequestPolicy,
  attemptIndex: number,
  statusCode?: number,
  aborted = false
): boolean {
  if (aborted) return false;
  if (attemptIndex >= policy.maxRetries) return false;
  if (policy.method !== 'GET' && !policy.idempotencyKey) return false;
  if (!statusCode) return true;
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

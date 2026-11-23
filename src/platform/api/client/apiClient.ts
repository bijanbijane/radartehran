/** @file src/platform/api/client/apiClient.ts — Central Platform HTTP Client (Timeout, Retry, Single-Flight 401 Recovery & Context Isolation) */
import { RadarPlatformApiError } from './apiError';
import {
  resolveAllowedRetries,
  resolveRequestTimeoutMs,
  type PlatformApiRequestConfig,
} from './requestConfig';
import { parsePlatformHttpResponse } from './responseParser';
import {
  attachAuthAndCorrelationHeaders,
  getRegisteredApiAuthTokenSupplier,
} from '../interceptors/authInterceptor';
import { interceptFailedApiResponse } from '../interceptors/errorInterceptor';
import { resolveApiUrl } from '../../../utils/apiBaseUrl';

export type FetchExecutor = typeof fetch;

let customFetchExecutor: FetchExecutor | null = null;

export function setPlatformFetchExecutorForTests(fn: FetchExecutor | null): void {
  customFetchExecutor = fn;
}

export async function executePlatformApiRequest<TResponse = unknown, TBody = unknown>(
  config: PlatformApiRequestConfig<TBody>,
): Promise<TResponse> {
  const supplier = getRegisteredApiAuthTokenSupplier();
  const originUserId =
    config.accountIdAtDispatch !== undefined ? config.accountIdAtDispatch : supplier.getCurrentUserId();
  const originWorkspaceId =
    config.workspaceIdAtDispatch !== undefined ? config.workspaceIdAtDispatch : supplier.getCurrentWorkspaceId();

  const maxRetries = resolveAllowedRetries(config);
  const timeoutMs = resolveRequestTimeoutMs(config);
  const method = (config.method ?? 'GET').toUpperCase();
  const fetchFn: FetchExecutor = customFetchExecutor ?? fetch;

  let attempt = 0;
  let refreshed401Once = false;

  while (true) {
    // Context Guard: never execute or retry a request if user or workspace switched mid-flight
    const currentUserId = supplier.getCurrentUserId();
    const currentWorkspaceId = supplier.getCurrentWorkspaceId();
    if (originUserId !== null && currentUserId !== originUserId) {
      throw RadarPlatformApiError.fromResponseOrError({
        error: 'ACCOUNT_CONTEXT_CHANGED_ABORTED',
        status: 401,
        correlationId: config.correlationId,
      });
    }
    if (originWorkspaceId !== null && currentWorkspaceId !== null && currentWorkspaceId !== originWorkspaceId) {
      throw RadarPlatformApiError.fromResponseOrError({
        error: 'WORKSPACE_CONTEXT_CHANGED_ABORTED',
        status: 409,
        correlationId: config.correlationId,
      });
    }

    const { headers, correlationId } = await attachAuthAndCorrelationHeaders(
      config.headers,
      config.correlationId,
      config.idempotencyKey,
    );

    if (config.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    config.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const requestUrl = resolveApiUrl(config.path);
    try {
      const response = await fetchFn(requestUrl, {
        method,
        headers,
        body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      config.signal?.removeEventListener('abort', onExternalAbort);

      const parsed = await parsePlatformHttpResponse<TResponse>(response);
      if (parsed.ok) {
        // Post-response Context Guard: reject stale response if account or workspace switched while awaiting network
        if (originUserId !== null && supplier.getCurrentUserId() !== originUserId) {
          throw RadarPlatformApiError.fromResponseOrError({
            error: 'STALE_ACCOUNT_RESPONSE_REJECTED',
            status: 401,
            correlationId,
          });
        }
        if (
          originWorkspaceId !== null &&
          supplier.getCurrentWorkspaceId() !== null &&
          supplier.getCurrentWorkspaceId() !== originWorkspaceId
        ) {
          throw RadarPlatformApiError.fromResponseOrError({
            error: 'STALE_WORKSPACE_RESPONSE_REJECTED',
            status: 409,
            correlationId,
          });
        }
        return parsed.data as TResponse;
      }

      // 401 Single-Flight Token Refresh & Eligible Retry
      if (parsed.status === 401 && !refreshed401Once) {
        refreshed401Once = true;
        const canRetryAfterRefresh = method === 'GET' || Boolean(config.idempotencyKey);
        const newToken = await supplier.refreshTokenSingleFlight();
        if (newToken && canRetryAfterRefresh && supplier.getCurrentUserId() === originUserId) {
          continue;
        }
      }

      // 403 / 423 / 404 / Feature Disabled must NEVER trigger token refresh or retry
      const apiError = interceptFailedApiResponse(parsed, correlationId);
      if (apiError.normalized.retryable && attempt < maxRetries && parsed.status !== 401) {
        attempt += 1;
        continue;
      }
      throw apiError;
    } catch (err) {
      clearTimeout(timeoutId);
      config.signal?.removeEventListener('abort', onExternalAbort);

      if (err instanceof RadarPlatformApiError) {
        throw err;
      }

      const isAborted = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      const wrapped = RadarPlatformApiError.fromResponseOrError({
        error: isAborted ? 'REQUEST_TIMEOUT' : err,
        correlationId,
      });
      if (wrapped.normalized.retryable && attempt < maxRetries && !config.signal?.aborted) {
        attempt += 1;
        continue;
      }
      throw wrapped;
    }
  }
}

/**
 * @file src/platform/search/orchestration/SearchRequestManager.ts
 * @description Deduplicates identical in-flight requests (max 1 concurrent), enforces 15s timeout, max 1 GET retry, 0 mutation retry without idempotency.
 */

import { buildSearchCacheKey } from '../cache/SearchCacheKey';
import type { UnifiedSearchExecutionResponse } from '../core/SearchResult';
import type { SearchRequest } from '../core/SearchTypes';

export const SEARCH_REQUEST_TIMEOUT_MS = 15_000;
export const SEARCH_TEXT_DEBOUNCE_MS = 300;
export const SEARCH_NUMERIC_FILTER_DEBOUNCE_MS = 400;
export const SEARCH_MAX_GET_RETRIES = 1;

export type SearchTransportExecutor = (
  request: SearchRequest,
  signal: AbortSignal
) => Promise<UnifiedSearchExecutionResponse>;

export class SearchRequestManager {
  private readonly inFlightPromises = new Map<string, Promise<UnifiedSearchExecutionResponse>>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = SEARCH_REQUEST_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  async executeReadSearch(
    request: SearchRequest,
    executor: SearchTransportExecutor,
    externalSignal?: AbortSignal
  ): Promise<UnifiedSearchExecutionResponse> {
    const dedupeKey = buildSearchCacheKey(request);
    const existing = this.inFlightPromises.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const promise = this.runWithTimeoutAndSingleRetry(request, executor, externalSignal).finally(() => {
      this.inFlightPromises.delete(dedupeKey);
    });

    this.inFlightPromises.set(dedupeKey, promise);
    return promise;
  }

  async executeMutation<T>(
    operation: () => Promise<T>,
    options?: { idempotencyKey?: string; allowRetry?: boolean }
  ): Promise<T> {
    // Stage 5 Section 6.2: Mutation retry without idempotency key is strictly 0
    const maxRetries = options?.idempotencyKey && options?.allowRetry ? 1 : 0;
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        attempt++;
      }
    }
  }

  getInFlightCount(): number {
    return this.inFlightPromises.size;
  }

  private async runWithTimeoutAndSingleRetry(
    request: SearchRequest,
    executor: SearchTransportExecutor,
    externalSignal?: AbortSignal
  ): Promise<UnifiedSearchExecutionResponse> {
    let attempt = 0;
    while (true) {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => {
        timeoutController.abort('SEARCH_TIMEOUT_15S');
      }, this.timeoutMs);

      const onExternalAbort = () => timeoutController.abort(externalSignal?.reason || 'EXTERNAL_ABORT');
      if (externalSignal) {
        if (externalSignal.aborted) {
          clearTimeout(timer);
          throw new Error('SEARCH_ABORTED');
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      try {
        const result = await executor(request, timeoutController.signal);
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        return result;
      } catch (err) {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        if (externalSignal?.aborted) {
          throw new Error('SEARCH_ABORTED');
        }
        if (attempt >= SEARCH_MAX_GET_RETRIES) {
          throw err;
        }
        attempt++;
      }
    }
  }
}

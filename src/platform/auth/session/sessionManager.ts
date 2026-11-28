import { getAuthClient } from '../core/authClient';
import { TokenRecord } from './tokenLifecycle';
import { handleSessionExpiry } from './sessionExpiry';

export const SESSION_LIMITS = {
  maxConcurrentRefresh: 1,
  maxQueuedRequests: 50,
  refreshTimeoutMs: 15_000,
  maxGetRetryAfterRefresh: 1,
  autoRetryPostWithoutIdempotency: 0,
} as const;

export interface QueuedSessionRequest<T = unknown> {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  idempotencyKey?: string;
  retryCount: number;
  execute: (freshToken: string) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class SessionManager {
  private currentToken: TokenRecord | null = null;
  private activeRefreshPromise: Promise<TokenRecord> | null = null;
  private activeRefreshCount = 0;
  private requestQueue: QueuedSessionRequest<any>[] = [];
  private isLoggedOut = false;

  setToken(token: TokenRecord | null): void {
    this.currentToken = token;
    this.isLoggedOut = token === null;
  }

  getToken(): TokenRecord | null {
    return this.currentToken;
  }

  getActiveRefreshCount(): number {
    return this.activeRefreshCount;
  }

  getQueueLength(): number {
    return this.requestQueue.length;
  }

  async refreshSingleFlight(refreshFn: () => Promise<TokenRecord>): Promise<TokenRecord> {
    if (this.isLoggedOut) {
      throw new Error('SESSION_LOGGED_OUT');
    }

    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    const client = getAuthClient();
    client.transition('TOKEN_REFRESHING');
    this.activeRefreshCount += 1;

    this.activeRefreshPromise = new Promise<TokenRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('AUTH_REFRESH_TIMEOUT'));
      }, SESSION_LIMITS.refreshTimeoutMs);

      refreshFn()
        .then((newToken) => {
          clearTimeout(timer);
          if (this.isLoggedOut) {
            reject(new Error('SESSION_LOGGED_OUT'));
            return;
          }
          this.currentToken = newToken;
          client.transition('READY');
          resolve(newToken);
        })
        .catch((err) => {
          clearTimeout(timer);
          if (!this.isLoggedOut) {
            handleSessionExpiry({
              reason: 'REFRESH_FAILED',
              routePath: typeof window !== 'undefined' ? window.location.pathname : '/',
            });
          }
          reject(err);
        });
    }).finally(() => {
      this.activeRefreshCount = Math.max(0, this.activeRefreshCount - 1);
      this.activeRefreshPromise = null;
    });

    try {
      const fresh = await this.activeRefreshPromise;
      await this.flushQueueWithToken(fresh.accessToken);
      return fresh;
    } catch (err) {
      this.rejectAllQueued(err);
      throw err;
    }
  }

  enqueueRequestDuringRefresh<T>(
    request: Omit<QueuedSessionRequest<T>, 'resolve' | 'reject' | 'retryCount'> & { retryCount?: number }
  ): Promise<T> {
    if (this.isLoggedOut) {
      return Promise.reject(new Error('SESSION_LOGGED_OUT_NO_RETRY'));
    }

    const retryCount = request.retryCount ?? 0;
    const isMutating = request.method !== 'GET';

    if (isMutating && !request.idempotencyKey) {
      return Promise.reject(new Error('NON_IDEMPOTENT_MUTATION_REQUIRES_CONFIRMATION'));
    }

    if (request.method === 'GET' && retryCount >= SESSION_LIMITS.maxGetRetryAfterRefresh) {
      return Promise.reject(new Error('MAX_GET_RETRY_AFTER_REFRESH_EXCEEDED'));
    }

    if (this.requestQueue.length >= SESSION_LIMITS.maxQueuedRequests) {
      return Promise.reject(new Error('AUTH_REFRESH_QUEUE_OVERFLOW'));
    }

    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({
        ...request,
        retryCount: retryCount + 1,
        resolve,
        reject,
      });
    });
  }

  logoutAndClearAll(): Promise<void> {
    this.isLoggedOut = true;
    this.currentToken = null;
    this.rejectAllQueued(new Error('SESSION_LOGGED_OUT_ABORTED'));
    return getAuthClient().logout('explicit_logout');
  }

  private async flushQueueWithToken(accessToken: string): Promise<void> {
    const batch = this.requestQueue.splice(0, this.requestQueue.length);
    for (const item of batch) {
      if (this.isLoggedOut) {
        item.reject(new Error('SESSION_LOGGED_OUT_ABORTED'));
        continue;
      }
      try {
        const result = await item.execute(accessToken);
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  private rejectAllQueued(reason: unknown): void {
    const batch = this.requestQueue.splice(0, this.requestQueue.length);
    for (const item of batch) {
      item.reject(reason);
    }
  }
}

let defaultSessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!defaultSessionManager) {
    defaultSessionManager = new SessionManager();
  }
  return defaultSessionManager;
}

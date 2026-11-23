/** @file src/platform/auth/core/authClient.ts — Cloudflare D1 Session Client */
import {
  type AuthLifecycleStatus,
  type UserIdentitySnapshot,
  canTransitionAuthState,
} from './authState';
import { publishAuthEvent } from './authEvents';

export interface AuthUserSnapshot {
  readonly uid: string;
  readonly email: string | null;
  readonly phoneNumber: string | null;
  readonly displayName: string | null;
  readonly emailVerified: boolean;
  readonly authProvider: 'google' | 'phone' | 'unknown';
  readonly customClaims?: Record<string, unknown>;
}

interface AuthSessionResponse {
  status?: string;
  authenticated?: boolean;
  user?: {
    uid?: string;
    email?: string | null;
    phoneNumber?: string | null;
    displayName?: string | null;
    emailVerified?: boolean;
    authProvider?: 'google' | 'phone' | 'unknown';
    isAdmin?: boolean;
  };
}

interface PhoneChallengeResponse {
  status?: string;
  code?: string;
  challengeId?: string;
  expiresInSeconds?: number;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { code?: string };
  if (!response.ok) {
    throw new Error(typeof payload.code === 'string' ? payload.code : `AUTH_HTTP_${response.status}`);
  }
  return payload;
}

export function mapCloudflareSessionToIdentity(user: AuthSessionResponse['user'] | null | undefined): UserIdentitySnapshot | null {
  if (!user?.uid) return null;
  const providers = user.authProvider === 'google' ? ['google.com'] : user.authProvider === 'phone' ? ['phone'] : [];
  return {
    userId: user.uid,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    phoneNumber: user.phoneNumber ?? null,
    providerIds: providers,
    isAnonymous: false,
  };
}

export class AuthClient {
  private state: AuthLifecycleStatus = 'INITIALIZING';
  private user: AuthUserSnapshot | null = null;
  private subscribers = new Set<(state: AuthLifecycleStatus, user: AuthUserSnapshot | null) => void>();

  getState(): AuthLifecycleStatus { return this.state; }
  getUser(): AuthUserSnapshot | null { return this.user; }

  private notify(): void {
    for (const subscriber of this.subscribers) subscriber(this.state, this.user);
  }

  setUser(user: AuthUserSnapshot | null): void {
    this.user = user;
    this.transition(user ? 'AUTHENTICATED' : 'UNAUTHENTICATED');
  }

  transition(next: AuthLifecycleStatus, meta?: Record<string, unknown>): boolean {
    if (!canTransitionAuthState(this.state, next) && next !== 'INITIALIZING' && next !== 'UNAUTHENTICATED') return false;
    this.state = next;
    this.notify();
    if (typeof meta?.reason === 'string') {
      publishAuthEvent({
        type: next === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'AUTH_BOOTSTRAP_COMPLETED',
        status: next,
        userId: this.user?.uid ?? null,
        timestampMs: Date.now(),
        reasonFa: meta.reason,
      });
    }
    return true;
  }

  async refreshSession(): Promise<AuthUserSnapshot | null> {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await parseApiResponse<AuthSessionResponse>(response);
      if (!payload.authenticated || !payload.user?.uid) {
        this.setUser(null);
        return null;
      }
      const nextUser: AuthUserSnapshot = {
        uid: payload.user.uid,
        email: payload.user.email ?? null,
        phoneNumber: payload.user.phoneNumber ?? null,
        displayName: payload.user.displayName ?? null,
        emailVerified: Boolean(payload.user.emailVerified),
        authProvider: payload.user.authProvider || 'unknown',
        customClaims: payload.user.isAdmin ? { isAdmin: true } : {},
      };
      this.user = nextUser;
      this.transition('AUTHENTICATED');
      this.transition('RESOLVING_ACCESS');
      this.transition('READY');
      return nextUser;
    } catch (error) {
      if (!this.user) this.transition('UNAUTHENTICATED', { reason: 'ارتباط با سرویس هویت برقرار نشد' });
      throw error;
    }
  }

  startGoogleLogin(returnTo = '/'): void {
    const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    window.location.assign(`/api/auth/google/start?returnTo=${encodeURIComponent(safeReturn)}`);
  }

  async requestPhoneCode(phone: string): Promise<{ challengeId: string; expiresInSeconds: number }> {
    const response = await fetch('/api/auth/phone/start', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const payload = await parseApiResponse<PhoneChallengeResponse>(response);
    if (!payload.challengeId) throw new Error(payload.code || 'PHONE_CHALLENGE_NOT_CREATED');
    return { challengeId: payload.challengeId, expiresInSeconds: Number(payload.expiresInSeconds || 0) };
  }

  async verifyPhoneCode(challengeId: string, code: string): Promise<AuthUserSnapshot | null> {
    const response = await fetch('/api/auth/phone/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    await parseApiResponse<{ status?: string }>(response);
    return this.refreshSession();
  }

  async logout(reason = 'manual_logout'): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
    } finally {
      this.user = null;
      this.state = 'UNAUTHENTICATED';
      this.notify();
      publishAuthEvent({
        type: 'USER_SIGNED_OUT',
        status: 'UNAUTHENTICATED',
        userId: null,
        timestampMs: Date.now(),
        reasonFa: reason,
      });
    }
  }

  emitEvent(eventName: string, payload?: Record<string, unknown>): void {
    publishAuthEvent({
      type: (eventName as any) || 'AUTH_BOOTSTRAP_COMPLETED',
      status: this.state,
      userId: this.user?.uid ?? null,
      timestampMs: Date.now(),
      reasonFa: payload ? JSON.stringify(payload) : undefined,
    });
  }

  subscribe(fn: (state: AuthLifecycleStatus, user: AuthUserSnapshot | null) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let singletonAuthClient: AuthClient | null = null;
export function getAuthClient(): AuthClient {
  if (!singletonAuthClient) singletonAuthClient = new AuthClient();
  return singletonAuthClient;
}

export async function getCurrentAuthSession(): Promise<AuthUserSnapshot | null> {
  return getAuthClient().refreshSession();
}

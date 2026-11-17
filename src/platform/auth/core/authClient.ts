/** @file src/platform/auth/core/authClient.ts — Adapter Over Existing Firebase Auth Singleton (No Second Auth System) */
import { auth, googleProvider } from '../../../firebase';
import type { User as FirebaseUser } from 'firebase/auth';
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
  readonly customClaims?: Record<string, unknown>;
}

export class AuthClient {
  private state: AuthLifecycleStatus = 'INITIALIZING';
  private user: AuthUserSnapshot | null = null;
  private subscribers = new Set<(state: AuthLifecycleStatus, user: AuthUserSnapshot | null) => void>();

  getState(): AuthLifecycleStatus {
    return this.state;
  }

  getUser(): AuthUserSnapshot | null {
    return this.user;
  }

  setUser(user: AuthUserSnapshot | null): void {
    this.user = user;
    this.transition(user ? 'AUTHENTICATED' : 'UNAUTHENTICATED');
  }

  transition(next: AuthLifecycleStatus, meta?: Record<string, unknown>): boolean {
    if (!canTransitionAuthState(this.state, next) && next !== 'INITIALIZING' && next !== 'UNAUTHENTICATED') {
      return false;
    }
    this.state = next;
    for (const sub of this.subscribers) {
      sub(this.state, this.user);
    }
    if (meta?.reason && typeof meta.reason === 'string') {
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

  emitEvent(eventName: string, payload?: Record<string, unknown>): void {
    publishAuthEvent({
      type: (eventName as any) || 'AUTH_BOOTSTRAP_COMPLETED',
      status: this.state,
      userId: this.user?.uid ?? null,
      timestampMs: Date.now(),
      reasonFa: payload ? JSON.stringify(payload) : undefined,
    });
  }

  logout(reason = 'manual_logout'): void {
    this.user = null;
    this.state = 'UNAUTHENTICATED';
    for (const sub of this.subscribers) {
      sub(this.state, null);
    }
    publishAuthEvent({
      type: 'USER_SIGNED_OUT',
      status: 'UNAUTHENTICATED',
      userId: null,
      timestampMs: Date.now(),
      reasonFa: reason,
    });
  }

  subscribe(fn: (state: AuthLifecycleStatus, user: AuthUserSnapshot | null) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let singletonAuthClient: AuthClient | null = null;

export function getAuthClient(): AuthClient {
  if (!singletonAuthClient) {
    singletonAuthClient = new AuthClient();
  }
  return singletonAuthClient;
}

export function mapFirebaseUserToIdentity(user: FirebaseUser | null | undefined): UserIdentitySnapshot | null {
  if (!user || !user.uid) return null;
  return {
    userId: user.uid,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    phoneNumber: user.phoneNumber ?? null,
    providerIds: Array.isArray(user.providerData)
      ? user.providerData.map((p) => p?.providerId).filter((id): id is string => Boolean(id))
      : [],
    isAnonymous: Boolean(user.isAnonymous),
  };
}

export function getFirebaseAuthInstance() {
  return auth;
}

export function getGoogleOAuthProvider() {
  return googleProvider;
}

export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || typeof currentUser.getIdToken !== 'function') return null;
  return currentUser.getIdToken(forceRefresh);
}

/** @file src/platform/auth/core/authEvents.ts — Cross-Tab & In-App Auth Event Bus */
import type { AuthLifecycleStatus, WorkspaceContext } from './authState';

export type AuthEventType =
  | 'AUTH_BOOTSTRAP_COMPLETED'
  | 'USER_SIGNED_IN'
  | 'USER_SIGNED_OUT'
  | 'TOKEN_REFRESH_STARTED'
  | 'TOKEN_REFRESH_SUCCEEDED'
  | 'TOKEN_REFRESH_FAILED'
  | 'SESSION_EXPIRED'
  | 'ROLE_OR_PERMISSION_CHANGED'
  | 'WORKSPACE_SWITCHED'
  | 'STEP_UP_REQUIRED'
  | 'STEP_UP_VERIFIED'
  | 'IMPERSONATION_STARTED'
  | 'IMPERSONATION_ENDED'
  | 'CROSS_TAB_LOGOUT_SYNC';

export interface AuthLifecycleEvent {
  readonly type: AuthEventType;
  readonly status: AuthLifecycleStatus;
  readonly userId: string | null;
  readonly workspace?: WorkspaceContext | null;
  readonly timestampMs: number;
  readonly reasonFa?: string;
}

type AuthEventListener = (event: AuthLifecycleEvent) => void;

const listeners = new Set<AuthEventListener>();
const eventHistory: AuthLifecycleEvent[] = [];
const MAX_HISTORY = 100;

export function subscribeAuthEvents(listener: AuthEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishAuthEvent(event: AuthLifecycleEvent): void {
  eventHistory.unshift(event);
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.pop();
  }
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Never allow a subscriber error to break auth transition
    }
  }
}

export function getAuthEventHistory(): readonly AuthLifecycleEvent[] {
  return [...eventHistory];
}

export function clearAuthEventHistoryForTests(): void {
  eventHistory.length = 0;
  listeners.clear();
}

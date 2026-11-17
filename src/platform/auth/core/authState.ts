/** @file src/platform/auth/core/authState.ts — Deterministic 9-State Auth & Access State Machine (RT-FE-REBUILD-AUTH-ACCESS-003 Section 3) */

export const CANONICAL_AUTH_STATES = [
  'INITIALIZING',
  'UNAUTHENTICATED',
  'AUTHENTICATED',
  'RESOLVING_ACCESS',
  'READY',
  'TOKEN_REFRESHING',
  'REAUTH_REQUIRED',
  'SESSION_EXPIRED',
  'ACCESS_DENIED',
] as const;

export type AuthLifecycleStatus = (typeof CANONICAL_AUTH_STATES)[number];
export type AuthLifecycleState = AuthLifecycleStatus;

export type WorkspaceType = 'personal' | 'agency' | 'service' | 'admin';

export interface UserIdentitySnapshot {
  readonly userId: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly phoneNumber: string | null;
  readonly providerIds: readonly string[];
  readonly isAnonymous: boolean;
}

export interface UserProfileSnapshot {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly preferredLocale: 'fa' | 'en';
  readonly organizationName?: string | null;
}

export interface WorkspaceContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceType: WorkspaceType;
  readonly activeRole: string;
  readonly permissionVersion: string;
}

export interface AuthMachineSnapshot {
  readonly status: AuthLifecycleStatus;
  readonly identity: UserIdentitySnapshot | null;
  readonly profile: UserProfileSnapshot | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly workspace: WorkspaceContext | null;
  readonly availableWorkspaces: readonly WorkspaceContext[];
  readonly tokenExpiresAtMs: number | null;
  readonly lastNetworkErrorTemporary: boolean;
  readonly accessDeniedReasonFa: string | null;
  readonly updatedAtMs: number;
}

export const INITIAL_AUTH_MACHINE_SNAPSHOT: AuthMachineSnapshot = {
  status: 'INITIALIZING',
  identity: null,
  profile: null,
  roles: [],
  permissions: [],
  workspace: null,
  availableWorkspaces: [],
  tokenExpiresAtMs: null,
  lastNetworkErrorTemporary: false,
  accessDeniedReasonFa: null,
  updatedAtMs: 0,
};

const VALID_TRANSITIONS: Record<AuthLifecycleStatus, readonly AuthLifecycleStatus[]> = {
  INITIALIZING: ['UNAUTHENTICATED', 'AUTHENTICATED', 'RESOLVING_ACCESS', 'READY', 'SESSION_EXPIRED', 'ACCESS_DENIED'],
  UNAUTHENTICATED: ['INITIALIZING', 'AUTHENTICATED', 'RESOLVING_ACCESS', 'READY', 'SESSION_EXPIRED'],
  AUTHENTICATED: ['RESOLVING_ACCESS', 'READY', 'TOKEN_REFRESHING', 'REAUTH_REQUIRED', 'SESSION_EXPIRED', 'UNAUTHENTICATED', 'ACCESS_DENIED'],
  RESOLVING_ACCESS: ['READY', 'ACCESS_DENIED', 'UNAUTHENTICATED', 'SESSION_EXPIRED', 'TOKEN_REFRESHING'],
  READY: ['TOKEN_REFRESHING', 'REAUTH_REQUIRED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'RESOLVING_ACCESS', 'UNAUTHENTICATED'],
  TOKEN_REFRESHING: ['READY', 'REAUTH_REQUIRED', 'SESSION_EXPIRED', 'UNAUTHENTICATED', 'ACCESS_DENIED'],
  REAUTH_REQUIRED: ['READY', 'TOKEN_REFRESHING', 'SESSION_EXPIRED', 'UNAUTHENTICATED', 'ACCESS_DENIED'],
  SESSION_EXPIRED: ['UNAUTHENTICATED', 'AUTHENTICATED', 'RESOLVING_ACCESS', 'READY'],
  ACCESS_DENIED: ['READY', 'RESOLVING_ACCESS', 'UNAUTHENTICATED', 'REAUTH_REQUIRED'],
};

export function canTransitionAuthState(from: AuthLifecycleStatus, to: AuthLifecycleStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canRenderProtectedRouteContent(snapshot: AuthMachineSnapshot): boolean {
  return (
    snapshot.status === 'READY' ||
    snapshot.status === 'TOKEN_REFRESHING' ||
    snapshot.status === 'REAUTH_REQUIRED'
  ) && snapshot.identity !== null;
}

import { AuthClient, AuthUserSnapshot, getAuthClient } from './authClient';
import { IdentityRecord, resolveIdentity } from '../identity/identityResolver';
import { ProfileRecord, resolveProfile } from '../identity/profileResolver';
import { ResolvedAccessContext, resolveRoleAndPermissions } from '../authorization/permissionResolver';

export interface AuthBootstrapResult {
  status: 'READY' | 'UNAUTHENTICATED' | 'ACCESS_DENIED' | 'SESSION_EXPIRED';
  identity: IdentityRecord | null;
  profile: ProfileRecord | null;
  access: ResolvedAccessContext | null;
  errorCode?: string;
}

export async function bootstrapAuthSession(
  userSnapshot: AuthUserSnapshot | null,
  options?: {
    client?: AuthClient;
    requestedWorkspaceId?: string;
    tokenExpired?: boolean;
    accountLocked?: boolean;
  }
): Promise<AuthBootstrapResult> {
  const client = options?.client ?? getAuthClient();
  client.transition('INITIALIZING');

  if (!userSnapshot) {
    client.setUser(null);
    return {
      status: 'UNAUTHENTICATED',
      identity: null,
      profile: null,
      access: null,
    };
  }

  if (options?.tokenExpired) {
    client.transition('SESSION_EXPIRED', { reason: 'Token expired during bootstrap' });
    return {
      status: 'SESSION_EXPIRED',
      identity: null,
      profile: null,
      access: null,
      errorCode: 'AUTH_TOKEN_EXPIRED',
    };
  }

  client.setUser(userSnapshot);
  client.transition('RESOLVING_ACCESS');

  if (options?.accountLocked) {
    client.transition('ACCESS_DENIED', { reason: 'Account locked or suspended' });
    return {
      status: 'ACCESS_DENIED',
      identity: null,
      profile: null,
      access: null,
      errorCode: 'ACCOUNT_LOCKED',
    };
  }

  const identity = resolveIdentity(userSnapshot);
  const profile = resolveProfile(identity);
  const access = resolveRoleAndPermissions(identity, profile, options?.requestedWorkspaceId);

  if (access.permissions.length === 0) {
    client.transition('ACCESS_DENIED', { reason: 'No active permissions for workspace' });
    return {
      status: 'ACCESS_DENIED',
      identity,
      profile,
      access,
      errorCode: 'NO_PERMISSIONS',
    };
  }

  client.transition('READY', {
    uid: identity.uid,
    workspaceId: access.workspaceId,
    role: access.activeRole,
  });

  return {
    status: 'READY',
    identity,
    profile,
    access,
  };
}

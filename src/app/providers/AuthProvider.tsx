import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import {
  AuthLifecycleState,
  AuthUserSnapshot,
  getAuthClient,
  AppRole,
  PermissionKey,
  resolveIdentity,
  resolveProfile,
  resolveRoleAndPermissions,
  GUEST_BASELINE_PERMISSIONS,
} from '../../platform/auth';

export interface AuthContextValue {
  state: AuthLifecycleState;
  user: AuthUserSnapshot | null;
  activeRole: AppRole;
  permissions: PermissionKey[];
  workspaceId: string;
  switchRole: (role: AppRole, workspaceId?: string) => void;
  logout: () => void;
}

const defaultGuestPermissions: PermissionKey[] = [...GUEST_BASELINE_PERMISSIONS];

const AuthContext = createContext<AuthContextValue>({
  state: 'UNAUTHENTICATED',
  user: null,
  activeRole: 'guest',
  permissions: defaultGuestPermissions,
  workspaceId: 'ws:guest',
  switchRole: () => undefined,
  logout: () => undefined,
});

export const AuthProvider: React.FC<{
  initialUser?: AuthUserSnapshot | null;
  children: React.ReactNode;
}> = ({ initialUser = null, children }) => {
  const client = getAuthClient();
  const [state, setState] = useState<AuthLifecycleState>(initialUser ? 'READY' : 'INITIALIZING');
  const [user, setUser] = useState<AuthUserSnapshot | null>(initialUser);
  const [workspaceOverride, setWorkspaceOverride] = useState<string | undefined>(undefined);

  useEffect(() => {
    setState(client.getState());
    setUser(client.getUser());
    const unsubscribe = client.subscribe((lifecycle, clientUser) => {
      setState(lifecycle);
      setUser(clientUser);
    });

    if (initialUser) {
      client.setUser(initialUser);
      client.transition('READY');
    } else {
      client.transition('INITIALIZING');
      void client.refreshSession().catch(() => undefined);
    }

    return unsubscribe;
  }, [client, initialUser]);

  const access = useMemo(() => {
    if (state === 'SESSION_EXPIRED' || state === 'UNAUTHENTICATED' || state === 'ACCESS_DENIED') {
      const identity = resolveIdentity(null);
      return resolveRoleAndPermissions(identity, resolveProfile(identity), workspaceOverride);
    }
    if (state === 'INITIALIZING' || state === 'RESOLVING_ACCESS' || state === 'AUTHENTICATED') {
      return {
        activeRole: 'guest' as AppRole,
        availableRoles: ['guest'] as AppRole[],
        permissions: defaultGuestPermissions,
        workspaceId: 'ws:guest',
        permissionVersion: 1,
      };
    }
    const identity = resolveIdentity(user);
    const profile = resolveProfile(identity);
    return resolveRoleAndPermissions(identity, profile, workspaceOverride);
  }, [state, user, workspaceOverride]);

  const switchRole = useCallback((role: AppRole, workspaceId?: string) => {
    setWorkspaceOverride(workspaceId);
    setUser((prev) => {
      if (!prev) return prev;
      const tokenRoles = Array.isArray(prev.customClaims?.roles)
        ? (prev.customClaims.roles as AppRole[])
        : [];
      const tokenRole = typeof prev.customClaims?.role === 'string' ? (prev.customClaims.role as AppRole) : null;
      const allowed = new Set<AppRole>([...tokenRoles, ...(tokenRole ? [tokenRole] : [])]);
      if (!allowed.has(role)) return prev;
      return { ...prev, customClaims: { ...prev.customClaims, role } };
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setWorkspaceOverride(undefined);
    void client.logout('provider_logout').catch(() => {
      // Keep the UI signed out even when the revocation endpoint is temporarily unreachable.
      client.setUser(null);
    });
  }, [client]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state === 'SESSION_EXPIRED' ? null : user,
      activeRole: access.activeRole,
      permissions: access.permissions,
      workspaceId: access.workspaceId,
      switchRole,
      logout,
    }),
    [state, user, access.activeRole, access.permissions, access.workspaceId, switchRole, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export function useAppAuth(): AuthContextValue {
  return useContext(AuthContext);
}
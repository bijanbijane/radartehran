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

const AuthContext = createContext<AuthContextValue>({
  state: 'UNAUTHENTICATED',
  user: null,
  activeRole: 'guest',
  permissions: ['map:view', 'neighborhood:read', 'property:read', 'valuation:calculate'],
  workspaceId: 'ws:guest',
  switchRole: () => undefined,
  logout: () => undefined,
});

export const AuthProvider: React.FC<{
  initialUser?: AuthUserSnapshot | null;
  children: React.ReactNode;
}> = ({ initialUser = null, children }) => {
  const client = getAuthClient();
  const [state, setState] = useState<AuthLifecycleState>(initialUser ? 'READY' : 'UNAUTHENTICATED');
  const [user, setUser] = useState<AuthUserSnapshot | null>(initialUser);
  const [workspaceOverride, setWorkspaceOverride] = useState<string | undefined>(undefined);

  useEffect(() => {
    return client.subscribe((next) => setState(next));
  }, [client]);

  const access = useMemo(() => {
    const identity = resolveIdentity(user);
    const profile = resolveProfile(identity);
    return resolveRoleAndPermissions(identity, profile, workspaceOverride);
  }, [user, workspaceOverride]);

  const switchRole = useCallback((role: AppRole, workspaceId?: string) => {
    setUser((prev) => (prev ? { ...prev, customClaims: { ...prev.customClaims, role } } : prev));
    setWorkspaceOverride(workspaceId);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setWorkspaceOverride(undefined);
    client.logout('provider_logout');
  }, [client]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      activeRole: access.activeRole,
      permissions: access.permissions,
      workspaceId: access.workspaceId,
      switchRole,
      logout,
    }),
    [state, user, access.activeRole, access.permissions, access.workspaceId, switchRole, logout],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAppAuth(): AuthContextValue {
  return useContext(AuthContext);
}

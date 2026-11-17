import React, { createContext, useContext, useState, useEffect } from 'react';
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

  const identity = resolveIdentity(user);
  const profile = resolveProfile(identity);
  const access = resolveRoleAndPermissions(identity, profile, workspaceOverride);

  const switchRole = (role: AppRole, workspaceId?: string) => {
    if (user) {
      setUser({ ...user, customClaims: { ...user.customClaims, role } });
    }
    setWorkspaceOverride(workspaceId);
  };

  const logout = () => {
    setUser(null);
    setWorkspaceOverride(undefined);
    client.logout('provider_logout');
  };

  return (
    <AuthContext.Provider
      value={{
        state,
        user,
        activeRole: access.activeRole,
        permissions: access.permissions,
        workspaceId: access.workspaceId,
        switchRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAppAuth(): AuthContextValue {
  return useContext(AuthContext);
}

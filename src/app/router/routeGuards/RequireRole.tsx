import React from 'react';
import { AppRole, PermissionKey, evaluateRouteAccess } from '../../../platform/auth';

export interface RequireRoleProps {
  path: string;
  isAuthenticated: boolean;
  activeRole: AppRole;
  permissions: PermissionKey[];
  workspaceId: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({
  path,
  isAuthenticated,
  activeRole,
  permissions,
  workspaceId,
  fallback,
  children,
}) => {
  const decision = evaluateRouteAccess(path, {
    isAuthenticated,
    activeRole,
    permissions,
    workspaceId,
  });

  if (!decision.allowed) {
    return (
      <>
        {fallback ?? (
          <div role="alert" data-testid="require-role-denied" className="p-6 text-center text-sm text-rose-300">
            شما مجوز دسترسی به این بخش را ندارید ({decision.reason}).
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};

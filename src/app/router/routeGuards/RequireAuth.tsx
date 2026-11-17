import React from 'react';

export interface RequireAuthProps {
  isAuthenticated: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({
  isAuthenticated,
  fallback = null,
  children,
}) => {
  if (!isAuthenticated) {
    return (
      <>
        {fallback ?? (
          <div role="alert" data-testid="require-auth-fallback" className="p-6 text-center text-sm text-slate-300">
            برای دسترسی به این بخش، لطفاً وارد حساب کاربری خود شوید.
          </div>
        )}
      </>
    );
  }
  return <>{children}</>;
};

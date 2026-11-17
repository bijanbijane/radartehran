import React from 'react';

export interface GuestOnlyProps {
  isAuthenticated: boolean;
  redirectFallback?: React.ReactNode;
  children: React.ReactNode;
}

export const GuestOnly: React.FC<GuestOnlyProps> = ({
  isAuthenticated,
  redirectFallback = null,
  children,
}) => {
  if (isAuthenticated) {
    return <>{redirectFallback}</>;
  }
  return <>{children}</>;
};

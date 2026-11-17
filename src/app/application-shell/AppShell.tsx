import React from 'react';
import { PublicLayout } from './PublicLayout';
import { AuthenticatedLayout } from './AuthenticatedLayout';
import { AdminLayout } from './AdminLayout';
import { MainLayout } from './MainLayout';

export type AppShellLayoutKind = 'public' | 'authenticated' | 'admin' | 'main';

export const ALLOWED_SHELL_LAYOUTS: readonly AppShellLayoutKind[] = [
  'public',
  'authenticated',
  'admin',
  'main',
] as const;

export interface AppShellProps {
  layout: AppShellLayoutKind;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  layout,
  header,
  sidebar,
  footer,
  children,
}) => {
  switch (layout) {
    case 'admin':
      return (
        <AdminLayout header={header} sidebar={sidebar} footer={footer}>
          {children}
        </AdminLayout>
      );
    case 'authenticated':
      return (
        <AuthenticatedLayout header={header} sidebar={sidebar} footer={footer}>
          {children}
        </AuthenticatedLayout>
      );
    case 'public':
      return (
        <PublicLayout header={header} footer={footer}>
          {children}
        </PublicLayout>
      );
    case 'main':
    default:
      return (
        <MainLayout header={header} sidePanel={sidebar}>
          {children}
        </MainLayout>
      );
  }
};

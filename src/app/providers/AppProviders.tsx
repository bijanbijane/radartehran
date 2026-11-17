import React from 'react';
import { AuthProvider } from './AuthProvider';
import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';
import { LocalizationProvider } from './LocalizationProvider';
import { AuthUserSnapshot } from '../../platform/auth';
import { ThemeMode } from '../../design-system';

export interface AppProvidersProps {
  initialUser?: AuthUserSnapshot | null;
  initialTheme?: ThemeMode;
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({
  initialUser = null,
  initialTheme = 'dark',
  children,
}) => {
  return (
    <LocalizationProvider>
      <ThemeProvider initialMode={initialTheme}>
        <QueryProvider>
          <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </LocalizationProvider>
  );
};

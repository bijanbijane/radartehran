import { runStorageMigrations, cleanupExpiredStorage } from '../../platform/storage';

export interface BootstrapDiagnostic {
  initializedAt: number;
  storageMigratedVersion: number;
  expiredEntriesRemoved: number;
  direction: 'rtl' | 'ltr';
  locale: 'fa-IR' | 'en-US';
}

let activeBootstrap: BootstrapDiagnostic | null = null;

export function runAppBootstrap(): BootstrapDiagnostic {
  const migration = runStorageMigrations();
  const expiredEntriesRemoved = cleanupExpiredStorage();

  if (typeof document !== 'undefined') {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'fa';
  }

  activeBootstrap = {
    initializedAt: Date.now(),
    storageMigratedVersion: migration.toVersion,
    expiredEntriesRemoved,
    direction: 'rtl',
    locale: 'fa-IR',
  };

  return activeBootstrap;
}

export function getBootstrapDiagnostic(): BootstrapDiagnostic | null {
  return activeBootstrap;
}

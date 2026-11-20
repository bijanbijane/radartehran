/**
 * @file src/platform/recovery/hookErrorAutoRecovery.ts
 * @description RT-FE-BUGFIX-005 & RT-FE-BUGFIX-007 — Resilient, Loop-Safe Auto-Recovery Engine
 * for Duplicate React Hook Errors with Application-Owned Cache Storage isolation.
 */

import {
  executeScopedCacheStoragePurge,
  type CachePurgeEntryOutcome,
  type CachePurgeStatus,
} from '../storage/cacheStorageOwnership';

export const VITE_HOOK_RECOVERY_STORAGE_KEY = 'tehran_radar_vite_hook_recovery_v3';

export type RecoveryStorageState =
  | 'storage_available_not_attempted' | 'storage_available_already_attempted' | 'storage_unavailable';

export type AutoRecoveryOutcome =
  | 'not_applicable' | 'auto_reloaded' | 'skipped_already_attempted'
  | 'skipped_document_guard' | 'manual_fallback_storage_unavailable' | 'manual_fallback_marker_write_failed';

export interface AutoRecoveryCleanupReport {
  cachesAvailable: boolean;
  cachePurgeStatus: CachePurgeStatus;
  clearedCacheCount: number;
  clearedCacheNames: string[];
  preservedCacheNames: string[];
  failedCacheNames: string[];
  cacheEntries: CachePurgeEntryOutcome[];
  cacheError?: string;
  serviceWorkerAvailable: boolean;
  updatedServiceWorkerCount: number;
  serviceWorkerError?: string;
}

export interface AutoRecoveryResult {
  isDuplicateHookError: boolean;
  storageState: RecoveryStorageState;
  outcome: AutoRecoveryOutcome;
  didAttemptReload: boolean;
  requiresManualRecovery: boolean;
  storageError?: string;
  cleanup: AutoRecoveryCleanupReport;
}

export interface AutoRecoveryDiagnosticPayload {
  message: string;
  severity: 'success' | 'fallback';
  outcome: AutoRecoveryOutcome;
  storageState: RecoveryStorageState;
  errorDetail?: string;
}

export interface AutoRecoveryEnvironment {
  windowObj?: Window | Record<string, unknown> | null;
  navigatorObj?: Navigator | Record<string, unknown> | null;
  recoveryKey?: string;
  reloadFn?: () => void;
  onDiagnostic?: (payload: AutoRecoveryDiagnosticPayload) => void;
}

export interface AutoRecoveryDocumentGuard {
  hasAttemptedInDocument(): boolean;
  markAttemptedInDocument(): void;
  resetForTests(): void;
}

export function createAutoRecoveryDocumentGuard(): AutoRecoveryDocumentGuard {
  let attempted = false;
  return {
    hasAttemptedInDocument: () => attempted,
    markAttemptedInDocument: () => { attempted = true; },
    resetForTests: () => { attempted = false; },
  };
}

export const defaultHookAutoRecoveryGuard: AutoRecoveryDocumentGuard = createAutoRecoveryDocumentGuard();

export function isDuplicateReactHookErrorMessage(rawMessage: string): boolean {
  const msg = String(rawMessage || '');
  return msg.includes("reading 'use") || msg.includes('Invalid hook call') || msg.includes('resolveDispatcher');
}

function formatSafeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err ?? 'Unknown error');
}

function emitSafeDiagnostic(
  onDiagnostic: AutoRecoveryEnvironment['onDiagnostic'],
  payload: AutoRecoveryDiagnosticPayload,
): void {
  if (!onDiagnostic) return;
  try { onDiagnostic(payload); } catch { /* Fail-safe diagnostic reporting */ }
}

interface SafeSessionStorageAccess {
  available: boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  error?: string;
}

function resolveSessionStorageSafe(win: unknown): SafeSessionStorageAccess {
  if (!win || typeof win !== 'object') return { available: false, storage: null, error: 'window unavailable' };
  try {
    const candidate = (win as { sessionStorage?: Pick<Storage, 'getItem' | 'setItem'> }).sessionStorage;
    if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
      return { available: false, storage: null, error: 'sessionStorage API unavailable' };
    }
    return { available: true, storage: candidate };
  } catch (err) {
    return { available: false, storage: null, error: formatSafeError(err) };
  }
}

export function inspectRecoveryStorageState(
  win: unknown,
  recoveryKey: string = VITE_HOOK_RECOVERY_STORAGE_KEY,
): { storageState: RecoveryStorageState; storage: Pick<Storage, 'getItem' | 'setItem'> | null; error?: string } {
  const access = resolveSessionStorageSafe(win);
  if (!access.available || !access.storage) {
    return { storageState: 'storage_unavailable', storage: null, error: access.error };
  }
  try {
    const marker = access.storage.getItem(recoveryKey);
    return {
      storageState: marker ? 'storage_available_already_attempted' : 'storage_available_not_attempted',
      storage: access.storage,
    };
  } catch (err) {
    return { storageState: 'storage_unavailable', storage: null, error: formatSafeError(err) };
  }
}

function writeRecoveryMarkerSafe(
  storage: Pick<Storage, 'setItem'> | null,
  recoveryKey: string,
): { written: boolean; error?: string } {
  if (!storage) return { written: false, error: 'sessionStorage reference missing' };
  try { storage.setItem(recoveryKey, '1'); return { written: true }; }
  catch (err) { return { written: false, error: formatSafeError(err) }; }
}

function createEmptyCleanup(status: CachePurgeStatus = 'empty_noop'): AutoRecoveryCleanupReport {
  return {
    cachesAvailable: false, cachePurgeStatus: status, clearedCacheCount: 0,
    clearedCacheNames: [], preservedCacheNames: [], failedCacheNames: [], cacheEntries: [],
    serviceWorkerAvailable: false, updatedServiceWorkerCount: 0,
  };
}

async function runIsolatedAutoRecoveryCleanup(win: unknown, nav: unknown): Promise<AutoRecoveryCleanupReport> {
  const report = createEmptyCleanup('unavailable');

  // 1. Scoped Browser Cache Storage cleanup (hook_auto_recovery policy: Radar shell & UI assets ONLY)
  try {
    const cachesApi = win && typeof win === 'object' && 'caches' in win ? (win as { caches?: CacheStorage }).caches : undefined;
    const purge = await executeScopedCacheStoragePurge(cachesApi ?? null, 'hook_auto_recovery');
    report.cachesAvailable = purge.cachesAvailable;
    report.cachePurgeStatus = purge.status;
    report.clearedCacheCount = purge.deleted.length;
    report.clearedCacheNames = purge.deleted;
    report.preservedCacheNames = purge.preserved;
    report.failedCacheNames = purge.failed;
    report.cacheEntries = purge.entries;
    if (purge.error) report.cacheError = purge.error;
  } catch (err) {
    report.cachePurgeStatus = 'unavailable';
    report.cacheError = formatSafeError(err);
  }

  // 2. Isolated Service Worker update (errors here must not block final recovery decision)
  try {
    const swApi = nav && typeof nav === 'object' && 'serviceWorker' in nav
      ? (nav as { serviceWorker?: ServiceWorkerContainer }).serviceWorker : undefined;
    if (swApi && typeof swApi.getRegistrations === 'function') {
      report.serviceWorkerAvailable = true;
      const regs = await swApi.getRegistrations();
      const results = await Promise.all(
        regs.map(async (reg) => {
          try { await reg.update(); return true; }
          catch (swErr) { report.serviceWorkerError = report.serviceWorkerError || formatSafeError(swErr); return false; }
        }),
      );
      report.updatedServiceWorkerCount = results.filter(Boolean).length;
    }
  } catch (err) {
    report.serviceWorkerError = formatSafeError(err);
  }

  return report;
}

export async function executeHookErrorAutoRecovery(
  rawMessage: string,
  env: AutoRecoveryEnvironment = {},
  guard: AutoRecoveryDocumentGuard = defaultHookAutoRecoveryGuard,
): Promise<AutoRecoveryResult> {
  const emptyCleanup = createEmptyCleanup('empty_noop');
  if (!isDuplicateReactHookErrorMessage(rawMessage)) {
    return {
      isDuplicateHookError: false, storageState: 'storage_unavailable', outcome: 'not_applicable',
      didAttemptReload: false, requiresManualRecovery: false, cleanup: emptyCleanup,
    };
  }

  const win = env.windowObj !== undefined ? env.windowObj : typeof window !== 'undefined' ? window : null;
  const nav = env.navigatorObj !== undefined ? env.navigatorObj : typeof navigator !== 'undefined' ? navigator : null;
  const recoveryKey = env.recoveryKey || VITE_HOOK_RECOVERY_STORAGE_KEY;

  if (guard.hasAttemptedInDocument()) {
    const inspected = inspectRecoveryStorageState(win, recoveryKey);
    emitSafeDiagnostic(env.onDiagnostic, {
      message: 'Skipped duplicate auto-recovery attempt within the same document lifecycle',
      severity: 'fallback', outcome: 'skipped_document_guard', storageState: inspected.storageState,
    });
    return {
      isDuplicateHookError: true, storageState: inspected.storageState, outcome: 'skipped_document_guard',
      didAttemptReload: false, requiresManualRecovery: true, cleanup: emptyCleanup,
    };
  }

  const inspected = inspectRecoveryStorageState(win, recoveryKey);

  if (inspected.storageState === 'storage_available_already_attempted') {
    guard.markAttemptedInDocument();
    emitSafeDiagnostic(env.onDiagnostic, {
      message: 'Auto-recovery marker already present in sessionStorage; skipping automatic reload to prevent loop',
      severity: 'fallback', outcome: 'skipped_already_attempted', storageState: inspected.storageState,
    });
    return {
      isDuplicateHookError: true, storageState: inspected.storageState, outcome: 'skipped_already_attempted',
      didAttemptReload: false, requiresManualRecovery: true, cleanup: emptyCleanup,
    };
  }

  if (inspected.storageState === 'storage_unavailable') {
    guard.markAttemptedInDocument();
    emitSafeDiagnostic(env.onDiagnostic, {
      message: `sessionStorage unavailable during hook auto-recovery (${inspected.error || 'access denied'}); switching to controlled manual recovery fallback without auto-reload`,
      severity: 'fallback', outcome: 'manual_fallback_storage_unavailable',
      storageState: inspected.storageState, errorDetail: inspected.error,
    });
    return {
      isDuplicateHookError: true, storageState: inspected.storageState, outcome: 'manual_fallback_storage_unavailable',
      didAttemptReload: false, requiresManualRecovery: true, storageError: inspected.error, cleanup: emptyCleanup,
    };
  }

  guard.markAttemptedInDocument();
  const writeResult = writeRecoveryMarkerSafe(inspected.storage, recoveryKey);
  if (!writeResult.written) {
    emitSafeDiagnostic(env.onDiagnostic, {
      message: `Failed to persist auto-recovery marker in sessionStorage (${writeResult.error || 'write failed'}); aborting auto-reload to prevent reload loop and surfacing manual recovery`,
      severity: 'fallback', outcome: 'manual_fallback_marker_write_failed',
      storageState: 'storage_unavailable', errorDetail: writeResult.error,
    });
    return {
      isDuplicateHookError: true, storageState: 'storage_unavailable', outcome: 'manual_fallback_marker_write_failed',
      didAttemptReload: false, requiresManualRecovery: true, storageError: writeResult.error, cleanup: emptyCleanup,
    };
  }

  const cleanup = await runIsolatedAutoRecoveryCleanup(win, nav);
  const reload = env.reloadFn ?? (() => {
    const loc = win && typeof win === 'object' ? (win as { location?: Location }).location : undefined;
    if (loc && typeof loc.reload === 'function') loc.reload();
  });

  emitSafeDiagnostic(env.onDiagnostic, {
    message: `Auto-recovery cleanup finished (cacheStatus=${cleanup.cachePurgeStatus}, cachesCleared=${cleanup.clearedCacheCount}, preserved=${cleanup.preservedCacheNames.length}, swUpdated=${cleanup.updatedServiceWorkerCount}); triggering single reload`,
    severity: cleanup.cacheError || cleanup.serviceWorkerError ? 'fallback' : 'success',
    outcome: 'auto_reloaded', storageState: 'storage_available_not_attempted',
  });

  let didAttemptReload = false;
  try { reload(); didAttemptReload = true; }
  catch (reloadErr) {
    emitSafeDiagnostic(env.onDiagnostic, {
      message: `Auto-recovery reload failed: ${formatSafeError(reloadErr)}`,
      severity: 'fallback', outcome: 'auto_reloaded',
      storageState: 'storage_available_not_attempted', errorDetail: formatSafeError(reloadErr),
    });
  }

  return {
    isDuplicateHookError: true, storageState: 'storage_available_not_attempted', outcome: 'auto_reloaded',
    didAttemptReload, requiresManualRecovery: !didAttemptReload, cleanup,
  };
}

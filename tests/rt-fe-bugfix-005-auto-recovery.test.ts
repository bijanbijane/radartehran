/**
 * @file tests/rt-fe-bugfix-005-auto-recovery.test.ts
 * @description Independent regression tests for RT-FE-BUGFIX-005-SESSION-STORAGE-RECOVERY-FAILURE.
 * Covers all 7 controlled-mock scenarios including throwing window.sessionStorage getter,
 * SecurityError on getItem/setItem, pre-existing marker, missing Cache API, failing Service Worker,
 * and strict one-time automatic reload invariant without reload loops.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VITE_HOOK_RECOVERY_STORAGE_KEY,
  createAutoRecoveryDocumentGuard,
  executeHookErrorAutoRecovery,
  isDuplicateReactHookErrorMessage,
  type AutoRecoveryDiagnosticPayload,
} from '../src/platform/recovery/hookErrorAutoRecovery';

const HOOK_ERROR_MSG = "Cannot read properties of null (reading 'useState')";

function createHealthySessionStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    snapshot(): Record<string, string> {
      return Object.fromEntries(store.entries());
    },
  };
}

test('RT-FE-BUGFIX-005 Scenario 1 & 7: Normal sessionStorage runs marker-gated cleanup and reloads strictly once', async () => {
  const storage = createHealthySessionStorage();
  const guard = createAutoRecoveryDocumentGuard();
  const deletedCaches: string[] = [];
  let swUpdates = 0;
  let reloadCalls = 0;
  const diagnostics: AutoRecoveryDiagnosticPayload[] = [];

  const mockWin = {
    sessionStorage: storage,
    caches: {
      keys: async () => [
        'tehran-radar-shell-v4-2026-10',
        'tehran-radar-assets-v4-2026-10',
        'tehran-radar-data-v4-2026-10',
        'external-origin-cache-v1',
      ],
      delete: async (k: string) => {
        deletedCaches.push(k);
        return true;
      },
    },
  };
  const mockNav = {
    serviceWorker: {
      getRegistrations: async () => [
        {
          update: async () => {
            swUpdates += 1;
          },
        },
      ],
    },
  };

  const first = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: mockWin,
      navigatorObj: mockNav,
      reloadFn: () => {
        reloadCalls += 1;
      },
      onDiagnostic: (d) => diagnostics.push(d),
    },
    guard
  );

  assert.equal(first.isDuplicateHookError, true);
  assert.equal(first.storageState, 'storage_available_not_attempted');
  assert.equal(first.outcome, 'auto_reloaded');
  assert.equal(first.didAttemptReload, true);
  assert.equal(first.requiresManualRecovery, false);
  assert.equal(storage.getItem(VITE_HOOK_RECOVERY_STORAGE_KEY), '1');
  assert.deepEqual(deletedCaches, ['tehran-radar-shell-v4-2026-10', 'tehran-radar-assets-v4-2026-10']);
  assert.deepEqual(first.cleanup.preservedCacheNames, ['tehran-radar-data-v4-2026-10', 'external-origin-cache-v1']);
  assert.equal(swUpdates, 1);
  assert.equal(reloadCalls, 1);
  assert.ok(diagnostics.length >= 1);

  // Repeating in the same document must NEVER reload a second time
  const second = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: mockWin,
      navigatorObj: mockNav,
      reloadFn: () => {
        reloadCalls += 1;
      },
    },
    guard
  );
  assert.equal(second.outcome, 'skipped_document_guard');
  assert.equal(second.didAttemptReload, false);
  assert.equal(reloadCalls, 1);
});

test('RT-FE-BUGFIX-005 Scenario 2a: Throwing window.sessionStorage getter activates controlled fallback without crashing or looping', async () => {
  const guard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;
  const diagnostics: AutoRecoveryDiagnosticPayload[] = [];

  const restrictedWindow: Record<string, unknown> = {};
  Object.defineProperty(restrictedWindow, 'sessionStorage', {
    configurable: true,
    enumerable: true,
    get() {
      const err = new Error('The operation is insecure.');
      err.name = 'SecurityError';
      throw err;
    },
  });

  const result = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: restrictedWindow,
      navigatorObj: null,
      reloadFn: () => {
        reloadCalls += 1;
      },
      onDiagnostic: (d) => diagnostics.push(d),
    },
    guard
  );

  assert.equal(result.storageState, 'storage_unavailable');
  assert.equal(result.outcome, 'manual_fallback_storage_unavailable');
  assert.equal(result.didAttemptReload, false);
  assert.equal(result.requiresManualRecovery, true);
  assert.match(result.storageError || '', /SecurityError/);
  assert.equal(reloadCalls, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, 'fallback');
});

test('RT-FE-BUGFIX-005 Scenario 2b: sessionStorage.getItem() throwing SecurityError does not halt silently and switches to fallback', async () => {
  const guard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;
  const diagnostics: AutoRecoveryDiagnosticPayload[] = [];

  const mockWin = {
    sessionStorage: {
      getItem() {
        const err = new Error('Blocked getItem in sandboxed context');
        err.name = 'SecurityError';
        throw err;
      },
      setItem() {
        // Not reached
      },
    },
  };

  const result = await executeHookErrorAutoRecovery(
    'Invalid hook call. Hooks can only be called inside of the body of a function component.',
    {
      windowObj: mockWin,
      reloadFn: () => {
        reloadCalls += 1;
      },
      onDiagnostic: (d) => diagnostics.push(d),
    },
    guard
  );

  assert.equal(result.storageState, 'storage_unavailable');
  assert.equal(result.outcome, 'manual_fallback_storage_unavailable');
  assert.equal(result.didAttemptReload, false);
  assert.equal(result.requiresManualRecovery, true);
  assert.match(result.storageError || '', /SecurityError/);
  assert.equal(reloadCalls, 0);
  assert.equal(diagnostics[0]?.outcome, 'manual_fallback_storage_unavailable');
});

test('RT-FE-BUGFIX-005 Scenario 3: sessionStorage.setItem() throwing SecurityError is recorded and prevents automatic reload loop', async () => {
  const guard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;
  const diagnostics: AutoRecoveryDiagnosticPayload[] = [];

  const mockWin = {
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {
        const err = new Error('Quota or SecurityError writing sessionStorage');
        err.name = 'SecurityError';
        throw err;
      },
    },
  };

  const result = await executeHookErrorAutoRecovery(
    'Cannot read properties of null (reading resolveDispatcher)',
    {
      windowObj: mockWin,
      reloadFn: () => {
        reloadCalls += 1;
      },
      onDiagnostic: (d) => diagnostics.push(d),
    },
    guard
  );

  assert.equal(result.outcome, 'manual_fallback_marker_write_failed');
  assert.equal(result.didAttemptReload, false);
  assert.equal(result.requiresManualRecovery, true);
  assert.match(result.storageError || '', /SecurityError/);
  assert.equal(reloadCalls, 0);
  assert.equal(diagnostics[0]?.outcome, 'manual_fallback_marker_write_failed');
});

test('RT-FE-BUGFIX-005 Scenario 4: Existing recovery marker skips automatic reload across fresh document load', async () => {
  const storage = createHealthySessionStorage({ [VITE_HOOK_RECOVERY_STORAGE_KEY]: '1' });
  const freshDocumentGuard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;

  const result = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: { sessionStorage: storage },
      reloadFn: () => {
        reloadCalls += 1;
      },
    },
    freshDocumentGuard
  );

  assert.equal(result.storageState, 'storage_available_already_attempted');
  assert.equal(result.outcome, 'skipped_already_attempted');
  assert.equal(result.didAttemptReload, false);
  assert.equal(result.requiresManualRecovery, true);
  assert.equal(reloadCalls, 0);
});

test('RT-FE-BUGFIX-005 Scenario 5: Unavailable Cache API still completes recovery cleanly', async () => {
  const storage = createHealthySessionStorage();
  const guard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;

  const result = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: { sessionStorage: storage }, // no caches property
      navigatorObj: null,
      reloadFn: () => {
        reloadCalls += 1;
      },
    },
    guard
  );

  assert.equal(result.outcome, 'auto_reloaded');
  assert.equal(result.cleanup.cachesAvailable, false);
  assert.equal(result.didAttemptReload, true);
  assert.equal(reloadCalls, 1);
});

test('RT-FE-BUGFIX-005 Scenario 6: Service Worker failure does not block final recovery decision or reload', async () => {
  const storage = createHealthySessionStorage();
  const guard = createAutoRecoveryDocumentGuard();
  let reloadCalls = 0;

  const result = await executeHookErrorAutoRecovery(
    HOOK_ERROR_MSG,
    {
      windowObj: {
        sessionStorage: storage,
        caches: {
          keys: async () => ['tehran-radar-assets-v4-2026-10'],
          delete: async () => true,
        },
      },
      navigatorObj: {
        serviceWorker: {
          getRegistrations: async () => {
            throw new Error('SW registration fetch failed');
          },
        },
      },
      reloadFn: () => {
        reloadCalls += 1;
      },
      onDiagnostic: () => {
        // Also verify fail-safe diagnostic callback
        throw new Error('Diagnostic sink temporarily broken');
      },
    },
    guard
  );

  assert.equal(result.outcome, 'auto_reloaded');
  assert.equal(result.cleanup.clearedCacheCount, 1);
  assert.match(result.cleanup.serviceWorkerError || '', /SW registration fetch failed/);
  assert.equal(result.didAttemptReload, true);
  assert.equal(reloadCalls, 1);
});

test('RT-FE-BUGFIX-005: Non-hook errors are ignored and src/main.tsx no longer uses unprotected sessionStorage optional chaining', async () => {
  assert.equal(isDuplicateReactHookErrorMessage('Network timeout while loading listings'), false);
  const res = await executeHookErrorAutoRecovery('Generic UI render error', {}, createAutoRecoveryDocumentGuard());
  assert.equal(res.outcome, 'not_applicable');
  assert.equal(res.didAttemptReload, false);

  const mainSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  assert.ok(mainSrc.includes('executeHookErrorAutoRecovery'), 'src/main.tsx must delegate to executeHookErrorAutoRecovery');
  assert.equal(
    mainSrc.includes('window.sessionStorage?.getItem'),
    false,
    'src/main.tsx must NOT use unprotected window.sessionStorage?.getItem'
  );
  assert.equal(
    mainSrc.includes('window.sessionStorage?.setItem'),
    false,
    'src/main.tsx must NOT use unprotected window.sessionStorage?.setItem'
  );
});

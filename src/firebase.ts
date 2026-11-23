/**
 * @fileoverview Layer 1 & Layer 4: Firebase SDK Initialization, Long-Polling Resilience, * Connection Health Verification, and Structured Firestore Security Error Handler.
 */
import { initializeApp, FirebaseApp } from 'firebase/app'; import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth'; import { getFirestore, initializeFirestore, setLogLevel, doc, getDocFromServer,
  Firestore, } from 'firebase/firestore'; import firebaseConfig from '../firebase-applet-config.json'; import { createExecutionTimer, recordDiagnosticEvent } from './utils/security'; import { initClientAppCheckIfConfigured } from './utils/clientAppCheck';
export { prepareFirestorePayload } from './utils/security';
// Suppress noisy internal WebChannel 10s timeout logs on high-latency/proxy networks
try { setLogLevel('silent'); } catch {
  // Ignore if setLogLevel is unavailable in test environments
}
/**
 * Initialized Firebase App singleton configured from `firebase-applet-config.json`.
 */
export const app: FirebaseApp = initializeApp(firebaseConfig);
initClientAppCheckIfConfigured(app);
/**
 * Initialized Firestore database instance bound to `firebaseConfig.firestoreDatabaseId`
 * with automatic long-polling detection for restricted proxy/iframe environments.
 */
export const db: Firestore = (() => { const endTimer = createExecutionTimer('Firebase', 'initializeFirestore'); try { const instance = initializeFirestore(
      app, { experimentalAutoDetectLongPolling: true }, firebaseConfig.firestoreDatabaseId );
    endTimer('success'); return instance; } catch { endTimer('fallback');
    return getFirestore(app, firebaseConfig.firestoreDatabaseId); }
})();
/**
 * Firebase Authentication singleton instance.
 */
export const auth: Auth = getAuth(app);
/**
 * Configured Google OAuth Provider for popup sign-in.
 */
export const googleProvider: GoogleAuthProvider = (() => { const provider = new GoogleAuthProvider(); try { provider.setCustomParameters({ prompt: 'select_account' });
  } catch {
    // Ignore parameter setup issues
  }
  return provider; })();
/**
 * Standard Firestore CRUD operation types used for structured security rule diagnostics.
 */
export enum OperationType { CREATE = 'create',
  UPDATE = 'update', DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
/**
 * Structured error payload conforming to the Firebase Security Rules diagnostic specification.
 */
export interface FirestoreErrorInfo {
  /** Original error message returned by the Firestore SDK. */
  error: string;
  /** Operation type that triggered the failure. */
  operationType: OperationType;
  /** Collection or document path targeted by the operation. */
  path: string | null;
  /** Snapshot of the current user's authentication context at the moment of failure. */
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
import {
  beginConnectionProbeGeneration, classifyFirestoreError, completeConnectionProbeGeneration,
  getFirestoreOrthogonalStatus, getFirestoreStatusMicrocopyFa, getLegacyFirestoreConnectionState,
  resetFirestoreStatusForTests, setFirestoreWriteSyncState, subscribeFirestoreStatus,
  updateFirestoreSnapshotMetadata, type BackendConnectivityState, type DataOriginState,
  type FirestoreClassifiedError, type FirestoreErrorCategory, type FirestoreOrthogonalStatus, type WriteSyncState,
} from './utils/firestoreConnectionState';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './utils/areaUnit';

export {
  beginConnectionProbeGeneration, classifyFirestoreError, completeConnectionProbeGeneration,
  getFirestoreOrthogonalStatus, getFirestoreStatusMicrocopyFa, resetFirestoreStatusForTests,
  setFirestoreWriteSyncState, subscribeFirestoreStatus, updateFirestoreSnapshotMetadata,
  type BackendConnectivityState, type DataOriginState, type FirestoreClassifiedError,
  type FirestoreErrorCategory, type FirestoreOrthogonalStatus, type WriteSyncState,
};

/**
 * Returns the current Firestore reachability state ('connecting' | 'online' | 'offline_cache').
 * Derived from the orthogonal connectivity state so missing documents or permission-denied
 * responses are never misclassified as offline cache mode.
 */
export function getFirestoreConnectionState(): 'connecting' | 'online' | 'offline_cache' {
  return getLegacyFirestoreConnectionState();
}

export function getFirestoreStatusIntlSummary(areaUnit: AreaUnit = 'sqm', currency: IntlCurrencyCode = 'IRT') {
  return {
    connectionState: getLegacyFirestoreConnectionState(),
    microcopyFa: getFirestoreStatusMicrocopyFa(),
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(100, currency),
  };
}

export interface FirestoreErrorLogEntry extends FirestoreErrorInfo {
  id: string;
  timeFa: string;
  timestampMs: number;
}

const firestoreErrorLogs: FirestoreErrorLogEntry[] = [];
const MAX_ERROR_LOGS = 100;

export function recordFirestoreQueryError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorLogEntry {
  const errMsg = error instanceof Error ? error.message : String(error);
  const classified = classifyFirestoreError(error);
  if (
    operationType === OperationType.CREATE ||
    operationType === OperationType.UPDATE ||
    operationType === OperationType.DELETE ||
    operationType === OperationType.WRITE
  ) {
    setFirestoreWriteSyncState('failed', error);
  }

  const now = new Date();
  const timeFa = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry: FirestoreErrorLogEntry = {
    id: `fs-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    error: errMsg,
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    timeFa,
    timestampMs: Date.now(),
  };

  firestoreErrorLogs.unshift(entry);
  if (firestoreErrorLogs.length > MAX_ERROR_LOGS) {
    firestoreErrorLogs.pop();
  }

  recordDiagnosticEvent(
    'Firestore',
    `${operationType} (${classified.category}) on ${path ?? 'unknown'}: ${errMsg.slice(0, 80)}`,
    'fallback'
  );

  return entry;
}

export function getFirestoreErrorLogs(): FirestoreErrorLogEntry[] {
  return [...firestoreErrorLogs];
}

export function clearFirestoreErrorLogs(): void {
  firestoreErrorLogs.length = 0;
}

/**
 * Formats and throws a structured `FirestoreErrorInfo` JSON error whenever a Firestore operation fails.
 * Required by the Firebase Integration specification for diagnosing security rule denials.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const classified = classifyFirestoreError(error);
  const errEntry = recordFirestoreQueryError(error, operationType, path);
  const errInfo: FirestoreErrorInfo = {
    error: errEntry.error,
    operationType: errEntry.operationType,
    path: errEntry.path,
    authInfo: errEntry.authInfo,
  };

  if (!classified.impliesBackendOffline) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Tests initial server connectivity to Firestore on boot using `getDocFromServer` with a bounded timeout
 * and generation token so stale probes never overwrite newer state transitions.
 */
export async function testConnection(timeoutMs: number = 6000): Promise<boolean> {
  const endTimer = createExecutionTimer('Firebase', 'testConnection');
  const generation = beginConnectionProbeGeneration();
  const safeTimeoutMs = Math.max(250, Math.min(30_000, Number(timeoutMs) || 6000));

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('CONNECTION_TIMEOUT'));
      }, safeTimeoutMs);
      if (timeoutHandle && typeof timeoutHandle.unref === 'function') {
        timeoutHandle.unref();
      }
    });

    const snap = await Promise.race([
      getDocFromServer(doc(db, 'appConfig', 'featureFlags')),
      timeoutPromise,
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const dataOrigin = snap?.metadata?.fromCache ? 'firestore_cache' : 'server';
    completeConnectionProbeGeneration(generation, { ok: true, dataOrigin });
    endTimer('success');
    return true;
  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const classified = classifyFirestoreError(error);
    completeConnectionProbeGeneration(generation, { ok: false, error });
    if (classified.category === 'permission_denied' || classified.category === 'missing_document') {
      endTimer('success');
      return true;
    }
    endTimer('fallback');
    if (classified.impliesBackendOffline) {
      recordDiagnosticEvent('Firebase', 'Client operating in offline cache mode', 'fallback');
    }
    return false;
  }
}
// Run non-blocking connection verification on module load in client runtime
if (typeof window !== 'undefined' || (!process.env.VITEST && !process.argv?.some((a) => a.includes('test')))) {
  void testConnection();
}
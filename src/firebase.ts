/**
 * @fileoverview Firebase Auth-only client bootstrap (RT-DATA-001: no client Firestore SDK).
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { createExecutionTimer, recordDiagnosticEvent, sanitizePayload } from './utils/security';
import { initClientAppCheckIfConfigured, installClientAppCheckFetchInterceptor } from './utils/clientAppCheck';
import { CLIENT_FIRESTORE_FORBIDDEN } from './platform/data/clientDataPolicy';
import {
  beginConnectionProbeGeneration,
  classifyFirestoreError,
  completeConnectionProbeGeneration,
  getFirestoreOrthogonalStatus,
  getFirestoreStatusMicrocopyFa,
  getLegacyFirestoreConnectionState,
  resetFirestoreStatusForTests,
  setFirestoreWriteSyncState,
  subscribeFirestoreStatus,
  updateFirestoreSnapshotMetadata,
  type BackendConnectivityState,
  type DataOriginState,
  type FirestoreClassifiedError,
  type FirestoreErrorCategory,
  type FirestoreOrthogonalStatus,
  type WriteSyncState,
} from './utils/firestoreConnectionState';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './utils/areaUnit';

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
const viteAppCheckEnv: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
initClientAppCheckIfConfigured(app, {
  ...viteAppCheckEnv,
  VITE_FIREBASE_APP_CHECK_SITE_KEY: String(
    viteAppCheckEnv.VITE_FIREBASE_APP_CHECK_SITE_KEY ||
    viteAppCheckEnv.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ||
    firebaseConfig.recaptchaSiteKey ||
    '',
  ),
});
installClientAppCheckFetchInterceptor(app, async () => auth.currentUser ? auth.currentUser.getIdToken() : null);
export const googleProvider: GoogleAuthProvider = (() => {
  const provider = new GoogleAuthProvider();
  try {
    provider.setCustomParameters({ prompt: 'select_account' });
  } catch {
    /* ignore */
  }
  return provider;
})();

/** @deprecated Client Firestore is forbidden; retained only for legacy type surface. */
export type Firestore = never;
/** @deprecated Do not use — RT-DATA-001 */
export const db: Firestore = undefined as never;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: { providerId?: string | null; email?: string | null }[];
  };
}

export {
  beginConnectionProbeGeneration,
  classifyFirestoreError,
  completeConnectionProbeGeneration,
  getFirestoreOrthogonalStatus,
  getFirestoreStatusMicrocopyFa,
  resetFirestoreStatusForTests,
  setFirestoreWriteSyncState,
  subscribeFirestoreStatus,
  updateFirestoreSnapshotMetadata,
  type BackendConnectivityState,
  type DataOriginState,
  type FirestoreClassifiedError,
  type FirestoreErrorCategory,
  type FirestoreOrthogonalStatus,
  type WriteSyncState,
};

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

export function prepareFirestorePayload<T extends Record<string, unknown>>(data: T): T {
  const sanitized = sanitizePayload(data);
  if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    throw new Error('FIRESTORE_PAYLOAD_SANITIZATION_FAILED');
  }
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned as T;
}

export interface FirestoreErrorLogEntry extends FirestoreErrorInfo {
  id: string;
  timeFa: string;
  timestampMs: number;
}

const firestoreErrorLogs: FirestoreErrorLogEntry[] = [];
const MAX_ERROR_LOGS = 100;

export function recordFirestoreQueryError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorLogEntry {
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
  const entry: FirestoreErrorLogEntry = {
    id: `remote-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    timeFa: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestampMs: Date.now(),
  };
  firestoreErrorLogs.unshift(entry);
  if (firestoreErrorLogs.length > MAX_ERROR_LOGS) firestoreErrorLogs.pop();
  recordDiagnosticEvent('RemoteAPI', `${operationType} (${classified.category}) on ${path ?? 'unknown'}: ${errMsg.slice(0, 80)}`, 'fallback');
  return entry;
}

export function getFirestoreErrorLogs(): FirestoreErrorLogEntry[] {
  return [...firestoreErrorLogs];
}

export function clearFirestoreErrorLogs(): void {
  firestoreErrorLogs.length = 0;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errEntry = recordFirestoreQueryError(error, operationType, path);
  throw new Error(JSON.stringify({ error: errEntry.error, operationType: errEntry.operationType, path: errEntry.path, authInfo: errEntry.authInfo }));
}

/** Probes Express read API instead of client Firestore (RT-DATA-001). */
export async function testConnection(timeoutMs: number = 6000): Promise<boolean> {
  if (CLIENT_FIRESTORE_FORBIDDEN) {
    const endTimer = createExecutionTimer('RemoteAPI', 'testConnection');
    const generation = beginConnectionProbeGeneration();
    const safeTimeoutMs = Math.max(250, Math.min(30_000, Number(timeoutMs) || 6000));
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), safeTimeoutMs) : null;
    try {
      const res = await fetch('/api/market-pulse?city=tehran', { signal: controller?.signal, cache: 'no-store' });
      if (timer) clearTimeout(timer);
      const ok = res.ok;
      completeConnectionProbeGeneration(generation, { ok, dataOrigin: ok ? 'server' : 'unknown' });
      endTimer(ok ? 'success' : 'fallback');
      return ok;
    } catch (error) {
      if (timer) clearTimeout(timer);
      completeConnectionProbeGeneration(generation, { ok: false, error });
      endTimer('fallback');
      return false;
    }
  }
  return false;
}

if (typeof window !== 'undefined') {
  void testConnection();
}
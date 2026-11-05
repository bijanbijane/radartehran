import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type BackendConnectivityState = | 'connecting' | 'online' | 'offline' | 'unknown'; export type DataOriginState = | 'server'
  | 'firestore_cache'
  | 'unavailable'
  | 'unknown'; export type WriteSyncState = | 'no_pending_writes'
  | 'pending_writes'
  | 'committed'
  | 'failed'
  | 'unknown'; export type FirestoreErrorCategory = | 'network_unavailable'
  | 'backend_unavailable'
  | 'timeout'
  | 'permission_denied'
  | 'unauthenticated'
  | 'invalid_config'
  | 'missing_document'
  | 'unknown'; export interface FirestoreClassifiedError { category: FirestoreErrorCategory; code: string; message: string; impliesBackendOffline: boolean; } export interface FirestoreOrthogonalStatus { backendConnectivity: BackendConnectivityState; dataOrigin: DataOriginState; writeSync: WriteSyncState; lastErrorCategory: FirestoreErrorCategory | null; lastUpdatedAtMs: number; probeGeneration: number; }
export interface SnapshotMetadataLike { fromCache: boolean; hasPendingWrites: boolean; }
type StatusListener = (status: FirestoreOrthogonalStatus) => void; const currentStatus: FirestoreOrthogonalStatus = { backendConnectivity: 'connecting', dataOrigin: 'unknown', writeSync: 'no_pending_writes', lastErrorCategory: null, lastUpdatedAtMs: Date.now(), probeGeneration: 0,
}; const listeners = new Set<StatusListener>(); function emitStatusChange(): void { currentStatus.lastUpdatedAtMs = Date.now(); const snapshot: FirestoreOrthogonalStatus = { ...currentStatus }; for (const listener of listeners) { try { listener(snapshot);
    } catch { }
  } }
export function subscribeFirestoreStatus(listener: StatusListener): () => void { if (listeners.size < 200) listeners.add(listener); try { listener({ ...currentStatus });
  } catch { }
  return () => { listeners.delete(listener); }; }
export function getFirestoreOrthogonalStatus(): FirestoreOrthogonalStatus { return { ...currentStatus };
}
/**
 * Legacy-compatible single-string connection state getter (`'connecting' | 'online' | 'offline_cache'`).
 * Never returns `'offline_cache'` merely because a document was missing or permission was denied.
 */
export function getLegacyFirestoreConnectionState(): 'connecting' | 'online' | 'offline_cache' {
  if (currentStatus.backendConnectivity === 'connecting') {
    return 'connecting';
  }
  if (currentStatus.backendConnectivity === 'offline') {
    return 'offline_cache';
  }
  if (currentStatus.backendConnectivity === 'online') {
    return 'online';
  }
  return currentStatus.dataOrigin === 'firestore_cache' ? 'offline_cache' : 'online';
}
function safeExtractErrorMessage(error: unknown): string {
  let raw = '';
  if (error instanceof Error) raw = error.message;
  else if (typeof error === 'string') raw = error;
  else {
    try { raw = JSON.stringify(error ?? ''); } catch { raw = 'unserializable_error'; }
  }
  return raw
    .slice(0, 300)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED_API_KEY]');
}
/**
 * Classify a Firestore or network error into an explicit category.
 * Permission denials (`permission-denied`), unauthenticated requests (`unauthenticated`),
 * and missing documents (`not-found`) do NOT imply that the Firestore backend is offline.
 */
export function classifyFirestoreError(error: unknown): FirestoreClassifiedError {
  const rawCode =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code).toLowerCase().slice(0, 80)
      : '';
  const rawMessage = safeExtractErrorMessage(error);
  const lowerMsg = rawMessage.toLowerCase();
  if (rawCode.includes('permission-denied') || lowerMsg.includes('permission-denied') || lowerMsg.includes('missing or insufficient permissions')) {
    return { category: 'permission_denied', code: rawCode || 'permission-denied', message: rawMessage, impliesBackendOffline: false };
  }
  if (rawCode.includes('unauthenticated') || lowerMsg.includes('unauthenticated') || lowerMsg.includes('request had invalid authentication credentials')) {
    return { category: 'unauthenticated', code: rawCode || 'unauthenticated', message: rawMessage, impliesBackendOffline: false };
  }
  if (rawCode.includes('not-found') || lowerMsg.includes('no document to update') || lowerMsg.includes('document does not exist')) {
    return { category: 'missing_document', code: rawCode || 'not-found', message: rawMessage, impliesBackendOffline: false };
  }
  if (rawCode.includes('invalid-argument') || rawCode.includes('failed-precondition') || lowerMsg.includes('invalid-argument') || lowerMsg.includes('project_id') || lowerMsg.includes('api key not valid')) {
    return { category: 'invalid_config', code: rawCode || 'invalid-config', message: rawMessage, impliesBackendOffline: false };
  }
  if (rawCode.includes('deadline-exceeded') || lowerMsg.includes('connection_timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('deadline-exceeded')) {
    return { category: 'timeout', code: rawCode || 'deadline-exceeded', message: rawMessage, impliesBackendOffline: true };
  }
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('network request failed') || lowerMsg.includes('client is offline') || lowerMsg.includes('the client is offline')) {
    return { category: 'network_unavailable', code: rawCode || 'network-unavailable', message: rawMessage, impliesBackendOffline: true };
  }
  if (rawCode.includes('unavailable') || lowerMsg.includes('could not reach cloud firestore backend') || lowerMsg.includes('service unavailable')) {
    return { category: 'backend_unavailable', code: rawCode || 'unavailable', message: rawMessage, impliesBackendOffline: true };
  }
  return { category: 'unknown', code: rawCode || 'unknown', message: rawMessage, impliesBackendOffline: false };
}
/**
 * Begin a new connection probe generation.
 * Returns the monotonically increasing generation token so stale probes can be ignored.
 */
export function beginConnectionProbeGeneration(): number {
  currentStatus.probeGeneration += 1;
  if (currentStatus.backendConnectivity !== 'online') {
    currentStatus.backendConnectivity = 'connecting';
  }
  emitStatusChange();
  return currentStatus.probeGeneration;
}
/**
 * Record the result of a connection probe if `generation` matches the latest active probe.
 * Returns `true` if applied, or `false` if discarded as a stale probe result.
 */
export function completeConnectionProbeGeneration(
  generation: number,
  outcome:
    | { ok: true; dataOrigin?: DataOriginState }
    | { ok: false; error: unknown },
): boolean {
  if (generation < currentStatus.probeGeneration) {
    return false;
  }
  if (outcome.ok) {
    currentStatus.backendConnectivity = 'online';
    currentStatus.dataOrigin = outcome.dataOrigin ?? 'server';
    currentStatus.lastErrorCategory = null;
    emitStatusChange();
    return true;
  }
  const classified = classifyFirestoreError(outcome.error);
  currentStatus.lastErrorCategory = classified.category;
  if (classified.category === 'permission_denied' || classified.category === 'missing_document') {
    currentStatus.backendConnectivity = 'online';
    currentStatus.dataOrigin = 'server';
  } else if (classified.impliesBackendOffline) {
    currentStatus.backendConnectivity = 'offline';
    if (currentStatus.dataOrigin === 'unknown' || currentStatus.dataOrigin === 'server') {
      currentStatus.dataOrigin = 'firestore_cache';
    }
  } else {
    currentStatus.backendConnectivity = 'unknown';
  }
  emitStatusChange();
  return true;
}
/**
 * Update orthogonal state from a Firestore `DocumentSnapshot` or `QuerySnapshot` metadata object.
 */
export function updateFirestoreSnapshotMetadata(metadata?: SnapshotMetadataLike | null): void {
  if (!metadata || typeof metadata !== 'object') return;
  const fromCache = Boolean(metadata.fromCache);
  const hasPendingWrites = Boolean(metadata.hasPendingWrites);
  currentStatus.dataOrigin = fromCache ? 'firestore_cache' : 'server';
  if (!fromCache) {
    currentStatus.backendConnectivity = 'online';
  }
  if (hasPendingWrites) {
    currentStatus.writeSync = 'pending_writes';
  } else if (currentStatus.writeSync === 'pending_writes') {
    currentStatus.writeSync = 'committed';
  } else if (currentStatus.writeSync === 'unknown') {
    currentStatus.writeSync = 'no_pending_writes';
  }
  emitStatusChange();
}
/**
 * Explicitly record write lifecycle state for user mutations.
 */
export function setFirestoreWriteSyncState(state: WriteSyncState, error?: unknown): void {
  currentStatus.writeSync = state;
  if (error !== undefined) {
    const classified = classifyFirestoreError(error);
    currentStatus.lastErrorCategory = classified.category;
    if (classified.impliesBackendOffline) {
      currentStatus.backendConnectivity = 'offline';
    }
  }
  emitStatusChange();
}
/**
 * Return truthful Persian status microcopy for the current Firestore connectivity, cache, and write state.
 */
export function getFirestoreStatusMicrocopyFa(
  status: FirestoreOrthogonalStatus = currentStatus,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }
): {
  connectivityLabelFa: string;
  dataOriginLabelFa: string;
  writeSyncLabelFa: string;
  primaryBannerLabelFa: string;
  displayAreaUnitLabel: string;
  referenceValuationIntlText: string;
} {
  const connectivityLabelFa =
    status.backendConnectivity === 'connecting'
      ? 'در حال اتصال به سرور'
      : status.backendConnectivity === 'offline'
        ? 'اتصال به سرور برقرار نیست'
        : status.backendConnectivity === 'online'
          ? 'متصل به سرور ابری'
          : 'وضعیت اتصال نامشخص';
  const dataOriginLabelFa =
    status.dataOrigin === 'firestore_cache'
      ? 'نمایش اطلاعات ذخیره‌شده در دستگاه'
      : status.dataOrigin === 'server'
        ? 'اطلاعات زنده از سرور'
        : status.dataOrigin === 'unavailable'
          ? 'اطلاعات در دسترس نیست'
          : 'منبع داده در حال بررسی';
  const writeSyncLabelFa =
    status.writeSync === 'pending_writes'
      ? 'تغییرات در انتظار همگام‌سازی'
      : status.writeSync === 'committed'
        ? 'اطلاعات با موفقیت ذخیره شد'
        : status.writeSync === 'failed'
          ? 'خطا در ذخیره‌سازی تغییرات'
          : 'همگام‌سازی پایدار';
  let primaryBannerLabelFa = connectivityLabelFa;
  if (status.writeSync === 'pending_writes') {
    primaryBannerLabelFa = 'تغییرات در انتظار همگام‌سازی';
  } else if (status.backendConnectivity === 'offline' || status.dataOrigin === 'firestore_cache') {
    primaryBannerLabelFa = 'نمایش اطلاعات ذخیره‌شده در دستگاه';
  } else if (status.writeSync === 'committed') {
    primaryBannerLabelFa = 'اطلاعات با موفقیت ذخیره شد';
  }
  return {
    connectivityLabelFa,
    dataOriginLabelFa,
    writeSyncLabelFa,
    primaryBannerLabelFa,
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT'),
  }; }
/**
 * Reset state for deterministic unit testing.
 */
export function resetFirestoreStatusForTests(): void { currentStatus.backendConnectivity = 'connecting'; currentStatus.dataOrigin = 'unknown'; currentStatus.writeSync = 'no_pending_writes'; currentStatus.lastErrorCategory = null; currentStatus.probeGeneration = 0; emitStatusChange(); }
/** @file src/features/account/services/accountActionService.ts — Explicit Server Contracts, Schema Guards & 3-Layer Account Deletion */
import type { User as FirebaseUser } from 'firebase/auth';
import {
  cleanupAccountLocalStorageForUid,
  resolveEffectiveUid,
} from './accountStorageScope';
import { buildLocalWorkspaceExportBundle } from './accountWorkspaceService';
import {
  ACCOUNT_DELETION_LIFECYCLE_LABELS_FA,
  ALL_SEVEN_ACCOUNT_EXPORT_SOURCES,
  type AccountActionErrorCode,
  type AccountActionResult,
  type AccountDeleteLayerStatus,
  type AccountDeletionLifecycleState,
  type AccountExportScope,
  type DataRequestRecord,
  type ServerAccountDeletionPayload,
  type ServerAccountExportEnvelope,
} from '../types/account.types';

export const SUPPORTED_EXPORT_SCHEMA_VERSION = '2.0.0';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const SENSITIVE_EXPORT_FIELD_NAMES = new Set([
  'token',
  'idToken',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  'authorization',
  'apiKey',
]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

export function stripSecretsFromExportValue(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => stripSecretsFromExportValue(item, depth + 1));
  if (!isPlainRecord(value)) return value;
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_EXPORT_FIELD_NAMES.has(key)) continue;
    clean[key] = stripSecretsFromExportValue(val, depth + 1);
  }
  return clean;
}

export function isValidServerAccountExportResponse(
  raw: unknown,
  expectedUid?: string,
): raw is { status: 'ok'; exportData: ServerAccountExportEnvelope } {
  if (!isPlainRecord(raw) || raw.status !== 'ok' || !isPlainRecord(raw.exportData)) return false;
  const exp = raw.exportData;
  if (typeof exp.ownerUid !== 'string' || !exp.ownerUid.trim()) return false;
  if (expectedUid && exp.ownerUid !== expectedUid) return false;
  if (typeof exp.schemaVersion !== 'string') return false;
  return true;
}

export function isValidServerAccountDeletionResponse(raw: unknown): raw is ServerAccountDeletionPayload {
  if (!isPlainRecord(raw)) return false;
  if (raw.status !== 'ok' && raw.status !== 'partial') return false;
  if (!Array.isArray(raw.steps) || typeof raw.requiresClientAuthDeletion !== 'boolean') return false;
  if (!Array.isArray(raw.clearClientLocalStorageKeys)) return false;
  return true;
}

function mapHttpErrorCode(status: number): { code: AccountActionErrorCode; messageFa: string; retryable: boolean } {
  if (status === 401) {
    return {
      code: 'AUTH_REQUIRED',
      retryable: false,
      messageFa: 'نشست احراز هویت منقضی شده یا نامعتبر است؛ لطفاً دوباره وارد حساب خود شوید.',
    };
  }
  if (status === 403) {
    return {
      code: 'FORBIDDEN',
      retryable: false,
      messageFa: 'مجوز دسترسی به این عملیات برای حساب فعلی تأیید نشد.',
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      retryable: true,
      messageFa: 'تعداد درخواست‌ها بیش از حد مجاز بوده است؛ لطفاً چند لحظه بعد دوباره تلاش کنید.',
    };
  }
  return {
    code: 'SERVER_ERROR',
    retryable: status >= 500,
    messageFa: `سرور با خطای غیرمنتظره (کد ${status}) پاسخ داد.`,
  };
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<{ res: Response; json: unknown }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(url, controller ? { ...init, signal: controller.signal } : init);
    const json = await res.json().catch(() => null);
    return { res, json };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function requestAccountServerExport(params: {
  getToken: () => Promise<string | null>;
  expectedUid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<AccountActionResult<ServerAccountExportEnvelope>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let token: string | null = null;
  try {
    token = await params.getToken();
  } catch {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'دریافت توکن احراز هویت انجام نشد؛ لطفاً دوباره وارد شوید.' };
  }
  if (!token || !token.trim()) {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'توکن معتبر احراز هویت در دسترس نیست.' };
  }

  try {
    const { res, json } = await fetchJsonWithTimeout(
      '/api/account/export-data',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      fetchFn,
      timeoutMs,
    );
    if (!res.ok) {
      const mapped = mapHttpErrorCode(res.status);
      return { ok: false, code: mapped.code, httpStatus: res.status, retryable: mapped.retryable, messageFa: mapped.messageFa };
    }
    if (!isValidServerAccountExportResponse(json, params.expectedUid)) {
      const ownerMismatch = isPlainRecord(json) && isPlainRecord(json.exportData) && typeof json.exportData.ownerUid === 'string' && json.exportData.ownerUid !== params.expectedUid;
      return {
        ok: false,
        code: ownerMismatch ? 'OWNER_MISMATCH' : 'INVALID_RESPONSE',
        retryable: false,
        messageFa: ownerMismatch
          ? 'مالک داده دریافتی با حساب فعال مطابقت ندارد و دانلود متوقف شد.'
          : 'پاسخ دریافتی از سرور دارای ساختار معتبر خروجی حساب نیست.',
      };
    }
    if (json.exportData.schemaVersion !== SUPPORTED_EXPORT_SCHEMA_VERSION && json.exportData.schemaVersion !== '2026-05.account-export.v1') {
      return {
        ok: false,
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        retryable: false,
        messageFa: `نسخه ساختار خروجی سرور (${json.exportData.schemaVersion}) توسط این نسخه پشتیبانی نمی‌شود.`,
      };
    }
    return { ok: true, data: json.exportData };
  } catch (err: unknown) {
    const isAbort = Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError');
    return {
      ok: false,
      code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      retryable: true,
      messageFa: isAbort ? 'زمان انتظار پاسخ سرور برای دریافت خروجی به پایان رسید.' : 'ارتباط شبکه با سرور برقرار نشد.',
    };
  }
}

export function buildAccountExportDownloadPayload(params: {
  serverData: ServerAccountExportEnvelope;
  uid: string;
  includeLocalWorkspace: boolean;
}): {
  scope: AccountExportScope;
  payload: Record<string, unknown>;
  isPartialExport: boolean;
  completenessStatus: 'COMPLETE' | 'INCOMPLETE_PARTIAL';
  completenessBannerFa: string;
  totalRecordsExported: number;
  omittedPagesCount: number;
  unavailableSources: string[];
} {
  const scopeUid = resolveEffectiveUid(params.uid);
  const scope: AccountExportScope = params.includeLocalWorkspace ? 'combined_account_and_workspace' : 'server_account';
  const cleanServer = stripSecretsFromExportValue(params.serverData) as Record<string, unknown>;
  const unavailableSources = Array.isArray(params.serverData.unavailableSources) ? [...params.serverData.unavailableSources] : [];
  const omittedPagesCount = Math.max(0, Number(params.serverData.omittedPagesCount || 0));
  const isPartialExport =
    Boolean(params.serverData.isPartialExport) ||
    params.serverData.completenessStatus === 'INCOMPLETE_PARTIAL' ||
    unavailableSources.length > 0 ||
    omittedPagesCount > 0;
  const completenessStatus: 'COMPLETE' | 'INCOMPLETE_PARTIAL' = isPartialExport ? 'INCOMPLETE_PARTIAL' : 'COMPLETE';
  const completenessBannerFa = isPartialExport
    ? `خروجی ناقص (INCOMPLETE_PARTIAL): برخی منابع (${unavailableSources.join('، ') || 'صفحات جاافتاده'}) در دسترس نبودند و این فایل شامل تمام اطلاعات حساب نیست.`
    : 'خروجی کامل (COMPLETE): هر هفت منبع رسمی داده حساب کاربری بدون خطا دریافت شد.';
  const localBundle = params.includeLocalWorkspace ? (stripSecretsFromExportValue(buildLocalWorkspaceExportBundle(scopeUid)) as Record<string, unknown>) : null;
  const totalRecordsExported =
    typeof params.serverData.totalRecordsExported === 'number'
      ? params.serverData.totalRecordsExported
      : (params.serverData.publishedListings?.length || 0) +
        (params.serverData.savedAlerts?.length || 0) +
        (params.serverData.favoriteNeighborhoodKeys?.length || 0) +
        (params.serverData.mediaObjects?.length || 0);

  return {
    scope,
    isPartialExport,
    completenessStatus,
    completenessBannerFa,
    totalRecordsExported,
    omittedPagesCount,
    unavailableSources,
    payload: {
      schemaVersion: SUPPORTED_EXPORT_SCHEMA_VERSION,
      exportScope: scope,
      exportedAtIso: new Date().toISOString(),
      ownerUid: scopeUid,
      isPartialExport,
      completenessStatus,
      completenessBannerFa,
      totalRecordsExported,
      omittedPagesCount,
      unavailableSources,
      canonicalSevenDomainSources: ALL_SEVEN_ACCOUNT_EXPORT_SOURCES,
      serverAccountData: {
        origin: 'server',
        includedSources: Array.isArray(params.serverData.sources)
          ? params.serverData.sources
          : ALL_SEVEN_ACCOUNT_EXPORT_SOURCES.map((id) => ({ id, origin: 'server', available: !unavailableSources.includes(id) })),
        excludedSources: Array.isArray(params.serverData.excludedSources)
          ? params.serverData.excludedSources
          : params.includeLocalWorkspace
            ? ['firebase_auth_credentials_and_tokens', 'server_audit_logs_anonymized']
            : ['local_workspace_browser_storage', 'firebase_auth_credentials_and_tokens'],
        data: cleanServer,
      },
      localWorkspaceData: localBundle ? { origin: 'local_workspace', data: localBundle.localWorkspaceData ?? localBundle } : null,
    },
  };
}

export async function fetchServerAccountDataRequests(params: {
  getToken: () => Promise<string | null>;
  expectedUid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<AccountActionResult<DataRequestRecord[]>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let token: string | null = null;
  try {
    token = await params.getToken();
  } catch {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'توکن احراز هویت برای دریافت تاریخچه سرور در دسترس نیست.' };
  }
  if (!token) return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'توکن احراز هویت نامعتبر است.' };
  try {
    const { res, json } = await fetchJsonWithTimeout(
      '/api/account/data-requests',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      fetchFn,
      timeoutMs,
    );
    if (!res.ok) {
      const mapped = mapHttpErrorCode(res.status);
      return { ok: false, code: mapped.code, httpStatus: res.status, retryable: mapped.retryable, messageFa: mapped.messageFa };
    }
    const rawItems = isPlainRecord(json) && Array.isArray(json.items) ? json.items : [];
    const items: DataRequestRecord[] = rawItems
      .filter((r): r is Record<string, unknown> => isPlainRecord(r) && (!r.ownerUserId || r.ownerUserId === params.expectedUid))
      .map((r, idx) => ({
        id: typeof r.id === 'string' && r.id.trim() ? r.id : `srv-dreq-${idx}`,
        ownerUserId: params.expectedUid,
        kind: r.kind === 'delete' ? 'delete' : 'export',
        status: r.status === 'completed' || r.status === 'failed' || r.status === 'ready' ? r.status : 'pending_verification',
        origin: 'server',
        jobId: typeof r.jobId === 'string' ? r.jobId : undefined,
        retentionNotesFa: typeof r.retentionNotesFa === 'string' ? r.retentionNotesFa : 'ثبت‌شده در تاریخچه معتبر سرور',
        createdAtIso: typeof r.createdAtIso === 'string' ? r.createdAtIso : new Date().toISOString(),
      }));
    return { ok: true, data: items };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', retryable: true, messageFa: 'خطا در دریافت تاریخچه درخواست‌های داده از سرور.' };
  }
}

export async function executeAccountDeletionFlow(params: {
  currentUser: Pick<FirebaseUser, 'uid' | 'getIdToken'>;
  deleteFirebaseUserFn?: (user: Pick<FirebaseUser, 'uid'>) => Promise<void>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  ownedBargainIds?: string[];
}): Promise<AccountActionResult<AccountDeleteLayerStatus>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const targetUid = params.currentUser.uid;
  let token: string | null = null;
  try {
    token = await params.currentUser.getIdToken();
  } catch {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'اعتبارسنجی نشست برای حذف حساب انجام نشد؛ لطفاً دوباره وارد شوید.' };
  }
  if (!token) return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'توکن احراز هویت معتبر در دسترس نیست.' };

  let serverPayload: ServerAccountDeletionPayload;
  try {
    const { res, json } = await fetchJsonWithTimeout(
      '/api/account/delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmDelete: true, ...(params.ownedBargainIds?.length ? { ownedBargainIds: params.ownedBargainIds } : {}) }),
      },
      fetchFn,
      timeoutMs,
    );
    if (!res.ok) {
      const mapped = mapHttpErrorCode(res.status);
      return { ok: false, code: mapped.code, httpStatus: res.status, retryable: mapped.retryable, messageFa: mapped.messageFa };
    }
    if (!isValidServerAccountDeletionResponse(json)) {
      return { ok: false, code: 'INVALID_RESPONSE', retryable: false, messageFa: 'پاسخ سرور برای وضعیت حذف حساب قابل راستی‌آزمایی نیست.' };
    }
    serverPayload = json;
  } catch (err: unknown) {
    const isAbort = Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError');
    return {
      ok: false,
      code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      retryable: true,
      messageFa: isAbort ? 'مهلت پاسخ سرور برای حذف حساب به پایان رسید.' : 'ارتباط شبکه با سرور برای حذف حساب برقرار نشد.',
    };
  }

  // Stage 19 P0 Guard: Verify ALL dependent server steps and media cleanup succeeded before local storage cleanup or Firebase Auth removal.
  const allDependentServerStepsCompleted =
    serverPayload.status === 'ok' &&
    (serverPayload.failedSteps?.length ?? 0) === 0 &&
    (serverPayload.failedMediaCount ?? 0) === 0 &&
    serverPayload.steps.filter((s) => s.category !== 'firebase_auth_identity').every((s) => s.completed === true);

  if (!allDependentServerStepsCompleted) {
    const partialState: AccountDeletionLifecycleState = serverPayload.lifecycleState || 'PARTIAL_FAILURE_RETRYABLE';
    const partialLayer: AccountDeleteLayerStatus = {
      jobId: serverPayload.jobId,
      lifecycleState: partialState,
      lifecycleLabelFa: ACCOUNT_DELETION_LIFECYCLE_LABELS_FA[partialState],
      serverDeletion: 'partial',
      localCleanup: 'skipped_server_incomplete',
      authDeletion: 'blocked_by_incomplete_server_steps',
      overallStatus: 'partial',
      requestStatus: 'pending_verification',
      removedLocalKeysCount: 0,
      messageFa: 'عملیات حذف در سرور به‌صورت جزئی متوقف شد (PARTIAL_FAILURE_RETRYABLE)؛ برای جلوگیری از ازدست‌رفتن امکان پیگیری، اطلاعات محلی و هویت Firebase حذف نشدند.',
      requiresSignOut: false,
    };
    return {
      ok: false,
      code: 'AUTH_DELETION_PRECONDITION_FAILED',
      retryable: true,
      messageFa: partialLayer.messageFa,
      data: partialLayer,
    };
  }

  let authDeletionState: AccountDeleteLayerStatus['authDeletion'] = serverPayload.requiresClientAuthDeletion ? 'completed' : 'not_required';
  let errorCode: AccountActionErrorCode | undefined;
  let noticeFa = 'حذف داده‌های سرور، پاکسازی فضای کاری این حساب در مرورگر و حذف حساب احراز هویت کامل شد.';

  if (serverPayload.requiresClientAuthDeletion) {
    if (!params.deleteFirebaseUserFn) {
      authDeletionState = 'failed';
      errorCode = 'AUTH_DELETE_FAILED';
      noticeFa = 'مراحل وابسته سرور تکمیل شد، اما سرویس حذف حساب احراز هویت در مرورگر در دسترس نیست.';
    } else {
      try {
        await params.deleteFirebaseUserFn(params.currentUser);
      } catch (authErr: unknown) {
        const errCode = (authErr as { code?: string })?.code || '';
        if (errCode === 'auth/requires-recent-login') {
          authDeletionState = 'requires_reauth';
          errorCode = 'RECENT_LOGIN_REQUIRED';
          noticeFa = 'مراحل وابسته سرور تکمیل شد، اما برای حذف نهایی هویت Firebase به‌دلیل قدیمی‌بودن نشست، یک‌بار خارج شده و دوباره وارد شوید و عملیات حذف را تکمیل کنید.';
        } else {
          authDeletionState = 'failed';
          errorCode = 'AUTH_DELETE_FAILED';
          noticeFa = 'مراحل وابسته سرور تکمیل شد، اما حذف نهایی حساب احراز هویت انجام نشد. لطفاً پس از ورود مجدد دوباره امتحان کنید.';
        }
      }
    }
  }

  const allCompleted = authDeletionState === 'completed' || authDeletionState === 'not_required';
  const cleanupResult = allCompleted
    ? cleanupAccountLocalStorageForUid(targetUid, serverPayload.clearClientLocalStorageKeys)
    : { removedKeys: [] as string[] };
  const finalLifecycleState: AccountDeletionLifecycleState = allCompleted ? 'COMPLETED' : 'DELETING_AUTH_IDENTITY';
  const layerStatus: AccountDeleteLayerStatus = {
    jobId: serverPayload.jobId,
    lifecycleState: finalLifecycleState,
    lifecycleLabelFa: ACCOUNT_DELETION_LIFECYCLE_LABELS_FA[finalLifecycleState],
    serverDeletion: 'completed',
    localCleanup: allCompleted ? 'completed' : 'skipped_server_incomplete',
    authDeletion: authDeletionState,
    overallStatus: allCompleted ? 'completed' : 'partial',
    requestStatus: allCompleted ? 'completed' : 'pending_verification',
    removedLocalKeysCount: cleanupResult.removedKeys.length,
    messageFa: noticeFa,
    requiresSignOut: allCompleted,
  };

  if (allCompleted) return { ok: true, data: layerStatus };
  return {
    ok: false,
    code: errorCode || 'SERVER_ERROR',
    retryable: true,
    messageFa: noticeFa,
    data: layerStatus,
  };
}


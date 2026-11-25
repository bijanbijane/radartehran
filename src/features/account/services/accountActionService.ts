/** @file src/features/account/services/accountActionService.ts — Explicit Server Contracts, Schema Guards & 3-Layer Account Deletion */
import type { AuthUserSnapshot } from '../../../platform/auth';
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
  if (typeof raw.ok !== 'boolean' || typeof raw.statusCode !== 'number') return false;
  if (typeof raw.jobId !== 'string' || !raw.jobId.trim() || typeof raw.code !== 'string') return false;
  if (!['INITIATED', 'BLOCKED_LEGAL_HOLD', 'PENDING_PERMIT_DRAIN', 'PENDING_RESEARCH_ERASURE', 'COMPLETED', 'FAILED'].includes(String(raw.status))) return false;
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
  currentUser: Pick<AuthUserSnapshot, 'uid'>;
  expectedUid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<AccountActionResult<ServerAccountExportEnvelope>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!params.currentUser?.uid || params.currentUser.uid !== params.expectedUid) {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'نشست حساب کاربری معتبر نیست؛ دوباره وارد شوید.' };
  }

  try {
    const { res, json } = await fetchJsonWithTimeout(
      '/api/account/export-data',
      { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } },
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
            ? ['authentication_credentials_and_session_secrets', 'server_audit_logs_anonymized']
            : ['local_workspace_browser_storage', 'authentication_credentials_and_session_secrets'],
        data: cleanServer,
      },
      localWorkspaceData: localBundle ? { origin: 'local_workspace', data: localBundle.localWorkspaceData ?? localBundle } : null,
    },
  };
}

export async function fetchServerAccountDataRequests(params: {
  currentUser: Pick<AuthUserSnapshot, 'uid'>;
  expectedUid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<AccountActionResult<DataRequestRecord[]>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!params.currentUser?.uid || params.currentUser.uid !== params.expectedUid) {
    return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'نشست حساب کاربری برای دریافت تاریخچه معتبر نیست.' };
  }
  try {
    const { res, json } = await fetchJsonWithTimeout(
      '/api/account/data-requests',
      { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } },
      fetchFn,
      timeoutMs,
    );
    if (!res.ok) {
      const mapped = mapHttpErrorCode(res.status);
      return { ok: false, code: mapped.code, httpStatus: res.status, retryable: mapped.retryable, messageFa: mapped.messageFa };
    }
    const rawItems = isPlainRecord(json) && Array.isArray(json.requests) ? json.requests : isPlainRecord(json) && Array.isArray(json.items) ? json.items : [];
    const items: DataRequestRecord[] = rawItems
      .filter((r): r is Record<string, unknown> => isPlainRecord(r) && (!r.uid || r.uid === params.expectedUid) && (!r.ownerUserId || r.ownerUserId === params.expectedUid))
      .map((r, idx) => ({
        id: typeof r.id === 'string' && r.id.trim() ? r.id : typeof r.requestId === 'string' ? r.requestId : `srv-dreq-${idx}`,
        ownerUserId: params.expectedUid,
        kind: r.kind === 'delete' || r.requestType === 'ERASURE' ? 'delete' : 'export',
        status: r.status === 'completed' || r.status === 'failed' || r.status === 'ready' ? r.status : 'pending_verification',
        origin: 'server',
        jobId: typeof r.jobId === 'string' ? r.jobId : typeof r.requestId === 'string' ? r.requestId : undefined,
        retentionNotesFa: typeof r.retentionNotesFa === 'string' ? r.retentionNotesFa : undefined,
        createdAtIso: typeof r.createdAtIso === 'string' ? r.createdAtIso : typeof r.requestedAtIso === 'string' ? r.requestedAtIso : new Date().toISOString(),
      }));
    return { ok: true, data: items };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', retryable: true, messageFa: 'خطا در دریافت تاریخچه درخواست‌های داده از سرور.' };
  }
}

export async function executeAccountDeletionFlow(params: {
  currentUser: Pick<AuthUserSnapshot, 'uid'>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  idempotencyKey?: string;
}): Promise<AccountActionResult<AccountDeleteLayerStatus>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const targetUid = params.currentUser.uid;
  if (!targetUid) return { ok: false, code: 'AUTH_REQUIRED', retryable: false, messageFa: 'نشست حساب کاربری معتبر نیست.' };

  let payload: ServerAccountDeletionPayload;
  let response: Response;
  try {
    const result = await fetchJsonWithTimeout(
      '/api/account/deletion-requests',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          // Stable per account so a network retry reuses the same deletion job.
          'Idempotency-Key': params.idempotencyKey || `del_${targetUid.slice(0, 120)}_v1`,
        },
        body: JSON.stringify({ reason: 'USER_REQUESTED_ERASURE' }),
      },
      fetchFn,
      timeoutMs,
    );
    response = result.res;
    if (!isValidServerAccountDeletionResponse(result.json)) {
      if (!response.ok) {
        const mapped = mapHttpErrorCode(response.status);
        return { ok: false, code: mapped.code, httpStatus: response.status, retryable: mapped.retryable, messageFa: mapped.messageFa };
      }
      return { ok: false, code: 'INVALID_RESPONSE', retryable: false, messageFa: 'پاسخ سرویس حذف حساب با قرارداد Cloudflare D1 مطابقت ندارد.' };
    }
    payload = result.json;
  } catch (err: unknown) {
    const isAbort = Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError');
    return {
      ok: false,
      code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      retryable: true,
      messageFa: isAbort ? 'مهلت پاسخ سرویس حذف حساب به پایان رسید.' : 'ارتباط با سرویس حذف حساب برقرار نشد.',
    };
  }

  const completed = payload.status === 'COMPLETED';
  const authDisabled = payload.status === 'PENDING_RESEARCH_ERASURE' || completed;
  const lifecycleState: AccountDeletionLifecycleState =
    completed ? 'COMPLETED'
      : payload.status === 'BLOCKED_LEGAL_HOLD' ? 'BLOCKED_MANUAL_REVIEW'
        : payload.status === 'PENDING_PERMIT_DRAIN' ? 'INITIATED_WRITE_BLOCKED'
          : payload.status === 'PENDING_RESEARCH_ERASURE' ? 'PURGING_DEPENDENT_RECORDS'
            : 'PARTIAL_FAILURE_RETRYABLE';

  const cleanupResult = authDisabled
    ? cleanupAccountLocalStorageForUid(targetUid)
    : { removedKeys: [] as string[] };
  const layerStatus: AccountDeleteLayerStatus = {
    jobId: payload.jobId,
    lifecycleState,
    lifecycleLabelFa: ACCOUNT_DELETION_LIFECYCLE_LABELS_FA[lifecycleState],
    serverDeletion: completed ? 'completed' : payload.status === 'FAILED' ? 'failed' : 'partial',
    localCleanup: authDisabled ? 'completed' : 'skipped_server_incomplete',
    authDeletion: authDisabled ? 'completed' : payload.status === 'FAILED' ? 'failed' : 'not_required',
    overallStatus: completed ? 'completed' : payload.status === 'FAILED' ? 'failed' : 'partial',
    requestStatus: completed ? 'completed' : 'pending_verification',
    removedLocalKeysCount: cleanupResult.removedKeys.length,
    messageFa: completed
      ? 'حذف حساب در Cloudflare D1 تکمیل شد؛ نشست‌ها باطل و داده‌های وابسته و پژوهشی تعیین تکلیف شدند.'
      : payload.status === 'BLOCKED_LEGAL_HOLD'
        ? 'حذف حساب به‌دلیل نگهداری قانونی مسدود شد و نیازمند بررسی مجاز است.'
        : payload.status === 'PENDING_PERMIT_DRAIN'
          ? 'درخواست حذف ثبت شد؛ عملیات تا پایان تراکنش‌های فعال متوقف مانده است.'
          : payload.status === 'PENDING_RESEARCH_ERASURE'
            ? 'حساب غیرفعال و نشست‌ها باطل شدند؛ پاکسازی داده‌های پژوهشی در صف ادامه دارد.'
            : 'عملیات حذف حساب کامل نشد؛ وضعیت و کد خطا در سابقه سرور ثبت شده است.',
    requiresSignOut: authDisabled,
  };

  if (completed) return { ok: true, data: layerStatus };
  return {
    ok: false,
    code: payload.status === 'BLOCKED_LEGAL_HOLD' ? 'FORBIDDEN' : 'SERVER_ERROR',
    httpStatus: response.status,
    retryable: payload.status !== 'BLOCKED_LEGAL_HOLD' && payload.status !== 'FAILED',
    messageFa: layerStatus.messageFa,
    data: layerStatus,
  };
}

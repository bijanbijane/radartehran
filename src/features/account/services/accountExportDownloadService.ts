/** @file src/features/account/services/accountExportDownloadService.ts — Safe JSON File Serialization, Sanitized Naming & Delayed ObjectURL Revocation */
import type { AccountExportScope } from '../types/account.types';

export interface AccountDownloadResult {
  ok: boolean;
  fileName: string;
  code?: 'SERIALIZATION_FAILED' | 'BLOB_CREATE_FAILED' | 'DOWNLOAD_UNAVAILABLE' | 'DOM_CLICK_FAILED';
  messageFa?: string;
  cancelRevokeTimer?: () => void;
}

export interface DownloadRuntimeDeps {
  windowRef?: Pick<Window, 'setTimeout' | 'clearTimeout'>;
  documentRef?: Pick<Document, 'createElement' | 'body'>;
  urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  blobCtor?: typeof Blob;
}

export function sanitizeDownloadFileName(rawName: string): string {
  const withoutDirs = String(rawName || '').replace(/[\\/]+/g, '-');
  const asciiSafe = withoutDirs
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  const strippedExt = asciiSafe.replace(/\.json$/i, '').slice(0, 64).replace(/^[.-]+|[.-]+$/g, '');
  if (!strippedExt) return 'radar-account-export.json';
  return `${strippedExt}.json`;
}

export function buildSafeExportFileName(scope: AccountExportScope, _uid?: string | null): string {
  if (scope === 'local_workspace') return 'radar-local-workspace-export.json';
  if (scope === 'combined_account_and_workspace') return 'radar-combined-account-export.json';
  return 'radar-server-account-export.json';
}

export function downloadJsonPayloadFile(
  payload: unknown,
  options: {
    fileName?: string;
    scope?: AccountExportScope;
    revokeDelayMs?: number;
    deps?: DownloadRuntimeDeps;
  } = {},
): AccountDownloadResult {
  const scope: AccountExportScope = options.scope || 'server_account';
  const fileName = sanitizeDownloadFileName(options.fileName || buildSafeExportFileName(scope));
  const revokeDelayMs = typeof options.revokeDelayMs === 'number' && options.revokeDelayMs >= 50 ? options.revokeDelayMs : 1500;

  let jsonText = '';
  try {
    jsonText = JSON.stringify(payload, null, 2);
    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return {
        ok: false,
        fileName,
        code: 'SERIALIZATION_FAILED',
        messageFa: 'آماده‌سازی فایل JSON خروجی ناموفق بود.',
      };
    }
  } catch {
    return {
      ok: false,
      fileName,
      code: 'SERIALIZATION_FAILED',
      messageFa: 'ساختار داده خروجی قابل تبدیل به JSON معتبر نیست.',
    };
  }

  const win = options.deps?.windowRef ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = options.deps?.documentRef ?? (typeof document !== 'undefined' ? document : undefined);
  const urlApi = options.deps?.urlApi ?? (typeof URL !== 'undefined' ? URL : undefined);
  const BlobImpl = options.deps?.blobCtor ?? (typeof Blob !== 'undefined' ? Blob : undefined);

  if (!doc || !urlApi || typeof urlApi.createObjectURL !== 'function' || typeof urlApi.revokeObjectURL !== 'function' || !BlobImpl) {
    return {
      ok: false,
      fileName,
      code: 'DOWNLOAD_UNAVAILABLE',
      messageFa: 'امکان دانلود فایل در محیط فعلی مرورگر در دسترس نیست.',
    };
  }

  let objectUrl = '';
  try {
    const blob = new BlobImpl([jsonText], { type: 'application/json;charset=utf-8' });
    objectUrl = urlApi.createObjectURL(blob);
    if (!objectUrl) {
      return {
        ok: false,
        fileName,
        code: 'BLOB_CREATE_FAILED',
        messageFa: 'ساخت پیوند موقت دانلود فایل با خطا مواجه شد.',
      };
    }
  } catch {
    return {
      ok: false,
      fileName,
      code: 'BLOB_CREATE_FAILED',
      messageFa: 'ایجاد فایل قابل دانلود در حافظه مرورگر انجام نشد.',
    };
  }

  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = doc.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener noreferrer';
    if (anchor.style) anchor.style.display = 'none';
    if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(anchor);
    }
    anchor.click();
  } catch {
    try {
      urlApi.revokeObjectURL(objectUrl);
    } catch { /* ignore */ }
    return {
      ok: false,
      fileName,
      code: 'DOM_CLICK_FAILED',
      messageFa: 'مرورگر اجازه شروع دانلود خودکار فایل را نداد.',
    };
  } finally {
    try {
      if (anchor && typeof anchor.remove === 'function') anchor.remove();
      else if (anchor && doc.body && typeof doc.body.removeChild === 'function' && anchor.parentNode === doc.body) {
        doc.body.removeChild(anchor);
      }
    } catch { /* ignore cleanup failure */ }
  }

  let timerHandle: number | ReturnType<typeof setTimeout> | null = null;
  const setTimer = win?.setTimeout?.bind(win) ?? setTimeout;
  const clearTimer = win?.clearTimeout?.bind(win) ?? clearTimeout;
  timerHandle = setTimer(() => {
    timerHandle = null;
    try {
      urlApi.revokeObjectURL(objectUrl);
    } catch { /* ignore */ }
  }, revokeDelayMs);

  return {
    ok: true,
    fileName,
    cancelRevokeTimer: () => {
      if (timerHandle !== null) {
        clearTimer(timerHandle as number);
        timerHandle = null;
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch { /* ignore */ }
      }
    },
  };
}

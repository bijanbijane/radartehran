/** @file src/platform/api/client/responseParser.ts — Safe JSON/HTML Response Parser (Never Crashes on Non-JSON 502/HTML) */
import { truncateUtf8Safe } from '../../../shared/utilities';
import { MAX_API_ERROR_MESSAGE_BYTES } from './requestConfig';

export interface ParsedApiResponse<T = unknown> {
  readonly ok: boolean;
  readonly status: number;
  readonly data?: T;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly lockReasonFa?: string;
  readonly featureDisabled?: boolean;
  readonly retryAfterSeconds?: number;
}

export async function parsePlatformHttpResponse<T = unknown>(response: Response): Promise<ParsedApiResponse<T>> {
  const status = response.status;
  if (status === 204) {
    return { ok: true, status, data: null as unknown as T };
  }
  const contentType = (response.headers?.get?.('content-type') || '').toLowerCase();
  const retryAfterHeader = response.headers?.get?.('retry-after');
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    rawText = '';
  }

  if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      if (response.ok) {
        return { ok: true, status, data: parsed as T };
      }
      const errMsg = truncateUtf8Safe(
        String(parsed.error || parsed.message || parsed.messageFa || `HTTP ${status}`),
        MAX_API_ERROR_MESSAGE_BYTES,
      );
      return {
        ok: false,
        status,
        errorCode: typeof parsed.code === 'string' ? parsed.code : `HTTP_${status}`,
        errorMessage: errMsg,
        lockReasonFa: typeof parsed.lockReasonFa === 'string' ? parsed.lockReasonFa : undefined,
        featureDisabled: Boolean(parsed.featureDisabled || parsed.code === 'FEATURE_DISABLED'),
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      };
    } catch {
      // Fall through to non-JSON handling
    }
  }

  if (response.ok) {
    return { ok: true, status, data: (rawText ? (rawText as unknown as T) : (null as unknown as T)) };
  }

  const safeFallbackMessage = rawText.trim().startsWith('<')
    ? `پاسخ غیرمنتظره سرور (HTTP ${status})`
    : truncateUtf8Safe(rawText || `HTTP ${status}`, MAX_API_ERROR_MESSAGE_BYTES);

  return {
    ok: false,
    status,
    errorCode: `HTTP_${status}`,
    errorMessage: safeFallbackMessage,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
  };
}

export async function parseApiResponse<T = unknown>(response: Response): Promise<T> {
  if (response.status === 204) return null as unknown as T;
  const parsed = await parsePlatformHttpResponse<T>(response);
  return (parsed.data ?? null) as T;
}

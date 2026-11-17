/** @file src/platform/api/interceptors/errorInterceptor.ts — HTTP Status to Normalized Error Interceptor */
import { reportNormalizedError } from '../../error-handling';
import { RadarPlatformApiError } from '../client/apiError';
import type { ParsedApiResponse } from '../client/responseParser';

export function interceptFailedApiResponse(
  parsed: ParsedApiResponse<unknown>,
  correlationId: string,
): RadarPlatformApiError {
  const apiErr = RadarPlatformApiError.fromResponseOrError({
    error: parsed.errorMessage || `HTTP ${parsed.status}`,
    status: parsed.status,
    correlationId,
    retryAfterSeconds: parsed.retryAfterSeconds,
    lockReasonFa: parsed.lockReasonFa,
    featureDisabled: parsed.featureDisabled,
  });
  reportNormalizedError(apiErr.normalized);
  return apiErr;
}

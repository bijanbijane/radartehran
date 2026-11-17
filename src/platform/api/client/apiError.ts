/** @file src/platform/api/client/apiError.ts — Standardized API Error Model (Max 2 KB Message) */
import { normalizeFrontendError, type NormalizedFrontendError } from '../../error-handling';

export class RadarPlatformApiError extends Error {
  public readonly normalized: NormalizedFrontendError;

  constructor(normalized: NormalizedFrontendError) {
    super(normalized.userMessageFa);
    this.name = 'RadarPlatformApiError';
    this.normalized = normalized;
  }

  static fromResponseOrError(params: {
    readonly error: unknown;
    readonly status?: number;
    readonly correlationId?: string;
    readonly retryAfterSeconds?: number;
    readonly lockReasonFa?: string;
    readonly featureDisabled?: boolean;
  }): RadarPlatformApiError {
    return new RadarPlatformApiError(
      normalizeFrontendError({
        error: params.error,
        status: params.status,
        level: 'request',
        correlationId: params.correlationId,
        retryAfterSeconds: params.retryAfterSeconds,
        lockReasonFa: params.lockReasonFa,
        featureDisabled: params.featureDisabled,
      }),
    );
  }
}

/**
 * @file src/platform/api-contracts/index.ts
 * @description Stage 15 (RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015) — Runtime API Boundary Validation,
 * Zero Silent Empty-Array/Zero Coercion, Version Compatibility Adapter & Money/Date Normalizers.
 */

export const RT_FE_REBUILD_STAGE_15_SPEC_ID = 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015' as const;

export type ContractCompatibilityStatus = 'COMPATIBLE' | 'DEPRECATED_SUPPORTED' | 'INCOMPATIBLE_VERSION' | 'MALFORMED_ENVELOPE';

export interface RuntimeEnvelopeValidationResult<T> {
  readonly ok: boolean;
  readonly status: ContractCompatibilityStatus;
  readonly data: T | null;
  readonly errorCode: string | null;
  readonly traceId: string | null;
}

export function validateRuntimeApiEnvelope<T>(
  httpStatus: number,
  rawPayload: unknown,
  validator: (data: unknown) => data is T,
): RuntimeEnvelopeValidationResult<T> {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return {
      ok: false,
      status: 'MALFORMED_ENVELOPE',
      data: null,
      errorCode: 'NON_OBJECT_API_PAYLOAD',
      traceId: null,
    };
  }

  const record = rawPayload as Record<string, unknown>;
  const traceId = typeof record.traceId === 'string' ? record.traceId : null;

  // Reject HTTP 200 responses that actually carry an error envelope (`ok: false` or `error` object)
  if (httpStatus >= 400 || record.ok === false || (record.error && typeof record.error === 'object')) {
    const errObj = record.error as Record<string, unknown> | undefined;
    const errorCode =
      (typeof errObj?.code === 'string' && errObj.code) ||
      (typeof record.errorCode === 'string' && record.errorCode) ||
      `HTTP_${httpStatus}_CONTRACT_ERROR`;
    return {
      ok: false,
      status: 'MALFORMED_ENVELOPE',
      data: null,
      errorCode,
      traceId,
    };
  }

  const candidateData = 'data' in record ? record.data : rawPayload;
  if (!validator(candidateData)) {
    return {
      ok: false,
      status: 'MALFORMED_ENVELOPE',
      data: null,
      errorCode: 'SCHEMA_VALIDATION_FAILED_NO_SILENT_EMPTY_FALLBACK',
      traceId,
    };
  }

  return {
    ok: true,
    status: 'COMPATIBLE',
    data: candidateData,
    errorCode: null,
    traceId,
  };
}

export function assertNoSilentEmptyFallback<T>(
  validationResult: RuntimeEnvelopeValidationResult<readonly T[]>,
): {
  readonly state: 'EMPTY_LEGITIMATE' | 'DATA_READY' | 'CONTRACT_ERROR';
  readonly items: readonly T[];
  readonly errorCode: string | null;
} {
  if (!validationResult.ok || validationResult.data === null) {
    return {
      state: 'CONTRACT_ERROR',
      items: [],
      errorCode: validationResult.errorCode ?? 'CONTRACT_VALIDATION_FAILED',
    };
  }
  return {
    state: validationResult.data.length === 0 ? 'EMPTY_LEGITIMATE' : 'DATA_READY',
    items: validationResult.data,
    errorCode: null,
  };
}

export function adaptApiContractVersion(input: {
  serverVersion: string;
  supportedMajorVersion: number;
  minSupportedMinorVersion?: number;
}): {
  readonly status: ContractCompatibilityStatus;
  readonly requiresUpgradeNotice: boolean;
} {
  const match = /^v?(\d+)\.(\d+)/.exec(String(input.serverVersion ?? '').trim());
  if (!match) {
    return { status: 'INCOMPATIBLE_VERSION', requiresUpgradeNotice: true };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== input.supportedMajorVersion) {
    return { status: 'INCOMPATIBLE_VERSION', requiresUpgradeNotice: true };
  }
  if (input.minSupportedMinorVersion != null && minor < input.minSupportedMinorVersion) {
    return { status: 'DEPRECATED_SUPPORTED', requiresUpgradeNotice: true };
  }
  return { status: 'COMPATIBLE', requiresUpgradeNotice: false };
}

export function normalizeApiMoneyAndDates(input: {
  amount: number;
  currency: 'IRR' | 'IRT';
  isoDateString: string;
}): {
  readonly valid: boolean;
  readonly amountToman: number | null;
  readonly timestampMs: number | null;
} {
  const parsedMs = Date.parse(input.isoDateString);
  if (!Number.isFinite(input.amount) || input.amount < 0 || Number.isNaN(parsedMs)) {
    return { valid: false, amountToman: null, timestampMs: null };
  }
  return {
    valid: true,
    amountToman: input.currency === 'IRR' ? Math.round(input.amount / 10) : Math.round(input.amount),
    timestampMs: parsedMs,
  };
}

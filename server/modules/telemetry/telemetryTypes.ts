import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../../../src/utils/areaUnit';

/**
 * High-performance, memory-bounded, privacy-preserving telemetry event schemas and interfaces.
 */

export type TelemetryPrivacyClassification =
  | 'PUBLIC_AGGREGATE'
  | 'PSEUDONYMOUS_SESSION'
  | 'RESTRICTED_OPERATIONAL';

export type TelemetryEventCategory =
  | 'USER_INTERACTION'
  | 'SEARCH_EXPLORATION'
  | 'VALUATION_CALCULATION'
  | 'CONVERSION_MILESTONE'
  | 'SYSTEM_HEALTH'
  | 'FRAUD_SECURITY';

export interface TelemetryEventProvenance {
  readonly origin: 'web_client' | 'mobile_pwa' | 'backend_service';
  readonly appVersion: string;
  readonly tehranDateKey: string;
  readonly ingestedAtMs: number;
  readonly clientSentAtMs?: number;
  readonly clientTimeDriftMs?: number;
}

export interface TelemetryEventPayload {
  readonly eventId: string;
  readonly eventName: string;
  readonly category: TelemetryEventCategory;
  readonly privacyClassification: TelemetryPrivacyClassification;
  readonly sessionHash: string;
  readonly hoodId?: number;
  readonly cityId?: string;
  readonly numericMetrics: Readonly<Record<string, number>>;
  readonly categoricalDimensions: Readonly<Record<string, string>>;
  readonly provenance: TelemetryEventProvenance;
  readonly rawPayloadHashSha256: string;
}

export interface IngestibleTelemetryBatchItem {
  readonly eventId?: string;
  readonly eventName: string;
  readonly category?: TelemetryEventCategory;
  readonly sessionSeed?: string;
  readonly timestampMs?: number;
  readonly hoodId?: number;
  readonly cityId?: string;
  readonly metrics?: Record<string, unknown>;
  readonly dimensions?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface TelemetryValidationResult {
  readonly valid: boolean;
  readonly errorCode?:
    | 'INVALID_PAYLOAD'
    | 'MISSING_EVENT_NAME'
    | 'EVENT_NAME_TOO_LONG'
    | 'ILLEGAL_PII_KEY'
    | 'ILLEGAL_PII_VALUE'
    | 'INVALID_METRICS'
    | 'INVALID_DIMENSIONS';
  readonly errorMessageFa?: string;
  readonly sanitizedEvent?: TelemetryEventPayload;
}

export interface AggregationWindowBucket {
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly dateKey: string;
  readonly hoodId: number;
  readonly cityId: string;
  readonly eventType: string;
  readonly totalEvents: number;
  readonly distinctSessionsCount: number;
  readonly sumMetrics: Record<string, number>;
  readonly avgMetrics: Record<string, number>;
  readonly p50Metrics?: Record<string, number>;
  readonly p95Metrics?: Record<string, number>;
  readonly isKAnonymityPreserved: boolean;
}

export interface TelemetryRetentionPolicy {
  readonly rawEventRetentionDays: number;
  readonly aggregatedWindowRetentionDays: number;
  readonly auditLogRetentionDays: number;
  readonly maxQueueMemoryBytes: number;
  readonly maxBatchSize: number;
}

export const DEFAULT_TELEMETRY_RETENTION_POLICY: TelemetryRetentionPolicy = {
  rawEventRetentionDays: 30,
  aggregatedWindowRetentionDays: 365,
  auditLogRetentionDays: 90,
  maxQueueMemoryBytes: 32 * 1024 * 1024, // 32MB hard boundary
  maxBatchSize: 500,
};

export function formatTelemetryBenchmarkIntl(
  budgetMillionToman: number,
  currency: IntlCurrencyCode = 'USD',
  areaUnit: AreaUnit = 'sqm'
): { currencyText: string; areaUnitLabel: string } {
  return {
    currencyText: formatMillionTomanAsIntlCurrency(budgetMillionToman, currency),
    areaUnitLabel: formatAreaUnitLabel(areaUnit),
  };
}

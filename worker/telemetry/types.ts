/**
 * @file worker/telemetry/types.ts
 * @description Cloudflare Workers Telemetry, Product Analytics, Real Estate Intelligence,
 * and Privacy Governance Types.
 *
 * Enforces:
 * - Strict domain separation (Technical, Product, Real Estate, Quality, Security).
 * - Privacy governance and zero-PII validation rules.
 * - Cloudflare Worker runtime resource metrics abstraction.
 * - Hedonic pricing model monitoring and quality indicators.
 */

export type TelemetryDomain =
  | 'TECHNICAL_RUNTIME'
  | 'PRODUCT_ANALYTICS'
  | 'REAL_ESTATE_INTELLIGENCE'
  | 'DATA_QUALITY'
  | 'SECURITY_AUDIT';

export type TelemetryPrivacyClassification =
  | 'PUBLIC_AGGREGATE'
  | 'PSEUDONYMOUS_SESSION'
  | 'RESTRICTED_OPERATIONAL'
  | 'SECURITY_SENSITIVE';

export interface TelemetryEventEnvelope<TPayload = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventName: string;
  readonly domain: TelemetryDomain;
  readonly schemaVersion: number;
  readonly privacyClassification: TelemetryPrivacyClassification;
  readonly timestampIso: string;
  readonly environment: 'development' | 'preview' | 'staging' | 'production';
  readonly correlationId: string;
  readonly sessionHash: string; // Rotating daily salt hash, never raw UID/IP
  readonly payload: TPayload;
}

/**
 * Worker runtime metrics explicitly available or instrumented in Cloudflare Workers.
 */
export interface WorkerRuntimeMetrics {
  readonly wallClockDurationMs: number;
  readonly cpuTimeMsEstimate?: number; // Available via Performance API / Workers tracing
  readonly memoryPressureIndicator: 'LOW' | 'NORMAL' | 'HIGH' | 'APPROACHING_LIMIT';
  readonly subrequestCount: number;
  readonly wasEdgeCached: boolean;
  readonly dataStoreOps: {
    readonly d1Reads: number;
    readonly d1Writes: number;
    readonly kvReads: number;
    readonly kvWrites: number;
    readonly r2Reads: number;
    readonly r2Writes: number;
  };
}

/**
 * Real Estate Data Intelligence Indicator.
 */
export interface RealEstateMarketIndicator {
  readonly cityId: string;
  readonly hoodId: number;
  readonly observationPeriod: string; // e.g., '2026-W18' or '2026-05'
  readonly sampleSize: number;
  readonly medianPricePerSqmMillion: number;
  readonly p25PricePerSqmMillion: number;
  readonly p75PricePerSqmMillion: number;
  readonly medianFullDepositMillion: number;
  readonly activeListingCount: number;
  readonly listingTurnoverDaysEstimate: number;
  readonly dataFreshnessHours: number;
  readonly confidenceScore: number; // 0.0 to 1.0 based on sample size and standard deviation
  readonly confidenceLevel: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT_SAMPLE';
  readonly methodologyNotes: string;
}

/**
 * Hedonic Pricing Model Monitoring Record.
 */
export interface HedonicModelDriftRecord {
  readonly modelVersion: string;
  readonly evaluatedAtIso: string;
  readonly sampleCount: number;
  readonly meanAbsolutePercentageError: number; // MAPE
  readonly fastSaleFactorObserved: number; // Invariant FAST_SALE_FACTOR = 0.88
  readonly confidenceIntervalCoveragePct: number;
  readonly calibrationStatus: 'CALIBRATED' | 'DRIFT_DETECTED' | 'OUTLIER_ALERT';
}

/**
 * Data Quality and Cleanliness Indicators.
 */
export interface DataQualityReport {
  readonly evaluatedAtIso: string;
  readonly totalRecordsScanned: number;
  readonly completenessScorePct: number;
  readonly invalidCoordinatesCount: number;
  readonly missingPriceCount: number;
  readonly statisticalOutliersCount: number;
  readonly duplicateListingsCount: number;
  readonly sourceReliabilityScores: Record<string, number>;
}

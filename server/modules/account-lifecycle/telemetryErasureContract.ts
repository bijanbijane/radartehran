/**
 * Telemetry erasure contract — bound to account deletion jobs (Phase A).
 */

export type TelemetryDataClass =
  | 'SECURITY_ESSENTIAL'
  | 'OPERATIONS_ESSENTIAL'
  | 'PRODUCT_ANALYTICS_OPTIONAL'
  | 'PSEUDONYMOUS_ATTRIBUTABLE'
  | 'AGGREGATE'
  | 'ANONYMIZED'
  | 'LEGAL_HOLD';

export interface TelemetryErasureReceipt {
  receiptId: string;
  jobId: string;
  targetUid: string;
  dataClass: TelemetryDataClass;
  recordsErased: number;
  recordsRetained: number;
  retainedReason?: string;
  processedAtIso: string;
}

export interface TelemetryErasureBatchParams {
  targetUid: string;
  jobId: string;
  dataClass: TelemetryDataClass;
  cursor: string | null;
  batchSize: number;
}

export interface TelemetryErasureBatchResult {
  receipts: TelemetryErasureReceipt[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Adapter invoked by AccountDeletionOrchestrator during dependent-data purge.
 * Must never delete cross-user telemetry or legal-hold partitions without policy match.
 */
export interface AccountTelemetryErasureAdapter {
  purgeAttributableTelemetryBatch(
    params: TelemetryErasureBatchParams,
  ): Promise<TelemetryErasureBatchResult>;

  /**
   * Drain durable pending queue partitions owned by the user (Workers: D1/Queue ack).
   */
  purgePendingIngestionQueueForUser(params: {
    targetUid: string;
    jobId: string;
  }): Promise<{ partitionsDrained: number; eventsAcknowledged: number }>;
}

export interface TelemetryIngestionConsentGate {
  /**
   * Backend source of truth — optional analytics blocked when no valid consent.
   */
  isOptionalAnalyticsAllowed(targetUid: string): Promise<boolean>;
}
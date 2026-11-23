import type {
  IngestibleTelemetryBatchItem,
  TelemetryEventPayload,
  TelemetryValidationResult,
} from './telemetryTypes';
import { validateAndSanitizeTelemetryItem } from './telemetryValidator';
import { DurableTelemetryBufferQueue } from './telemetryBufferQueue';
import { BoundedTelemetryAggregationEngine } from './telemetryAggregator';
import { deriveDailyTelemetrySalt } from './telemetrySessionSalt';
import { toTehranDateKey } from './telemetryValidator';

export const TELEMETRY_MAX_BATCH_SIZE = 500;

export interface TelemetryIngestOutcome {
  readonly receivedCount: number;
  readonly acceptedCount: number;
  readonly deduplicatedCount: number;
  readonly droppedPiiCount: number;
  readonly invalidCount: number;
  readonly failedStorageCount: number;
  readonly truncatedCount: number;
  readonly rejectedCount: number;
  readonly eventReceipts: Array<{
    readonly eventId: string;
    readonly status: 'ACCEPTED' | 'DEDUPLICATED' | 'REJECTED';
    readonly reason?: string;
  }>;
}

export interface TelemetryServiceMetrics {
  readonly totalIngestedEvents: number;
  readonly totalDeduplicatedEvents: number;
  readonly totalRejectedPiiEvents: number;
  readonly totalProcessingErrors: number;
  readonly activeBufferSize: number;
  readonly bufferFileSizeBytes: number;
}

export class TelemetryDataProcessingService {
  private readonly bufferQueue: DurableTelemetryBufferQueue;
  private readonly aggregator: BoundedTelemetryAggregationEngine;
  private totalIngested = 0;
  private totalDeduplicated = 0;
  private totalRejectedPii = 0;
  private totalErrors = 0;

  constructor(options?: {
    bufferQueue?: DurableTelemetryBufferQueue;
    aggregator?: BoundedTelemetryAggregationEngine;
  }) {
    this.bufferQueue = options?.bufferQueue || new DurableTelemetryBufferQueue();
    this.aggregator = options?.aggregator || new BoundedTelemetryAggregationEngine();
  }

  /**
   * Primary ingestion endpoint logic.
   * Enforces:
   * 1. Schema & PII sanitization.
   * 2. Atomic durable write to journal.
   * 3. Incremental aggregation update.
   */
  public ingestBatch(
    items: readonly IngestibleTelemetryBatchItem[],
    options: {
      clientIp?: string;
      userAgent?: string;
      appVersion?: string;
      nowMs?: number;
    } = {}
  ): TelemetryIngestOutcome {
    let acceptedCount = 0;
    let deduplicatedCount = 0;
    let droppedPiiCount = 0;
    let invalidCount = 0;
    let failedStorageCount = 0;
    const receivedCount = items.length;

    const eventReceipts: Array<{
      eventId: string;
      status: 'ACCEPTED' | 'DEDUPLICATED' | 'REJECTED';
      reason?: string;
    }> = [];

    if (receivedCount > TELEMETRY_MAX_BATCH_SIZE) {
      return {
        receivedCount,
        acceptedCount: 0,
        deduplicatedCount: 0,
        droppedPiiCount: 0,
        invalidCount: 0,
        failedStorageCount: 0,
        truncatedCount: receivedCount - TELEMETRY_MAX_BATCH_SIZE,
        rejectedCount: receivedCount,
        eventReceipts: [],
      };
    }

  const dateKey = toTehranDateKey(options.nowMs ?? Date.now());
    const dailySalt = deriveDailyTelemetrySalt(dateKey);

    for (const item of items) {
      const validation: TelemetryValidationResult = validateAndSanitizeTelemetryItem(item, {
        nowMs: options.nowMs,
        appVersion: options.appVersion,
        dailySalt,
        origin: 'web_client',
      });

      if (!validation.valid || !validation.sanitizedEvent) {
        if (
          validation.errorCode === 'ILLEGAL_PII_KEY' ||
          validation.errorCode === 'ILLEGAL_PII_VALUE'
        ) {
          droppedPiiCount += 1;
          this.totalRejectedPii += 1;
        } else {
          invalidCount += 1;
          this.totalErrors += 1;
        }
        eventReceipts.push({
          eventId: item.eventId || 'unknown',
          status: 'REJECTED',
          reason: validation.errorMessageFa || validation.errorCode,
        });
        continue;
      }

      const event: TelemetryEventPayload = validation.sanitizedEvent;
      const enqueueResult = this.bufferQueue.enqueue(event);

      if (enqueueResult.isDuplicate) {
        deduplicatedCount += 1;
        this.totalDeduplicated += 1;
        eventReceipts.push({
          eventId: event.eventId,
          status: 'DEDUPLICATED',
          reason: 'DUPLICATE_EVENT_IDENTIFIER',
        });
        continue;
      }

      if (!enqueueResult.accepted) {
        failedStorageCount += 1;
        this.totalErrors += 1;
        eventReceipts.push({
          eventId: event.eventId,
          status: 'REJECTED',
          reason: enqueueResult.reason || 'STORAGE_PERSISTENCE_FAILED',
        });
        continue;
      }

      acceptedCount += 1;
      this.totalIngested += 1;
      const aggregated = this.aggregator.aggregateEvent(event);
      eventReceipts.push({
        eventId: event.eventId,
        status: 'ACCEPTED',
        reason: aggregated ? undefined : 'RESTRICTED_SKIPPED_PUBLIC_AGGREGATE',
      });
    }

    return {
      receivedCount,
      acceptedCount,
      deduplicatedCount,
      droppedPiiCount,
      invalidCount,
      failedStorageCount,
      truncatedCount: 0,
      rejectedCount: invalidCount + droppedPiiCount + failedStorageCount,
      eventReceipts,
    };
  }

  public getPublicAggregatedMetrics() {
    return this.aggregator.generateSnapshots();
  }

  public getAggregatedMetrics() {
    return this.getPublicAggregatedMetrics();
  }

  public replayJournalBatchToAggregator(maxBatch = 200): number {
    const batch = this.bufferQueue.readBatch(maxBatch);
    let replayed = 0;
    for (const rec of batch) {
      if (this.aggregator.aggregateEvent(rec.payload)) replayed += 1;
    }
    return replayed;
  }

  public getDiagnostics(): TelemetryServiceMetrics {
    const queueStats = this.bufferQueue.getStats();
    return {
      totalIngestedEvents: this.totalIngested,
      totalDeduplicatedEvents: this.totalDeduplicated,
      totalRejectedPiiEvents: this.totalRejectedPii,
      totalProcessingErrors: this.totalErrors,
      activeBufferSize: queueStats.pendingCount,
      bufferFileSizeBytes: queueStats.bufferFileSizeBytes,
    };
  }

  public purgeRetention(retentionDays = 30, nowMs = Date.now()): number {
    return this.bufferQueue.purgeExpiredPartitions(retentionDays, nowMs);
  }

  public resetForTests(): void {
    this.bufferQueue.clearForTests();
    this.aggregator.clear();
    this.totalIngested = 0;
    this.totalDeduplicated = 0;
    this.totalRejectedPii = 0;
    this.totalErrors = 0;
  }
}

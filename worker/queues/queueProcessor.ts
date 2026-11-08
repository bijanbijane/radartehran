/**
 * @file worker/queues/queueProcessor.ts
 * @description Cloudflare Queue Consumer & Producer abstractions.
 *
 * Enforces:
 * - Idempotent message consumption using stable idempotency keys.
 * - Poison-message isolation without stalling the entire batch.
 * - Dead-letter queue forwarding upon retry exhaustion.
 * - Strongly-typed message handling and observability reporting.
 */

import { evaluateJobRetry, transitionJobState } from './jobStateMachine';
import type {
  JobEnvelope,
  JobExecutionRecord,
  JobFailureClassification,
  MessageBatch,
  QueueBinding,
  QueueMessage,
  QueueName,
} from './types';

export interface JobExecutionHandler<TPayload = any> {
  (job: JobEnvelope<TPayload>): Promise<{ success: boolean; resultSummary?: Record<string, unknown> }>;
}

export class CloudflareQueueProcessor {
  private readonly handlers = new Map<string, JobExecutionHandler>();
  private readonly processedKeys = new Set<string>();
  private readonly deadLetterQueue?: QueueBinding<JobEnvelope>;

  constructor(options?: { deadLetterQueue?: QueueBinding<JobEnvelope> }) {
    this.deadLetterQueue = options?.deadLetterQueue;
  }

  public registerHandler<T>(jobType: string, handler: JobExecutionHandler<T>): void {
    this.handlers.set(jobType, handler);
  }

  /**
   * Process a batch of messages received from Cloudflare Workers Queues.
   */
  public async processBatch(batch: MessageBatch<JobEnvelope>): Promise<{
    processedCount: number;
    retriedCount: number;
    deadLetteredCount: number;
    skippedDuplicateCount: number;
  }> {
    let processed = 0;
    let retried = 0;
    let deadLettered = 0;
    let skippedDuplicates = 0;

    for (const msg of batch.messages) {
      const job = msg.body;

      // 1. Envelope validation
      if (!job || !job.jobId || !job.jobType || !job.idempotencyKey) {
        msg.ack(); // Malformed poison message acknowledged and dropped
        deadLettered += 1;
        continue;
      }

      // 2. Duplicate detection / idempotency check
      if (this.processedKeys.has(job.idempotencyKey)) {
        msg.ack();
        skippedDuplicates += 1;
        continue;
      }

      // 3. Find handler
      const handler = this.handlers.get(job.jobType);
      if (!handler) {
        // Unknown job type: permanent failure -> Dead Letter
        if (this.deadLetterQueue) {
          await this.deadLetterQueue.send(job);
        }
        msg.ack();
        deadLettered += 1;
        continue;
      }

      // 4. Execute handler with error classification
      try {
        const result = await handler(job);
        if (result.success) {
          this.processedKeys.add(job.idempotencyKey);
          msg.ack();
          processed += 1;
        } else {
          throw new Error('HANDLER_RETURNED_FAILURE');
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
        const failureClass: JobFailureClassification =
          errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('FORBIDDEN')
            ? 'PERMANENT_AUTHORIZATION'
            : errorMsg.includes('VALIDATION') || errorMsg.includes('INVALID')
            ? 'PERMANENT_VALIDATION'
            : 'TRANSIENT_NETWORK';

        const retryDecision = evaluateJobRetry(job, msg.attempts, failureClass, errorMsg);

        if (retryDecision.shouldRetry) {
          msg.retry({ delaySeconds: retryDecision.delaySeconds });
          retried += 1;
        } else {
          // Dead-letter routing
          if (this.deadLetterQueue) {
            await this.deadLetterQueue.send(job);
          }
          msg.ack(); // Acknowledge from primary queue so batch progresses
          deadLettered += 1;
        }
      }
    }

    return {
      processedCount: processed,
      retriedCount: retried,
      deadLetteredCount: deadLettered,
      skippedDuplicateCount: skippedDuplicates,
    };
  }
}

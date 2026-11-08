/**
 * @file worker/queues/simulatedQueue.ts
 * @description In-memory simulated Cloudflare Queue binding and batch harness for testing.
 *
 * Implements `QueueBinding` and generates mock `MessageBatch` collections
 * for deterministic verification without cloud dependencies.
 */

import type {
  JobEnvelope,
  MessageBatch,
  QueueBinding,
  QueueMessage,
} from './types';

export class SimulatedQueueMessage<T = unknown> implements QueueMessage<T> {
  public readonly id: string;
  public readonly timestamp: Date;
  public readonly body: T;
  public attempts: number;
  public acked = false;
  public retried = false;
  public retryDelaySeconds?: number;

  constructor(body: T, attempts = 1) {
    this.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.timestamp = new Date();
    this.body = body;
    this.attempts = attempts;
  }

  public ack(): void {
    this.acked = true;
  }

  public retry(options?: { delaySeconds?: number }): void {
    this.retried = true;
    this.retryDelaySeconds = options?.delaySeconds;
    this.attempts += 1;
  }
}

export class SimulatedQueueBinding implements QueueBinding<JobEnvelope> {
  public readonly messages: JobEnvelope[] = [];

  public async send(message: JobEnvelope, _options?: { delaySeconds?: number }): Promise<void> {
    this.messages.push(message);
  }

  public async sendBatch(messages: Iterable<{ body: JobEnvelope; delaySeconds?: number }>): Promise<void> {
    for (const item of messages) {
      this.messages.push(item.body);
    }
  }

  public createBatch(queueName = 'radar-test-queue'): MessageBatch<JobEnvelope> {
    const queueMessages = this.messages.map((m) => new SimulatedQueueMessage(m));
    return {
      queue: queueName,
      messages: queueMessages,
      ackAll: () => {
        for (const m of queueMessages) m.ack();
      },
      retryAll: (opts) => {
        for (const m of queueMessages) m.retry(opts);
      },
    };
  }
}

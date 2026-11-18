/**
 * @file server/modules/notifications/notificationDeliveryEngine.ts
 * @description Delivery pipeline with multi-channel support, channel preference gating, retry backoff, and idempotent workers.
 */

import type { NotificationStore } from './notificationStore';
import type {
  NotificationChannel,
  NotificationDeliveryJob,
  NotificationDocument,
  NotificationLifecycleState,
} from './notificationTypes';

export interface DeliveryProviderResult {
  readonly success: boolean;
  readonly state: NotificationLifecycleState;
  readonly isTransient: boolean;
  readonly error?: string;
}

export interface ExternalDeliveryProvider {
  readonly channel: NotificationChannel;
  deliver(job: NotificationDeliveryJob, doc: NotificationDocument): Promise<DeliveryProviderResult>;
}

export class MockDeliveryProvider implements ExternalDeliveryProvider {
  constructor(
    public readonly channel: NotificationChannel,
    private readonly simulatedOutcome: 'SUCCESS' | 'TRANSIENT_ERROR' | 'PERMANENT_ERROR' = 'SUCCESS',
  ) {}

  public async deliver(_job: NotificationDeliveryJob, _doc: NotificationDocument): Promise<DeliveryProviderResult> {
    if (this.simulatedOutcome === 'SUCCESS') {
      return {
        success: true,
        state: 'delivered',
        isTransient: false,
      };
    }

    if (this.simulatedOutcome === 'TRANSIENT_ERROR') {
      return {
        success: false,
        state: 'failed',
        isTransient: true,
        error: 'GATEWAY_TIMEOUT_504',
      };
    }

    return {
      success: false,
      state: 'failed',
      isTransient: false,
      error: 'RECIPIENT_PERMANENTLY_REJECTED_550',
    };
  }
}

export class NotificationDeliveryEngine {
  private readonly providers = new Map<NotificationChannel, ExternalDeliveryProvider>();

  constructor(private readonly store: NotificationStore) {
    // In-app provider always succeeds immediately upon record creation
    this.registerProvider({
      channel: 'in_app',
      deliver: async () => ({ success: true, state: 'delivered', isTransient: false }),
    });
  }

  public registerProvider(provider: ExternalDeliveryProvider): void {
    this.providers.set(provider.channel, provider);
  }

  /**
   * Plans and schedules delivery jobs for a newly created notification based on user preferences.
   */
  public async scheduleDeliveryJobs(doc: NotificationDocument): Promise<NotificationDeliveryJob[]> {
    const preferences = await this.store.getPreferences(doc.recipientUid);
    const jobs: NotificationDeliveryJob[] = [];

    // Evaluate target channels
    const targetChannels: NotificationChannel[] = ['in_app'];

    if (preferences.channels.email && preferences.emailAddress) {
      targetChannels.push('email');
    }
    if (preferences.channels.sms && preferences.mobilePhone) {
      targetChannels.push('sms');
    }
    if (preferences.channels.push) {
      targetChannels.push('push');
    }

    // Category mute check (security category is non-suppressible)
    const isCategoryEnabled = doc.category === 'security' || Boolean(preferences.categories[doc.category]);

    for (const channel of targetChannels) {
      const isChannelEnabled = channel === 'in_app' ? Boolean(preferences.channels.inApp) : Boolean(preferences.channels[channel]);
      const shouldDeliver = isChannelEnabled && isCategoryEnabled;

      const idempotencyKey = `job_${doc.id}_${channel}`;
      const targetMasked = channel === 'email'
        ? preferences.emailAddress?.replace(/^(.)(.*)(@.*)$/, '$1***$3')
        : channel === 'sms'
          ? preferences.mobilePhone?.replace(/^(\d{4})\d+(\d{3})$/, '$1****$2')
          : undefined;

      const job = await this.store.createDeliveryJob({
        notificationId: doc.id,
        recipientUid: doc.recipientUid,
        channel,
        targetDestinationMasked: targetMasked,
        deliveryState: shouldDeliver ? 'pending' : 'suppressed',
        attempts: 0,
        maxAttempts: 3,
        idempotencyKey,
      });

      jobs.push(job);
    }

    return jobs;
  }

  /**
   * Dispatches a single delivery job with retry backoff and idempotency.
   */
  public async processDeliveryJob(job: NotificationDeliveryJob): Promise<NotificationDeliveryJob> {
    if (job.deliveryState === 'delivered' || job.deliveryState === 'suppressed' || job.deliveryState === 'cancelled') {
      return job;
    }

    const doc = await this.store.getNotificationById(job.notificationId, job.recipientUid);
    if (!doc) {
      const updated = await this.store.updateDeliveryJob(job.id, {
        deliveryState: 'failed',
        lastError: 'ASSOCIATED_NOTIFICATION_NOT_FOUND',
      });
      return updated || job;
    }

    const provider = this.providers.get(job.channel);
    if (!provider) {
      // Missing provider: preserve pending job without failing or marking delivered
      const updated = await this.store.updateDeliveryJob(job.id, {
        deliveryState: 'pending',
        lastError: `PROVIDER_NOT_CONFIGURED_FOR_CHANNEL_${job.channel}`,
      });
      return updated || job;
    }

    // Mark processing
    const attempt = job.attempts + 1;
    await this.store.updateDeliveryJob(job.id, {
      deliveryState: 'processing',
      attempts: attempt,
      lastAttemptAtIso: new Date().toISOString(),
    });

    try {
      const outcome = await provider.deliver(job, doc);

      if (outcome.success) {
        const updated = await this.store.updateDeliveryJob(job.id, {
          deliveryState: outcome.state || 'delivered',
          lastError: undefined,
        });
        return updated || job;
      }

      // Failure handling
      if (outcome.isTransient && attempt < job.maxAttempts) {
        const delaySeconds = Math.pow(2, attempt); // exponential backoff: 2s, 4s, 8s
        const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        const updated = await this.store.updateDeliveryJob(job.id, {
          deliveryState: 'pending',
          nextAttemptAtIso: nextAttempt,
          lastError: outcome.error || 'TRANSIENT_FAILURE_RETRYING',
        });
        return updated || job;
      }

      const updated = await this.store.updateDeliveryJob(job.id, {
        deliveryState: 'failed',
        lastError: outcome.error || 'PERMANENT_DELIVERY_FAILURE',
      });
      return updated || job;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (attempt < job.maxAttempts) {
        const delaySeconds = Math.pow(2, attempt);
        const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        const updated = await this.store.updateDeliveryJob(job.id, {
          deliveryState: 'pending',
          nextAttemptAtIso: nextAttempt,
          lastError: errorMsg,
        });
        return updated || job;
      }

      const updated = await this.store.updateDeliveryJob(job.id, {
        deliveryState: 'failed',
        lastError: errorMsg,
      });
      return updated || job;
    }
  }

  /**
   * Bounded batch processor for pending jobs.
   */
  public async processPendingBatch(limit = 20): Promise<{ processed: number; succeeded: number; failed: number }> {
    const jobs = await this.store.listPendingDeliveryJobs(limit);
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      const res = await this.processDeliveryJob(job);
      if (res.deliveryState === 'delivered') succeeded++;
      else if (res.deliveryState === 'failed') failed++;
    }

    return { processed: jobs.length, succeeded, failed };
  }
}

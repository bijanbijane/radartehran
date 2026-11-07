/**
 * Employee 13 — Email, SMS, and Push Delivery Provider Adapters
 * (`server/modules/notifications/providerAdapters.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Enforces Provider Restrictions:
 *  - Do not invent SMS, email, or push credentials.
 *  - Do not send real messages to users during development.
 *  - Do not introduce an external provider without approval from the integration lead.
 *  - Do not claim a message was delivered merely because a provider API accepted a request
 *    (returns `ACCEPTED_BY_PROVIDER`, which requires a subsequent delivery confirmation receipt).
 *  - Enforces provider-side idempotency by `deduplicationKey`.
 */

import crypto from 'node:crypto';
import { redactPrivateContactDetails } from './privacyAndTemplates.ts';
import {
  EmailDeliveryProviderAdapter,
  ExternalDeliveryChannel,
  ProviderDispatchRequest,
  ProviderDispatchResponse,
  PushDeliveryProviderAdapter,
  SmsDeliveryProviderAdapter,
} from './types.ts';

export type SimulatedProviderBehavior =
  | 'ACCEPT_AWAITING_RECEIPT'
  | 'TRANSIENT_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'UNCONFIGURED';

function generateDeterministicProviderMessageId(
  providerId: string,
  deduplicationKey: string,
): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${providerId}:${deduplicationKey}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `pmsg_${providerId}_${digest}`;
}

/**
 * Deterministic Sandbox / Dry-Run Email Delivery Adapter.
 * Never sends real external emails during development and never invents external credentials.
 */
export class SandboxEmailDeliveryAdapter implements EmailDeliveryProviderAdapter {
  public readonly channel = 'EMAIL' as const;
  public readonly providerId: string;
  private configuredAndApproved: boolean;
  private nextBehavior: SimulatedProviderBehavior;
  private readonly acceptedByDeduplicationKey = new Map<string, string>();

  constructor(options?: {
    providerId?: string;
    configuredAndApproved?: boolean;
    initialBehavior?: SimulatedProviderBehavior;
  }) {
    this.providerId = options?.providerId ?? 'sandbox-email-dryrun';
    this.configuredAndApproved = options?.configuredAndApproved ?? true;
    this.nextBehavior = options?.initialBehavior ?? 'ACCEPT_AWAITING_RECEIPT';
  }

  public setSimulatedBehavior(behavior: SimulatedProviderBehavior): void {
    this.nextBehavior = behavior;
  }

  public setConfiguredAndApproved(configured: boolean): void {
    this.configuredAndApproved = configured;
  }

  public isConfiguredAndApproved(): boolean {
    return this.configuredAndApproved && this.nextBehavior !== 'UNCONFIGURED';
  }

  public getAcceptedCount(): number {
    return this.acceptedByDeduplicationKey.size;
  }

  public async sendEmail(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse> {
    if (!this.isConfiguredAndApproved()) {
      return {
        providerId: this.providerId,
        outcome: 'PROVIDER_NOT_CONFIGURED',
        diagnosticMessage:
          'Email provider is not configured or not approved by integration lead; external dispatch blocked.',
      };
    }

    if (this.nextBehavior === 'TRANSIENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'TRANSIENT_FAILURE',
        diagnosticMessage: redactPrivateContactDetails(
          `Transient SMTP/gateway timeout for job ${request.jobId}.`,
        ),
      };
    }

    if (this.nextBehavior === 'PERMANENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'PERMANENT_FAILURE',
        diagnosticMessage: redactPrivateContactDetails(
          `Permanent address rejection for job ${request.jobId}.`,
        ),
      };
    }

    const existingMsgId = this.acceptedByDeduplicationKey.get(request.deduplicationKey);
    if (existingMsgId) {
      return {
        providerId: this.providerId,
        outcome: 'ACCEPTED_BY_PROVIDER',
        providerMessageId: existingMsgId,
        diagnosticMessage: 'Idempotent replay: email request already accepted by provider; awaiting delivery receipt.',
      };
    }

    const providerMessageId = generateDeterministicProviderMessageId(
      this.providerId,
      request.deduplicationKey,
    );
    this.acceptedByDeduplicationKey.set(request.deduplicationKey, providerMessageId);

    return {
      providerId: this.providerId,
      outcome: 'ACCEPTED_BY_PROVIDER',
      providerMessageId,
      diagnosticMessage: 'Request accepted by email sandbox queue; final delivery NOT yet confirmed.',
    };
  }
}

/**
 * Deterministic Sandbox / Dry-Run SMS Delivery Adapter.
 * Never sends real external SMS during development and never invents SMS gateway credentials.
 */
export class SandboxSmsDeliveryAdapter implements SmsDeliveryProviderAdapter {
  public readonly channel = 'SMS' as const;
  public readonly providerId: string;
  private configuredAndApproved: boolean;
  private nextBehavior: SimulatedProviderBehavior;
  private readonly acceptedByDeduplicationKey = new Map<string, string>();

  constructor(options?: {
    providerId?: string;
    configuredAndApproved?: boolean;
    initialBehavior?: SimulatedProviderBehavior;
  }) {
    this.providerId = options?.providerId ?? 'sandbox-sms-dryrun';
    this.configuredAndApproved = options?.configuredAndApproved ?? true;
    this.nextBehavior = options?.initialBehavior ?? 'ACCEPT_AWAITING_RECEIPT';
  }

  public setSimulatedBehavior(behavior: SimulatedProviderBehavior): void {
    this.nextBehavior = behavior;
  }

  public setConfiguredAndApproved(configured: boolean): void {
    this.configuredAndApproved = configured;
  }

  public isConfiguredAndApproved(): boolean {
    return this.configuredAndApproved && this.nextBehavior !== 'UNCONFIGURED';
  }

  public getAcceptedCount(): number {
    return this.acceptedByDeduplicationKey.size;
  }

  public async sendSms(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse> {
    if (!this.isConfiguredAndApproved()) {
      return {
        providerId: this.providerId,
        outcome: 'PROVIDER_NOT_CONFIGURED',
        diagnosticMessage:
          'SMS provider is not configured or not approved by integration lead; external dispatch blocked.',
      };
    }

    if (this.nextBehavior === 'TRANSIENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'TRANSIENT_FAILURE',
        diagnosticMessage: `Transient SMS carrier queue congestion for job ${request.jobId}.`,
      };
    }

    if (this.nextBehavior === 'PERMANENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'PERMANENT_FAILURE',
        diagnosticMessage: `Permanent SMS subscriber unreachable for job ${request.jobId}.`,
      };
    }

    const existingMsgId = this.acceptedByDeduplicationKey.get(request.deduplicationKey);
    if (existingMsgId) {
      return {
        providerId: this.providerId,
        outcome: 'ACCEPTED_BY_PROVIDER',
        providerMessageId: existingMsgId,
        diagnosticMessage: 'Idempotent replay: SMS request already accepted; awaiting carrier DLR.',
      };
    }

    const providerMessageId = generateDeterministicProviderMessageId(
      this.providerId,
      request.deduplicationKey,
    );
    this.acceptedByDeduplicationKey.set(request.deduplicationKey, providerMessageId);

    return {
      providerId: this.providerId,
      outcome: 'ACCEPTED_BY_PROVIDER',
      providerMessageId,
      diagnosticMessage: 'Request accepted by SMS sandbox gateway; carrier DLR NOT yet confirmed.',
    };
  }
}

/**
 * Deterministic Sandbox / Dry-Run Push Notification Delivery Adapter.
 * Never sends real push payloads during development and never invents VAPID/FCM credentials.
 */
export class SandboxPushDeliveryAdapter implements PushDeliveryProviderAdapter {
  public readonly channel = 'PUSH' as const;
  public readonly providerId: string;
  private configuredAndApproved: boolean;
  private nextBehavior: SimulatedProviderBehavior;
  private readonly acceptedByDeduplicationKey = new Map<string, string>();

  constructor(options?: {
    providerId?: string;
    configuredAndApproved?: boolean;
    initialBehavior?: SimulatedProviderBehavior;
  }) {
    this.providerId = options?.providerId ?? 'sandbox-push-dryrun';
    this.configuredAndApproved = options?.configuredAndApproved ?? true;
    this.nextBehavior = options?.initialBehavior ?? 'ACCEPT_AWAITING_RECEIPT';
  }

  public setSimulatedBehavior(behavior: SimulatedProviderBehavior): void {
    this.nextBehavior = behavior;
  }

  public setConfiguredAndApproved(configured: boolean): void {
    this.configuredAndApproved = configured;
  }

  public isConfiguredAndApproved(): boolean {
    return this.configuredAndApproved && this.nextBehavior !== 'UNCONFIGURED';
  }

  public getAcceptedCount(): number {
    return this.acceptedByDeduplicationKey.size;
  }

  public async sendPush(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse> {
    if (!this.isConfiguredAndApproved()) {
      return {
        providerId: this.providerId,
        outcome: 'PROVIDER_NOT_CONFIGURED',
        diagnosticMessage:
          'Push provider is not configured or not approved by integration lead; external dispatch blocked.',
      };
    }

    if (this.nextBehavior === 'TRANSIENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'TRANSIENT_FAILURE',
        diagnosticMessage: `Transient push relay 503 for job ${request.jobId}.`,
      };
    }

    if (this.nextBehavior === 'PERMANENT_FAILURE') {
      return {
        providerId: this.providerId,
        outcome: 'PERMANENT_FAILURE',
        diagnosticMessage: `Permanent push subscription token unregistered for job ${request.jobId}.`,
      };
    }

    const existingMsgId = this.acceptedByDeduplicationKey.get(request.deduplicationKey);
    if (existingMsgId) {
      return {
        providerId: this.providerId,
        outcome: 'ACCEPTED_BY_PROVIDER',
        providerMessageId: existingMsgId,
        diagnosticMessage: 'Idempotent replay: Push request already accepted; awaiting device ack.',
      };
    }

    const providerMessageId = generateDeterministicProviderMessageId(
      this.providerId,
      request.deduplicationKey,
    );
    this.acceptedByDeduplicationKey.set(request.deduplicationKey, providerMessageId);

    return {
      providerId: this.providerId,
      outcome: 'ACCEPTED_BY_PROVIDER',
      providerMessageId,
      diagnosticMessage: 'Request accepted by Push sandbox relay; device receipt NOT yet confirmed.',
    };
  }
}

export interface NotificationProviderAdapterBundle {
  email: EmailDeliveryProviderAdapter;
  sms: SmsDeliveryProviderAdapter;
  push: PushDeliveryProviderAdapter;
}

export function dispatchThroughChannelAdapter(
  adapters: NotificationProviderAdapterBundle,
  channel: ExternalDeliveryChannel,
  request: ProviderDispatchRequest,
): Promise<ProviderDispatchResponse> {
  if (channel === 'EMAIL') return adapters.email.sendEmail(request);
  if (channel === 'SMS') return adapters.sms.sendSms(request);
  return adapters.push.sendPush(request);
}

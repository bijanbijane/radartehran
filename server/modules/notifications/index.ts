/**
 * Employee 13 — Notifications and Messaging Backend (`server/modules/notifications/index.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Public module entry point exporting:
 *  - Event contracts, preferences, consent, and delivery job state machine (`types.ts`)
 *  - Preference, consent, and channel eligibility rules (`preferenceAndConsentService.ts`)
 *  - Template registry and privacy redaction utilities (`privacyAndTemplates.ts`)
 *  - Email, SMS, and Push delivery provider adapter interfaces & sandbox adapters (`providerAdapters.ts`)
 *  - Durable Firestore & atomic disk journal outbox/job store (`durableNotificationStore.ts`)
 *  - Four-stage notification lifecycle engine (`notificationEngine.ts`)
 */

export * from './types.ts';
export * from './preferenceAndConsentService.ts';
export * from './privacyAndTemplates.ts';
export * from './providerAdapters.ts';
export * from './durableNotificationStore.ts';
export * from './notificationEngine.ts';
export * from './service.ts';
export * from './routes.ts';
export * from './templatesAndValidation.ts';
export {
  NotificationDeliveryEngine,
  MockDeliveryProvider,
  type DeliveryProviderResult,
  type ExternalDeliveryProvider,
} from './notificationDeliveryEngine.ts';
export {
  NotificationEventConsumer,
  type ConsumeEventOutcome,
} from './notificationEventConsumer.ts';
export {
  NotificationStore,
  defaultNotificationStore,
} from './notificationStore.ts';
export {
  NOTIFICATION_TEMPLATES,
  sanitizeTemplateVariable,
  renderNotificationTemplate,
  type RenderedTemplateResult,
} from './notificationTemplates.ts';
export {
  sanitizeDeepLink,
  validateNotificationEventPayload,
  validateNotificationPreferencesUpdate,
} from './notificationValidator.ts';
export {
  registerNotificationRoutes,
  type NotificationModuleOptions,
} from './notificationRoutes.ts';

import { FirestoreAndJournalNotificationStore } from './durableNotificationStore.ts';
import { NotificationLifecycleEngine } from './notificationEngine.ts';
import { NotificationTemplateRegistry } from './privacyAndTemplates.ts';
import {
  NotificationProviderAdapterBundle,
  SandboxEmailDeliveryAdapter,
  SandboxPushDeliveryAdapter,
  SandboxSmsDeliveryAdapter,
} from './providerAdapters.ts';
import {
  EmailDeliveryProviderAdapter,
  PushDeliveryProviderAdapter,
  SmsDeliveryProviderAdapter,
} from './types.ts';

export interface CreateNotificationsModuleFacadeOptions {
  durableJournalPath?: string;
  enableFirestoreSync?: boolean;
  store?: FirestoreAndJournalNotificationStore;
  templateRegistry?: NotificationTemplateRegistry;
  emailAdapter?: EmailDeliveryProviderAdapter;
  smsAdapter?: SmsDeliveryProviderAdapter;
  pushAdapter?: PushDeliveryProviderAdapter;
}

export interface NotificationsModuleFacade {
  store: FirestoreAndJournalNotificationStore;
  templateRegistry: NotificationTemplateRegistry;
  providers: NotificationProviderAdapterBundle;
  engine: NotificationLifecycleEngine;
}

export function createNotificationsModuleFacade(
  options?: CreateNotificationsModuleFacadeOptions,
): NotificationsModuleFacade {
  const store =
    options?.store ??
    new FirestoreAndJournalNotificationStore({
      durableJournalPath: options?.durableJournalPath,
      enableFirestoreSync: options?.enableFirestoreSync ?? false,
    });

  const templateRegistry =
    options?.templateRegistry ?? new NotificationTemplateRegistry();

  const providers: NotificationProviderAdapterBundle = {
    email: options?.emailAdapter ?? new SandboxEmailDeliveryAdapter(),
    sms: options?.smsAdapter ?? new SandboxSmsDeliveryAdapter(),
    push: options?.pushAdapter ?? new SandboxPushDeliveryAdapter(),
  };

  const engine = new NotificationLifecycleEngine({
    store,
    templateRegistry,
    providerAdapters: providers,
  });

  return {
    store,
    templateRegistry,
    providers,
    engine,
  };
}

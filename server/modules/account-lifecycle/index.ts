/**
 * Employee 7 — Account Export and Deletion Backend (`server/modules/account-lifecycle/index.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Public module entry point exporting:
 *  - Types & contracts (`types.ts`)
 *  - Durable Firestore & atomic journal job/write-block store (`durableJobStore.ts`)
 *  - Complete user data export service (`exportService.ts`)
 *  - Durable account deletion orchestrator (`deletionOrchestrator.ts`)
 *  - Cross-module adapters for Media, Crowd Claims, Bargains, Buyer Alerts, Sponsors, Profile, Favorites, and Auth (`moduleAdapters.ts`)
 */

export * from './types.ts';
export * from './durableJobStore.ts';
export * from './exportService.ts';
export * from './deletionOrchestrator.ts';
export * from './moduleAdapters.ts';
export * from './stateMachine.ts';
export * from './storeContract.ts';
export * from './telemetryErasureContract.ts';
export * from './privacyConsentContract.ts';
export * from './officialApiContract.ts';
export * from './canonicalDeletionService.ts';
export * from './expressServerDeletionBridge.ts';
export * from './clientStorageKeys.ts';
export * from './storeFactory.ts';
export * from './batchReceiptRecorder.ts';
export * from './deletionWorkflowSupport.ts';
export * from './deletionOrchestratorPhases.ts';
export * from './deletionOrchestratorRunners.ts';
export * from './batchPersistenceContract.ts';
export * from './deletionDomainBatchExecutor.ts';
export * from './domainAdapterCoverageMatrix.ts';

import {
  AuthIdentityDeletionAdapter,
  MediaDeletionCoordinationAdapter,
  UserOwnedDomainRepositoryAdapter,
} from './types.ts';
import {
  DurableAccountLifecycleStore,
  FirestoreAndJournalAccountLifecycleStore,
} from './durableJobStore.ts';
import { AccountDataExportService } from './exportService.ts';
import { AccountDeletionOrchestrator } from './deletionOrchestrator.ts';
import { ConfigurableAuthIdentityDeletionAdapter } from './moduleAdapters.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import type { AccountTelemetryErasureAdapter } from './telemetryErasureContract.ts';
import type { LegacyFirestoreSupplementRunner } from './deletionOrchestratorPhases.ts';

export interface CreateAccountLifecycleFacadeOptions {
  durableJournalPath?: string;
  enableFirestoreSync?: boolean;
  store?: DurableAccountLifecycleStore;
  domainAdapters: Iterable<UserOwnedDomainRepositoryAdapter>;
  mediaAdapter: MediaDeletionCoordinationAdapter;
  authAdapter?: AuthIdentityDeletionAdapter;
  batchReceiptRecorder?: AccountDeletionBatchReceiptRecorder;
  telemetryErasureAdapter?: AccountTelemetryErasureAdapter;
  legacyFirestoreSupplement?: LegacyFirestoreSupplementRunner;
}

export interface AccountLifecycleFacade {
  store: DurableAccountLifecycleStore;
  exportService: AccountDataExportService;
  deletionOrchestrator: AccountDeletionOrchestrator;
  authAdapter: AuthIdentityDeletionAdapter;
}

export function createAccountLifecycleFacade(
  options: CreateAccountLifecycleFacadeOptions,
): AccountLifecycleFacade {
  const store =
    options.store ??
    new FirestoreAndJournalAccountLifecycleStore({
      durableJournalPath: options.durableJournalPath,
      enableFirestoreSync: options.enableFirestoreSync ?? false,
    });

  const adapterList = Array.from(options.domainAdapters);
  const exportService = new AccountDataExportService(adapterList);
  const authAdapter =
    options.authAdapter ?? new ConfigurableAuthIdentityDeletionAdapter();

  const deletionOrchestrator = new AccountDeletionOrchestrator({
    store,
    domainAdapters: adapterList,
    mediaAdapter: options.mediaAdapter,
    authAdapter,
    batchReceiptRecorder: options.batchReceiptRecorder,
    telemetryErasureAdapter: options.telemetryErasureAdapter,
    legacyFirestoreSupplement: options.legacyFirestoreSupplement,
  });

  return {
    store,
    exportService,
    deletionOrchestrator,
    authAdapter,
  };
}

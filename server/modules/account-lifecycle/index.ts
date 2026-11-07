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

export interface CreateAccountLifecycleFacadeOptions {
  durableJournalPath?: string;
  enableFirestoreSync?: boolean;
  store?: DurableAccountLifecycleStore;
  domainAdapters: Iterable<UserOwnedDomainRepositoryAdapter>;
  mediaAdapter: MediaDeletionCoordinationAdapter;
  authAdapter?: AuthIdentityDeletionAdapter;
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
  });

  return {
    store,
    exportService,
    deletionOrchestrator,
    authAdapter,
  };
}

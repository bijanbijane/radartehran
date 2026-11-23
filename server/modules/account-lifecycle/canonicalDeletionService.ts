/**
 * Single canonical account deletion entry (RT-ACCOUNT-LIFECYCLE-WORKERS-001).
 * Replaces parallel execution paths via AccountDeletionOrchestrator.
 */

import { createAccountDeletionPlan, type AccountDeletionStepStatus } from '../../../src/utils/identityLifecycleAndBackendGovernance';
import type { StoredObjectRecord } from '../../../src/utils/serverObjectStorageHelpers';
import { CLIENT_STORAGE_KEYS_TO_CLEAR } from './clientStorageKeys.ts';
import {
  buildDeletionActorFromExpress,
  collectOwnedBargainIds,
  createExpressAccountLifecycleFacade,
  type ExpressServerDeletionBridgeInput,
} from './expressServerDeletionBridge.ts';
import { isTerminalAccountDeletionState } from './stateMachine.ts';

export interface AccountDeletionExecutionInput {
  uid: string;
  rawAuthHeaderOrToken?: string | string[];
  ownedBargainIdsHint?: string[];
  serverPublishedBargains: Map<string, { ownerUid: string }>;
  serverSideBuyerLeads: Array<{ submittedByUid?: string }>;
  serverDataCorrections: Array<{ reporterUid: string | null }>;
  saveDiskPersistedCache: () => void;
  objectStoreIndex: StoredObjectRecord[];
  persistObjectStoreIndexNow: () => Promise<void>;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

export interface AccountDeletionExecutionResult {
  status: 'ok' | 'partial';
  steps: AccountDeletionStepStatus[];
  requiresClientAuthDeletion: boolean;
  failedSteps: AccountDeletionStepStatus['category'][];
  clearClientLocalStorageKeys: readonly string[];
  deletedMediaCount: number;
  failedMediaCount: number;
  deletionJobId?: string;
  deletionJobState?: string;
}

export { CLIENT_STORAGE_KEYS_TO_CLEAR };

export async function executeCanonicalAccountDeletion(
  input: AccountDeletionExecutionInput,
): Promise<AccountDeletionExecutionResult> {
  const env = input.env ?? process.env;
  const ownedIds = collectOwnedBargainIds(input.uid, input.serverPublishedBargains, input.ownedBargainIdsHint);

  for (const [id, rec] of input.serverPublishedBargains.entries()) {
    if (rec.ownerUid === input.uid) input.serverPublishedBargains.delete(id);
  }
  for (let i = input.serverSideBuyerLeads.length - 1; i >= 0; i--) {
    if (input.serverSideBuyerLeads[i].submittedByUid === input.uid) input.serverSideBuyerLeads.splice(i, 1);
  }
  for (let i = input.serverDataCorrections.length - 1; i >= 0; i--) {
    if (input.serverDataCorrections[i].reporterUid === input.uid) input.serverDataCorrections.splice(i, 1);
  }
  input.saveDiskPersistedCache();

  const bridgeInput: ExpressServerDeletionBridgeInput = {
    uid: input.uid,
    rawAuthHeaderOrToken: input.rawAuthHeaderOrToken,
    ownedBargainIdsHint: ownedIds,
    serverPublishedBargains: input.serverPublishedBargains,
    serverSideBuyerLeads: input.serverSideBuyerLeads,
    serverDataCorrections: input.serverDataCorrections as ExpressServerDeletionBridgeInput['serverDataCorrections'],
    saveDiskPersistedCache: input.saveDiskPersistedCache,
    objectStoreIndex: input.objectStoreIndex,
    persistObjectStoreIndexNow: input.persistObjectStoreIndexNow,
    env,
    fetchFn: input.fetchFn,
  };

  const facade = createExpressAccountLifecycleFacade(bridgeInput);
  const actor = buildDeletionActorFromExpress(input.uid);

  const { job } = await facade.deletionOrchestrator.initiateAccountDeletionJob(actor, {
    targetUid: input.uid,
    reason: 'USER_REQUESTED_ERASURE_EXPRESS',
  });

  let currentJob = job;
  let guard = 0;
  while (!isTerminalAccountDeletionState(currentJob.state) && guard < 500) {
    currentJob = await facade.deletionOrchestrator.resumeDeletionJob(actor, currentJob.jobId, {
      batchSize: 25,
      maxBatchesPerInvocation: 50,
    });
    guard += 1;
  }

  const legacy = currentJob.legacyFirestoreSupplement?.result ?? {
    userPrefsOk: false,
    votesOk: false,
    firestoreBargainsOk: false,
    alertsReconcileOk: false,
    authDeletedOnServer: false,
  };

  const deletedMediaCount = currentJob.mediaStep.deletedObjectIds.length;
  const failedMediaCount = currentJob.mediaStep.pendingRetryObjectIds.length;
  const authDeleted =
    currentJob.authStep.status === 'COMPLETED' || legacy.authDeletedOnServer;

  const completionByCategory: Record<AccountDeletionStepStatus['category'], boolean> = {
    user_profile_doc: legacy.userPrefsOk,
    private_favorites_and_alerts: legacy.alertsReconcileOk && legacy.votesOk,
    published_bargain_listings:
      legacy.firestoreBargainsOk &&
      currentJob.domainSteps.BARGAIN_LISTINGS.status === 'COMPLETED',
    uploaded_media_objects:
      currentJob.mediaStep.status === 'COMPLETED' && failedMediaCount === 0,
    audit_trail_anonymization: true,
    firebase_auth_identity: authDeleted,
  };

  const steps = createAccountDeletionPlan().map((step) => ({
    ...step,
    completed: completionByCategory[step.category],
  }));
  const failedSteps = steps.filter((s) => !s.completed).map((s) => s.category);
  const jobSucceeded = currentJob.state === 'COMPLETED' && failedSteps.length === 0;

  return {
    status: jobSucceeded ? 'ok' : 'partial',
    steps,
    requiresClientAuthDeletion: !authDeleted,
    failedSteps,
    clearClientLocalStorageKeys: CLIENT_STORAGE_KEYS_TO_CLEAR,
    deletedMediaCount,
    failedMediaCount,
    deletionJobId: currentJob.jobId,
    deletionJobState: currentJob.state,
  };
}
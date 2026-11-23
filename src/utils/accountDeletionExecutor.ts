/**
 * @deprecated Implementation path — use `executeCanonicalAccountDeletion` from
 * `server/modules/account-lifecycle/canonicalDeletionService.ts` (AccountDeletionOrchestrator).
 */
export {
  CLIENT_STORAGE_KEYS_TO_CLEAR,
  executeCanonicalAccountDeletion as executeDurableAccountDeletion,
  type AccountDeletionExecutionInput,
  type AccountDeletionExecutionResult,
} from '../../server/modules/account-lifecycle/canonicalDeletionService.ts';
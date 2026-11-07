/**
 * Employee 7 — Account Export and Deletion Backend (`server/modules/account-lifecycle/types.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Defines strict contracts for:
 *  1. Complete user data export with bounded pagination, cross-user isolation, and truthful completeness.
 *  2. Durable Firestore / journal-backed deletion jobs that survive process restarts.
 *  3. Write blocking during and after account deletion.
 *  4. Cross-module deletion orchestration (Bargains, Buyer Alerts, Sponsors, Profile, Favorites, Crowd Claims).
 *  5. Media deletion coordination before Auth identity removal.
 *  6. Permanent deletion vs. retention-policy anonymization/legal hold tracking.
 *  7. Firebase Auth identity deletion strictly after dependent records complete.
 */

export type UserOwnedDomainSource =
  | 'USER_PROFILE'
  | 'FAVORITES_AND_WORKSPACES'
  | 'BUYER_ALERTS'
  | 'BARGAIN_LISTINGS'
  | 'SPONSOR_RECORDS'
  | 'CROWD_CLAIMS'
  | 'MEDIA_METADATA';

export const ALL_USER_OWNED_DOMAIN_SOURCES: readonly UserOwnedDomainSource[] = [
  'USER_PROFILE',
  'FAVORITES_AND_WORKSPACES',
  'BUYER_ALERTS',
  'BARGAIN_LISTINGS',
  'SPONSOR_RECORDS',
  'CROWD_CLAIMS',
  'MEDIA_METADATA',
] as const;

/**
 * Dependent domain sources that must be purged before Media and Auth deletion.
 */
export const DEPENDENT_PURGE_SOURCES: readonly UserOwnedDomainSource[] = [
  'BARGAIN_LISTINGS',
  'BUYER_ALERTS',
  'SPONSOR_RECORDS',
  'FAVORITES_AND_WORKSPACES',
  'USER_PROFILE',
] as const;

/**
 * Sources subject to retention/anonymization evaluation (Phase 3).
 */
export const RETENTION_POLICY_SOURCES: readonly UserOwnedDomainSource[] = [
  'CROWD_CLAIMS',
] as const;

export interface AccountLifecycleActorContext {
  uid: string;
  email?: string;
  isAdmin: boolean;
  freshAuthVerified: boolean;
  primaryBootstrapAdminEmail?: string;
}

export type UserWriteBlockState =
  | 'ACTIVE_WRITES_ALLOWED'
  | 'WRITE_BLOCKED_DELETION_IN_PROGRESS'
  | 'WRITE_BLOCKED_ACCOUNT_DELETED';

export interface DurableUserWriteBlockRecord {
  targetUid: string;
  state: UserWriteBlockState;
  activeDeletionJobId: string | null;
  blockedAtIso: string;
  updatedAtIso: string;
  reason: string;
  revision: number;
}

export interface OwnedDomainRecordItem {
  recordId: string;
  ownerUid: string;
  source: UserOwnedDomainSource;
  createdAtIso: string;
  updatedAtIso?: string;
  retentionClass?: 'STANDARD_PURGEABLE' | 'AUDIT_ANONYMIZE_RETAIN' | 'LEGAL_HOLD_RETAIN';
  retentionReason?: string;
  attachedMediaObjectIds?: string[];
  payload: Record<string, unknown>;
}

export interface PaginatedSourcePage<T = OwnedDomainRecordItem> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type RecordDispositionOutcome =
  | 'PERMANENTLY_DELETED'
  | 'ANONYMIZED_RETAINED_POLICY'
  | 'LEGAL_HOLD_RETAINED';

export interface RecordDispositionReceipt {
  recordId: string;
  source: UserOwnedDomainSource;
  outcome: RecordDispositionOutcome;
  retentionPolicyCode?: string;
  retentionReason?: string;
  processedAtIso: string;
}

export interface BatchDispositionResult {
  receipts: RecordDispositionReceipt[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Published repository adapter interface for any user-owned domain module
 * (Bargains, Buyer Alerts, Sponsors, Crowd Claims, Profile, Favorites, Media Metadata).
 */
export interface UserOwnedDomainRepositoryAdapter {
  readonly source: UserOwnedDomainSource;
  /**
   * Bounded paginated query for user-owned records.
   */
  fetchOwnedRecordsPage(params: {
    targetUid: string;
    cursor: string | null;
    pageSize: number;
  }): Promise<PaginatedSourcePage<OwnedDomainRecordItem>>;

  /**
   * Bounded paginated deletion or retention-policy disposition of user-owned records.
   * Must only return receipts for records whose durable operation succeeded.
   */
  disposeOwnedRecordsBatch(params: {
    targetUid: string;
    cursor: string | null;
    batchSize: number;
    jobId: string;
  }): Promise<BatchDispositionResult>;
}

/**
 * Explicit coordination interface for Employee 6 Media module cleanup.
 */
export interface MediaDeletionCoordinationAdapter {
  /**
   * Lists user-owned media object IDs in bounded pages.
   */
  listOwnedMediaPage(params: {
    targetUid: string;
    cursor: string | null;
    pageSize: number;
  }): Promise<{
    mediaItems: Array<{
      objectId: string;
      ownerUid: string;
      lifecycleState: string;
      originalFileName: string;
      mimeType: string;
      byteSize: number;
      createdAtIso: string;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  }>;

  /**
   * Coordinates durable deletion of a single media object (allowing attached target cleanup
   * during account deletion after dependent bargain/sponsor records are purged).
   */
  deleteOwnedMediaObject(params: {
    actor: AccountLifecycleActorContext;
    targetUid: string;
    objectId: string;
    jobId: string;
  }): Promise<{
    objectId: string;
    status: 'DELETED' | 'ALREADY_DELETED' | 'PENDING_RETRY';
    failureReason?: string;
  }>;
}

/**
 * Explicit adapter for Firebase Auth identity removal (executed strictly last).
 */
export interface AuthIdentityDeletionAdapter {
  deleteFirebaseAuthUser(params: {
    targetUid: string;
    jobId: string;
  }): Promise<{
    targetUid: string;
    status: 'DELETED' | 'ALREADY_DELETED';
    deletedAtIso: string;
  }>;
}

export type ExportCompletenessStatus = 'COMPLETE' | 'INCOMPLETE_PARTIAL';

export interface SourceExportProgressReport {
  source: UserOwnedDomainSource;
  status: 'COMPLETE' | 'FAILED_INCOMPLETE' | 'PAGINATION_LIMIT_INCOMPLETE';
  pagesFetched: number;
  recordsExported: number;
  lastCursor: string | null;
  hasMoreAtStop: boolean;
  failedPageNumber?: number;
  failureReason?: string;
}

export interface CompleteUserDataExportEnvelope {
  exportId: string;
  schemaVersion: '2026-05.account-export.v1';
  targetUid: string;
  requestedByUid: string;
  generatedAtIso: string;
  completenessStatus: ExportCompletenessStatus;
  isComplete: boolean;
  omittedOrFailedSources: UserOwnedDomainSource[];
  totalRecordsExported: number;
  totalPagesFetched: number;
  omittedPagesCount: number;
  sourceReports: Record<UserOwnedDomainSource, SourceExportProgressReport>;
  recordsBySource: Record<UserOwnedDomainSource, OwnedDomainRecordItem[]>;
}

export interface ExportUserDataOptions {
  pageSize?: number;
  maxPagesPerSource?: number;
  sources?: UserOwnedDomainSource[];
}

export type AccountDeletionJobState =
  | 'INITIATED_WRITE_BLOCKED'
  | 'PURGING_DEPENDENT_RECORDS'
  | 'CLEANING_UP_MEDIA'
  | 'APPLYING_RETENTION_POLICIES'
  | 'DELETING_AUTH_IDENTITY'
  | 'COMPLETED'
  | 'PARTIAL_FAILURE_RETRYABLE'
  | 'BLOCKED_MANUAL_REVIEW';

export type DeletionPhaseStepStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE';

export interface DomainDeletionStepJournal {
  source: UserOwnedDomainSource;
  status: DeletionPhaseStepStatus;
  resumableCursor: string | null;
  batchesProcessed: number;
  permanentlyDeletedIds: string[];
  retainedRecords: Array<{
    recordId: string;
    outcome: 'ANONYMIZED_RETAINED_POLICY' | 'LEGAL_HOLD_RETAINED';
    retentionPolicyCode?: string;
    retentionReason: string;
  }>;
  attempts: number;
  lastError?: string;
  updatedAtIso: string;
}

export interface MediaDeletionStepJournal {
  status: DeletionPhaseStepStatus;
  resumableCursor: string | null;
  deletedObjectIds: string[];
  pendingRetryObjectIds: string[];
  attempts: number;
  lastError?: string;
  updatedAtIso: string;
}

export interface AuthDeletionStepJournal {
  status: DeletionPhaseStepStatus;
  deletedAtIso: string | null;
  attempts: number;
  lastError?: string;
  updatedAtIso: string;
}

export interface DurableAccountDeletionJob {
  jobId: string;
  targetUid: string;
  targetEmail?: string;
  requestedByUid: string;
  reason: string;
  state: AccountDeletionJobState;
  writeBlockEnforced: boolean;
  domainSteps: Record<UserOwnedDomainSource, DomainDeletionStepJournal>;
  mediaStep: MediaDeletionStepJournal;
  authStep: AuthDeletionStepJournal;
  totalAttempts: number;
  createdAtIso: string;
  updatedAtIso: string;
  completedAtIso: string | null;
  lastFailureReason: string | null;
  revision: number;
}

export type AccountLifecycleErrorCode =
  | 'UNAUTHORIZED_ACTOR'
  | 'CROSS_USER_ACCESS_FORBIDDEN'
  | 'CROSS_USER_DATA_LEAK_DETECTED'
  | 'FRESH_AUTH_REQUIRED'
  | 'PRIMARY_ADMIN_PROTECTION_BLOCK'
  | 'USER_WRITES_BLOCKED_BY_DELETION'
  | 'JOB_NOT_FOUND'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'AUTH_DELETION_PRECONDITION_FAILED'
  | 'INVALID_PAGINATION_OPTIONS';

export class AccountLifecycleError extends Error {
  public readonly code: AccountLifecycleErrorCode;
  public readonly httpStatus: number;

  constructor(code: AccountLifecycleErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'AccountLifecycleError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** @file src/features/account/types/account.types.ts — User Account, Portability, Deletion & Workspace Types */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId, SavedMapViewItem } from '../../../navigation/registry/route.types';
import type { SavedPropertySnapshot } from '../../properties/services/listingService';
import type { PropertyListingRecord } from '../../properties/types/listing.types';
import type { SavedValuationReport } from '../../valuation/types/valuation.types';
import type { SavedMarketAnalysis } from '../../market/types/market.types';
import type { ServiceProposalRecord, ServiceRequestRecord } from '../../services/types/service.types';

export type UserRoleCapability = 'seeker' | 'owner' | 'advisor' | 'provider';
export type ActiveWorkspaceMode = 'personal' | 'listings_owner' | 'service_provider';
export type DataRequestStatus = 'ready' | 'pending_verification' | 'completed' | 'failed';
export type AccountExportScope = 'local_workspace' | 'server_account' | 'combined_account_and_workspace';

export interface AccountProfileSettings {
  ownerUserId: string;
  displayName: string;
  phoneMasked: string;
  preferredCityId: string;
  preferredPurpose: 'buy' | 'rent' | 'invest';
  activeRoles: UserRoleCapability[];
  activeWorkspaceMode: ActiveWorkspaceMode;
  subscriptionTier: 'free_explorer' | 'pro_analyst' | 'partner_agency';
  updatedAtIso: string;
}

export interface SavedSearchWatchlistItem {
  id: string;
  title: string;
  module: 'properties' | 'services' | 'neighborhoods';
  querySummaryFa: string;
  filtersSnapshot: Record<string, string | number | boolean>;
  alertCadence: 'off' | 'daily_digest' | 'instant_important';
  createdAtIso: string;
}

export interface AccountNotificationItem {
  id: string;
  category: 'price_alert' | 'service_proposal' | 'listing_status' | 'system_privacy';
  titleFa: string;
  bodyFa: string;
  createdAtIso: string;
  read: boolean;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
}

export interface NotificationChannelPreferences {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  browserPush: boolean;
  marketingOptIn: boolean;
  securityAlertsMandatory: true;
  updatedAtIso: string;
}

export interface AccountPrivacyPreferences {
  profileVisibility: 'private' | 'masked_for_requests';
  sharePhoneOnlyAfterConsent: boolean;
  receiveMarketingUpdates: boolean;
  storeSearchHistoryLocally: boolean;
  privacySafeTelemetryEnabled: boolean;
  updatedAtIso: string;
}

export interface UserSessionDevice {
  sessionId: string;
  deviceLabelFa: string;
  browserSummaryFa: string;
  lastActiveLabelFa: string;
  isCurrent: boolean;
  trusted: boolean;
}

export interface AccountActivityTimelineItem {
  id: string;
  kind: 'valuation' | 'property_save' | 'property_submit' | 'service_request' | 'visit_log' | 'privacy';
  titleFa: string;
  metaFa: string;
  timestampIso: string;
  targetView?: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
}

export interface AccountActionRequiredItem {
  id: string;
  kind: 'pending_proposal' | 'listing_review' | 'profile_setup';
  titleFa: string;
  subtitleFa: string;
  urgency: 'high' | 'medium';
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
}

export type AccountDeletionLifecycleState =
  | 'INITIATED_WRITE_BLOCKED'
  | 'PURGING_DEPENDENT_RECORDS'
  | 'CLEANING_UP_MEDIA'
  | 'APPLYING_RETENTION_POLICIES'
  | 'DELETING_AUTH_IDENTITY'
  | 'PARTIAL_FAILURE_RETRYABLE'
  | 'BLOCKED_MANUAL_REVIEW'
  | 'COMPLETED';

export const ACCOUNT_DELETION_LIFECYCLE_LABELS_FA: Record<AccountDeletionLifecycleState, string> = {
  INITIATED_WRITE_BLOCKED: 'درخواست ثبت شد؛ عملیات آغاز شده است',
  PURGING_DEPENDENT_RECORDS: 'در حال تعیین تکلیف اطلاعات حساب',
  CLEANING_UP_MEDIA: 'در حال پاکسازی رسانه‌ها',
  APPLYING_RETENTION_POLICIES: 'در حال اعمال سیاست نگهداری داده',
  DELETING_AUTH_IDENTITY: 'در حال حذف هویت حساب',
  PARTIAL_FAILURE_RETRYABLE: 'عملیات ناقص است و امکان ادامه دارد',
  BLOCKED_MANUAL_REVIEW: 'نیازمند بررسی دستی',
  COMPLETED: 'حذف حساب تکمیل شده است',
};

export type AccountExportDomainSourceId =
  | 'USER_PROFILE'
  | 'FAVORITES_AND_WORKSPACES'
  | 'BUYER_ALERTS'
  | 'BARGAIN_LISTINGS'
  | 'SPONSOR_RECORDS'
  | 'CROWD_CLAIMS'
  | 'MEDIA_METADATA';

export const ALL_SEVEN_ACCOUNT_EXPORT_SOURCES: readonly AccountExportDomainSourceId[] = [
  'USER_PROFILE',
  'FAVORITES_AND_WORKSPACES',
  'BUYER_ALERTS',
  'BARGAIN_LISTINGS',
  'SPONSOR_RECORDS',
  'CROWD_CLAIMS',
  'MEDIA_METADATA',
] as const;

export interface DataRequestRecord {
  id: string;
  ownerUserId?: string;
  kind: 'export' | 'delete';
  status: DataRequestStatus;
  lifecycleState?: AccountDeletionLifecycleState;
  origin?: 'server' | 'local_browser';
  jobId?: string;
  scope?: AccountExportScope;
  errorCode?: string;
  retentionNotesFa: string;
  createdAtIso: string;
  updatedAtIso?: string;
}

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  ready: 'آماده دانلود',
  pending_verification: 'منتظر تأیید هویت',
  completed: 'تکمیل‌شده',
  failed: 'ناموفق',
};

export interface AccountExportSourceInfo {
  sourceId: string;
  domainSource?: AccountExportDomainSourceId;
  origin: 'server' | 'local_workspace';
  included: boolean;
  available: boolean;
  count?: number;
  omittedPagesCount?: number;
  reasonFa?: string;
}

export interface ServerAccountExportEnvelope {
  schemaVersion: string;
  exportedAtIso: string;
  ownerUid: string;
  exportScope?: 'server_account';
  isPartialExport?: boolean;
  completenessStatus?: 'COMPLETE' | 'INCOMPLETE_PARTIAL';
  totalRecordsExported?: number;
  omittedPagesCount?: number;
  unavailableSources?: string[];
  domainSourcesIncluded?: AccountExportDomainSourceId[];
  sources?: Array<AccountExportSourceInfo | { id: string; domainSource?: AccountExportDomainSourceId; origin: 'server'; available: boolean; count: number; omittedPagesCount?: number }>;
  excludedSources?: Array<AccountExportSourceInfo | string>;
  profile: Record<string, unknown>;
  favoriteNeighborhoodKeys: string[];
  savedAlerts: unknown[];
  publishedListings: unknown[];
  calculationSnapshots: unknown[];
  buyerLeads?: unknown[];
  dataCorrections?: unknown[];
  sponsorRecords?: unknown[];
  crowdClaims?: unknown[];
  mediaObjects?: unknown[];
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
}

export type CloudflareAccountDeletionJobStatus =
  | 'INITIATED'
  | 'BLOCKED_LEGAL_HOLD'
  | 'PENDING_PERMIT_DRAIN'
  | 'PENDING_RESEARCH_ERASURE'
  | 'COMPLETED'
  | 'FAILED';

export interface ServerAccountDeletionPayload {
  ok: boolean;
  status: CloudflareAccountDeletionJobStatus;
  statusCode: number;
  jobId: string;
  idempotentReplay: boolean;
  userDbDeletedRecords: number;
  outboxItemsQueued: number;
  outboxItemsCompleted: number;
  researchEventsErased: number;
  receiptHash: string | null;
  code: string;
}

export type AccountActionErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'OWNER_MISMATCH'
  | 'RECENT_LOGIN_REQUIRED'
  | 'AUTH_DELETE_FAILED'
  | 'AUTH_DELETION_PRECONDITION_FAILED'
  | 'DOWNLOAD_FAILED';

export type AccountActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AccountActionErrorCode; httpStatus?: number; messageFa: string; retryable: boolean; data?: T };

export interface AccountDeleteLayerStatus {
  jobId?: string;
  lifecycleState: AccountDeletionLifecycleState;
  lifecycleLabelFa: string;
  serverDeletion: 'completed' | 'partial' | 'failed';
  localCleanup: 'completed' | 'skipped_server_incomplete' | 'failed';
  authDeletion: 'completed' | 'requires_reauth' | 'blocked_by_incomplete_server_steps' | 'failed' | 'not_required';
  overallStatus: 'completed' | 'partial' | 'failed';
  requestStatus: DataRequestStatus;
  removedLocalKeysCount: number;
  messageFa: string;
  requiresSignOut: boolean;
}

export interface AccountWorkspaceSnapshot {
  ownerUserId?: string;
  profile: AccountProfileSettings;
  privacy: AccountPrivacyPreferences;
  notificationChannels: NotificationChannelPreferences;
  savedProperties: SavedPropertySnapshot[];
  myListings: PropertyListingRecord[];
  savedValuations: SavedValuationReport[];
  savedMarketAnalyses: SavedMarketAnalysis[];
  savedMapViews: SavedMapViewItem[];
  savedSearches: SavedSearchWatchlistItem[];
  serviceRequests: ServiceRequestRecord[];
  serviceProposals: ServiceProposalRecord[];
  notifications: AccountNotificationItem[];
  sessions: UserSessionDevice[];
  activityTimeline: AccountActivityTimelineItem[];
  actionRequired: AccountActionRequiredItem[];
  dataRequests: DataRequestRecord[];
}

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

export interface DataRequestRecord {
  id: string;
  ownerUserId?: string;
  kind: 'export' | 'delete';
  status: DataRequestStatus;
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
  origin: 'server' | 'local_workspace';
  included: boolean;
  available: boolean;
  count?: number;
  reasonFa?: string;
}

export interface ServerAccountExportEnvelope {
  schemaVersion: string;
  exportedAtIso: string;
  ownerUid: string;
  exportScope?: 'server_account';
  isPartialExport?: boolean;
  unavailableSources?: string[];
  sources?: Array<AccountExportSourceInfo | { id: string; origin: 'server'; available: boolean; count: number }>;
  excludedSources?: Array<AccountExportSourceInfo | string>;
  profile: Record<string, unknown>;
  favoriteNeighborhoodKeys: string[];
  savedAlerts: unknown[];
  publishedListings: unknown[];
  calculationSnapshots: unknown[];
  buyerLeads?: unknown[];
  dataCorrections?: unknown[];
  mediaObjects?: unknown[];
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
}

export interface ServerAccountDeletionStep {
  category: string;
  policy: 'delete' | 'anonymize';
  completed: boolean;
}

export interface ServerAccountDeletionPayload {
  status: 'ok' | 'partial';
  steps: ServerAccountDeletionStep[];
  requiresClientAuthDeletion: boolean;
  failedSteps: string[];
  clearClientLocalStorageKeys: string[];
  deletedMediaCount: number;
  failedMediaCount: number;
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
  | 'DOWNLOAD_FAILED';

export type AccountActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AccountActionErrorCode; httpStatus?: number; messageFa: string; retryable: boolean; data?: T };

export interface AccountDeleteLayerStatus {
  serverDeletion: 'completed' | 'partial' | 'failed';
  localCleanup: 'completed' | 'failed';
  authDeletion: 'completed' | 'requires_reauth' | 'failed' | 'not_required';
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

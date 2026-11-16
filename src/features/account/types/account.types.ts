/** @file src/features/account/types/account.types.ts — Stage 22 User Account & Personal Workspace Types */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId, SavedMapViewItem } from '../../../navigation/registry/route.types';
import type { SavedPropertySnapshot } from '../../properties/services/listingService';
import type { PropertyListingRecord } from '../../properties/types/listing.types';
import type { SavedValuationReport } from '../../valuation/types/valuation.types';
import type { SavedMarketAnalysis } from '../../market/types/market.types';
import type { ServiceProposalRecord, ServiceRequestRecord } from '../../services/types/service.types';

export type UserRoleCapability = 'seeker' | 'owner' | 'advisor' | 'provider';
export type ActiveWorkspaceMode = 'personal' | 'listings_owner' | 'service_provider';

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
  kind: 'export' | 'delete';
  status: 'ready' | 'pending_verification' | 'completed';
  retentionNotesFa: string;
  createdAtIso: string;
}

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestRecord['status'], string> = {
  ready: 'آماده اجرا',
  pending_verification: 'منتظر تأیید هویت',
  completed: 'تکمیل‌شده',
};

export interface AccountWorkspaceSnapshot {
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

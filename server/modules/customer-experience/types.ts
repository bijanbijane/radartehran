/**
 * Employee 64 — Real Estate Customer Experience, User Profiles, Personalization & Engagement Backend
 * (`server/modules/customer-experience/types.ts`)
 *
 * Exclusive ownership: `server/modules/customer-experience/`
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core/types';
import type {
  PropertySearchQueryFilters,
} from '../property-search/types';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
export type SupportedLocale = 'fa' | 'en' | 'ar' | 'tr';
export type SupportedCurrency = 'IRT' | 'IRR' | 'USD' | 'EUR' | 'AED';
export type SupportedAreaUnit = 'sqm' | 'sqft';
export type SupportedCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export interface CustomerCatalogPropertyItem {
  id: string;
  title: string;
  cityId: SupportedCityId | string;
  districtNumber: number;
  neighborhoodId: number;
  neighborhoodName: string;
  propertyCategory: PreferredPropertyCategory;
  propertyType: string;
  transactionType: PreferredTransactionType;
  lifecycleState: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
  moderationState: 'PENDING' | 'APPROVED' | 'REJECTED';
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  ownerUid: string;
  totalPriceMillions: number;
  pricePerSqmMillions: number;
  depositMillions: number;
  monthlyRentMillions: number;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  floorNumber: number;
  totalFloors: number;
  buildingAgeYears: number;
  amenities: string[];
  coordinates: { lat: number; lng: number };
  featuredRank: number;
  qualityScore: number;
  verifiedFlag: boolean;
  hasPhotos: boolean;
  hasVideo: boolean;
  has3dTour: boolean;
  bargainDiscountPercent?: number;
  publishedAt: string;
  updatedAt: string;
}

// ============================================================================
// 2. USER PROFILE DOMAIN & 10. ACCOUNT LIFECYCLE / ONBOARDING
// ============================================================================

export type AccountLifecycleStatus =
  | 'PENDING_ONBOARDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'CLOSURE_REQUESTED'
  | 'CLOSED';

export type ProfileCompletionStatus = 'INCOMPLETE' | 'PARTIAL' | 'COMPLETE';

export interface ProfileVisibilitySettings {
  showPublicProfile: boolean;
  showAvatarPublicly: boolean;
  showBioPublicly: boolean;
  showVerifiedBadgesPublicly: boolean;
  showCityPublicly: boolean;
  contactDisclosureMode: 'PRIVATE' | 'INQUIRY_AUTHORIZED_ONLY' | 'PUBLIC_FOR_PROFESSIONALS';
}

export interface ProfileVerificationReferences {
  emailVerified: boolean;
  phoneVerified: boolean;
  professionalCredentialIds: string[];
  identityVerificationRefId: string | null;
  verifiedAtIso: string | null;
}

export interface OnboardingCheckpointState {
  profileBasicsCompleted: boolean;
  preferencesConfigured: boolean;
  neighborhoodInterestsSelected: boolean;
  privacyConsentAcknowledged: boolean;
  firstSearchOrSavedPropertyCompleted: boolean;
  currentStep: 'WELCOME' | 'PROFILE_BASICS' | 'PREFERENCES' | 'NEIGHBORHOODS' | 'PRIVACY' | 'COMPLETED';
  completedAtIso: string | null;
  skippedAtIso: string | null;
  updatedAtIso: string;
}

export interface ProfileRevisionEntry {
  revisionNumber: number;
  changedByUid: string;
  changedFields: string[];
  reason?: string;
  timestampIso: string;
}

export interface UserPublicProfileView {
  uid: string;
  displayName: string;
  avatarObjectId: string | null;
  avatarUrl: string | null;
  bio: string | null;
  primaryCityId: SupportedCityId | null;
  verificationSummary: {
    emailVerified: boolean;
    hasVerifiedProfessionalCredentials: boolean;
    professionalCredentialIds: string[];
  };
  publicContactPhone?: string;
  accountStatus: 'ACTIVE' | 'RESTRICTED';
  memberSinceIso: string;
  updatedAtIso: string;
}

export interface UserPrivateProfileRecord {
  uid: string;
  email: string;
  displayName: string;
  avatarObjectId: string | null;
  avatarUrl: string | null;
  bio: string;
  contactPhone: string | null;
  secondaryEmail: string | null;
  preferredContactMethod: 'IN_APP' | 'PHONE' | 'EMAIL' | 'SMS';
  primaryCityId: SupportedCityId;
  visibility: ProfileVisibilitySettings;
  verification: ProfileVerificationReferences;
  completionStatus: ProfileCompletionStatus;
  completionPercent: number;
  lifecycleStatus: AccountLifecycleStatus;
  restrictionReason: string | null;
  restrictedByAdminUid: string | null;
  restrictedAtIso: string | null;
  closureRequestId: string | null;
  onboarding: OnboardingCheckpointState;
  revision: number;
  revisionHistory: ProfileRevisionEntry[];
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 3. USER PREFERENCES & PERSONALIZATION
// ============================================================================

export type PreferredPropertyCategory =
  | 'residential'
  | 'commercial'
  | 'office'
  | 'land'
  | 'industrial'
  | 'villa';

export type PreferredTransactionType = 'buy' | 'rent' | 'full_mortgage' | 'pre_sale' | 'participatory';

export interface UserPersonalizationPreferences {
  uid: string;
  localization: {
    locale: SupportedLocale;
    currency: SupportedCurrency;
    areaUnit: SupportedAreaUnit;
    calendarSystem: 'jalali' | 'gregorian';
  };
  geographic: {
    activeCityId: SupportedCityId;
    preferredCityIds: SupportedCityId[];
    preferredNeighborhoodIds: number[];
    preferredDistrictNumbers: number[];
    commuteWorkHubId: string | null;
    maxCommuteMinutes: number | null;
    preferOutsideTrafficZone: boolean;
    preferNearMetro: boolean;
  };
  propertyInterests: {
    categories: PreferredPropertyCategory[];
    transactionTypes: PreferredTransactionType[];
    buyBudgetRangeMillions: { min: number; max: number };
    depositRangeMillions: { min: number; max: number };
    monthlyRentRangeMillions: { min: number; max: number };
    sizeSqmRange: { min: number; max: number };
    bedroomsRange: { min: number; max: number };
    maxBuildingAgeYears: number | null;
    requiredAmenities: ('parking' | 'elevator' | 'storage' | 'balcony' | 'lobby' | 'security_guard')[];
  };
  interfaceAndAccessibility: {
    theme: 'light' | 'dark' | 'system';
    reducedMotion: boolean;
    highContrast: boolean;
    fontScale: 'normal' | 'large' | 'x_large';
    defaultPrimaryView: 'map' | 'discover' | 'intelligence' | 'tools' | 'home' | 'userspace';
    defaultMapLens: 'budget' | 'heatmap' | 'bubble' | 'air';
  };
  notifications: {
    channels: Record<NotificationChannel, boolean>;
    priceDropAlertsEnabled: boolean;
    savedSearchAlertsEnabled: boolean;
    marketPulseDigestEnabled: boolean;
    inquiryRepliesEnabled: boolean;
    quietHoursUtc: { enabled: boolean; startHour: number; endHour: number };
  };
  personalization: {
    personalizedRecommendationsEnabled: boolean;
    saveRecentViewHistory: boolean;
    saveSearchHistory: boolean;
    recentHistoryRetentionDays: 7 | 30 | 90 | 180;
  };
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 4. SAVED PROPERTIES, FAVORITES & NAMED COLLECTIONS
// ============================================================================

export type SavedPropertyAvailabilityState =
  | 'AVAILABLE'
  | 'UNPUBLISHED'
  | 'DELETED'
  | 'RESTRICTED'
  | 'EXPIRED';

export interface SavedPropertyItemRecord {
  id: string;
  ownerUid: string;
  propertyId: string;
  collectionIds: string[];
  isFavorite: boolean;
  privateNote: string;
  customTags: string[];
  savedPriceMillionsSnapshot: number | null;
  cityIdSnapshot: SupportedCityId;
  hoodIdSnapshot: number;
  titleSnapshot: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface HydratedSavedPropertyView extends SavedPropertyItemRecord {
  availabilityState: SavedPropertyAvailabilityState;
  currentPriceMillions: number | null;
  priceDeltaMillions: number | null;
  liveSummary: {
    title: string;
    sqm: number;
    dealType: string;
    hoodName: string;
    discountPercent?: number;
  } | null;
}

export interface PropertyCollectionRecord {
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  privateNote: string;
  isDefaultFavorites: boolean;
  displayOrder: number;
  propertyIds: string[];
  visibility: 'PRIVATE' | 'SHARED_READONLY_TOKEN';
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 5. SAVED SEARCHES & 6. SEARCH ALERTS / SUBSCRIPTIONS
// ============================================================================

export interface CustomerSavedSearchRecord {
  id: string;
  ownerUid: string;
  title: string;
  schemaVersion: number;
  filters: PropertySearchQueryFilters;
  compatibilityNotes: string[];
  isPinned: boolean;
  lastExecutedAtIso: string | null;
  lastMatchedCount: number | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export type SearchAlertStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DISABLED_BY_ADMIN' | 'INVALID_CRITERIA';
export type SearchAlertFrequency = 'INSTANT' | 'HOURLY' | 'DAILY' | 'WEEKLY';

export interface SearchAlertSubscriptionRecord {
  id: string;
  ownerUid: string;
  savedSearchId: string;
  title: string;
  criteriaFingerprint: string;
  status: SearchAlertStatus;
  frequency: SearchAlertFrequency;
  channels: NotificationChannel[];
  lastExecutedAtIso: string | null;
  lastSuccessAtIso: string | null;
  lastDeliveredNotificationId: string | null;
  lastDeliveredPropertyIds: string[];
  lastExecutionStatus: 'IDLE' | 'SUCCEEDED' | 'NO_NEW_MATCHES' | 'SKIPPED_RATE_LIMIT' | 'FAILED';
  consecutiveFailures: number;
  dailyExecutionCount: number;
  dailyExecutionWindowDate: string;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SearchAlertExecutionResult {
  alertId: string;
  jobExecutionKey: string;
  replayed: boolean;
  status: 'DELIVERED' | 'NO_NEW_MATCHES' | 'SKIPPED_INACTIVE' | 'SKIPPED_QUOTA' | 'SKIPPED_EXPIRED' | 'FAILED';
  matchedPropertyIds: string[];
  newPropertyIds: string[];
  notificationOutboxId: string | null;
  executedAtIso: string;
}

// ============================================================================
// 7. USER-FACING ACTIVITY & RECENTLY VIEWED PROPERTIES
// ============================================================================

export type UserActivityActionType =
  | 'VIEWED_PROPERTY'
  | 'VIEWED_NEIGHBORHOOD'
  | 'EXECUTED_SAVED_SEARCH'
  | 'CALCULATED_HEDONIC_VALUATION'
  | 'COMPARED_NEIGHBORHOODS';

export interface UserActivityEntryRecord {
  id: string;
  ownerUid: string;
  actionType: UserActivityActionType;
  targetId: string;
  targetType: 'PROPERTY' | 'NEIGHBORHOOD' | 'SAVED_SEARCH';
  cityId: SupportedCityId;
  hoodId: number | null;
  summaryTitle: string;
  priceMillionsSnapshot: number | null;
  sqmSnapshot: number | null;
  viewedCount: number;
  firstViewedAtIso: string;
  lastViewedAtIso: string;
  expiresAtIso: string;
}

// ============================================================================
// 8. USER DASHBOARD AGGREGATION
// ============================================================================

export type DashboardSectionStatus = 'OK' | 'PARTIAL_UNAVAILABLE' | 'UNAUTHORIZED' | 'DISABLED';

export interface DashboardSectionEnvelope<T> {
  status: DashboardSectionStatus;
  data: T | null;
  errorCode?: string;
}

export interface UserDashboardAggregateView {
  uid: string;
  generatedAtIso: string;
  profileSummary: DashboardSectionEnvelope<{
    displayName: string;
    completionStatus: ProfileCompletionStatus;
    completionPercent: number;
    lifecycleStatus: AccountLifecycleStatus;
    onboardingStep: OnboardingCheckpointState['currentStep'];
    verifiedBadgesCount: number;
  }>;
  savedPropertiesSummary: DashboardSectionEnvelope<{
    totalFavoritesCount: number;
    totalSavedCount: number;
    collectionsCount: number;
    recentFavorites: HydratedSavedPropertyView[];
  }>;
  savedSearchesSummary: DashboardSectionEnvelope<{
    activeSavedSearchesCount: number;
    items: CustomerSavedSearchRecord[];
  }>;
  searchAlertsSummary: DashboardSectionEnvelope<{
    activeAlertsCount: number;
    pausedAlertsCount: number;
    items: SearchAlertSubscriptionRecord[];
  }>;
  recentlyViewedSummary: DashboardSectionEnvelope<{
    totalCount: number;
    items: UserActivityEntryRecord[];
  }>;
  ownedListingsSummary: DashboardSectionEnvelope<{
    totalCount: number;
    byLifecycleState: Record<string, number>;
    items: Array<{
      id: string;
      title: string;
      cityId: string;
      hoodId: number;
      priceMillions: number;
      lifecycleState: string;
      updatedAtIso: string;
    }>;
  }>;
  inquiriesAndLeadsSummary: DashboardSectionEnvelope<{
    submittedInquiriesCount: number;
    receivedInquiriesCount: number;
    activeBuyerAlertsCount: number;
    scheduledViewingsCount: number;
  }>;
  transactionsAndTenanciesSummary: DashboardSectionEnvelope<{
    activeTransactionsCount: number;
    activeTenanciesCount: number;
    relevantDocumentIds: string[];
  }>;
  notificationsSummary: DashboardSectionEnvelope<{
    unreadCount: number;
  }>;
}

// ============================================================================
// 9. PRIVACY, CONSENT & USER DATA RIGHTS
// ============================================================================

export type ConsentPurpose =
  | 'ESSENTIAL_ACCOUNT_SERVICE'
  | 'PROPERTY_SEARCH_ALERTS'
  | 'PERSONALIZED_RECOMMENDATIONS'
  | 'ACTIVITY_HISTORY_STORAGE'
  | 'MARKETING_COMMUNICATIONS'
  | 'PUBLIC_DIRECTORY_LISTING';

export interface UserConsentRecord {
  id: string;
  ownerUid: string;
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
  scopeDescription: string;
  grantedAtIso: string | null;
  withdrawnAtIso: string | null;
  revision: number;
  updatedAtIso: string;
}

export type DataRightsRequestType =
  | 'DATA_ACCESS'
  | 'DATA_EXPORT'
  | 'DATA_CORRECTION'
  | 'ACCOUNT_CLOSURE_AND_DELETION';

export type DataRightsRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_ADMIN_REVIEW'
  | 'ORCHESTRATING_DOMAINS'
  | 'BLOCKED_BY_LEGAL_HOLD'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED_BY_USER';

export interface DomainCompletionConfirmation {
  domain:
    | 'PROFILE_AND_PREFERENCES'
    | 'SAVED_PROPERTIES_AND_SEARCHES'
    | 'ACTIVITY_AND_UGC'
    | 'LISTINGS_AND_MEDIA'
    | 'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK'
    | 'LEGAL_HOLD_AND_AUDIT_CHECK';
  completed: boolean;
  disposition: 'PURGED' | 'ANONYMIZED' | 'RETAINED_BY_LAW' | 'EXPORTED' | 'PENDING';
  confirmedAtIso: string | null;
  notes?: string;
}

export interface DataRightsRequestRecord {
  id: string;
  ownerUid: string;
  requestType: DataRightsRequestType;
  status: DataRightsRequestStatus;
  reason: string;
  correctionPayload?: Record<string, unknown>;
  legalHoldActive: boolean;
  legalHoldReasons: string[];
  retainedRecordReferences: string[];
  domainConfirmations: DomainCompletionConfirmation[];
  exportDocumentArtifactId: string | null;
  lifecycleJobId: string | null;
  adminReviewerUid: string | null;
  adminReviewNotes: string | null;
  submittedAtIso: string;
  reviewedAtIso: string | null;
  completedAtIso: string | null;
  updatedAtIso: string;
}

// ============================================================================
// 11. USER-GENERATED CONTENT (REVIEWS, RATINGS, FEEDBACK)
// ============================================================================

export type UgcTargetType = 'PROPERTY_LISTING' | 'NEIGHBORHOOD';
export type UgcVisibilityState = 'PUBLISHED' | 'PENDING_MODERATION' | 'HIDDEN_BY_MODERATOR' | 'DELETED_BY_AUTHOR';
export type UgcModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED_ABUSE';

export interface UgcEditHistoryEntry {
  revision: number;
  previousComment: string;
  previousRating: number;
  editedAtIso: string;
}

export interface UgcAbuseReportReference {
  reportId: string;
  reporterUid: string;
  reason: 'SPAM' | 'HARASSMENT' | 'FAKE_REVIEW' | 'PRIVATE_PII_EXPOSURE' | 'OFF_TOPIC';
  details: string;
  createdAtIso: string;
}

export interface UserGeneratedPropertyContentRecord {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  targetType: UgcTargetType;
  targetId: string;
  cityId: SupportedCityId;
  hoodId: number;
  overallRating: number;
  structuredRatings: {
    valueForMoney: number;
    buildingAndLocationQuality: number;
    accuracyOfListing: number;
  };
  comment: string;
  prosTags: string[];
  consTags: string[];
  visibility: UgcVisibilityState;
  moderationStatus: UgcModerationStatus;
  moderatedByUid: string | null;
  moderationNote: string | null;
  moderatedAtIso: string | null;
  abuseReports: UgcAbuseReportReference[];
  editHistory: UgcEditHistoryEntry[];
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 14. DOMAIN EVENTS & ADAPTER CONTRACTS
// ============================================================================

export type CustomerExperienceDomainEventType =
  | 'cx.profile.updated'
  | 'cx.preferences.updated'
  | 'cx.favorite.changed'
  | 'cx.collection.changed'
  | 'cx.saved_search.changed'
  | 'cx.search_alert.changed'
  | 'cx.privacy_request.changed'
  | 'cx.account_lifecycle.changed'
  | 'cx.ugc.changed';

export interface CustomerExperienceDomainEvent {
  eventId: string;
  eventType: CustomerExperienceDomainEventType;
  actorUid: string;
  targetUid: string;
  resourceId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  occurredAtIso: string;
}

export interface PropertyCatalogLookupAdapter {
  getPropertyById(propertyId: string, requesterUid?: string): Promise<{
    exists: boolean;
    accessible: boolean;
    availabilityState: SavedPropertyAvailabilityState;
    item?: CustomerCatalogPropertyItem;
  }>;
  executeSavedSearchFilters(
    filters: PropertySearchQueryFilters,
    pagination: { limit: number; cursor?: string | null },
  ): Promise<{
    items: CustomerCatalogPropertyItem[];
    totalMatchedCount: number;
    nextCursor: string | null;
    hasMore: boolean;
  }>;
  listUserOwnedListings(ownerUid: string): Promise<
    Array<{
      id: string;
      title: string;
      cityId: string;
      hoodId: number;
      priceMillions: number;
      lifecycleState: string;
      updatedAtIso: string;
    }>
  >;
}

export interface CrossModuleDashboardDataAdapter {
  getInquiriesAndLeadsCounts?(uid: string): Promise<{
    submittedInquiriesCount: number;
    receivedInquiriesCount: number;
    activeBuyerAlertsCount: number;
    scheduledViewingsCount: number;
  }>;
  getTransactionsAndTenanciesSummary?(uid: string): Promise<{
    activeTransactionsCount: number;
    activeTenanciesCount: number;
    relevantDocumentIds: string[];
    hasActiveFinancialOrContractualObligations: boolean;
  }>;
  getUnreadNotificationsCount?(uid: string): Promise<number>;
  dispatchAlertNotification?(params: {
    recipientUid: string;
    alertId: string;
    alertTitle: string;
    channels: NotificationChannel[];
    matchedProperties: CustomerCatalogPropertyItem[];
    idempotencyKey: string;
  }): Promise<{ delivered: boolean; notificationId: string | null }>;
  generateExportArtifactDocument?(params: {
    ownerUid: string;
    requestId: string;
    exportPayload: Record<string, unknown>;
  }): Promise<{ artifactDocumentId: string }>;
}

export interface CustomerExperienceModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  idempotencyStore?: IdempotencyStoreAdapter;
  primaryAdminEmails?: string[];
  propertyCatalogAdapter?: PropertyCatalogLookupAdapter;
  crossModuleAdapter?: CrossModuleDashboardDataAdapter;
  onDomainEvent?: (event: CustomerExperienceDomainEvent) => Promise<void> | void;
}

export type { AuthenticatedPrincipal };

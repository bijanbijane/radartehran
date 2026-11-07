import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type SupportedCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export type BuyerAlertDealType = 'خرید' | 'اجاره';

export type BuyerAlertLifecycleStatus =
  | 'active'
  | 'contacted'
  | 'withdrawn'
  | 'expired'
  | 'archived';

export type ContactChannelType = 'ir_mobile' | 'email' | 'telegram';

export interface ContactChannelDescriptor {
  channel: ContactChannelType;
  value: string;
  primary?: boolean;
}

/**
 * Explicit user-action consent evidence required at submission time.
 * Bare `privacyConsent: true` without explicit action metadata is rejected.
 */
export interface ConsentEvidenceInput {
  privacyConsent: true;
  consentVersion: string;
  explicitUserAction: 'checkbox_checked' | 'modal_confirm_clicked';
  acknowledgedRetentionDays: number;
  clientAcceptedAtIso?: string;
}

export interface StoredConsentEvidence {
  consentVersion: string;
  explicitUserAction: 'checkbox_checked' | 'modal_confirm_clicked';
  acknowledgedRetentionDays: number;
  consentAt: NormalizedTimestamp;
  clientAcceptedAtIso?: string;
}

/**
 * Configurable business policy so product decisions (multiplicity per neighborhood,
 * consent versions, retention periods, and supported contact channels) do not require
 * redesigning the module.
 */
export interface BuyerAlertBusinessPolicy {
  multiplicityMode: 'single_per_city_hood' | 'multiple_per_city_hood';
  acceptedConsentVersions: readonly string[];
  retentionDays: {
    defaultDays: number;
    minDays: number;
    maxDays: number;
  };
  allowedContactChannels: readonly ContactChannelType[];
}

/**
 * Canonical Firestore document stored at `/buyerAlerts/{alertId}`.
 * Uses normalized Firestore Timestamp descriptors consistently across all lifecycle timestamps.
 */
export interface StoredBuyerAlertDocument {
  id: string;
  logicalScopeKey: string;
  ownerUid: string;
  userId: string;
  cityId: SupportedCityId;
  hoodId: number;
  hoodName: string;
  fullName: string;
  primaryPhone?: string;
  contactChannels: ContactChannelDescriptor[];
  dealType: BuyerAlertDealType;
  maxBudgetText: string;
  status: BuyerAlertLifecycleStatus;
  revision: number;
  consentEvidence: StoredConsentEvidence;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
  expiresAt: NormalizedTimestamp;
  withdrawnAt?: NormalizedTimestamp;
  withdrawalReason?: string;
}

/**
 * Owner-authorized projection returned to the authenticated owner of the alert.
 */
export interface OwnerBuyerAlertView {
  id: string;
  ownerUid: string;
  cityId: SupportedCityId;
  hoodId: number;
  hoodName: string;
  fullName: string;
  contactChannels: ContactChannelDescriptor[];
  dealType: BuyerAlertDealType;
  maxBudgetText: string;
  status: BuyerAlertLifecycleStatus;
  revision: number;
  consentVersion: string;
  consentAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso: string;
  withdrawnAtIso?: string;
}

/**
 * Admin/CRM view containing full lead and consent audit metadata.
 * Restricted strictly to verified primary or delegated administrators.
 */
export interface AdminCrmBuyerAlertView extends OwnerBuyerAlertView {
  logicalScopeKey: string;
  primaryPhone?: string;
  explicitUserAction: string;
  acknowledgedRetentionDays: number;
}

export interface CreateBuyerAlertInput {
  cityId: SupportedCityId;
  hoodId: number;
  fullName: string;
  dealType: BuyerAlertDealType;
  maxBudgetText: string;
  contactChannels: ContactChannelDescriptor[];
  consentEvidence: ConsentEvidenceInput;
  requestedRetentionDays?: number;
}

export interface UpdateBuyerAlertInput {
  expectedRevision: number;
  fullName?: string;
  dealType?: BuyerAlertDealType;
  maxBudgetText?: string;
  contactChannels?: ContactChannelDescriptor[];
}

export interface WithdrawBuyerAlertInput {
  expectedRevision: number;
  reason?: string;
}

export interface ResolvedCityNeighborhood {
  cityId: SupportedCityId;
  hoodId: number;
  hoodName: string;
}

export interface NeighborhoodDirectoryAdapter {
  resolveCityNeighborhood: (
    cityId: SupportedCityId,
    hoodId: number,
  ) => ResolvedCityNeighborhood | null;
}

export interface BuyerAlertQueryAdapter {
  listByOwner: (params: {
    ownerUid: string;
    limit: number;
    afterCursor?: { sortEpochMs: number; docId: string } | null;
  }) => Promise<StoredBuyerAlertDocument[]>;
  listForAdminCrm: (params: {
    cityId?: SupportedCityId;
    hoodId?: number;
    includeInactive?: boolean;
    limit: number;
    afterCursor?: { sortEpochMs: number; docId: string } | null;
  }) => Promise<StoredBuyerAlertDocument[]>;
}

export interface BuyerAlertsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  queryAdapter?: BuyerAlertQueryAdapter;
  neighborhoodDirectory?: NeighborhoodDirectoryAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  businessPolicy?: Partial<BuyerAlertBusinessPolicy>;
  primaryAdminEmails?: string[];
  cursorSecret?: string;
  nowFn?: () => number;
}

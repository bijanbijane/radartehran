import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';

/**
 * Canonical lifecycle states for a property bargain listing.
 * - `pending`: Newly created or owner-updated listing awaiting admin moderation.
 * - `approved`: Moderated and publicly visible (until `expiresAtIso`, if set).
 * - `rejected`: Moderated and rejected by an admin; owner may revise and resubmit to `pending`.
 * - `withdrawn`: Voluntarily withdrawn by the owner; terminal state.
 * - `expired`: Passed `expiresAtIso`; terminal state unless renewed via a new submission.
 */
export type BargainLifecycleStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

/**
 * Canonical Persian property deal taxonomy preserved from legacy BargainListing (`src/types/models.ts`).
 *
 * Explicit Domain Documentation:
 * - Unresolved Price Semantics: `priceText` and `buyerProfitText` are human-readable display strings
 *   (e.g. "۱۲.۴ میلیارد تومان"). This module NEVER invents or parses synthetic numeric prices from
 *   display strings. Optional verified numeric fields may only be stored if explicitly supplied via
 *   the separate financial validation workflow.
 * - Property Taxonomy: Preserves canonical `'خرید' | 'اجاره'` taxonomy without guessing residential/commercial sub-types.
 * - Location Precision: Scoped to neighborhood ID (`hoodId`: 1..999) plus street-level text (`street`);
 *   exact building coordinates or postal plates are intentionally omitted from public projections.
 */
export type BargainDealType = 'خرید' | 'اجاره';

export interface BargainMediaAttachments {
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  objectStorageBucket?: string;
  objectStorageKeys?: string[];
  objectStorageObjectIds?: string[];
}

/**
 * Canonical ownership record stored at `/bargainOwners/{bargainId}`.
 * Invariant: Every bargain in `/bargains/{bargainId}` MUST have exactly one corresponding
 * `/bargainOwners/{bargainId}` document whose `userId` is the verified Firebase principal UID.
 */
export interface BargainOwnershipRecord {
  bargainId: string;
  userId: string;
  createdAtIso: string;
}

/**
 * Canonical stored bargain document in `/bargains/{bargainId}`.
 * Note: `userId` is intentionally stored in `/bargainOwners/{bargainId}` to preserve compatibility
 * with `firestore.rules` (`isValidBargainSubmission` / `isValidBargainOwner`).
 */
export interface StoredBargainDocument extends BargainMediaAttachments {
  id: string;
  hoodId: number;
  title: string;
  type: BargainDealType;
  sqm: number;
  priceText: string;
  discountPercent: number;
  buyerProfitText: string;
  street: string;
  status: BargainLifecycleStatus;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso?: string;
  approvedAtIso?: string;
  approvedBy?: string;
}

/**
 * Private moderation and revision metadata stored at `/bargainModeration/{bargainId}`.
 * Kept strictly separate from public listing projections.
 */
export interface BargainModerationRecord {
  bargainId: string;
  status: BargainLifecycleStatus;
  revision: number;
  moderatedByUid?: string;
  moderatedByRole?: string;
  moderatedAtIso?: string;
  rejectionReason?: string;
  withdrawnAtIso?: string;
  expiredAtIso?: string;
  lastTransitionFrom?: BargainLifecycleStatus;
}

/**
 * Public listing projection containing ONLY approved, non-expired listing fields.
 * Never includes owner UID, moderator UID, rejection reasons, or internal revision counters.
 */
export interface PublicBargainProjection extends BargainMediaAttachments {
  id: string;
  hoodId: number;
  title: string;
  type: BargainDealType;
  sqm: number;
  priceText: string;
  discountPercent: number;
  buyerProfitText: string;
  street: string;
  createdAtIso: string;
  approvedAtIso?: string;
  expiresAtIso?: string;
}

/**
 * Owner-authorized view returning full listing data, ownership confirmation,
 * current optimistic concurrency `revision`, and moderation feedback.
 */
export interface OwnerBargainView extends StoredBargainDocument {
  ownerUid: string;
  rejectionReason?: string;
  moderatedAtIso?: string;
}

export interface CreateBargainInput extends BargainMediaAttachments {
  bargainId?: string;
  hoodId: number;
  title: string;
  type: BargainDealType;
  sqm: number;
  priceText: string;
  discountPercent: number;
  buyerProfitText: string;
  street: string;
  expiresAtIso?: string;
}

export interface UpdateBargainInput extends BargainMediaAttachments {
  expectedRevision: number;
  title?: string;
  sqm?: number;
  priceText?: string;
  discountPercent?: number;
  buyerProfitText?: string;
  street?: string;
  expiresAtIso?: string;
}

export interface WithdrawBargainInput {
  expectedRevision: number;
  reason?: string;
}

export interface ModerateBargainInput {
  targetStatus: 'approved' | 'rejected';
  expectedRevision?: number;
  rejectionReason?: string;
}

export interface BargainQueryReaderAdapter {
  listBargainsByHood: (params: {
    hoodId: number;
    limit: number;
  }) => Promise<StoredBargainDocument[]>;
}

export interface BargainsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  queryReader?: BargainQueryReaderAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  defaultExpirationDays?: number;
  nowFn?: () => number;
}

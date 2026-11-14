/** @file src/features/properties/types/listing.types.ts — Real Estate Offer / Listing Contract */
import type { PropertyEntity } from './property.types';

export type TransactionType = 'sale' | 'rent' | 'full_deposit' | 'presale';

export type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'stale'
  | 'expired'
  | 'rejected'
  | 'suspended'
  | 'removed';

export type PriceType = 'fixed' | 'negotiable' | 'undisclosed';

export type PublisherRole = 'owner' | 'agent' | 'developer' | 'partner_feed';

export type VerificationDimensionStatus = 'verified' | 'partial' | 'unverified';

export interface VerificationDimensions {
  identity: VerificationDimensionStatus;
  location: VerificationDimensionStatus;
  priceReasonableness: VerificationDimensionStatus;
  freshness: VerificationDimensionStatus;
}

export interface ListingPrice {
  priceType: PriceType;
  saleTotalMillion: number | null;
  pricePerSqmMillion: number | null;
  depositMillion: number | null;
  monthlyRentMillion: number | null;
  convertibleRent: boolean;
}

export interface ListingPublisher {
  id: string;
  displayName: string;
  role: PublisherRole;
  agencyName?: string;
  contactAuthorized: boolean;
  maskedPhone?: string;
}

export interface ListingMarketContext {
  hoodBaseBuyPerSqm: number;
  hoodRahn80mMillion: number;
  estimatedDealV64PerSqm: number;
  gapPercentFromV64: number | null;
  neighborhoodOverallScore: number;
  metroScore: number;
  airScore: number;
}

export interface ListingEntity {
  listingId: string;
  propertyId: string;
  version: number;
  title: string;
  description: string;
  transactionType: TransactionType;
  status: ListingStatus;
  price: ListingPrice;
  publisher: ListingPublisher;
  verification: VerificationDimensions;
  sourceKind: 'curated_bargain' | 'neighborhood_benchmark' | 'user_submitted';
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso?: string;
  marketContext: ListingMarketContext;
}

export interface PropertyListingRecord {
  property: PropertyEntity;
  listing: ListingEntity;
}

export const TRANSACTION_TYPE_LABELS_FA: Record<TransactionType, string> = {
  sale: 'فروش',
  rent: 'رهن و اجاره',
  full_deposit: 'رهن کامل',
  presale: 'پیش‌فروش',
};

export const LISTING_STATUS_LABELS_FA: Record<ListingStatus, string> = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  published: 'منتشرشده',
  stale: 'نیازمند بروزرسانی',
  expired: 'منقضی‌شده',
  rejected: 'ردشده',
  suspended: 'معلق‌شده',
  removed: 'حذف‌شده',
};

export const PUBLISHER_ROLE_LABELS_FA: Record<PublisherRole, string> = {
  owner: 'مالک مستقیم',
  agent: 'مشاور / دفتر املاک',
  developer: 'سازنده',
  partner_feed: 'ثبت مرجع رادار',
};

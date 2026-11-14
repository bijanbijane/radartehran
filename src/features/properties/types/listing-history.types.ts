/** @file src/features/properties/types/listing-history.types.ts — Audit Trail, Submission Drafts, Duplicates & Reporting */
import type { AmenityValue, DocumentType, LocationPrecision, PropertyType } from './property.types';
import type { PriceType, PublisherRole, TransactionType } from './listing.types';

export interface ListingHistoryEvent {
  id: string;
  listingId: string;
  kind: 'created' | 'price_changed' | 'status_changed' | 'republished' | 'verified';
  atIso: string;
  summaryFa: string;
  oldValue?: string;
  newValue?: string;
  verifiedFact: boolean;
}

export interface DuplicateMatchAssessment {
  level: 'none' | 'low' | 'medium' | 'high';
  score: number;
  matchedListingIds: string[];
  reasons: string[];
  actionPolicy: 'allow_publish' | 'warn_publisher' | 'queue_manual_review';
}

export interface ListingAnomalyFlag {
  code: string;
  severity: 'info' | 'warning';
  messageFa: string;
}

export interface ListingSubmissionDraft {
  draftId: string;
  stepIndex: number;
  lastSavedAtIso: string;
  propertyType: PropertyType;
  transactionType: TransactionType;
  cityId: string;
  hoodId: number;
  street: string;
  locationPrecision: LocationPrecision;
  areaSqm: string;
  buildYearJalali: string;
  roomsCount: string;
  floorNumber: string;
  totalFloors: string;
  documentType: DocumentType;
  parking: AmenityValue;
  elevator: AmenityValue;
  storage: AmenityValue;
  balcony: AmenityValue;
  priceType: PriceType;
  saleTotalBillion: string;
  depositMillion: string;
  monthlyRentMillion: string;
  convertibleRent: boolean;
  title: string;
  description: string;
  publisherRole: PublisherRole;
  publisherName: string;
  publisherPhone: string;
  agreeToVerification: boolean;
}

export type ListingReportReason =
  | 'wrong_price'
  | 'sold_or_rented'
  | 'wrong_location'
  | 'duplicate_ad'
  | 'misleading_info';

export interface ListingReportRecord {
  id: string;
  listingId: string;
  reason: ListingReportReason;
  details: string;
  createdAtIso: string;
}

export const LISTING_REPORT_REASON_LABELS_FA: Record<ListingReportReason, string> = {
  wrong_price: 'مغایرت قیمت اعلامی یا شروط پنهان',
  sold_or_rented: 'ملک واگذار شده یا دیگر در دسترس نیست',
  wrong_location: 'نادرستی محدوده جغرافیایی یا محله',
  duplicate_ad: 'آگهی تکراری با مشخصات یکسان',
  misleading_info: 'اطلاعات فنی یا وضعیت سند نادرست است',
};

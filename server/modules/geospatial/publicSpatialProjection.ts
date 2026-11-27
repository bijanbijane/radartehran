import type { SpatialPublishableListing } from './types';

export type PublicSpatialListing = Pick<
  SpatialPublishableListing,
  | 'id'
  | 'propertyId'
  | 'cityId'
  | 'districtId'
  | 'hoodId'
  | 'subNeighborhoodId'
  | 'propertyCategory'
  | 'transactionType'
  | 'sqm'
  | 'priceMillion'
  | 'monthlyRentMillion'
  | 'bedrooms'
  | 'buildYear'
  | 'hasElevator'
  | 'hasParking'
  | 'coordinates'
  | 'publicationStatus'
  | 'verificationStatus'
  | 'available'
>;

const PUBLIC_FIELDS = [
  'id',
  'propertyId',
  'cityId',
  'districtId',
  'hoodId',
  'subNeighborhoodId',
  'propertyCategory',
  'transactionType',
  'sqm',
  'priceMillion',
  'monthlyRentMillion',
  'bedrooms',
  'buildYear',
  'hasElevator',
  'hasParking',
  'coordinates',
  'publicationStatus',
  'verificationStatus',
  'available',
] as const satisfies readonly (keyof SpatialPublishableListing)[];

export function toPublicSpatialListing(listing: SpatialPublishableListing): PublicSpatialListing {
  const out: Partial<PublicSpatialListing> = {};
  for (const key of PUBLIC_FIELDS) {
    const value = listing[key];
    if (value !== undefined) {
      Object.assign(out, { [key]: value });
    }
  }
  return out as PublicSpatialListing;
}

export function isListingEligibleForPublicSpatialSearch(listing: SpatialPublishableListing): boolean {
  // Public discovery is opt-in: every eligibility dimension must be explicitly approved.
  // Missing or unknown values fail closed rather than inheriting a public default.
  return listing.publicationStatus === 'PUBLISHED'
    && listing.verificationStatus === 'VERIFIED'
    && listing.available === true;
}
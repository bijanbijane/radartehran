import type { SpatialPublishableListing } from './types';

export type PublicSpatialListing = Omit<
  SpatialPublishableListing,
  'exactPrivateAddress' | 'privateCoordinates' | 'ownerContact' | 'privateAccessNotes' | 'internalPropertyReference'
>;

const BLOCKED_FIELDS = new Set([
  'exactPrivateAddress',
  'privateCoordinates',
  'ownerContact',
  'privateAccessNotes',
  'internalPropertyReference',
]);

export function toPublicSpatialListing(listing: SpatialPublishableListing): PublicSpatialListing {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(listing)) {
    if (BLOCKED_FIELDS.has(key)) continue;
    out[key] = value;
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
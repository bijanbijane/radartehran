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
  for (const [key, value] of Object.entries(listing as Record<string, unknown>)) {
    if (BLOCKED_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out as PublicSpatialListing;
}

export function isListingEligibleForPublicSpatialSearch(listing: SpatialPublishableListing): boolean {
  const status = String(listing.publicationStatus ?? 'PUBLISHED');
  return !['DRAFT', 'REJECTED', 'ARCHIVED', 'EXPIRED', 'PENDING_REVIEW'].includes(status);
}
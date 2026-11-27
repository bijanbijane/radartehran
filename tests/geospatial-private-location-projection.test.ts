import assert from 'node:assert/strict';
import {
  isListingEligibleForPublicSpatialSearch,
  toPublicSpatialListing,
} from '../server/modules/geospatial/publicSpatialProjection';
import type { SpatialPublishableListing } from '../server/modules/geospatial/types';

function testPrivateFieldsStripped() {
  const listing: SpatialPublishableListing = {
    id: 'l1',
    propertyId: 'p1',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 80,
    priceMillion: 1000,
    coordinates: { lat: 35.7, lng: 51.4 },
    exactPrivateAddress: 'خیابان محرمانه ۱۲',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  };
  const pub = toPublicSpatialListing(listing) as Record<string, unknown>;
  assert.equal(pub.exactPrivateAddress, undefined);
  assert.equal(pub.id, 'l1');

  const extendedListing = {
    ...listing,
    ownerContact: 'private contact',
    privateCoordinates: { lat: 35.7, lng: 51.4 },
    privateAccessNotes: 'restricted access',
    internalPropertyReference: 'internal-only',
    futureSensitiveField: 'must not leak',
  } as SpatialPublishableListing & Record<string, unknown>;
  const extendedPublic = toPublicSpatialListing(extendedListing) as Record<string, unknown>;
  assert.equal(extendedPublic.ownerContact, undefined);
  assert.equal(extendedPublic.privateCoordinates, undefined);
  assert.equal(extendedPublic.privateAccessNotes, undefined);
  assert.equal(extendedPublic.internalPropertyReference, undefined);
  assert.equal(extendedPublic.futureSensitiveField, undefined);

  assert.equal(isListingEligibleForPublicSpatialSearch(listing), true);
  assert.equal(isListingEligibleForPublicSpatialSearch({ ...listing, publicationStatus: 'DRAFT' }), false);
  assert.equal(isListingEligibleForPublicSpatialSearch({ ...listing, publicationStatus: 'ARCHIVED' }), false);
  assert.equal(isListingEligibleForPublicSpatialSearch({ ...listing, verificationStatus: 'PENDING' }), false);
  assert.equal(isListingEligibleForPublicSpatialSearch({ ...listing, verificationStatus: 'REJECTED' }), false);
  assert.equal(isListingEligibleForPublicSpatialSearch({ ...listing, available: false }), false);
}

testPrivateFieldsStripped();
console.log('geospatial-private-location-projection: ok');
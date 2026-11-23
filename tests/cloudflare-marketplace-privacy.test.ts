import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maskPhoneForPublic,
  ownerUidVisible,
  sanitizeSponsorForPublic,
} from '../worker/marketplace/d1MarketplaceRepository';

describe('public marketplace privacy projections', () => {
  it('never exposes another user UID to a public or non-admin caller', () => {
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran' }), '');
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran', uid: 'viewer-1' }), '');
    assert.equal(ownerUidVisible('viewer-1', { cityId: 'tehran', uid: 'viewer-1' }), 'viewer-1');
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran', includeAdminRecords: true }), 'owner-1');
  });

  it('masks sponsor phone numbers in public marketplace state', () => {
    assert.equal(maskPhoneForPublic('+989121234567'), '+98***4567');
    assert.equal(maskPhoneForPublic('09121234567'), '+98***4567');
    assert.equal(maskPhoneForPublic('invalid'), '');
  });

  it('allowlists public sponsor fields and preserves full fields only for admins', () => {
    const raw = {
      name: 'Agency',
      agencyName: 'Agency Group',
      specialty: 'Residential',
      experienceYears: 8,
      planType: 'paid_1m',
      phone: '+989121234567',
      email: 'private@example.com',
      trackingCode: 'secret-tracking-code',
    };
    const publicRecord = sanitizeSponsorForPublic(raw, false);
    assert.deepEqual(publicRecord, {
      name: 'Agency',
      agencyName: 'Agency Group',
      specialty: 'Residential',
      experienceYears: 8,
      planType: 'paid_1m',
    });
    assert.equal(sanitizeSponsorForPublic(raw, true)?.phone, '+989121234567');
  });
});

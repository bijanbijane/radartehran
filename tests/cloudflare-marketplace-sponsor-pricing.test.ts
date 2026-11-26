import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCanonicalD1SponsorPricing } from '../worker/marketplace/sponsorPricing';

test('server sponsor pricing follows canonical neighborhood price tiers', () => {
  assert.equal(calculateCanonicalD1SponsorPricing(99.9, 0, 1)?.monthlyTariffMillion, 5);
  assert.equal(calculateCanonicalD1SponsorPricing(100, 0, 1)?.monthlyTariffMillion, 7.5);
  assert.equal(calculateCanonicalD1SponsorPricing(140, 0, 1)?.monthlyTariffMillion, 10);
  assert.equal(calculateCanonicalD1SponsorPricing(190, 0, 1)?.monthlyTariffMillion, 14);
});

test('server sponsor pricing applies campaign discount and three-month discount', () => {
  assert.deepEqual(calculateCanonicalD1SponsorPricing(190, 20, 3), {
    planMonths: 3, monthlyTariffMillion: 11.2, totalPayableMillion: 26.9,
    durationDays: 90, campaignDiscountPercent: 20,
  });
});

test('server sponsor pricing clamps invalid discounts and rejects invalid market prices', () => {
  assert.equal(calculateCanonicalD1SponsorPricing(120, 101, 1)?.monthlyTariffMillion, 7.5);
  assert.equal(calculateCanonicalD1SponsorPricing(0, 0, 1), null);
  assert.equal(calculateCanonicalD1SponsorPricing('not-a-price', 0, 1), null);
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCompositeQoLScore,
  buildNeighborhoodSeedReviews,
  filterAndSortResidentReviews,
  summarizeNeighborhoodQoL,
  validateResidentReviewDraft,
} from '../src/components/inspector/residentReviewsLogic';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import type { EvaluatedNeighborhood } from '../src/data/neighborhoods';

describe('Resident Quality-of-Life Reviews Pure Logic', () => {
  const sampleHood = {
    ...INITIAL_NEIGHBORHOODS[0],
    status: 'green',
    diffPercent: 0,
    overallScore: 8.4,
    distKm: 3.2,
  } as EvaluatedNeighborhood;

  test('computeCompositeQoLScore calculates weighted 1-10 score accurately', () => {
    const score = computeCompositeQoLScore({
      air: 8,
      powerWater: 9,
      internet: 8,
      metro: 9,
      security: 9,
      flatTerrain: 7,
    });
    assert.ok(score >= 8.0 && score <= 9.0, `Expected score between 8.0 and 9.0, got ${score}`);
  });

  test('buildNeighborhoodSeedReviews generates 3 realistic neighborhood-specific reviews', () => {
    const seeds = buildNeighborhoodSeedReviews(sampleHood);
    assert.equal(seeds.length, 3);
    assert.ok(seeds[0].comment.includes(sampleHood.name));
    assert.equal(seeds[0].locationVerified, true);
    assert.equal(seeds[0].residencyType, 'owner');
    assert.equal(seeds[1].residencyType, 'tenant');
  });

  test('filterAndSortResidentReviews filters by verified/owners/tenants and search query', () => {
    const seeds = buildNeighborhoodSeedReviews(sampleHood);
    const verifiedOnly = filterAndSortResidentReviews(seeds, 'verified', '');
    assert.ok(verifiedOnly.every((r) => r.locationVerified));

    const ownersOnly = filterAndSortResidentReviews(seeds, 'owners', '');
    assert.equal(ownersOnly.length, 1);
    assert.equal(ownersOnly[0].residencyType, 'owner');

    const queried = filterAndSortResidentReviews(seeds, 'all', 'مستاجر');
    assert.equal(queried.length, 1);
  });

  test('summarizeNeighborhoodQoL computes weighted averages and recommendation rate', () => {
    const seeds = buildNeighborhoodSeedReviews(sampleHood);
    const summary = summarizeNeighborhoodQoL(sampleHood, seeds, 'USD', 'fa');
    assert.ok(summary.compositeScore >= 1 && summary.compositeScore <= 10);
    assert.equal(summary.verifiedReviewsCount, 2);
    assert.ok(summary.recommendPercent >= 68 && summary.recommendPercent <= 99);
    assert.ok(summary.housingCostNote.includes('$'));
  });

  test('validateResidentReviewDraft rejects short comments and sanitizes valid comments', () => {
    const invalid = validateResidentReviewDraft({
      authorName: 'علی',
      residencyType: 'owner',
      residencyDuration: 'over_3y',
      comment: 'کوتاه',
      prosTags: [],
      consTags: [],
      air: 8,
      powerWater: 8,
      internet: 8,
      metro: 8,
      security: 8,
      flatTerrain: 8,
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errorFa);

    const valid = validateResidentReviewDraft({
      authorName: '',
      residencyType: 'tenant',
      residencyDuration: '1_to_3y',
      comment: 'محله بسیار آرام و با دسترسی عالی به مترو و مراکز خرید روزانه است.',
      prosTags: ['امنیت بالای تردد شبانه'],
      consTags: [],
      air: 8,
      powerWater: 8,
      internet: 8,
      metro: 9,
      security: 9,
      flatTerrain: 8,
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.sanitizedAuthor, 'ساکن محله');
  });
});

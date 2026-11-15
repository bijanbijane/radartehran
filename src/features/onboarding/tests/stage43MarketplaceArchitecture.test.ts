import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE43_DESIGN_COMPONENT_IDS,
  cancelServiceRequestSafely,
  compareServiceQuotesHonesty,
  evaluateProviderRequestAccess,
  filterAndSortMarketplaceProviders,
  reviseServiceQuoteKeepingHistory,
  submitServiceReviewWithVerification,
} from '../services/proMarketplaceEngine';
import {
  INITIAL_STAGE43_PROVIDERS,
  INITIAL_STAGE43_QUOTES,
  INITIAL_STAGE43_REQUEST,
} from '../services/stage43MarketplaceFixtures';

test('Stage 43 (RT-UI-PRO-MARKETPLACE-001): separates sponsored placements, gates non-invited provider access, hides exact address, preserves quote revisions, and links verified reviews', () => {
  // 1. Organic vs sponsored separation & district filtering (Tests 1 & 2)
  const { organic, sponsored } = filterAndSortMarketplaceProviders({
    providers: INITIAL_STAGE43_PROVIDERS,
    districtQuery: 'منطقه ۱',
  });
  assert.ok(organic.every((p) => !p.isSponsoredPlacement));
  assert.ok(sponsored.every((p) => p.isSponsoredPlacement));

  // 2. Non-invited provider cannot access private request; exact address hidden prior to acceptance (Tests 5 & 12)
  const denied = evaluateProviderRequestAccess(INITIAL_STAGE43_REQUEST, 'prv-uninvited');
  assert.equal(denied.allowed, false);

  const allowedBeforeExecution = evaluateProviderRequestAccess(INITIAL_STAGE43_REQUEST, 'prv-niazi');
  assert.equal(allowedBeforeExecution.allowed, true);
  assert.equal(allowedBeforeExecution.showExactAddress, false);

  // 3. Quote comparison flags scope difference & avoids claiming cheapest = best (Test 7)
  const advisory = compareServiceQuotesHonesty(INITIAL_STAGE43_QUOTES);
  assert.equal(advisory.hasScopeDifferenceWarning, true);
  assert.ok(advisory.advisoryFa.includes('ارزان‌ترین'));

  // 4. Revising quote preserves original amount in revisionHistory (Test 8)
  const revised = reviseServiceQuoteKeepingHistory(INITIAL_STAGE43_QUOTES[0], 5.1, 'افزایش متراژ');
  assert.equal(revised.amountM, 5.1);
  assert.equal(revised.revisionHistory.length, 1);
  assert.equal(revised.revisionHistory[0].amountM, 4.5);

  // 5. Cancellation closes exact address visibility & verified review requires completed request (Tests 10 & 11)
  const cancelled = cancelServiceRequestSafely(INITIAL_STAGE43_REQUEST, 'تغییر برنامه');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.exactAddressVisibleToProvider, false);

  const nonVerifiedRev = submitServiceReviewWithVerification({ req: INITIAL_STAGE43_REQUEST, rating: 5, commentFa: 'خوب بود' });
  assert.equal(nonVerifiedRev.verifiedInteraction, false);

  const verifiedRev = submitServiceReviewWithVerification({ req: { ...INITIAL_STAGE43_REQUEST, status: 'completed' }, rating: 5, commentFa: 'عالی' });
  assert.equal(verifiedRev.verifiedInteraction, true);
  assert.equal(verifiedRev.canProviderDelete, false);

  // 6. PRM-01..32 component ID count
  assert.equal(STAGE43_DESIGN_COMPONENT_IDS.length, 32);
});

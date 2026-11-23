import assert from 'node:assert/strict';
import { isAllowDemoSearchDataEnabled } from '../src/features/search/services/searchDemoDataPolicy';
import { isDocumentEligibleForPublicIndex } from '../src/features/search/services/publicIndexEligibility';
import { DEMO_ALL_CITY_SEARCH_DOCUMENTS } from '../src/features/search/fixtures/demoSearchDocuments';

function testDemoBlockedInProductionPolicy() {
  const prevNode = process.env.NODE_ENV;
  const prevDemo = process.env.ALLOW_DEMO_SEARCH_DATA;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_DEMO_SEARCH_DATA;
  assert.equal(isAllowDemoSearchDataEnabled(), false);
  const sample = DEMO_ALL_CITY_SEARCH_DOCUMENTS[0];
  assert.equal(isDocumentEligibleForPublicIndex(sample, false), false);
  process.env.NODE_ENV = prevNode;
  process.env.ALLOW_DEMO_SEARCH_DATA = prevDemo;
}

testDemoBlockedInProductionPolicy();
console.log('search-fixture-production-isolation: ok');
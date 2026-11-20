import assert from 'node:assert/strict';
import {
  getProductionPropertySearchService,
  resetProductionPropertySearchForTests,
} from '../server/modules/property-search/propertySearchCompositionRoot';

async function main() {
  resetProductionPropertySearchForTests();
  const svc = getProductionPropertySearchService();
  const res = await svc.searchProperties({
    filters: { cityId: 'tehran', category: 'residential', dealType: 'sale' },
    sort: 'newest',
    limit: 5,
  });
  assert.equal(res.appliedFilters.cityId, 'tehran');
  assert.ok(Array.isArray(res.items));
  assert.ok(typeof res.totalEstimatedCount === 'number');
  resetProductionPropertySearchForTests();
  console.log('property-search-production-mount: ok');
}

void main();
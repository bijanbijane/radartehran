import assert from 'node:assert/strict';
import { verifyPricingEngineIntegrity } from '../src/data/realMarketPriceAggregator';

console.log('🧪 Running v6.4 Pricing Engine Integrity Self-Verification Suite (15 Critical Cases)...\n');

const result = verifyPricingEngineIntegrity();

assert.deepEqual(
  result.failures,
  [],
  `Expected zero pricing engine integrity failures, got:\n${result.failures.join('\n')}`
);
assert.equal(result.passed, true, 'verifyPricingEngineIntegrity().passed must be true');

console.log('✅ All 15 critical v6.4 Pricing Engine & Persian NLP integrity checks passed with 0 failures!');

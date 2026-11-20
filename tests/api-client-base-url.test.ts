import assert from 'node:assert/strict';
import { resolveApiUrl } from '../src/utils/apiBaseUrl';

assert.equal(resolveApiUrl('/api/v2/search/query'), '/api/v2/search/query');
assert.equal(resolveApiUrl('api/healthz'), '/api/healthz');
console.log('api-client-base-url: ok');
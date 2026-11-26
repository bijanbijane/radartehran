import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('Express readiness never maps process acceptance to D1, auth, or object-storage readiness', () => {
  const source = fs.readFileSync('src/utils/serverPublisherBargains.ts', 'utf8');
  const start = source.indexOf("app.get('/api/health/readiness'");
  assert.notEqual(start, -1);
  const end = source.indexOf("app.get('/api/my-bargains'", start);
  const handler = source.slice(start, end);
  assert.match(handler, /res\.status\(503\)/);
  assert.match(handler, /readinessAuthority: 'cloudflare_worker'/);
  assert.match(handler, /verified: false/);
  assert.doesNotMatch(handler, /firebase: \{ configured: true/);
  assert.doesNotMatch(handler, /d1Ready: accepting|objectStorageReady: accepting/);
});

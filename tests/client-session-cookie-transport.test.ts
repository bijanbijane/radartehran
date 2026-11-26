import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('D1 marketplace repository uses same-origin HttpOnly cookies without Firebase bearer tokens', () => {
  const source = fs.readFileSync('src/data/neighborhoodRemoteRepository.ts', 'utf8');
  assert.match(source, /credentials:\s*'same-origin'/);
  assert.match(source, /cache:\s*'no-store'/);
  assert.doesNotMatch(source, /getIdToken\s*\(/);
  assert.doesNotMatch(source, /Authorization:\s*['"]Bearer/);
});

test('object storage browser requests use session cookies without Firebase Auth or App Check headers', () => {
  const source = fs.readFileSync('src/utils/objectStorage.ts', 'utf8');
  assert.match(source, /credentials:\s*'same-origin'/);
  assert.doesNotMatch(source, /Authorization:\s*\w/);
  assert.doesNotMatch(source, /X-Firebase-AppCheck/);
});

test('the Worker rejects retired Firebase tokens and accepts only D1 sessions', () => {
  const source = fs.readFileSync('worker/auth/authorizationPolicy.ts', 'utf8');
  assert.match(source, /FIREBASE_BEARER_TOKEN_RETIRED/);
  assert.match(source, /authenticateWorkerSession/);
  assert.doesNotMatch(source, /verifyFirebaseIdToken/);
});

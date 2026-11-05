import assert from 'node:assert/strict';

import {
  parseSingleByteRange,
} from '../src/utils/serverObjectStorage';

function runRangeTests(): void {
  assert.deepEqual(
    parseSingleByteRange('bytes=0-99', 1000),
    { start: 0, end: 99 }
  );

  assert.deepEqual(
    parseSingleByteRange('bytes=100-', 1000),
    { start: 100, end: 999 }
  );

  assert.deepEqual(
    parseSingleByteRange('bytes=-500', 1000),
    { start: 500, end: 999 }
  );

  assert.deepEqual(
    parseSingleByteRange('bytes=900-2000', 1000),
    { start: 900, end: 999 }
  );

  assert.equal(
    parseSingleByteRange('bytes=100abc-200', 1000),
    null
  );

  assert.equal(
    parseSingleByteRange('bytes=100-50', 1000),
    null
  );

  assert.equal(
    parseSingleByteRange('bytes=1000-', 1000),
    null
  );

  assert.equal(
    parseSingleByteRange('bytes=0-10,20-30', 1000),
    null
  );

  assert.equal(
    parseSingleByteRange('bytes=-0', 1000),
    null
  );

  assert.equal(
    parseSingleByteRange('bytes=0-0', 0),
    null
  );

  console.log('Object storage byte-range tests passed.');
}

runRangeTests();

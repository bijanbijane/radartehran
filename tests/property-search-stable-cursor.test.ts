import assert from 'node:assert/strict';
import {
  buildQueryFingerprint,
  decodeStableSearchCursor,
  encodeStableSearchCursor,
  InvalidSearchCursorError,
} from '../server/modules/property-search/propertySearchStableCursor';

function testStableCursorRoundTrip() {
  const fp = buildQueryFingerprint({ cityId: 'tehran' }, 'newest');
  const cursor = encodeStableSearchCursor({
    sortValue: '2026-01-01',
    stableRecordId: 'listing-1',
    queryFingerprint: fp,
    sortMode: 'newest',
    sourceWatermark: '10',
    cursorVersion: 2,
  });
  const decoded = decodeStableSearchCursor(cursor, fp);
  assert.equal(decoded.stableRecordId, 'listing-1');
  assert.throws(() => decodeStableSearchCursor(cursor, 'wrong-fingerprint'), (err: unknown) => {
    return err instanceof Error && 'code' in err && (err as { code: string }).code === 'SEARCH_CURSOR_STALE';
  });
  assert.throws(() => decodeStableSearchCursor('bad.cursor', fp), InvalidSearchCursorError);
}

testStableCursorRoundTrip();
console.log('property-search-stable-cursor: ok');
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadMediaToObjectStorage } from '../src/utils/objectStorage';

const mediaObject = {
  id: 'media-test-1',
  objectKey: 'listings/tehran/hood-1/image/2026-11/media-test-1.jpg',
  bucket: 'test-bucket',
  provider: 'r2' as const,
  mediaType: 'image' as const,
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  url: '/api/object-storage/file/media-test-1',
  createdAtIso: '2026-11-24T00:00:00.000Z',
};

test('native D1 session upload uses same-origin credentials without a Firebase Bearer token', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ status: 'ok', mediaObject }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await uploadMediaToObjectStorage({
      fileName: 'listing-photo.jpg',
      mimeType: 'image/jpeg',
      mediaType: 'image',
      dataBase64: 'Zm9v',
      hoodId: 1,
      city: 'tehran',
    });

    assert.equal(result.id, mediaObject.id);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.get('content-type'), 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy upload compatibility preserves Bearer and App Check headers when explicitly supplied', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ status: 'ok', mediaObject }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const token = 'legacy-firebase-token-for-transition-tests-1234567890';
    await uploadMediaToObjectStorage({
      fileName: 'listing-photo.jpg',
      mimeType: 'image/jpeg',
      mediaType: 'image',
      dataBase64: 'Zm9v',
      hoodId: 1,
      city: 'tehran',
      idToken: token,
      appCheckHeaders: { 'X-Firebase-AppCheck': 'app-check-test-token' },
    });

    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${token}`);
    assert.equal(headers.get('x-firebase-appcheck'), 'app-check-test-token');
    assert.equal(capturedInit?.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

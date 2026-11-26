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

test('native D1 session upload never forwards retired Firebase Bearer or App Check credentials', async () => {
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
    await uploadMediaToObjectStorage({
      fileName: 'listing-photo.jpg',
      mimeType: 'image/jpeg',
      mediaType: 'image',
      dataBase64: 'Zm9v',
      hoodId: 1,
      city: 'tehran',
    });

    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('x-firebase-appcheck'), null);
    assert.equal(capturedInit?.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

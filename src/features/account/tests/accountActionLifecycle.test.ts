/** @file src/features/account/tests/accountActionLifecycle.test.ts — Stage 184 Account Export/Delete Lifecycle & Contract Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSafeExportFileName,
  downloadJsonPayloadFile,
  sanitizeDownloadFileName,
} from '../services/accountExportDownloadService';
import {
  isValidServerAccountExportResponse,
  requestAccountServerExport,
  stripSecretsFromExportValue,
  SUPPORTED_EXPORT_SCHEMA_VERSION,
} from '../services/accountActionService';
import {
  loadDataRequests,
  recordDataRequest,
} from '../services/accountWorkspaceService';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  const win = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: () => true,
  };
  (globalThis as Record<string, unknown>).window = win;
  return { store };
}

test('Stage 184: sanitizeDownloadFileName enforces ASCII-safe .json filenames without traversal', () => {
  assert.equal(sanitizeDownloadFileName('../../etc/passwd'), 'etc-passwd.json');
  assert.equal(sanitizeDownloadFileName('   '), 'radar-account-export.json');
  assert.equal(sanitizeDownloadFileName('my export (گزارش).json'), 'my-export.json');
  assert.equal(buildSafeExportFileName('local_workspace'), 'radar-local-workspace-export.json');
  assert.equal(buildSafeExportFileName('combined_account_and_workspace'), 'radar-combined-account-export.json');
  assert.equal(buildSafeExportFileName('server_account'), 'radar-server-account-export.json');
});

test('Stage 184: downloadJsonPayloadFile delays revokeObjectURL until timer fires and supports cancellation', () => {
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const scheduledCallbacks: Array<{ id: number; fn: () => void; ms: number }> = [];
  const clearedIds: number[] = [];
  let nextTimerId = 1;
  let clickCount = 0;
  let removed = false;

  const anchorMock = {
    href: '',
    download: '',
    rel: '',
    style: {} as Record<string, string>,
    parentNode: null as unknown,
    click: () => { clickCount += 1; },
    remove: () => { removed = true; },
  };
  const bodyMock = {
    appendChild: (el: typeof anchorMock) => { el.parentNode = bodyMock; },
    removeChild: () => { removed = true; },
  };

  class FakeBlob {
    parts: unknown[];
    options: unknown;
    constructor(parts: unknown[], options?: unknown) {
      this.parts = parts;
      this.options = options;
    }
  }

  const res = downloadJsonPayloadFile(
    { ok: true, items: [1, 2, 3] },
    {
      scope: 'local_workspace',
      revokeDelayMs: 1200,
      deps: {
        windowRef: {
          setTimeout: ((fn: () => void, ms: number) => {
            const id = nextTimerId++;
            scheduledCallbacks.push({ id, fn, ms });
            return id;
          }) as unknown as typeof window.setTimeout,
          clearTimeout: ((id: number) => {
            clearedIds.push(id);
          }) as unknown as typeof window.clearTimeout,
        },
        documentRef: {
          createElement: (() => anchorMock) as unknown as Document['createElement'],
          body: bodyMock as unknown as HTMLElement,
        },
        urlApi: {
          createObjectURL: () => {
            const u = 'blob:http://localhost/export-1';
            createdUrls.push(u);
            return u;
          },
          revokeObjectURL: (u: string) => {
            revokedUrls.push(u);
          },
        },
        blobCtor: FakeBlob as unknown as typeof Blob,
      },
    },
  );

  assert.equal(res.ok, true);
  assert.equal(res.fileName, 'radar-local-workspace-export.json');
  assert.equal(clickCount, 1);
  assert.equal(removed, true);
  assert.deepEqual(createdUrls, ['blob:http://localhost/export-1']);
  assert.equal(revokedUrls.length, 0, 'Must NOT revoke objectURL synchronously before download starts');
  assert.equal(scheduledCallbacks.length, 1);
  assert.equal(scheduledCallbacks[0].ms, 1200);

  scheduledCallbacks[0].fn();
  assert.deepEqual(revokedUrls, ['blob:http://localhost/export-1']);

  const res2 = downloadJsonPayloadFile(
    { second: true },
    {
      deps: {
        windowRef: {
          setTimeout: ((fn: () => void, ms: number) => {
            const id = nextTimerId++;
            scheduledCallbacks.push({ id, fn, ms });
            return id;
          }) as unknown as typeof window.setTimeout,
          clearTimeout: ((id: number) => { clearedIds.push(id); }) as unknown as typeof window.clearTimeout,
        },
        documentRef: {
          createElement: (() => anchorMock) as unknown as Document['createElement'],
          body: bodyMock as unknown as HTMLElement,
        },
        urlApi: {
          createObjectURL: () => 'blob:http://localhost/export-2',
          revokeObjectURL: (u: string) => { revokedUrls.push(u); },
        },
        blobCtor: FakeBlob as unknown as typeof Blob,
      },
    },
  );
  assert.equal(res2.ok, true);
  res2.cancelRevokeTimer?.();
  assert.equal(clearedIds.length, 1);
  assert.deepEqual(revokedUrls, ['blob:http://localhost/export-1', 'blob:http://localhost/export-2']);
});

test('Stage 184: stripSecretsFromExportValue scrubs nested sensitive keys and preserves domain fields', () => {
  const scrubbed = stripSecretsFromExportValue({
    ownerUid: 'u1',
    token: 'secret-jwt',
    nested: {
      idToken: 'bad',
      authorization: 'Bearer x',
      neighborhood: 'پونک',
    },
    items: [{ password: '123', apiKey: 'AIza...', title: 'آگهی نمونه' }],
  }) as Record<string, unknown>;

  assert.equal('token' in scrubbed, false);
  const nested = scrubbed.nested as Record<string, unknown>;
  assert.equal('idToken' in nested, false);
  assert.equal('authorization' in nested, false);
  assert.equal(nested.neighborhood, 'پونک');
  const items = scrubbed.items as Array<Record<string, unknown>>;
  assert.equal('password' in items[0], false);
  assert.equal('apiKey' in items[0], false);
  assert.equal(items[0].title, 'آگهی نمونه');
});

test('Stage 184: stripSecretsFromExportValue normalizes secret key variants and omits over-deep objects', () => {
  let deep: Record<string, unknown> = { access_token: 'deep-secret' };
  for (let i = 0; i < 10; i += 1) deep = { nested: deep };
  const scrubbed = stripSecretsFromExportValue({
    access_token: 'a',
    refresh_token: 'b',
    ApiKey: 'c',
    CLIENT_SECRET: 'd',
    safeField: 'kept',
    deep,
  }) as Record<string, unknown>;
  assert.equal('access_token' in scrubbed, false);
  assert.equal('refresh_token' in scrubbed, false);
  assert.equal('ApiKey' in scrubbed, false);
  assert.equal('CLIENT_SECRET' in scrubbed, false);
  assert.equal(scrubbed.safeField, 'kept');
  assert.equal(JSON.stringify(scrubbed).includes('deep-secret'), false);
  assert.equal(JSON.stringify(scrubbed).includes('OMITTED_MAX_DEPTH'), true);
});

test('Stage 184: requestAccountServerExport maps 401/403/429/500, owner mismatch, schema mismatch, and valid envelope', async () => {
  const makeFetch = (status: number, body: unknown): typeof fetch =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

  const r401 = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(401, { status: 'error' }),
  });
  assert.equal(r401.ok, false);
  if (!r401.ok) assert.equal(r401.code, 'AUTH_REQUIRED');

  const r403 = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(403, { status: 'error' }),
  });
  assert.equal(r403.ok, false);
  if (!r403.ok) assert.equal(r403.code, 'FORBIDDEN');

  const r429 = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(429, { status: 'error' }),
  });
  assert.equal(r429.ok, false);
  if (!r429.ok) assert.equal(r429.code, 'RATE_LIMITED');

  const mismatch = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(200, {
      status: 'ok',
      exportData: {
        ownerUid: 'u2',
        schemaVersion: SUPPORTED_EXPORT_SCHEMA_VERSION,
      },
    }),
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, 'OWNER_MISMATCH');

  const badSchema = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(200, {
      status: 'ok',
      exportData: {
        ownerUid: 'u1',
        schemaVersion: '99.0.0',
      },
    }),
  });
  assert.equal(badSchema.ok, false);
  if (!badSchema.ok) assert.equal(badSchema.code, 'UNSUPPORTED_SCHEMA_VERSION');

  const validPayload = {
    status: 'ok',
    exportData: {
      ownerUid: 'u1',
      schemaVersion: SUPPORTED_EXPORT_SCHEMA_VERSION,
      exportedAtIso: '2026-11-16T00:00:00.000Z',
      profile: { displayName: 'کاربر آزمایشی' },
      favoriteNeighborhoodKeys: ['5'],
      savedAlerts: [],
      publishedListings: [],
      calculationSnapshots: [],
      token: 'should-be-stripped',
    },
  };
  assert.equal(isValidServerAccountExportResponse(validPayload, 'u1'), true);
  const okRes = await requestAccountServerExport({
    currentUser: { uid: 'u1' },
    expectedUid: 'u1',
    fetchFn: makeFetch(200, validPayload),
  });
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.equal(okRes.data.ownerUid, 'u1');
    const scrubbedData = stripSecretsFromExportValue(okRes.data) as Record<string, unknown>;
    assert.equal('token' in scrubbedData, false);
  }
});

test('Stage 184: recordDataRequest updates stable request lifecycle honestly (ready -> completed, or failed)', () => {
  setupMemoryWindow();
  const requestId = 'dreq-lifecycle-1';

  recordDataRequest('export', 'ready', { uid: 'u-life', requestId, scope: 'server_account' });
  let list = loadDataRequests('u-life');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'ready');

  recordDataRequest('export', 'completed', { uid: 'u-life', requestId, scope: 'server_account' });
  list = loadDataRequests('u-life');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'completed');

  const failId = 'dreq-lifecycle-2';
  recordDataRequest('delete', 'failed', { uid: 'u-life', requestId: failId, errorCode: 'RECENT_LOGIN_REQUIRED' });
  list = loadDataRequests('u-life');
  assert.equal(list[0].id, failId);
  assert.equal(list[0].status, 'failed');
  assert.equal(list[0].errorCode, 'RECENT_LOGIN_REQUIRED');
});

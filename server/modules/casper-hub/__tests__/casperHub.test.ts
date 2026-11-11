/**
 * @file server/modules/casper-hub/__tests__/casperHub.test.ts
 * @description Adversarial unit & route integration test suite for the CASPER-04 server-side CASPER HUB client.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildDeterministicNoteIdempotencyKey,
  CASPER_AGENT_ID,
  CASPER_AGENT_ROADMAP_ID,
  CasperHubClient,
  CasperHubClientError,
  redactSensitiveText,
  registerCasperHubRoutes,
  resolveCasperHubConfig,
} from '../index';
import { auditRuntimeEnvironmentAndSecurityPosture } from '../../../../src/utils/serverStoragePortabilityAndTracing';

const TEST_ENV = {
  CASPER_HUB_URL: 'https://casper-hub-api.bijanbijane-1.workers.dev',
  CASPER_HUB_TOKEN: 'synth-token-casper-04',
};

test('1. Fails closed with CASPER_HUB_UNCONFIGURED / 503 across all endpoints when CASPER_HUB_TOKEN is absent without calling fetch', async () => {
  const client = new CasperHubClient({ env: { ...TEST_ENV, CASPER_HUB_TOKEN: '' } });
  assert.equal(client.getStatus().configured, false);
  assert.equal(client.getStatus().agentId, 'CASPER-04');
  await assert.rejects(async () => client.getWhoAmI(), (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_HUB_UNCONFIGURED' && err.statusCode === 503);
  let netCalls = 0;
  const undefClient = new CasperHubClient({ env: {}, fetchImpl: async () => { netCalls++; return new Response('{}'); } });
  for (const res of [await undefClient.getWhoAmI(), await undefClient.getBootstrap(), await undefClient.getChanges(), await undefClient.postNote({ title: 'T', summary: 'S' })]) {
    assert.equal(res.ok, false); assert.equal(res.status, 503);
  }
  assert.equal(netCalls, 0, 'Unconfigured client must never send Bearer undefined over network');
});

test('2. Rejects non-HTTPS, loopback/IP literals (dotted, hex, shorthand), DNS-rebinding domains, credentials, and untrusted CASPER_HUB_URL hosts', () => {
  for (const invalidUrl of [
    'http://casper-hub-api.bijanbijane-1.workers.dev', 'https://127.0.0.1/v1', 'https://0x7f000001/v1',
    'https://127.1/v1', 'https://localhost/v1', 'https://169.254.169.254.nip.io/v1', 'https://10.0.0.1.sslip.io/v1',
    'https://metadata.internal/v1', 'https://user:pass@casper-hub-api.bijanbijane-1.workers.dev',
    'https://casper-hub-api.bijanbijane-1.workers.dev?leak=1', 'https://casper-hub-api.bijanbijane-1.workers.dev:22',
    'https://casper-hub-api.bijanbijane-1.workers.dev:8080', 'https://evil-attacker.example.com',
  ]) {
    assert.throws(
      () =>
        resolveCasperHubConfig({
          CASPER_HUB_URL: invalidUrl,
          CASPER_HUB_TOKEN: 'secret-token-04',
          CASPER_HUB_ALLOWED_HOSTS: '169.254.169.254.nip.io,10.0.0.1.sslip.io,metadata.internal,127.0.0.1',
        }),
      (err: unknown) =>
        err instanceof CasperHubClientError && (err.code === 'CASPER_HUB_INVALID_URL' || err.code === 'CASPER_HUB_URL_INVALID'),
      `Expected ${invalidUrl} to be rejected`,
    );
  }
});

test('3. Enforces redirect: "error", blocks 3xx redirects, and retries transient 5xx on idempotent requests', async () => {
  let capturedInit: RequestInit | undefined;
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return new Response('', { status: 302, headers: { location: 'https://evil.example.com' } });
    },
  });
  await assert.rejects(
    async () => client.getWhoAmI(),
    (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_HUB_HTTP_ERROR' && err.statusCode === 502,
  );
  assert.equal(capturedInit?.redirect, 'error');

  let callCount = 0;
  const retryClient = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => {
      callCount++;
      return callCount === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ authenticated: true, agent_id: 'CASPER-04' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const res = await retryClient.getWhoAmI();
  assert.equal(callCount, 2);
  assert.equal(res.ok, true);
});

test('4. Enforces strict CASPER-04 identity on outbound notes and inbound /v1/whoami responses + tracks tokenIdentityLocked', async () => {
  let returnValid = false;
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () =>
      new Response(JSON.stringify({ authenticated: true, agent_id: returnValid ? 'CASPER-04' : 'SYSTEM_ADMIN' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
  assert.equal(client.getStatus().tokenIdentityLocked, false);
  await assert.rejects(
    async () => client.getWhoAmI(),
    (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_AGENT_IDENTITY_MISMATCH' && err.statusCode === 403,
  );
  assert.equal(client.getStatus().tokenIdentityLocked, false);
  returnValid = true;
  await client.getWhoAmI();
  assert.equal(client.getStatus().tokenIdentityLocked, true);
  await assert.rejects(
    async () => client.createNote({ title: 'Spoof attempt', summary: 'Should fail', agent: 'CASPER-01' }),
    (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_AGENT_IDENTITY_MISMATCH' && err.statusCode === 403,
  );
  assert.equal(CASPER_AGENT_ID, 'CASPER-04');
  assert.equal(CASPER_AGENT_ROADMAP_ID, 'rm-casper-04');
});

test('5. Redacts raw, URL-encoded, Base64-encoded, and JSON-escaped CASPER_HUB_TOKEN/Bearer from errors, inbound AST JSON, and outbound notes + strips Bidi/control bytes', async () => {
  const secretToken = 'super_secret+casper04/token=999';
  const urlEncoded = encodeURIComponent(secretToken);
  const b64Encoded = Buffer.from(secretToken, 'utf8').toString('base64');
  let capturedBody: Record<string, unknown> = {};
  const client = new CasperHubClient({
    env: { ...TEST_ENV, CASPER_HUB_TOKEN: secretToken },
    fetchImpl: async (input, init) => {
      if (init?.method === 'POST' && typeof init.body === 'string') {
        capturedBody = JSON.parse(init.body) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true, note_id: 'note-1' }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (String(input).endsWith('/v1/bootstrap')) {
        const rawWireJson = `{"sync_cursor":5,"__proto__":{"polluted":true},"relevant_notes":[{"summary":"Leaked \\u0042earer ${secretToken.replace('/', '\\/')} and ${b64Encoded}"}]}`;
        return new Response(rawWireJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `Invalid ${secretToken} / ${urlEncoded} / ${b64Encoded}` }), { status: 401, headers: { 'content-type': 'application/json' } });
    },
  });

  await assert.rejects(
    async () => client.getWhoAmI(),
    (err: unknown) => {
      assert.ok(err instanceof CasperHubClientError && err.statusCode === 401);
      assert.ok(!err.message.includes(secretToken) && !err.message.includes(urlEncoded) && !err.message.includes(b64Encoded));
      return true;
    },
  );

  const boot = await client.getBootstrap<{ relevant_notes: Array<{ summary: string }>; polluted?: boolean }>();
  assert.ok(!boot.data.relevant_notes[0].summary.includes(secretToken) && !boot.data.relevant_notes[0].summary.includes(b64Encoded));
  assert.equal(Object.prototype.hasOwnProperty.call(boot.data, '__proto__'), false);

  await client.createNote({
    title: `Check \u202E${secretToken}\x00`,
    summary: `Header Bearer ${secretToken} and ${urlEncoded} and ${b64Encoded}\u2066`,
    detail_ref: `ref-${secretToken}\x07`,
    tags: [`tag-${secretToken}\u202D`],
    extra_untrusted_field: 'must_be_stripped',
  });

  assert.equal(capturedBody.note_scope, 'global', 'createNote must sanitize and deliver payload');
  assert.ok(!String(capturedBody.title).includes(secretToken) && !/[\u202E\x00]/.test(String(capturedBody.title)));
  assert.ok(!String(capturedBody.summary).includes(secretToken) && !String(capturedBody.summary).includes(urlEncoded) && !String(capturedBody.summary).includes(b64Encoded));
  assert.ok(!String(capturedBody.detail_ref).includes(secretToken) && !String(capturedBody.detail_ref).includes('\x07'));
  assert.equal('extra_untrusted_field' in capturedBody, false, 'Mass-assignment field must be stripped');
  assert.ok(!redactSensitiveText(`Token: ${secretToken} ${urlEncoded} ${b64Encoded} ${secretToken.replace('/', '\\/')}`, secretToken).includes(secretToken));
});

test('6. Enforces relational note_scope rules, leading-whitespace/data: URI blocking, and integer importance (1..5) bounds on createNote()', async () => {
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } }),
  });
  for (const badNote of [{ title: 'T', summary: 'S', note_scope: 'task' }, { title: 'T', summary: 'S', importance: 99 }, { title: 'T', summary: 'S', importance: NaN }, { title: 'T', summary: 'S', importance: 2.5 }, { title: '   ', summary: 'S' }]) {
    await assert.rejects(async () => client.createNote(badNote), (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_HUB_INVALID_PAYLOAD');
  }
  for (const badDetail of ['javascript:alert(1)', '  javascript:alert(1)', 'data:text/html,<script>', 'blob:https://evil.com', 'file:///etc/passwd', 'https://ok.com\r\n']) {
    await assert.rejects(async () => client.createNote({ title: 'T', summary: 'S', detail_ref: badDetail }), (err: any) => err.code === 'CASPER_HUB_INVALID_PAYLOAD');
  }
  for (const badTag of [['bad<script>'], ['bad\r\ntag'], new Array(25).fill('t')]) {
    await assert.rejects(async () => client.createNote({ title: 'T', summary: 'S', tags: badTag }), (err: any) => err.code === 'CASPER_HUB_INVALID_PAYLOAD');
  }
});

test('7. Preserves monotonic cursor progression, tracks real connectionActive state, and rejects malformed/float queries', async () => {
  const requestedUrls: string[] = [];
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const body = url.includes('/v1/changes') ? { events: [{ event_id: 10 }, { event_id: 14 }], next_cursor: 14 } : { sync_cursor: { latest_event_id: 11 }, assigned_tasks: [{ status: 'blocked' }], relevant_notes: [{ author_agent_id: 'CASPER-01' }, { author_agent_id: 'CASPER-04' }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(client.getStatus().connectionActive, false);
  await client.getChanges();
  assert.equal(client.getStatus().connectionActive, true);
  assert.ok(requestedUrls[0].endsWith('/v1/changes?after=0&limit=50'));
  assert.equal(client.getStatus().lastKnownCursor, 14);
  await client.getChanges();
  assert.ok(requestedUrls[1].endsWith('/v1/changes?after=14&limit=50'));
  const boot = await client.getBootstrap<Record<string, unknown>>();
  assert.equal(boot.data.effective_sync_cursor, 14);
  for (const badParams of [{ after: -1 }, { after: 1.5 }, { after: '' }, { after: '10abc' }, { limit: 500 }, { limit: 10.5 }, { limit: '' as any }]) {
    await assert.rejects(
      async () => client.getChanges(badParams),
      (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_HUB_INVALID_PAYLOAD',
    );
  }
});

test('8. Generates collision-free content-addressed idempotency keys across whitespace and delimiter variations', () => {
  const k1 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'Standby   check', summary: 'Ready for\n  mission' });
  const k2 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'Standby check', summary: 'Ready for mission' });
  const delim1 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'A|B', summary: 'C' });
  const delim2 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'A', summary: 'B|C' });
  assert.equal(k1, k2);
  assert.notEqual(delim1, delim2, 'Tuple encoding must prevent pipe-delimiter collisions');
  const nfcKey = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'تست'.normalize('NFD'), summary: 'S' });
  const nfdKey = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'تست'.normalize('NFC'), summary: 'S' });
  assert.equal(nfcKey, nfdKey, 'NFC and NFD Unicode variants must yield identical idempotency keys');
  assert.ok(k1.startsWith('casper-04-'));
});

test('9. Express route integration enforces admin auth, HPP query defense, Cache-Control: no-store, and cursor preservation', async () => {
  const routes = new Map<string, (req: any, res: any) => Promise<void>>();
  const fakeApp = { get: (p: string, h: any) => routes.set(`GET ${p}`, h), post: (p: string, h: any) => routes.set(`POST ${p}`, h) } as any;
  let lastUrl = '';
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async (u) => {
      lastUrl = String(u);
      return new Response(JSON.stringify({ authenticated: true, agent_id: 'CASPER-04', next_cursor: 22 }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  registerCasperHubRoutes(fakeApp, {
    client,
    verifyAdminAuth: async (req: any) => (req.headers?.['x-test-admin'] === '1' ? { ok: true, status: 200, message: 'OK' } : { ok: false, status: 401, message: 'ADMIN_AUTH_REQUIRED' }),
  });
  const makeRes = () => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: any = null;
    return {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      status: (c: number) => { statusCode = c; return { json: (b: any) => { body = b; } }; },
      get result() { return { statusCode, headers, body }; },
    };
  };
  const unauthRes = makeRes();
  await routes.get('GET /api/casper-hub/whoami')!({ headers: {}, query: {} }, unauthRes);
  assert.equal(unauthRes.result.statusCode, 401);
  assert.equal(unauthRes.result.headers['Cache-Control'], 'no-store');
  const authRes = makeRes();
  await routes.get('GET /api/casper-hub/whoami')!({ headers: { 'x-test-admin': '1' }, query: {} }, authRes);
  assert.equal(authRes.result.statusCode, 200);
  assert.equal(authRes.result.body.agent, 'CASPER-04');
  await routes.get('GET /api/casper-hub/changes')!({ headers: { 'x-test-admin': '1' }, query: { after: '5' } }, makeRes());
  await routes.get('GET /api/casper-hub/changes')!({ headers: { 'x-test-admin': '1' }, query: {} }, makeRes());
  assert.ok(lastUrl.includes('after=22'), `Expected omitted after query to preserve cursor 22, got ${lastUrl}`);
  for (const badQ of [{ after: 'bad!' }, { after: ['1', '2'] }, { limit: '10abc' }]) {
    const errRes = makeRes();
    await routes.get('GET /api/casper-hub/changes')!({ headers: { 'x-test-admin': '1' }, query: badQ }, errRes);
    assert.equal(errRes.result.statusCode, 400);
  }
});

test('10. Enforces Charter file-size guardrail (<= 290 lines) across all CASPER-04 and OP-217 files', () => {
  for (const rel of [
    'server/modules/casper-hub/casperHubClient.ts', 'server/modules/casper-hub/casperHubRoutes.ts',
    'server/modules/casper-hub/index.ts', 'server/modules/casper-hub/__tests__/casperHub.test.ts',
    'server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts',
    'src/utils/expressRouteCatalog.ts', 'src/utils/serverAdminSodAndBackupSecurity.ts',
    'src/utils/serverStoragePortabilityAndTracing.ts',
  ]) {
    const lines = fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length;
    assert.ok(lines <= 290, `Expected ${rel} <= 290 lines, got ${lines}`);
  }
});

test('11. Flags client-bundle leak if VITE_CASPER_HUB_TOKEN is present in env', () => {
  assert.equal(auditRuntimeEnvironmentAndSecurityPosture({ VITE_PUBLIC_URL: 'https://example.com' }).passed, true);
  const auditLeaked = auditRuntimeEnvironmentAndSecurityPosture({ VITE_CASPER_HUB_TOKEN: 'leaked-token' });
  assert.equal(auditLeaked.passed, false);
  assert.equal(auditLeaked.checks.find((c) => c.id === 'NO_CLIENT_BUNDLE_SECRET_EXPOSURE')?.status, 'FAIL');
});

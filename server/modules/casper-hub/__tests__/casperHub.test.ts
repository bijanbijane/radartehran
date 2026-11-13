/**
 * @file server/modules/casper-hub/__tests__/casperHub.test.ts
 * @description Adversarial unit & route integration test suite for the CASPER-04 server-side CASPER HUB client.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  CASPER_AGENT_ID,
  CASPER_AGENT_ROADMAP_ID,
  CasperHubClient,
  CasperHubClientError,
  buildDeterministicNoteIdempotencyKey,
  redactSensitiveText,
  registerCasperHubRoutes,
  resolveCasperHubConfig,
} from '../index';
import { auditRuntimeEnvironmentAndSecurityPosture } from '../../../../src/utils/serverStoragePortabilityAndTracing';

const TEST_ENV = {
  CASPER_HUB_URL: 'https://casper-hub-api.bijanbijane-1.workers.dev',
  CASPER_HUB_TOKEN: 'synth-token-casper-04',
};

test('1. Fails closed with CASPER_HUB_TOKEN_NOT_CONFIGURED / 503 when CASPER_HUB_TOKEN is absent without calling fetch', async () => {
  let netCalls = 0;
  const undefClient = new CasperHubClient({ env: {}, fetchImpl: async () => { netCalls++; return new Response('{}'); } });
  assert.equal(undefClient.getStatus().configured, false);
  assert.equal(undefClient.getStatus().agentId, 'CASPER-04');
  for (const res of [await undefClient.getWhoAmI(), await undefClient.getBootstrap(), await undefClient.getChanges(), await undefClient.postNote({ title: 'T', summary: 'S' })]) {
    assert.equal(res.ok, false);
    assert.equal(res.status, 503);
    assert.equal(res.errorCode, 'CASPER_HUB_TOKEN_NOT_CONFIGURED');
  }
  assert.equal(netCalls, 0, 'Unconfigured client must never send Bearer undefined over network');
});

test('2. Rejects non-HTTPS, loopback/IP literals, DNS-rebinding domains, credentials, and untrusted CASPER_HUB_URL hosts', () => {
  for (const invalidUrl of [
    'http://casper-hub-api.bijanbijane-1.workers.dev', 'https://127.0.0.1/v1', 'https://0x7f000001/v1',
    'https://127.1/v1', 'https://localhost/v1', 'https://169.254.169.254.nip.io/v1', 'https://10.0.0.1.sslip.io/v1',
    'https://metadata.internal/v1', 'https://user:pass@casper-hub-api.bijanbijane-1.workers.dev',
    'https://casper-hub-api.bijanbijane-1.workers.dev?leak=1', 'https://casper-hub-api.bijanbijane-1.workers.dev:22',
    'https://casper-hub-api.bijanbijane-1.workers.dev:8080', 'https://evil-attacker.example.com',
  ]) {
    assert.throws(
      () => resolveCasperHubConfig({ CASPER_HUB_URL: invalidUrl, CASPER_HUB_TOKEN: 'secret-token-04' }),
      (err: unknown) => err instanceof CasperHubClientError && err.code === 'CASPER_HUB_URL_INVALID',
      `Expected ${invalidUrl} to be rejected`,
    );
  }
});

test('3. Enforces redirect: "manual" SSRF guard and blocks 3xx redirects fail-closed', async () => {
  let capturedInit: RequestInit | undefined;
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return new Response('', { status: 302, headers: { location: 'https://evil.example.com' } });
    },
  });
  const res = await client.getWhoAmI();
  assert.equal(capturedInit?.redirect, 'manual');
  assert.equal(res.ok, false);
  assert.equal(res.status, 302);
});

test('4. Enforces strict CASPER-04 identity on inbound /v1/whoami and outbound note payloads', async () => {
  const mismatchClient = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ authenticated: true, agent_id: 'SYSTEM_ADMIN' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const badRes = await mismatchClient.getWhoAmI();
  assert.equal(badRes.ok, false);
  assert.equal(badRes.status, 403);
  assert.equal(badRes.errorCode, 'CASPER_AGENT_IDENTITY_MISMATCH');

  const okClient = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ authenticated: true, agent_id: 'CASPER-04' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const okRes = await okClient.getWhoAmI();
  assert.equal(okRes.ok, true);
  assert.equal(okClient.getStatus().agentId, 'CASPER-04');

  const spoofRes = await okClient.postNote({ title: 'Spoof attempt', summary: 'Should fail', metadata: { agent_id: 'CASPER-01' } } as any);
  assert.equal(spoofRes.ok, false);
  assert.equal(CASPER_AGENT_ID, 'CASPER-04');
  assert.equal(CASPER_AGENT_ROADMAP_ID, 'rm-casper-04');
});

test('5. Redacts raw, URL-encoded, Base64-encoded, and JSON-escaped tokens and rejects raw secret leaks in postNote()', async () => {
  const secretToken = 'super_secret+casper04/token=999';
  const urlEncoded = encodeURIComponent(secretToken);
  const b64Encoded = Buffer.from(secretToken, 'utf8').toString('base64');
  let capturedBody: Record<string, unknown> = {};
  const client = new CasperHubClient({
    env: { ...TEST_ENV, CASPER_HUB_TOKEN: secretToken },
    fetchImpl: async (input, init) => {
      if (init?.method === 'POST' && typeof init.body === 'string') {
        capturedBody = JSON.parse(init.body) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true, note: { note_id: 'note-1', author_agent_id: 'CASPER-04' } }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (String(input).endsWith('/v1/bootstrap')) {
        const rawWireJson = `{"sync_cursor":5,"__proto__":{"polluted":true},"relevant_notes":[{"summary":"Leaked \\u0042earer ${secretToken.replace('/', '\\/')} and ${b64Encoded}"}]}`;
        return new Response(rawWireJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `Invalid ${secretToken} / ${urlEncoded} / ${b64Encoded}` }), { status: 401, headers: { 'content-type': 'application/json' } });
    },
  });

  const whoamiErr = await client.getWhoAmI();
  assert.equal(whoamiErr.ok, false);
  assert.equal(whoamiErr.status, 401);
  assert.ok(!String(whoamiErr.error || '').includes(secretToken) && !String(whoamiErr.error || '').includes(b64Encoded));

  const boot = await client.getBootstrap<{ relevant_notes: Array<{ summary: string }> }>();
  assert.ok(!boot.data!.relevant_notes[0].summary.includes(secretToken) && !boot.data!.relevant_notes[0].summary.includes(b64Encoded));
  assert.equal(Object.prototype.hasOwnProperty.call(boot.data, '__proto__'), false);

  const leakAttempt = await client.postNote({ title: 'Secret leak', summary: `Bearer ${secretToken}` });
  assert.equal(leakAttempt.ok, false);
  assert.equal(leakAttempt.status, 422);

  await client.postNote({ title: 'Clean Title \u202E\x00', summary: 'Clean summary without secrets\u2066', detail_ref: 'https://example.com/ref', tags: ['alpha'] });
  assert.equal(capturedBody.note_scope, 'global');
  assert.ok(!/[\u202E\x00]/.test(String(capturedBody.title)));
  assert.ok(!redactSensitiveText(`Token: ${secretToken} ${urlEncoded} ${b64Encoded} ${secretToken.replace('/', '\\/')}`, secretToken).includes(secretToken));
});

test('6. Enforces relational note_scope rules, dangerous detail_ref rejection, and bounds on postNote()', async () => {
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } }),
  });
  for (const badNote of [{ title: 'T', summary: 'S', note_scope: 'task' }, { title: '   ', summary: 'S' }]) {
    const r = await client.postNote(badNote);
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
  }
  const resClamp = await client.postNote({ title: 'Clamped Importance', summary: 'Valid summary', importance: 99 });
  assert.equal(resClamp.ok, true);
  const badDetail = await client.postNote({ title: 'T', summary: 'S', detail_ref: 'javascript:alert(1)' });
  assert.equal(badDetail.ok, false);
  assert.equal(badDetail.status, 422);
});

test('7. Preserves monotonic cursor query progression across /v1/changes calls', async () => {
  const requestedUrls: string[] = [];
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ events: [{ event_id: 10 }, { event_id: 14 }], next_cursor: 14 }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const c1 = await client.getChanges({ after: 0, limit: 50 });
  assert.equal(c1.ok, true);
  assert.ok(requestedUrls[0].endsWith('/v1/changes?after=0&limit=50'));
  const c2 = await client.getChanges({ after: 14, limit: 50 });
  assert.equal(c2.ok, true);
  assert.ok(requestedUrls[1].endsWith('/v1/changes?after=14&limit=50'));
});

test('8. Generates collision-free content-addressed idempotency keys across whitespace and delimiter variations', () => {
  const k1 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'Standby   check', summary: 'Ready for\n  mission' });
  const k2 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'Standby check', summary: 'Ready for mission' });
  const delim1 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'A|B', summary: 'C' });
  const delim2 = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'A', summary: 'B|C' });
  assert.equal(k1, k2);
  assert.notEqual(delim1, delim2);
  const nfcKey = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'تست'.normalize('NFD'), summary: 'S' });
  const nfdKey = buildDeterministicNoteIdempotencyKey({ note_scope: 'roadmap', roadmap_id: 'rm-casper-04', task_id: null, note_type: 'checkpoint', title: 'تست'.normalize('NFC'), summary: 'S' });
  assert.equal(nfcKey, nfdKey);
  assert.ok(k1.startsWith('casper-04-'));
});

test('9. Express route integration enforces admin auth, Cache-Control: no-store, and CASPER-04 identity', async () => {
  const routes = new Map<string, (req: any, res: any) => Promise<void>>();
  const fakeApp = { get: (p: string, h: any) => routes.set(`GET ${p}`, h), post: (p: string, h: any) => routes.set(`POST ${p}`, h) } as any;
  const client = new CasperHubClient({
    env: TEST_ENV,
    fetchImpl: async () => new Response(JSON.stringify({ authenticated: true, agent_id: 'CASPER-04', next_cursor: 22 }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  registerCasperHubRoutes(fakeApp, {
    client,
    verifyAdminAuth: async (req: any) => (req.headers?.['x-test-admin'] === '1' ? { ok: true, status: 200, message: 'OK' } : { ok: false, status: 401, message: 'ADMIN_AUTH_REQUIRED' }),
  });
  const makeRes = () => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: any = null;
    return { setHeader: (k: string, v: string) => { headers[k] = v; }, status: (c: number) => { statusCode = c; return { json: (b: any) => { body = b; } }; }, get result() { return { statusCode, headers, body }; } };
  };
  const unauthRes = makeRes();
  await routes.get('GET /api/casper-hub/whoami')!({ headers: {}, query: {} }, unauthRes);
  assert.equal(unauthRes.result.statusCode, 401);
  assert.equal(unauthRes.result.headers['Cache-Control'], 'no-store');
  const authRes = makeRes();
  await routes.get('GET /api/casper-hub/whoami')!({ headers: { 'x-test-admin': '1' }, query: {} }, authRes);
  assert.equal(authRes.result.statusCode, 200);
  assert.equal(authRes.result.body.data.agent_id, 'CASPER-04');
});

test('10. Enforces Charter file-size guardrail (<= 290 lines) across all CASPER-04 files', () => {
  for (const rel of [
    'server/modules/casper-hub/casperHubClient.ts', 'server/modules/casper-hub/casperHubRoutes.ts',
    'server/modules/casper-hub/index.ts', 'server/modules/casper-hub/__tests__/casperHub.test.ts',
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

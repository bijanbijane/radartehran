import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Request, Response } from 'express';
import {
  DEFAULT_CASPER_HUB_URL,
  CasperHubClient,
  registerCasperHubRoutes,
  getCasperHubConfigStatus,
} from '../server/modules/casper-hub';

describe('CASPER-03 Hub Express Routes & End-to-End Proxy Integration', () => {
  const secretToken = 'integration_secret_token_never_log_777';
  const testEnv = {
    CASPER_HUB_URL: 'https://casper-hub-api.bijanbijane-1.workers.dev',
    CASPER_HUB_TOKEN: secretToken,
  };

  function setupApp() {
    const app = express();
    app.use(express.json());

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v1/whoami')) {
        return new Response(
          JSON.stringify({ authenticated: true, agent_id: 'CASPER-03', status: 'active' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/v1/bootstrap')) {
        return new Response(
          JSON.stringify({ hub: { service: 'casper-hub-api' }, agent: { agent_id: 'CASPER-03' }, notes: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/v1/changes')) {
        return new Response(
          JSON.stringify({ change_feed: [], notes: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/v1/notes') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        return new Response(
          JSON.stringify({ ok: true, note_id: 'note-uuid-123', event_seq: 42, received: body.title }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const client = new CasperHubClient({ env: testEnv, fetchImpl: mockFetch });

    registerCasperHubRoutes(app, {
      client,
      verifyAdminAuth: async (req: Request) => {
        if (req.headers['x-admin-token'] === 'valid-admin-token') {
          return { ok: true, status: 200, message: 'Authorized' };
        }
        return { ok: false, status: 401, message: 'Unauthorized' };
      },
    });

    return { app, client };
  }

  it('0. Presence-only Authorization and CASPER headers do not authenticate the default guard', async () => {
    const app = express();
    app.use(express.json());
    const client = new CasperHubClient({ env: testEnv, fetchImpl: async () => new Response('{}', { status: 200 }) });
    registerCasperHubRoutes(app, { client });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      for (const headers of [
        { Authorization: 'Bearer arbitrary-unverified-token' },
        { 'x-admin-token': 'anything' },
        { 'x-casper-session': 'anything' },
      ]) {
        const res = await fetch(`http://127.0.0.1:${port}/api/casper-hub/whoami`, { headers });
        assert.notEqual(res.status, 200, 'Unverified header presence must never grant CASPER HUB access');
      }
    } finally {
      server.close();
    }
  });

  it('1. GET /api/casper-hub/whoami rejects unauthenticated requests with 401', async () => {
    const { app } = setupApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/casper-hub/whoami`);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.status, 'error');
      assert.equal(json.code, 'Unauthorized');
    } finally {
      server.close();
    }
  });

  it('2. GET /api/casper-hub/whoami passes with valid admin token', async () => {
    const { app } = setupApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/casper-hub/whoami`, {
        headers: { 'x-admin-token': 'valid-admin-token' },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.agent_id, 'CASPER-03');
    } finally {
      server.close();
    }
  });

  it('3. POST /api/casper-hub/notes validates payload and proxies with Idempotency-Key', async () => {
    const { app } = setupApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const validNote = {
        note_scope: 'global',
        note_type: 'checkpoint',
        title: 'چک‌پوینت معتبر',
        summary: 'شرح جزئیات ارزیابی سیستم',
        tags: ['verification', 'quality'],
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/casper-hub/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': 'valid-admin-token',
        },
        body: JSON.stringify(validNote),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.ok, true);
      assert.equal(json.data.event_seq, 42);
    } finally {
      server.close();
    }
  });
});

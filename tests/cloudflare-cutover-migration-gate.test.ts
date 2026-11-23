import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';
import { createWorkerRequestContext } from '../worker/contextAndSecurity';
import { dispatchWorkerApiOrSeoRequest } from '../worker/router';

describe('Cloudflare cutover migration gate', () => {
  it('routes implemented Google and SMS authentication endpoints to the Worker while runtime schema checks remain fail-closed', () => {
    for (const [method, path] of [
      ['GET', '/api/auth/google/start'],
      ['GET', '/api/auth/google/callback'],
      ['POST', '/api/auth/phone/start'],
      ['POST', '/api/auth/phone/verify'],
      ['GET', '/api/auth/session'],
      ['POST', '/api/auth/logout'],
    ] as const) {
      const match = findMigrationRegisterEntry(method, path);
      assert.ok(match, `expected registered auth route: ${method} ${path}`);
      assert.equal(match.entry.status, 'IMPLEMENTED');
      assert.equal(match.entry.activeRuntime, 'cloudflare_worker');
      assert.equal(match.entry.workerHandlerModule, 'worker/routes/authRoutes.ts');
      assert.equal(match.entry.migrationGroup, 'GROUP_3A_CLOUDFLARE_NATIVE_AUTH');
    }
  });

  it('dispatches Google login to the Worker and returns a precise 503 when USER_DB is not bound', async () => {
    const ctx = createWorkerRequestContext(
      new Request('https://radartehran.ir/api/auth/google/start'),
      {},
    );
    const result = await dispatchWorkerApiOrSeoRequest(ctx);
    assert.ok(result);
    assert.equal(result.response.status, 503);
    assert.equal(result.migrationStatus, 'IMPLEMENTED');
    const payload = await result.response.json() as { code?: string };
    assert.equal(payload.code, 'USER_DB_NOT_BOUND');
  });

  it('keeps all D1 account workflows blocked while the native session schema is incomplete', () => {
    for (const [method, path] of [
      ['POST', '/api/account/deletion-requests'],
      ['POST', '/api/account/data-requests'],
      ['GET', '/api/account/favorites'],
      ['PATCH', '/api/account/profile'],
    ] as const) {
      const match = findMigrationRegisterEntry(method, path);
      assert.ok(match, `expected registered account route: ${method} ${path}`);
      assert.equal(match.entry.status, 'BLOCKED');
    }
  });

  it('keeps D1 marketplace reads and writes blocked until migrations 0007-0010 are applied', () => {
    for (const [method, path] of [
      ['GET', '/api/v1/market/state'],
      ['POST', '/api/v1/market/votes'],
      ['PUT', '/api/v1/market/preferences'],
    ] as const) {
      const match = findMigrationRegisterEntry(method, path);
      assert.ok(match, `expected registered marketplace route: ${method} ${path}`);
      assert.equal(match.entry.status, 'BLOCKED');
      assert.match(match.entry.blockerReason || '', /0010/);
    }
  });

  it('keeps media endpoints blocked while R2 remains deferred', () => {
    const match = findMigrationRegisterEntry('POST', '/api/object-storage/upload');
    assert.ok(match);
    assert.equal(match.entry.status, 'BLOCKED');
    assert.match(match.entry.blockerReason || '', /R2 is not enabled/);
  });
});

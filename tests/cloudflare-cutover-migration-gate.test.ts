import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';

describe('Cloudflare cutover migration gate', () => {
  it('keeps Google and SMS authentication endpoints blocked until D1 and provider configuration are ready', () => {
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
      assert.equal(match.entry.status, 'BLOCKED');
      assert.equal(match.entry.migrationGroup, 'GROUP_3A_CLOUDFLARE_NATIVE_AUTH');
    }
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

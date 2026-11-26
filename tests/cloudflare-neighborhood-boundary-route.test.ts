import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import workerEntrypoint from '../worker/index';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';

const endpoint = 'https://radartehran.ir/api/neighborhood-boundaries/resolve';

describe('Cloudflare Worker neighborhood boundary visualization route', () => {
  it('is explicitly registered as a native Worker route', () => {
    const match = findMigrationRegisterEntry('POST', '/api/neighborhood-boundaries/resolve');
    assert.ok(match);
    assert.equal(match.entry.status, 'IMPLEMENTED');
    assert.equal(match.entry.workerHandlerModule, 'worker/routes/neighborhoodBoundaryRoutes.ts');
  });

  it('returns bounded deterministic approximate geometry and a non-authoritative disclosure', async () => {
    const response = await workerEntrypoint.fetch(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        city: 'tehran',
        cityNameFa: 'تهران',
        neighborhoods: [
          { id: 1, name: 'پونک', lat: 35.75, lng: 51.32, radius: 1150 },
          { id: 2, name: 'سعادت‌آباد', lat: 35.78, lng: 51.37, radius: 1400 },
        ],
      }),
    }), { ENVIRONMENT: 'preview' });

    assert.equal(response.status, 200);
    const body = await response.json() as {
      status: string;
      cityNameFa: string;
      boundaries: Record<string, {
        hoodId: number;
        source: string;
        sourceLabelFa: string;
        coordinates: [number, number][];
      }>;
      geometryNoticeFa: string;
    };
    assert.equal(body.status, 'ok');
    assert.equal(body.cityNameFa, 'تهران');
    assert.equal(Object.keys(body.boundaries).length, 2);
    const first = body.boundaries['1'];
    assert.equal(first.source, 'computed_hex_fallback');
    assert.match(first.sourceLabelFa, /تقریبی/);
    assert.match(first.sourceLabelFa, /مرز رسمی یا ثبتی نیست/);
    assert.equal(first.coordinates.length, 7);
    assert.deepEqual(first.coordinates[0], first.coordinates[6]);
    assert.match(body.geometryNoticeFa, /مرز رسمی/);
  });

  it('rejects non-POST requests and non-JSON media types', async () => {
    const getResponse = await workerEntrypoint.fetch(new Request(endpoint), { ENVIRONMENT: 'preview' });
    assert.equal(getResponse.status, 405);

    const textResponse = await workerEntrypoint.fetch(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json',
    }), { ENVIRONMENT: 'preview' });
    assert.equal(textResponse.status, 415);
  });

  it('enforces a strict request-body byte ceiling', async () => {
    const response = await workerEntrypoint.fetch(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ neighborhoods: [], padding: 'x'.repeat(40_000) }),
    }), { ENVIRONMENT: 'preview' });
    assert.equal(response.status, 413);
  });

  it('strips markup delimiters from display names rather than reflecting HTML', async () => {
    const response = await workerEntrypoint.fetch(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        neighborhoods: [{ id: 5, name: '<b>پونک</b>', lat: 35.75, lng: 51.32 }],
      }),
    }), { ENVIRONMENT: 'development' });
    assert.equal(response.status, 200);
    const body = await response.json() as { boundaries: Record<string, { name: string }> };
    assert.equal(body.boundaries['5'].name, 'bپونک/b');
    assert.doesNotMatch(body.boundaries['5'].name, /[<>]/);
  });

  it('rejects empty, invalid, out-of-region, and over-range neighborhood identifiers', async () => {
    const response = await workerEntrypoint.fetch(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        neighborhoods: [
          { id: 1005, name: 'invalid id', lat: 35.7, lng: 51.3 },
          { id: 3, name: 'outside Iran', lat: 10, lng: 51.3 },
          { id: 4, name: '   ', lat: 35.7, lng: 51.3 },
        ],
      }),
    }), { ENVIRONMENT: 'preview' });
    assert.equal(response.status, 422);
  });
});

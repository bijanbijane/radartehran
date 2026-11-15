/**
 * @file tests/system-health-and-20-axes-audit.test.ts
 * @description End-to-end unit & composite failure tests for the Settings System Health Dashboard
 * (Firebase, Casper Hub, Cloud Databases) and the 20 debugging axes (Failure UX, Resource Leaks,
 * Concurrency Deduplication, Config Drift, and Composite Network/Auth/DB Failure Scenarios).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLatencyBand,
  computeCompositeSystemHealth,
  executeLiveSystemHealthProbes,
} from '../src/features/account/services/systemHealthProbeService';

describe('Settings System Health Dashboard & 20-Axis Composite Failure Audit', () => {
  it('classifies latency bands accurately across excellent (<120ms), normal (120-350ms), slow (>350ms), and offline states', () => {
    assert.deepEqual(classifyLatencyBand(42, 'online'), {
      band: 'excellent',
      badgeFa: 'عالی (کم‌تأخیر)',
    });
    assert.deepEqual(classifyLatencyBand(210, 'online'), {
      band: 'normal',
      badgeFa: 'متعادل و پایدار',
    });
    assert.deepEqual(classifyLatencyBand(580, 'degraded'), {
      band: 'slow',
      badgeFa: 'تأخیر بالا',
    });
    assert.deepEqual(classifyLatencyBand(null, 'offline'), {
      band: 'unreachable',
      badgeFa: 'عدم ارتباط',
    });
  });

  it('probes Firebase, Casper Hub, and Cloud Databases with measured latency (ms) when all services are online', async () => {
    const snapshot = await executeLiveSystemHealthProbes({
      browserOnline: true,
      probeFirebaseFn: async () => ({
        ok: true,
        degraded: false,
        latencyMs: 38,
        detailFa: 'متصل به دیتابیس ابری Firestore',
      }),
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/health/readiness')) {
          return new Response(
            JSON.stringify({
              ok: true,
              probe: 'readiness',
              state: 'ready',
              services: {
                casperHub: { reachable: true, configured: true, agentId: 'CASPER-05' },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            status: 'ok',
            providerLabelFa: 'Cloudflare R2 + D1',
            maxImageMb: 10,
            maxVideoMb: 50,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch,
    });

    assert.equal(snapshot.overallStatus, 'online');
    assert.equal(snapshot.overallScorePct, 100);
    assert.equal(snapshot.services.firebase.status, 'online');
    assert.equal(snapshot.services.firebase.latencyMs, 38);
    assert.equal(snapshot.services.casperHub.status, 'online');
    assert.ok(typeof snapshot.services.casperHub.latencyMs === 'number' && snapshot.services.casperHub.latencyMs >= 1);
    assert.equal(snapshot.services.cloudDatabase.status, 'online');
    assert.ok(snapshot.services.cloudDatabase.detailFa.includes('Cloudflare R2 + D1'));
    assert.ok(typeof snapshot.averageLatencyMs === 'number' && snapshot.averageLatencyMs >= 1);
  });

  it('Axis 11 & Axis 20: prevents false-positive online status when browser is offline or upstream services fail concurrently', async () => {
    const offlineSnapshot = await executeLiveSystemHealthProbes({
      browserOnline: false,
      probeFirebaseFn: async () => ({
        ok: true,
        degraded: false,
        latencyMs: 15,
        detailFa: 'cached',
      }),
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch,
    });

    assert.equal(offlineSnapshot.overallStatus, 'offline');
    assert.equal(offlineSnapshot.overallScorePct, 0);
    assert.equal(offlineSnapshot.averageLatencyMs, null);
    assert.equal(offlineSnapshot.services.firebase.status, 'offline');
    assert.equal(offlineSnapshot.services.casperHub.status, 'offline');
    assert.equal(offlineSnapshot.services.cloudDatabase.status, 'offline');

    // Composite partial degradation: Firebase in local cache mode + Casper Hub standby + Object storage timeout
    const degradedSnapshot = await executeLiveSystemHealthProbes({
      browserOnline: true,
      probeFirebaseFn: async () => ({
        ok: true,
        degraded: true,
        latencyMs: 145,
        detailFa: 'کش آفلاین فعال',
      }),
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/health/readiness')) {
          return new Response(
            JSON.stringify({
              ok: true,
              services: { casperHub: { reachable: true, configured: false } },
            }),
            { status: 200 },
          );
        }
        throw new Error('NETWORK_TIMEOUT');
      }) as typeof fetch,
    });

    assert.equal(degradedSnapshot.overallStatus, 'degraded');
    assert.equal(degradedSnapshot.services.firebase.status, 'degraded');
    assert.equal(degradedSnapshot.services.casperHub.status, 'degraded');
    assert.equal(degradedSnapshot.services.cloudDatabase.status, 'degraded');
    assert.equal(degradedSnapshot.overallScorePct, 65);
  });
});

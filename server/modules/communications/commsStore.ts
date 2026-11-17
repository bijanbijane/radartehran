/** @file server/modules/communications/commsStore.ts — Authoritative Server Communications State (Hydrated Cleanly, Zero Prod Seeding) */
import { CommsCoreStateEngine } from '../../../src/features/communications/services/commsEngine';
import {
  hydrateCommsEngineFromRepo,
  persistCommsEngineToRepo,
  resetCommsRepositoryForTests,
} from './commsRepository';

export const serverCommsEngine = new CommsCoreStateEngine();

let hydrated = false;

export function ensureServerCommsHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateCommsEngineFromRepo(serverCommsEngine);
}

export function persistServerCommsNow(immediate = false): void {
  persistCommsEngineToRepo(serverCommsEngine, immediate);
}

export function resetServerCommsStoreForTests(): void {
  hydrated = false;
  resetCommsRepositoryForTests(serverCommsEngine);
}

/** Test-only demo seeder; never automatically executed at production server startup */
export function seedServerCommsDemoForTests(demoUid = 'seed-user-1'): void {
  ensureServerCommsHydrated();
  serverCommsEngine.devices.push({
    deviceId: 'srv-dev-1',
    ownerUid: demoUid,
    platform: 'WEB_PUSH',
    labelFa: 'مرورگر وب آزمایشی',
    tokenMasked: 'wp_••••_test',
    active: true,
    registeredAtIso: new Date().toISOString(),
    revokedAtIso: null,
  });
  serverCommsEngine.ingestEvent({
    idempotencyKey: `srv-seed-sec-${demoUid}`,
    eventCode: 'SECURITY.NEW_LOGIN',
    recipientUid: demoUid,
    payload: { deviceSummary: 'نشست تأییدشده آزمایشی' },
    deepLinkPath: '/account/settings',
  });
}

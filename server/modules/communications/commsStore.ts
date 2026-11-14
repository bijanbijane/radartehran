/** @file server/modules/communications/commsStore.ts — Authoritative Server Communications State & Seeding */
import { CommsCoreStateEngine } from '../../../src/features/communications/services/commsEngine';

export const serverCommsEngine = new CommsCoreStateEngine();

let initialized = false;

export function ensureServerCommsSeeded(): void {
  if (initialized) return;
  initialized = true;
  const demoUid = 'seed-user-1';
  serverCommsEngine.devices.push({
    deviceId: 'srv-dev-1',
    ownerUid: demoUid,
    platform: 'WEB_PUSH',
    labelFa: 'مرورگر وب اصلی',
    tokenMasked: 'wp_••••_server',
    active: true,
    registeredAtIso: new Date().toISOString(),
    revokedAtIso: null,
  });

  serverCommsEngine.ingestEvent({
    idempotencyKey: 'srv-seed-sec-1',
    eventCode: 'SECURITY.NEW_LOGIN',
    recipientUid: demoUid,
    payload: { deviceSummary: 'نشست تأییدشده وب' },
    deepLinkPath: '/account/settings',
  });
  serverCommsEngine.ingestEvent({
    idempotencyKey: 'srv-seed-srv-1',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: demoUid,
    payload: { providerName: 'مهندس کاظمی', offeringTitle: 'بازدید فنی ساختمان', priceFa: '۲.۸ میلیون تومان' },
    deepLinkPath: '/services',
  });

  serverCommsEngine.createScopedConversation({
    type: 'SERVICE_REQUEST',
    contextEntityType: 'service_request',
    contextEntityId: 'srv-req-104',
    contextTitleFa: 'درخواست کارشناسی فنی · سعادت‌آباد',
    creatorUid: demoUid,
    participants: [
      { uid: demoUid, displayNameFa: 'متقاضی', roleLabelFa: 'متقاضی خدمت', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'provider-kazemi', displayNameFa: 'مهندس کاظمی', roleLabelFa: 'کارشناس فنی', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
}

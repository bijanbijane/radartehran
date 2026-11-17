/** @file server/modules/communications/commsRepository.ts — Durable Server Communications Repository & Cursor Pagination */
import crypto from 'node:crypto';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';
import { CommsCoreStateEngine } from '../../../src/features/communications/services/commsEngine';
import type {
  CommsAbuseReportRecord, CommsAuditRecord, ConversationRecord,
  DeadLetterRecord, DeliveryAttemptRecord, DeviceTokenRecord,
  NotificationRecord, UserCommsPreferences,
} from '../../../src/features/communications/types/comms.types';

export interface PersistedServerCommsSnapshot {
  schemaVersion: number;
  outboxKeys: string[];
  notifications: NotificationRecord[];
  preferencesByUid: Record<string, UserCommsPreferences>;
  devices: DeviceTokenRecord[];
  deliveries: DeliveryAttemptRecord[];
  deadLetters: DeadLetterRecord[];
  conversations: ConversationRecord[];
  reports: CommsAbuseReportRecord[];
  audits: CommsAuditRecord[];
  updatedAtIso: string;
}

const commsFileRepo = new AtomicJsonRepository<PersistedServerCommsSnapshot>('comms-state.json');

export function createEmptyCommsSnapshot(): PersistedServerCommsSnapshot {
  return {
    schemaVersion: 2,
    outboxKeys: [],
    notifications: [],
    preferencesByUid: {},
    devices: [],
    deliveries: [],
    deadLetters: [],
    conversations: [],
    reports: [],
    audits: [],
    updatedAtIso: new Date().toISOString(),
  };
}

export function hydrateCommsEngineFromRepo(engine: CommsCoreStateEngine): void {
  const snap = commsFileRepo.load(createEmptyCommsSnapshot);
  engine.notifications = Array.isArray(snap.notifications) ? snap.notifications : [];
  engine.devices = Array.isArray(snap.devices) ? snap.devices : [];
  engine.deliveries = Array.isArray(snap.deliveries) ? snap.deliveries : [];
  engine.deadLetters = Array.isArray(snap.deadLetters) ? snap.deadLetters : [];
  engine.conversations = Array.isArray(snap.conversations) ? snap.conversations : [];
  engine.reports = Array.isArray(snap.reports) ? snap.reports : [];
  engine.audits = Array.isArray(snap.audits) ? snap.audits : [];
  engine.preferencesByUid = new Map(Object.entries(snap.preferencesByUid || {}));
  engine.hydrateOutboxKeys(Array.isArray(snap.outboxKeys) ? snap.outboxKeys : []);
}

export function persistCommsEngineToRepo(engine: CommsCoreStateEngine, immediate = false): void {
  const snapshot: PersistedServerCommsSnapshot = {
    schemaVersion: 2,
    outboxKeys: engine.exportOutboxKeys(),
    notifications: engine.notifications.slice(0, 1500),
    preferencesByUid: Object.fromEntries(engine.preferencesByUid.entries()),
    devices: engine.devices.slice(0, 500),
    deliveries: engine.deliveries.slice(0, 2000),
    deadLetters: engine.deadLetters.slice(0, 500),
    conversations: engine.conversations.slice(0, 500),
    reports: engine.reports.slice(0, 500),
    audits: engine.audits.slice(0, 1000),
    updatedAtIso: new Date().toISOString(),
  };
  if (immediate) commsFileRepo.writeImmediate(snapshot);
  else commsFileRepo.saveDebounced(snapshot);
}

export function resetCommsRepositoryForTests(engine?: CommsCoreStateEngine): void {
  commsFileRepo.resetInMemoryCacheForTests();
  if (engine) {
    engine.notifications = [];
    engine.devices = [];
    engine.deliveries = [];
    engine.deadLetters = [];
    engine.conversations = [];
    engine.reports = [];
    engine.audits = [];
    engine.preferencesByUid.clear();
    engine.hydrateOutboxKeys([]);
  }
}

export function paginateNotifications(
  allForUser: NotificationRecord[],
  options: { cursor?: string; limit?: number },
): { items: NotificationRecord[]; nextCursor: string | null; hasMore: boolean; total: number } {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit || 25)));
  const sorted = [...allForUser].sort((a, b) => {
    const cmp = b.createdAtIso.localeCompare(a.createdAtIso);
    return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
  });

  let startIndex = 0;
  if (options.cursor) {
    try {
      const decoded = Buffer.from(options.cursor, 'base64url').toString('utf-8');
      const [cursorIso, cursorId] = decoded.split('|');
      const idx = sorted.findIndex((item) => item.createdAtIso === cursorIso && item.id === cursorId);
      if (idx >= 0) startIndex = idx + 1;
    } catch { /* ignore invalid cursor */ }
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + page.length < sorted.length;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(`${last.createdAtIso}|${last.id}`, 'utf-8').toString('base64url')
    : null;

  return { items: page, nextCursor, hasMore, total: sorted.length };
}

export function validateWebPushSubscriptionPayload(body: unknown): {
  valid: boolean; errorCode?: string; platform: 'WEB_PUSH' | 'PWA_MOBILE'; labelFa: string;
  endpointHost?: string; tokenFingerprint?: string; tokenMasked?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, errorCode: 'INVALID_PUSH_PAYLOAD', platform: 'WEB_PUSH', labelFa: '' };
  }
  const rec = body as Record<string, unknown>;
  const platform = rec.platform === 'PWA_MOBILE' ? 'PWA_MOBILE' : 'WEB_PUSH';
  const rawLabel = typeof rec.labelFa === 'string' && rec.labelFa.trim() ? rec.labelFa.trim().slice(0, 60) : 'مرورگر وب تاییدشده';
  const sub = rec.subscription as Record<string, unknown> | undefined;
  if (!sub || typeof sub.endpoint !== 'string') {
    return { valid: false, errorCode: 'MISSING_PUSH_SUBSCRIPTION', platform, labelFa: rawLabel };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sub.endpoint);
  } catch {
    return { valid: false, errorCode: 'INVALID_PUSH_ENDPOINT', platform, labelFa: rawLabel };
  }
  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, errorCode: 'INSECURE_PUSH_ENDPOINT', platform, labelFa: rawLabel };
  }
  const keys = sub.keys as Record<string, unknown> | undefined;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';
  if (p256dh.length < 16 || auth.length < 8) {
    return { valid: false, errorCode: 'INVALID_PUSH_KEYS', platform, labelFa: rawLabel };
  }
  const digest = crypto.createHash('sha256').update(`${sub.endpoint}|${p256dh}`).digest('hex');
  return {
    valid: true,
    platform,
    labelFa: rawLabel,
    endpointHost: parsedUrl.hostname,
    tokenFingerprint: digest.slice(0, 16),
    tokenMasked: `wp_${parsedUrl.hostname.slice(0, 8)}_••••_${digest.slice(-4)}`,
  };
}

export function scrubCommsAdminStats(conversations: ConversationRecord[]) {
  return {
    scopedConversationsCount: conversations.length,
    openConversationsCount: conversations.filter((c) => c.status === 'OPEN').length,
    // Zero access to message bodies or attachments in admin KPI outputs
  };
}

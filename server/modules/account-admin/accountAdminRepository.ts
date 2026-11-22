/** @file server/modules/account-admin/accountAdminRepository.ts — Durable UID-Isolated Account Settings, Sessions, Authoritative RBAC & Immutable Audit Ledger */
import crypto from 'node:crypto';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';
import type {
  AccountPrivacyPreferences,
  AccountProfileSettings,
  DataRequestRecord,
  NotificationChannelPreferences,
  SavedSearchWatchlistItem,
  UserSessionDevice,
} from '../../../src/features/account/types/account.types';
import type {
  AdminAuditLogEntry,
  AdminGovernancePermission,
  AdminGovernanceRole,
} from '../../../src/features/admin/types/admin.types';
import { ADMIN_ROLE_DEFINITIONS } from '../../../src/features/admin/types/adminRoleCatalog';
import type { ListingStatus } from '../../../src/features/properties/types/listing.types';
import type { ServiceComplaintRecord } from '../../../src/features/services/types/service.types';

export interface ServerProfileEnvelope extends AccountProfileSettings {
  version: number;
  verifiedTiers?: string[];
}

export interface ServerUserSessionRecord extends UserSessionDevice {
  uid: string;
  tokenDigestPrefix: string;
  revokedAtIso: string | null;
}

export interface ServerListingModerationState {
  listingId: string;
  status: ListingStatus;
  moderatorNoteFa: string;
  moderatedBy: string;
  updatedAtIso: string;
}

export interface ServerSensitiveOpExecution {
  idempotencyKey: string;
  opId: string;
  actorEmail: string;
  status: 'SUCCEEDED' | 'FAILED';
  affectedCount: number;
  summaryFa: string;
  executedAtIso: string;
}

export interface PersistedAccountAdminState {
  schemaVersion: number;
  profilesByUid: Record<string, ServerProfileEnvelope>;
  privacyByUid: Record<string, AccountPrivacyPreferences>;
  channelsByUid: Record<string, NotificationChannelPreferences>;
  savedSearchesByUid: Record<string, SavedSearchWatchlistItem[]>;
  sessionsByUid: Record<string, ServerUserSessionRecord[]>;
  dataRequestsByUid: Record<string, DataRequestRecord[]>;
  adminRoleBindings: Record<string, AdminGovernanceRole>;
  adminAuditLogs: AdminAuditLogEntry[];
  listingModerations: Record<string, ServerListingModerationState>;
  disputes: ServiceComplaintRecord[];
  sensitiveOpExecutions: Record<string, ServerSensitiveOpExecution>;
  updatedAtIso: string;
}

const accountAdminFileRepo = new AtomicJsonRepository<PersistedAccountAdminState>('account-admin-state.json');

export function createInitialAccountAdminState(): PersistedAccountAdminState {
  return {
    schemaVersion: 2,
    profilesByUid: {},
    privacyByUid: {},
    channelsByUid: {},
    savedSearchesByUid: {},
    sessionsByUid: {},
    dataRequestsByUid: {},
    adminRoleBindings: {},
    adminAuditLogs: [],
    listingModerations: {},
    disputes: [],
    sensitiveOpExecutions: {},
    updatedAtIso: new Date().toISOString(),
  };
}

export function getAccountAdminState(): PersistedAccountAdminState {
  return accountAdminFileRepo.load(createInitialAccountAdminState);
}

export function saveAccountAdminState(immediate = false): void {
  const s = getAccountAdminState();
  s.updatedAtIso = new Date().toISOString();
  if (immediate) accountAdminFileRepo.writeImmediate(s);
  else accountAdminFileRepo.saveDebounced(s);
}

export function resetAccountAdminRepositoryForTests(): PersistedAccountAdminState {
  accountAdminFileRepo.resetInMemoryCacheForTests();
  return getAccountAdminState();
}

export function resolveAuthoritativeAdminPrincipal(params: {
  uid?: string;
  email?: string;
  authReason: string;
  authTimeSeconds?: number;
}): {
  role: AdminGovernanceRole;
  permissions: AdminGovernancePermission[];
  labelFa: string;
  isPrimaryBootstrapAdmin: boolean;
  sessionExpiresAtIso: string;
} {
  const state = getAccountAdminState();
  const normalizedEmail = (params.email || '').trim().toLowerCase();
  const isPrimary = params.authReason === 'AUTHORIZED_BOOTSTRAP_ADMIN' || params.authReason === 'AUTHORIZED_SERVER_SECRET';
  const boundRole = (params.uid && state.adminRoleBindings[params.uid]) || (normalizedEmail && state.adminRoleBindings[normalizedEmail]);
  const role: AdminGovernanceRole = isPrimary ? 'super_admin' : boundRole || 'content_moderator';
  const def = ADMIN_ROLE_DEFINITIONS.find((d) => d.role === role) || ADMIN_ROLE_DEFINITIONS[1];
  const baseMs = (params.authTimeSeconds ? params.authTimeSeconds * 1000 : Date.now()) + 60 * 60 * 1000;
  return {
    role: def.role,
    permissions: [...def.permissions],
    labelFa: def.labelFa,
    isPrimaryBootstrapAdmin: isPrimary,
    sessionExpiresAtIso: new Date(baseMs).toISOString(),
  };
}

export function appendServerAdminAuditLog(entry: Omit<AdminAuditLogEntry, 'id' | 'timestampIso'>): AdminAuditLogEntry {
  const state = getAccountAdminState();
  const safeReason = String(entry.reasonFa || '')
    .replace(/(token|password|secret|apiKey|phone|email)\s*[:=]\s*\S+/gi, '$1:[REDACTED]')
    .replace(/\b09\d{9}\b/g, '[PHONE_REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]')
    .slice(0, 240);
  const record: AdminAuditLogEntry = {
    ...entry,
    reasonFa: safeReason || 'رویداد ثبت‌شده در سرور',
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestampIso: new Date().toISOString(),
  };
  state.adminAuditLogs.unshift(record);
  if (state.adminAuditLogs.length > 2000) state.adminAuditLogs.length = 2000;
  saveAccountAdminState();
  return record;
}

export function recordServerSessionActivity(params: {
  uid: string;
  rawAuthHeader?: string;
  userAgent?: string;
}): ServerUserSessionRecord[] {
  const state = getAccountAdminState();
  const tokenPart = (params.rawAuthHeader || '').replace(/^Bearer\s+/i, '').slice(0, 128);
  const digest = crypto.createHash('sha256').update(`${params.uid}|${tokenPart || 'session'}`).digest('hex').slice(0, 12);
  const list = state.sessionsByUid[params.uid] || [];
  const ua = (params.userAgent || 'مرورگر وب').slice(0, 80);
  const nowIso = new Date().toISOString();
  const existingIdx = list.findIndex((s) => s.tokenDigestPrefix === digest);
  if (existingIdx >= 0) {
    list[existingIdx] = {
      ...list[existingIdx],
      lastActiveLabelFa: 'هم‌اکنون',
      isCurrent: true,
    };
  } else {
    for (let i = 0; i < list.length; i++) list[i] = { ...list[i], isCurrent: false };
    list.unshift({
      sessionId: `sess-${digest}`,
      uid: params.uid,
      tokenDigestPrefix: digest,
      deviceLabelFa: ua.includes('Mobile') ? 'نشست موبایل تاییدشده' : 'مرورگر دسکتاپ تاییدشده',
      browserSummaryFa: ua,
      lastActiveLabelFa: `ثبت‌شده در ${nowIso.slice(11, 16)} UTC`,
      isCurrent: true,
      trusted: true,
      revokedAtIso: null,
    });
  }
  state.sessionsByUid[params.uid] = list.filter((s) => !s.revokedAtIso).slice(0, 15);
  saveAccountAdminState();
  return state.sessionsByUid[params.uid].map((s) => ({ ...s, isCurrent: s.tokenDigestPrefix === digest }));
}

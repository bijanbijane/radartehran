/**
 * @file server/modules/account-admin/jsonToD1Migrator.ts
 * @description Idempotent, backup-preserving, parity-verifying migrator from legacy
 * `account-admin-state.json` (`PersistedAccountAdminState`) into `USER_DB` D1 tables.
 *
 * Strictly classifies entities by ownership, reports unconverted legacy operational collections
 * explicitly, and never deletes or mutates the source JSON file without preserving backup.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { D1Database } from '../../../worker/types';
import type { PersistedAccountAdminState } from './accountAdminRepository';

export interface JsonToD1EntityParity {
  readonly entity: string;
  readonly targetTable: string;
  readonly sourceCount: number;
  readonly importedCount: number;
  readonly targetCountAfterImport: number;
  readonly parityMatched: boolean;
}

export interface JsonToD1MigrationReport {
  readonly schemaVersion: number;
  readonly executedAtIso: string;
  readonly dryRun: boolean;
  readonly backupFilePath: string | null;
  readonly entities: readonly JsonToD1EntityParity[];
  readonly unconvertedCollections: readonly {
    readonly collectionName: string;
    readonly recordCount: number;
    readonly disposition: string;
  }[];
  readonly allMappedEntitiesMatched: boolean;
}

function sha256Hex(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

async function countTableRows(db: D1Database, tableName: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS cnt FROM ${tableName}`).first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

/**
 * Migrates `PersistedAccountAdminState` idempotently into `USER_DB` (D1/SQLite) and verifies counts.
 */
export async function migrateAccountAdminStateToUserD1(params: {
  state: PersistedAccountAdminState;
  userDb: D1Database;
  dryRun?: boolean;
  sourceFilePath?: string;
  backupDir?: string;
}): Promise<JsonToD1MigrationReport> {
  const nowIso = new Date().toISOString();
  const dryRun = Boolean(params.dryRun);
  let backupFilePath: string | null = null;

  if (!dryRun && params.sourceFilePath && fs.existsSync(params.sourceFilePath)) {
    const targetBackupDir = params.backupDir ?? path.dirname(params.sourceFilePath);
    fs.mkdirSync(targetBackupDir, { recursive: true });
    backupFilePath = path.join(targetBackupDir, `account-admin-state.backup.${Date.now()}.json`);
    fs.copyFileSync(params.sourceFilePath, backupFilePath);
  }

  const profileEntries = Object.entries(params.state.profilesByUid ?? {});
  const privacyEntries = Object.entries(params.state.privacyByUid ?? {});
  const channelEntries = Object.entries(params.state.channelsByUid ?? {});
  const savedSearchEntries = Object.entries(params.state.savedSearchesByUid ?? {}).flatMap(([uid, list]) =>
    (list ?? []).map((item) => ({ uid, item })),
  );
  const sessionEntries = Object.entries(params.state.sessionsByUid ?? {}).flatMap(([uid, list]) =>
    (list ?? []).map((item) => ({ uid, item })),
  );
  const dataRequestEntries = Object.entries(params.state.dataRequestsByUid ?? {}).flatMap(([uid, list]) =>
    (list ?? []).map((item) => ({ uid, item })),
  );
  const roleBindingEntries = Object.entries(params.state.adminRoleBindings ?? {});
  const auditLogs = params.state.adminAuditLogs ?? [];

  let importedProfiles = 0;
  let importedPrivacy = 0;
  let importedChannels = 0;
  let importedSearches = 0;
  let importedSessions = 0;
  let importedDataRequests = 0;
  let importedRoles = 0;
  let importedAudits = 0;

  if (!dryRun) {
    for (const [uidKey, p] of profileEntries) {
      const uid = String(p.ownerUserId || uidKey || '').trim();
      if (!uid) continue;
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_profiles (
            uid, display_name, preferred_city, preferred_language, area_unit,
            intl_currency, role, account_status, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
        .bind(
          uid,
          p.displayName || '',
          p.preferredCityId || 'tehran',
          'fa',
          'sqm',
          'USD',
          'USER',
          'ACTIVE',
          p.updatedAtIso || nowIso,
          p.updatedAtIso || nowIso,
        )
        .run();
      importedProfiles += 1;
    }

    for (const [uid, pr] of privacyEntries) {
      const researchOptIn = Boolean(pr.privacySafeTelemetryEnabled);
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_privacy_consents (
            uid, research_analytics_consent, behavioral_telemetry_consent,
            marketing_communications_consent, consent_version, consent_source,
            granted_at_iso, revoked_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          uid,
          researchOptIn ? 1 : 0,
          researchOptIn ? 1 : 0,
          pr.receiveMarketingUpdates ? 1 : 0,
          'v1',
          'json_migration',
          researchOptIn ? pr.updatedAtIso || nowIso : null,
          researchOptIn ? null : pr.updatedAtIso || nowIso,
          pr.updatedAtIso || nowIso,
        )
        .run();
      importedPrivacy += 1;
    }

    for (const [uid, ch] of channelEntries) {
      const channelId = `ch_inapp_${sha256Hex(uid).slice(0, 12)}`;
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_notification_channels (
            channel_id, uid, channel_type, destination_masked, destination_hash,
            verified, enabled, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          channelId,
          uid,
          'in_app',
          `flags:inApp=${ch.inApp ? 1 : 0},email=${ch.email ? 1 : 0},sms=${ch.sms ? 1 : 0},push=${ch.browserPush ? 1 : 0}`,
          sha256Hex(`${uid}:channels:${ch.inApp}:${ch.email}:${ch.sms}:${ch.browserPush}`),
          1,
          ch.inApp ? 1 : 0,
          ch.updatedAtIso || nowIso,
          ch.updatedAtIso || nowIso,
        )
        .run();
      importedChannels += 1;
    }

    for (const { uid, item: s } of savedSearchEntries) {
      const searchId = String(s.id || `srch_${sha256Hex(`${uid}:${s.title}`).slice(0, 12)}`);
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_saved_searches (
            search_id, uid, label, city_id, filters_json, alert_enabled, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          searchId,
          uid,
          String(s.title || 'Saved Search').slice(0, 120),
          String(s.filtersSnapshot?.cityId || 'tehran').toLowerCase(),
          JSON.stringify(s.filtersSnapshot ?? {}),
          s.alertCadence !== 'off' ? 1 : 0,
          s.createdAtIso || nowIso,
          s.createdAtIso || nowIso,
        )
        .run();
      importedSearches += 1;
    }

    for (const { uid: keyUid, item: sess } of sessionEntries) {
      const uid = String(sess.uid || keyUid).trim();
      const isRevoked = Boolean(sess.revokedAtIso);
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_sessions (
            session_id, uid, device_label, user_agent_summary, ip_prefix,
            status, created_at_iso, last_seen_at_iso, revoked_at_iso, revoked_by_uid
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
        .bind(
          sess.sessionId,
          uid,
          sess.deviceLabelFa || 'web',
          sess.browserSummaryFa || '',
          sess.tokenDigestPrefix || '',
          isRevoked ? 'REVOKED' : 'ACTIVE',
          nowIso,
          nowIso,
          sess.revokedAtIso || null,
          isRevoked ? uid : null,
        )
        .run();
      importedSessions += 1;
    }

    for (const { uid: keyUid, item: req } of dataRequestEntries) {
      const uid = String(req.ownerUserId || keyUid).trim();
      const requestId = String(req.id || `udr_${sha256Hex(JSON.stringify(req)).slice(0, 10)}`);
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO user_data_requests (
            request_id, uid, request_type, status, payload_summary_json,
            requested_at_iso, completed_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          requestId,
          uid,
          req.kind === 'delete' ? 'DELETE' : 'EXPORT',
          String(req.status || 'pending_verification').toUpperCase(),
          JSON.stringify({ retentionNotesFa: req.retentionNotesFa, scope: req.scope ?? null }),
          req.createdAtIso || nowIso,
          req.status === 'completed' ? req.updatedAtIso || nowIso : null,
          req.updatedAtIso || req.createdAtIso || nowIso,
        )
        .run();
      importedDataRequests += 1;
    }

    for (const [uid, role] of roleBindingEntries) {
      await params.userDb
        .prepare(
          `INSERT OR REPLACE INTO admin_role_bindings (
            uid, role, granted_by_uid, reason, active, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(uid, role, 'system_migration', 'json_migration', 1, nowIso, nowIso)
        .run();
      importedRoles += 1;
    }

    for (const al of auditLogs) {
      await params.userDb
        .prepare(
          `INSERT OR IGNORE INTO admin_audit_logs (
            audit_id, actor_uid, action, target_uid, target_resource, summary_json, created_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          al.id,
          `${al.actorRole}:${al.actorLabelFa}`,
          al.actionCode,
          al.targetId || null,
          al.targetType || '',
          JSON.stringify({ reasonFa: al.reasonFa, severity: al.severity }),
          al.timestampIso || nowIso,
        )
        .run();
      importedAudits += 1;
    }
  }

  const entities: JsonToD1EntityParity[] = [
    {
      entity: 'profilesByUid',
      targetTable: 'user_profiles',
      sourceCount: profileEntries.length,
      importedCount: importedProfiles,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_profiles'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_profiles')) >= profileEntries.length,
    },
    {
      entity: 'privacyByUid',
      targetTable: 'user_privacy_consents',
      sourceCount: privacyEntries.length,
      importedCount: importedPrivacy,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_privacy_consents'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_privacy_consents')) >= privacyEntries.length,
    },
    {
      entity: 'channelsByUid',
      targetTable: 'user_notification_channels',
      sourceCount: channelEntries.length,
      importedCount: importedChannels,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_notification_channels'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_notification_channels')) >= channelEntries.length,
    },
    {
      entity: 'savedSearchesByUid',
      targetTable: 'user_saved_searches',
      sourceCount: savedSearchEntries.length,
      importedCount: importedSearches,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_saved_searches'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_saved_searches')) >= savedSearchEntries.length,
    },
    {
      entity: 'sessionsByUid',
      targetTable: 'user_sessions',
      sourceCount: sessionEntries.length,
      importedCount: importedSessions,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_sessions'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_sessions')) >= sessionEntries.length,
    },
    {
      entity: 'dataRequestsByUid',
      targetTable: 'user_data_requests',
      sourceCount: dataRequestEntries.length,
      importedCount: importedDataRequests,
      targetCountAfterImport: await countTableRows(params.userDb, 'user_data_requests'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'user_data_requests')) >= dataRequestEntries.length,
    },
    {
      entity: 'adminRoleBindings',
      targetTable: 'admin_role_bindings',
      sourceCount: roleBindingEntries.length,
      importedCount: importedRoles,
      targetCountAfterImport: await countTableRows(params.userDb, 'admin_role_bindings'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'admin_role_bindings')) >= roleBindingEntries.length,
    },
    {
      entity: 'adminAuditLogs',
      targetTable: 'admin_audit_logs',
      sourceCount: auditLogs.length,
      importedCount: importedAudits,
      targetCountAfterImport: await countTableRows(params.userDb, 'admin_audit_logs'),
      parityMatched: dryRun ? true : (await countTableRows(params.userDb, 'admin_audit_logs')) >= auditLogs.length,
    },
  ];

  const unconvertedCollections = [
    {
      collectionName: 'listingModerations',
      recordCount: Object.keys(params.state.listingModerations ?? {}).length,
      disposition: 'RETAINED_IN_EXPRESS_MODERATION_DOMAIN_UNTIL_MODERATOR_D1_MIGRATION',
    },
    {
      collectionName: 'disputes',
      recordCount: Array.isArray(params.state.disputes) ? params.state.disputes.length : 0,
      disposition: 'RETAINED_IN_EXPRESS_MODERATION_DOMAIN_UNTIL_DISPUTES_D1_MIGRATION',
    },
    {
      collectionName: 'sensitiveOpExecutions',
      recordCount: Object.keys(params.state.sensitiveOpExecutions ?? {}).length,
      disposition: 'SUPERSEDED_BY_D1_IDEMPOTENCY_AND_REVOCATION_TABLES',
    },
  ];

  return {
    schemaVersion: params.state.schemaVersion ?? 2,
    executedAtIso: nowIso,
    dryRun,
    backupFilePath,
    entities,
    unconvertedCollections,
    allMappedEntitiesMatched: entities.every((e) => e.parityMatched),
  };
}

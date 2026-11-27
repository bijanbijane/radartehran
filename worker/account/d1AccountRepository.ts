/**
 * @file worker/account/d1AccountRepository.ts
 * @description Worker-native D1 Account, Profile, Privacy Consent, Favorites, Saved Searches,
 * Sessions, and Data Requests repository operating strictly on `USER_DB` (never `RESEARCH_DB`).
 */
import type { D1Database } from '../types';
import {
  mapConsentRevocationJobRow,
  type ResearchConsentRevocationJobRecord,
} from '../research/researchConsentBarrier';

export interface D1UserProfile {
  readonly uid: string;
  readonly displayName: string;
  readonly preferredCity: string;
  readonly preferredLanguage: string;
  readonly areaUnit: 'sqm' | 'sqft';
  readonly intlCurrency: string;
  readonly role: string;
  readonly accountStatus: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface D1UserPrivacyConsent {
  readonly uid: string;
  readonly researchAnalyticsConsent: boolean;
  readonly behavioralTelemetryConsent: boolean;
  readonly marketingCommunicationsConsent: boolean;
  readonly consentVersion: string;
  readonly consentRevision: number;
  readonly consentSource: string;
  readonly grantedAtIso: string | null;
  readonly revokedAtIso: string | null;
  readonly updatedAtIso: string;
}

export interface D1UserSession {
  readonly sessionId: string;
  readonly uid: string;
  readonly deviceLabel: string;
  readonly userAgentSummary: string;
  readonly ipPrefix: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly createdAtIso: string;
  readonly lastSeenAtIso: string;
  readonly revokedAtIso: string | null;
  readonly revokedByUid: string | null;
}

export interface D1UserFavorite {
  readonly uid: string;
  readonly cityId: string;
  readonly hoodId: number;
  readonly note: string;
  readonly createdAtIso: string;
}

export interface D1UserSavedSearch {
  readonly searchId: string;
  readonly uid: string;
  readonly label: string;
  readonly cityId: string;
  readonly filtersJson: string;
  readonly alertEnabled: boolean;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface D1UserDataRequest {
  readonly requestId: string;
  readonly uid: string;
  readonly requestType: 'EXPORT' | 'ERASURE' | 'RECTIFICATION';
  readonly status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED_LEGAL_HOLD';
  readonly payloadSummaryJson: string;
  readonly requestedAtIso: string;
  readonly completedAtIso: string | null;
  readonly updatedAtIso: string;
}

export class AccountWriteBlockedError extends Error {
  public readonly code = 'ACCOUNT_WRITE_BLOCKED';
  public readonly statusCode = 423;
  constructor(uid: string) {
    super(`Account writes are blocked during lifecycle deletion for uid=${uid}`);
    this.name = 'AccountWriteBlockedError';
  }
}

export async function assertUserNotWriteBlocked(userDb: D1Database, uid: string): Promise<void> {
  const result = await userDb
    .prepare('SELECT uid FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL')
    .bind(uid)
    .all<{ uid: string }>();
  if (!result.success) throw new Error('ACCOUNT_WRITE_BLOCK_CHECK_UNAVAILABLE');
  if (result.results.length > 0) {
    throw new AccountWriteBlockedError(uid);
  }
}

export async function getUserProfileFromD1(userDb: D1Database, uid: string): Promise<D1UserProfile | null> {
  const profileRead = await userDb
    .prepare('SELECT * FROM user_profiles WHERE uid = ?1')
    .bind(uid)
    .all<Record<string, unknown>>();
  if (!profileRead.success) throw new Error('USER_PROFILE_READ_FAILED');
  const row = profileRead.results[0];
  if (!row) return null;
  return {
    uid: String(row.uid),
    displayName: String(row.display_name || ''),
    preferredCity: String(row.preferred_city || 'tehran'),
    preferredLanguage: String(row.preferred_language || 'fa'),
    areaUnit: row.area_unit === 'sqft' ? 'sqft' : 'sqm',
    intlCurrency: String(row.intl_currency || 'USD'),
    role: String(row.role || 'USER'),
    accountStatus: String(row.account_status || 'ACTIVE'),
    createdAtIso: String(row.created_at_iso),
    updatedAtIso: String(row.updated_at_iso),
  };
}

export async function upsertUserProfileInD1(
  userDb: D1Database,
  params: {
    uid: string;
    displayName?: string;
    preferredCity?: string;
    preferredLanguage?: string;
    areaUnit?: 'sqm' | 'sqft';
    intlCurrency?: string;
    role?: string;
    nowIso?: string;
  },
): Promise<D1UserProfile> {
  await assertUserNotWriteBlocked(userDb, params.uid);
  const existing = await getUserProfileFromD1(userDb, params.uid);
  const nowIso = params.nowIso ?? new Date().toISOString();
  const next: D1UserProfile = {
    uid: params.uid,
    displayName: (params.displayName ?? existing?.displayName ?? '').trim().slice(0, 80),
    preferredCity: (params.preferredCity ?? existing?.preferredCity ?? 'tehran').trim().toLowerCase().slice(0, 32),
    preferredLanguage: (params.preferredLanguage ?? existing?.preferredLanguage ?? 'fa').trim().toLowerCase().slice(0, 12),
    areaUnit: params.areaUnit ?? existing?.areaUnit ?? 'sqm',
    intlCurrency: (params.intlCurrency ?? existing?.intlCurrency ?? 'USD').trim().toUpperCase().slice(0, 8),
    role: params.role ?? existing?.role ?? 'USER',
    accountStatus: existing?.accountStatus ?? 'ACTIVE',
    createdAtIso: existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };

  const upsertResult = await userDb
    .prepare(
      `INSERT INTO user_profiles (
        uid, display_name, preferred_city, preferred_language, area_unit,
        intl_currency, role, account_status, created_at_iso, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(uid) DO UPDATE SET
        display_name = excluded.display_name,
        preferred_city = excluded.preferred_city,
        preferred_language = excluded.preferred_language,
        area_unit = excluded.area_unit,
        intl_currency = excluded.intl_currency,
        role = excluded.role,
        account_status = excluded.account_status,
        updated_at_iso = excluded.updated_at_iso`,
    )
    .bind(
      next.uid,
      next.displayName,
      next.preferredCity,
      next.preferredLanguage,
      next.areaUnit,
      next.intlCurrency,
      next.role,
      next.accountStatus,
      next.createdAtIso,
      next.updatedAtIso,
    )
    .run();

  if (upsertResult.success !== true) throw new Error('USER_PROFILE_WRITE_FAILED');
  return next;
}

export async function getUserPrivacyConsentFromD1(userDb: D1Database, uid: string): Promise<D1UserPrivacyConsent> {
  const consentRead = await userDb
    .prepare('SELECT * FROM user_privacy_consents WHERE uid = ?1')
    .bind(uid)
    .all<Record<string, unknown>>();
  if (!consentRead.success) throw new Error('USER_PRIVACY_CONSENT_READ_FAILED');
  const row = consentRead.results[0];
  if (!row) {
    return {
      uid,
      researchAnalyticsConsent: false,
      behavioralTelemetryConsent: false,
      marketingCommunicationsConsent: false,
      consentVersion: 'v1',
      consentRevision: 0,
      consentSource: 'default_opt_out',
      grantedAtIso: null,
      revokedAtIso: null,
      updatedAtIso: new Date(0).toISOString(),
    };
  }
  const consentRevision = Number(row.consent_revision ?? 1);
  if (!Number.isSafeInteger(consentRevision) || consentRevision < 1) {
    throw new Error('CONSENT_REVISION_INVALID');
  }
  return {
    uid: String(row.uid),
    researchAnalyticsConsent: Number(row.research_analytics_consent) === 1,
    behavioralTelemetryConsent: Number(row.behavioral_telemetry_consent) === 1,
    marketingCommunicationsConsent: Number(row.marketing_communications_consent) === 1,
    consentVersion: String(row.consent_version || 'v1'),
    consentRevision,
    consentSource: String(row.consent_source || 'account_settings'),
    grantedAtIso: row.granted_at_iso ? String(row.granted_at_iso) : null,
    revokedAtIso: row.revoked_at_iso ? String(row.revoked_at_iso) : null,
    updatedAtIso: String(row.updated_at_iso),
  };
}

export async function updateUserPrivacyConsentInD1(
  userDb: D1Database,
  params: {
    uid: string;
    actorUid: string;
    researchAnalyticsConsent?: boolean;
    behavioralTelemetryConsent?: boolean;
    marketingCommunicationsConsent?: boolean;
    consentVersion?: string;
    consentSource?: string;
    expectedConsentRevision?: number;
    nowIso?: string;
  },
): Promise<D1UserPrivacyConsent> {
  await assertUserNotWriteBlocked(userDb, params.uid);
  const current = await getUserPrivacyConsentFromD1(userDb, params.uid);
  if (
    params.expectedConsentRevision !== undefined &&
    current.consentRevision !== params.expectedConsentRevision
  ) {
    throw new Error('CONSENT_REVISION_CONFLICT');
  }
  const nowIso = params.nowIso ?? new Date().toISOString();

  const nextResearch = params.researchAnalyticsConsent ?? current.researchAnalyticsConsent;
  const pendingRevocation = await userDb
    .prepare(
      `SELECT revocation_id FROM research_consent_revocation_jobs
       WHERE uid = ?1 AND status IN ('DRAINING_PERMITS', 'PENDING_ERASURE')
       LIMIT 1`,
    )
    .bind(params.uid)
    .first<{ revocation_id: string }>();
  const isBarrierRevocationTransition =
    params.researchAnalyticsConsent === false &&
    current.researchAnalyticsConsent &&
    (params.consentSource === 'research_consent_revocation_barrier' ||
      params.consentSource === 'research_consent_revocation_reconcile');
  if (pendingRevocation && !isBarrierRevocationTransition) {
    throw new Error('RESEARCH_CONSENT_REVOCATION_PENDING');
  }
  const nextTelemetry = params.behavioralTelemetryConsent ?? current.behavioralTelemetryConsent;
  const nextMarketing = params.marketingCommunicationsConsent ?? current.marketingCommunicationsConsent;
  const consentVersion = (params.consentVersion ?? current.consentVersion ?? 'v1').trim().slice(0, 24);
  const consentSource = (params.consentSource ?? 'account_settings').trim().slice(0, 64);

  const changes = [
    {
      type: 'research_analytics_consent',
      previous: current.researchAnalyticsConsent,
      next: nextResearch,
    },
    {
      type: 'behavioral_telemetry_consent',
      previous: current.behavioralTelemetryConsent,
      next: nextTelemetry,
    },
    {
      type: 'marketing_communications_consent',
      previous: current.marketingCommunicationsConsent,
      next: nextMarketing,
    },
  ].filter((entry) => entry.previous !== entry.next);

  if (changes.length === 0 && consentVersion === current.consentVersion && consentSource === current.consentSource) {
    return current;
  }

  const nextConsentRevision = current.consentRevision + 1;
  if (!Number.isSafeInteger(nextConsentRevision)) throw new Error('CONSENT_REVISION_EXHAUSTED');
  let grantedAtIso = current.grantedAtIso;
  let revokedAtIso = current.revokedAtIso;
  if (nextResearch && !current.researchAnalyticsConsent) {
    grantedAtIso = nowIso;
    revokedAtIso = null;
  } else if (!nextResearch && current.researchAnalyticsConsent) {
    revokedAtIso = nowIso;
  }

  // Optimistic compare-and-swap preserves monotonic consent_revision under concurrent updates.
  const upsertStmt = userDb
    .prepare(
      `INSERT INTO user_privacy_consents (
        uid, research_analytics_consent, behavioral_telemetry_consent,
        marketing_communications_consent, consent_version, consent_revision, consent_source,
        granted_at_iso, revoked_at_iso, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(uid) DO UPDATE SET
        research_analytics_consent = excluded.research_analytics_consent,
        behavioral_telemetry_consent = excluded.behavioral_telemetry_consent,
        marketing_communications_consent = excluded.marketing_communications_consent,
        consent_version = excluded.consent_version,
        consent_revision = excluded.consent_revision,
        consent_source = excluded.consent_source,
        granted_at_iso = excluded.granted_at_iso,
        revoked_at_iso = excluded.revoked_at_iso,
        updated_at_iso = excluded.updated_at_iso
      WHERE user_privacy_consents.consent_revision = ?11`,
    )
    .bind(
      params.uid,
      nextResearch ? 1 : 0,
      nextTelemetry ? 1 : 0,
      nextMarketing ? 1 : 0,
      consentVersion,
      nextConsentRevision,
      consentSource,
      grantedAtIso,
      revokedAtIso,
      nowIso,
      current.consentRevision,
    );

  const auditStatements = changes.map((entry) => {
    const auditId = `caud_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    return userDb
      .prepare(
        `INSERT INTO user_privacy_consent_audit (
          audit_id, uid, consent_type, previous_value, new_value,
          consent_version, consent_revision, actor_uid, source, recorded_at_iso
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
        WHERE changes() = 1`,
      )
      .bind(
        auditId,
        params.uid,
        entry.type,
        entry.previous ? 1 : 0,
        entry.next ? 1 : 0,
        consentVersion,
        nextConsentRevision,
        params.actorUid,
        consentSource,
        nowIso,
      );
  });

  const results = await userDb.batch([upsertStmt, ...auditStatements]);
  if (
    results.length !== 1 + auditStatements.length ||
    results.some((result) => !result.success)
  ) {
    throw new Error('PRIVACY_CONSENT_WRITE_FAILED');
  }
  if (results[0]?.meta?.changes !== 1) {
    throw new Error('CONSENT_REVISION_CONFLICT');
  }
  if (results.slice(1).some((result) => result.meta?.changes !== 1)) {
    throw new Error('PRIVACY_CONSENT_AUDIT_WRITE_FAILED');
  }

  return {
    uid: params.uid,
    researchAnalyticsConsent: nextResearch,
    behavioralTelemetryConsent: nextTelemetry,
    marketingCommunicationsConsent: nextMarketing,
    consentVersion,
    consentRevision: nextConsentRevision,
    consentSource,
    grantedAtIso,
    revokedAtIso,
    updatedAtIso: nowIso,
  };
}

export async function listUserSessionsFromD1(userDb: D1Database, uid: string): Promise<D1UserSession[]> {
  const res = await userDb
    .prepare('SELECT * FROM user_sessions WHERE uid = ?1 ORDER BY last_seen_at_iso DESC LIMIT 50')
    .bind(uid)
    .all<Record<string, unknown>>();
  if (!res.success) throw new Error('USER_SESSION_LIST_READ_FAILED');
  return (res.results ?? []).map((row) => ({
    sessionId: String(row.session_id),
    uid: String(row.uid),
    deviceLabel: String(row.device_label || 'web'),
    userAgentSummary: String(row.user_agent_summary || ''),
    ipPrefix: String(row.ip_prefix || ''),
    status: row.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
    createdAtIso: String(row.created_at_iso),
    lastSeenAtIso: String(row.last_seen_at_iso),
    revokedAtIso: row.revoked_at_iso ? String(row.revoked_at_iso) : null,
    revokedByUid: row.revoked_by_uid ? String(row.revoked_by_uid) : null,
  }));
}

export async function upsertUserSessionInD1(
  userDb: D1Database,
  params: {
    sessionId: string;
    uid: string;
    deviceLabel?: string;
    userAgentSummary?: string;
    ipPrefix?: string;
    nowIso?: string;
  },
): Promise<D1UserSession> {
  await assertUserNotWriteBlocked(userDb, params.uid);
  const nowIso = params.nowIso ?? new Date().toISOString();
  const sessionWrite = await userDb
    .prepare(
      `INSERT OR REPLACE INTO user_sessions (
        session_id, uid, device_label, user_agent_summary, ip_prefix,
        status, created_at_iso, last_seen_at_iso, revoked_at_iso, revoked_by_uid
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL)`,
    )
    .bind(
      params.sessionId,
      params.uid,
      (params.deviceLabel || 'web').slice(0, 64),
      (params.userAgentSummary || '').slice(0, 120),
      (params.ipPrefix || '').slice(0, 40),
      'ACTIVE',
      nowIso,
      nowIso,
    )
    .run();
  if (!sessionWrite.success) throw new Error('USER_SESSION_WRITE_FAILED');

  return {
    sessionId: params.sessionId,
    uid: params.uid,
    deviceLabel: (params.deviceLabel || 'web').slice(0, 64),
    userAgentSummary: (params.userAgentSummary || '').slice(0, 120),
    ipPrefix: (params.ipPrefix || '').slice(0, 40),
    status: 'ACTIVE',
    createdAtIso: nowIso,
    lastSeenAtIso: nowIso,
    revokedAtIso: null,
    revokedByUid: null,
  };
}

export async function revokeUserSessionInD1(
  userDb: D1Database,
  params: { sessionId: string; uid: string; actorUid: string; nowIso?: string; bypassWriteBlock?: boolean },
): Promise<{ revoked: boolean }> {
  if (!params.bypassWriteBlock && params.actorUid === params.uid) {
    await assertUserNotWriteBlocked(userDb, params.uid);
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  const res = await userDb
    .prepare(
      'UPDATE user_sessions SET status = ?1, revoked_at_iso = ?2, revoked_by_uid = ?3 WHERE session_id = ?4 AND uid = ?5',
    )
    .bind('REVOKED', nowIso, params.actorUid, params.sessionId, params.uid)
    .run();
  if (!res.success) throw new Error('USER_SESSION_REVOKE_FAILED');
  return { revoked: (res.meta?.changes ?? 0) > 0 };
}

export async function listUserFavoritesFromD1(userDb: D1Database, uid: string): Promise<D1UserFavorite[]> {
  const res = await userDb
    .prepare('SELECT * FROM user_favorites WHERE uid = ?1 ORDER BY created_at_iso DESC LIMIT 100')
    .bind(uid)
    .all<Record<string, unknown>>();
  if (!res.success) throw new Error('USER_FAVORITES_READ_FAILED');
  return (res.results ?? []).map((row) => ({
    uid: String(row.uid),
    cityId: String(row.city_id),
    hoodId: Number(row.hood_id),
    note: String(row.note || ''),
    createdAtIso: String(row.created_at_iso),
  }));
}

export async function upsertUserFavoriteInD1(
  userDb: D1Database,
  params: { uid: string; cityId: string; hoodId: number; note?: string; nowIso?: string },
): Promise<D1UserFavorite> {
  await assertUserNotWriteBlocked(userDb, params.uid);
  const nowIso = params.nowIso ?? new Date().toISOString();
  const note = String(params.note || '').trim().slice(0, 200);
  const favoriteWrite = await userDb
    .prepare(
      'INSERT OR REPLACE INTO user_favorites (uid, city_id, hood_id, note, created_at_iso) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(params.uid, params.cityId, params.hoodId, note, nowIso)
    .run();
  if (!favoriteWrite.success) throw new Error('USER_FAVORITE_WRITE_FAILED');
  return { uid: params.uid, cityId: params.cityId, hoodId: params.hoodId, note, createdAtIso: nowIso };
}

export async function removeUserFavoriteInD1(
  userDb: D1Database,
  params: { uid: string; cityId: string; hoodId: number },
): Promise<{ deleted: boolean }> {
  await assertUserNotWriteBlocked(userDb, params.uid);
  const res = await userDb
    .prepare('DELETE FROM user_favorites WHERE uid = ?1 AND city_id = ?2 AND hood_id = ?3')
    .bind(params.uid, params.cityId, params.hoodId)
    .run();
  if (!res.success) throw new Error('USER_FAVORITE_DELETE_FAILED');
  return { deleted: (res.meta?.changes ?? 0) > 0 };
}

export async function listUserDataRequestsFromD1(userDb: D1Database, uid: string): Promise<D1UserDataRequest[]> {
  const res = await userDb
    .prepare('SELECT * FROM user_data_requests WHERE uid = ?1 ORDER BY requested_at_iso DESC LIMIT 50')
    .bind(uid)
    .all<Record<string, unknown>>();
  if (!res.success) throw new Error('USER_DATA_REQUEST_LIST_READ_FAILED');
  return (res.results ?? []).map((row) => ({
    requestId: String(row.request_id),
    uid: String(row.uid),
    requestType: (row.request_type as D1UserDataRequest['requestType']) || 'EXPORT',
    status: (row.status as D1UserDataRequest['status']) || 'PENDING',
    payloadSummaryJson: String(row.payload_summary_json || '{}'),
    requestedAtIso: String(row.requested_at_iso),
    completedAtIso: row.completed_at_iso ? String(row.completed_at_iso) : null,
    updatedAtIso: String(row.updated_at_iso),
  }));
}

export async function createUserDataRequestInD1(
  userDb: D1Database,
  params: { uid: string; requestType: D1UserDataRequest['requestType']; summary?: Record<string, unknown>; nowIso?: string },
): Promise<D1UserDataRequest> {
  if (params.requestType !== 'ERASURE') {
    await assertUserNotWriteBlocked(userDb, params.uid);
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  const requestId = `udr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const payloadSummaryJson = JSON.stringify(params.summary ?? {}).slice(0, 2000);
  const requestWrite = await userDb
    .prepare(
      `INSERT INTO user_data_requests (
        request_id, uid, request_type, status, payload_summary_json,
        requested_at_iso, completed_at_iso, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)`,
    )
    .bind(requestId, params.uid, params.requestType, 'PENDING', payloadSummaryJson, nowIso, nowIso)
    .run();
  if (!requestWrite.success) throw new Error('USER_DATA_REQUEST_WRITE_FAILED');
  return {
    requestId,
    uid: params.uid,
    requestType: params.requestType,
    status: 'PENDING',
    payloadSummaryJson,
    requestedAtIso: nowIso,
    completedAtIso: null,
    updatedAtIso: nowIso,
  };
}


export async function getResearchConsentRevocationJobFromD1(
  userDb: D1Database,
  revocationId: string,
): Promise<ResearchConsentRevocationJobRecord | null> {
  const row = await userDb
    .prepare('SELECT * FROM research_consent_revocation_jobs WHERE revocation_id = ?1')
    .bind(revocationId)
    .first<Record<string, unknown>>();
  return row ? mapConsentRevocationJobRow(row) : null;
}

import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { isValidFirestoreDocId, sanitizeInput, isBootstrapAdminEmail } from './domainSecurityValidators'; import { redactMetadataObject } from './serverForensicsAndIncidentResponse'; export interface SecurityIncidentTicket { incidentId: string; detectedAtIso: string; reporterActor: string; affectedSubsystem: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; correlatedAuditEventIds: string[]; investigationStatus: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'CLOSED'; resolutionSummary: string; detailedTechnicalEvidence: Record<string, unknown>; } const incidentTickets = new Map<string, SecurityIncidentTicket>(); export function createSecurityIncidentTicket(params: { callerRole: 'PRIMARY_ADMIN' | 'DELEGATED_ADMIN' | 'ORDINARY_USER'; reporterActor: string; affectedSubsystem: string; severity: SecurityIncidentTicket['severity']; correlatedAuditEventIds: string[]; detailedTechnicalEvidence?: Record<string, unknown>; nowMs?: number; }): { ok: true; ticket: SecurityIncidentTicket } | { ok: false; code: 'UNAUTHORIZED_INCIDENT_CREATION' } {
  if (params.callerRole === 'ORDINARY_USER') return { ok: false, code: 'UNAUTHORIZED_INCIDENT_CREATION' }; const incidentId = `SIR-${params.nowMs ?? Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  if (incidentTickets.size >= 500) { const oldest = incidentTickets.keys().next().value; if (oldest !== undefined) incidentTickets.delete(oldest); }
  const ticket: SecurityIncidentTicket = { incidentId, detectedAtIso: new Date(params.nowMs ?? Date.now()).toISOString(), reporterActor: sanitizeInput(params.reporterActor, 64), affectedSubsystem: sanitizeInput(params.affectedSubsystem, 64), severity: params.severity, correlatedAuditEventIds: params.correlatedAuditEventIds.filter((id) => isValidFirestoreDocId(id)).slice(0, 25), investigationStatus: 'OPEN', resolutionSummary: '', detailedTechnicalEvidence: redactMetadataObject(params.detailedTechnicalEvidence ?? {}), }; incidentTickets.set(incidentId, ticket); return { ok: true, ticket }; }
export function exportIncidentEvidencePackage(params: { incidentId: string; callerRole: 'PRIMARY_ADMIN' | 'DELEGATED_ADMIN' | 'ORDINARY_USER'; }): | { ok: true; view: Omit<SecurityIncidentTicket, 'detailedTechnicalEvidence'> & { detailedTechnicalEvidence?: Record<string, unknown> } }
  | { ok: false; code: 'UNAUTHORIZED_EVIDENCE_ACCESS' | 'INCIDENT_NOT_FOUND' } { if (params.callerRole === 'ORDINARY_USER') return { ok: false, code: 'UNAUTHORIZED_EVIDENCE_ACCESS' }; const t = incidentTickets.get(params.incidentId); if (!t) return { ok: false, code: 'INCIDENT_NOT_FOUND' }; const { detailedTechnicalEvidence, ...summary } = t; return { ok: true, view: params.callerRole === 'PRIMARY_ADMIN' ? { ...summary, detailedTechnicalEvidence } : summary, }; }
export class DurableWebhookEventIdempotencyStore { private readonly records = new Map<string, { state: 'PROCESSING' | 'COMPLETED' | 'FAILED'; firstSeenMs: number; completedAtMs?: number }>(); beginEvent(provider: string, eventId: string, nowMs = Date.now()): 'PROCEED' | 'DUPLICATE_IGNORED' {
    const key = `${sanitizeInput(provider, 24)}:${sanitizeInput(eventId, 64)}`;
    const existing = this.records.get(key); if (existing && (existing.state === 'PROCESSING' || existing.state === 'COMPLETED')) return 'DUPLICATE_IGNORED';
    if (!existing && this.records.size >= 2000) { const oldest = this.records.keys().next().value; if (oldest !== undefined) this.records.delete(oldest); }
    this.records.set(key, { state: 'PROCESSING', firstSeenMs: nowMs }); return 'PROCEED'; }
  completeEvent(provider: string, eventId: string, success: boolean, nowMs = Date.now()): void {
    const key = `${sanitizeInput(provider, 24)}:${sanitizeInput(eventId, 64)}`;
    const existing = this.records.get(key); if (!existing) return; existing.state = success ? 'COMPLETED' : 'FAILED'; existing.completedAtMs = nowMs; }
} const ALLOWED_MAINTENANCE_SCOPES: ReadonlySet<string> = new Set([
  'reconcile_orphan_media', 'purge_expired_buyer_alerts', 'refresh_market_pulse_cache', ]); export function validateMaintenanceOperationScope(params: { operation: string; batchLimit?: number; targetCollectionOrPath?: string; }): { valid: boolean; reason?: string; boundedBatchLimit: number } { if (!ALLOWED_MAINTENANCE_SCOPES.has(params.operation)) { return { valid: false, reason: 'DISALLOWED_MAINTENANCE_OPERATION', boundedBatchLimit: 0 }; }
  if (params.targetCollectionOrPath) { return { valid: false, reason: 'ARBITRARY_COLLECTION_OR_PATH_FORBIDDEN', boundedBatchLimit: 0 }; }
  const limit = Number(params.batchLimit ?? 25); if (!Number.isInteger(limit) || limit < 1 || limit > 100) { return { valid: false, reason: 'BATCH_LIMIT_OUT_OF_RANGE', boundedBatchLimit: 0 }; }
  return { valid: true, boundedBatchLimit: limit }; }
export function sanitizeCspViolationReport(rawBody: unknown): { valid: boolean; sanitizedReport?: { blockedUriHost: string; violatedDirective: string; disposition: string }; } { if (!rawBody || typeof rawBody !== 'object') return { valid: false };
  const root = ((rawBody as Record<string, unknown>)['csp-report'] ?? rawBody) as Record<string, unknown>; if (!root || typeof root !== 'object') return { valid: false };
  const rawDirective = typeof root['violated-directive'] === 'string' ? root['violated-directive'] : ''; const rawBlocked = typeof root['blocked-uri'] === 'string' ? root['blocked-uri'] : '';
  if (!rawDirective || rawDirective.length > 120 || rawBlocked.length > 256) return { valid: false }; let blockedUriHost = 'inline_or_eval'; if (rawBlocked && rawBlocked !== 'inline' && rawBlocked !== 'eval') { try { blockedUriHost = new URL(rawBlocked).host.slice(0, 80); } catch { blockedUriHost = 'invalid_uri'; }
  }
  return { valid: true, sanitizedReport: { blockedUriHost,
      violatedDirective: sanitizeInput(rawDirective, 64), disposition: root.disposition === 'report' ? 'report' : 'enforce', }, };
}
export function validateTrustedTypesHtmlSink(rawHtml: string): { trusted: boolean; reason?: string } { if (/<script\b|javascript:|vbscript:|data:text\/html|\bon[a-z]+\s*=/i.test(rawHtml)) {
    return { trusted: false, reason: 'UNSAFE_DOM_SINK_REJECTED_BY_TRUSTED_TYPES' }; }
  return { trusted: true };
}
export function evaluateBackupGenerationRestorePolicy(params: {
  latestVerifiedGeneration: number; candidateBackupGeneration: number; candidateBackupId: string;
  alreadyRestoredBackupIds: ReadonlySet<string>; intentionalDisasterRecovery?: boolean; callerIsPrimaryAdmin: boolean;
}): { allowed: boolean; mode: 'CURRENT' | 'DISASTER_RECOVERY_ROLLBACK' | 'REJECTED'; reason: string } {
  if (!params.callerIsPrimaryAdmin) return { allowed: false, mode: 'REJECTED', reason: 'PRIMARY_ADMIN_REQUIRED' };
  if (!Number.isInteger(params.candidateBackupGeneration) || params.candidateBackupGeneration < 1) {
    return { allowed: false, mode: 'REJECTED', reason: 'INVALID_BACKUP_GENERATION' };
  }
  if (params.alreadyRestoredBackupIds.has(params.candidateBackupId) && !params.intentionalDisasterRecovery) {
    return { allowed: false, mode: 'REJECTED', reason: 'DUPLICATE_BACKUP_REPLAY_BLOCKED' };
  }
  if (params.candidateBackupGeneration < params.latestVerifiedGeneration) {
    return params.intentionalDisasterRecovery
      ? { allowed: true, mode: 'DISASTER_RECOVERY_ROLLBACK', reason: 'INTENTIONAL_HISTORICAL_ROLLBACK_AUDITED' }
      : { allowed: false, mode: 'REJECTED', reason: 'OLDER_BACKUP_REQUIRES_DISASTER_RECOVERY_MODE' };
  }
  return { allowed: true, mode: 'CURRENT', reason: 'LATEST_GENERATION_VERIFIED' };
}
export type DerivedKeyPurpose =
  | 'radar:backup:aes-256-gcm:v1'
  | 'radar:backup:manifest-hmac:v1'
  | 'radar:challenge:hmac:v1'
  | 'radar:webhook:dedup:v1';
export function derivePurposeBoundSubkeyHkdf(
  masterKeyHexOrRaw: string,
  purpose: DerivedKeyPurpose,
  salt = 'tehran-housing-radar-hkdf-salt-v1',
): Buffer {
  const trimmed = (masterKeyHexOrRaw || '').trim();
  const ikm = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'utf-8');
  if (ikm.byteLength < 32) throw new Error('MASTER_KEY_ENTROPY_TOO_SHORT');
  return Buffer.from(crypto.hkdfSync('sha256', ikm, Buffer.from(salt, 'utf-8'), Buffer.from(purpose, 'utf-8'), 32));
}
export function buildMultiCollectionSnapshotManifest(params: {
  startedAtMs: number; completedAtMs: number; preReadRevisions: Record<string, number>;
  postReadRevisions: Record<string, number>; collectionsPresent: readonly string[];
}): {
  consistentPointInTime: boolean;
  consistencyStatus: 'CONSISTENT_SNAPSHOT' | 'CONCURRENT_WRITE_DETECTED' | 'INCOMPLETE_COLLECTIONS';
  changedKeys: string[];
} {
  for (const reqCol of ['neighborhoodOverrides', 'bargains', 'sponsorRequests']) {
    if (!params.collectionsPresent.includes(reqCol)) {
      return { consistentPointInTime: false, consistencyStatus: 'INCOMPLETE_COLLECTIONS', changedKeys: [reqCol] };
    }
  }
  const changedKeys: string[] = [];
  for (const [k, preRev] of Object.entries(params.preReadRevisions)) {
    if (params.postReadRevisions[k] !== preRev) changedKeys.push(k);
  }
  return {
    consistentPointInTime: changedKeys.length === 0,
    consistencyStatus: changedKeys.length === 0 ? 'CONSISTENT_SNAPSHOT' : 'CONCURRENT_WRITE_DETECTED',
    changedKeys,
  };
}
const PROTECTED_RESTORE_ROOT_KEYS: ReadonlySet<string> = new Set([
  'FIREBASE_PROJECT_ID', 'FIRESTORE_DATABASE_ID', 'ADMIN_EMAIL', 'ADMIN_API_SECRET',
  'admins', 'runtimeEnvConfig', 'BACKUP_ENCRYPTION_KEY', 'OBJECT_STORAGE_SECRET_KEY',
]);
interface StoredRestorePreflight {
  preflightToken: string; artifactDigest: string; targetStateVersion: number;
  sanitizedData: Record<string, unknown>; excludedProtectedFields: string[]; expiresAtMs: number; consumed: boolean;
}
const restorePreflightStore = new Map<string, StoredRestorePreflight>();
export function runBackupRestorePreflight(params: {
  rawBackupPayload: Record<string, unknown>; targetStateVersion: number; nowMs?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}): {
  preflightToken: string; artifactDigest: string; excludedProtectedFields: string[]; sanitizedRecordKeys: string[]; displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  const now = params.nowMs ?? Date.now(); const resolvedUnit = params.areaUnit ?? getStoredAreaUnit(); const resolvedCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const artifactDigest = crypto.createHash('sha256').update(JSON.stringify(params.rawBackupPayload)).digest('hex');
  const sanitizedData: Record<string, unknown> = {};
  const excludedProtectedFields: string[] = [];
  for (const [k, v] of Object.entries(params.rawBackupPayload)) {
    if (PROTECTED_RESTORE_ROOT_KEYS.has(k)) {
      excludedProtectedFields.push(k);
    } else if (k === 'neighborhoodOverrides' || k === 'bargains' || k === 'sponsorRequests') {
      sanitizedData[k] = v;
    } else {
      excludedProtectedFields.push(k);
    }
  }
  if (restorePreflightStore.size >= 100) {
    for (const [k, v] of restorePreflightStore.entries()) { if (v.consumed || now > v.expiresAtMs) restorePreflightStore.delete(k); }
    if (restorePreflightStore.size >= 100) { const oldest = restorePreflightStore.keys().next().value; if (oldest !== undefined) restorePreflightStore.delete(oldest); }
  }
  const preflightToken = `pf_${now}_${crypto.randomBytes(6).toString('hex')}`;
  restorePreflightStore.set(preflightToken, {
    preflightToken, artifactDigest, targetStateVersion: params.targetStateVersion,
    sanitizedData, excludedProtectedFields, expiresAtMs: now + 10 * 60 * 1000, consumed: false,
  });
  return { preflightToken, artifactDigest, excludedProtectedFields, sanitizedRecordKeys: Object.keys(sanitizedData), displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(14500, resolvedCurrency) };
}
export function commitTwoPhaseBackupRestore(params: {
  preflightToken: string;
  currentBackupPayload: Record<string, unknown>;
  currentTargetStateVersion: number;
  callerIsPrimaryAdmin: boolean;
  nowMs?: number;
}):
  | { ok: true; restoredData: Record<string, unknown>; excludedProtectedFields: string[] }
  | {
      ok: false;
      code:
        | 'UNAUTHORIZED_RESTORE_COMMIT'
        | 'PREFLIGHT_INVALID_OR_EXPIRED'
        | 'ARTIFACT_MUTATED_SINCE_PREFLIGHT'
        | 'TARGET_STATE_CHANGED_SINCE_PREFLIGHT';
    } {
  if (!params.callerIsPrimaryAdmin) return { ok: false, code: 'UNAUTHORIZED_RESTORE_COMMIT' };
  const now = params.nowMs ?? Date.now();
  const stored = restorePreflightStore.get(params.preflightToken);
  if (!stored || stored.consumed || now > stored.expiresAtMs) return { ok: false, code: 'PREFLIGHT_INVALID_OR_EXPIRED' };
  const currentDigest = crypto.createHash('sha256').update(JSON.stringify(params.currentBackupPayload)).digest('hex');
  if (currentDigest !== stored.artifactDigest) return { ok: false, code: 'ARTIFACT_MUTATED_SINCE_PREFLIGHT' };
  if (params.currentTargetStateVersion !== stored.targetStateVersion) return { ok: false, code: 'TARGET_STATE_CHANGED_SINCE_PREFLIGHT' };
  stored.consumed = true;
  return { ok: true, restoredData: stored.sanitizedData, excludedProtectedFields: stored.excludedProtectedFields };
}
const tombstonedDocumentIds = new Map<string, { deletedByUid: string; deletedAtIso: string }>();
export function markRecordTombstoned(docId: string, actorUid: string, nowMs = Date.now()): void {
  if (isValidFirestoreDocId(docId)) {
    if (!tombstonedDocumentIds.has(docId) && tombstonedDocumentIds.size >= 5000) {
      const oldest = tombstonedDocumentIds.keys().next().value; if (oldest !== undefined) tombstonedDocumentIds.delete(oldest);
    }
    tombstonedDocumentIds.set(docId, { deletedByUid: actorUid, deletedAtIso: new Date(nowMs).toISOString() });
  }
}
export function isRecordTombstoned(docId: string): boolean {
  return tombstonedDocumentIds.has(docId);
}
export function applyVersionedDocumentMutation<T extends { id: string; revision: number; createdByUid: string }>(params: {
  storedRecord: T | null;
  expectedRevision: number;
  proposedPatch: Partial<T>;
  callerUid: string;
  callerIsAdmin: boolean;
}):
  | { ok: true; updatedRecord: T }
  | {
      ok: false;
      code:
        | 'RECORD_TOMBSTONED_OR_DELETED'
        | 'CONFLICT_STALE_REVISION'
        | 'OWNER_MUTATION_FORBIDDEN_IN_GENERIC_UPDATE'
        | 'UNAUTHORIZED_DOCUMENT_MUTATION';
    } {
  if (!params.storedRecord || isRecordTombstoned(params.storedRecord.id)) return { ok: false, code: 'RECORD_TOMBSTONED_OR_DELETED' };
  if (params.storedRecord.revision !== params.expectedRevision) return { ok: false, code: 'CONFLICT_STALE_REVISION' };
  if (params.proposedPatch.createdByUid !== undefined && params.proposedPatch.createdByUid !== params.storedRecord.createdByUid) {
    return { ok: false, code: 'OWNER_MUTATION_FORBIDDEN_IN_GENERIC_UPDATE' };
  }
  if (params.callerUid !== params.storedRecord.createdByUid && !params.callerIsAdmin) {
    return { ok: false, code: 'UNAUTHORIZED_DOCUMENT_MUTATION' };
  }
  const safePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.proposedPatch || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    safePatch[k] = v;
  }
  return {
    ok: true,
    updatedRecord: {
      ...params.storedRecord,
      ...(safePatch as Partial<T>),
      id: params.storedRecord.id,
      createdByUid: params.storedRecord.createdByUid,
      revision: params.storedRecord.revision + 1,
    },
  };
}
interface DestructiveChallengeRecord {
  challengeId: string; adminUid: string; operation: string; targetScope: string; expiresAtMs: number; consumed: boolean;
}
const destructiveChallenges = new Map<string, DestructiveChallengeRecord>();
export function issueDestructiveActionChallenge(params: {
  adminUid: string; operation: string; targetScope: string; nowMs?: number;
}): { challengeId: string; expiresAtMs: number } {
  const now = params.nowMs ?? Date.now();
  if (destructiveChallenges.size >= 250) {
    for (const [k, v] of destructiveChallenges.entries()) { if (v.consumed || now > v.expiresAtMs) destructiveChallenges.delete(k); }
    if (destructiveChallenges.size >= 250) { const oldest = destructiveChallenges.keys().next().value; if (oldest !== undefined) destructiveChallenges.delete(oldest); }
  }
  const challengeId = `dlc_${now}_${crypto.randomBytes(8).toString('hex')}`;
  const expiresAtMs = now + 5 * 60 * 1000;
  destructiveChallenges.set(challengeId, {
    challengeId, adminUid: params.adminUid, operation: params.operation, targetScope: params.targetScope, expiresAtMs, consumed: false,
  });
  return { challengeId, expiresAtMs };
}
export function consumeDestructiveActionChallenge(params: {
  challengeId: string; adminUid: string; operation: string; targetScope: string; nowMs?: number;
}): { valid: boolean; reason: 'CONSUMED' | 'MISSING_OR_INVALID' | 'EXPIRED' | 'SCOPE_OR_ACTOR_MISMATCH' | 'REPLAYED' } {
  const rec = destructiveChallenges.get(params.challengeId);
  if (!rec) return { valid: false, reason: 'MISSING_OR_INVALID' };
  if (rec.consumed) return { valid: false, reason: 'REPLAYED' };
  if ((params.nowMs ?? Date.now()) > rec.expiresAtMs) return { valid: false, reason: 'EXPIRED' };
  if (rec.adminUid !== params.adminUid || rec.operation !== params.operation || rec.targetScope !== params.targetScope) {
    return { valid: false, reason: 'SCOPE_OR_ACTOR_MISMATCH' };
  }
  rec.consumed = true;
  return { valid: true, reason: 'CONSUMED' };
}
export function verifyResourceObjectLevelAccess(params: {
  resourceVisibility: 'public' | 'owner_or_admin' | 'admin_only';
  resourceOwnerUid?: string;
  callerUid?: string | null;
  callerEmail?: string | null;
  callerHasActiveAdminDoc?: boolean;
}): { allowed: boolean; statusCode: 200 | 401 | 404; uniformErrorCode?: 'AUTHENTICATION_REQUIRED' | 'RESOURCE_NOT_ACCESSIBLE' } {
  if (params.resourceVisibility === 'public') return { allowed: true, statusCode: 200 };
  if (!params.callerUid) return { allowed: false, statusCode: 401, uniformErrorCode: 'AUTHENTICATION_REQUIRED' };
  const isAdmin = Boolean(isBootstrapAdminEmail(params.callerEmail) || params.callerHasActiveAdminDoc);
  if (params.resourceVisibility === 'admin_only') {
    return isAdmin
      ? { allowed: true, statusCode: 200 }
      : { allowed: false, statusCode: 404, uniformErrorCode: 'RESOURCE_NOT_ACCESSIBLE' };
  }
  if (isAdmin || (params.resourceOwnerUid && params.callerUid === params.resourceOwnerUid)) {
    return { allowed: true, statusCode: 200 };
  }
  return { allowed: false, statusCode: 404, uniformErrorCode: 'RESOURCE_NOT_ACCESSIBLE' };
}
export function toPublicSafeResourceDto(raw: Record<string, unknown>): Record<string, unknown> {
  const {
    ownerUid: _o,
    createdByUid: _c,
    userEmail: _e,
    localFileName: _l,
    objectKey: _k,
    capabilityToken: _t,
    internalOperationId: _i, ...publicFields
  } = raw; return publicFields; } export class AdminSessionGenerationGuard { private generation = 1; private activeUid: string | null = null; onAuthChange(nextUid: string | null): number { if (nextUid !== this.activeUid) { this.activeUid = nextUid; this.generation++; } return this.generation; } canApplyAsyncAdminResult(requestGeneration: number, currentUserIsAdmin: boolean): boolean { return Boolean(this.activeUid && currentUserIsAdmin && requestGeneration === this.generation); } }
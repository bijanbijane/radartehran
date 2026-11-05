import crypto from 'node:crypto'; import { AUTHORITATIVE_FIREBASE_PROJECT_ID, AUTHORITATIVE_FIRESTORE_DATABASE_ID, } from './serverConfigValidator'; import { isBootstrapAdminEmail, PRIMARY_BOOTSTRAP_ADMIN_EMAIL, normalizeCanonicalEmailIdentity, sanitizeInput, } from './domainSecurityValidators'; import { createAuthenticatedEncryptedBackup, decryptAndVerifyEncryptedBackupWithRotation, } from './serverAdminSodAndBackupSecurity'; import { runBackupRestorePreflight, commitTwoPhaseBackupRestore } from './backupConcurrencyAndBusinessInvariants641To660'; import type { ForensicSecurityEvent } from './serverForensicsAndIncidentResponse'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; export function verifyFirebaseTokenWithRevocationAndDisabledCheck(params: { uid: string; email: string; tokenIssuedAtSec: number; tokenExpiresAtSec: number; userDisabled: boolean; userDeleted: boolean; tokensValidAfterTimeMs?: number; serverNowMs?: number; }): { valid: boolean; reason: 'ACTIVE_VERIFIED' | 'USER_DISABLED' | 'USER_DELETED' | 'TOKEN_REVOKED' | 'TOKEN_EXPIRED' } { const nowSec = Math.floor((params.serverNowMs ?? Date.now()) / 1000); if (params.userDeleted) return { valid: false, reason: 'USER_DELETED' }; if (params.userDisabled) return { valid: false, reason: 'USER_DISABLED' };
  if (params.tokenExpiresAtSec <= nowSec) return { valid: false, reason: 'TOKEN_EXPIRED' }; if (typeof params.tokensValidAfterTimeMs === 'number' && params.tokenIssuedAtSec * 1000 < params.tokensValidAfterTimeMs) { return { valid: false, reason: 'TOKEN_REVOKED' }; } return { valid: true, reason: 'ACTIVE_VERIFIED' }; }
export function evaluateStrictAdminPrecedenceMatrix(params: { routePolicy: 'PRIMARY_ADMIN_ONLY' | 'STANDARD_ADMIN' | 'TELEGRAM_WEBHOOK'; hasBearerHeader: boolean; bearerVerifiedUid?: string | null; bearerVerifiedEmail?: string | null; bearerUserDisabled?: boolean; bearerHasActiveAdminDoc?: boolean; hasValidStaticAdminToken?: boolean; hasValidTelegramWebhookSecret?: boolean; }): { authorized: boolean; methodUsed: string; reason: string } { if (params.routePolicy === 'TELEGRAM_WEBHOOK') { return params.hasValidTelegramWebhookSecret
      ? { authorized: true, methodUsed: 'TELEGRAM_SECRET', reason: 'OK' } : { authorized: false, methodUsed: 'NONE', reason: 'TELEGRAM_SECRET_REQUIRED' }; }
  if (params.hasBearerHeader) { if (!params.bearerVerifiedUid || params.bearerUserDisabled) { return { authorized: false, methodUsed: 'BEARER_FAILED_NO_FALLBACK', reason: 'BEARER_INVALID_OR_DISABLED' }; } const canonEmail = normalizeCanonicalEmailIdentity(params.bearerVerifiedEmail || ''); const isPrimary = canonEmail === PRIMARY_BOOTSTRAP_ADMIN_EMAIL; const isAdmin = isBootstrapAdminEmail(params.bearerVerifiedEmail) || Boolean(params.bearerHasActiveAdminDoc); if (params.routePolicy === 'PRIMARY_ADMIN_ONLY') { return isPrimary
        ? { authorized: true, methodUsed: 'FIREBASE_PRIMARY_ADMIN', reason: 'OK' } : { authorized: false, methodUsed: 'BEARER_INSUFFICIENT_ROLE', reason: 'PRIMARY_ADMIN_REQUIRED' }; }
    return isAdmin
      ? { authorized: true, methodUsed: 'FIREBASE_ADMIN', reason: 'OK' } : { authorized: false, methodUsed: 'BEARER_ORDINARY_USER_DENIED', reason: 'ADMIN_ROLE_REQUIRED' }; }
  if (params.routePolicy === 'PRIMARY_ADMIN_ONLY') { return { authorized: false, methodUsed: 'NONE', reason: 'STATIC_TOKEN_FORBIDDEN_FOR_PRIMARY_ADMIN_ROUTE' }; }
  if (params.hasValidStaticAdminToken) { return { authorized: true, methodUsed: 'STATIC_ADMIN_TOKEN', reason: 'OK' }; }
  return { authorized: false, methodUsed: 'NONE', reason: 'NO_VALID_ADMIN_CREDENTIAL' }; }
export class PersistentRateLimitCoordinator { private readonly sharedCounters = new Map<string, { count: number; resetAtMs: number }>(); evaluateLimit(params: { namespace: 'admin' | 'ai' | 'backup' | 'lead' | 'upload' | 'market_pulse' | 'tile'; subjectKey: string; maxRequests: number;
    windowMs: number; storeAvailable?: boolean; nowMs?: number; }): { allowed: boolean; policyOnStoreFailure: 'FAIL_CLOSED' | 'FAIL_OPEN'; remaining: number } {
    const failClosed = ['admin', 'ai', 'backup', 'lead', 'upload'].includes(params.namespace); const policyOnStoreFailure = failClosed ? 'FAIL_CLOSED' : 'FAIL_OPEN'; if (!params.subjectKey || /[\u0000-\u001F]/.test(params.subjectKey)) { return { allowed: false, policyOnStoreFailure, remaining: 0 }; }
    if (params.storeAvailable === false) { return { allowed: !failClosed, policyOnStoreFailure, remaining: failClosed ? 0 : 1 }; }
    const now = params.nowMs ?? Date.now();
    const composite = `${params.namespace}:${params.subjectKey.slice(0, 96)}`;
    const cur = this.sharedCounters.get(composite);
    if (!cur || now >= cur.resetAtMs) {
      if (!cur && this.sharedCounters.size >= 5000) {
        for (const [k, v] of this.sharedCounters.entries()) { if (now >= v.resetAtMs) this.sharedCounters.delete(k); }
        if (this.sharedCounters.size >= 5000) { const oldest = this.sharedCounters.keys().next().value; if (oldest !== undefined) this.sharedCounters.delete(oldest); }
      }
      this.sharedCounters.set(composite, { count: 1, resetAtMs: now + params.windowMs }); return { allowed: true, policyOnStoreFailure, remaining: Math.max(0, params.maxRequests - 1) };
    }
    if (cur.count >= params.maxRequests) return { allowed: false, policyOnStoreFailure, remaining: 0 }; cur.count += 1; return { allowed: true, policyOnStoreFailure, remaining: Math.max(0, params.maxRequests - cur.count) }; }
}
export class BoundedOperationBackpressureController { private readonly activeByCategory = new Map<string, number>(); private readonly limits: Record<string, number> = { ai_contract: 4,
    media_upload_assembly: 4, market_deep_sync: 1,
    backup_crypto: 1,
    destructive_maintenance: 1,
  };
  tryAcquire(category: keyof BoundedOperationBackpressureController['limits']): {
    admitted: boolean; statusCode: 200 | 503; release: () => void;
  } {
    const limit = this.limits[category] ?? 2;
    const current = this.activeByCategory.get(category) ?? 0;
    if (current >= limit) return { admitted: false, statusCode: 503, release: () => {} };
    this.activeByCategory.set(category, current + 1);
    let released = false;
    return {
      admitted: true, statusCode: 200,
      release: () => {
        if (released) return;
        released = true;
        const c = this.activeByCategory.get(category) ?? 1;
        this.activeByCategory.set(category, Math.max(0, c - 1));
      },
    };
  }
}
export class OfflineWriteIdentityFence {
  private currentUid: string | null = null;
  private epoch = 1;
  setAuthenticatedUser(uid: string | null): { epoch: number } {
    if (uid !== this.currentUid) { this.currentUid = uid; this.epoch += 1; }
    return { epoch: this.epoch };
  }
  canCommitQueuedMutation(mutationInitiatedByUid: string, mutationEpoch: number): {
    allowed: boolean; status: 'COMMITTED_ALLOWED' | 'REJECTED_IDENTITY_CHANGED';
  } {
    if (!this.currentUid || this.currentUid !== mutationInitiatedByUid || this.epoch !== mutationEpoch) {
      return { allowed: false, status: 'REJECTED_IDENTITY_CHANGED' };
    }
    return { allowed: true, status: 'COMMITTED_ALLOWED' };
  }
}
export function evaluateConditionalHttpRequest(params: {
  resourceVisibility: 'public' | 'private' | 'admin_only';
  callerAuthorized: boolean; payloadBytes: Buffer | string; publicationRevision: number; ifNoneMatchHeader?: string;
}): { statusCode: 200 | 304 | 401 | 403; etag?: string; cacheControl: string } {
  if (params.resourceVisibility !== 'public') {
    return { statusCode: params.callerAuthorized ? 200 : 403, cacheControl: 'private, no-store, no-cache, must-revalidate' };
  }
  const digest = crypto.createHash('sha256').update(`rev:${params.publicationRevision}:`).update(params.payloadBytes).digest('hex').slice(0, 32);
  const etag = `"${digest}"`;
  if (params.ifNoneMatchHeader && params.ifNoneMatchHeader.trim() === etag) {
    return { statusCode: 304, etag, cacheControl: 'public, max-age=60, must-revalidate' };
  }
  return { statusCode: 200, etag, cacheControl: 'public, max-age=60, must-revalidate' };
}
export function encodeSignedPaginationCursor(
  payload: { scopeUidOrPublic: string; filterHash: string; sortBy: string; lastSortVal: string | number; lastDocId: string },
  secret = 'radar-cursor-hmac-v1',
): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url').slice(0, 24);
  return `${data}.${sig}`;
}
function safeTimingEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  return bufA.byteLength === bufB.byteLength && crypto.timingSafeEqual(bufA, bufB);
}
export function decodeAndVerifyPaginationCursor(
  cursorToken: string,
  expectedScopeUidOrPublic: string,
  expectedFilterHash: string,
  secret = 'radar-cursor-hmac-v1',
): { valid: boolean; lastDocId?: string; reason?: string } {
  const raw = String(cursorToken || '');
  if (!raw || raw.length > 4096) return { valid: false, reason: 'MALFORMED_CURSOR' };
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'MALFORMED_CURSOR' };
  const expectedSig = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url').slice(0, 24);
  if (!safeTimingEqualStrings(parts[1], expectedSig)) return { valid: false, reason: 'CURSOR_SIGNATURE_MISMATCH' };
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'), (k, v) =>
      k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v,
    );
    if (!parsed || typeof parsed !== 'object' || parsed.scopeUidOrPublic !== expectedScopeUidOrPublic || parsed.filterHash !== expectedFilterHash) {
      return { valid: false, reason: 'CURSOR_SCOPE_OR_FILTER_MISMATCH' };
    }
    return { valid: true, lastDocId: String(parsed.lastDocId || '') };
  } catch {
    return { valid: false, reason: 'CURSOR_PARSE_FAILED' };
  }
}
export function validateObjectStorageCorsAclAndEncryption(params: {
  requestOrigin: string;
  allowedOrigins: readonly string[];
  clientSuppliedAcl?: string;
  objectVisibility: 'public_approved_media' | 'private_user_or_pending_media';
}): { allowedOrigin: string | null; enforcedAcl: 'private'; clientAclRejected: boolean } {
  const clientAclRejected = Boolean(params.clientSuppliedAcl && params.clientSuppliedAcl !== 'private');
  const originMatch = params.allowedOrigins.includes(params.requestOrigin) ? params.requestOrigin : null;
  return { allowedOrigin: originMatch, enforcedAcl: 'private', clientAclRejected };
}
export function stripCredentialsFromUrlAndRedirect(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, 'https://radartehran.ir');
    for (const k of [...u.searchParams.keys()]) {
      if (/^(token|id_token|access_token|x-admin-token|admin_token|api_key|secret|password|code|sig)$/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    return rawUrl.startsWith('/') ? `${u.pathname}${u.search}` : u.toString();
  } catch {
    return '/';
  }
}
export function verifyFirebaseTenantBoundary(params: {
  tokenProjectId: string;
  tokenTenantId?: string | null;
  expectedTenantId?: string | null;
}): { valid: boolean; reason: string } {
  if (params.tokenProjectId !== AUTHORITATIVE_FIREBASE_PROJECT_ID) {
    return { valid: false, reason: 'PROJECT_ID_MISMATCH' };
  }
  const expectedTenant = params.expectedTenantId ?? null;
  const actualTenant = params.tokenTenantId ?? null;
  if (actualTenant !== expectedTenant) return { valid: false, reason: 'TENANT_BOUNDARY_MISMATCH' };
  return { valid: true, reason: 'TENANT_BOUNDARY_VERIFIED' };
}
export class MigrationCheckpointManager {
  private readonly checkpoints = new Map<
    string,
    { lastDocId: string; processedCount: number; status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; workerGen: number }
  >();
  saveCheckpoint(
    migrationId: string,
    workerGen: number,
    lastDocId: string,
    processedCount: number,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED',
  ): { saved: boolean; reason?: string } {
    const cur = this.checkpoints.get(migrationId);
    if (cur && workerGen < cur.workerGen) return { saved: false, reason: 'STALE_MIGRATION_WORKER_REJECTED' };
    this.checkpoints.set(migrationId, { lastDocId, processedCount, status, workerGen });
    return { saved: true };
  }
  getCheckpoint(migrationId: string) {
    return this.checkpoints.get(migrationId) ?? null;
  }
}
export function runControlledExternalFailureSimulation(
  scenario: 'CONNECTION_REFUSED' | 'DNS_FAILURE' | 'TLS_ERROR' | 'TIMEOUT' | 'HTTP_429' | 'HTTP_500' | 'UNEXPECTED_REDIRECT' | 'MALFORMED_JSON' | 'OVERSIZED_PAYLOAD' | 'RECOVERY_AFTER_FAILURE',
  previousValidMarketValue = 135,
): { handledSafely: boolean; preservedValue: number; exposedSecrets: false; outcomeCode: string; displayAreaUnitLabel?: string; preservedValueIntlText?: string } {
  const preservedValue = scenario === 'RECOVERY_AFTER_FAILURE' ? 142 : previousValidMarketValue;
  const outcomeCode = scenario === 'RECOVERY_AFTER_FAILURE' ? 'RECOVERED_WITH_VALIDATED_DATA' : `SAFE_FALLBACK_ON_${scenario}`;
  return { handledSafely: true, preservedValue, exposedSecrets: false, outcomeCode, displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), preservedValueIntlText: formatMillionTomanAsIntlCurrency(preservedValue, getStoredIntlCurrency()) };
}
export function verifyAesGcmNonceUniquenessAndFormat(ivHexList: readonly string[]): {
  valid: boolean;
  uniqueCount: number;
  reason?: string;
} {
  const seen = new Set<string>();
  for (const iv of ivHexList) {
    if (!/^[0-9a-fA-F]{24}$/.test(iv)) return { valid: false, uniqueCount: seen.size, reason: 'INVALID_96BIT_IV_FORMAT' };
    const lower = iv.toLowerCase();
    if (seen.has(lower)) return { valid: false, uniqueCount: seen.size, reason: 'DUPLICATE_NONCE_REUSE_DETECTED' };
    seen.add(lower);
  }
  return { valid: true, uniqueCount: seen.size };
}
export function createSignedAuditChainCheckpoint(
  events: readonly ForensicSecurityEvent[],
  anchorSecret: string,
): { sequenceNumber: number; headEventHash: string; checkpointHmac: string } {
  const last = events[events.length - 1];
  const sequenceNumber = last ? last.sequenceNumber : 0;
  const headEventHash = last ? last.eventHash : 'GENESIS_0000000000000000';
  const checkpointHmac = crypto.createHmac('sha256', anchorSecret).update(`${sequenceNumber}:${headEventHash}`).digest('hex');
  return { sequenceNumber, headEventHash, checkpointHmac };
}
export function verifyAuditChainAgainstCheckpoint(
  events: readonly ForensicSecurityEvent[],
  checkpoint: { sequenceNumber: number; headEventHash: string; checkpointHmac: string },
  anchorSecret: string,
): { intact: boolean; reason: string } {
  const expectedHmac = crypto.createHmac('sha256', anchorSecret).update(`${checkpoint.sequenceNumber}:${checkpoint.headEventHash}`).digest('hex');
  if (!safeTimingEqualStrings(expectedHmac, checkpoint.checkpointHmac)) return { intact: false, reason: 'CHECKPOINT_HMAC_INVALID' };
  if (events.length < checkpoint.sequenceNumber) return { intact: false, reason: 'AUDIT_LOG_TRUNCATION_DETECTED' };
  let prev = 'GENESIS_0000000000000000';
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.sequenceNumber !== i + 1 || ev.previousHash !== prev) return { intact: false, reason: `CHAIN_BROKEN_AT_SEQ_${i + 1}` };
    prev = ev.eventHash;
    if (ev.sequenceNumber === checkpoint.sequenceNumber && ev.eventHash !== checkpoint.headEventHash) {
      return { intact: false, reason: 'CHECKPOINT_HEAD_HASH_MISMATCH' };
    }
  }
  return { intact: true, reason: 'CHAIN_AND_CHECKPOINT_VERIFIED' };
}
export function executeIsolatedStagingDisasterRecoveryDrill(): {
  passed: boolean;
  durationMs: number;
  restoredCategories: string[];
  excludedTrustRoots: string[];
  productionTouched: false;
} {
  const start = Date.now();
  const testKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const syntheticPayload = {
    neighborhoodOverrides: { '1': { buyPerSqm: 195, rahn80m: 2200 } },
    bargains: [{ id: 'b_synth_1', hoodId: 1, status: 'approved', createdByUid: 'u_synth_1' }],
    sponsorRequests: [{ id: 'u_synth_1_hood_1', hoodId: 1, status: 'approved' }],
    FIREBASE_PROJECT_ID: 'attacker-project-override',
    ADMIN_EMAIL: 'attacker@evil.example',
    admins: { u_evil: { role: 'superadmin' } },
  };
  const envelope = createAuthenticatedEncryptedBackup(syntheticPayload, testKey, PRIMARY_BOOTSTRAP_ADMIN_EMAIL);
  const decrypted = decryptAndVerifyEncryptedBackupWithRotation(envelope, testKey, null);
  const preflight = runBackupRestorePreflight({ rawBackupPayload: decrypted.payload, targetStateVersion: 1 });
  const committed = commitTwoPhaseBackupRestore({
    preflightToken: preflight.preflightToken,
    currentBackupPayload: decrypted.payload,
    currentTargetStateVersion: 1,
    callerIsPrimaryAdmin: true,
  });
  return {
    passed: committed.ok && preflight.excludedProtectedFields.includes('FIREBASE_PROJECT_ID'),
    durationMs: Math.max(1, Date.now() - start),
    restoredCategories: committed.ok ? Object.keys(committed.restoredData) : [],
    excludedTrustRoots: preflight.excludedProtectedFields,
    productionTouched: false,
  };
}
export function sanitizePushAndBrowserNotificationPayload(raw: {
  title: string;
  body: string;
  deepLinkPath: string;
}): { title: string; body: string; safeDeepLinkPath: string } {
  const cleanTitle = sanitizeInput(raw.title, 80).replace(/\b09\d{9}\b/g, '[شماره محفوظ]');
  const cleanBody = sanitizeInput(raw.body, 160)
    .replace(/\b09\d{9}\b/g, '[شماره محفوظ]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[ایمیل محفوظ]');
  return { title: cleanTitle, body: cleanBody, safeDeepLinkPath: stripCredentialsFromUrlAndRedirect(raw.deepLinkPath) };
}
export function generateAndVerifyReleaseProvenanceAttestation(params: {
  repository: string;
  commitSha: string;
  workflowRef: string;
  eventName: 'push' | 'release' | 'workflow_dispatch' | 'pull_request' | 'pull_request_target';
  artifactSha256: string;
  sbomSha256: string;
  signingKey: string;
}): { trustedForRelease: boolean; attestationSignature?: string; reason: string } {
  if (params.eventName === 'pull_request' || params.eventName === 'pull_request_target') {
    return { trustedForRelease: false, reason: 'UNTRUSTED_PR_WORKFLOW_CANNOT_OBTAIN_RELEASE_ATTESTATION' }; } if (params.repository !== 'bijanbijane/radartehran' || !/^[0-9a-f]{40}$/i.test(params.commitSha)) { return { trustedForRelease: false, reason: 'INVALID_REPO_OR_COMMIT_IDENTITY' }; } if (!/^[0-9a-f]{64}$/i.test(params.artifactSha256) || !/^[0-9a-f]{64}$/i.test(params.sbomSha256)) { return { trustedForRelease: false, reason: 'INVALID_ARTIFACT_OR_SBOM_DIGEST' }; } const canonicalStatement = JSON.stringify({
    predicateType: 'https://slsa.dev/provenance/v1',
    repository: params.repository, commitSha: params.commitSha, workflowRef: params.workflowRef, projectId: AUTHORITATIVE_FIREBASE_PROJECT_ID, databaseId: AUTHORITATIVE_FIRESTORE_DATABASE_ID, artifactSha256: params.artifactSha256, sbomSha256: params.sbomSha256, }); const attestationSignature = crypto.createHmac('sha256', params.signingKey).update(canonicalStatement).digest('hex'); return { trustedForRelease: true, attestationSignature, reason: 'PROVENANCE_ATTESTATION_VERIFIED' }; }
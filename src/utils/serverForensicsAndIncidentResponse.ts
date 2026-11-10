import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL'; export type SecurityIncidentCategory = 'UNAUTHORIZED_ADMIN_ACCESS' | 'ACCOUNT_TAKEOVER' | 'SUSPICIOUS_AUTH_PATTERN' | 'UNUSUAL_API_ACCESS' | 'UNAUTHORIZED_DATA_EXPORT' | 'MASS_LISTING_DOWNLOAD' | 'UNEXPECTED_MEDIA_DELETION' | 'CREDENTIAL_EXPOSURE' | 'DB_PERMISSION_CHANGE' | 'SUSPICIOUS_CONFIG_CHANGE' | 'ABNORMAL_BACKGROUND_OP' | 'CRITICAL_RECORD_MUTATION' | 'REPEATED_AUTHZ_FAILURE' | 'POTENTIAL_DATA_EXFILTRATION' | 'SECURITY_SERVICE_OUTAGE'; export const INCIDENT_SEVERITY_BY_CATEGORY: Record<SecurityIncidentCategory, IncidentSeverity> = { UNAUTHORIZED_ADMIN_ACCESS: 'HIGH', ACCOUNT_TAKEOVER: 'CRITICAL', SUSPICIOUS_AUTH_PATTERN: 'MEDIUM', UNUSUAL_API_ACCESS: 'LOW', UNAUTHORIZED_DATA_EXPORT: 'CRITICAL', MASS_LISTING_DOWNLOAD: 'MEDIUM',
  UNEXPECTED_MEDIA_DELETION: 'HIGH', CREDENTIAL_EXPOSURE: 'CRITICAL', DB_PERMISSION_CHANGE: 'CRITICAL', SUSPICIOUS_CONFIG_CHANGE: 'HIGH', ABNORMAL_BACKGROUND_OP: 'MEDIUM', CRITICAL_RECORD_MUTATION: 'CRITICAL', REPEATED_AUTHZ_FAILURE: 'MEDIUM', POTENTIAL_DATA_EXFILTRATION: 'HIGH',
  SECURITY_SERVICE_OUTAGE: 'HIGH', }; export interface ForensicSecurityEvent { incidentId: string; sequenceNumber: number; timestampIso: string; category: SecurityIncidentCategory; severity: IncidentSeverity;
  actorId: string; actorIpHash: string; requestId: string; correlationId: string;
  targetResource: string; outcome: 'BLOCKED' | 'DETECTED' | 'CONTAINED' | 'RECOVERED'; redactedMetadata: Record<string, unknown>; uncollectedEvidenceDisclaimer: string;
  previousHash: string; eventHash: string; displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
}
const SENSITIVE_KEY_RX = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|encryption[_-]?key|access[_-]?key|x-admin-token|envelope|backupcontent/i;
export function redactSensitiveForensicText(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\r\n\u0000]+/g, ' ')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,}|chub_[0-9A-Za-z_-]{16,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, '[REDACTED_TELEGRAM_TOKEN]')
    .replace(/([0۰٠][9۹٩][0-9۰-۹٠-٩]{2})[0-9۰-۹٠-٩]{3}([0-9۰-۹٠-٩]{4})/g, '$1***$2')
    .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    .slice(0, 500);
}
export function redactMetadataObject(
  meta: Record<string, unknown> = {},
  depth = 0,
  visited = new WeakSet<object>(),
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  if (!meta || typeof meta !== 'object' || depth > 6) return out;
  if (visited.has(meta)) return out;
  visited.add(meta);
  for (const [k, v] of Object.entries(meta)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (SENSITIVE_KEY_RX.test(k)) out[k] = '[REDACTED]';
    else if (typeof v === 'string') out[k] = redactSensitiveForensicText(v);
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((item) => typeof item === 'string' ? redactSensitiveForensicText(item) : item && typeof item === 'object' && !Array.isArray(item) ? redactMetadataObject(item as Record<string, unknown>, depth + 1, visited) : item);
    else if (v && typeof v === 'object') out[k] = redactMetadataObject(v as Record<string, unknown>, depth + 1, visited);
    else out[k] = v;
  }
  return out;
}
export class TamperResistantForensicLedger {
  private readonly events: ForensicSecurityEvent[] = [];
  recordSecurityEvent(params: {
    category: SecurityIncidentCategory; severity?: IncidentSeverity; actorId: string; actorIp: string;
    requestId: string; correlationId: string; targetResource: string; outcome: ForensicSecurityEvent['outcome'];
    metadata?: Record<string, unknown>; timestampIso?: string; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
  }): ForensicSecurityEvent {
    const sequenceNumber = this.events.length > 0 ? this.events[this.events.length - 1].sequenceNumber + 1 : 1;
    const timestampIso = params.timestampIso ?? new Date().toISOString();
    const severity = params.severity ?? INCIDENT_SEVERITY_BY_CATEGORY[params.category];
    const previousHash = this.events.length > 0 ? this.events[this.events.length - 1].eventHash : 'GENESIS_0000000000000000';
    const actorIpHash = crypto.createHash('sha256').update(`radar-ip-salt:${params.actorIp}`).digest('hex').slice(0, 16);
    const redactedMetadata = redactMetadataObject(params.metadata);
    const incidentId = `INC-${sequenceNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const canonicalPayload = JSON.stringify({
      incidentId, sequenceNumber, timestampIso, category: params.category, severity,
      actorId: params.actorId, actorIpHash, requestId: params.requestId, correlationId: params.correlationId,
      targetResource: params.targetResource, outcome: params.outcome, redactedMetadata, previousHash,
    });
    const eventHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');
    const record: ForensicSecurityEvent = {
      incidentId, sequenceNumber, timestampIso, category: params.category, severity,
      actorId: params.actorId, actorIpHash, requestId: params.requestId, correlationId: params.correlationId,
      targetResource: params.targetResource, outcome: params.outcome, redactedMetadata,
      uncollectedEvidenceDisclaimer:
        'تنها متادیتای سانسورشده لایه اپلیکیشن ثبت شده است؛ بدنه خام رمزعبور، توکن‌های نشست و ترافیک سطح کرنل ذخیره نمی‌شوند.',
      previousHash, eventHash,
      displayAreaUnitLabel: formatAreaUnitLabel(params.areaUnit || 'sqm'),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(120, params.intlCurrency || 'USD', 'en'),
    };
    if (this.events.length >= 5000) this.events.shift();
    this.events.push(record);
    return { ...record, redactedMetadata: { ...record.redactedMetadata } };
  }
  getEvents(): ForensicSecurityEvent[] {
    return this.events.map((e) => ({ ...e, redactedMetadata: { ...e.redactedMetadata } }));
  }
  verifyChainIntegrity(): { intact: boolean; tamperedSequenceNumber?: number } {
    let expectedPrev = this.events.length > 0 && this.events[0].sequenceNumber > 1 && /^[a-f0-9]{64}$/i.test(this.events[0].previousHash) ? this.events[0].previousHash : 'GENESIS_0000000000000000';
    for (const ev of this.events) {
      if (ev.previousHash !== expectedPrev) return { intact: false, tamperedSequenceNumber: ev.sequenceNumber };
      const canonicalPayload = JSON.stringify({
        incidentId: ev.incidentId, sequenceNumber: ev.sequenceNumber, timestampIso: ev.timestampIso,
        category: ev.category, severity: ev.severity, actorId: ev.actorId, actorIpHash: ev.actorIpHash,
        requestId: ev.requestId, correlationId: ev.correlationId, targetResource: ev.targetResource,
        outcome: ev.outcome, redactedMetadata: ev.redactedMetadata, previousHash: ev.previousHash,
      });
      const recomputed = crypto.createHash('sha256').update(canonicalPayload).digest('hex');
      if (recomputed !== ev.eventHash) return { intact: false, tamperedSequenceNumber: ev.sequenceNumber };
      expectedPrev = ev.eventHash;
    }
    return { intact: true };
  }
}
export type AccountLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type OneTimeTokenPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION';
interface StoredOneTimeToken {
  tokenHash: string; userId: string; purpose: OneTimeTokenPurpose; issuedAtMs: number; expiresAtMs: number; consumedAtMs?: number;
}
export class AccountSessionAndRecoveryGuard {
  private readonly tokensByHash = new Map<string, StoredOneTimeToken>();
  private readonly sessionRevokedBeforeMs = new Map<string, number>();
  private readonly accountState = new Map<string, AccountLifecycleStatus>();
  private readonly tokenTtlMs: number;
  constructor(tokenTtlMs = 15 * 60_000) {
    this.tokenTtlMs = Math.max(1000, Math.min(tokenTtlMs, 24 * 3600_000));
  }
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(`radar-ott:${rawToken}`).digest('hex');
  }
  setAccountStatus(userId: string, status: AccountLifecycleStatus, nowMs = Date.now()): void {
    if (!this.accountState.has(userId) && this.accountState.size >= 5000) {
      const oldest = this.accountState.keys().next().value;
      if (oldest !== undefined) this.accountState.delete(oldest);
    }
    this.accountState.set(userId, status);
    if (status !== 'ACTIVE') this.revokeAllSessionsForUser(userId, nowMs);
  }
  revokeAllSessionsForUser(userId: string, cutoffMs = Date.now()): void {
    if (!this.sessionRevokedBeforeMs.has(userId) && this.sessionRevokedBeforeMs.size >= 5000) {
      const oldest = this.sessionRevokedBeforeMs.keys().next().value;
      if (oldest !== undefined) this.sessionRevokedBeforeMs.delete(oldest);
    }
    this.sessionRevokedBeforeMs.set(userId, cutoffMs);
  }
  issueOneTimeToken(userId: string, purpose: OneTimeTokenPurpose, nowMs = Date.now()): {
    rawToken: string;
    expiresAtMs: number;
    uniformUserFacingMessage: string;
  } {
    for (const [hash, existing] of this.tokensByHash.entries()) {
      if (this.tokensByHash.size >= 1000 && (existing.consumedAtMs !== undefined || nowMs > existing.expiresAtMs)) {
        this.tokensByHash.delete(hash);
      } else if (existing.userId === userId && existing.purpose === purpose && !existing.consumedAtMs) {
        existing.consumedAtMs = nowMs;
      }
    }
    if (this.tokensByHash.size >= 1000) {
      const oldestHash = this.tokensByHash.keys().next().value;
      if (oldestHash) this.tokensByHash.delete(oldestHash);
    }
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAtMs = nowMs + this.tokenTtlMs;
    this.tokensByHash.set(tokenHash, {
      tokenHash, userId, purpose, issuedAtMs: nowMs, expiresAtMs,
    });
    return {
      rawToken, expiresAtMs,
      uniformUserFacingMessage: 'در صورت وجود حساب کاربری معتبر، لینک یک‌بارمصرف با اعتبار ۱۵ دقیقه ارسال شد.',
    };
  }
  consumeOneTimeToken(
    rawToken: string,
    expectedPurpose: OneTimeTokenPurpose,
    nowMs = Date.now(),
  ): {
    valid: boolean;
    userId?: string;
    reason: 'OK' | 'TOKEN_NOT_FOUND' | 'TOKEN_ALREADY_USED' | 'TOKEN_EXPIRED' | 'PURPOSE_MISMATCH';
  } {
    const tokenHash = this.hashToken(rawToken);
    const stored = this.tokensByHash.get(tokenHash);
    if (!stored) return { valid: false, reason: 'TOKEN_NOT_FOUND' };
    if (stored.purpose !== expectedPurpose) return { valid: false, reason: 'PURPOSE_MISMATCH' };
    if (stored.consumedAtMs !== undefined) return { valid: false, reason: 'TOKEN_ALREADY_USED' };
    if (nowMs > stored.expiresAtMs) return { valid: false, reason: 'TOKEN_EXPIRED' };
    stored.consumedAtMs = nowMs;
    if (expectedPurpose === 'PASSWORD_RESET') {
      this.revokeAllSessionsForUser(stored.userId, nowMs);
    }
    return { valid: true, userId: stored.userId, reason: 'OK' };
  }
  isSessionValid(userId: string, sessionIssuedAtMs: number): {
    valid: boolean;
    reason: 'VALID' | 'ACCOUNT_NOT_ACTIVE' | 'SESSION_REVOKED_BEFORE_CUTOFF';
  } {
    const state = this.accountState.get(userId) ?? 'ACTIVE';
    if (state !== 'ACTIVE') return { valid: false, reason: 'ACCOUNT_NOT_ACTIVE' };
    const cutoff = this.sessionRevokedBeforeMs.get(userId);
    if (cutoff !== undefined && sessionIssuedAtMs <= cutoff) {
      return { valid: false, reason: 'SESSION_REVOKED_BEFORE_CUTOFF' };
    }
    return { valid: true, reason: 'VALID' };
  }
}
export const liveServerForensicLedger = new TamperResistantForensicLedger();
/**
 * Tasks 455 & 518: Live server-side tamper-evident audit logger supporting both structured forensic
 * category calls and administrative action audit calls.
 */
export function recordLiveAdminSecurityAudit(params: {
  category?: SecurityIncidentCategory;
  action?: string;
  severity?: IncidentSeverity;
  actorId?: string;
  actorUid?: string;
  actorEmail?: string;
  actorIp?: string;
  targetResource?: string;
  outcome: ForensicSecurityEvent['outcome'] | 'allowed' | 'denied';
  reason?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): ForensicSecurityEvent {
  const reqId = params.requestId || `req-${crypto.randomBytes(4).toString('hex')}`;
  const resolvedCategory: SecurityIncidentCategory =
    params.category ||
    (params.outcome === 'denied' ? 'UNAUTHORIZED_ADMIN_ACCESS' : 'CRITICAL_RECORD_MUTATION');
  const resolvedOutcome: ForensicSecurityEvent['outcome'] =
    params.outcome === 'denied'
      ? 'BLOCKED'
      : params.outcome === 'allowed'
        ? 'CONTAINED'
        : params.outcome;
  return liveServerForensicLedger.recordSecurityEvent({
    category: resolvedCategory,
    severity: params.severity,
    actorId: params.actorId || params.actorUid || params.actorEmail || 'anonymous',
    actorIp: params.actorIp || '127.0.0.1',
    requestId: reqId,
    correlationId: reqId,
    targetResource: params.targetResource || params.action || 'admin_operation',
    outcome: resolvedOutcome,
    metadata: {
      ...(params.metadata || {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    },
  });
}
export function getLiveAdminSecurityAuditEvents(): ForensicSecurityEvent[] {
  return liveServerForensicLedger.getEvents();
}
import crypto from 'node:crypto'; import { escapeCsvCell } from './security'; import { constantTimeSecretMatch } from './serverAdminAndTelegramSecurity'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export function redactTelegramBotTokenFromText(input: unknown): string { const raw = String(input ?? ''); return raw
    .replace(/bot\d{6,15}:[A-Za-z0-9_-]{20,64}/g, 'bot[REDACTED_TELEGRAM_TOKEN]')
    .replace(/\b\d{6,15}:[A-Za-z0-9_-]{30,64}\b/g, '[REDACTED_TELEGRAM_TOKEN]'); } export function verifyTelegramWebhookSecretWithRotation(params: { headerSecret: string | undefined; activeSecret: string | undefined; previousSecret?: string | undefined; previousSecretExpiresAtMs?: number | undefined; nowMs?: number; }): { verified: boolean; matchedKey: 'active' | 'previous_rotation' | 'none'; reason: string } { const header = String(params.headerSecret ?? '').trim(); const active = String(params.activeSecret ?? '').trim(); if (!header || !active || header.length < 16) { return { verified: false, matchedKey: 'none', reason: 'MISSING_OR_WEAK_WEBHOOK_SECRET' }; } if (constantTimeSecretMatch(header, active)) { return { verified: true, matchedKey: 'active', reason: 'VERIFIED_ACTIVE_SECRET' }; }
  const prev = String(params.previousSecret ?? '').trim(); const now = params.nowMs ?? Date.now(); if ( prev && prev.length >= 16 && typeof params.previousSecretExpiresAtMs === 'number' &&
    now <= params.previousSecretExpiresAtMs && constantTimeSecretMatch(header, prev)
  ) { return { verified: true, matchedKey: 'previous_rotation', reason: 'VERIFIED_ROTATION_OVERLAP_SECRET' }; } return { verified: false, matchedKey: 'none', reason: 'WEBHOOK_SECRET_MISMATCH' }; } export type TelegramCommandPermission = 'public_info' | 'operator_moderation' | 'primary_admin_action'; const TELEGRAM_COMMAND_POLICY: Record<string, TelegramCommandPermission> = { '/start': 'public_info', '/help': 'public_info', '/pulse': 'public_info', '/approve_bargain': 'operator_moderation', '/reject_bargain': 'operator_moderation', '/status_admin': 'operator_moderation', '/circuit_breaker': 'primary_admin_action', }; export function authorizeTelegramCommandOrCallback(params: { commandOrAction: string; senderNumericUserId: number | undefined; senderUsername?: string; authorizedOperatorNumericIds: ReadonlySet<number>; primaryAdminNumericIds: ReadonlySet<number>;
}): { authorized: boolean; requiredLevel: TelegramCommandPermission | 'unknown'; reason: string } { const cmd = String(params.commandOrAction || '').trim().split(/\s+/)[0].toLowerCase(); const policy = TELEGRAM_COMMAND_POLICY[cmd]; if (!policy) return { authorized: false, requiredLevel: 'unknown', reason: 'UNKNOWN_OR_DISALLOWED_TELEGRAM_COMMAND' }; if (policy === 'public_info') return { authorized: true, requiredLevel: policy, reason: 'PUBLIC_TELEGRAM_COMMAND' }; const numericId = Number(params.senderNumericUserId); if (!Number.isInteger(numericId) || numericId <= 0) { return { authorized: false, requiredLevel: policy, reason: 'MISSING_NUMERIC_TELEGRAM_SENDER_ID' }; }
  if (policy === 'primary_admin_action') { if (!params.primaryAdminNumericIds.has(numericId)) { return { authorized: false, requiredLevel: policy, reason: 'TELEGRAM_PRIMARY_ADMIN_ID_REQUIRED' }; }
    return { authorized: true, requiredLevel: policy, reason: 'AUTHORIZED_PRIMARY_ADMIN_SENDER' }; }
  if (!params.authorizedOperatorNumericIds.has(numericId) && !params.primaryAdminNumericIds.has(numericId)) { return { authorized: false, requiredLevel: policy, reason: 'UNAUTHORIZED_TELEGRAM_NUMERIC_SENDER' }; }
  return { authorized: true, requiredLevel: policy, reason: 'AUTHORIZED_OPERATOR_SENDER' }; }
export class TelegramCallbackTokenRegistry { private readonly tokens = new Map<string, { action: string; targetId: string; boundNumericSenderId: number; expiresAtMs: number; consumed: boolean }>();
  issueCallbackToken(params: { action: 'approve_bargain' | 'reject_bargain'; targetId: string; boundNumericSenderId: number; ttlMs?: number; nowMs?: number; }): string {
    const now = params.nowMs ?? Date.now();
    if (this.tokens.size >= 1000) {
      for (const [k, v] of this.tokens.entries()) { if (v.consumed || now > v.expiresAtMs) this.tokens.delete(k); }
      if (this.tokens.size >= 1000) { const oldest = this.tokens.keys().next().value; if (oldest !== undefined) this.tokens.delete(oldest); }
    }
    const token = `cb_${crypto.randomBytes(12).toString('hex')}`;
    this.tokens.set(token, { action: params.action, targetId: params.targetId, boundNumericSenderId: params.boundNumericSenderId, expiresAtMs: now + (params.ttlMs ?? 10 * 60_000), consumed: false, }); return token; }
  consumeCallbackToken(params: { token: string; senderNumericUserId: number; nowMs?: number;
  }): { ok: boolean; action?: string; targetId?: string; reason?: string } { const rec = this.tokens.get(params.token); if (!rec) return { ok: false, reason: 'UNKNOWN_OR_TAMPERED_CALLBACK_TOKEN' }; if (rec.consumed) return { ok: false, reason: 'CALLBACK_TOKEN_ALREADY_CONSUMED' };
    if ((params.nowMs ?? Date.now()) > rec.expiresAtMs) return { ok: false, reason: 'CALLBACK_TOKEN_EXPIRED' }; if (rec.boundNumericSenderId !== params.senderNumericUserId) {
      return { ok: false, reason: 'CALLBACK_SENDER_MISMATCH' }; }
    rec.consumed = true;
    return { ok: true, action: rec.action, targetId: rec.targetId };
  }
}
const APPROVED_OUTBOUND_SERVICE_HOSTS = new Set([
  'api.telegram.org', 'api.waqi.info', 'air-quality-api.open-meteo.com', 'api.open-meteo.com',
  'api.divar.ir', 'www.sheypoor.com', 'nominatim.openstreetmap.org',
  'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org',
]);
export function validateOutboundServiceDestinationUrl(rawUrl: string): { allowed: boolean; hostname: string; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    return { allowed: false, hostname: '', reason: 'MALFORMED_OUTBOUND_URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { allowed: false, hostname: parsed.hostname, reason: 'HTTPS_REQUIRED_FOR_OUTBOUND_CALL' };
  }
  if (parsed.username || parsed.password) {
    return { allowed: false, hostname: parsed.hostname, reason: 'CREDENTIALS_IN_OUTBOUND_URL_FORBIDDEN' };
  }
  if (parsed.port && parsed.port !== '443') {
    return { allowed: false, hostname: parsed.hostname, reason: 'NON_STANDARD_OUTBOUND_PORT_FORBIDDEN' };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (
    host === 'localhost' ||
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(host)
  ) {
    return { allowed: false, hostname: host, reason: 'PRIVATE_OR_METADATA_DESTINATION_BLOCKED' };
  }
  if (!APPROVED_OUTBOUND_SERVICE_HOSTS.has(host)) {
    return { allowed: false, hostname: host, reason: 'UNAPPROVED_OUTBOUND_SERVICE_HOST' };
  }
  return { allowed: true, hostname: host };
}
export type BackgroundJobState = 'queued' | 'processing' | 'completed' | 'failed' | 'dead_letter' | 'cancelled';
const VALID_JOB_TRANSITIONS: Record<BackgroundJobState, ReadonlySet<BackgroundJobState>> = {
  queued: new Set(['processing', 'cancelled']),
  processing: new Set(['completed', 'failed', 'dead_letter']),
  failed: new Set(['queued', 'dead_letter', 'cancelled']),
  completed: new Set([]),
  dead_letter: new Set([]),
  cancelled: new Set([]),
};
export type AllowedJobType = 'market_pulse_sync' | 'media_orphan_cleanup' | 'buyer_alert_dispatch';
export interface BackgroundJobRecord {
  jobId: string;
  jobType: AllowedJobType;
  initiatingActorUid: string;
  state: BackgroundJobState;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, string | number | boolean>;
  lastErrorCode?: string;
}
export function validateAndCreateBackgroundJob(params: {
  jobId: string;
  jobType: string;
  initiatingActorUid: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}): { ok: boolean; job?: BackgroundJobRecord; reason?: string } {
  const allowedTypes: ReadonlySet<string> = new Set([
    'market_pulse_sync', 'media_orphan_cleanup', 'buyer_alert_dispatch',
  ]);
  if (!allowedTypes.has(params.jobType)) return { ok: false, reason: 'DISALLOWED_BACKGROUND_JOB_TYPE' };
  if (!params.initiatingActorUid || params.initiatingActorUid.length > 128) {
    return { ok: false, reason: 'INVALID_INITIATING_ACTOR_UID' };
  }
  const forbiddenKeys = new Set([
    'isAdmin', 'role', 'roles', 'idToken', 'accessToken', 'botToken', 'callbackUrl', '__proto__', 'constructor',
  ]);
  const cleanPayload = Object.create(null) as Record<string, string | number | boolean>;
  const keys = Object.keys(params.payload || {});
  if (keys.length > 12) return { ok: false, reason: 'JOB_PAYLOAD_TOO_MANY_FIELDS' };
  for (const k of keys) {
    if (forbiddenKeys.has(k)) return { ok: false, reason: `FORBIDDEN_JOB_PAYLOAD_KEY_${k}` };
    const v = params.payload[k];
    if ((typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') || (typeof v === 'number' && !Number.isFinite(v))) {
      return { ok: false, reason: `NON_PRIMITIVE_JOB_PAYLOAD_FIELD_${k}` };
    }
    if (typeof v === 'string' && v.length > 256) return { ok: false, reason: `OVERSIZED_JOB_PAYLOAD_STRING_${k}` };
    cleanPayload[k] = v;
  }
  return {
    ok: true,
    job: {
      jobId: params.jobId,
      jobType: params.jobType as AllowedJobType,
      initiatingActorUid: params.initiatingActorUid,
      state: 'queued',
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      payload: cleanPayload,
    },
  };
}
export function transitionBackgroundJobState(params: {
  job: BackgroundJobRecord;
  nextState: BackgroundJobState;
  isPermanentFailure?: boolean;
  errorCode?: string;
}): { ok: boolean; updated: BackgroundJobRecord; reason?: string } {
  const allowed = VALID_JOB_TRANSITIONS[params.job.state];
  if (!allowed || !allowed.has(params.nextState)) {
    return { ok: false, updated: params.job, reason: `INVALID_JOB_STATE_TRANSITION_${params.job.state}_TO_${params.nextState}` };
  }
  const attempts = params.nextState === 'processing' ? params.job.attempts + 1 : params.job.attempts;
  let targetState = params.nextState;
  if (targetState === 'failed' && (params.isPermanentFailure || attempts >= params.job.maxAttempts)) {
    targetState = 'dead_letter';
  }
  return {
    ok: true,
    updated: { ...params.job, state: targetState, attempts, lastErrorCode: params.errorCode ?? params.job.lastErrorCode },
  };
}
export function redactIntegrationLogPayload(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED_DEPTH]';
  if (typeof input === 'string') {
    return redactTelegramBotTokenFromText(input)
      .replace(/[\r\n]/g, ' ')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b09\d{9}\b/g, '[REDACTED_PHONE]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
      .slice(0, 300);
  }
  if (Array.isArray(input)) return input.slice(0, 10).map((item) => redactIntegrationLogPayload(item, depth + 1));
  if (input && typeof input === 'object') {
    const out = Object.create(null) as Record<string, unknown>;
    const sensitiveKeys = /token|secret|password|phone|mobile|email|address|text|message/i;
    for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 20)) {
      out[k] = sensitiveKeys.test(k) ? '[REDACTED_FIELD]' : redactIntegrationLogPayload(v, depth + 1);
    }
    return out;
  }
  return input;
}
export function validateServiceWorkerRegistrationConfig(params: {
  scriptUrl: string;
  scope: string;
  appOrigin: string;
  isSecureContext: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.isSecureContext) return { allowed: false, reason: 'INSECURE_CONTEXT_FOR_SW' };
  let parsed: URL;
  try {
    parsed = new URL(params.scriptUrl, params.appOrigin);
  } catch {
    return { allowed: false, reason: 'INVALID_SW_SCRIPT_URL' };
  }
  if (parsed.origin !== params.appOrigin || parsed.pathname !== '/sw.js' || parsed.search !== '') {
    return { allowed: false, reason: 'UNTRUSTED_SW_SCRIPT_PATH_OR_QUERY' };
  }
  if (params.scope !== '/') return { allowed: false, reason: 'INVALID_SW_SCOPE' };
  return { allowed: true };
}
export function serializeSafeCsvDocument(params: {
  headers: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<unknown>>;
}): { ok: boolean; csvWithBom: string; reason?: string } {
  if (params.headers.length === 0 || params.headers.length > 30) {
    return { ok: false, csvWithBom: '', reason: 'INVALID_CSV_HEADER_COUNT' };
  }
  if (!Array.isArray(params.rows) || params.rows.length > 5000) {
    return { ok: false, csvWithBom: '', reason: 'CSV_ROW_LIMIT_EXCEEDED' };
  }
  const uniqueHeaders = new Set(params.headers.map((h) => h.trim()));
  if (uniqueHeaders.size !== params.headers.length) {
    return { ok: false, csvWithBom: '', reason: 'DUPLICATE_CSV_HEADERS' };
  }
  const lines: string[] = [params.headers.map((h) => escapeCsvCell(h)).join(',')];
  for (const row of params.rows) {
    if (row.length !== params.headers.length) {
      return { ok: false, csvWithBom: '', reason: 'CSV_COLUMN_COUNT_MISMATCH' };
    }
    lines.push(row.map((cell: unknown) => escapeCsvCell(String(cell ?? '').replace(/\r?\n/g, ' '))).join(','));
  }
  return { ok: true, csvWithBom: '\uFEFF' + lines.join('\r\n') };
}
const APPROVED_SENDER_IDENTITIES = new Set(['noreply@radartehran.ir', 'alerts@radartehran.ir']);
export function validateEmailHeaderAndRecipientSafety(params: {
  fromAddress: string; toAddresses: readonly string[]; subject: string; displayName?: string; customHeaders?: Record<string, string>;
}): { valid: boolean; reason?: string } {
  if (!APPROVED_SENDER_IDENTITIES.has(String(params.fromAddress || '').trim().toLowerCase())) {
    return { valid: false, reason: 'UNAPPROVED_SENDER_IDENTITY' };
  }
  const hasCrlf = (s: string) => /[\r\n\u0000]/.test(s) || /(?:^|\s)(?:bcc|cc|to|from|content-type|mime-version)\s*:/i.test(s);
  if (!params.subject || params.subject.length > 180 || hasCrlf(params.subject)) {
    return { valid: false, reason: 'EMAIL_SUBJECT_HEADER_INJECTION_DETECTED' };
  }
  if (params.displayName && (hasCrlf(params.displayName) || /[<>,;@]/.test(params.displayName))) {
    return { valid: false, reason: 'DISPLAY_NAME_RECIPIENT_INJECTION_DETECTED' };
  }
  if (!Array.isArray(params.toAddresses) || params.toAddresses.length === 0 || params.toAddresses.length > 1) {
    return { valid: false, reason: 'MULTI_RECIPIENT_BATCH_OR_EMPTY_TO_FORBIDDEN' };
  }
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  for (const addr of params.toAddresses) {
    const clean = String(addr || '').trim();
    if (hasCrlf(clean) || !emailRegex.test(clean)) return { valid: false, reason: 'INVALID_OR_INJECTED_RECIPIENT_EMAIL' };
  }
  if (params.customHeaders && Object.keys(params.customHeaders).length > 0) {
    return { valid: false, reason: 'UNTRUSTED_CUSTOM_EMAIL_HEADERS_FORBIDDEN' };
  }
  return { valid: true };
}
export function sanitizeNotificationTemplateAndLink(params: {
  templateVars: Record<string, string>; allowedPlaceholders: ReadonlySet<string>;
  canonicalOrigin: string; targetPath: string; forgedHostHeader?: string;
}): { ok: boolean; safeVars?: Record<string, string>; canonicalUrl?: string; reason?: string } {
  let originUrl: URL;
  try { originUrl = new URL(params.canonicalOrigin); } catch { return { ok: false, reason: 'INVALID_CANONICAL_ORIGIN' }; }
  if (originUrl.protocol !== 'https:' || originUrl.hostname !== 'radartehran.ir') {
    return { ok: false, reason: 'UNAPPROVED_CANONICAL_NOTIFICATION_ORIGIN' };
  }
  const rawPath = String(params.targetPath || '/').trim();
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.startsWith('/\\') || /[\r\n\u0000-\u001F]/.test(rawPath) || /^(?:javascript|data|vbscript):/i.test(rawPath)) {
    return { ok: false, reason: 'UNSAFE_NOTIFICATION_LINK_PATH' };
  }
  if (/(?:token|secret|password|id_token|apikey)=/i.test(rawPath)) {
    return { ok: false, reason: 'SECRET_IN_NOTIFICATION_URL_FORBIDDEN' };
  }
  const safeVars = Object.create(null) as Record<string, string>;
  for (const [key, val] of Object.entries(params.templateVars || {})) {
    if (!params.allowedPlaceholders.has(key)) return { ok: false, reason: `DISALLOWED_TEMPLATE_PLACEHOLDER_${key}` };
    const str = String(val ?? '');
    if (/(?:password|idToken|botToken|\bIR\d{24}\b)/i.test(str)) {
      return { ok: false, reason: 'SENSITIVE_SECRET_OR_PII_IN_NOTIFICATION_BODY' };
    }
    safeVars[key] = str.replace(/[\r\n\u0000-\u001F]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').slice(0, 160);
  }
  return { ok: true, safeVars, canonicalUrl: `${originUrl.origin}${rawPath}` };
}
export function maskNotificationLogRecipientPii(rawText: string): string {
  return redactTelegramBotTokenFromText(String(rawText || ''))
    .replace(/[\r\n]/g, ' ')
    .replace(/\b(09\d{2})\d{3}(\d{4})\b/g, '$1***$2')
    .replace(/\b([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    .replace(/\b(?:otp|code|token|password)\s*[:=]\s*\S+/gi, '[REDACTED_CREDENTIAL]');
}
export function validateNotificationRecordUpdateBoundary(params: {
  actorUid: string; recordOwnerUid: string; isAdmin: boolean; updatePayload: Record<string, unknown>;
}): { allowed: boolean; reason?: string } { if (!params.actorUid || (!params.isAdmin && params.actorUid !== params.recordOwnerUid)) { return { allowed: false, reason: 'CROSS_USER_NOTIFICATION_ACCESS_DENIED' }; } const immutableSystemFields = new Set(['userId', 'userEmail', 'providerMessageId', 'deliveryVerified', 'deliveredAtIso', 'createdAtIso', 'adminAttribution']); for (const key of Object.keys(params.updatePayload || {})) {
    if (immutableSystemFields.has(key)) return { allowed: false, reason: `IMMUTABLE_NOTIFICATION_METADATA_${key}` };
  } return { allowed: true }; }
export function buildEmailAndSmsSecurityComplianceManifest(options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }): {
  smtpOrTransactionalEmailSdkInstalled: false; thirdPartySmsGatewaySdkInstalled: false; activeNotificationChannels: readonly ['telegram_admin_channel_digest', 'firestore_and_api_buyer_alerts'];
  canonicalNotificationOrigin: 'https://radartehran.ir'; canonicalPhoneNormalizationEnforced: true; perRecipientPhoneQuotaEnforced: true; clientBundleExposedEmailOrSmsSecrets: 0;
  displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  return {
    smtpOrTransactionalEmailSdkInstalled: false, thirdPartySmsGatewaySdkInstalled: false, activeNotificationChannels: ['telegram_admin_channel_digest', 'firestore_and_api_buyer_alerts'],
    canonicalNotificationOrigin: 'https://radartehran.ir', canonicalPhoneNormalizationEnforced: true, perRecipientPhoneQuotaEnforced: true, clientBundleExposedEmailOrSmsSecrets: 0,
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT'),
  }; }
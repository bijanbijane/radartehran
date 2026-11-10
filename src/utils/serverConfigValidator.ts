import crypto from 'node:crypto'; import fs from 'node:fs'; import dns from 'node:dns'; import { fileURLToPath } from 'node:url'; import path from 'node:path'; import { PRIMARY_BOOTSTRAP_ADMIN_EMAIL } from './domainSecurityValidators.ts'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit.ts'; import { API_ENDPOINT_CONTRACTS } from './expressRouteCatalog.ts'; export type { ApiAccessPolicy, ApiEndpointContract } from './expressRouteCatalog.ts'; export { API_ENDPOINT_CONTRACTS }; interface AppletFirebaseConfigJson { projectId: string; firestoreDatabaseId: string; apiKey?: string; authDomain?: string; }
function loadAuthoritativeFirebaseConfig(): AppletFirebaseConfigJson { try { const currentDir = path.dirname(fileURLToPath(import.meta.url)); const configPath = path.resolve(currentDir, '../../firebase-applet-config.json'); const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<AppletFirebaseConfigJson>; if (typeof parsed.projectId === 'string' && parsed.projectId.trim() && typeof parsed.firestoreDatabaseId === 'string' && parsed.firestoreDatabaseId.trim()) { return { projectId: parsed.projectId.trim(), firestoreDatabaseId: parsed.firestoreDatabaseId.trim(), apiKey: parsed.apiKey, authDomain: parsed.authDomain }; } } catch { /* Fallback to provisioned project & database constants */ }
  return { projectId: 'gen-lang-client-0713157837', firestoreDatabaseId: 'ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a' }; } const AUTHORITATIVE_FIREBASE_CONFIG = loadAuthoritativeFirebaseConfig(); export const EXPECTED_FIREBASE_PROJECT_ID = 'gen-lang-client-0713157837'; export const EXPECTED_FIRESTORE_DATABASE_ID = 'ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a'; export const AUTHORITATIVE_FIREBASE_PROJECT_ID = EXPECTED_FIREBASE_PROJECT_ID; export const AUTHORITATIVE_FIRESTORE_DATABASE_ID = EXPECTED_FIRESTORE_DATABASE_ID; export const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = PRIMARY_BOOTSTRAP_ADMIN_EMAIL; export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096; export interface ValidatedServerConfig { port: number; appUrl: string | null; geminiApiKey: string | null; geminiModel: string; geminiConfigured: boolean; telegramBotToken: string | null; telegramChannelId: string | null; telegramConfigured: boolean;
  telegramWebhookSecret: string | null; adminEmail: string; adminApiSecret: string | null; firebaseProjectId: string; firestoreDatabaseId: string; } export function isPlaceholderValue(val: string | undefined): boolean { if (!val) return true; const trimmed = val.trim(); if (!trimmed) return true; const upper = trimmed.toUpperCase(); return ( upper.startsWith('MY_') || upper.startsWith('YOUR_') || upper === 'PLACEHOLDER' || upper === 'TODO' || upper === 'CHANGEME' || upper === 'UNDEFINED' || upper === 'NULL' ); } export function isPrivateOrReservedIpLiteral(host: string): boolean { const clean = host.trim().toLowerCase().replace(/^\[|\]$/g, ''); if ( clean === 'localhost' || clean.endsWith('.localhost') || clean.endsWith('.local') || clean.endsWith('.internal') ||
    clean === '0.0.0.0' || clean === '::1' || clean === '::' || /^fe[89ab][0-9a-f]:/i.test(clean) || /^f[cd][0-9a-f]{2}:/i.test(clean) || clean === 'metadata.google.internal'
  ) { return true; }
  if (clean.startsWith('::ffff:')) {
    const v4Part = clean.slice(7);
    const hexMatch = v4Part.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16); const lo = parseInt(hexMatch[2], 16);
      return isPrivateOrReservedIpLiteral(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
    return isPrivateOrReservedIpLiteral(v4Part);
  }
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if (ipv4Match) { const octets = [Number(ipv4Match[1]), Number(ipv4Match[2]), Number(ipv4Match[3]), Number(ipv4Match[4])]; if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true; const [a, b, c] = octets; if ( a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || a >= 224
    ) { return true; } } return false; } export function validateObjectStorageEndpoint( rawUrl: string | undefined, isProduction = false, ): { valid: boolean; normalizedUrl: string | null; reason?: string } { if (!rawUrl || isPlaceholderValue(rawUrl)) return { valid: true, normalizedUrl: null }; try { const parsed = new URL(rawUrl.trim()); if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') { return { valid: false, normalizedUrl: null, reason: 'UNSUPPORTED_PROTOCOL' }; }
    if (isProduction && parsed.protocol !== 'https:') { return { valid: false, normalizedUrl: null, reason: 'HTTPS_REQUIRED_IN_PRODUCTION' }; }
    if (parsed.username || parsed.password) { return { valid: false, normalizedUrl: null, reason: 'CREDENTIALS_IN_URL_FORBIDDEN' }; }
    if (parsed.search || parsed.hash) { return { valid: false, normalizedUrl: null, reason: 'QUERY_OR_HASH_IN_ENDPOINT_FORBIDDEN' }; }
    const host = parsed.hostname.toLowerCase(); if (!host || isPrivateOrReservedIpLiteral(host)) { return { valid: false, normalizedUrl: null, reason: 'FORBIDDEN_PRIVATE_OR_LOOPBACK_HOST' }; }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) { return { valid: false, normalizedUrl: null, reason: 'RAW_IP_STORAGE_ENDPOINT_FORBIDDEN' }; }
    if (parsed.port && !['443', '80', '9000'].includes(parsed.port)) { return { valid: false, normalizedUrl: null, reason: 'NON_STANDARD_STORAGE_PORT_FORBIDDEN' }; }
    return { valid: true, normalizedUrl: parsed.origin + parsed.pathname.replace(/\/+$/, '') }; } catch { return { valid: false, normalizedUrl: null, reason: 'MALFORMED_STORAGE_ENDPOINT_URL' }; } }
export async function validateStorageEndpointDnsResolution( endpointUrl: string, isProduction = false, customResolver?: (hostname: string) => Promise<string[]>, ): Promise<{ valid: boolean; safe: boolean; resolvedAddresses: string[]; reason?: string }> {
  const candidateUrl = endpointUrl.includes('://') ? endpointUrl : `https://${endpointUrl}`;
  const staticCheck = validateObjectStorageEndpoint(candidateUrl, isProduction); if (!staticCheck.valid || !staticCheck.normalizedUrl) { return { valid: false, safe: false, resolvedAddresses: [], reason: staticCheck.reason || 'INVALID_ENDPOINT' }; }
  const hostname = new URL(staticCheck.normalizedUrl).hostname; try { let addresses: string[] = []; if (customResolver) {
      addresses = await customResolver(hostname); } else { const [v4, v6] = await Promise.all([
        dns.promises.resolve4(hostname).catch(() => [] as string[]),
        dns.promises.resolve6(hostname).catch(() => [] as string[]),
      ]);
      addresses = [...v4, ...v6];
    }
    if (addresses.length === 0) return { valid: false, safe: false, resolvedAddresses: [], reason: 'DNS_NO_RECORDS_FOUND' };
    for (const addr of addresses) {
      if (isPrivateOrReservedIpLiteral(addr)) {
        return { valid: false, safe: false, resolvedAddresses: addresses, reason: 'DNS_RESOLVED_TO_PROHIBITED_ADDRESS' };
      }
    }
    return { valid: true, safe: true, resolvedAddresses: addresses };
  } catch {
    return { valid: false, safe: false, resolvedAddresses: [], reason: 'DNS_RESOLUTION_FAILED' };
  }
}
export async function validateOutboundUrlAndResolveDns(
  rawUrl: string,
  customResolver?: (hostname: string) => Promise<string[]>,
): Promise<{ allowed: boolean; valid: boolean; resolvedAddresses: string[]; reason?: string }> {
  const res = await validateStorageEndpointDnsResolution(rawUrl, false, customResolver);
  return { allowed: res.valid, valid: res.valid, resolvedAddresses: res.resolvedAddresses, reason: res.reason };
}
export function resolveAllowedViteDevHosts(env: Record<string, string | undefined> = process.env): string[] {
  const safeEnv = env && typeof env === 'object' ? env : (typeof process !== 'undefined' && process.env ? process.env : {});
  const allowed = new Set<string>(['localhost', '127.0.0.1']);
  const addHost = (candidate: string, sourceName: string) => {
    const trimmed = String(candidate ?? '').trim().toLowerCase();
    if (!trimmed) return;
    if (
      trimmed === 'true' || trimmed === '*' || trimmed.includes('*') ||
      trimmed.startsWith('.') || trimmed.endsWith('.') ||
      /[\\/\s:@?#]/.test(trimmed) || !/^[a-z0-9.-]+$/.test(trimmed)
    ) {
      throw new Error(`[ServerConfigValidator] Invalid or wildcard host in ${sourceName}: "${trimmed.slice(0, 40)}"`);
    }
    allowed.add(trimmed);
  };
  if (typeof safeEnv.APP_URL === 'string' && !isPlaceholderValue(safeEnv.APP_URL)) {
    try { addHost(new URL(safeEnv.APP_URL.trim()).hostname, 'APP_URL'); } catch { /* handled */ }
  }
  const extraHosts = safeEnv.VITE_ALLOWED_HOSTS || safeEnv.VITE_DEV_ALLOWED_HOSTS;
  if (typeof extraHosts === 'string' && !isPlaceholderValue(extraHosts)) {
    for (const part of extraHosts.split(',')) addHost(part, 'VITE_ALLOWED_HOSTS');
  }
  return Array.from(allowed);
}
export interface ServerHttpTimeouts {
  keepAliveTimeoutMs: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  maxRequestsPerSocket: number;
}
export function resolveServerHttpTimeouts(env: Record<string, string | undefined> = process.env): ServerHttpTimeouts {
  const parseTimeout = (raw: string | undefined, defaultMs: number, minMs: number, maxMs: number, name: string): number => {
    if (raw === undefined || raw.trim() === '') return defaultMs;
    const num = Number(raw.trim());
    if (!Number.isInteger(num) || num < minMs || num > maxMs) {
      throw new Error(`[ServerConfigValidator] Invalid ${name}: must be an integer between ${minMs} and ${maxMs} ms.`);
    }
    return num;
  };
  const keepAliveTimeoutMs = parseTimeout(env.SERVER_KEEP_ALIVE_TIMEOUT_MS, 65_000, 5_000, 120_000, 'SERVER_KEEP_ALIVE_TIMEOUT_MS');
  const defaultHeadersTimeout = Math.min(130_000, keepAliveTimeoutMs + 5_000);
  const headersTimeoutMs = parseTimeout(env.SERVER_HEADERS_TIMEOUT_MS, defaultHeadersTimeout, 10_000, 130_000, 'SERVER_HEADERS_TIMEOUT_MS');
  const requestTimeoutMs = parseTimeout(env.SERVER_REQUEST_TIMEOUT_MS, 30_000, 5_000, 120_000, 'SERVER_REQUEST_TIMEOUT_MS');
  if (headersTimeoutMs < keepAliveTimeoutMs + 1_000) {
    throw new Error(`[ServerConfigValidator] Invalid HTTP timeouts: SERVER_HEADERS_TIMEOUT_MS (${headersTimeoutMs}) must exceed SERVER_KEEP_ALIVE_TIMEOUT_MS (${keepAliveTimeoutMs}) by >= 1000ms.`);
  }
  return { keepAliveTimeoutMs, headersTimeoutMs, requestTimeoutMs, maxRequestsPerSocket: 1000 };
}
export function getValidatedServerConfig(env: Record<string, string | undefined> = process.env): ValidatedServerConfig {
  const rawPort = Number(env.PORT);
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 3000;
  let appUrl: string | null = null;
  if (!isPlaceholderValue(env.APP_URL)) {
    try {
      const parsed = new URL(env.APP_URL!.trim());
      const host = parsed.hostname.toLowerCase();
      const isForbiddenHost = host === '169.254.169.254' || host === 'metadata.google.internal' || (env.NODE_ENV === 'production' && isPrivateOrReservedIpLiteral(host));
      const isAllowedProto = parsed.protocol === 'https:' || (env.NODE_ENV !== 'production' && parsed.protocol === 'http:');
      if (isAllowedProto && !isForbiddenHost && !parsed.username && !parsed.password) {
        appUrl = parsed.origin;
      }
    } catch { appUrl = null; }
  }
  const rawGemini = env.GEMINI_API_KEY?.trim();
  const geminiApiKey = !isPlaceholderValue(rawGemini) && rawGemini!.length >= 20 ? rawGemini! : null;
  const geminiModel = env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const rawBotToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const telegramBotToken = !isPlaceholderValue(rawBotToken) && /^\d{6,15}:[A-Za-z0-9_-]{20,64}$/.test(rawBotToken!) ? rawBotToken! : null;
  const rawChannelId = env.TELEGRAM_CHANNEL_ID?.trim();
  const telegramChannelId = !isPlaceholderValue(rawChannelId) && /^(@[A-Za-z0-9_]{4,64}|-100\d{6,20})$/.test(rawChannelId!) ? rawChannelId! : null;
  const rawWebhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const telegramWebhookSecret = !isPlaceholderValue(rawWebhookSecret) && rawWebhookSecret!.length >= 16 ? rawWebhookSecret! : null;
  const rawAdminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminEmail = !isPlaceholderValue(rawAdminEmail) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawAdminEmail!) ? rawAdminEmail! : DEFAULT_BOOTSTRAP_ADMIN_EMAIL;
  const rawAdminSecret = env.ADMIN_API_SECRET?.trim();
  const adminApiSecret = !isPlaceholderValue(rawAdminSecret) && rawAdminSecret!.length >= 16 ? rawAdminSecret! : null;
  const rawProjectId = env.FIREBASE_PROJECT_ID?.trim();
  const firebaseProjectId = !isPlaceholderValue(rawProjectId) && /^[a-z0-9-]{6,40}$/.test(rawProjectId!) ? rawProjectId! : EXPECTED_FIREBASE_PROJECT_ID;
  const rawDatabaseId = env.FIRESTORE_DATABASE_ID?.trim();
  const firestoreDatabaseId = !isPlaceholderValue(rawDatabaseId) && /^[a-z0-9()-]{4,64}$/.test(rawDatabaseId!) ? rawDatabaseId! : EXPECTED_FIRESTORE_DATABASE_ID;
  return {
    port, appUrl, geminiApiKey, geminiModel, geminiConfigured: Boolean(geminiApiKey),
    telegramBotToken, telegramChannelId, telegramConfigured: Boolean(telegramBotToken && telegramChannelId),
    telegramWebhookSecret, adminEmail, adminApiSecret, firebaseProjectId, firestoreDatabaseId,
  };
}
export function validateStartupConfigurationOrThrow(env: Record<string, string | undefined> = process.env): ValidatedServerConfig {
  const isProd = env.NODE_ENV === 'production';
  const errors: string[] = [];
  if (env.PORT !== undefined && env.PORT.trim() !== '') {
    const p = Number(env.PORT);
    if (!Number.isInteger(p) || p < 1 || p > 65535) errors.push('PORT must be an integer between 1 and 65535.');
  }
  const allowExplicitOverride = env.ALLOW_FIREBASE_ENV_OVERRIDE === 'true';
  const isEmulatorActive = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  if (isProd && isEmulatorActive) errors.push('EMULATOR_FORBIDDEN_IN_PRODUCTION: Firebase Emulators cannot be enabled when NODE_ENV=production.');
  const rawProjectId = env.FIREBASE_PROJECT_ID?.trim();
  const rawDbId = env.FIRESTORE_DATABASE_ID?.trim();
  if (rawProjectId !== undefined && !isPlaceholderValue(rawProjectId)) {
    if (!/^[a-z0-9-]{6,40}$/.test(rawProjectId)) errors.push('FIREBASE_PROJECT_ID has an invalid format.');
    else if (rawProjectId !== EXPECTED_FIREBASE_PROJECT_ID && !allowExplicitOverride && !isEmulatorActive) {
      errors.push(`FIREBASE_PROJECT_ID_MISMATCH: (${rawProjectId}) vs (${EXPECTED_FIREBASE_PROJECT_ID}).`);
    }
  }
  if (rawDbId !== undefined && !isPlaceholderValue(rawDbId)) {
    if (!/^[a-z0-9()-]{4,64}$/.test(rawDbId)) errors.push('FIRESTORE_DATABASE_ID has an invalid format.');
    else if (rawDbId !== EXPECTED_FIRESTORE_DATABASE_ID && !allowExplicitOverride) {
      errors.push(`FIRESTORE_DATABASE_ID_MISMATCH: (${rawDbId}) vs (${EXPECTED_FIRESTORE_DATABASE_ID}).`);
    }
  }
  if (allowExplicitOverride && ((rawProjectId && !rawDbId) || (!rawProjectId && rawDbId))) {
    errors.push('INCOMPLETE_FIREBASE_ENV_OVERRIDE: Both FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID must be configured.');
  }
  if (isProd) {
    if (!env.APP_URL || isPlaceholderValue(env.APP_URL)) {
      errors.push('PRODUCTION_APP_URL_REQUIRED: APP_URL must be explicitly configured in production.');
    } else {
      try {
        const parsedAppUrl = new URL(env.APP_URL.trim());
        if (parsedAppUrl.protocol !== 'https:' || parsedAppUrl.username || parsedAppUrl.password) {
          errors.push('PRODUCTION_HTTPS_APP_URL_REQUIRED: APP_URL must use https:// without embedded credentials.');
        }
      } catch { errors.push('PRODUCTION_APP_URL_INVALID: APP_URL is not a valid URL.'); }
    }
  }
  const endpointCheck = validateObjectStorageEndpoint(env.OBJECT_STORAGE_ENDPOINT, isProd);
  if (!endpointCheck.valid) errors.push(`OBJECT_STORAGE_ENDPOINT invalid: ${endpointCheck.reason}`);
  if (isProd && Boolean(endpointCheck.normalizedUrl) && (isPlaceholderValue(env.OBJECT_STORAGE_ACCESS_KEY) || isPlaceholderValue(env.OBJECT_STORAGE_SECRET_KEY))) {
    errors.push('OBJECT_STORAGE_CREDENTIALS_MISSING: Remote OBJECT_STORAGE_ENDPOINT requires access and secret keys in production.');
  }
  if (env.ADMIN_API_SECRET && !isPlaceholderValue(env.ADMIN_API_SECRET)) {
    const trimmed = env.ADMIN_API_SECRET.trim();
    if (trimmed.length < 16 || trimmed === 'admin1404' || trimmed === 'password' || trimmed === '1234567890123456') {
      errors.push('ADMIN_API_SECRET must be at least 16 characters and not a weak default.');
    }
  }
  if (env.BACKUP_ENCRYPTION_KEY && !isPlaceholderValue(env.BACKUP_ENCRYPTION_KEY) && env.BACKUP_ENCRYPTION_KEY.trim().length < 32) {
    errors.push('BACKUP_ENCRYPTION_KEY must be at least 32 characters when configured.');
  }
  const instanceCount = Number(env.INSTANCE_COUNT || '1');
  const topology = (env.DEPLOYMENT_TOPOLOGY || 'single_instance').trim().toLowerCase();
  if (((Number.isFinite(instanceCount) && instanceCount > 1) || topology === 'multi_instance') && env.SHARED_SECURITY_STATE_BACKEND !== 'firestore') {
    errors.push('UNSUPPORTED_MULTI_INSTANCE_TOPOLOGY: Requires single_instance topology unless SHARED_SECURITY_STATE_BACKEND=firestore.');
  }
  try {
    resolveServerHttpTimeouts(env);
    resolveAllowedViteDevHosts(env);
  } catch (err: any) {
    errors.push(err?.message || 'HTTP timeout or Vite allowedHosts validation failed.');
  }
  if (errors.length > 0) throw new Error(`[ServerConfigValidator] Startup configuration invalid:\n- ${errors.join('\n- ')}`);
  return getValidatedServerConfig(env);
}
export function validateProductionStartupConfiguration(env: Record<string, string | undefined> = process.env): { valid: boolean; errors: string[] } {
  try { validateStartupConfigurationOrThrow(env); return { valid: true, errors: [] }; } catch (err: any) { return { valid: false, errors: [String(err?.message || 'Startup validation failed')] }; }
}
export function resolveEnvironmentProfile(env: Record<string, string | undefined> = process.env): 'production' | 'staging' | 'test' | 'development' {
  const raw = (env.NODE_ENV || 'development').trim().toLowerCase();
  if (raw === 'production' || raw === 'staging' || raw === 'test') return raw;
  return 'development';
}
export function assertSafeTestEnvironment(env: Record<string, string | undefined> = process.env): { safe: boolean; reason?: string } {
  if (env.NODE_ENV === 'production') return { safe: false, reason: 'PRODUCTION_ENV_FORBIDDEN_IN_TEST' };
  if (env.APP_URL && /^https:\/\/radartehran\.ir/i.test(env.APP_URL)) return { safe: false, reason: 'PROD_APP_URL_IN_TEST' };
  return { safe: true };
}
export function createDeterministicTestId(prefix: string, seedText: string): string {
  const hash = crypto.createHash('sha256').update(`${prefix}:${seedText}`).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}
export function detectEnvironmentConfigDrift(env: Record<string, string | undefined> = process.env, clientConfig?: { projectId?: string; firestoreDatabaseId?: string }): { valid: boolean; drifts: string[] } {
  const drifts: string[] = []; const isProd = env.NODE_ENV === 'production';
  if (isProd && (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)) drifts.push('EMULATOR_LEAK_IN_PRODUCTION');
  if (isProd && env.APP_URL && !env.APP_URL.trim().startsWith('https://')) drifts.push('INSECURE_APP_URL_IN_PRODUCTION');
  if (!isPlaceholderValue(env.CASPER_HUB_URL) && !env.CASPER_HUB_URL!.trim().startsWith('https://')) drifts.push('INSECURE_CASPER_HUB_URL');
  if (clientConfig?.projectId && clientConfig.projectId !== EXPECTED_FIREBASE_PROJECT_ID) drifts.push('FIREBASE_PROJECT_ID_DRIFT');
  if (clientConfig?.firestoreDatabaseId && clientConfig.firestoreDatabaseId !== EXPECTED_FIRESTORE_DATABASE_ID) drifts.push('FIRESTORE_DATABASE_ID_DRIFT');
  if (!isPlaceholderValue(env.OBJECT_STORAGE_ACCESS_KEY) !== !isPlaceholderValue(env.OBJECT_STORAGE_SECRET_KEY)) drifts.push('PARTIAL_OBJECT_STORAGE_S3_CONFIG');
  if (!isPlaceholderValue(env.TELEGRAM_BOT_TOKEN) !== !isPlaceholderValue(env.TELEGRAM_CHANNEL_ID)) drifts.push('PARTIAL_TELEGRAM_CONFIG');
  if (!isPlaceholderValue(env.CASPER_HUB_URL)) {
    try {
      const u = new URL(env.CASPER_HUB_URL!.trim());
      if (u.protocol !== 'https:' || u.username || u.password || u.hostname.toLowerCase() !== 'casper-hub-api.bijanbijane-1.workers.dev') drifts.push('INVALID_CASPER_HUB_URL');
    } catch { drifts.push('INVALID_CASPER_HUB_URL'); }
  }
  return { valid: drifts.length === 0, drifts };
}
export function buildOpenApiSpecification(baseUrl = 'http://localhost:3000', areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of API_ENDPOINT_CONTRACTS) {
    if (!paths[ep.path]) paths[ep.path] = {};
    const xAuthLevel = ep.adminOnly ? 'admin_only' : ep.authRequired ? 'verified_firebase_user' : 'public';
    paths[ep.path][ep.method.toLowerCase()] = {
      summary: ep.summary,
      'x-access-policy': ep.accessPolicy, 'x-auth-level': xAuthLevel, 'x-rate-limit-per-minute': ep.rateLimitPerMinute, security: ep.authRequired ? [{ BearerAuth: [] }] : [], responses: { '200': { description: 'Successful operation' }, '400': { description: 'Validation error' }, ...(ep.authRequired ? { '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } : {}), '404': { description: 'Route or resource not found' }, '429': { description: 'Rate limit exceeded' }, }, }; } return { openapi: '3.1.0', info: { title: 'Tehran & Multi-City Housing Radar API', version: '3.2.0', description: 'Authoritative API contract for Tehran Housing Radar (رادار هوشمند مسکن)', 'x-display-area-unit': formatAreaUnitLabel(areaUnit), 'x-reference-valuation-intl': formatMillionTomanAsIntlCurrency(120, intlCurrency, 'en') }, servers: [{ url: baseUrl }], paths, }; }
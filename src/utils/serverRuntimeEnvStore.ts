/**
 * @file src/utils/serverRuntimeEnvStore.ts
 * @description In-memory & disk-persisted (`.runtime-config.json`) store for the 15 server runtime
 * environment variables. Supports live Admin overrides without server restart and masks secrets.
 */

import fs from 'fs';
import path from 'path';
import { clampNumber, sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export type RuntimeEnvKey =
  | 'GEMINI_MODEL'
  | 'TELEGRAM_BOT_TOKEN'
  | 'TELEGRAM_CHANNEL_ID'
  | 'FIREBASE_PROJECT_ID'
  | 'ADMIN_EMAIL'
  | 'ADMIN_API_SECRET'
  | 'OBJECT_STORAGE_PROVIDER'
  | 'OBJECT_STORAGE_ENDPOINT'
  | 'OBJECT_STORAGE_BUCKET'
  | 'OBJECT_STORAGE_REGION'
  | 'OBJECT_STORAGE_ACCESS_KEY'
  | 'OBJECT_STORAGE_SECRET_KEY'
  | 'OBJECT_STORAGE_PUBLIC_BASE_URL'
  | 'OBJECT_STORAGE_MAX_IMAGE_MB'
  | 'OBJECT_STORAGE_MAX_VIDEO_MB';

export const RUNTIME_ENV_KEYS: readonly RuntimeEnvKey[] = [
  'GEMINI_MODEL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHANNEL_ID',
  'FIREBASE_PROJECT_ID',
  'ADMIN_EMAIL',
  'ADMIN_API_SECRET',
  'OBJECT_STORAGE_PROVIDER',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_ACCESS_KEY',
  'OBJECT_STORAGE_SECRET_KEY',
  'OBJECT_STORAGE_PUBLIC_BASE_URL',
  'OBJECT_STORAGE_MAX_IMAGE_MB',
  'OBJECT_STORAGE_MAX_VIDEO_MB',
];

export const SECRET_ENV_KEYS = new Set<RuntimeEnvKey>([
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_API_SECRET',
  'OBJECT_STORAGE_ACCESS_KEY',
  'OBJECT_STORAGE_SECRET_KEY',
]);

export interface ServerRuntimeEnvConfig {
  GEMINI_MODEL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHANNEL_ID: string;
  FIREBASE_PROJECT_ID: string;
  ADMIN_EMAIL: string;
  ADMIN_API_SECRET: string;
  OBJECT_STORAGE_PROVIDER: string;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_ACCESS_KEY: string;
  OBJECT_STORAGE_SECRET_KEY: string;
  OBJECT_STORAGE_PUBLIC_BASE_URL: string;
  OBJECT_STORAGE_MAX_IMAGE_MB: number;
  OBJECT_STORAGE_MAX_VIDEO_MB: number;
}

export interface AdminMaskedEnvField {
  key: RuntimeEnvKey;
  value: string | number;
  isSecret: boolean;
  isConfigured: boolean;
  labelFa?: string;
}

export type AdminSafeEnvFieldView = AdminMaskedEnvField;

const RUNTIME_CONFIG_PATH = path.join(process.cwd(), '.runtime-config.json');
const RUNTIME_CONFIG_TMP_PATH = path.join(process.cwd(), '.runtime-config.json.tmp');

const runtimeOverrides: Partial<Record<RuntimeEnvKey, string>> = {};
let lastUpdatedAtIso: string | null = null;
let diskLoaded = false;
let pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeWriteMutexChain: Promise<void> = Promise.resolve();

function ensureDiskOverridesLoaded(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    if (!fs.existsSync(RUNTIME_CONFIG_PATH)) return;
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const values = parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed;
      for (const key of RUNTIME_ENV_KEYS) {
        // Never hydrate secret credentials from disk; secrets must come from environment variables or live in-memory session overrides.
        if (SECRET_ENV_KEYS.has(key)) continue;
        if (typeof values[key] === 'string' || typeof values[key] === 'number') {
          const strVal = String(values[key]).trim();
          if (strVal.length > 0) {
            if ((key === 'OBJECT_STORAGE_ENDPOINT' || key === 'OBJECT_STORAGE_PUBLIC_BASE_URL') && !isSafeHttpsStorageUrl(strVal)) continue;
            runtimeOverrides[key] = strVal;
            process.env[key] = strVal;
          }
        }
      }
      if (typeof parsed.updatedAtIso === 'string') lastUpdatedAtIso = parsed.updatedAtIso;
    }
  } catch {
    // Ignore missing or unreadable initial runtime config
  }
}

function scheduleAsyncDiskPersist(): void {
  if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null;
    runtimeWriteMutexChain = runtimeWriteMutexChain.catch(() => {}).then(async () => {
      const tmpPath = `${RUNTIME_CONFIG_TMP_PATH}.${process.pid}.${Date.now()}`;
      try {
        const nonSecretValues: Partial<Record<RuntimeEnvKey, string>> = {};
        for (const key of RUNTIME_ENV_KEYS) {
          if (SECRET_ENV_KEYS.has(key)) continue;
          if (runtimeOverrides[key] !== undefined) nonSecretValues[key] = runtimeOverrides[key];
        }
        const payload = JSON.stringify({ updatedAtIso: lastUpdatedAtIso, values: nonSecretValues }, null, 2);
        await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf-8', mode: 0o600 });
        await fs.promises.rename(tmpPath, RUNTIME_CONFIG_PATH);
        await fs.promises.chmod(RUNTIME_CONFIG_PATH, 0o600).catch(() => {});
      } catch {
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    });
  }, 150);
}

/** Masks a sensitive credential showing `••••••••` plus the last 4 characters when configured. */
export function maskSecretValue(secret: string): string {
  const clean = (secret || '').trim();
  if (!clean) return '';
  return clean.length <= 4 ? '••••••••' : `••••••••${clean.slice(-4)}`;
}

/** Resolves the effective 15 runtime environment variables, combining `process.env` with live Admin overrides. */
export function getRuntimeEnvConfig(
  env: Record<string, string | undefined> = process.env
): ServerRuntimeEnvConfig {
  ensureDiskOverridesLoaded();
  const isDefaultProcessEnv = env === process.env;
  const pick = (key: RuntimeEnvKey, fallback: string): string => {
    if (isDefaultProcessEnv && runtimeOverrides[key] !== undefined) return runtimeOverrides[key]!;
    const raw = env[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : fallback;
  };

  const bucket =
    pick('OBJECT_STORAGE_BUCKET', 'tehran-housing-radar-media').replace(/[^a-zA-Z0-9._-]/g, '') ||
    'tehran-housing-radar-media';
  const region = pick('OBJECT_STORAGE_REGION', 'ir-thr-at1');

  return {
    GEMINI_MODEL: pick('GEMINI_MODEL', 'gemini-2.5-flash'),
    TELEGRAM_BOT_TOKEN: pick('TELEGRAM_BOT_TOKEN', ''),
    TELEGRAM_CHANNEL_ID: pick('TELEGRAM_CHANNEL_ID', ''),
    FIREBASE_PROJECT_ID: pick('FIREBASE_PROJECT_ID', 'gen-lang-client-0713157837'),
    ADMIN_EMAIL: pick('ADMIN_EMAIL', 'radio837isf@gmail.com').toLowerCase(),
    ADMIN_API_SECRET: pick('ADMIN_API_SECRET', ''),
    OBJECT_STORAGE_PROVIDER: pick('OBJECT_STORAGE_PROVIDER', 'arvan').toLowerCase(),
    OBJECT_STORAGE_ENDPOINT: pick('OBJECT_STORAGE_ENDPOINT', 'https://s3.ir-thr-at1.arvanstorage.ir'),
    OBJECT_STORAGE_BUCKET: bucket,
    OBJECT_STORAGE_REGION: region,
    OBJECT_STORAGE_ACCESS_KEY: pick('OBJECT_STORAGE_ACCESS_KEY', ''),
    OBJECT_STORAGE_SECRET_KEY: pick('OBJECT_STORAGE_SECRET_KEY', ''),
    OBJECT_STORAGE_PUBLIC_BASE_URL: pick(
      'OBJECT_STORAGE_PUBLIC_BASE_URL',
      `https://${bucket}.s3.${region}.arvanstorage.ir`
    ),
    OBJECT_STORAGE_MAX_IMAGE_MB: clampNumber(pick('OBJECT_STORAGE_MAX_IMAGE_MB', '5'), 1, 50, 5),
    OBJECT_STORAGE_MAX_VIDEO_MB: clampNumber(pick('OBJECT_STORAGE_MAX_VIDEO_MB', '50'), 5, 50, 50),
  };
}

/** Returns the masked, client-safe view of all 15 variables for the Admin Modal UI. */
export function getAdminSafeRuntimeConfigView(areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD', referenceValuationMillionToman = 10000) {
  const current = getRuntimeEnvConfig(process.env);
  const fields = {} as Record<RuntimeEnvKey, AdminMaskedEnvField>;
  const fieldList: AdminMaskedEnvField[] = [];
  const values = {} as Record<RuntimeEnvKey, string | number>;

  for (const key of RUNTIME_ENV_KEYS) {
    const rawVal = current[key];
    const isSecret = SECRET_ENV_KEYS.has(key);
    const isConfigured =
      typeof rawVal === 'number' ? Number.isFinite(rawVal) && rawVal > 0 : rawVal.trim().length > 0;
    const maskedOrPlain = isSecret ? maskSecretValue(String(rawVal)) : rawVal;
    const entry: AdminMaskedEnvField = { key, value: maskedOrPlain, isSecret, isConfigured };
    fields[key] = entry;
    fieldList.push(entry);
    values[key] = maskedOrPlain;
  }

  const providerNorm = current.OBJECT_STORAGE_PROVIDER === 'arvan' ? 'arvancloud' : current.OBJECT_STORAGE_PROVIDER;
  return {
    status: 'ok' as const, updatedAtIso: lastUpdatedAtIso, lastUpdatedIso: lastUpdatedAtIso, values, fields, fieldList,
    gemini: { configured: Boolean((process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim()), model: current.GEMINI_MODEL || 'gemini-2.5-flash', deploymentManaged: true },
    telegram: { botTokenConfigured: Boolean(current.TELEGRAM_BOT_TOKEN.trim()), channelId: current.TELEGRAM_CHANNEL_ID || '', deploymentManagedToken: true },
    firebase: { projectId: current.FIREBASE_PROJECT_ID || 'gen-lang-client-0713157837', firestoreDatabaseId: (process.env.FIRESTORE_DATABASE_ID || 'ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a').trim(), adminEmail: current.ADMIN_EMAIL || 'radio837isf@gmail.com', adminSecretConfigured: Boolean(current.ADMIN_API_SECRET.trim()), deploymentManaged: true },
    objectStorage: { provider: providerNorm as any, endpoint: current.OBJECT_STORAGE_ENDPOINT || 'https://s3.ir-thr-at1.arvanstorage.ir', bucket: current.OBJECT_STORAGE_BUCKET || 'tehran-housing-radar-media', region: current.OBJECT_STORAGE_REGION || 'ir-thr-at1', accessKeyConfigured: Boolean(current.OBJECT_STORAGE_ACCESS_KEY.trim()), secretKeyConfigured: Boolean(current.OBJECT_STORAGE_SECRET_KEY.trim()), publicBaseUrl: current.OBJECT_STORAGE_PUBLIC_BASE_URL || '', maxImageMb: current.OBJECT_STORAGE_MAX_IMAGE_MB || 5, maxVideoMb: current.OBJECT_STORAGE_MAX_VIDEO_MB || 50, deploymentManagedCredentials: true },
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en'),
  };
}

export function isSafeHttpsStorageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && h.includes('.') && !h.includes(':') && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && !/(^localhost$|\.(local|internal|localhost)$)/i.test(h);
  } catch { return false; }
}

/** Updates the runtime environment variables from an authenticated Admin request and persists atomically. */
export function updateRuntimeEnvConfig(incomingRaw: Record<string, unknown>): {
  updatedKeys: RuntimeEnvKey[];
  view: ReturnType<typeof getAdminSafeRuntimeConfigView>;
} {
  ensureDiskOverridesLoaded();
  const incoming =
    incomingRaw && typeof incomingRaw.values === 'object' && incomingRaw.values !== null && !Array.isArray(incomingRaw.values)
      ? (incomingRaw.values as Record<string, unknown>)
      : incomingRaw;
  const updatedKeys: RuntimeEnvKey[] = [];

  for (const key of RUNTIME_ENV_KEYS) {
    if (!(key in incoming)) continue;
    const rawVal = incoming[key];
    if (rawVal === undefined || rawVal === null) continue;

    if (rawVal === '__CLEAR__') {
      delete runtimeOverrides[key]; process.env[key] = ''; updatedKeys.push(key);
      continue;
    }

    if (SECRET_ENV_KEYS.has(key)) {
      const strSecret = typeof rawVal === 'string' ? rawVal.trim() : '';
      if (!strSecret || strSecret.includes('••••')) continue;
      const cleanSecret = sanitizeInput(strSecret, 256);
      runtimeOverrides[key] = cleanSecret; process.env[key] = cleanSecret; updatedKeys.push(key);
      continue;
    }

    if (key === 'OBJECT_STORAGE_MAX_IMAGE_MB' || key === 'OBJECT_STORAGE_MAX_VIDEO_MB') {
      const isImg = key === 'OBJECT_STORAGE_MAX_IMAGE_MB';
      const mb = clampNumber(rawVal, isImg ? 1 : 5, 50, isImg ? 5 : 50);
      runtimeOverrides[key] = String(mb); process.env[key] = String(mb); updatedKeys.push(key);
      continue;
    }

    const cleanStr = sanitizeInput(String(rawVal).trim(), 240);
    if (cleanStr.length > 0) {
      if (key === 'FIREBASE_PROJECT_ID' && cleanStr !== 'gen-lang-client-0713157837') continue;
      if ((key === 'OBJECT_STORAGE_ENDPOINT' || key === 'OBJECT_STORAGE_PUBLIC_BASE_URL') && !isSafeHttpsStorageUrl(cleanStr)) continue;
      if (key === 'ADMIN_EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanStr)) continue;
      const finalStr = key === 'ADMIN_EMAIL' ? cleanStr.toLowerCase() : cleanStr;
      runtimeOverrides[key] = finalStr; process.env[key] = finalStr; updatedKeys.push(key);
    } else if (typeof rawVal === 'string' && rawVal.trim() === '' && runtimeOverrides[key] !== undefined) {
      delete runtimeOverrides[key]; process.env[key] = ''; updatedKeys.push(key);
    }
  }

  lastUpdatedAtIso = new Date().toISOString();
  scheduleAsyncDiskPersist();
  return { updatedKeys, view: getAdminSafeRuntimeConfigView() };
}

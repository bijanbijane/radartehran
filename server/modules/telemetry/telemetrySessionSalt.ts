/** Server-side session pseudonymization salt — RT-TELEMETRY-CRITICAL-036 */
import crypto from 'node:crypto';

const FALLBACK_DEV_ONLY = '__UNCONFIGURED_TELEMETRY_SALT__';

export function resolveTelemetrySessionHmacSecret(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.TELEMETRY_SESSION_HMAC_SECRET ||
    env.TELEMETRY_DAILY_SALT_SECRET ||
    env.ADMIN_API_SECRET ||
    '';
  if (typeof raw === 'string' && raw.length >= 24 && raw !== FALLBACK_DEV_ONLY) return raw;
  if (env.NODE_ENV === 'test' || env.CI === 'true') {
    return 'test-telemetry-hmac-secret-min-24-chars';
  }
  return FALLBACK_DEV_ONLY;
}

export function deriveDailyTelemetrySalt(dateKey: string, env?: NodeJS.ProcessEnv): string {
  const secret = resolveTelemetrySessionHmacSecret(env);
  return crypto.createHmac('sha256', secret).update(`radar-telemetry-salt:${dateKey}`).digest('hex').slice(0, 32);
}
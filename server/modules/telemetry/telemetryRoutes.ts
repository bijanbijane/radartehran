import type { Express, Request, Response } from 'express';
import { verifyAdminApiAuthorization } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { TELEMETRY_MAX_BATCH_SIZE, TelemetryDataProcessingService } from './telemetryService';
import type { IngestibleTelemetryBatchItem } from './telemetryTypes';
import { formatTelemetryBenchmarkIntl } from './telemetryTypes';

export interface TelemetryModuleOptions {
  service?: TelemetryDataProcessingService;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status: number; message: string }>;
}

const registeredTelemetryApps = new WeakSet<Express>();

async function ensureTelemetryAdminAuthorized(
  req: Request,
  res: Response,
  options?: TelemetryModuleOptions,
): Promise<boolean> {
  if (options?.verifyAdminAuth) {
    const auth = await options.verifyAdminAuth(req);
    if (!auth.ok) {
      res.status(auth.status).json({ status: 'error', code: 'ADMIN_FORBIDDEN', message: auth.message });
      return false;
    }
    return true;
  }
  const fallbackAuth = await verifyAdminApiAuthorization(
    req.headers as Record<string, string | string[] | undefined>,
  );
  if (!fallbackAuth.authorized) {
    res.status(fallbackAuth.statusCode).json({
      status: 'error',
      code: fallbackAuth.reason || 'ADMIN_FORBIDDEN',
      message: 'دسترسی به عیب‌یابی و پاک‌سازی تله‌متری نیازمند احراز هویت مدیر سیستم است.',
    });
    return false;
  }
  return true;
}

/**
 * Express router registration for the Telemetry & Data Processing Module.
 * Provides:
 * - POST /api/v2/telemetry/events (Batch ingestion)
 * - GET  /api/v2/telemetry/aggregates (k-anonymity verified aggregates)
 * - GET  /api/v2/telemetry/diagnostics (Operational error & queue health stats)
 * - POST /api/v2/telemetry/retention/purge (Retention purge trigger)
 */
export function registerTelemetryModuleRoutes(app: Express, options?: TelemetryModuleOptions): void {
  if (registeredTelemetryApps.has(app)) return;
  registeredTelemetryApps.add(app);

  const service = options?.service || new TelemetryDataProcessingService();
  const getClientIp = options?.getClientIp || ((req: Request) => req.ip || '127.0.0.1');
  const checkRateLimit =
    options?.checkRateLimit ||
    ((_ip: string, _bucket: 'general', _max: number, _windowMs: number) => true);

  app.post('/api/v2/telemetry/events', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'general', 120, 60 * 1000)) {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'نرخ ارسال تله‌متری فراتر از حد مجاز است.',
      });
      return;
    }

    const rawBody = (req.body ?? {}) as { events?: IngestibleTelemetryBatchItem[] } | IngestibleTelemetryBatchItem[];
    const items: IngestibleTelemetryBatchItem[] = Array.isArray(rawBody)
      ? rawBody
      : Array.isArray(rawBody.events)
        ? rawBody.events
        : [rawBody as IngestibleTelemetryBatchItem];

    if (items.length > TELEMETRY_MAX_BATCH_SIZE) {
      res.status(413).json({
        status: 'error',
        code: 'TELEMETRY_BATCH_TOO_LARGE',
        message: `حداکثر ${TELEMETRY_MAX_BATCH_SIZE} رویداد در هر درخواست مجاز است.`,
        receivedCount: items.length,
        maxBatchSize: TELEMETRY_MAX_BATCH_SIZE,
      });
      return;
    }

    const outcome = service.ingestBatch(items, {
      clientIp: ip,
      userAgent: String(req.headers['user-agent'] || ''),
      appVersion: String(req.headers['x-app-version'] || '6.0.0'),
    });

    const benchmark = formatTelemetryBenchmarkIntl(100, 'USD', 'sqm');

    res.status(202).json({
      status: 'accepted',
      outcome,
      benchmark,
    });
  });

  app.get('/api/v2/telemetry/aggregates', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    const aggregates = service.getPublicAggregatedMetrics();
    res.status(200).json({
      status: 'ok',
      aggregatesCount: aggregates.length,
      kAnonymityThreshold: 15,
      aggregates,
    });
  });

  app.get('/api/admin/telemetry/aggregates/restricted', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await ensureTelemetryAdminAuthorized(req, res, options))) return;
    res.status(501).json({
      status: 'error',
      code: 'RESTRICTED_AGGREGATE_STORE_NOT_ENABLED',
      message: 'خروجی تجمیع محدود هنوز به مخزن پایدار متصل نشده است.',
    });
  });

  app.get('/api/v2/telemetry/diagnostics', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await ensureTelemetryAdminAuthorized(req, res, options))) return;
    const diagnostics = service.getDiagnostics();
    res.status(200).json({
      status: 'ok',
      diagnostics,
    });
  });

  app.post('/api/v2/telemetry/retention/purge', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await ensureTelemetryAdminAuthorized(req, res, options))) return;
    const retentionDays =
      typeof req.body?.retentionDays === 'number' && req.body.retentionDays >= 1
        ? req.body.retentionDays
        : 30;
    const deletedCount = service.purgeRetention(retentionDays);
    res.status(200).json({
      status: 'ok',
      retentionDays,
      purgedPartitionsCount: deletedCount,
    });
  });
}

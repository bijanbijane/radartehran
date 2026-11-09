import type { Express, Request, Response } from 'express';
import { TelemetryDataProcessingService } from './telemetryService';
import type { IngestibleTelemetryBatchItem } from './telemetryTypes';
import { formatTelemetryBenchmarkIntl } from './telemetryTypes';

export interface TelemetryModuleOptions {
  service?: TelemetryDataProcessingService;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status: number; message: string }>;
}

const registeredTelemetryApps = new WeakSet<Express>();

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

  app.get('/api/v2/telemetry/aggregates', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    const aggregates = service.getAggregatedMetrics();
    res.status(200).json({
      status: 'ok',
      aggregatesCount: aggregates.length,
      aggregates,
    });
  });

  app.get('/api/v2/telemetry/diagnostics', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        res.status(auth.status).json({ status: 'error', code: 'ADMIN_FORBIDDEN', message: auth.message });
        return;
      }
    }
    const diagnostics = service.getDiagnostics();
    res.status(200).json({
      status: 'ok',
      diagnostics,
    });
  });

  app.post('/api/v2/telemetry/retention/purge', async (req: Request, res: Response) => {
    if (options?.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        res.status(auth.status).json({ status: 'error', code: 'ADMIN_FORBIDDEN', message: auth.message });
        return;
      }
    }
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

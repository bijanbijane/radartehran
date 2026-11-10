import type { Express, Request, Response } from 'express';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { detectPromptInjection, sanitizeInput } from '../../utils/security';
import { extractAndResolvePropertySignal } from './aiSeedExtractionService';
import {
  getCanonicalBuildingById,
  mergeDuplicateCanonicalBuildings,
} from './entityResolutionEngine';

export interface AiIngestionRouteSecurityOptions {
  checkRateLimit?: (ip: string, bucket: 'general', maxRequests: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status?: number; message?: string }>;
}

const mountedAiIngestionApps = new WeakSet<Express>();

export function registerAiIngestionRoutes(
  app: Express,
  options?: AiIngestionRouteSecurityOptions,
): void {
  if (mountedAiIngestionApps.has(app)) return;
  mountedAiIngestionApps.add(app);
  const clientIp = (req: Request): string =>
    options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1';

  app.post('/api/v1/ai-ingestion/extract-and-resolve', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 30, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTextFa = typeof body.rawTextFa === 'string' ? sanitizeInput(body.rawTextFa, 2000) : '';
    const cityId = typeof body.cityId === 'string' ? sanitizeInput(body.cityId, 32) : 'tehran';
    const hoodId = typeof body.hoodId === 'number' && Number.isFinite(body.hoodId) ? Math.round(body.hoodId) : 1;

    if (!rawTextFa || rawTextFa.trim().length < 4) {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_SIGNAL_TEXT',
        message: 'متن سیگنال ملکی برای استخراج ویژگی‌ها معتبر نیست.',
      });
      return;
    }

    const injectionCheck = detectPromptInjection(rawTextFa);
    if (injectionCheck.blocked) {
      res.status(422).json({
        status: 'error',
        code: 'PROMPT_INJECTION_DETECTED',
        reason: injectionCheck.reason,
        message: 'متن ورودی حاوی الگوی تزریق دستور غیرمجاز است.',
      });
      return;
    }

    const result = extractAndResolvePropertySignal({
      signalId: typeof body.signalId === 'string' ? sanitizeInput(body.signalId, 64) : undefined,
      cityId,
      hoodId,
      rawTextFa,
      lat: typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : undefined,
      lng: typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : undefined,
      areaSqmHint: typeof body.areaSqmHint === 'number' ? body.areaSqmHint : undefined,
      buildingAgeYearsHint: typeof body.buildingAgeYearsHint === 'number' ? body.buildingAgeYearsHint : undefined,
      floorNumberHint: typeof body.floorNumberHint === 'number' ? body.floorNumberHint : undefined,
      totalFloorsHint: typeof body.totalFloorsHint === 'number' ? body.totalFloorsHint : undefined,
      totalPriceMillionTomanHint:
        typeof body.totalPriceMillionTomanHint === 'number' ? body.totalPriceMillionTomanHint : undefined,
      pricePerSqmMillionTomanHint:
        typeof body.pricePerSqmMillionTomanHint === 'number' ? body.pricePerSqmMillionTomanHint : undefined,
      streetNameHint: typeof body.streetNameHint === 'string' ? sanitizeInput(body.streetNameHint, 120) : undefined,
    });

    res.status(200).json({
      status: 'ok',
      ...result,
      referenceIntlText: formatMillionTomanAsIntlCurrency(result.fact.totalPrice, 'USD'),
    });
  });

  app.post('/api/v1/buildings/merge-duplicates', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 20, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (options?.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        res.status(auth.status ?? 401).json({ status: 'error', code: auth.message || 'ADMIN_AUTH_REQUIRED' });
        return;
      }
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceBuildingId =
      typeof body.sourceBuildingId === 'string' ? sanitizeInput(body.sourceBuildingId, 64) : '';
    const targetBuildingId =
      typeof body.targetBuildingId === 'string' ? sanitizeInput(body.targetBuildingId, 64) : '';

    if (!sourceBuildingId || !targetBuildingId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_BUILDING_IDS',
        message: 'شناسه ساختمان مبدأ و مقصد برای ادغام الزامی است.',
      });
      return;
    }

    const mergeResult = mergeDuplicateCanonicalBuildings(sourceBuildingId, targetBuildingId);
    if (!mergeResult.merged) {
      res.status(404).json({
        status: 'error',
        code: 'MERGE_TARGET_NOT_FOUND',
        message: 'ساختمان مبدأ یا مقصد یافت نشد یا یکسان هستند.',
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      ...mergeResult,
    });
  });

  app.get('/api/v1/buildings/:buildingId/canonical', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    const buildingId = sanitizeInput(String(req.params.buildingId || ''), 64);
    const lookup = getCanonicalBuildingById(buildingId);
    if (!lookup.found) {
      res.status(404).json({
        status: 'error',
        code: 'BUILDING_NOT_FOUND',
        message: 'شناسنامه ساختمان مورد نظر یافت نشد.',
      });
      return;
    }
    res.status(200).json({
      status: 'ok',
      ...lookup,
    });
  });
}

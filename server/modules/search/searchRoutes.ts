import type { Express, Request, Response } from 'express';
import { PropertySearchEngine } from './searchEngine';
import { validateAndSanitizeSearchQuery } from './searchValidator';

export interface PropertySearchRoutesOptions {
  engine?: PropertySearchEngine;
  checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredSearchApps = new WeakSet<Express>();

/**
 * Express router registration for the Property Search and Discovery Module.
 * Provides:
 * - GET  /api/v2/search/properties (Public query-filtered approved property search)
 * - POST /api/v2/search/properties (Structured payload query alternative)
 * - GET  /api/v2/search/metadata   (Search facets and bounds summary)
 */
export function registerPropertySearchRoutes(app: Express, options?: PropertySearchRoutesOptions): void {
  if (registeredSearchApps.has(app)) return;
  registeredSearchApps.add(app);

  const engine = options?.engine || new PropertySearchEngine();
  const getClientIp = options?.getClientIp || ((req: Request) => req.ip || '127.0.0.1');
  const checkRateLimit =
    options?.checkRateLimit ||
    ((_ip: string, _bucket: string, _max: number, _windowMs: number) => true);

  const handleSearch = (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'search', 60, 60 * 1000)) {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'نرخ ارسال درخواست‌های جست‌وجو فراتر از حد مجاز است.',
      });
      return;
    }

    const rawParams = {
      ...req.query,
      ...(req.body || {}),
    };

    const validation = validateAndSanitizeSearchQuery(rawParams);
    if (!validation.valid || !validation.sanitizedParams) {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_SEARCH_PARAMETERS',
        errors: validation.errors,
      });
      return;
    }

    const result = engine.executeSearch(validation.sanitizedParams);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  };

  app.get('/api/v2/search/properties', handleSearch);
  app.post('/api/v2/search/properties', handleSearch);

  app.get('/api/v2/search/metadata', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      status: 'ok',
      supportedSortFields: [
        'relevance',
        'price_asc',
        'price_desc',
        'sqm_asc',
        'sqm_desc',
        'discount_desc',
        'newest',
      ],
      supportedPropertyTypes: ['residential', 'commercial', 'office', 'villa', 'all'],
      supportedDealModes: ['buy', 'rent', 'all'],
      defaultPageSize: 20,
      maxPageSize: 50,
    });
  });
}

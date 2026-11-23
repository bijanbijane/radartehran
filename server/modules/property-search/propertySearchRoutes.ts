import type { Express, Request, Response } from 'express';
import { PropertySearchService } from './service';

export function registerPropertySearchRoutes(app: Express, service: PropertySearchService): void {
  app.post('/api/v1/property-search/query', async (req: Request, res: Response) => {
    try {
      const out = await service.searchProperties(req.body ?? {});
      res.status(200).json(out);
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String((err as { code: string }).code) : 'SEARCH_FAILED';
      const status = code === 'INVALID_SEARCH_CURSOR' ? 400 : code === 'SEARCH_CURSOR_STALE' ? 409 : 400;
      res.status(status).json({ errorCode: code, messageFa: 'خطا در جست‌وجوی املاک.' });
    }
  });
}
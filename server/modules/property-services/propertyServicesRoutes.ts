/**
 * @file server/modules/property-services/propertyServicesRoutes.ts
 * @description Express routing factory for property services marketplace for integration by Integration Lead.
 */

import type { Express, Request, Response } from 'express';
import { ServiceCategoryRegistry } from './propertyServicesCategories';
import { PropertyServicesEngine } from './propertyServicesEngine';
import { PropertyServicesSearch } from './propertyServicesSearch';
import { defaultPropertyServicesStore, type PropertyServicesStore } from './propertyServicesStore';

export interface PropertyServicesModuleOptions {
  store?: PropertyServicesStore;
  categoryRegistry?: ServiceCategoryRegistry;
  engine?: PropertyServicesEngine;
  search?: PropertyServicesSearch;
  verifyUserAuth?: (req: Request) => Promise<string | null> | string | null;
  verifyAdminAuth?: (req: Request) => Promise<boolean> | boolean;
  checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredApps = new WeakSet<Express>();

function defaultVerifyUserAuth(req: Request): string | null {
  const headerUid = req.headers['x-user-uid'];
  if (typeof headerUid === 'string' && headerUid.trim().length > 0) return headerUid.trim();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('user_')) return token;
  }
  return null;
}

function defaultVerifyAdminAuth(req: Request): boolean {
  return req.headers['x-admin-role'] === 'super_admin' || req.headers['x-admin-secret'] === 'admin_verified';
}

export function registerPropertyServicesRoutes(app: Express, options?: PropertyServicesModuleOptions): void {
  if (registeredApps.has(app)) return;
  registeredApps.add(app);

  const store = options?.store || defaultPropertyServicesStore;
  const categoryRegistry = options?.categoryRegistry || new ServiceCategoryRegistry();
  const engine = options?.engine || new PropertyServicesEngine(store, categoryRegistry);
  const search = options?.search || new PropertyServicesSearch(store);

  const verifyUserAuth = options?.verifyUserAuth || defaultVerifyUserAuth;
  const verifyAdminAuth = options?.verifyAdminAuth || defaultVerifyAdminAuth;

  // 1. GET /api/v2/property-services/categories
  app.get('/api/v2/property-services/categories', (_req: Request, res: Response) => {
    const categories = categoryRegistry.listCategories();
    res.status(200).json({ ok: true, categories });
  });

  // 2. GET /api/v2/property-services/providers
  app.get('/api/v2/property-services/providers', async (req: Request, res: Response) => {
    const results = await search.searchProviders({
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      cityId: typeof req.query.cityId === 'string' ? req.query.cityId : undefined,
      query: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
    });
    res.status(200).json({ ok: true, ...results });
  });

  // 3. GET /api/v2/property-services/providers/:id
  app.get('/api/v2/property-services/providers/:id', async (req: Request, res: Response) => {
    const profile = await store.getPublicProfileById(req.params.id);
    if (!profile) {
      res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      return;
    }
    const offerings = await store.listOfferingsByProvider(profile.id);
    const reviews = await store.listApprovedReviewsForProvider(profile.id);
    res.status(200).json({ ok: true, profile, offerings, reviews });
  });

  // 4. POST /api/v2/property-services/provider/profile
  app.post('/api/v2/property-services/provider/profile', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.registerOrUpdateProvider(uid, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, profile: outcome.profile });
  });

  // 5. POST /api/v2/property-services/provider/credentials
  app.post('/api/v2/property-services/provider/credentials', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.submitCredential(uid, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, credential: outcome.credential });
  });

  // 6. POST /api/v2/property-services/requests
  app.post('/api/v2/property-services/requests', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.createServiceRequest(uid, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, request: outcome.request });
  });

  // 7. GET /api/v2/property-services/requests/:id/quotations
  app.get('/api/v2/property-services/requests/:id/quotations', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const isAdmin = await verifyAdminAuth(req);
    const quotations = await store.listQuotationsForRequest(req.params.id, uid, isAdmin);
    res.status(200).json({ ok: true, quotations });
  });

  // 8. POST /api/v2/property-services/requests/:id/quotations
  app.post('/api/v2/property-services/requests/:id/quotations', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.submitQuotation(uid, req.params.id, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, quotation: outcome.quotation });
  });

  // 9. POST /api/v2/property-services/quotations/:id/accept
  app.post('/api/v2/property-services/quotations/:id/accept', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.acceptQuotationAndCreateBooking(uid, req.params.id);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, booking: outcome.booking });
  });

  // 10. PATCH /api/v2/property-services/bookings/:id/status
  app.patch('/api/v2/property-services/bookings/:id/status', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const isAdmin = await verifyAdminAuth(req);
    const body = (req.body || {}) as { targetState?: any; noteFa?: string };
    const outcome = await engine.transitionBookingState(uid, req.params.id, body.targetState, body.noteFa, isAdmin);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, booking: outcome.booking });
  });

  // 11. POST /api/v2/property-services/bookings/:id/review
  app.post('/api/v2/property-services/bookings/:id/review', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.submitReview(uid, req.params.id, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, review: outcome.review });
  });

  // 12. POST /api/v2/property-services/admin/credentials/review
  app.post('/api/v2/property-services/admin/credentials/review', async (req: Request, res: Response) => {
    const isAdmin = await verifyAdminAuth(req);
    if (!isAdmin) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      return;
    }

    const body = (req.body || {}) as { providerId?: string; credentialId?: string; decision?: any; reasonFa?: string };
    if (!body.providerId || !body.credentialId || !body.decision) {
      res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
      return;
    }

    const outcome = await engine.reviewCredential('admin_actor', body.providerId, body.credentialId, body.decision, body.reasonFa);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, message: 'Credential review updated' });
  });
}

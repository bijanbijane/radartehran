/**
 * @file server/modules/real-estate-professionals/professionalRoutes.ts
 * @description Express routing factory for real-estate professionals and agency verification.
 */

import type { Express, Request, Response } from 'express';
import { ProfessionalEngine } from './professionalEngine';
import { ProfessionalSearch } from './professionalSearch';
import { defaultProfessionalStore, type ProfessionalStore } from './professionalStore';
import { UnavailableRegistryAdapter, type AuthoritativeRegistryAdapter } from './registryVerificationAdapter';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';

export interface RealEstateProfessionalsModuleOptions {
  store?: ProfessionalStore;
  registryAdapter?: AuthoritativeRegistryAdapter;
  engine?: ProfessionalEngine;
  search?: ProfessionalSearch;
  verifyUserAuth?: (req: Request) => Promise<string | null> | string | null;
  verifyAdminAuth?: (req: Request) => Promise<boolean> | boolean;
  checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredApps = new WeakSet<Express>();

async function defaultVerifyUserAuth(req: Request): Promise<string | null> {
  const result = await verifyAuthenticatedUserHeader(
    req.headers as Record<string, string | string[] | undefined>,
  );
  return result.authorized && result.uid ? result.uid : null;
}

async function defaultVerifyAdminAuth(req: Request): Promise<boolean> {
  const result = await verifyAdminApiAuthorization(
    req.headers as Record<string, string | string[] | undefined>,
    process.env,
    { disallowStaticToken: true, requirePrimaryBootstrapAdmin: true },
  );
  return result.authorized;
}

export function registerRealEstateProfessionalRoutes(
  app: Express,
  options?: RealEstateProfessionalsModuleOptions,
): void {
  if (registeredApps.has(app)) return;
  registeredApps.add(app);

  const store = options?.store || defaultProfessionalStore;
  const registryAdapter = options?.registryAdapter || new UnavailableRegistryAdapter();
  const engine = options?.engine || new ProfessionalEngine(store, registryAdapter);
  const search = options?.search || new ProfessionalSearch(store);

  const verifyUserAuth = options?.verifyUserAuth || defaultVerifyUserAuth;
  const verifyAdminAuth = options?.verifyAdminAuth || defaultVerifyAdminAuth;

  // 1. GET /api/v2/real-estate-professionals
  app.get('/api/v2/real-estate-professionals', async (req: Request, res: Response) => {
    const results = await search.searchProfessionals({
      cityId: typeof req.query.cityId === 'string' ? req.query.cityId : undefined,
      hoodId: req.query.hoodId ? parseInt(String(req.query.hoodId), 10) : undefined,
      role: req.query.role as any,
      verificationStatus: req.query.verificationStatus as any,
      query: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
    });
    res.status(200).json({ ok: true, ...results });
  });

  // 2. GET /api/v2/real-estate-professionals/verify/:id
  app.get('/api/v2/real-estate-professionals/verify/:id', async (req: Request, res: Response) => {
    const outcome = await search.getPublicVerificationProfile(req.params.id);
    if (!outcome.found) {
      res.status(404).json({ ok: false, error: 'ENTITY_NOT_FOUND', trustNoticeFa: outcome.trustNoticeFa });
      return;
    }
    res.status(200).json({ ok: true, ...outcome });
  });

  // 3. GET /api/v2/real-estate-professionals/agencies
  app.get('/api/v2/real-estate-professionals/agencies', async (req: Request, res: Response) => {
    const cityId = typeof req.query.cityId === 'string' ? req.query.cityId : undefined;
    const agencies = await store.listPublicAgencies(cityId);
    res.status(200).json({ ok: true, agencies });
  });

  // 4. POST /api/v2/real-estate-professionals/profile
  app.post('/api/v2/real-estate-professionals/profile', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.registerOrUpdateProfessional(uid, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, profile: outcome.profile });
  });

  // 5. POST /api/v2/real-estate-professionals/phone/verify
  app.post('/api/v2/real-estate-professionals/phone/verify', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const success = await engine.recordPhoneVerification(uid);
    if (!success) {
      res.status(404).json({ ok: false, error: 'PROFESSIONAL_PROFILE_NOT_FOUND' });
      return;
    }

    res.status(200).json({
      ok: true,
      message: 'شماره تماس با موفقیت تایید شد (این تاییدیه به منزله پروانه کسب معتبر نمی‌باشد).',
    });
  });

  // 6. POST /api/v2/real-estate-professionals/agencies
  app.post('/api/v2/real-estate-professionals/agencies', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.registerAgency(uid, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, agency: outcome.agency });
  });

  // 7. POST /api/v2/real-estate-professionals/agencies/:id/branches
  app.post('/api/v2/real-estate-professionals/agencies/:id/branches', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.addAgencyBranch(uid, req.params.id, req.body);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, branch: outcome.branch });
  });

  // 8. POST /api/v2/real-estate-professionals/credentials
  app.post('/api/v2/real-estate-professionals/credentials', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const outcome = await engine.submitAndVerifyCredential(uid, req.body);
    res.status(201).json({ ok: true, ...outcome });
  });

  // 9. POST /api/v2/real-estate-professionals/admin/credentials/review
  app.post('/api/v2/real-estate-professionals/admin/credentials/review', async (req: Request, res: Response) => {
    const isAdmin = await verifyAdminAuth(req);
    if (!isAdmin) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ACCESS' });
      return;
    }

    const body = (req.body || {}) as { credentialId?: string; decision?: any; reasonFa?: string };
    if (!body.credentialId || !body.decision) {
      res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
      return;
    }

    const outcome = await engine.reviewCredentialManually('admin_actor', body.credentialId, body.decision, body.reasonFa);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, message: 'بررسی مدارک با موفقیت ثبت شد.' });
  });

  // 10. POST /api/v2/real-estate-professionals/memberships/invite
  app.post('/api/v2/real-estate-professionals/memberships/invite', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const body = (req.body || {}) as { agencyId?: string; professionalId?: string; roleInAgency?: any; branchId?: string };
    if (!body.agencyId || !body.professionalId) {
      res.status(400).json({ ok: false, error: 'MISSING_INVITATION_PARAMS' });
      return;
    }

    const outcome = await engine.inviteProfessionalToAgency(uid, body.agencyId, body.professionalId, body.roleInAgency, body.branchId);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, membership: outcome.membership });
  });

  // 11. PATCH /api/v2/real-estate-professionals/memberships/:id/status
  app.patch('/api/v2/real-estate-professionals/memberships/:id/status', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const isAdmin = await verifyAdminAuth(req);
    const body = (req.body || {}) as { targetState?: any; reasonFa?: string };
    const outcome = await engine.transitionMembershipState(uid, req.params.id, body.targetState, body.reasonFa, isAdmin);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(200).json({ ok: true, membership: outcome.membership });
  });

  // 12. POST /api/v2/real-estate-professionals/listings/:id/associate
  app.post('/api/v2/real-estate-professionals/listings/:id/associate', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const body = (req.body || {}) as { professionalId?: string; representationType?: any };
    if (!body.professionalId) {
      res.status(400).json({ ok: false, error: 'MISSING_PROFESSIONAL_ID' });
      return;
    }

    const outcome = await engine.associateProfessionalWithListing(uid, req.params.id, body.professionalId, body.representationType);
    if (!outcome.success) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }

    res.status(201).json({ ok: true, association: outcome.association });
  });
}

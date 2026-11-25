/**
 * @file server/modules/enterprise-tenancy/routes.ts
 * @description Express API routes for Employee 74 (Phases 2 & 3):
 * - `/api/tenants` (create, get, patch, activate, suspend, reactivate, close)
 * - `/api/tenants/:tenantId/organizations` (create, list, get, patch, suspend, activate)
 * - `/api/tenants/:tenantId/memberships` (list, create, patch, suspend, revoke)
 * - `/api/tenants/:tenantId/invitations` (create, list, revoke, accept)
 */

import type { Express, Request, Response } from 'express';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  createPlatformExecutionContext,
  PlatformApplicationError,
  platformExecutionContextMiddleware,
  toCanonicalErrorResponse,
  toCanonicalSuccessResponse,
  type RequestWithPlatformContext,
} from '../platform-foundation';
import { getDefaultEnterpriseTenancyStore, type EnterpriseTenancyStore } from './tenancyEngine';

export interface TenancyRouteActor {
  authenticated: boolean;
  actorId: string;
  verifiedEmail: string;
  isPlatformAdmin: boolean;
  correlationId: string;
}

export type TenancyActorResolver = (req: Request) => Promise<TenancyRouteActor>;

export async function defaultTenancyActorResolver(req: Request): Promise<TenancyRouteActor> {
  const corrHeader = req.headers['x-correlation-id'];
  const correlationId =
    (Array.isArray(corrHeader) ? corrHeader[0] : corrHeader) || `corr_${Date.now()}`;
  const headers = req.headers as Record<string, string | string[] | undefined>;

  const adminCheck = await verifyAdminApiAuthorization(headers, process.env, {
    requirePrimaryBootstrapAdmin: true,
    disallowStaticToken: true,
  });
  if (adminCheck.authorized) {
    return {
      authenticated: true,
      actorId: adminCheck.actorUid || adminCheck.uid || 'platform-admin',
      verifiedEmail: adminCheck.email || 'admin@radartehran.ir',
      isPlatformAdmin: true,
      correlationId,
    };
  }

  const userCheck = await verifyAuthenticatedUserHeader(headers);
  if (userCheck.authorized && userCheck.uid) {
    return {
      authenticated: true,
      actorId: userCheck.uid,
      verifiedEmail: userCheck.email || '',
      isPlatformAdmin: false,
      correlationId,
    };
  }

  return {
    authenticated: false,
    actorId: 'anonymous',
    verifiedEmail: '',
    isPlatformAdmin: false,
    correlationId,
  };
}

function extractVersionFromReq(req: Request): number | undefined {
  const v = req.body?.expectedRecordVersion ?? req.body?.recordVersion ?? req.body?.expectedVersion;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  return undefined;
}

const registeredTenancyApps = new WeakSet<Express>();

export function registerEnterpriseTenancyRoutes(
  app: Express,
  options: {
    store?: EnterpriseTenancyStore;
    actorResolver?: TenancyActorResolver;
  } = {},
): void {
  if (registeredTenancyApps.has(app)) return;
  registeredTenancyApps.add(app);

  const store = options.store ?? getDefaultEnterpriseTenancyStore();
  const resolveActor = options.actorResolver ?? defaultTenancyActorResolver;

  app.use('/api/tenants', platformExecutionContextMiddleware);

  const handle = (
    operationName: string,
    fn: (
      req: RequestWithPlatformContext,
      res: Response,
      actor: TenancyRouteActor,
    ) => Promise<void> | void,
  ) => {
    return (req: RequestWithPlatformContext, res: Response) => {
      void (async () => {
        res.setHeader('Cache-Control', 'no-store');
        const baseCtx =
          req.platformContext ??
          createPlatformExecutionContext({
            sourceModule: 'enterprise-multi-tenancy',
            operationName,
          });
        try {
          const actor = await resolveActor(req);
          if (!actor.authenticated) {
            throw new PlatformApplicationError({
              code: 'AUTHENTICATION_REQUIRED',
              category: 'AUTHENTICATION',
              httpStatus: 401,
              owningModule: 'enterprise-multi-tenancy',
              message: 'Authentication is required to access tenant endpoints.',
              correlationId: baseCtx.correlationId,
            });
          }
          await fn(req, res, { ...actor, correlationId: baseCtx.correlationId });
        } catch (err) {
          const mapped = toCanonicalErrorResponse(err, baseCtx);
          res.status(mapped.statusCode).json(mapped.body);
        }
      })();
    };
  };

  // GET /api/tenants (Admin list) & POST /api/tenants
  app.get(
    '/api/tenants',
    handle('tenants.list', (req, res, actor) => {
      if (!actor.isPlatformAdmin) {
        throw new PlatformApplicationError({
          code: 'TENANT_ACCESS_DENIED',
          category: 'AUTHORIZATION',
          httpStatus: 403,
          owningModule: 'enterprise-multi-tenancy',
          message: 'Listing all tenants requires platform administrator authority.',
        });
      }
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = store.listTenants({ limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/tenants',
    handle('tenants.create', (req, res, actor) => {
      const created = store.createTenant(req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, req.platformContext));
    }),
  );

  app.get(
    '/api/tenants/:tenantId',
    handle('tenants.get', (req, res, actor) => {
      const tenant = store.getTenantById(req.params.tenantId);
      if (!actor.isPlatformAdmin && tenant.ownerUserId !== actor.actorId) {
        const mems = store.getActiveMembershipsForUser(tenant.tenantId, actor.actorId);
        if (mems.length === 0) {
          throw new PlatformApplicationError({
            code: 'TENANT_ACCESS_DENIED',
            category: 'TENANT_ISOLATION',
            httpStatus: 403,
            owningModule: 'enterprise-multi-tenancy',
            message: 'Actor is not authorized to view this tenant.',
          });
        }
      }
      res.status(200).json(toCanonicalSuccessResponse(tenant, req.platformContext));
    }),
  );

  app.patch(
    '/api/tenants/:tenantId',
    handle('tenants.update', (req, res, actor) => {
      const expectedRecordVersion = extractVersionFromReq(req);
      const updated = store.updateTenantDetails(
        req.params.tenantId,
        { ...(req.body ?? {}), expectedRecordVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/activate',
    handle('tenants.activate', (req, res, actor) => {
      const updated = store.transitionTenantLifecycle(req.params.tenantId, 'ACTIVATE', actor);
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/suspend',
    handle('tenants.suspend', (req, res, actor) => {
      const updated = store.transitionTenantLifecycle(req.params.tenantId, 'SUSPEND', actor);
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/reactivate',
    handle('tenants.reactivate', (req, res, actor) => {
      const updated = store.transitionTenantLifecycle(req.params.tenantId, 'REACTIVATE', actor);
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/close',
    handle('tenants.close', (req, res, actor) => {
      const mode = req.body?.completeClosure ? 'COMPLETE_CLOSURE' : 'BEGIN_CLOSURE';
      const updated = store.transitionTenantLifecycle(
        req.params.tenantId,
        mode,
        actor,
        req.body?.preconditions ?? {},
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  // Organizations
  app.post(
    '/api/tenants/:tenantId/organizations',
    handle('organizations.create', (req, res, actor) => {
      const created = store.createOrganization(req.params.tenantId, req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, req.platformContext));
    }),
  );

  app.get(
    '/api/tenants/:tenantId/organizations',
    handle('organizations.list', (req, res, actor) => {
      const tenant = store.getTenantById(req.params.tenantId);
      if (!actor.isPlatformAdmin && tenant.ownerUserId !== actor.actorId) {
        const mems = store.getActiveMembershipsForUser(tenant.tenantId, actor.actorId);
        if (mems.length === 0) {
          throw new PlatformApplicationError({
            code: 'TENANT_ACCESS_DENIED',
            category: 'TENANT_ISOLATION',
            httpStatus: 403,
            owningModule: 'enterprise-multi-tenancy',
            message: 'Actor is not a member of this tenant.',
          });
        }
      }
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = store.listOrganizations(req.params.tenantId, { limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.get(
    '/api/tenants/:tenantId/organizations/:organizationId',
    handle('organizations.get', (req, res, actor) => {
      const tenant = store.getTenantById(req.params.tenantId);
      if (!actor.isPlatformAdmin && tenant.ownerUserId !== actor.actorId) {
        const mems = store.getActiveMembershipsForUser(tenant.tenantId, actor.actorId);
        if (mems.length === 0) {
          throw new PlatformApplicationError({
            code: 'TENANT_ACCESS_DENIED',
            category: 'TENANT_ISOLATION',
            httpStatus: 403,
            owningModule: 'enterprise-multi-tenancy',
            message: 'Actor is not a member of this tenant.',
          });
        }
      }
      const org = store.getOrganization(req.params.tenantId, req.params.organizationId);
      res.status(200).json(toCanonicalSuccessResponse(org, req.platformContext));
    }),
  );

  app.patch(
    '/api/tenants/:tenantId/organizations/:organizationId',
    handle('organizations.update', (req, res, actor) => {
      const expectedRecordVersion = extractVersionFromReq(req);
      const updated = store.updateOrganization(
        req.params.tenantId,
        req.params.organizationId,
        { ...(req.body ?? {}), expectedRecordVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/organizations/:organizationId/suspend',
    handle('organizations.suspend', (req, res, actor) => {
      const existing = store.getOrganization(req.params.tenantId, req.params.organizationId);
      const updated = store.updateOrganization(
        req.params.tenantId,
        req.params.organizationId,
        { expectedRecordVersion: existing.recordVersion, status: 'SUSPENDED' },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/organizations/:organizationId/activate',
    handle('organizations.activate', (req, res, actor) => {
      const existing = store.getOrganization(req.params.tenantId, req.params.organizationId);
      const updated = store.updateOrganization(
        req.params.tenantId,
        req.params.organizationId,
        { expectedRecordVersion: existing.recordVersion, status: 'ACTIVE' },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  // Memberships
  app.get(
    '/api/tenants/:tenantId/memberships',
    handle('memberships.list', (req, res, actor) => {
      const tenant = store.getTenantById(req.params.tenantId);
      store.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = store.listMemberships(req.params.tenantId, { limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/memberships',
    handle('memberships.create', (req, res, actor) => {
      const created = store.createMembership(req.params.tenantId, req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, req.platformContext));
    }),
  );

  app.patch(
    '/api/tenants/:tenantId/memberships/:membershipId',
    handle('memberships.update', (req, res, actor) => {
      const expectedRecordVersion = extractVersionFromReq(req);
      const updated = store.updateMembership(
        req.params.tenantId,
        req.params.membershipId,
        { ...(req.body ?? {}), expectedRecordVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/memberships/:membershipId/suspend',
    handle('memberships.suspend', (req, res, actor) => {
      const mem = store
        .listMemberships(req.params.tenantId, { limit: 100 })
        .items.find((m) => m.membershipId === req.params.membershipId);
      const updated = store.updateMembership(
        req.params.tenantId,
        req.params.membershipId,
        { expectedRecordVersion: mem?.recordVersion ?? 1, membershipStatus: 'SUSPENDED' },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/memberships/:membershipId/revoke',
    handle('memberships.revoke', (req, res, actor) => {
      const mem = store
        .listMemberships(req.params.tenantId, { limit: 100 })
        .items.find((m) => m.membershipId === req.params.membershipId);
      const updated = store.updateMembership(
        req.params.tenantId,
        req.params.membershipId,
        { expectedRecordVersion: mem?.recordVersion ?? 1, membershipStatus: 'REVOKED' },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, req.platformContext));
    }),
  );

  // Invitations
  app.post(
    '/api/tenants/:tenantId/invitations',
    handle('invitations.create', (req, res, actor) => {
      const created = store.createInvitation(req.params.tenantId, req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, req.platformContext));
    }),
  );

  app.get(
    '/api/tenants/:tenantId/invitations',
    handle('invitations.list', (req, res, actor) => {
      const tenant = store.getTenantById(req.params.tenantId);
      store.assertCanManageTenant(tenant, actor.actorId, actor.isPlatformAdmin);
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = store.listInvitations(req.params.tenantId, { limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, req.platformContext, page.nextCursor));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/invitations/:invitationId/revoke',
    handle('invitations.revoke', (req, res, actor) => {
      const revoked = store.revokeInvitation(
        req.params.tenantId,
        req.params.invitationId,
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(revoked, req.platformContext));
    }),
  );

  app.post(
    '/api/tenants/:tenantId/invitations/:invitationId/accept',
    handle('invitations.accept', (req, res, actor) => {
      const rawToken = typeof req.body?.token === 'string' ? req.body.token : '';
      const result = store.acceptInvitation(
        req.params.tenantId,
        req.params.invitationId,
        rawToken,
        {
          userId: actor.actorId,
          verifiedEmail: actor.verifiedEmail,
          correlationId: actor.correlationId,
        },
      );
      res.status(200).json(toCanonicalSuccessResponse(result, req.platformContext));
    }),
  );
}

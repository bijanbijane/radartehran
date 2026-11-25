/**
 * @file server/modules/platform-foundation/routes.ts
 * @description Deliverable D10 — Functional Administrative API Layer for Phase 1 Platform Foundations.
 * Implements all 19 administrative endpoints under `/api/admin/platform/*` with authentication,
 * RBAC permission checks, input validation, optimistic concurrency (`409 VERSION_CONFLICT`),
 * bounded cursor pagination, canonical response envelopes, and audit logging.
 */

import type { Express, Request, Response } from 'express';
import { verifyAdminApiAuthorization } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { runPhase1ArchitectureValidation } from './architectureValidator';
import {
  createPlatformExecutionContext,
  getCanonicalErrorCatalog,
  PlatformApplicationError,
  platformExecutionContextMiddleware,
  toCanonicalErrorResponse,
  toCanonicalSuccessResponse,
  type RequestWithPlatformContext,
} from './contextAndErrors';
import {
  getDefaultPlatformFoundationStore,
  type PlatformFoundationRegistryStore,
} from './registriesAndPersistence';
import type { PlatformExecutionContext } from './types';
import { registerEnterpriseTenancyRoutes } from '../enterprise-tenancy/routes';
import { registerDistributedProcessingAdminRoutes } from '../distributed-processing/routes';
import { createCachingAndPerformanceRouter } from '../caching-performance';
import { createInfrastructureSecurityRouter } from '../infrastructure-security';
import { createBackupAndRecoveryRouter } from '../backup-recovery';
import { createAnalyticalDataPlatformRouter } from '../analytical-platform';
import { createPlatformResilienceRouter } from '../platform-resilience';


export interface PlatformAdminAuthIdentity {
  authorized: boolean;
  statusCode: number;
  reason: string;
  actorId: string;
  actorRole: 'admin' | 'primary_admin' | 'read_only_admin' | 'unauthorized';
  permissions: string[];
}

export type PlatformAdminAuthVerifier = (
  req: Request,
  requiredPermission: 'platform:admin:read' | 'platform:admin:write',
) => Promise<PlatformAdminAuthIdentity>;

function extractExpectedVersion(req: Request): number | undefined {
  const bodyVer = req.body?.expectedVersion ?? req.body?.version;
  if (typeof bodyVer === 'number' && Number.isInteger(bodyVer)) {
    return bodyVer;
  }
  const ifMatch = req.headers['if-match'];
  const rawHeader = Array.isArray(ifMatch) ? ifMatch[0] : ifMatch;
  if (typeof rawHeader === 'string' && rawHeader.trim().length > 0) {
    const cleaned = rawHeader.replace(/^W\//i, '').replace(/"/g, '').trim();
    const parsed = Number(cleaned);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

export async function defaultPlatformAdminAuthVerifier(
  req: Request,
  requiredPermission: 'platform:admin:read' | 'platform:admin:write',
): Promise<PlatformAdminAuthIdentity> {
  const auth = await verifyAdminApiAuthorization(req);
  if (!auth.authorized) {
    return {
      authorized: false,
      statusCode: auth.statusCode === 401 ? 401 : 403,
      reason: auth.reason || 'AUTHENTICATION_REQUIRED',
      actorId: auth.actorUid || 'anonymous',
      actorRole: 'unauthorized',
      permissions: [],
    };
  }

  // Only the bootstrap administrator and server-to-server secret may write.
  // A delegated admin is read-only until a server-side scoped permission record exists.
  const isPrimary = auth.reason === 'AUTHORIZED_BOOTSTRAP_ADMIN' ||
    auth.reason === 'AUTHORIZED_SERVER_SECRET';
  const permissions = isPrimary
    ? ['platform:admin:read', 'platform:admin:write', 'platform:admin:governance']
    : ['platform:admin:read'];

  if (!permissions.includes(requiredPermission)) {
    return {
      authorized: false,
      statusCode: 403,
      reason: 'PERMISSION_DENIED',
      actorId: auth.actorUid || auth.uid || 'admin',
      actorRole: 'read_only_admin',
      permissions,
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    reason: auth.reason,
    actorId: auth.actorUid || auth.uid || 'verified-admin',
    actorRole: isPrimary ? 'primary_admin' : 'read_only_admin',
    permissions,
  };
}

export interface RegisterPlatformFoundationRoutesOptions {
  store?: PlatformFoundationRegistryStore;
  authVerifier?: PlatformAdminAuthVerifier;
}

const registeredPlatformApps = new WeakSet<Express>();

export function registerPlatformFoundationAdminRoutes(
  app: Express,
  options: RegisterPlatformFoundationRoutesOptions = {},
): void {
  if (registeredPlatformApps.has(app)) return;
  registeredPlatformApps.add(app);

  const store = options.store ?? getDefaultPlatformFoundationStore();
  const verifyAuth = options.authVerifier ?? defaultPlatformAdminAuthVerifier;

  app.use('/api/admin/platform', platformExecutionContextMiddleware);

  const withAdminGuard = (
    permission: 'platform:admin:read' | 'platform:admin:write',
    operationName: string,
    handler: (
      req: RequestWithPlatformContext,
      res: Response,
      ctx: PlatformExecutionContext,
      actor: { actorId: string; actorRole: string; correlationId: string },
    ) => Promise<void> | void,
  ) => {
    return (req: RequestWithPlatformContext, res: Response) => {
      void (async () => {
        res.setHeader('Cache-Control', 'no-store');
        const baseCtx =
          req.platformContext ??
          createPlatformExecutionContext({
            sourceModule: 'platform-integration-resilience',
            operationName,
          });
        try {
          const auth = await verifyAuth(req, permission);
          if (!auth.authorized) {
            throw new PlatformApplicationError({
              code: auth.statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : 'PERMISSION_DENIED',
              category: auth.statusCode === 401 ? 'AUTHENTICATION' : 'AUTHORIZATION',
              httpStatus: auth.statusCode,
              message: `Administrative access denied (${auth.reason}). Required permission: ${permission}.`,
              correlationId: baseCtx.correlationId,
            });
          }
          const ctx: PlatformExecutionContext = {
            ...baseCtx,
            actorId: auth.actorId,
            actorRole: auth.actorRole,
            permissions: auth.permissions,
            operationName,
          };
          await handler(req, res, ctx, {
            actorId: auth.actorId,
            actorRole: auth.actorRole,
            correlationId: ctx.correlationId,
          });
        } catch (err) {
          const mapped = toCanonicalErrorResponse(err, baseCtx);
          res.status(mapped.statusCode).json(mapped.body);
        }
      })();
    };
  };

  // 1. GET /api/admin/platform/modules
  app.get(
    '/api/admin/platform/modules',
    withAdminGuard('platform:admin:read', 'platform.modules.list', (req, res, ctx) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const ownerFilter = typeof req.query.owner === 'string' ? req.query.owner : undefined;
      const implFilter =
        typeof req.query.implementationStatus === 'string'
          ? req.query.implementationStatus
          : undefined;
      const page = store.listModules({
        limit,
        cursor,
        ownerFilter,
        implementationStatusFilter: implFilter,
      });
      res.status(200).json(toCanonicalSuccessResponse(page.items, ctx, page.nextCursor));
    }),
  );

  // 2. GET /api/admin/platform/modules/:moduleId
  app.get(
    '/api/admin/platform/modules/:moduleId',
    withAdminGuard('platform:admin:read', 'platform.modules.get', (req, res, ctx) => {
      const mod = store.getModuleByIdOrCode(req.params.moduleId);
      res.status(200).json(toCanonicalSuccessResponse(mod, ctx));
    }),
  );

  // 3. POST /api/admin/platform/modules
  app.post(
    '/api/admin/platform/modules',
    withAdminGuard('platform:admin:write', 'platform.modules.create', (req, res, ctx, actor) => {
      const created = store.registerModule(req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, ctx));
    }),
  );

  // 4. PATCH /api/admin/platform/modules/:moduleId
  app.patch(
    '/api/admin/platform/modules/:moduleId',
    withAdminGuard('platform:admin:write', 'platform.modules.update', (req, res, ctx, actor) => {
      const expectedVersion = extractExpectedVersion(req);
      const updated = store.updateModule(
        req.params.moduleId,
        { ...(req.body ?? {}), expectedVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, ctx));
    }),
  );

  // 5. GET /api/admin/platform/dependencies
  app.get(
    '/api/admin/platform/dependencies',
    withAdminGuard('platform:admin:read', 'platform.dependencies.list', (req, res, ctx) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const sourceModule =
        typeof req.query.sourceModule === 'string' ? req.query.sourceModule : undefined;
      const criticality =
        typeof req.query.criticality === 'string' ? req.query.criticality : undefined;
      const page = store.listDependencies({ limit, cursor, sourceModule, criticality });
      res.status(200).json(toCanonicalSuccessResponse(page.items, ctx, page.nextCursor));
    }),
  );

  // 6. GET /api/admin/platform/dependencies/graph
  app.get(
    '/api/admin/platform/dependencies/graph',
    withAdminGuard('platform:admin:read', 'platform.dependencies.graph', (_req, res, ctx) => {
      const graph = store.computeDependencyGraph();
      res.status(200).json(toCanonicalSuccessResponse(graph, ctx));
    }),
  );

  // 7. GET /api/admin/platform/dependencies/:dependencyId
  app.get(
    '/api/admin/platform/dependencies/:dependencyId',
    withAdminGuard('platform:admin:read', 'platform.dependencies.get', (req, res, ctx) => {
      const dep = store.getDependencyById(req.params.dependencyId);
      res.status(200).json(toCanonicalSuccessResponse(dep, ctx));
    }),
  );

  // 8. POST /api/admin/platform/dependencies
  app.post(
    '/api/admin/platform/dependencies',
    withAdminGuard('platform:admin:write', 'platform.dependencies.create', (req, res, ctx, actor) => {
      const created = store.registerDependency(req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, ctx));
    }),
  );

  // 9. PATCH /api/admin/platform/dependencies/:dependencyId
  app.patch(
    '/api/admin/platform/dependencies/:dependencyId',
    withAdminGuard('platform:admin:write', 'platform.dependencies.update', (req, res, ctx, actor) => {
      const expectedVersion = extractExpectedVersion(req);
      const updated = store.updateDependency(
        req.params.dependencyId,
        { ...(req.body ?? {}), expectedVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, ctx));
    }),
  );

  // 10. POST /api/admin/platform/dependencies/validate
  app.post(
    '/api/admin/platform/dependencies/validate',
    withAdminGuard('platform:admin:read', 'platform.dependencies.validate', (req, res, ctx) => {
      const customDeps = Array.isArray(req.body?.dependencies)
        ? req.body.dependencies
        : undefined;
      const graphResult = store.computeDependencyGraph(customDeps);
      const archReport = runPhase1ArchitectureValidation({
        dependencies: customDeps,
      });
      res.status(200).json(
        toCanonicalSuccessResponse(
          {
            graphValidation: graphResult,
            architectureValidationValid: archReport.valid,
            violations: archReport.violations,
          },
          ctx,
        ),
      );
    }),
  );

  // 11. GET /api/admin/platform/ownership
  app.get(
    '/api/admin/platform/ownership',
    withAdminGuard('platform:admin:read', 'platform.ownership.list', (req, res, ctx) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const owningEmployee =
        typeof req.query.owningEmployee === 'string' ? req.query.owningEmployee : undefined;
      const page = store.listOwnerships({ limit, cursor, owningEmployee });
      res.status(200).json(toCanonicalSuccessResponse(page.items, ctx, page.nextCursor));
    }),
  );

  // 12. GET /api/admin/platform/ownership/:entityType/resolve
  app.get(
    '/api/admin/platform/ownership/:entityType/resolve',
    withAdminGuard('platform:admin:read', 'platform.ownership.resolve', (req, res, ctx) => {
      const resolved = store.resolveEntityOwnership(req.params.entityType);
      res.status(200).json(
        toCanonicalSuccessResponse(
          {
            entityType: resolved.entityType,
            authoritativeOwnerEmployee: resolved.owningEmployee,
            authoritativeModuleCode: resolved.owningModuleCode,
            mutationServiceReference: resolved.mutationServiceReference,
            retentionOwner: resolved.retentionOwner,
            legalHoldPrecedenceEnforcedBy: resolved.legalHoldPrecedenceEnforcedBy,
            tenantOwnershipClassification: resolved.tenantOwnershipClassification,
            ownershipRecord: resolved,
          },
          ctx,
        ),
      );
    }),
  );

  // 13. GET /api/admin/platform/ownership/:entityType
  app.get(
    '/api/admin/platform/ownership/:entityType',
    withAdminGuard('platform:admin:read', 'platform.ownership.get', (req, res, ctx) => {
      const record = store.resolveEntityOwnership(req.params.entityType);
      res.status(200).json(toCanonicalSuccessResponse(record, ctx));
    }),
  );

  // 14. POST /api/admin/platform/ownership
  app.post(
    '/api/admin/platform/ownership',
    withAdminGuard('platform:admin:write', 'platform.ownership.create', (req, res, ctx, actor) => {
      const created = store.registerOwnership(req.body ?? {}, actor);
      res.status(201).json(toCanonicalSuccessResponse(created, ctx));
    }),
  );

  // 15. PATCH /api/admin/platform/ownership/:ownershipId
  app.patch(
    '/api/admin/platform/ownership/:ownershipId',
    withAdminGuard('platform:admin:write', 'platform.ownership.update', (req, res, ctx, actor) => {
      const expectedVersion = extractExpectedVersion(req);
      const updated = store.updateOwnership(
        req.params.ownershipId,
        { ...(req.body ?? {}), expectedVersion },
        actor,
      );
      res.status(200).json(toCanonicalSuccessResponse(updated, ctx));
    }),
  );

  // 16. GET /api/admin/platform/contracts
  app.get(
    '/api/admin/platform/contracts',
    withAdminGuard('platform:admin:read', 'platform.contracts.list', (req, res, ctx) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const page = store.listApiContracts({ limit, cursor });
      res.status(200).json(toCanonicalSuccessResponse(page.items, ctx, page.nextCursor));
    }),
  );

  // 17. GET /api/admin/platform/contracts/:contractId
  app.get(
    '/api/admin/platform/contracts/:contractId',
    withAdminGuard('platform:admin:read', 'platform.contracts.get', (req, res, ctx) => {
      const contract = store.getApiContractById(req.params.contractId);
      res.status(200).json(toCanonicalSuccessResponse(contract, ctx));
    }),
  );

  // 18. GET /api/admin/platform/events/contracts
  app.get(
    '/api/admin/platform/events/contracts',
    withAdminGuard('platform:admin:read', 'platform.events.contracts.list', (_req, res, ctx) => {
      const events = store.listEventContracts();
      res.status(200).json(toCanonicalSuccessResponse(events, ctx));
    }),
  );

  // 19. GET /api/admin/platform/errors/catalog
  app.get(
    '/api/admin/platform/errors/catalog',
    withAdminGuard('platform:admin:read', 'platform.errors.catalog', (_req, res, ctx) => {
      const catalog = getCanonicalErrorCatalog();
      res.status(200).json(toCanonicalSuccessResponse(catalog, ctx));
    }),
  );

  // Mount Consolidated Backend Program Phases 2-10 (Employees 74-80)
  registerEnterpriseTenancyRoutes(app);
  registerDistributedProcessingAdminRoutes(app);
  app.use(createCachingAndPerformanceRouter());
  app.use(createInfrastructureSecurityRouter());
  app.use(createBackupAndRecoveryRouter());
  app.use(createAnalyticalDataPlatformRouter());
  app.use(createPlatformResilienceRouter());
}


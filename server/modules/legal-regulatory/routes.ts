import express, { type Express, type NextFunction, type Request, type Response, type Router } from 'express';
import type { ApiAccessPolicy, ApiRouteMethod, RegisteredApiRoute } from '../../../src/utils/expressRouteCatalog';
import type { LegalRegulatoryAuthDeps } from './actorResolver';
import {
  FirestoreReadOnlyPropertyRegistryAdapter,
  type PropertyContextReferenceAdapter,
} from './adapters';
import { FirestoreLegalRegulatoryStore } from './firestoreStore';
import { createProductionLegalRegulatoryModule, type LegalRegulatoryModuleFacade } from './index';
import { createLegalRegulatoryRouteHandlers, handleLegalRegulatoryHttpError } from './routeHandlers';
import { LegalRegulatoryError } from './validationAndAuthz';

export const LEGAL_REGULATORY_BASE_PATH = '/api/v1/legal-regulatory';
export const LEGAL_REGULATORY_MAX_BODY_BYTES = 1_048_576; // 1 MiB ceiling (30-C)

export interface LegalRegulatoryRouteSpec {
  readonly method: ApiRouteMethod;
  readonly subPath: string;
  readonly fullPath: string;
  readonly accessPolicy: ApiAccessPolicy;
  readonly rateLimitPerMinute: number;
  readonly rateLimitBucket: 'general' | 'ai';
  readonly summary: string;
}

export const LEGAL_REGULATORY_ROUTE_SPECS: readonly LegalRegulatoryRouteSpec[] = [
  {
    method: 'GET',
    subPath: '/provisions/search',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/provisions/search`,
    accessPolicy: 'PUBLIC',
    rateLimitPerMinute: 30,
    rateLimitBucket: 'general',
    summary: 'Search verified legal and regulatory provisions with bounded pagination',
  },
  {
    method: 'GET',
    subPath: '/sources/:sourceId',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/sources/:sourceId`,
    accessPolicy: 'PUBLIC',
    rateLimitPerMinute: 60,
    rateLimitBucket: 'general',
    summary: 'Read legal regulatory source with public redaction and unverified guard',
  },
  {
    method: 'POST',
    subPath: '/sources',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/sources`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Create regulatory source atomically with idempotency and audit trail',
  },
  {
    method: 'POST',
    subPath: '/sources/:sourceId/verify',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/sources/:sourceId/verify`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Verify regulatory source with optimistic concurrency and idempotency',
  },
  {
    method: 'POST',
    subPath: '/documents',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/documents`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Create regulatory document under an existing verified or tracked source',
  },
  {
    method: 'GET',
    subPath: '/provisions/:provisionId',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/provisions/:provisionId`,
    accessPolicy: 'PUBLIC',
    rateLimitPerMinute: 60,
    rateLimitBucket: 'general',
    summary: 'Read regulatory provision with public redaction and unverified draft guard',
  },
  {
    method: 'GET',
    subPath: '/provisions/:provisionId/as-of',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/provisions/:provisionId/as-of`,
    accessPolicy: 'PUBLIC',
    rateLimitPerMinute: 60,
    rateLimitBucket: 'general',
    summary: 'Resolve historical regulatory provision version snapshot as of ISO date',
  },
  {
    method: 'POST',
    subPath: '/provisions',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/provisions`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Create regulatory provision atomically under source and document',
  },
  {
    method: 'POST',
    subPath: '/provisions/:provisionId/changes',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/provisions/:provisionId/changes`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Record amendment, repeal, or supersession change and bump provision version',
  },
  {
    method: 'POST',
    subPath: '/conflicts',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/conflicts`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Register regulatory conflict record between two provisions',
  },
  {
    method: 'POST',
    subPath: '/applicability-rules',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/applicability-rules`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Create geographic and characteristic applicability rule for a provision',
  },
  {
    method: 'POST',
    subPath: '/compliance-requirements',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/compliance-requirements`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 20,
    rateLimitBucket: 'general',
    summary: 'Create statutory compliance requirement linked to source and provision',
  },
  {
    method: 'POST',
    subPath: '/property-profile/evaluate',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/property-profile/evaluate`,
    accessPolicy: 'VERIFIED_USER',
    rateLimitPerMinute: 10,
    rateLimitBucket: 'general',
    summary: 'Evaluate property regulatory profile with server-side ownership verification',
  },
  {
    method: 'POST',
    subPath: '/ai-summaries',
    fullPath: `${LEGAL_REGULATORY_BASE_PATH}/ai-summaries`,
    accessPolicy: 'ADMIN',
    rateLimitPerMinute: 5,
    rateLimitBucket: 'ai',
    summary: 'Record non-authoritative AI summary suggestion requiring human legal review',
  },
] as const;

export interface RegisterLegalRegulatoryRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general' | 'ai', limit: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  facade?: LegalRegulatoryModuleFacade;
  propertyContextAdapter?: PropertyContextReferenceAdapter;
  authDeps?: LegalRegulatoryAuthDeps;
  maxBodyBytes?: number;
}

const mountedApps = new WeakSet<Express>();

export function extractMountedExpressRoutes(router: Router, basePath = LEGAL_REGULATORY_BASE_PATH): string[] {
  const stack = (router as unknown as { stack?: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }> }).stack ?? [];
  const routes: string[] = [];
  for (const layer of stack) {
    if (!layer.route || !layer.route.path || !layer.route.methods) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled) routes.push(`${method.toUpperCase()} ${basePath}${layer.route.path}`);
    }
  }
  return routes;
}

export function registerLegalRegulatoryRoutes(
  app: Express,
  options: RegisterLegalRegulatoryRoutesOptions = {},
): { mounted: boolean; basePath: string; routeCount: number; router?: Router } {
  if (mountedApps.has(app)) {
    return {
      mounted: false,
      basePath: LEGAL_REGULATORY_BASE_PATH,
      routeCount: LEGAL_REGULATORY_ROUTE_SPECS.length,
    };
  }
  mountedApps.add(app);

  const propertyContextAdapter: PropertyContextReferenceAdapter =
    options.propertyContextAdapter ?? new FirestoreReadOnlyPropertyRegistryAdapter();
  const facade =
    options.facade ??
    createProductionLegalRegulatoryModule({
      store: new FirestoreLegalRegulatoryStore(),
      propertyContextAdapter,
    });

  const isProd = process.env.NODE_ENV === 'production';
  const checkRateLimit = options.checkRateLimit;
  const getClientIp = options.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const maxBodyBytes = options.maxBodyBytes ?? LEGAL_REGULATORY_MAX_BODY_BYTES;

  const bodySizeGuard = (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = Number.parseInt(String(req.headers['content-length'] ?? ''), 10);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      handleLegalRegulatoryHttpError(
        new LegalRegulatoryError('PAYLOAD_TOO_LARGE', 'Request body exceeds maximum allowed size.', 413),
        res,
      );
      return;
    }
    if (req.body !== undefined) {
      const byteSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      if (byteSize > maxBodyBytes) {
        handleLegalRegulatoryHttpError(
          new LegalRegulatoryError('PAYLOAD_TOO_LARGE', 'Request body exceeds maximum allowed size.', 413),
          res,
        );
        return;
      }
    }
    next();
  };

  const rateGuard =
    (bucket: 'general' | 'ai', limit: number) =>
    (req: Request, res: Response, next: NextFunction): void => {
      if (!checkRateLimit) {
        if (isProd || process.env.NODE_ENV === 'production') {
          handleLegalRegulatoryHttpError(
            new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Rate limiter dependency is unavailable.', 503),
            res,
          );
          return;
        }
        next();
        return;
      }
      // Strictly key off trusted IP (never spoofable x-legal-actor-id/role headers); counts rejected requests too.
      if (!checkRateLimit(getClientIp(req), bucket, limit, 60_000)) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Retry-After', '60');
        res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many legal-regulatory requests. Please retry after 60 seconds.',
        });
        return;
      }
      next();
    };

  const handlers = createLegalRegulatoryRouteHandlers({
    getFacade: () => facade,
    authDeps: options.authDeps,
  });

  const router = express.Router();
  router.use(bodySizeGuard);

  // Exact 14 official endpoints matching HANDOFF.md & expressRouteCatalog.ts
  router.get('/provisions/search', rateGuard('general', 30), handlers.handleSearchProvisions);
  router.get('/sources/:sourceId', rateGuard('general', 60), handlers.handleGetRegulatorySource);
  router.post('/sources', rateGuard('general', 20), handlers.handleCreateRegulatorySource);
  router.post('/sources/:sourceId/verify', rateGuard('general', 20), handlers.handleVerifyRegulatorySource);
  router.post('/documents', rateGuard('general', 20), handlers.handleCreateRegulatoryDocument);
  router.get('/provisions/:provisionId', rateGuard('general', 60), handlers.handleGetProvision);
  router.get('/provisions/:provisionId/as-of', rateGuard('general', 60), handlers.handleGetProvisionAsOf);
  router.post('/provisions', rateGuard('general', 20), handlers.handleCreateProvision);
  router.post('/provisions/:provisionId/changes', rateGuard('general', 20), handlers.handleRecordProvisionChange);
  router.post('/conflicts', rateGuard('general', 20), handlers.handleRegisterProvisionConflict);
  router.post('/applicability-rules', rateGuard('general', 20), handlers.handleCreateApplicabilityRule);
  router.post('/compliance-requirements', rateGuard('general', 20), handlers.handleCreateComplianceRequirement);
  router.post('/property-profile/evaluate', rateGuard('general', 10), handlers.handleEvaluatePropertyProfile);
  router.post('/ai-summaries', rateGuard('ai', 5), handlers.handleRecordAiSummary);

  app.use(LEGAL_REGULATORY_BASE_PATH, router);

  return {
    mounted: true,
    basePath: LEGAL_REGULATORY_BASE_PATH,
    routeCount: LEGAL_REGULATORY_ROUTE_SPECS.length,
    router,
  };
}

export interface RouteCatalogAlignmentReport {
  aligned: boolean;
  expectedCount: number;
  catalogCount: number;
  mountedCount: number;
  missingInCatalog: string[];
  extraInCatalog: string[];
  unmountedInRouter: string[];
  mismatches: string[];
}

export function verifyLegalRegulatoryRouteCatalogAlignment(
  catalogRoutes: readonly RegisteredApiRoute[],
  mountedRouter?: Router,
): RouteCatalogAlignmentReport {
  const catalogLrRoutes = catalogRoutes.filter((r) => r.path.startsWith(LEGAL_REGULATORY_BASE_PATH));
  const specMap = new Map(LEGAL_REGULATORY_ROUTE_SPECS.map((s) => [`${s.method} ${s.fullPath}`, s]));
  const catalogMap = new Map<string, RegisteredApiRoute>();
  const mismatches: string[] = [];

  for (const r of catalogLrRoutes) {
    const key = `${r.method} ${r.path}`;
    if (catalogMap.has(key)) mismatches.push(`Duplicate catalog entry: ${key}`);
    catalogMap.set(key, r);
  }

  const missingInCatalog: string[] = [];
  for (const [key, spec] of specMap.entries()) {
    const entry = catalogMap.get(key);
    if (!entry) {
      missingInCatalog.push(key);
      continue;
    }
    if (entry.accessPolicy !== spec.accessPolicy) {
      mismatches.push(`Access policy mismatch on ${key}: expected ${spec.accessPolicy}, found ${entry.accessPolicy}`);
    }
    if (entry.rateLimitBucket !== spec.rateLimitBucket) {
      mismatches.push(`Rate bucket mismatch on ${key}: expected ${spec.rateLimitBucket}, found ${entry.rateLimitBucket}`);
    }
    if (entry.rateLimitPerMinute !== spec.rateLimitPerMinute) {
      mismatches.push(`Rate limit mismatch on ${key}: expected ${spec.rateLimitPerMinute}, found ${entry.rateLimitPerMinute}`);
    }
    if (entry.sourceFile !== 'server/modules/legal-regulatory/routes.ts') {
      mismatches.push(`Source file mismatch on ${key}: found ${entry.sourceFile}`);
    }
  }

  const extraInCatalog: string[] = [];
  for (const key of catalogMap.keys()) {
    if (!specMap.has(key)) extraInCatalog.push(key);
  }

  const unmountedInRouter: string[] = [];
  let mountedCount = LEGAL_REGULATORY_ROUTE_SPECS.length;
  if (mountedRouter) {
    const mountedList = extractMountedExpressRoutes(mountedRouter, LEGAL_REGULATORY_BASE_PATH);
    mountedCount = mountedList.length;
    const mountedSet = new Set(mountedList);
    if (mountedSet.size !== mountedList.length) {
      mismatches.push('Duplicate routes detected in mounted Express router.');
    }
    for (const key of specMap.keys()) {
      if (!mountedSet.has(key)) unmountedInRouter.push(key);
    }
    for (const key of mountedSet) {
      if (!specMap.has(key)) mismatches.push(`Unregistered route mounted on Express router: ${key}`);
    }
  }

  return {
    aligned:
      missingInCatalog.length === 0 &&
      extraInCatalog.length === 0 &&
      unmountedInRouter.length === 0 &&
      mismatches.length === 0,
    expectedCount: LEGAL_REGULATORY_ROUTE_SPECS.length,
    catalogCount: catalogLrRoutes.length,
    mountedCount,
    missingInCatalog,
    extraInCatalog,
    unmountedInRouter,
    mismatches,
  };
}

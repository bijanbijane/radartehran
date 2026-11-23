/**
 * @file worker/migrationRegister.ts
 * @description Phase 2 Route Inventory & Migration Control Register for Tehran Radar.
 * Tracks every API and SEO endpoint across the strangler migration between `server.ts` (Express)
 * and `worker/index.ts` (Cloudflare Workers).
 */
import { REGISTERED_API_ROUTES, type RegisteredApiRoute } from '../src/utils/expressRouteCatalog';
import type {
  RouteMigrationControlEntry,
  RouteMigrationGroup,
  RouteMigrationStatus,
} from './types';

const GROUP_1A_VERIFIED_PATHS = new Set<string>([
  'GET /api/health',
  'GET /api/healthz',
  'GET /api/health/liveness',
  'GET /api/health/readiness',
  'GET /api/openapi.json',
  'GET /manifest.json',
  'GET /sitemap.xml',
  'GET /robots.txt',
]);

const GROUP_1B_VERIFIED_PATHS = new Set<string>([
  'POST /api/v1/ai/intelligent-search',
  'POST /api/ai/gateway/infer',
  'POST /api/v1/ai/gateway/infer',
  'GET /api/v1/commerce/catalog',
  'GET /api/v1/commerce/neighborhood-index',
  'GET /api/v1/commerce/neighborhood-dossier/:hoodId',
  'GET /api/mcp/tools',
  'GET /api/v1/mcp/tools',
  'POST /api/v1/mcp/execute',
  'POST /api/mcp/invoke',
  'POST /api/v1/valuation/verify-seal',
  'GET /api/v1/telemetry/policy',
]);

const GROUP_4_VERIFIED_ACCOUNT_PATHS = new Set<string>([
  'GET /api/account/profile',
  'PATCH /api/account/profile',
  'GET /api/account/privacy',
  'PATCH /api/account/privacy',
  'GET /api/account/sessions',
  'POST /api/account/sessions/:id/revoke',
  'GET /api/account/data-requests',
]);

const GROUP_5_VERIFIED_STORAGE_PATHS = new Set<string>([
  'GET /api/object-storage/status',
  'POST /api/object-storage/upload',
  'POST /api/object-storage/upload-init',
  'POST /api/object-storage/upload-chunk',
  'POST /api/object-storage/upload-complete',
  'GET /api/object-storage/file/:objectId',
  'DELETE /api/object-storage/file/:objectId',
  'POST /api/object-storage/attach-to-bargain',
  'POST /api/object-storage/cleanup-bargain/:bargainId',
]);

const ALIAS_ROUTES: Readonly<Record<string, string>> = {
  'POST /api/market-pulse/deep-sync': 'POST /api/sync-real-prices',
  'GET /api/admin/runtime-config': 'GET /api/admin/env-config',
  'GET /api/admin/runtime-env': 'GET /api/admin/env-config',
  'POST /api/admin/runtime-config': 'POST /api/admin/env-config',
  'POST /api/admin/runtime-env': 'POST /api/admin/env-config',
  'GET /api/mcp/tools': 'GET /api/v1/mcp/tools',
  'POST /api/mcp/invoke': 'POST /api/v1/mcp/execute',
  'POST /api/v1/ai/gateway/infer': 'POST /api/ai/gateway/infer',
  'GET /api/admin/crm/leads': 'GET /api/admin/buyer-alerts',
};

function classifyRouteMigrationMetadata(route: RegisteredApiRoute): {
  migrationGroup: RouteMigrationGroup;
  workerHandlerModule: string | null;
  status: RouteMigrationStatus;
  activeRuntime: 'cloudflare_worker' | 'legacy_express_server';
  dependencies: readonly string[];
  stateStorageTouchpoints: readonly string[];
  externalApiTouchpoints: readonly string[];
  blockerReason?: string;
} {
  const key = `${route.method} ${route.path}`;

  if (GROUP_1A_VERIFIED_PATHS.has(key)) {
    return {
      migrationGroup: 'GROUP_1A_HEALTH_AND_SEO_METADATA',
      workerHandlerModule: 'worker/routes/healthAndMetadataRoutes.ts',
      status: 'VERIFIED',
      activeRuntime: 'cloudflare_worker',
      dependencies: ['src/data/neighborhoods.ts', 'src/data/multiCityData.ts', 'src/utils/serverConfigValidator.ts'],
      stateStorageTouchpoints: ['stateless'],
      externalApiTouchpoints: [],
    };
  }

  if (GROUP_1B_VERIFIED_PATHS.has(key)) {
    return {
      migrationGroup: 'GROUP_1B_STATELESS_INTELLIGENCE_AND_COMMERCE',
      workerHandlerModule: 'worker/routes/intelligenceAndCommerceRoutes.ts',
      status: 'VERIFIED',
      activeRuntime: 'cloudflare_worker',
      dependencies: [
        'src/utils/aiModelRegistryAndGateway.ts',
        'src/utils/dataCommerceMcpAndMonetization.ts',
        'src/cells/valuation-authority/robustValuationEngine.ts',
        'src/utils/telemetryEdgeAggregationEngine.ts',
      ],
      stateStorageTouchpoints: ['stateless_or_ephemeral_isolate_ledger'],
      externalApiTouchpoints: [],
    };
  }

  if (GROUP_4_VERIFIED_ACCOUNT_PATHS.has(key)) {
    return {
      migrationGroup: 'GROUP_4_AUTHENTICATED_USER_WORKFLOWS',
      workerHandlerModule: 'worker/routes/accountRoutes.ts',
      status: 'VERIFIED',
      activeRuntime: 'cloudflare_worker',
      dependencies: ['worker/account/d1AccountRepository.ts', 'worker/auth/sessionAuth.ts', 'worker/routes/authRoutes.ts'],
      stateStorageTouchpoints: ['Cloudflare D1 USER_DB (user_profiles, user_privacy_consents, user_sessions, user_data_requests)'],
      externalApiTouchpoints: ['Firebase Auth JWKS'],
    };
  }

  if (route.sourceFile === 'src/utils/serverObjectStorage.ts' || route.path.startsWith('/api/object-storage/')) {
    if (GROUP_5_VERIFIED_STORAGE_PATHS.has(key)) {
      return {
        migrationGroup: 'GROUP_5_OBJECT_STORAGE_AND_MEDIA',
        workerHandlerModule: 'worker/routes/objectStorageRoutes.ts',
        status: 'VERIFIED',
        activeRuntime: 'cloudflare_worker',
        dependencies: ['worker/routes/objectStorageRoutes.ts', 'worker/storage/r2StorageAdapter.ts', 'worker/db/d1SchemaAndMigrations.ts'],
        stateStorageTouchpoints: ['Cloudflare R2 (MEDIA_BUCKET)', 'Cloudflare D1 (media_objects, upload_sessions, legal_holds)'],
        externalApiTouchpoints: ['Cloudflare R2'],
      };
    }
    return {
      migrationGroup: 'GROUP_5_OBJECT_STORAGE_AND_MEDIA',
      workerHandlerModule: null,
      status: 'BLOCKED',
      activeRuntime: 'legacy_express_server',
      dependencies: ['src/utils/serverObjectStorage.ts', 'src/utils/objectStorageUpload.ts'],
      stateStorageTouchpoints: ['.object-storage-bucket/', 'Firestore object_storage_metadata'],
      externalApiTouchpoints: ['S3/R2 Compatible Object Storage'],
      blockerReason: 'Admin storage audit & reconciliation endpoints remain on legacy Express until operator cutover.',
    };
  }

  if (
    route.path === '/api/market-pulse' ||
    route.path === '/api/air-quality' ||
    route.path === '/api/osm-tile/:z/:x/:y' ||
    route.path === '/api/neighborhood-boundaries/resolve' ||
    route.path === '/api/telegram-digest' ||
    route.path === '/api/v1/reference/hood/:hoodId/rollup'
  ) {
    return {
      migrationGroup: 'GROUP_2_PUBLIC_MARKET_AND_GEO_READS',
      workerHandlerModule: null,
      status: 'DISCOVERED',
      activeRuntime: 'legacy_express_server',
      dependencies: [route.sourceFile],
      stateStorageTouchpoints: ['.cache-data.json', '.osm-boundaries-cache.json'],
      externalApiTouchpoints: ['Open-Meteo AQI', 'OSM Tile / Nominatim / Overpass', 'Neshan API'],
      blockerReason: 'Scheduled for Phase 3 KV/D1 cache adapter replacement of disk `.cache-data.json`.',
    };
  }

  if (route.path.includes('/telemetry') || route.path === '/api/track-call') {
    return {
      migrationGroup: 'GROUP_3_TELEMETRY_AND_EDGE_INGESTION',
      workerHandlerModule: null,
      status: 'DISCOVERED',
      activeRuntime: 'legacy_express_server',
      dependencies: [route.sourceFile],
      stateStorageTouchpoints: ['Telemetry WAL / In-memory ring buffer'],
      externalApiTouchpoints: [],
      blockerReason: 'Scheduled for Phase 3 Cloudflare Queues / D1 telemetry batch sink.',
    };
  }

  if (route.adminOnly || route.path.startsWith('/api/admin/')) {
    return {
      migrationGroup: 'GROUP_6_ADMIN_GOVERNANCE_AND_SYNC',
      workerHandlerModule: null,
      status: 'BLOCKED',
      activeRuntime: 'legacy_express_server',
      dependencies: [route.sourceFile, 'src/utils/serverAdminAndTelegramSecurity.ts'],
      stateStorageTouchpoints: ['.runtime-config.json', '.cache-data.json', 'Firestore'],
      externalApiTouchpoints: ['Gemini API', 'Telegram Bot API', 'Firebase Auth Admin'],
      blockerReason: 'Requires Phase 3 Web Crypto Firebase JWT verifier and D1/KV runtime config store.',
    };
  }

  return {
    migrationGroup: 'GROUP_4_AUTHENTICATED_USER_WORKFLOWS',
    workerHandlerModule: null,
    status: 'BLOCKED',
    activeRuntime: 'legacy_express_server',
    dependencies: [route.sourceFile, 'src/utils/identityLifecycleAndBackendGovernance.ts'],
    stateStorageTouchpoints: ['Firestore', '.cache-data.json'],
    externalApiTouchpoints: ['Firebase Auth', 'Gemini API'],
    blockerReason: 'Requires Phase 3 Worker-native Firebase ID token verification and D1/Firestore REST adapter.',
  };
}

const WORKER_NATIVE_HEALTH_ROUTE: RouteMigrationControlEntry = {
  routeId: 'CF-ROUTE-000',
  method: 'GET',
  path: '/api/health',
  mountClassification: 'ACTIVE_MOUNTED',
  expressSourceModule: 'worker/routes/healthAndMetadataRoutes.ts',
  workerHandlerModule: 'worker/routes/healthAndMetadataRoutes.ts',
  migrationGroup: 'GROUP_1A_HEALTH_AND_SEO_METADATA',
  status: 'VERIFIED',
  activeRuntime: 'cloudflare_worker',
  authRequirement: 'PUBLIC',
  rateLimitBucket: 'general',
  rateLimitPerMinute: 180,
  usedByFrontend: false,
  dependencies: ['worker/contextAndSecurity.ts'],
  stateStorageTouchpoints: ['stateless'],
  externalApiTouchpoints: [],
  rollbackStrategy: 'Bypass Worker route in wrangler.jsonc or route traffic back to Express /api/healthz.',
};

export const ROUTE_MIGRATION_CONTROL_REGISTER: readonly RouteMigrationControlEntry[] = [
  WORKER_NATIVE_HEALTH_ROUTE,
  ...REGISTERED_API_ROUTES.map((route, index): RouteMigrationControlEntry => {
    const key = `${route.method} ${route.path}`;
    const aliasTarget = ALIAS_ROUTES[key];
    const meta = classifyRouteMigrationMetadata(route);
    return {
      routeId: `CF-ROUTE-${String(index + 1).padStart(3, '0')}`,
      method: route.method,
      path: route.path,
      mountClassification: aliasTarget ? 'COMPATIBILITY_ALIAS' : 'ACTIVE_MOUNTED',
      aliasOfPath: aliasTarget,
      expressSourceModule: route.sourceFile,
      workerHandlerModule: meta.workerHandlerModule,
      migrationGroup: meta.migrationGroup,
      status: meta.status,
      activeRuntime: meta.activeRuntime,
      authRequirement: route.accessPolicy,
      rateLimitBucket: route.rateLimitBucket,
      rateLimitPerMinute: route.rateLimitPerMinute,
      usedByFrontend: route.usedByFrontend,
      dependencies: meta.dependencies,
      stateStorageTouchpoints: meta.stateStorageTouchpoints,
      externalApiTouchpoints: meta.externalApiTouchpoints,
      rollbackStrategy:
        'Set status to ROLLED_BACK in worker/migrationRegister.ts to return explicit 501 fallback or proxy to legacy Express.',
      blockerReason: meta.blockerReason,
    };
  }),
];

/**
 * Unmounted modular enterprise backend domains (Employees 53–63) tracked separately
 * so they are never confused with active production routes in `server.ts`.
 */
export const UNMOUNTED_ENTERPRISE_DOMAIN_MODULES: ReadonlyArray<{
  domainId: string;
  employeeTask: string;
  sourceDir: string;
  mountClassification: 'UNMOUNTED_DOMAIN_MODULE';
  migrationPlan: string;
}> = [
  { domainId: 'transactions', employeeTask: 'Employee 53', sourceDir: 'server/modules/transactions', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 transactional workflow migration' },
  { domainId: 'ledger', employeeTask: 'Employee 54', sourceDir: 'server/modules/ledger', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 double-entry financial ledger migration' },
  { domainId: 'tenancy', employeeTask: 'Employee 55', sourceDir: 'server/modules/tenancy', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 rental & lease lifecycle migration' },
  { domainId: 'building-operations', employeeTask: 'Employee 56', sourceDir: 'server/modules/building-operations', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 building operations & HOA migration' },
  { domainId: 'brokerage', employeeTask: 'Employee 57', sourceDir: 'server/modules/brokerage', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 brokerage & commission management migration' },
  { domainId: 'valuation', employeeTask: 'Employee 59', sourceDir: 'server/modules/valuation', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 hedonic valuation & AVM governance migration' },
  { domainId: 'market-intelligence', employeeTask: 'Employee 60', sourceDir: 'server/modules/market-intelligence', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 neighborhood analytics & market trends migration' },
  { domainId: 'geospatial', employeeTask: 'Employee 61', sourceDir: 'server/modules/geospatial', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 GIS & spatial intelligence migration' },
  { domainId: 'data-governance', employeeTask: 'Employee 62', sourceDir: 'server/modules/data-governance', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 MDM & data quality governance migration' },
  { domainId: 'document-management', employeeTask: 'Employee 63', sourceDir: 'server/modules/document-management', mountClassification: 'UNMOUNTED_DOMAIN_MODULE', migrationPlan: 'Phase 4 D1 + R2 digital records & contract lifecycle migration' },
];

/**
 * Matches an incoming HTTP method and pathname against `ROUTE_MIGRATION_CONTROL_REGISTER`,
 * supporting Express-style `:param` segments.
 */
export function findMigrationRegisterEntry(
  method: string,
  pathname: string
): { entry: RouteMigrationControlEntry; params: Record<string, string> } | null {
  const normalizedMethod = method.toUpperCase();
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  for (const entry of ROUTE_MIGRATION_CONTROL_REGISTER) {
    if (entry.method !== normalizedMethod) continue;
    if (entry.path === cleanPath) {
      return { entry, params: {} };
    }
    if (entry.path.includes(':')) {
      const patternSegments = entry.path.split('/');
      const pathSegments = cleanPath.split('/');
      if (patternSegments.length !== pathSegments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < patternSegments.length; i++) {
        const pat = patternSegments[i];
        const seg = pathSegments[i];
        if (pat.startsWith(':')) {
          params[pat.slice(1)] = decodeURIComponent(seg);
        } else if (pat !== seg) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return { entry, params };
      }
    }
  }
  return null;
}

export function getMigrationProgressSummary(): {
  totalCatalogRoutes: number;
  verifiedWorkerRoutes: number;
  discoveredRoutes: number;
  blockedRoutes: number;
  unmountedEnterpriseModules: number;
} {
  let verifiedWorkerRoutes = 0;
  let discoveredRoutes = 0;
  let blockedRoutes = 0;
  for (const entry of ROUTE_MIGRATION_CONTROL_REGISTER) {
    if (entry.status === 'VERIFIED') verifiedWorkerRoutes += 1;
    else if (entry.status === 'DISCOVERED') discoveredRoutes += 1;
    else if (entry.status === 'BLOCKED') blockedRoutes += 1;
  }
  return {
    totalCatalogRoutes: ROUTE_MIGRATION_CONTROL_REGISTER.length,
    verifiedWorkerRoutes,
    discoveredRoutes,
    blockedRoutes,
    unmountedEnterpriseModules: UNMOUNTED_ENTERPRISE_DOMAIN_MODULES.length,
  };
}

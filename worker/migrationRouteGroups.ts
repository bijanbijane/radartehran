/** Declarative route-group and compatibility-alias inventory for migrationRegister. */
export const GROUP_1A_VERIFIED_PATHS = new Set<string>([
  'GET /api/health',
  'GET /api/healthz',
  'GET /api/health/liveness',
  'GET /api/health/readiness',
  'GET /api/health/database-triad',
  'GET /api/openapi.json',
  'GET /manifest.json',
  'GET /sitemap.xml',
  'GET /robots.txt',
]);

export const GROUP_2_IRNI_RPC_V2_PATHS = new Set<string>([
  'GET /api/v2/reference/irni/canonical/metadata',
  'GET /api/v2/reference/irni/canonical/entities',
  'GET /api/v2/reference/irni/canonical/entities/:geographicEntityId',
  'GET /api/v2/reference/irni/canonical/entities/:geographicEntityId/relationships',
  'GET /api/v2/reference/irni/canonical/resolve',
  'GET /api/v2/reference/irni/canonical/aliases',
]);

export const GROUP_1B_VERIFIED_PATHS = new Set<string>([
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

export const GROUP_3A_AUTH_PATHS = new Set<string>([
  'GET /api/auth/google/start',
  'GET /api/auth/google/callback',
  'POST /api/auth/phone/start',
  'POST /api/auth/phone/verify',
  'GET /api/auth/session',
  'POST /api/auth/logout',
]);

export const GROUP_4_ACCOUNT_PATHS = new Set<string>([
  'GET /api/account/profile', 'PATCH /api/account/profile',
  'GET /api/account/privacy', 'PATCH /api/account/privacy',
  'GET /api/account/sessions', 'POST /api/account/sessions/:id/revoke',
  'GET /api/account/data-requests', 'POST /api/account/data-requests',
  'GET /api/account/export-data', 'POST /api/account/deletion-requests',
  'POST /api/account/deletion-requests/reconcile', 'GET /api/account/favorites',
  'PUT /api/account/favorites', 'POST /api/account/favorites', 'DELETE /api/account/favorites',
]);

export const GROUP_4_MARKETPLACE_PATHS = new Set<string>([
  'GET /api/v1/market/state',
  'POST /api/v1/market/votes',
  'PUT /api/v1/market/preferences',
  'POST /api/v1/market/bargains',
  'POST /api/v1/market/sponsor-requests',
  'POST /api/v1/market/buyer-alerts',
  'PUT /api/v1/admin/market/neighborhood-overrides',
  'PUT /api/v1/admin/market/neighborhood-overrides/batch',
  'POST /api/v1/admin/market/sponsors/approve',
  'POST /api/v1/admin/market/sponsors/release',
  'DELETE /api/v1/admin/market/sponsor-requests/:requestId',
]);

export const GROUP_5_VERIFIED_STORAGE_PATHS = new Set<string>([
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

export const ALIAS_ROUTES: Readonly<Record<string, string>> = {
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

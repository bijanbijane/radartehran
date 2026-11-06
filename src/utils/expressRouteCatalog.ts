import { formatMillionTomanAsIntlCurrency } from './areaUnit';

export type ApiAccessPolicy = 'PUBLIC' | 'VERIFIED_USER' | 'RESOURCE_OWNER_OR_ADMIN' | 'ADMIN' | 'PRIMARY_ADMIN';
export type ApiRouteMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export interface ApiEndpointContract { method: ApiRouteMethod; path: string; summary: string; authRequired: boolean; adminOnly: boolean; accessPolicy: ApiAccessPolicy; rateLimitPerMinute: number; }
export interface RegisteredApiRoute extends ApiEndpointContract { sourceFile: string; authLevel: 'PUBLIC' | 'FIREBASE_AUTHENTICATED_USER' | 'VERIFIED_ADMIN_ONLY'; rateLimitBucket: 'general' | 'sync' | 'ai' | 'lead' | 'upload' | 'call_track' | 'tile_proxy'; usedByFrontend: boolean; businessPurpose: string; }
function route(method: ApiRouteMethod, path: string, sourceFile: string, access: ApiAccessPolicy, rate: number, bucket: RegisteredApiRoute['rateLimitBucket'], usedByFrontend: boolean, summary: string): RegisteredApiRoute {
  const adminOnly = access === 'ADMIN' || access === 'PRIMARY_ADMIN';
  const authLevel = access === 'PUBLIC' ? 'PUBLIC' : adminOnly ? 'VERIFIED_ADMIN_ONLY' : 'FIREBASE_AUTHENTICATED_USER';
  return { method, path, sourceFile, summary, authRequired: access !== 'PUBLIC', adminOnly, accessPolicy: access, rateLimitPerMinute: rate, authLevel, rateLimitBucket: bucket, usedByFrontend, businessPurpose: summary };
}
const S = 'server.ts';
const AI = 'src/utils/serverAiAndCommerceRoutes.ts';
const BK = 'src/utils/serverBackupAndChunkUploadRoutes.ts';
const OB = 'src/utils/serverObjectStorage.ts';
const PB = 'src/utils/serverPublisherBargains.ts';
const SP = 'src/utils/serverSponsorAndBargainRoutes.ts';
const UT = 'src/utils/serverUtilityRoutes.ts';
export const REGISTERED_API_ROUTES: readonly RegisteredApiRoute[] = [
  route('GET', '/api/healthz', S, 'PUBLIC', 180, 'general', false, 'Public liveness probe'),
  route('GET', '/api/openapi.json', S, 'PUBLIC', 60, 'general', false, 'OpenAPI 3.1 specification'),
  route('GET', '/manifest.json', 'src/utils/serverSeoAndSitemap.ts', 'PUBLIC', 60, 'general', true, 'Web app manifest'),
  route('GET', '/sitemap.xml', 'src/utils/serverSeoAndSitemap.ts', 'PUBLIC', 60, 'general', true, 'Public sitemap'),
  route('GET', '/robots.txt', 'src/utils/serverSeoAndSitemap.ts', 'PUBLIC', 60, 'general', true, 'Crawler rules'),
  route('GET', '/api/system-health', S, 'ADMIN', 60, 'general', true, 'Admin system health and redacted telemetry'),
  route('GET', '/api/market-pulse', S, 'PUBLIC', 180, 'general', true, 'Read-only market pulse; refresh=1 is admin-only'),
  route('POST', '/api/sync-real-prices', S, 'ADMIN', 3, 'sync', true, 'Admin deep market synchronization'),
  route('POST', '/api/market-pulse/deep-sync', S, 'ADMIN', 3, 'sync', false, 'Admin deep market synchronization alias'),
  route('POST', '/api/market-pulse/refresh', S, 'ADMIN', 3, 'sync', true, 'Admin explicit market-pulse refresh'),
  route('GET', '/api/air-quality', S, 'PUBLIC', 180, 'general', true, 'Public air-quality reading'),
  route('GET', '/api/admin/env-config', S, 'ADMIN', 30, 'general', true, 'Admin redacted runtime configuration'),
  route('GET', '/api/admin/runtime-config', S, 'ADMIN', 30, 'general', true, 'Admin redacted runtime configuration alias'),
  route('GET', '/api/admin/runtime-env', S, 'ADMIN', 30, 'general', true, 'Admin redacted runtime configuration alias'),
  route('POST', '/api/admin/env-config', S, 'PRIMARY_ADMIN', 10, 'general', true, 'Primary admin runtime setting update'),
  route('POST', '/api/admin/runtime-config', S, 'PRIMARY_ADMIN', 10, 'general', false, 'Primary admin runtime setting update alias'),
  route('POST', '/api/admin/runtime-env', S, 'PRIMARY_ADMIN', 10, 'general', true, 'Primary admin runtime setting update alias'),
  route('GET', '/api/osm-tile/:z/:x/:y', 'src/utils/osmTileProxy.ts', 'PUBLIC', 360, 'tile_proxy', true, 'Rate-limited OSM tile proxy'),
  route('GET', '/api/admin/rmep-status', AI, 'ADMIN', 30, 'general', true, 'Admin execution-state status'),
  route('GET', '/api/admin/architecture-and-ai-registry', AI, 'ADMIN', 30, 'general', true, 'Admin architecture and AI registry'),
  route('POST', '/api/admin/ai-routing', AI, 'ADMIN', 20, 'ai', true, 'Admin AI routing update'),
  route('POST', '/api/admin/ai-routing/rollback', AI, 'ADMIN', 20, 'ai', true, 'Admin AI routing rollback'),
  route('POST', '/api/v1/ai/intelligent-search', AI, 'PUBLIC', 30, 'ai', true, 'Persian housing search'),
  route('GET', '/api/v1/commerce/catalog', AI, 'PUBLIC', 60, 'general', true, 'Commerce catalog'),
  route('GET', '/api/v1/commerce/neighborhood-index', AI, 'PUBLIC', 60, 'general', true, 'Neighborhood commerce index'),
  route('GET', '/api/mcp/tools', AI, 'PUBLIC', 60, 'general', true, 'MCP tool list alias'),
  route('GET', '/api/v1/mcp/tools', AI, 'PUBLIC', 60, 'general', true, 'MCP tool list'),
  route('POST', '/api/v1/mcp/execute', AI, 'PUBLIC', 30, 'ai', true, 'Authorized MCP tool execution'),
  route('POST', '/api/mcp/invoke', AI, 'PUBLIC', 30, 'ai', true, 'MCP tool execution alias'),
  route('POST', '/api/ai/gateway/infer', AI, 'PUBLIC', 20, 'ai', true, 'AI gateway inference'),
  route('POST', '/api/v1/ai/gateway/infer', AI, 'PUBLIC', 20, 'ai', true, 'AI gateway inference alias'),
  route('GET', '/api/v1/commerce/neighborhood-dossier/:hoodId', AI, 'PUBLIC', 30, 'general', true, 'Neighborhood dossier, including payment challenge'),
  route('POST', '/api/admin/circuit-breaker', BK, 'PRIMARY_ADMIN', 10, 'general', true, 'Primary admin integration circuit breaker'),
  route('POST', '/api/admin/backup/export', BK, 'PRIMARY_ADMIN', 5, 'general', true, 'Primary admin encrypted backup export'),
  route('POST', '/api/admin/backup/restore', BK, 'PRIMARY_ADMIN', 5, 'general', true, 'Primary admin encrypted backup restore'),
  route('POST', '/api/object-storage/upload-init', BK, 'VERIFIED_USER', 12, 'upload', true, 'Chunked upload session init'),
  route('POST', '/api/object-storage/upload-chunk', BK, 'VERIFIED_USER', 120, 'upload', true, 'Chunked upload part transfer'),
  route('POST', '/api/object-storage/upload-complete', BK, 'VERIFIED_USER', 12, 'upload', true, 'Chunked upload assembly'),
  route('POST', '/api/neighborhood-boundaries/resolve', 'src/utils/serverBoundaryProtocol.ts', 'PUBLIC', 60, 'general', true, 'Neighborhood GeoJSON resolution'),
  route('GET', '/api/object-storage/status', OB, 'PUBLIC', 120, 'general', true, 'Public object-storage limits'),
  route('GET', '/api/object-storage/admin/status', OB, 'ADMIN', 30, 'general', true, 'Admin object-storage status'),
  route('POST', '/api/object-storage/upload', OB, 'VERIFIED_USER', 8, 'upload', true, 'Authenticated media upload'),
  route('POST', '/api/object-storage/attach-to-bargain', OB, 'RESOURCE_OWNER_OR_ADMIN', 20, 'upload', true, 'Attach stored media to a bargain'),
  route('POST', '/api/object-storage/cleanup-bargain/:bargainId', OB, 'ADMIN', 20, 'upload', true, 'Admin bargain media cleanup'),
  route('GET', '/api/object-storage/file/:objectId', OB, 'PUBLIC', 180, 'general', true, 'Media download with byte ranges'),
  route('DELETE', '/api/object-storage/file/:objectId', OB, 'RESOURCE_OWNER_OR_ADMIN', 20, 'upload', true, 'Owner or admin media deletion'),
  route('POST', '/api/object-storage/admin/reconcile-pending-deletes', OB, 'ADMIN', 10, 'general', true, 'Admin pending-delete reconciliation'),
  route('POST', '/api/object-storage/admin/orphan-audit/jobs', OB, 'ADMIN', 10, 'general', true, 'Admin orphan-audit job creation'),
  route('POST', '/api/object-storage/admin/orphan-audit/jobs/:auditId/step', OB, 'ADMIN', 30, 'general', true, 'Admin orphan-audit step'),
  route('GET', '/api/object-storage/admin/orphan-audit/jobs/:auditId', OB, 'ADMIN', 30, 'general', true, 'Admin orphan-audit job read'),
  route('GET', '/api/health/liveness', PB, 'PUBLIC', 180, 'general', false, 'Process liveness'),
  route('GET', '/api/health/readiness', PB, 'PUBLIC', 180, 'general', false, 'Process readiness'),
  route('GET', '/api/my-bargains', PB, 'VERIFIED_USER', 60, 'general', true, 'Owner bargain list'),
  route('POST', '/api/my-bargains', PB, 'VERIFIED_USER', 30, 'general', true, 'Owner bargain create'),
  route('PATCH', '/api/my-bargains/:id', PB, 'RESOURCE_OWNER_OR_ADMIN', 30, 'general', true, 'Owner or admin bargain update'),
  route('DELETE', '/api/my-bargains/:id', PB, 'RESOURCE_OWNER_OR_ADMIN', 30, 'general', true, 'Owner or admin bargain delete'),
  route('POST', '/api/bargains/:id/reveal-contact', PB, 'PUBLIC', 30, 'general', true, 'Reveal bargain contact; authentication changes the payload'),
  route('POST', '/api/data-corrections', PB, 'PUBLIC', 20, 'general', true, 'Submit a data correction; reporter uid is stored when signed in'),
  route('GET', '/api/account/export-data', PB, 'VERIFIED_USER', 10, 'general', true, 'Export the caller account data'),
  route('POST', '/api/account/delete', PB, 'VERIFIED_USER', 5, 'general', true, 'Delete the caller account data'),
  route('POST', '/api/sponsors/reserve', SP, 'VERIFIED_USER', 10, 'lead', true, 'Authenticated sponsor reservation'),
  route('POST', '/api/admin/sponsors/approve', SP, 'ADMIN', 20, 'general', true, 'Admin sponsor approval'),
  route('POST', '/api/admin/sponsors/extend', SP, 'ADMIN', 20, 'general', true, 'Admin sponsor extension'),
  route('POST', '/api/admin/sponsors/release', SP, 'ADMIN', 20, 'general', true, 'Admin sponsor release'),
  route('POST', '/api/bargains/validate-financials', SP, 'VERIFIED_USER', 30, 'general', true, 'Bargain financial validation'),
  route('POST', '/api/admin/bargains/approve', SP, 'ADMIN', 30, 'general', true, 'Admin bargain approval'),
  route('POST', '/api/contract-check', UT, 'PUBLIC', 20, 'ai', true, 'Legal rule engine and contract analysis'),
  route('GET', '/api/telegram-digest', UT, 'PUBLIC', 30, 'general', true, 'Telegram digest preview'),
  route('POST', '/api/send-telegram', UT, 'ADMIN', 10, 'sync', true, 'Admin Telegram broadcast'),
  route('GET', '/api/admin/buyer-alerts', UT, 'ADMIN', 30, 'general', true, 'Admin buyer-alert list'),
  route('GET', '/api/admin/crm/leads', UT, 'ADMIN', 30, 'general', true, 'Admin CRM lead list'),
  route('POST', '/api/buyer-alerts', UT, 'VERIFIED_USER', 5, 'lead', true, 'Authenticated buyer-alert submission'),
  route('POST', '/api/track-call', UT, 'PUBLIC', 20, 'call_track', true, 'Anonymized sponsor call click'),
];
export const API_ENDPOINT_CONTRACTS: readonly ApiEndpointContract[] = REGISTERED_API_ROUTES;
export const RADAR_API_ROUTE_INVENTORY: readonly RegisteredApiRoute[] = REGISTERED_API_ROUTES;
export function registeredRouteCatalogLabel(): string {
  return formatMillionTomanAsIntlCurrency(REGISTERED_API_ROUTES.length, 'USD', 'en');
}

import express from 'express';
import crypto from 'crypto';
import {
  PlatformFoundationStore,
  CoreApiError,
  getRequestTraceContext,
  sendCanonicalSuccess,
  sendCanonicalError,
  verifiedAdminContextMiddleware,
  requireAdminPermission,
  clampPageSize,
  paginateArray,
} from '../platform-foundation/index.ts';

export type CacheNamespaceCode =
  | 'PUBLIC_REFERENCE'
  | 'PUBLIC_LISTING_PROJECTION'
  | 'TENANT_PRIVATE'
  | 'USER_PRIVATE'
  | 'SEARCH_RESULTS'
  | 'VALUATION_RESULTS'
  | 'GEOGRAPHIC_REFERENCE'
  | 'ANALYTICAL_SUMMARY'
  | 'CONFIGURATION_DATA';

export interface CacheNamespaceRecord {
  namespaceCode: CacheNamespaceCode;
  ownerModule: string;
  tenantScoped: boolean;
  userScoped: boolean;
  allowStaleWhileRevalidate: boolean;
  allowNegativeCaching: boolean;
  sensitiveClassification: 'PUBLIC' | 'INTERNAL' | 'TENANT_CONFIDENTIAL' | 'RESTRICTED';
  createdAt: string;
}

export interface CachePolicyRecord {
  policyId: string;
  namespaceCode: CacheNamespaceCode;
  baseTtlSeconds: number;
  maxJitterSeconds: number;
  staleWhileRevalidateSeconds: number;
  negativeCacheTtlSeconds: number;
  singleFlightEnabled: boolean;
  maxPayloadBytes: number;
  version: number;
  updatedAt: string;
}

export interface CacheKeyContext {
  namespaceCode: CacheNamespaceCode;
  entityType: string;
  entityId: string;
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  permissionVersion?: string;
  locale?: string;
  dataVersion?: string;
  modelVersion?: string;
  geoContext?: string;
  queryParams?: Record<string, string | number | boolean>;
}

export interface CacheEntryEnvelope<T = unknown> {
  key: string;
  namespaceCode: CacheNamespaceCode;
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  entityType: string;
  entityId: string;
  value: T;
  isNegativeCache: boolean;
  createdAtMs: number;
  expiresAtMs: number;
  staleUntilMs: number;
  dataVersion: string;
  hitCount: number;
}

export type ResourceBudgetCategory =
  | 'API'
  | 'EXPENSIVE_QUERY'
  | 'VALUATION'
  | 'SEARCH'
  | 'EXTERNAL_PROVIDER'
  | 'BACKGROUND_PROCESSING'
  | 'ANALYTICAL_READ';

export interface ResourceBudgetPolicy {
  budgetId: string;
  category: ResourceBudgetCategory;
  tenantId: string; // '*' for global default
  maxConcurrent: number;
  maxRequestsPerMinute: number;
  maxExecutionMs: number;
  maxPayloadBytes: number;
  updatedAt: string;
}

export interface SlowQueryProfileRecord {
  profileId: string;
  operationName: string;
  collectionOrTable: string;
  tenantId?: string;
  durationMs: number;
  rowsScanned: number;
  usedIndex: boolean;
  recommendedCompositeIndex?: string[];
  recordedAt: string;
}

const FORBIDDEN_CACHE_PATTERNS = [
  /password/i,
  /secret/i,
  /private_key/i,
  /card_number/i,
  /cvv/i,
  /bearer\s+/i,
  /unrestricted_document/i,
];

export class CachingAndPerformanceService {
  private namespaces = new Map<CacheNamespaceCode, CacheNamespaceRecord>();
  private policies = new Map<CacheNamespaceCode, CachePolicyRecord>();
  private store = new Map<string, CacheEntryEnvelope>();
  private inFlight = new Map<string, Promise<unknown>>();
  private budgets = new Map<string, ResourceBudgetPolicy>();
  private activeExecutions = new Map<string, number>();
  private minuteCounters = new Map<string, { windowStartMs: number; count: number }>();
  private slowQueries: SlowQueryProfileRecord[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    negativeHits: 0,
    singleFlightCoalesced: 0,
    invalidations: 0,
  };

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const now = new Date().toISOString();
    const defaultNamespaces: CacheNamespaceRecord[] = [
      {
        namespaceCode: 'PUBLIC_REFERENCE',
        ownerModule: 'EMP_62_MASTER_DATA_QUALITY',
        tenantScoped: false,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: true,
        sensitiveClassification: 'PUBLIC',
        createdAt: now,
      },
      {
        namespaceCode: 'PUBLIC_LISTING_PROJECTION',
        ownerModule: 'EMP_58_PROPERTY_DOMAIN_CORE',
        tenantScoped: false,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: true,
        sensitiveClassification: 'PUBLIC',
        createdAt: now,
      },
      {
        namespaceCode: 'TENANT_PRIVATE',
        ownerModule: 'EMP_74_ENTERPRISE_MULTI_TENANCY',
        tenantScoped: true,
        userScoped: false,
        allowStaleWhileRevalidate: false,
        allowNegativeCaching: false,
        sensitiveClassification: 'TENANT_CONFIDENTIAL',
        createdAt: now,
      },
      {
        namespaceCode: 'USER_PRIVATE',
        ownerModule: 'EMP_64_USER_EXPERIENCE_PERSONALIZATION',
        tenantScoped: true,
        userScoped: true,
        allowStaleWhileRevalidate: false,
        allowNegativeCaching: false,
        sensitiveClassification: 'RESTRICTED',
        createdAt: now,
      },
      {
        namespaceCode: 'SEARCH_RESULTS',
        ownerModule: 'EMP_69_SEARCH_DISCOVERY_RECOMMENDATION',
        tenantScoped: true,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: true,
        sensitiveClassification: 'INTERNAL',
        createdAt: now,
      },
      {
        namespaceCode: 'VALUATION_RESULTS',
        ownerModule: 'EMP_59_HEDONIC_VALUATION_ENGINE',
        tenantScoped: true,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: false,
        sensitiveClassification: 'INTERNAL',
        createdAt: now,
      },
      {
        namespaceCode: 'GEOGRAPHIC_REFERENCE',
        ownerModule: 'EMP_61_GEOSPATIAL_INTELLIGENCE',
        tenantScoped: false,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: true,
        sensitiveClassification: 'PUBLIC',
        createdAt: now,
      },
      {
        namespaceCode: 'ANALYTICAL_SUMMARY',
        ownerModule: 'EMP_79_DATA_WAREHOUSE_ANALYTICS',
        tenantScoped: true,
        userScoped: false,
        allowStaleWhileRevalidate: true,
        allowNegativeCaching: false,
        sensitiveClassification: 'TENANT_CONFIDENTIAL',
        createdAt: now,
      },
      {
        namespaceCode: 'CONFIGURATION_DATA',
        ownerModule: 'EMP_76_DISTRIBUTED_CACHING_PERFORMANCE',
        tenantScoped: true,
        userScoped: false,
        allowStaleWhileRevalidate: false,
        allowNegativeCaching: false,
        sensitiveClassification: 'INTERNAL',
        createdAt: now,
      },
    ];

    for (const ns of defaultNamespaces) {
      this.namespaces.set(ns.namespaceCode, ns);
      this.policies.set(ns.namespaceCode, {
        policyId: `policy_${ns.namespaceCode.toLowerCase()}`,
        namespaceCode: ns.namespaceCode,
        baseTtlSeconds: ns.tenantScoped ? 120 : 300,
        maxJitterSeconds: 15,
        staleWhileRevalidateSeconds: ns.allowStaleWhileRevalidate ? 60 : 0,
        negativeCacheTtlSeconds: ns.allowNegativeCaching ? 30 : 0,
        singleFlightEnabled: true,
        maxPayloadBytes: 262_144,
        version: 1,
        updatedAt: now,
      });
    }

    const categories: ResourceBudgetCategory[] = [
      'API',
      'EXPENSIVE_QUERY',
      'VALUATION',
      'SEARCH',
      'EXTERNAL_PROVIDER',
      'BACKGROUND_PROCESSING',
      'ANALYTICAL_READ',
    ];
    for (const category of categories) {
      const budgetId = `budget_${category.toLowerCase()}_default`;
      this.budgets.set(budgetId, {
        budgetId,
        category,
        tenantId: '*',
        maxConcurrent: category === 'EXPENSIVE_QUERY' ? 5 : 25,
        maxRequestsPerMinute: category === 'EXPENSIVE_QUERY' ? 60 : 600,
        maxExecutionMs: category === 'ANALYTICAL_READ' ? 8000 : 3000,
        maxPayloadBytes: 1_048_576,
        updatedAt: now,
      });
    }
  }

  buildDeterministicCacheKey(ctx: CacheKeyContext): string {
    const ns = this.namespaces.get(ctx.namespaceCode);
    if (!ns) {
      throw new CoreApiError('VALIDATION_FAILED', `Unknown cache namespace: ${ctx.namespaceCode}`, 400);
    }
    if (ns.tenantScoped && (!ctx.tenantId || !ctx.tenantId.trim())) {
      throw new CoreApiError(
        'TENANT_ISOLATION_VIOLATION',
        `Namespace ${ctx.namespaceCode} requires an explicit tenantId in the cache key`,
        403
      );
    }
    if (ns.userScoped && (!ctx.userId || !ctx.userId.trim())) {
      throw new CoreApiError(
        'TENANT_ISOLATION_VIOLATION',
        `Namespace ${ctx.namespaceCode} requires an explicit userId in the cache key`,
        403
      );
    }

    const normalizedParams = ctx.queryParams
      ? Object.keys(ctx.queryParams)
          .sort()
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(ctx.queryParams![k]))}`)
          .join('&')
      : '';

    const segments = [
      `ns:${ctx.namespaceCode}`,
      `t:${ctx.tenantId || 'public'}`,
      `org:${ctx.organizationId || 'none'}`,
      `u:${ctx.userId || 'anon'}`,
      `pv:${ctx.permissionVersion || 'v1'}`,
      `loc:${ctx.locale || 'fa-IR'}`,
      `dv:${ctx.dataVersion || 'v1'}`,
      `mv:${ctx.modelVersion || 'hedonic-v1'}`,
      `geo:${ctx.geoContext || 'all'}`,
      `ent:${ctx.entityType}:${ctx.entityId}`,
      `q:${normalizedParams ? crypto.createHash('sha256').update(normalizedParams).digest('hex').slice(0, 16) : 'none'}`,
    ];
    return segments.join('|');
  }

  private assertCacheablePayload(value: unknown, maxBytes: number): void {
    const serialized = JSON.stringify(value ?? null);
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new CoreApiError('VALIDATION_FAILED', 'Cache payload exceeds namespace maxPayloadBytes budget', 400);
    }
    for (const pattern of FORBIDDEN_CACHE_PATTERNS) {
      if (pattern.test(serialized)) {
        throw new CoreApiError(
          'SECURITY_POLICY_VIOLATION',
          'Secrets, credentials, payment secrets, or unrestricted private documents cannot be stored in cache',
          400
        );
      }
    }
  }

  set<T>(
    ctx: CacheKeyContext,
    value: T,
    options?: { isNegativeCache?: boolean; deterministicJitterSeed?: number }
  ): CacheEntryEnvelope<T> {
    const ns = this.namespaces.get(ctx.namespaceCode)!;
    const policy = this.policies.get(ctx.namespaceCode)!;
    const key = this.buildDeterministicCacheKey(ctx);

    if (options?.isNegativeCache && !ns.allowNegativeCaching) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        `Negative caching is forbidden for namespace ${ctx.namespaceCode}`,
        400
      );
    }

    this.assertCacheablePayload(value, policy.maxPayloadBytes);

    const nowMs = Date.now();
    const jitterSec =
      policy.maxJitterSeconds > 0
        ? (options?.deterministicJitterSeed ?? nowMs % policy.maxJitterSeconds) % (policy.maxJitterSeconds + 1)
        : 0;
    const ttlSec = options?.isNegativeCache ? policy.negativeCacheTtlSeconds : policy.baseTtlSeconds + jitterSec;
    const expiresAtMs = nowMs + ttlSec * 1000;
    const staleUntilMs =
      ns.allowStaleWhileRevalidate && !options?.isNegativeCache
        ? expiresAtMs + policy.staleWhileRevalidateSeconds * 1000
        : expiresAtMs;

    const envelope: CacheEntryEnvelope<T> = {
      key,
      namespaceCode: ctx.namespaceCode,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      value,
      isNegativeCache: Boolean(options?.isNegativeCache),
      createdAtMs: nowMs,
      expiresAtMs,
      staleUntilMs,
      dataVersion: ctx.dataVersion || 'v1',
      hitCount: 0,
    };

    this.store.set(key, envelope);
    return envelope;
  }

  get<T>(
    ctx: CacheKeyContext,
    options?: { allowStale?: boolean }
  ): { status: 'HIT' | 'STALE' | 'NEGATIVE_HIT' | 'MISS'; value: T | null; envelope?: CacheEntryEnvelope<T> } {
    const key = this.buildDeterministicCacheKey(ctx);
    const entry = this.store.get(key) as CacheEntryEnvelope<T> | undefined;
    if (!entry) {
      this.stats.misses += 1;
      return { status: 'MISS', value: null };
    }

    if (ctx.tenantId && entry.tenantId && ctx.tenantId !== entry.tenantId) {
      throw new CoreApiError('TENANT_ISOLATION_VIOLATION', 'Cross-tenant cache read blocked', 403);
    }

    const nowMs = Date.now();
    if (nowMs <= entry.expiresAtMs) {
      entry.hitCount += 1;
      if (entry.isNegativeCache) {
        this.stats.negativeHits += 1;
        return { status: 'NEGATIVE_HIT', value: null, envelope: entry };
      }
      this.stats.hits += 1;
      return { status: 'HIT', value: entry.value, envelope: entry };
    }

    if (options?.allowStale !== false && nowMs <= entry.staleUntilMs && !entry.isNegativeCache) {
      entry.hitCount += 1;
      this.stats.staleHits += 1;
      return { status: 'STALE', value: entry.value, envelope: entry };
    }

    this.store.delete(key);
    this.stats.misses += 1;
    return { status: 'MISS', value: null };
  }

  async getOrLoadSingleFlight<T>(
    ctx: CacheKeyContext,
    loader: () => Promise<T>,
    options?: { allowStale?: boolean }
  ): Promise<{ value: T; source: 'CACHE_HIT' | 'CACHE_STALE' | 'ORIGIN_LOADED' | 'SINGLE_FLIGHT_COALESCED' }> {
    const existing = this.get<T>(ctx, options);
    if (existing.status === 'HIT' && existing.value !== null) {
      return { value: existing.value, source: 'CACHE_HIT' };
    }
    if (existing.status === 'STALE' && existing.value !== null) {
      void loader()
        .then((fresh) => this.set(ctx, fresh))
        .catch(() => undefined);
      return { value: existing.value, source: 'CACHE_STALE' };
    }

    const key = this.buildDeterministicCacheKey(ctx);
    const policy = this.policies.get(ctx.namespaceCode)!;

    if (policy.singleFlightEnabled && this.inFlight.has(key)) {
      this.stats.singleFlightCoalesced += 1;
      const coalesced = (await this.inFlight.get(key)) as T;
      return { value: coalesced, source: 'SINGLE_FLIGHT_COALESCED' };
    }

    const loadPromise = (async () => {
      try {
        const loaded = await loader();
        this.set(ctx, loaded);
        return loaded;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    if (policy.singleFlightEnabled) {
      this.inFlight.set(key, loadPromise);
    }

    const value = await loadPromise;
    return { value, source: 'ORIGIN_LOADED' };
  }

  invalidateByEntity(entityType: string, entityId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.entityType === entityType && v.entityId === entityId) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateByNamespace(namespaceCode: CacheNamespaceCode): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.namespaceCode === namespaceCode) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateByTenant(tenantId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.tenantId === tenantId) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateByOrganization(organizationId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.organizationId === organizationId) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateByUser(userId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.userId === userId) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateSearchResults(tenantId?: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.namespaceCode === 'SEARCH_RESULTS' && (!tenantId || v.tenantId === tenantId)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  invalidateValuationResults(entityId?: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.namespaceCode === 'VALUATION_RESULTS' && (!entityId || v.entityId === entityId)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  enforceResourceBudget(category: ResourceBudgetCategory, tenantId = '*', payloadBytes = 0): { allowed: boolean; budget: ResourceBudgetPolicy } {
    const specificKey = `budget_${category.toLowerCase()}_${tenantId}`;
    const defaultKey = `budget_${category.toLowerCase()}_default`;
    const budget = this.budgets.get(specificKey) || this.budgets.get(defaultKey)!;

    if (payloadBytes > budget.maxPayloadBytes) {
      throw new CoreApiError(
        'RATE_LIMITED',
        `Payload bytes (${payloadBytes}) exceed budget (${budget.maxPayloadBytes}) for ${category}`,
        429
      );
    }

    const counterKey = `${category}:${tenantId}`;
    const nowMs = Date.now();
    const currentWindow = this.minuteCounters.get(counterKey);
    if (!currentWindow || nowMs - currentWindow.windowStartMs >= 60_000) {
      this.minuteCounters.set(counterKey, { windowStartMs: nowMs, count: 1 });
    } else {
      if (currentWindow.count >= budget.maxRequestsPerMinute) {
        throw new CoreApiError(
          'RATE_LIMITED',
          `Per-minute resource budget (${budget.maxRequestsPerMinute}) exceeded for ${category} (tenant ${tenantId})`,
          429
        );
      }
      currentWindow.count += 1;
    }

    const active = this.activeExecutions.get(counterKey) || 0;
    if (active >= budget.maxConcurrent) {
      throw new CoreApiError(
        'RATE_LIMITED',
        `Concurrent execution budget (${budget.maxConcurrent}) exceeded for ${category} (tenant ${tenantId})`,
        429
      );
    }

    return { allowed: true, budget };
  }

  recordQueryProfile(input: {
    operationName: string;
    collectionOrTable: string;
    tenantId?: string;
    durationMs: number;
    rowsScanned: number;
    usedIndex: boolean;
    filterFields?: string[];
  }): SlowQueryProfileRecord {
    const recommendedCompositeIndex =
      !input.usedIndex || input.rowsScanned > 250
        ? [
            ...(input.tenantId ? ['tenantId'] : []),
            ...(input.filterFields && input.filterFields.length > 0 ? input.filterFields : ['status', 'updatedAt']),
          ]
        : undefined;

    const record: SlowQueryProfileRecord = {
      profileId: `qprof_${crypto.randomUUID().slice(0, 8)}`,
      operationName: input.operationName,
      collectionOrTable: input.collectionOrTable,
      tenantId: input.tenantId,
      durationMs: input.durationMs,
      rowsScanned: input.rowsScanned,
      usedIndex: input.usedIndex,
      recommendedCompositeIndex,
      recordedAt: new Date().toISOString(),
    };

    if (input.durationMs >= 100 || !input.usedIndex || input.rowsScanned > 250) {
      this.slowQueries.unshift(record);
      if (this.slowQueries.length > 200) this.slowQueries.pop();
    }
    return record;
  }

  listNamespaces(): CacheNamespaceRecord[] {
    return Array.from(this.namespaces.values());
  }

  listPolicies(): CachePolicyRecord[] {
    return Array.from(this.policies.values());
  }

  listBudgets(): ResourceBudgetPolicy[] {
    return Array.from(this.budgets.values());
  }

  upsertBudget(input: Omit<ResourceBudgetPolicy, 'updatedAt'>): ResourceBudgetPolicy {
    const updated: ResourceBudgetPolicy = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.budgets.set(updated.budgetId, updated);
    return updated;
  }

  getHealthReport() {
    const kvConfigured = Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID);
    return {
      status: 'HEALTHY',
      localAdapterStatus: 'OPERATIONAL',
      externalDistributedKvProvider: kvConfigured ? 'OPERATIONAL' : 'NOT_CONFIGURED',
      entryCount: this.store.size,
      inFlightCoalescedCount: this.inFlight.size,
      stats: { ...this.stats },
      slowQueryCount: this.slowQueries.length,
      recentSlowQueries: this.slowQueries.slice(0, 10),
    };
  }
}

export const cachingAndPerformanceService = new CachingAndPerformanceService();

export function createCachingAndPerformanceRouter(): express.Router {
  const router = express.Router();
  router.use(verifiedAdminContextMiddleware);

  router.get('/api/admin/cache/namespaces', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      const items = cachingAndPerformanceService.listNamespaces();
      const pageSize = clampPageSize(req.query.pageSize);
      const page = paginateArray(items, pageSize, req.query.cursor as string | undefined, 'namespaceCode', 'asc');
      sendCanonicalSuccess(res, trace, { items: page.items }, 200, page.pageInfo);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/cache/policies', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      const items = cachingAndPerformanceService.listPolicies();
      sendCanonicalSuccess(res, trace, { items });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/cache/health', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.health.read');
      sendCanonicalSuccess(res, trace, cachingAndPerformanceService.getHealthReport());
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/cache/invalidate', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const { scope, namespaceCode, tenantId, organizationId, userId, entityType, entityId, reason } = req.body || {};
      let invalidatedCount = 0;

      if (scope === 'NAMESPACE' && namespaceCode) {
        invalidatedCount = cachingAndPerformanceService.invalidateByNamespace(namespaceCode);
      } else if (scope === 'TENANT' && tenantId) {
        invalidatedCount = cachingAndPerformanceService.invalidateByTenant(tenantId);
      } else if (scope === 'ORGANIZATION' && organizationId) {
        invalidatedCount = cachingAndPerformanceService.invalidateByOrganization(organizationId);
      } else if (scope === 'USER' && userId) {
        invalidatedCount = cachingAndPerformanceService.invalidateByUser(userId);
      } else if (scope === 'ENTITY' && entityType && entityId) {
        invalidatedCount = cachingAndPerformanceService.invalidateByEntity(entityType, entityId);
      } else {
        throw new CoreApiError('VALIDATION_FAILED', 'Invalid cache invalidation scope or missing target identifier', 400);
      }

      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'CACHE_INVALIDATE',
        targetModuleCode: 'EMP_76_DISTRIBUTED_CACHING_PERFORMANCE',
        targetEntityType: 'CACHE_SCOPE',
        targetEntityId: String(namespaceCode || tenantId || organizationId || userId || `${entityType}:${entityId}`),
        CorrelationId: trace.correlationId,
        reason: reason || 'Administrative cache invalidation',
        beforeState: null,
        afterState: { scope, invalidatedCount },
      });

      sendCanonicalSuccess(res, trace, { scope, invalidatedCount });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/cache/budgets', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      sendCanonicalSuccess(res, trace, { items: cachingAndPerformanceService.listBudgets() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  return router;
}

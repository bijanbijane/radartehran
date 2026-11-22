/**
 * @file worker/irni/irniNeighborhoodClient.ts
 * @description Read-Only Server-to-Server IRNI Neighborhood Reference API Client.
 *
 * ABSOLUTE ARCHITECTURAL INVARIANTS (RT-DB-TRIAD-001):
 * - NEVER binds, queries, migrates, or writes to `radar-neighborhood-db` directly.
 * - Executes strictly `GET` requests against the configured IRNI HTTPS API.
 * - NEVER fabricates fake URLs, fake tokens, or fake success payloads: if `IRNI_API_BASE_URL`
 *   or `IRNI_API_TOKEN` is missing, fails closed with `BLOCKED_EXTERNAL_IRNI_CONTRACT`.
 * - Uses isolated KV cache prefix `v1:irni_ref:` (strictly separate from auth cache `v1:auth:`).
 * - Enforces timeout, bounded retry on 5xx/network, circuit breaker, runtime schema validation,
 *   provenance metadata, and explicit stale-data rejection policy.
 */
import type { KVNamespace, WorkerEnv } from '../types';
import type {
  IrniCity,
  IrniClientFailure,
  IrniClientResult,
  IrniCounty,
  IrniNeighborhood,
  IrniPaginatedData,
  IrniPaginationMeta,
  IrniPaginationParams,
  IrniProvenanceMeta,
  IrniProvince,
  IrniSingleData,
  NeighborhoodReferenceClient,
} from './irniTypes';

export const IRNI_KV_CACHE_PREFIX = 'v1:irni_ref:' as const;
export const DEFAULT_IRNI_TIMEOUT_MS = 4000;
export const DEFAULT_IRNI_CACHE_TTL_SECONDS = 900;
export const DEFAULT_IRNI_STALE_TTL_SECONDS = 3600;
export const IRNI_REQUIRED_PREREQUISITES: readonly string[] = Object.freeze([
  'IRNI_API_BASE_URL (verified HTTPS base URL for the external IRNI Neighborhood Reference API)',
  'IRNI_API_TOKEN (server-to-server read-only credential provisioned via `wrangler secret put IRNI_API_TOKEN`)',
  'IRNI API OpenAPI/JSON response contract version and endpoint paths',
]);

interface CachedIrniEnvelope<TData> {
  readonly data: TData;
  readonly fetchedAtMs: number;
  readonly freshUntilMs: number;
  readonly staleUntilMs: number;
}

export interface IrniClientOptions {
  readonly baseUrl?: string;
  readonly apiToken?: string;
  readonly authHeaderName?: string;
  readonly timeoutMs?: number;
  readonly cacheTtlSeconds?: number;
  readonly staleTtlSeconds?: number;
  readonly maxRetries?: number;
  readonly circuitFailureThreshold?: number;
  readonly circuitCooldownMs?: number;
  readonly kv?: KVNamespace;
  readonly fetchImpl?: typeof fetch;
  readonly nowFn?: () => number;
}

function isSafeHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return host.includes('.');
  } catch {
    return false;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
}

function asOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

function asOptionalFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function parseProvince(raw: unknown): IrniProvince | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.code) || !isNonEmptyString(r.nameFa)) return null;
  return {
    id: r.id.trim(),
    code: r.code.trim(),
    nameFa: r.nameFa.trim(),
    nameEn: asOptionalString(r.nameEn),
  };
}

function parseCounty(raw: unknown): IrniCounty | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.provinceId) || !isNonEmptyString(r.code) || !isNonEmptyString(r.nameFa)) {
    return null;
  }
  return {
    id: r.id.trim(),
    provinceId: r.provinceId.trim(),
    code: r.code.trim(),
    nameFa: r.nameFa.trim(),
    nameEn: asOptionalString(r.nameEn),
  };
}

function parseCity(raw: unknown): IrniCity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(r.id) ||
    !isNonEmptyString(r.provinceId) ||
    !isNonEmptyString(r.countyId) ||
    !isNonEmptyString(r.code) ||
    !isNonEmptyString(r.nameFa)
  ) {
    return null;
  }
  return {
    id: r.id.trim(),
    provinceId: r.provinceId.trim(),
    countyId: r.countyId.trim(),
    code: r.code.trim(),
    nameFa: r.nameFa.trim(),
    nameEn: asOptionalString(r.nameEn),
    centerLat: asOptionalFiniteNumber(r.centerLat),
    centerLng: asOptionalFiniteNumber(r.centerLng),
  };
}

function parseNeighborhood(raw: unknown): IrniNeighborhood | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.cityId) || !isNonEmptyString(r.nameFa)) return null;
  return {
    id: r.id.trim(),
    cityId: r.cityId.trim(),
    countyId: asOptionalString(r.countyId),
    provinceId: asOptionalString(r.provinceId),
    districtCode: asOptionalString(r.districtCode),
    nameFa: r.nameFa.trim(),
    nameEn: asOptionalString(r.nameEn),
    slug: asOptionalString(r.slug),
    centerLat: asOptionalFiniteNumber(r.centerLat),
    centerLng: asOptionalFiniteNumber(r.centerLng),
    populationEstimate: asOptionalFiniteNumber(r.populationEstimate),
    updatedAtIso: asOptionalString(r.updatedAtIso),
  };
}

function parsePagination(raw: unknown, fallbackCount: number, reqPage: number, reqPageSize: number): IrniPaginationMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      page: reqPage,
      pageSize: reqPageSize,
      totalItems: fallbackCount,
      totalPages: Math.max(1, Math.ceil(fallbackCount / reqPageSize)),
      nextCursor: null,
    };
  }
  const p = raw as Record<string, unknown>;
  const page = typeof p.page === 'number' && Number.isInteger(p.page) && p.page >= 1 ? p.page : reqPage;
  const pageSize = typeof p.pageSize === 'number' && Number.isInteger(p.pageSize) && p.pageSize >= 1 ? p.pageSize : reqPageSize;
  const totalItems = typeof p.totalItems === 'number' && Number.isInteger(p.totalItems) && p.totalItems >= 0 ? p.totalItems : fallbackCount;
  const totalPages =
    typeof p.totalPages === 'number' && Number.isInteger(p.totalPages) && p.totalPages >= 1
      ? p.totalPages
      : Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    nextCursor: asOptionalString(p.nextCursor),
  };
}

function sanitizeIdParam(value: string): string | null {
  const clean = String(value || '').trim();
  if (!clean || clean.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(clean)) return null;
  return clean;
}

export class IrniNeighborhoodReferenceClient implements NeighborhoodReferenceClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly authHeaderName: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlSeconds: number;
  private readonly staleTtlSeconds: number;
  private readonly maxRetries: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitCooldownMs: number;
  private readonly kv?: KVNamespace;
  private readonly fetchImpl: typeof fetch;
  private readonly nowFn: () => number;

  private consecutiveFailures = 0;
  private circuitOpenedAtMs: number | null = null;

  constructor(options: IrniClientOptions) {
    this.baseUrl = String(options.baseUrl || '').trim().replace(/\/+$/, '');
    this.apiToken = String(options.apiToken || '').trim();
    this.authHeaderName = String(options.authHeaderName || 'Authorization').trim() || 'Authorization';
    this.timeoutMs = Math.max(250, Math.min(15_000, Math.trunc(options.timeoutMs ?? DEFAULT_IRNI_TIMEOUT_MS)));
    this.cacheTtlSeconds = Math.max(30, Math.min(86_400, Math.trunc(options.cacheTtlSeconds ?? DEFAULT_IRNI_CACHE_TTL_SECONDS)));
    this.staleTtlSeconds = Math.max(this.cacheTtlSeconds, Math.min(86_400, Math.trunc(options.staleTtlSeconds ?? DEFAULT_IRNI_STALE_TTL_SECONDS)));
    this.maxRetries = Math.max(0, Math.min(3, Math.trunc(options.maxRetries ?? 2)));
    this.circuitFailureThreshold = Math.max(2, Math.min(20, Math.trunc(options.circuitFailureThreshold ?? 3)));
    this.circuitCooldownMs = Math.max(1_000, Math.min(300_000, Math.trunc(options.circuitCooldownMs ?? 30_000)));
    this.kv = options.kv;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  public isConfigured(): boolean {
    return isSafeHttpsUrl(this.baseUrl) && this.apiToken.length >= 16;
  }

  public getCircuitState(): { readonly open: boolean; readonly consecutiveFailures: number } {
    if (this.circuitOpenedAtMs === null) {
      return { open: false, consecutiveFailures: this.consecutiveFailures };
    }
    const elapsed = this.nowFn() - this.circuitOpenedAtMs;
    return { open: elapsed < this.circuitCooldownMs, consecutiveFailures: this.consecutiveFailures };
  }

  private blockedContractFailure(): IrniClientFailure {
    return {
      ok: false,
      statusCode: 503,
      code: 'BLOCKED_EXTERNAL_IRNI_CONTRACT',
      messageFa: 'قرارداد و اعتبارنامه API خارجی مرجع محله‌های IRNI هنوز تنظیم نشده است (اتصال مستقیم D1 ممنوع است).',
      retryable: false,
      requiredExternalPrerequisites: IRNI_REQUIRED_PREREQUISITES,
    };
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailureThreshold) {
      this.circuitOpenedAtMs = this.nowFn();
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenedAtMs = null;
  }

  private buildCacheKey(pathAndQuery: string): string {
    return `${IRNI_KV_CACHE_PREFIX}${pathAndQuery}`;
  }

  private async readCache<TData>(cacheKey: string): Promise<{
    readonly state: 'FRESH' | 'STALE_VALID' | 'STALE_EXPIRED' | 'MISS';
    readonly envelope?: CachedIrniEnvelope<TData>;
  }> {
    if (!this.kv) return { state: 'MISS' };
    try {
      const raw = await this.kv.get(cacheKey, { type: 'json' });
      if (!raw || typeof raw !== 'object') return { state: 'MISS' };
      const env = raw as CachedIrniEnvelope<TData>;
      if (typeof env.freshUntilMs !== 'number' || typeof env.staleUntilMs !== 'number') return { state: 'MISS' };
      const now = this.nowFn();
      if (now <= env.freshUntilMs) return { state: 'FRESH', envelope: env };
      if (now <= env.staleUntilMs) return { state: 'STALE_VALID', envelope: env };
      return { state: 'STALE_EXPIRED', envelope: env };
    } catch {
      return { state: 'MISS' };
    }
  }

  private async writeCache<TData>(cacheKey: string, data: TData, fetchedAtMs: number): Promise<void> {
    if (!this.kv) return;
    const envelope: CachedIrniEnvelope<TData> = {
      data,
      fetchedAtMs,
      freshUntilMs: fetchedAtMs + this.cacheTtlSeconds * 1000,
      staleUntilMs: fetchedAtMs + this.staleTtlSeconds * 1000,
    };
    try {
      await this.kv.put(cacheKey, JSON.stringify(envelope), { expirationTtl: this.staleTtlSeconds + 60 });
    } catch {
      // Cache write errors must not break read responses
    }
  }

  private async executeReadOnlyGet<TData>(
    pathAndQuery: string,
    validatePayload: (raw: unknown, provenance: IrniProvenanceMeta) => TData | null,
    withStaleProvenance: (cached: TData) => TData,
  ): Promise<IrniClientResult<TData>> {
    if (!this.isConfigured()) {
      return this.blockedContractFailure();
    }

    const cacheKey = this.buildCacheKey(pathAndQuery);
    const cached = await this.readCache<TData>(cacheKey);
    if (cached.state === 'FRESH' && cached.envelope) {
      return { ok: true, data: cached.envelope.data };
    }

    // Circuit breaker check
    const circuit = this.getCircuitState();
    if (circuit.open) {
      if (cached.state === 'STALE_VALID' && cached.envelope) {
        return { ok: true, data: withStaleProvenance(cached.envelope.data) };
      }
      if (cached.state === 'STALE_EXPIRED') {
        return {
          ok: false,
          statusCode: 503,
          code: 'IRNI_STALE_DATA_REJECTED',
          messageFa: 'داده کش‌شده مرجع محله‌های IRNI منقضی شده و سرویس بالادستی در حالت قطع مدار است.',
          retryable: true,
        };
      }
      return {
        ok: false,
        statusCode: 503,
        code: 'IRNI_CIRCUIT_OPEN',
        messageFa: 'اتصال به سرویس مرجع محله‌های IRNI موقتاً به دلیل خطاهای متوالی متوقف شده است.',
        retryable: true,
      };
    }

    const url = `${this.baseUrl}${pathAndQuery}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Service': 'radartehran-api',
    };
    headers[this.authHeaderName] =
      this.authHeaderName.toLowerCase() === 'authorization' ? `Bearer ${this.apiToken}` : this.apiToken;

    let lastFailure: IrniClientFailure = {
      ok: false,
      statusCode: 502,
      code: 'IRNI_UPSTREAM_ERROR',
      messageFa: 'خطا در دریافت داده از سرویس مرجع محله‌های IRNI.',
      retryable: true,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'GET', // Hard-coded read-only invariant
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (res.status === 401 || res.status === 403) {
          this.recordFailure();
          return {
            ok: false,
            statusCode: 502,
            code: 'IRNI_UNAUTHORIZED',
            messageFa: 'احراز هویت سرور-به-سرور با سرویس مرجع محله‌های IRNI ناموفق بود.',
            retryable: false,
          };
        }

        if (res.status === 404) {
          this.recordSuccess();
          return {
            ok: false,
            statusCode: 404,
            code: 'IRNI_NOT_FOUND',
            messageFa: 'موجودیت درخواستی در سرویس مرجع محله‌های IRNI یافت نشد.',
            retryable: false,
          };
        }

        if (!res.ok) {
          lastFailure = {
            ok: false,
            statusCode: 502,
            code: 'IRNI_UPSTREAM_ERROR',
            messageFa: `سرویس مرجع محله‌های IRNI وضعیت نامعتبر ${res.status} بازگرداند.`,
            retryable: res.status >= 500 || res.status === 429,
          };
          if (!lastFailure.retryable) {
            this.recordFailure();
            return lastFailure;
          }
          continue;
        }

        let parsedBody: unknown;
        try {
          parsedBody = await res.json();
        } catch {
          this.recordFailure();
          return {
            ok: false,
            statusCode: 502,
            code: 'IRNI_SCHEMA_VALIDATION_FAILED',
            messageFa: 'پاسخ سرویس مرجع محله‌های IRNI قالب JSON معتبر نداشت.',
            retryable: false,
          };
        }

        const fetchedAtMs = this.nowFn();
        const contractVersion = String(res.headers.get('x-irni-contract-version') || 'v1').slice(0, 32);
        const provenance: IrniProvenanceMeta = {
          source: 'IRNI',
          contractVersion,
          fetchedAtIso: new Date(fetchedAtMs).toISOString(),
          expiresAtIso: new Date(fetchedAtMs + this.cacheTtlSeconds * 1000).toISOString(),
          cacheStatus: 'MISS',
        };

        const validated = validatePayload(parsedBody, provenance);
        if (!validated) {
          this.recordFailure();
          return {
            ok: false,
            statusCode: 502,
            code: 'IRNI_SCHEMA_VALIDATION_FAILED',
            messageFa: 'ساختار داده دریافتی از سرویس مرجع محله‌های IRNI با قرارداد معتبر مطابقت نداشت.',
            retryable: false,
          };
        }

        this.recordSuccess();
        const cacheCopy =
          typeof validated === 'object' && validated !== null && 'provenance' in validated
            ? ({
                ...validated,
                provenance: { ...(validated as { provenance: IrniProvenanceMeta }).provenance, cacheStatus: 'HIT' as const },
              } as TData)
            : validated;
        await this.writeCache(cacheKey, cacheCopy, fetchedAtMs);
        return { ok: true, data: validated };
      } catch (err) {
        const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        lastFailure = {
          ok: false,
          statusCode: isTimeout ? 504 : 502,
          code: isTimeout ? 'IRNI_REQUEST_TIMEOUT' : 'IRNI_UPSTREAM_ERROR',
          messageFa: isTimeout
            ? 'مهلت زمانی پاسخ سرویس مرجع محله‌های IRNI به پایان رسید.'
            : 'ارتباط شبکه‌ای با سرویس مرجع محله‌های IRNI برقرار نشد.',
          retryable: true,
        };
      }
    }

    this.recordFailure();
    if (cached.state === 'STALE_VALID' && cached.envelope) {
      return { ok: true, data: withStaleProvenance(cached.envelope.data) };
    }
    if (cached.state === 'STALE_EXPIRED') {
      return {
        ok: false,
        statusCode: 503,
        code: 'IRNI_STALE_DATA_REJECTED',
        messageFa: 'داده کش‌شده مرجع IRNI خارج از بازه مجاز کهنگی است و سرویس بالادستی در دسترس نیست.',
        retryable: true,
      };
    }
    return lastFailure;
  }

  private buildPaginationQuery(params?: IrniPaginationParams): {
    readonly page: number;
    readonly pageSize: number;
    readonly qs: URLSearchParams;
  } {
    const page = Math.max(1, Math.min(500, Math.trunc(params?.page ?? 1)));
    const pageSize = Math.max(1, Math.min(100, Math.trunc(params?.pageSize ?? 50)));
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    if (params?.cursor && /^[a-zA-Z0-9._=-]{1,128}$/.test(params.cursor)) {
      qs.set('cursor', params.cursor);
    }
    return { page, pageSize, qs };
  }

  private async fetchPaginatedList<TItem>(
    path: string,
    qs: URLSearchParams,
    page: number,
    pageSize: number,
    parseItem: (raw: unknown) => TItem | null,
  ): Promise<IrniClientResult<IrniPaginatedData<TItem>>> {
    return this.executeReadOnlyGet<IrniPaginatedData<TItem>>(
      `${path}?${qs.toString()}`,
      (raw, provenance) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const body = raw as Record<string, unknown>;
        if (!Array.isArray(body.items)) return null;
        const items: TItem[] = [];
        for (const entry of body.items) {
          const parsed = parseItem(entry);
          if (!parsed) return null;
          items.push(parsed);
        }
        const pagination = parsePagination(body.pagination, items.length, page, pageSize);
        if (!pagination) return null;
        return { items, pagination, provenance };
      },
      (cached) => ({ ...cached, provenance: { ...cached.provenance, cacheStatus: 'STALE' } }),
    );
  }

  async getProvinces(params?: IrniPaginationParams): Promise<IrniClientResult<IrniPaginatedData<IrniProvince>>> {
    const { page, pageSize, qs } = this.buildPaginationQuery(params);
    return this.fetchPaginatedList('/v1/provinces', qs, page, pageSize, parseProvince);
  }

  async getCounties(
    params: IrniPaginationParams & { readonly provinceId: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniCounty>>> {
    const provinceId = sanitizeIdParam(params.provinceId);
    if (!provinceId) {
      return {
        ok: false,
        statusCode: 400,
        code: 'IRNI_INVALID_PARAMETERS',
        messageFa: 'شناسه استان معتبر نیست.',
        retryable: false,
      };
    }
    const { page, pageSize, qs } = this.buildPaginationQuery(params);
    qs.set('provinceId', provinceId);
    return this.fetchPaginatedList('/v1/counties', qs, page, pageSize, parseCounty);
  }

  async getCities(
    params: IrniPaginationParams & { readonly countyId?: string; readonly provinceId?: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniCity>>> {
    const { page, pageSize, qs } = this.buildPaginationQuery(params);
    if (params.provinceId) {
      const pid = sanitizeIdParam(params.provinceId);
      if (!pid) {
        return { ok: false, statusCode: 400, code: 'IRNI_INVALID_PARAMETERS', messageFa: 'شناسه استان نامعتبر است.', retryable: false };
      }
      qs.set('provinceId', pid);
    }
    if (params.countyId) {
      const cid = sanitizeIdParam(params.countyId);
      if (!cid) {
        return { ok: false, statusCode: 400, code: 'IRNI_INVALID_PARAMETERS', messageFa: 'شناسه شهرستان نامعتبر است.', retryable: false };
      }
      qs.set('countyId', cid);
    }
    return this.fetchPaginatedList('/v1/cities', qs, page, pageSize, parseCity);
  }

  async getNeighborhoods(
    params: IrniPaginationParams & { readonly cityId: string; readonly districtCode?: string },
  ): Promise<IrniClientResult<IrniPaginatedData<IrniNeighborhood>>> {
    const cityId = sanitizeIdParam(params.cityId);
    if (!cityId) {
      return {
        ok: false,
        statusCode: 400,
        code: 'IRNI_INVALID_PARAMETERS',
        messageFa: 'شناسه شهر برای دریافت محله‌ها الزامی و معتبر نیست.',
        retryable: false,
      };
    }
    const { page, pageSize, qs } = this.buildPaginationQuery(params);
    qs.set('cityId', cityId);
    if (params.districtCode) {
      const dc = sanitizeIdParam(params.districtCode);
      if (!dc) {
        return { ok: false, statusCode: 400, code: 'IRNI_INVALID_PARAMETERS', messageFa: 'کد منطقه نامعتبر است.', retryable: false };
      }
      qs.set('districtCode', dc);
    }
    return this.fetchPaginatedList('/v1/neighborhoods', qs, page, pageSize, parseNeighborhood);
  }

  async getNeighborhoodById(id: string): Promise<IrniClientResult<IrniSingleData<IrniNeighborhood>>> {
    const cleanId = sanitizeIdParam(id);
    if (!cleanId) {
      return {
        ok: false,
        statusCode: 400,
        code: 'IRNI_INVALID_PARAMETERS',
        messageFa: 'شناسه محله معتبر نیست.',
        retryable: false,
      };
    }
    return this.executeReadOnlyGet<IrniSingleData<IrniNeighborhood>>(
      `/v1/neighborhoods/${encodeURIComponent(cleanId)}`,
      (raw, provenance) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const body = raw as Record<string, unknown>;
        const item = parseNeighborhood(body.item ?? body);
        if (!item) return null;
        return { item, provenance };
      },
      (cached) => ({ ...cached, provenance: { ...cached.provenance, cacheStatus: 'STALE' } }),
    );
  }
}

export function createIrniNeighborhoodReferenceClientFromEnv(
  env: WorkerEnv,
  overrides: Partial<IrniClientOptions> = {},
): IrniNeighborhoodReferenceClient {
  return new IrniNeighborhoodReferenceClient({
    baseUrl: env.IRNI_API_BASE_URL,
    apiToken: env.IRNI_API_TOKEN,
    authHeaderName: env.IRNI_API_HEADER_NAME,
    timeoutMs: env.IRNI_API_TIMEOUT_MS ? Number(env.IRNI_API_TIMEOUT_MS) : DEFAULT_IRNI_TIMEOUT_MS,
    cacheTtlSeconds: env.IRNI_CACHE_TTL_SECONDS ? Number(env.IRNI_CACHE_TTL_SECONDS) : DEFAULT_IRNI_CACHE_TTL_SECONDS,
    staleTtlSeconds: env.IRNI_STALE_TTL_SECONDS ? Number(env.IRNI_STALE_TTL_SECONDS) : DEFAULT_IRNI_STALE_TTL_SECONDS,
    kv: env.RADAR_KV,
    ...overrides,
  });
}

/**
 * Stage 28 — Analytics & Research Backend Authority Adapter
 * Spec ID: RT-FE-REBUILD-ANALYTICS-RESEARCH-AUTHORITY-028
 *
 * Connects frontend Analytics, Research Workspace, Exports, and Admin Pipeline
 * panels directly to authoritative Backend API endpoints (/api/v1/analytics/*,
 * /api/v1/research/workspace, /api/admin/analytics/pipelines/:pipelineId/run).
 * Never substitutes demo fixtures when the backend returns empty or fails.
 */

import type {
  AnalyticsExportResponse,
  AnalyticsMarketApiBundle,
  DataPipelineRecord,
  MetricSnapshotResponse,
  OfficialMetricDefinition,
  ReproducibleAnalysisDefinition,
  ResearchWorkspaceApiBundle,
} from '../models/analytics.types';
import {
  defaultAnalyticsPlatformEngine,
  OFFICIAL_METRIC_REGISTRY,
  SCD2_PLACE_DIMENSIONS,
} from './analyticsPlatformEngine';

export const RT_FE_ANALYTICS_RESEARCH_AUTHORITY_SPEC_ID =
  'RT-FE-REBUILD-ANALYTICS-RESEARCH-AUTHORITY-028' as const;
export const RT_FE_ANALYTICS_RESEARCH_AUTHORITY_READY =
  'RT_FE_STAGE28_ANALYTICS_RESEARCH_AUTHORITY_READY' as const;

export interface AnalyticsApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  workspaceId?: string;
  userId?: string;
  cityId?: string;
  authHeaders?: Record<string, string>;
}

export interface CreateResearchAnalysisPayload {
  titleFa: string;
  researchQuestionFa: string;
  datasetVersions: string[];
  metricCodes: string[];
  methodologyVersions?: string[];
  placeIds: string[];
  boundaryVersion?: string;
  timeRange?: { from: string; to: string; labelFa: string };
  outputSummaryFa?: string;
}

export interface RequestExportPayload {
  placeId: string;
  metricCode?: string;
  sampleCount: number;
  uniqueEntityCount: number;
  distinctContributorsCount?: number;
  datasetClassification?: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';
  callerRole?: 'PUBLIC_USER' | 'RESEARCHER' | 'ADMIN';
  dataSnapshotId?: string;
}

export class AnalyticsBackendApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly cache = new Map<string, { expiresAt: number; payload: unknown }>();
  private workspaceId: string;
  private userId: string;
  private cityId: string;
  private authHeaders: Record<string, string>;

  constructor(options: AnalyticsApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    this.workspaceId = options.workspaceId ?? 'ws-default';
    this.userId = options.userId ?? 'anonymous';
    this.cityId = options.cityId ?? 'tehran';
    this.authHeaders = options.authHeaders ?? {};
  }

  public setContext(ctx: { workspaceId?: string; userId?: string; cityId?: string; authHeaders?: Record<string, string> }): void {
    const prevKey = `${this.workspaceId}:${this.userId}:${this.cityId}`;
    if (ctx.workspaceId !== undefined) this.workspaceId = ctx.workspaceId;
    if (ctx.userId !== undefined) this.userId = ctx.userId;
    if (ctx.cityId !== undefined) this.cityId = ctx.cityId;
    if (ctx.authHeaders !== undefined) this.authHeaders = ctx.authHeaders;
    if (prevKey !== `${this.workspaceId}:${this.userId}:${this.cityId}`) this.clearCache();
  }

  public buildScopedCacheKey(resource: string, identifier = 'all'): string {
    return `analytics:${this.workspaceId}:${this.userId}:${this.cityId}:${resource}:${identifier}`;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    return { Accept: 'application/json', 'Content-Type': 'application/json', ...this.authHeaders, ...(extra ?? {}) };
  }

  public async fetchAnalyticsMetricsRegistry(): Promise<{
    ok: boolean; metrics: OfficialMetricDefinition[]; authoritySource: 'BACKEND_API' | 'STATIC_DEFINITIONS';
  }> {
    if (this.fetchImpl) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/api/v1/analytics/metrics`, { method: 'GET', headers: this.getHeaders() });
        if (res.ok) {
          const body = (await res.json()) as { metrics?: OfficialMetricDefinition[]; data?: OfficialMetricDefinition[] };
          const list = Array.isArray(body.metrics) ? body.metrics : Array.isArray(body.data) ? body.data : null;
          if (list) return { ok: true, metrics: list, authoritySource: 'BACKEND_API' };
        }
      } catch { /* fallback to static metric definitions */ }
    }
    return { ok: true, metrics: OFFICIAL_METRIC_REGISTRY, authoritySource: 'STATIC_DEFINITIONS' };
  }

  public async fetchMetricSnapshotByCode(metricCode: string, placeId: string | null, signal?: AbortSignal): Promise<MetricSnapshotResponse> {
    if (this.fetchImpl && placeId) {
      try {
        const url = `${this.baseUrl}/api/v1/analytics/metrics/${encodeURIComponent(metricCode)}?placeId=${encodeURIComponent(placeId)}`;
        const res = await this.fetchImpl(url, { method: 'GET', headers: this.getHeaders(), signal });
        if (res.ok) {
          const data = (await res.json()) as { snapshot?: MetricSnapshotResponse } & Partial<MetricSnapshotResponse>;
          const snap = data.snapshot ?? (data.metricCode ? (data as MetricSnapshotResponse) : null);
          if (snap && snap.geography) return snap;
        }
      } catch { /* return honest UNAVAILABLE snapshot below */ }
    }
    return defaultAnalyticsPlatformEngine.getMetricSnapshotForPlace(placeId, 142, []);
  }

  public async fetchAnalyticsMarketBundle(
    placeId: string | null, observedValues?: number[],
    temporalMeta?: { observedAt?: string | null; receivedAt?: string | null }, signal?: AbortSignal,
  ): Promise<AnalyticsMarketApiBundle> {
    const cacheKey = this.buildScopedCacheKey('market', placeId ?? 'none');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && (!observedValues || observedValues.length === 0)) {
      return cached.payload as AnalyticsMarketApiBundle;
    }
    if (this.fetchImpl && placeId) {
      try {
        const url = `${this.baseUrl}/api/v1/analytics/market?placeId=${encodeURIComponent(placeId)}`;
        const res = await this.fetchImpl(url, { method: 'GET', headers: this.getHeaders(), signal });
        if (res.ok) {
          const body = (await res.json()) as Partial<AnalyticsMarketApiBundle> & { snapshot?: MetricSnapshotResponse };
          const snap = body.activeSnapshot ?? body.snapshot;
          if (snap && snap.geography) {
            const result: AnalyticsMarketApiBundle = {
              placeId, activeSnapshot: snap,
              metricsRegistry: Array.isArray(body.metricsRegistry) ? body.metricsRegistry : OFFICIAL_METRIC_REGISTRY,
              placeDimensionsScd2: Array.isArray(body.placeDimensionsScd2) ? body.placeDimensionsScd2 : SCD2_PLACE_DIMENSIONS,
              authoritySource: 'BACKEND_API', fetchedAtIso: new Date().toISOString(),
            };
            this.cache.set(cacheKey, { expiresAt: Date.now() + 30_000, payload: result });
            return result;
          }
        }
      } catch { /* fallback to honest local observed values or UNAVAILABLE */ }
    }
    return {
      placeId,
      activeSnapshot: defaultAnalyticsPlatformEngine.getMetricSnapshotForPlace(placeId, 142, observedValues, temporalMeta),
      metricsRegistry: OFFICIAL_METRIC_REGISTRY,
      placeDimensionsScd2: SCD2_PLACE_DIMENSIONS,
      authoritySource: 'UNAVAILABLE_FALLBACK',
      fetchedAtIso: new Date().toISOString(),
    };
  }

  public async fetchResearchWorkspaceBundle(
    placeId?: string | null, headers?: Record<string, string>, signal?: AbortSignal,
  ): Promise<ResearchWorkspaceApiBundle> {
    if (this.fetchImpl) {
      try {
        const qs = placeId ? `?placeId=${encodeURIComponent(placeId)}` : '';
        const res = await this.fetchImpl(`${this.baseUrl}/api/v1/research/workspace${qs}`, {
          method: 'GET', headers: this.getHeaders(headers), signal,
        });
        if (res.ok) {
          const body = (await res.json()) as Partial<ResearchWorkspaceApiBundle> & { analyses?: ReproducibleAnalysisDefinition[] };
          const raw = Array.isArray(body.savedAnalyses) ? body.savedAnalyses : Array.isArray(body.analyses) ? body.analyses : [];
          const savedAnalyses = placeId ? raw.filter((a) => a.geographicScope?.placeIds?.includes(placeId)) : raw;
          return {
            savedAnalyses,
            pipelines: Array.isArray(body.pipelines) ? body.pipelines : [],
            modelRegistry: Array.isArray(body.modelRegistry) ? body.modelRegistry : [],
            authoritySource: 'BACKEND_API', fetchedAtIso: new Date().toISOString(),
          };
        }
      } catch { /* never substitute demo records */ }
    }
    return { savedAnalyses: [], pipelines: [], modelRegistry: [], authoritySource: 'UNAVAILABLE_FALLBACK', fetchedAtIso: new Date().toISOString() };
  }

  public async createResearchWorkspaceAnalysis(
    payload: CreateResearchAnalysisPayload, headers?: Record<string, string>,
  ): Promise<{ ok: boolean; analysis?: ReproducibleAnalysisDefinition; errorFa?: string }> {
    if (!payload.titleFa?.trim() || !payload.researchQuestionFa?.trim()) {
      return { ok: false, errorFa: 'عنوان و پرسش پژوهش برای ثبت تحلیل بازتولیدپذیر الزامی است.' };
    }
    if (!this.fetchImpl) return { ok: false, errorFa: 'ارتباط با سرور تحلیل و پژوهش برقرار نیست.' };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/v1/research/workspace`, {
        method: 'POST', headers: this.getHeaders(headers), body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, errorFa: `خطا در ثبت تحلیل پژوهشی در سرور (کد ${res.status}).` };
      const body = (await res.json()) as { analysis?: ReproducibleAnalysisDefinition } & Partial<ReproducibleAnalysisDefinition>;
      const analysis = body.analysis ?? (body.analysisId ? (body as ReproducibleAnalysisDefinition) : undefined);
      if (!analysis || !analysis.analysisId || !analysis.reproducibleHash) {
        return { ok: false, errorFa: 'پاسخ سرور فاقد شناسه تحلیل یا هش بازتولیدپذیر معتبر است.' };
      }
      this.clearCache();
      return { ok: true, analysis };
    } catch {
      return { ok: false, errorFa: 'خطای شبکه در ارسال تحلیل به فضای پژوهش سرور.' };
    }
  }

  public async requestAnalyticalDatasetExport(
    params: RequestExportPayload, headers?: Record<string, string>,
  ): Promise<AnalyticsExportResponse> {
    const localPolicy = defaultAnalyticsPlatformEngine.canExportDatasetSlice({
      sampleCount: params.sampleCount, uniqueEntityCount: params.uniqueEntityCount,
      distinctContributorsCount: params.distinctContributorsCount,
      datasetClassification: params.datasetClassification ?? 'PUBLIC',
      callerRole: params.callerRole ?? 'PUBLIC_USER',
    });
    if (!localPolicy.allowed) return { ok: false, status: 'DENIED', reasonFa: localPolicy.reasonFa };
    if (!this.fetchImpl) return { ok: false, status: 'FAILED', reasonFa: 'سرویس تولید خروجی سرور در دسترس نیست.' };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/v1/analytics/exports`, {
        method: 'POST', headers: this.getHeaders(headers), body: JSON.stringify(params),
      });
      if (res.status === 403 || res.status === 422) {
        const errBody = (await res.json().catch(() => ({}))) as { reasonFa?: string; error?: string };
        return { ok: false, status: 'DENIED', reasonFa: errBody.reasonFa || errBody.error || 'خروجی به دلیل محدودیت k-Anonymity یا مجوز دسترسی رد شد.' };
      }
      if (!res.ok) return { ok: false, status: 'FAILED', reasonFa: `خطای سرور در تولید فایل خروجی (کد ${res.status}).` };
      const body = (await res.json()) as Partial<AnalyticsExportResponse>;
      const exportId = body.exportId;
      const downloadUrl = body.downloadUrl || (exportId ? `/api/v1/analytics/exports/${encodeURIComponent(exportId)}/download` : undefined);
      if (!exportId || !downloadUrl) return { ok: false, status: 'FAILED', reasonFa: 'شناسه خروجی یا لینک دانلود معتبر از سرور دریافت نشد.' };
      return {
        ok: true, exportId, status: 'READY', downloadUrl,
        sampleCount: body.sampleCount ?? params.sampleCount,
        uniqueEntityCount: body.uniqueEntityCount ?? params.uniqueEntityCount,
        dataSnapshotId: body.dataSnapshotId ?? params.dataSnapshotId,
        createdAt: body.createdAt ?? new Date().toISOString(),
        reasonFa: `خروجی تجمیعی با شناسه ${exportId} در سرور تولید شد و آماده دانلود است.`,
      };
    } catch {
      return { ok: false, status: 'FAILED', reasonFa: 'خطا در ارتباط با سرور برای ایجاد خروجی تجمیعی.' };
    }
  }

  public async downloadAnalyticalExportContent(
    exportIdOrUrl: string, headers?: Record<string, string>,
  ): Promise<{ ok: boolean; content?: string; contentType?: string; errorFa?: string }> {
    if (!this.fetchImpl) return { ok: false, errorFa: 'امکان دانلود از سرور در دسترس نیست.' };
    const url = exportIdOrUrl.startsWith('/') || exportIdOrUrl.startsWith('http')
      ? `${this.baseUrl}${exportIdOrUrl.startsWith('/') ? exportIdOrUrl : ''}`
      : `${this.baseUrl}/api/v1/analytics/exports/${encodeURIComponent(exportIdOrUrl)}/download`;
    try {
      const res = await this.fetchImpl(url, { method: 'GET', headers: this.getHeaders(headers) });
      if (!res.ok) return { ok: false, errorFa: `خطا در دریافت فایل خروجی (کد ${res.status}).` };
      const content = await res.text();
      return { ok: true, content, contentType: res.headers.get('content-type') ?? 'application/json' };
    } catch {
      return { ok: false, errorFa: 'خطای شبکه هنگام دانلود فایل خروجی.' };
    }
  }

  public async triggerAdminPipelineRun(
    pipelineId: string, headers?: Record<string, string>,
  ): Promise<{ ok: boolean; pipeline?: DataPipelineRecord; messageFa: string }> {
    if (!this.fetchImpl) return { ok: false, messageFa: 'سرویس مدیریت Pipeline در دسترس نیست.' };
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/api/admin/analytics/pipelines/${encodeURIComponent(pipelineId)}/run`,
        { method: 'POST', headers: this.getHeaders(headers) },
      );
      if (!res.ok) return { ok: false, messageFa: `اجرای Pipeline توسط سرور رد شد (کد ${res.status}).` };
      const body = (await res.json()) as { pipeline?: DataPipelineRecord; messageFa?: string };
      return { ok: true, pipeline: body.pipeline, messageFa: body.messageFa ?? `اجرای Pipeline «${pipelineId}» در سرور ثبت شد.` };
    } catch {
      return { ok: false, messageFa: 'خطا در ارتباط با سرور برای اجرای Pipeline.' };
    }
  }
}

export const defaultAnalyticsApiClient = new AnalyticsBackendApiClient();

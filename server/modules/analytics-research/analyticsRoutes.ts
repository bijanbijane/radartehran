/** @file server/modules/analytics-research/analyticsRoutes.ts — Authoritative Analytics, Period Series, Exports, Pipelines & Research APIs */
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { serverPublishedBargains } from '../../../src/utils/serverPublisherBargains';
import {
  AnalyticsPlatformEngine,
  computeDistributionStats,
  computeSafePeriodComparison,
  OFFICIAL_METRIC_REGISTRY,
} from '../../../src/features/analytics/services/analyticsPlatformEngine';
import type { MetricSnapshotResponse } from '../../../src/features/analytics/models/analytics.types';
import {
  createSavedResearchAnalysis,
  getAnalyticsState,
  saveAnalyticsState,
} from './analyticsRepository';

const cleanEngine = new AnalyticsPlatformEngine({ seedDemo: false });

function buildRealSnapshotAndComparison(placeId: string): {
  snapshot: MetricSnapshotResponse;
  periodComparison: ReturnType<typeof computeSafePeriodComparison> | null;
} {
  const state = getAnalyticsState();
  const series = state.observedSeriesByPlace[placeId] || [];
  const latestPoint = series.length > 0 ? series[series.length - 1] : null;
  const previousPoint = series.length > 1 ? series[series.length - 2] : null;

  const matchingBargains = Array.from(serverPublishedBargains.values()).filter(
    (b) => b.lifecycleState === 'published' && b.sqm > 0 && b.priceMillions > 0 &&
      (b.hoodName.includes(placeId) || (placeId === 'saadat-abad' && b.hoodId === 3) || (placeId === 'punak' && b.hoodId === 5)),
  );
  const observedValues = latestPoint?.values && latestPoint.values.length > 0
    ? latestPoint.values
    : matchingBargains.map((b) => Number((b.priceMillions / b.sqm).toFixed(2)));

  const snapshot = cleanEngine.getMetricSnapshotForPlace(placeId, 0, observedValues);
  if (latestPoint) {
    snapshot.period = { from: latestPoint.periodFrom, to: latestPoint.periodTo, labelFa: latestPoint.periodLabelFa };
    snapshot.lastUpdatedAt = latestPoint.recordedAt;
    snapshot.geography.boundaryVersion = latestPoint.boundaryVersion;
    if (snapshot.distribution) snapshot.distribution.uniqueEntityCount = latestPoint.uniqueEntityCount;
  }

  let periodComparison: ReturnType<typeof computeSafePeriodComparison> | null = null;
  if (snapshot.value !== null && latestPoint && previousPoint && previousPoint.values.length > 0) {
    const prevDist = computeDistributionStats(previousPoint.values, previousPoint.uniqueEntityCount, true);
    periodComparison = computeSafePeriodComparison({
      currentPeriodLabelFa: latestPoint.periodLabelFa,
      previousPeriodLabelFa: previousPoint.periodLabelFa,
      currentValue: snapshot.value,
      previousValue: prevDist.median,
      currentSampleCount: snapshot.distribution?.count ?? observedValues.length,
      previousSampleCount: prevDist.count,
      currentBoundaryVersion: latestPoint.boundaryVersion,
      previousBoundaryVersion: previousPoint.boundaryVersion,
      compositionChangedSignificantly: Boolean(latestPoint.compositionChangedSignificantly),
    });
  } else {
    periodComparison = computeSafePeriodComparison({
      currentPeriodLabelFa: latestPoint?.periodLabelFa || 'دوره جاری',
      previousPeriodLabelFa: 'دوره قبل (ناموجود)',
      currentValue: snapshot.value ?? 0,
      previousValue: 0,
      currentSampleCount: observedValues.length,
      previousSampleCount: 0,
      currentBoundaryVersion: snapshot.geography.boundaryVersion,
      previousBoundaryVersion: snapshot.geography.boundaryVersion,
    });
  }
  return { snapshot, periodComparison };
}

export function registerAnalyticsResearchRoutes(
  app: Express,
  deps: { getIp: (req: Request) => string },
): void {
  app.get('/api/v1/analytics/metrics', (_req: Request, res: Response) => {
    res.status(200).json({ metrics: OFFICIAL_METRIC_REGISTRY });
  });

  app.get('/api/v1/analytics/metrics/:code', (req: Request, res: Response) => {
    const metric = OFFICIAL_METRIC_REGISTRY.find((m) => m.metricCode === req.params.code);
    if (!metric) { res.status(404).json({ errorFa: 'شاخص در Metric Registry یافت نشد.' }); return; }
    const placeId = typeof req.query.placeId === 'string' ? sanitizeInput(req.query.placeId, 64).trim() : '';
    const snapshot = placeId ? buildRealSnapshotAndComparison(placeId).snapshot : cleanEngine.getMetricSnapshotForPlace(null);
    res.status(200).json({ metric, snapshot });
  });

  app.get(['/api/v1/analytics/market', '/api/v1/analytics/neighborhoods/:id'], (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawPlace = req.params.id ?? req.query.placeId;
    const placeId = typeof rawPlace === 'string' ? sanitizeInput(rawPlace, 64).trim() : '';
    const state = getAnalyticsState();
    const { snapshot, periodComparison } = placeId
      ? buildRealSnapshotAndComparison(placeId)
      : { snapshot: cleanEngine.getMetricSnapshotForPlace(null), periodComparison: null };
    res.status(200).json({
      metricsRegistry: OFFICIAL_METRIC_REGISTRY,
      placeDimensionsScd2: state.placeDimensions,
      activeSnapshot: snapshot,
      periodComparison,
      pipelineDefinitions: state.pipelineDefinitions,
      recentRuns: state.pipelineRuns.slice(0, 20),
      modelRegistry: state.modelRegistry,
      quarantinedCount: state.quarantinedPayloads.length,
    });
  });

  const escapeCsvCell = (raw: unknown): string => {
    const str = String(raw ?? '');
    const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };
  const sanitizeExportFileName = (rawPlaceId: string | null, fmt: 'csv' | 'json'): string => {
    const slug = (rawPlaceId || 'market').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'market';
    return `radar-analytics-${slug}.${fmt}`;
  };

  app.post('/api/v1/analytics/exports', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    const adminAuth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    const placeId = typeof req.body?.placeId === 'string' ? sanitizeInput(req.body.placeId, 64).trim() : null;
    const format = req.body?.format === 'json' ? 'json' : 'csv';
    const rawClassification = req.body?.classification;
    const classification: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' =
      rawClassification === 'INTERNAL' || rawClassification === 'RESTRICTED' ? rawClassification : 'PUBLIC';
    const callerRole: 'PUBLIC_USER' | 'RESEARCHER' | 'ADMIN' = adminAuth.authorized
      ? 'ADMIN'
      : auth.authorized
        ? 'RESEARCHER'
        : 'PUBLIC_USER';
    const { snapshot, periodComparison } = placeId
      ? buildRealSnapshotAndComparison(placeId)
      : { snapshot: cleanEngine.getMetricSnapshotForPlace(null), periodComparison: null };
    const sampleCount = snapshot.distribution?.count ?? 0;
    const gate = cleanEngine.canExportDatasetSlice({
      sampleCount,
      uniqueEntityCount: snapshot.distribution?.uniqueEntityCount ?? 0,
      datasetClassification: classification,
      callerRole,
    });
    if (!gate.allowed) {
      res.status(classification !== 'PUBLIC' && callerRole === 'PUBLIC_USER' ? 403 : 422).json({
        ok: false, reasonFa: gate.reasonFa, limitationsFa: snapshot.limitationsFa,
      });
      return;
    }
    const exportId = `exp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const fileName = sanitizeExportFileName(placeId, format);
    const contentText = format === 'json'
      ? JSON.stringify({ exportId, placeId, exportedAtIso: new Date().toISOString(), snapshot, periodComparison }, null, 2)
      : [
          'placeId,placeNameFa,metricCode,medianMillionTomanPerSqm,sampleCount,uniqueEntities,boundaryVersion,qualityStatus,limitations',
          [
            escapeCsvCell(snapshot.geography.placeId),
            escapeCsvCell(snapshot.geography.placeNameFa),
            escapeCsvCell(snapshot.metricCode),
            escapeCsvCell(snapshot.value ?? ''),
            escapeCsvCell(sampleCount),
            escapeCsvCell(snapshot.distribution?.uniqueEntityCount ?? 0),
            escapeCsvCell(snapshot.geography.boundaryVersion),
            escapeCsvCell(snapshot.qualityStatus),
            escapeCsvCell(snapshot.limitationsFa.join(' | ')),
          ].join(','),
        ].join('\n');
    const state = getAnalyticsState();
    state.exportJobs.unshift({
      exportId, placeId, format, requestedByUid: auth.uid || 'public', callerRole, datasetClassification: classification,
      sampleCount, status: 'READY', fileName, mimeType: format === 'json' ? 'application/json' : 'text/csv; charset=utf-8',
      contentText, limitationsFa: snapshot.limitationsFa, createdAtIso: new Date().toISOString(),
    });
    if (state.exportJobs.length > 100) state.exportJobs.length = 100;
    saveAnalyticsState();
    res.status(201).json({
      ok: true, exportId, fileName, format,
      downloadUrl: `/api/v1/analytics/exports/${exportId}/download`,
      limitationsFa: snapshot.limitationsFa,
    });
  });

  app.get('/api/v1/analytics/exports/:exportId/download', async (req: Request, res: Response) => {
    try {
      const job = getAnalyticsState().exportJobs.find((j) => j.exportId === req.params.exportId);
      if (!job || job.status !== 'READY') {
        res.status(404).json({ ok: false, errorFa: 'فایل خروجی تحلیلی یافت نشد یا منقضی شده است.' });
        return;
      }
      if (job.datasetClassification !== 'PUBLIC') {
        const headers = req.headers as Record<string, string | string[] | undefined>;
        const adminAuth = await verifyAdminApiAuthorization(headers);
        if (job.datasetClassification === 'RESTRICTED') {
          if (!adminAuth.authorized) {
            recordAbuseSignal(deps.getIp(req), 'auth_failure');
            res.status(adminAuth.statusCode).json({ ok: false, errorFa: 'دانلود خروجی محدود فقط برای مدیر مجاز است.' });
            return;
          }
        } else {
          const userAuth = await verifyAuthenticatedUserHeader(headers);
          const isOwner = Boolean(userAuth.authorized && userAuth.uid && userAuth.uid === job.requestedByUid);
          if (!adminAuth.authorized && !isOwner) {
            recordAbuseSignal(deps.getIp(req), 'auth_failure');
            res.status(userAuth.authorized ? 403 : 401).json({ ok: false, errorFa: 'دسترسی به این فایل خروجی داخلی مجاز نیست.' });
            return;
          }
        }
      }
      const safeHeaderFileName = String(job.fileName || 'radar-analytics-export.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', job.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeHeaderFileName}"`);
      res.status(200).send(job.contentText);
    } catch {
      if (!res.headersSent) res.status(500).json({ ok: false, errorFa: 'خطا در دانلود فایل خروجی تحلیلی.' });
    }
  });

  app.get('/api/v1/research/workspace', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    const adminAuth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    const state = getAnalyticsState();
    const visibleAnalyses = state.savedAnalyses.filter((a) =>
      a.visibility === 'PUBLIC' || adminAuth.authorized || (auth.authorized && auth.uid && a.ownerId === auth.uid),
    );
    res.status(200).json({
      savedAnalyses: visibleAnalyses,
      modelRegistry: state.modelRegistry,
      metricsRegistry: OFFICIAL_METRIC_REGISTRY,
      placeDimensionsScd2: state.placeDimensions,
      authenticatedUid: auth.authorized ? auth.uid : null,
    });
  });

  app.post('/api/v1/research/workspace', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(401).json({ ok: false, errorFa: 'ثبت تحلیل در فضای پژوهش نیازمند ورود به حساب کاربری است.' });
      return;
    }
    const titleFa = sanitizeInput(String(req.body?.titleFa || ''), 120).trim();
    const questionFa = sanitizeInput(String(req.body?.researchQuestionFa || ''), 300).trim();
    const placeIds = Array.isArray(req.body?.placeIds) ? req.body.placeIds.map((p: unknown) => sanitizeInput(String(p), 64)).filter(Boolean) : [];
    const metricCodes = Array.isArray(req.body?.metricCodes) ? req.body.metricCodes.map((m: unknown) => sanitizeInput(String(m), 80)).filter(Boolean) : [];
    if (titleFa.length < 4 || questionFa.length < 6 || placeIds.length === 0 || metricCodes.length === 0) {
      res.status(400).json({ ok: false, errorFa: 'عنوان، پرسش پژوهش، محله و حداقل یک شاخص معتبر الزامی است.' });
      return;
    }
    const created = createSavedResearchAnalysis({
      titleFa, researchQuestionFa: questionFa, ownerId: auth.uid,
      visibility: req.body?.visibility === 'PUBLIC' || req.body?.visibility === 'TEAM' ? req.body.visibility : 'PRIVATE',
      placeIds, metricCodes,
      timeRange: { from: String(req.body?.timeFrom || ''), to: String(req.body?.timeTo || ''), labelFa: sanitizeInput(String(req.body?.timeLabelFa || 'دوره انتخابی'), 60) },
      outputSummaryFa: sanitizeInput(String(req.body?.outputSummaryFa || 'ثبت‌شده برای تکرارپذیری پژوهشی'), 400),
      boundaryVersion: sanitizeInput(String(req.body?.boundaryVersion || 'v2.0-1405'), 32),
      datasetVersions: Array.isArray(req.body?.datasetVersions) ? req.body.datasetVersions.map(String) : [],
    });
    res.status(201).json({ ok: true, analysis: created });
  });

  app.post('/api/admin/analytics/pipelines/:pipelineId/run', async (req: Request, res: Response) => {
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ ok: false, errorFa: 'اجرای پایپ‌لاین فقط برای مدیر مجاز است.' }); return; }
    const state = getAnalyticsState();
    const def = state.pipelineDefinitions.find((p) => p.id === req.params.pipelineId);
    if (!def) { res.status(404).json({ ok: false, errorFa: 'تعریف پایپ‌لاین یافت نشد.' }); return; }
    const nowIso = new Date().toISOString();
    const run = {
      runId: `run-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      pipelineId: def.id, pipelineCode: def.pipelineCode, status: 'SUCCEEDED' as const,
      triggeredBy: auth.email || auth.uid || 'admin',
      recordsProcessed: Object.values(state.observedSeriesByPlace).reduce((sum, arr) => sum + arr.length, 0),
      failedRecords: state.quarantinedPayloads.length,
      computeDurationMs: 42, startedAtIso: nowIso, finishedAtIso: nowIso,
    };
    state.pipelineRuns.unshift(run);
    saveAnalyticsState();
    res.status(201).json({ ok: true, run });
  });

  app.post('/api/admin/analytics/runs/:runId/cancel', async (req: Request, res: Response) => {
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ ok: false }); return; }
    const state = getAnalyticsState();
    const run = state.pipelineRuns.find((r) => r.runId === req.params.runId);
    if (!run) { res.status(404).json({ ok: false, errorFa: 'اجرای پایپ‌لاین یافت نشد.' }); return; }
    run.status = 'CANCELLED'; run.finishedAtIso = new Date().toISOString();
    saveAnalyticsState();
    res.status(200).json({ ok: true, run });
  });
}

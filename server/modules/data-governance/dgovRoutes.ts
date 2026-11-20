/** @file server/modules/data-governance/dgovRoutes.ts — Authoritative Server Data Governance & Provenance APIs */
import type { Express, Request, Response } from 'express';
import { getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { sanitizeInput } from '../../../src/utils/security';
import { resolveCityParamOrReject, validateCityNeighborhoodOwnership } from '../../../src/utils/geo/cityGeospatialResolver';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { serverPublishedBargains } from '../../../src/utils/serverPublisherBargains';
import { buildPublicProvenanceContract } from '../../../src/features/data-governance/services/claimsAndLineageService';
import { resolveProvenanceEntityId } from '../../../src/features/data-governance/services/placeIdentityMappers';
import type { DataSourceStatus } from '../../../src/features/data-governance/models/dataGovernance.types';
import { appendServerAdminAuditLog } from '../account-admin/accountAdminRepository';
import {
  getServerDgovEngine,
  persistServerDgovEngine,
  recordCorrectionProposalInDgov,
} from './dgovRepository';

const ALL_HOODS = getAllMultiCityNeighborhoods();

function resolveNeighborhoodNameByProvenanceId(id: string): { nameFa: string; numericId: number | null } {
  const numMatch = /^\d+$/.test(id) ? Number(id) : null;
  const provId = numMatch !== null ? resolveProvenanceEntityId(numMatch) || id : id;
  const knownMap: Record<string, { nameFa: string; numericId: number }> = {
    'saadat-abad': { nameFa: 'سعادت‌آباد', numericId: 3 },
    punak: { nameFa: 'پونک', numericId: 5 },
  };
  if (knownMap[provId]) return knownMap[provId];
  if (numMatch !== null) {
    const found = ALL_HOODS.find((h) => h.id === numMatch);
    if (found) return { nameFa: found.name, numericId: found.id };
  }
  return { nameFa: '', numericId: numMatch };
}

export function registerDataGovernanceRoutes(
  app: Express,
  deps: {
    getIp: (req: Request) => string;
    checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
  },
): void {
  const checkLimit = deps.checkRateLimit || (() => true);
  app.get('/api/v1/data-governance/sources', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ sources: getServerDgovEngine().getSources() });
  });

  app.post('/api/v1/data-governance/sources', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ ok: false, errorFa: 'ثبت منبع داده جدید فقط برای مدیر حاکمیت مجاز است.' });
      return;
    }
    const result = getServerDgovEngine().registerSource(req.body || {});
    if (result.ok && result.source) {
      persistServerDgovEngine();
      appendServerAdminAuditLog({
        actorRole: 'super_admin',
        actorLabelFa: auth.email || 'ادمین حاکمیت داده',
        actionCode: 'DGOV_SOURCE_REGISTERED',
        targetType: 'market_data',
        targetId: result.source.id,
        reasonFa: `ثبت منبع جدید: ${result.source.nameFa}`,
        severity: 'info',
      });
    }
    res.status(result.ok ? 201 : 400).json(result);
  });

  app.post('/api/v1/data-governance/sources/:id/transition', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ ok: false, errorFa: 'تغییر وضعیت منبع فقط برای مدیر مجاز است.' });
      return;
    }
    const nextStatus = String(req.body?.nextStatus || '') as DataSourceStatus;
    const reasonFa = sanitizeInput(String(req.body?.reasonFa || ''), 200);
    const out = getServerDgovEngine().transitionSourceStatus(
      String(req.params.id),
      nextStatus,
      auth.email || auth.uid || 'admin',
      reasonFa,
    );
    if (out.ok) persistServerDgovEngine();
    res.status(out.ok ? 200 : 400).json(out);
  });

  app.get('/api/v1/data-governance/claims', (_req: Request, res: Response) => {
    const eng = getServerDgovEngine();
    res.status(200).json({
      claims: eng.getClaims(),
      reconciliationCases: eng.getReconciliationCases(),
      auditLogs: eng.getAuditLogs().slice(0, 50),
    });
  });

  app.get('/api/v1/data-governance/evidence/:id', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const adminAuth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    const out = getServerDgovEngine().getEvidenceForCaller(String(req.params.id), { isAdmin: adminAuth.authorized });
    res.status(out.ok ? 200 : out.errorFa?.includes('یافت نشد') ? 404 : 403).json(out);
  });

  app.get('/api/v1/data-governance/lineage/:type/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) { res.status(400).json({ errorFa: 'شناسه موجودیت الزامی است.' }); return; }
    const details = getServerDgovEngine().getLineageDetailsForEntity(id);
    res.status(200).json({ entityId: id, edges: details.edges, details });
  });

  app.get('/api/v1/data-governance/versions/:type/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) { res.status(400).json({ errorFa: 'شناسه موجودیت الزامی است.' }); return; }
    res.status(200).json({ entityId: id, versions: getServerDgovEngine().getEntityVersions(id) });
  });

  app.get('/api/v1/data-governance/provenance/:id', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawId = sanitizeInput(String(req.params.id || ''), 80).trim();
    if (!rawId) { res.status(400).json({ errorFa: 'شناسه محله برای استعلام منشأ داده الزامی است.' }); return; }
    const resolved = resolveNeighborhoodNameByProvenanceId(rawId);
    const liveBargains = Array.from(serverPublishedBargains.values()).filter(
      (b) => b.lifecycleState === 'published' && (resolved.numericId !== null ? b.hoodId === resolved.numericId : false),
    );
    const contract = buildPublicProvenanceContract({
      entityId: /^\d+$/.test(rawId) ? resolveProvenanceEntityId(Number(rawId)) : rawId,
      neighborhoodNameFa: resolved.nameFa || rawId,
      sampleCount: liveBargains.length,
      uniqueEntityCount: liveBargains.length > 0 ? liveBargains.length : null,
      governanceEngine: getServerDgovEngine(),
    });
    res.status(200).json(contract);
  });

  app.get('/api/v1/data-corrections', (_req: Request, res: Response) => {
    res.status(200).json({ proposals: getServerDgovEngine().getCorrectionProposals() });
  });

  app.post('/api/v1/data-governance/corrections', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = deps.getIp(req);
    if (!checkLimit(ip, 'lead', 20, 60_000)) {
      res.status(429).json({ ok: false, errorFa: 'تعداد درخواست‌های اصلاح داده بیش از حد مجاز است.' });
      return;
    }
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    const entityId = sanitizeInput(String(req.body?.entityId || ''), 80).trim();
    const attribute = sanitizeInput(String(req.body?.attribute || 'market_median_asking_price_per_sqm'), 64);
    const reasonFa = sanitizeInput(String(req.body?.reasonFa || ''), 400).trim();
    const proposedValue = sanitizeInput(String(req.body?.proposedValue ?? ''), 160).trim();
    if (!entityId || !proposedValue || reasonFa.length < 6) {
      res.status(400).json({ ok: false, errorFa: 'شناسه محله، مقدار پیشنهادی و دلیل مستند (حداقل ۶ کاراکتر) الزامی است.' });
      return;
    }
    const cityRes = resolveCityParamOrReject(req.body?.cityId, { allowOmittedDefault: 'tehran' });
    if (!cityRes.ok) {
      res.status(400).json({ ok: false, code: cityRes.code, errorFa: cityRes.messageFa });
      return;
    }
    if (/^\d+$/.test(entityId)) {
      const ownership = validateCityNeighborhoodOwnership(cityRes.cityId, Number(entityId), resolveCityIdForNeighborhood);
      if (ownership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
        res.status(400).json({ ok: false, code: ownership.code, errorFa: ownership.messageFa });
        return;
      }
    }
    const isVerified = Boolean(auth.authorized && auth.uid);
    const recorded = recordCorrectionProposalInDgov({
      entityId,
      attribute,
      currentValue: sanitizeInput(String(req.body?.currentValue ?? ''), 160),
      proposedValue,
      reasonFa,
      proposerUserId: isVerified && auth.uid ? auth.uid : 'public_unverified',
      proposerVerifiedIdentity: isVerified,
    });
    res.status(201).json({ ok: true, proposal: recorded.proposal, trackingCode: recorded.trackingCode });
  });

  app.post('/api/v1/data-governance/reconciliation/resolve', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      recordAbuseSignal(deps.getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ ok: false, errorFa: 'حل تعارض داده نیازمند احراز هویت مدیر حاکمیت است.' });
      return;
    }
    const body = req.body || {};
    const reviewerId = sanitizeInput(String(body.reviewerId || auth.uid || auth.email || ''), 80);
    const out = getServerDgovEngine().resolveConflictCase({
      caseId: String(body.caseId || ''),
      reviewerId,
      resolutionValue: body.resolutionValue,
      resolutionReasonFa: String(body.resolutionReasonFa || ''),
      evidenceSourceId: typeof body.evidenceSourceId === 'string' ? body.evidenceSourceId : undefined,
      methodologyVersion: typeof body.methodologyVersion === 'string' ? body.methodologyVersion : undefined,
      isAutomatedAttempt: Boolean(body.isAutomatedAttempt),
    });
    if (out.ok) {
      persistServerDgovEngine();
      appendServerAdminAuditLog({
        actorRole: 'super_admin',
        actorLabelFa: auth.email || reviewerId,
        actionCode: 'DGOV_RECONCILIATION_RESOLVED',
        targetType: 'market_data',
        targetId: String(body.caseId || ''),
        reasonFa: String(body.resolutionReasonFa || ''),
        severity: 'warning',
      });
    }
    res.status(out.ok ? 200 : 400).json(out);
  });
}

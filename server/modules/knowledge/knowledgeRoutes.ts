/** @file server/modules/knowledge/knowledgeRoutes.ts — Express API Routes for Knowledge Center Governance, Provenance, Corrections & Bookmarks (Stages 81–88) */
import type { Express, Request, Response } from 'express';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import type {
  GlossaryTermCategory,
  KnowledgeCorrectionStatus,
  KnowledgeEditorialRole,
  KnowledgePublicationStatus,
} from '../../../src/features/knowledge/types/knowledge.types';
import {
  deleteUserValuationReport,
  getServerPublicationBySlugOrId,
  getServerPublicationSources,
  getUserSavedKnowledgeBookmarks,
  getUserValuationReportById,
  getUserValuationReports,
  knowledgeServerStore,
  publishNewServerKnowledgeVersion,
  queryServerKnowledgeGlossary,
  queryServerKnowledgePublications,
  removeUserKnowledgeBookmark,
  saveUserKnowledgeBookmark,
  saveUserValuationReport,
  submitServerKnowledgeCorrection,
  transitionServerKnowledgeCorrectionStatus,
  transitionServerPublicationStatus,
} from './knowledgeStore';

export interface KnowledgeRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredKnowledgeApps = new WeakSet<Express>();

/**
 * Editorial roles are derived from verified admin class, never from request JSON.
 * Static shared-secret auth has no human editorial identity and is denied here.
 */
export function resolveKnowledgeEditorialRole(auth: { reason?: string }): KnowledgeEditorialRole | null {
  if (auth.reason === 'AUTHORIZED_BOOTSTRAP_ADMIN') return 'release_manager';
  if (auth.reason === 'AUTHORIZED_DELEGATED_ADMIN') return 'editorial_editor';
  return null;
}


export function registerKnowledgeRoutes(app: Express, options?: KnowledgeRoutesOptions): void {
  if (registeredKnowledgeApps.has(app)) return;
  registeredKnowledgeApps.add(app);

  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);

  app.get('/api/knowledge/publications', (req: Request, res: Response) => {
    if (!allowRate(getIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const result = queryServerKnowledgePublications({
      subTab: typeof req.query.subTab === 'string' ? req.query.subTab : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      contentType: typeof req.query.contentType === 'string' ? req.query.contentType : undefined,
      freshness: typeof req.query.freshness === 'string' ? req.query.freshness : undefined,
      geographyId: typeof req.query.geographyId === 'string' ? req.query.geographyId : undefined,
      neighborhoodId: req.query.neighborhoodId ? Number(req.query.neighborhoodId) : undefined,
      periodFrom: typeof req.query.periodFrom === 'string' ? req.query.periodFrom : undefined,
      periodTo: typeof req.query.periodTo === 'string' ? req.query.periodTo : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 10,
      sortBy:
        req.query.sortBy === 'title_asc' || req.query.sortBy === 'published_desc'
          ? req.query.sortBy
          : 'updated_desc',
    });
    res.status(200).json({ status: 'ok', ...result });
  });

  app.get('/api/knowledge/publications/:slugOrId', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
    const pub = getServerPublicationBySlugOrId(req.params.slugOrId, { versionId });
    if (!pub) {
      res.status(404).json({ status: 'error', code: 'PUBLICATION_NOT_FOUND_OR_NOT_PUBLIC' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      item: pub,
      sources: getServerPublicationSources(pub.id) ?? [],
      serverUpdatedAtIso: knowledgeServerStore.updatedAtIso,
    });
  });

  app.get('/api/knowledge/publications/:id/versions', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const pub = getServerPublicationBySlugOrId(req.params.id);
    if (!pub) {
      res.status(404).json({ status: 'error', code: 'PUBLICATION_NOT_FOUND' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      publicationId: pub.id,
      currentVersion: pub.version,
      versions: pub.versionHistory ?? [],
    });
  });

  app.get('/api/knowledge/publications/:id/sources', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const pub = getServerPublicationBySlugOrId(req.params.id);
    if (!pub) {
      res.status(404).json({ status: 'error', code: 'PUBLICATION_NOT_FOUND' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      publicationId: pub.id,
      sources: getServerPublicationSources(pub.id) ?? [],
    });
  });

  app.get('/api/knowledge/publications/:id/status', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const adminAuth = req.headers.authorization
      ? await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>)
      : { authorized: false };
    const pub = getServerPublicationBySlugOrId(req.params.id, { includeNonPublic: Boolean(adminAuth.authorized) });
    if (!pub) {
      res.status(404).json({ status: 'error', code: 'PUBLICATION_NOT_FOUND' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      publicationId: pub.id,
      publicationStatus: pub.status ?? pub.defaultPublicationStatus,
      version: pub.version,
      updatedAtIso: pub.updatedAtIso || knowledgeServerStore.updatedAtIso,
    });
  });

  app.post('/api/knowledge/publications/:id/corrections', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason, message: 'برای ثبت رسمی اصلاحیه ابتدا وارد حساب کاربری شوید.' });
      return;
    }
    const result = submitServerKnowledgeCorrection({
      publicationId: req.params.id,
      submitterUserId: auth.uid,
      input: req.body || {},
    });
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'INVALID_CORRECTION', message: result.errorFa });
      return;
    }
    res.status(201).json({ status: 'ok', item: result.item });
  });

  app.get('/api/knowledge/data-briefs', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', items: knowledgeServerStore.dataBriefs });
  });

  app.get('/api/knowledge/glossary', (req: Request, res: Response) => {
    const q = typeof req.query.query === 'string' ? req.query.query : '';
    const cat = (typeof req.query.category === 'string' ? req.query.category : 'all') as GlossaryTermCategory | 'all';
    res.status(200).json({ status: 'ok', items: queryServerKnowledgeGlossary(q, cat) });
  });

  app.get('/api/account/knowledge/saved', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const items = getUserSavedKnowledgeBookmarks(auth.uid);
    res.status(200).json({ status: 'ok', items, savedIds: items.map((i) => i.publicationId) });
  });

  app.post('/api/account/knowledge/saved', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const publicationId = String(req.body?.publicationId || '');
    const result = saveUserKnowledgeBookmark(auth.uid, publicationId);
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'BOOKMARK_FAILED', message: result.errorFa });
      return;
    }
    res.status(result.status).json({
      status: 'ok',
      items: result.items ?? [],
      savedIds: (result.items ?? []).map((i) => i.publicationId),
    });
  });

  app.delete('/api/account/knowledge/saved/:publicationId', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const items = removeUserKnowledgeBookmark(auth.uid, req.params.publicationId);
    res.status(200).json({ status: 'ok', items, savedIds: items.map((i) => i.publicationId) });
  });

  app.get('/api/account/valuations', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    res.status(200).json({ status: 'ok', items: getUserValuationReports(auth.uid) });
  });

  app.post('/api/account/valuations', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const result = saveUserValuationReport(auth.uid, req.body || {});
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'VALUATION_SAVE_FAILED', message: result.errorFa });
      return;
    }
    res.status(201).json({ status: 'ok', item: result.item });
  });

  app.get('/api/account/valuations/:id', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const result = getUserValuationReportById(auth.uid, req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'VALUATION_ACCESS_DENIED_OR_MISSING', message: result.errorFa });
      return;
    }
    res.status(200).json({ status: 'ok', item: result.item });
  });

  app.delete('/api/account/valuations/:id', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const result = deleteUserValuationReport(auth.uid, req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'VALUATION_DELETE_FAILED', message: result.errorFa });
      return;
    }
    res.status(200).json({ status: 'ok', items: result.items ?? [] });
  });

  app.get('/api/admin/knowledge/publications', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const statuses: Record<string, KnowledgePublicationStatus> = {};
    for (const p of knowledgeServerStore.publications) {
      statuses[p.id] = p.status ?? p.defaultPublicationStatus;
    }
    res.status(200).json({
      status: 'ok',
      items: knowledgeServerStore.publications,
      statuses,
      corrections: knowledgeServerStore.corrections,
    });
  });

  app.post('/api/admin/knowledge/publications/:id/transition', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const actorRole = resolveKnowledgeEditorialRole(auth);
    if (!actorRole) {
      res.status(403).json({ status: 'error', code: 'HUMAN_EDITORIAL_ADMIN_REQUIRED' });
      return;
    }
    const toStatus = req.body?.toStatus as KnowledgePublicationStatus;
    const actorUserId = auth.uid || auth.actorUid || auth.email || 'admin-release-manager';
    const reasonFa = String(req.body?.reasonFa || '');

    const result = transitionServerPublicationStatus({
      publicationId: req.params.id,
      toStatus,
      actorUserId,
      actorRole,
      reasonFa,
    });
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'EDITORIAL_TRANSITION_REJECTED', message: result.errorFa });
      return;
    }
    const statuses: Record<string, KnowledgePublicationStatus> = {};
    for (const p of knowledgeServerStore.publications) {
      statuses[p.id] = p.status ?? p.defaultPublicationStatus;
    }
    res.status(200).json({
      status: 'ok',
      publication: result.publication,
      decision: result.decision,
      statuses,
    });
  });

  app.post('/api/admin/knowledge/publications/:id/versions', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const actorRole = resolveKnowledgeEditorialRole(auth);
    if (actorRole !== 'release_manager') {
      res.status(403).json({ status: 'error', code: 'RELEASE_MANAGER_REQUIRED' });
      return;
    }
    const result = publishNewServerKnowledgeVersion({
      publicationId: req.params.id,
      version: String(req.body?.version || ''),
      changelogFa: String(req.body?.changelogFa || ''),
      titleFa: req.body?.titleFa ? String(req.body.titleFa) : undefined,
      summaryFa: req.body?.summaryFa ? String(req.body.summaryFa) : undefined,
      actorUserId: auth.uid || auth.actorUid || auth.email || 'admin-release-manager',
      actorRole,
    });
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'VERSION_PUBLISH_FAILED', message: result.errorFa });
      return;
    }
    res.status(201).json({ status: 'ok', publication: result.publication });
  });

  app.post('/api/admin/knowledge/corrections/:id/status', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return;
    }
    const result = transitionServerKnowledgeCorrectionStatus({
      correctionId: req.params.id,
      nextStatus: req.body?.nextStatus as KnowledgeCorrectionStatus,
      actorUserId: auth.email || auth.uid || 'admin-reviewer',
      noteFa: String(req.body?.noteFa || ''),
      appliedInVersion: req.body?.appliedInVersion ? String(req.body.appliedInVersion) : undefined,
    });
    if (!result.ok) {
      res.status(result.status).json({ status: 'error', code: 'CORRECTION_STATUS_FAILED', message: result.errorFa });
      return;
    }
    res.status(200).json({ status: 'ok', item: result.item });
  });
}

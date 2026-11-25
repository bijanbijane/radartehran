/**
 * RT-INFRA-011 — Express `/api/media/*` integration (single mount, domain service delegation).
 */
import type { Express, Request, Response } from 'express';
import express from 'express';
import {
  verifyAdminApiAuthorization,
  verifyFirebaseUserAuthorization,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  createMediaModuleFacade,
  type MediaModuleFacade,
  toPublicMediaDescriptor,
} from './index';
import { MediaDomainError } from './types';
import {
  resolveMediaMetadataBackendId,
  verifyMediaDurableMetadataRepository,
} from './durableMediaMetadataRepository';

/** Fix import path — use serverDeliveryAndAbuseGuard */
import { getClientIp as getIp, recordAbuseSignal as recordAbuse } from '../../../src/utils/serverDeliveryAndAbuseGuard';

export interface MediaRoutesOptions {
  facade?: MediaModuleFacade;
  getClientIp?: (req: Request) => string;
  checkRateLimit?: (ip: string, bucket: 'upload' | 'general', max: number, windowMs: number) => boolean;
}

const registeredMediaApps = new WeakSet<Express>();

function handleMediaDomainError(res: Response, err: unknown): void {
  if (err instanceof MediaDomainError) {
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    });
    return;
  }
  res.status(500).json({ status: 'error', code: 'MEDIA_INTERNAL_ERROR', message: 'Media operation failed.' });
}

export function registerMediaModuleRoutes(app: Express, options?: MediaRoutesOptions): void {
  if (registeredMediaApps.has(app)) return;
  registeredMediaApps.add(app);

  const facade = options?.facade ?? createMediaModuleFacade();
  const resolveIp = options?.getClientIp ?? getIp;
  const allowRate = options?.checkRateLimit ?? (() => true);

  const authorizeJson = express.json({ limit: '32kb', strict: true });
  const registerRaw = express.raw({ type: () => true, limit: '55mb' });

  const requireVerifiedUser = async (req: Request, res: Response, next: () => void): Promise<void> => {
    try {
      const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuse(resolveIp(req), 'auth_failure');
        res.setHeader('Cache-Control', 'no-store');
        res.status(auth.statusCode).json({
          status: 'error',
          code: auth.reason,
          message: auth.statusCode === 503 ? 'سرویس احراز هویت موقتاً در دسترس نیست.' : 'ورود تأییدشده الزامی است.',
        });
        return;
      }
      res.locals.firebaseUid = auth.actorUid || auth.uid;
      res.locals.firebaseIsAdmin = false;
      next();
    } catch {
      res.status(503).json({ status: 'error', code: 'MEDIA_AUTH_UNAVAILABLE', message: 'احراز هویت در دسترس نیست.' });
    }
  };

  const requireAdmin = async (req: Request, res: Response, next: () => void): Promise<void> => {
    const auth = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
      process.env,
      { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true },
    );
    if (!auth.authorized) {
      if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuse(resolveIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason, message: 'دسترسی مدیر الزامی است.' });
      return;
    }
    res.locals.firebaseUid = auth.uid;
    res.locals.firebaseIsAdmin = true;
    next();
  };

  app.get('/api/media/health', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const durable = await verifyMediaDurableMetadataRepository(process.env);
    res.status(durable.ok ? 200 : 503).json({
      status: durable.ok ? 'ok' : 'degraded',
      routesMounted: true,
      durableBackend: resolveMediaMetadataBackendId(process.env),
      repository: durable,
    });
  });

  app.post('/api/media/uploads/authorize', requireVerifiedUser, authorizeJson, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
  const ip = resolveIp(req);
    if (!allowRate(ip, 'upload', 12, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMITED', message: 'تعداد درخواست بیش از حد مجاز است.' });
      return;
    }
    try {
      const uid = res.locals.firebaseUid as string;
      const grant = await facade.mediaService.authorizeUpload(
        { uid, isAdmin: Boolean(res.locals.firebaseIsAdmin) },
        req.body,
      );
      res.status(200).json({ status: 'ok', grant });
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });

  app.post(
    '/api/media/uploads/:grantId/register',
    requireVerifiedUser,
    registerRaw,
    async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const ip = resolveIp(req);
      if (!allowRate(ip, 'upload', 8, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMITED', message: 'تعداد درخواست بیش از حد مجاز است.' });
        return;
      }
      try {
        const uid = res.locals.firebaseUid as string;
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const result = await facade.mediaService.registerUploadedObject(
          { uid, isAdmin: Boolean(res.locals.firebaseIsAdmin) },
          String(req.params.grantId || ''),
          body,
        );
        res.status(200).json({ status: 'ok', ...result });
      } catch (err) {
        handleMediaDomainError(res, err);
      }
    },
  );

  app.get('/api/media/objects/:objectId/descriptor', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    try {
      const descriptor = await facade.mediaService.getPublicMetadata(String(req.params.objectId || ''));
      if (!descriptor) {
        res.status(404).json({ status: 'error', code: 'OBJECT_NOT_FOUND', message: 'Media object not found.' });
        return;
      }
      res.status(200).json({ status: 'ok', descriptor });
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });

  app.get('/api/media/objects/:objectId', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const authHeader = req.headers.authorization;
      let actor = null as { uid: string; isAdmin: boolean } | null;
      if (authHeader) {
        const auth = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>);
        if (auth.authorized && auth.uid) actor = { uid: auth.uid, isAdmin: false };
      }
      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
      const { descriptor, payload } = await facade.mediaService.retrieveAuthorizedMediaBytes(
        actor,
        String(req.params.objectId || ''),
        rangeHeader,
      );
      res.setHeader('Content-Type', payload.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Media-Object-Id', descriptor.objectId);
      if (payload.rangeStart !== undefined && payload.rangeEnd !== undefined && payload.totalSizeBytes !== undefined) {
        res.status(206);
        res.setHeader(
          'Content-Range',
          `bytes ${payload.rangeStart}-${payload.rangeEnd}/${payload.totalSizeBytes}`,
        );
      } else {
        res.status(200);
      }
      res.send(payload.bytes);
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });

  app.get('/api/media/owner/objects', requireVerifiedUser, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const uid = res.locals.firebaseUid as string;
      const records = await facade.metadataStore.listOwnerMetadataRecords(uid);
      res.status(200).json({
        status: 'ok',
        objects: records.filter((r) => r.state !== 'DELETED').map((m) => toPublicMediaDescriptor(m)),
      });
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });

  app.delete('/api/media/objects/:objectId', requireVerifiedUser, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const uid = res.locals.firebaseUid as string;
      const outcome = await facade.mediaService.deleteMediaObject(
        { uid, isAdmin: Boolean(res.locals.firebaseIsAdmin) },
        String(req.params.objectId || ''),
      );
      res.status(200).json({ status: 'ok', ...outcome });
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });

  app.get('/api/media/admin/metadata/page', requireAdmin, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      const page = await facade.metadataStore.listMetadataPage({ cursor, limit });
      res.status(200).json({ status: 'ok', ...page });
    } catch (err) {
      handleMediaDomainError(res, err);
    }
  });
}
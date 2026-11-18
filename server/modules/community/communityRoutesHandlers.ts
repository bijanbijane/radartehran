/** @file server/modules/community/communityRoutesHandlers.ts — Express Async Handler Wrappers & Fail-Closed Error Mapping (Stage 3) */
import type { Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
} from './communityFirestoreAdapter';
import type { CommunityUnifiedRepository } from './communityUnifiedRepository';
import {
  listCommunityTopicsFromStore,
  queryCommunityMembersPaginated,
  queryCommunityOverview,
  queryCommunityPostsPaginated,
  queryModerationQueueFromStore,
} from './communityUnifiedQueries';

export function handleCommunityRouteError(res: Response, err: unknown): void {
  if (err instanceof CommunityDatabaseUnavailableError) {
    res.status(503).json({ status: 'error', code: err.code, messageFa: err.message });
    return;
  }
  if (err instanceof CommunityHttpError) {
    if (err.statusCode === 429 && typeof err.details?.retryAfterSec === 'number') {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(err.details.retryAfterSec))));
    }
    res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.messageFa, messageFa: err.messageFa, ...(err.details ?? {}) });
    return;
  }
  res.status(500).json({ status: 'error', code: 'COMMUNITY_INTERNAL_ERROR', messageFa: 'خطای داخلی سرویس انجمن.' });
}

export async function requireVerifiedMember(
  req: Request,
  res: Response,
  getIp: (r: Request) => string,
  authenticateMemberFn: typeof verifyAuthenticatedUserHeader = verifyAuthenticatedUserHeader,
) {
  const auth = await authenticateMemberFn(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.authorized || !auth.uid) {
    recordAbuseSignal(getIp(req), 'auth_failure');
    res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
    return null;
  }
  return auth as { authorized: true; uid: string; email?: string };
}

export async function requireCommunityAdmin(req: Request, res: Response, getIp: (r: Request) => string) {
  const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.authorized) {
    recordAbuseSignal(getIp(req), 'auth_failure');
    res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
    return null;
  }
  return auth;
}

export async function resolveOptionalViewer(
  req: Request,
  authenticateMemberFn: typeof verifyAuthenticatedUserHeader = verifyAuthenticatedUserHeader,
) {
  if (!req.headers.authorization) return null;
  const auth = await authenticateMemberFn(req.headers as Record<string, string | string[] | undefined>);
  return auth.authorized && auth.uid ? auth : null;
}

export function extractIdempotencyKeyHeader(req: Request): string | undefined {
  const rawHeader = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  const headerVal = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const bodyVal = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined;
  const chosen = headerVal || bodyVal;
  return chosen ? sanitizeInput(String(chosen), 80) : undefined;
}

export function createCommunityReadHandlers(
  repo: CommunityUnifiedRepository,
  getIp: (r: Request) => string,
  allowRate: (ip: string, bucket: 'general', max: number, win: number) => boolean,
  authenticateMemberFn: typeof verifyAuthenticatedUserHeader = verifyAuthenticatedUserHeader,
) {
  return {
    overview: async (req: Request, res: Response) => {
      try {
        if (!allowRate(getIp(req), 'general', 120, 60_000)) { res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' }); return; }
        await repo.ensureSeedsBootstrappedIfEmpty();
        const data = await queryCommunityOverview(repo.getStore());
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.status(200).json({ status: 'ok', ...data });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    topics: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const viewer = await resolveOptionalViewer(req, authenticateMemberFn);
        const topics = await listCommunityTopicsFromStore(repo.getStore(), viewer?.uid);
        res.status(200).json({ status: 'ok', topics });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    discussions: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const page = await queryCommunityPostsPaginated(repo.getStore(), {
          recordKind: 'discussion',
          neighborhoodId: req.query.neighborhoodId ? Number(req.query.neighborhoodId) : null,
          topicId: typeof req.query.topicId === 'string' ? req.query.topicId.trim() : '',
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '',
          entityId: typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '',
          includeSeeds: req.query.includeSeeds !== 'false',
          sort: req.query.sort === 'recent' ? 'recent' : req.query.sort === 'helpful' ? 'helpful' : 'rank',
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
        });
        res.status(200).json({ status: 'ok', ...page });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    discussionById: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const post = await repo.getStore().getDoc(SOCIAL_COLLECTIONS.posts, String(req.params.id));
        if (!post || post.isDeleted === true || post.status === 'hidden') {
          res.status(404).json({ status: 'error', code: 'DISCUSSION_NOT_FOUND' }); return;
        }
        res.status(200).json({ status: 'ok', item: post });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    questions: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const page = await queryCommunityPostsPaginated(repo.getStore(), {
          recordKind: 'question',
          neighborhoodId: req.query.neighborhoodId ? Number(req.query.neighborhoodId) : null,
          topicId: typeof req.query.topicId === 'string' ? req.query.topicId.trim() : '',
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '',
          entityId: typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '',
          statusFilter: typeof req.query.status === 'string' ? req.query.status.trim() : '',
          includeSeeds: req.query.includeSeeds !== 'false',
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
        });
        res.status(200).json({ status: 'ok', ...page });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    contributions: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const page = await queryCommunityPostsPaginated(repo.getStore(), {
          recordKind: 'correction',
          neighborhoodId: req.query.neighborhoodId ? Number(req.query.neighborhoodId) : null,
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '',
          entityId: typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '',
          includeSeeds: req.query.includeSeeds !== 'false',
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
          excludeHidden: false,
        });
        res.status(200).json({ status: 'ok', ...page });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    researchProposals: async (req: Request, res: Response) => {
      try {
        await repo.ensureSeedsBootstrappedIfEmpty();
        const page = await queryCommunityPostsPaginated(repo.getStore(), {
          recordKind: 'research_proposal',
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '',
          entityId: typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '',
          includeSeeds: req.query.includeSeeds !== 'false',
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
        });
        res.status(200).json({ status: 'ok', ...page });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    members: async (req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        await repo.ensureSeedsBootstrappedIfEmpty();
        const viewer = await resolveOptionalViewer(req, authenticateMemberFn);
        const result = await queryCommunityMembersPaginated(repo.getStore(), {
          q: typeof req.query.q === 'string' ? req.query.q : '',
          includeSeeds: req.query.includeSeeds !== 'false',
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
          isViewerMember: Boolean(viewer),
          viewerUid: viewer?.uid,
        });
        res.status(200).json({ status: 'ok', ...result });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    memberByUsername: async (req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        await repo.ensureSeedsBootstrappedIfEmpty();
        const viewer = await resolveOptionalViewer(req, authenticateMemberFn);
        await repo.enforceRateLimit('read', viewer?.uid || `ip:${getIp(req)}`);
        const profile = await repo.getPublicProfileByUsername(String(req.params.username || ''), Boolean(viewer), viewer?.uid);
        if (!profile) { res.status(404).json({ status: 'error', code: 'PROFILE_NOT_PUBLIC_OR_FOUND' }); return; }
        res.status(200).json({ status: 'ok', profile });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    memberContributionsByUsername: async (req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        await repo.ensureSeedsBootstrappedIfEmpty();
        const viewer = await resolveOptionalViewer(req, authenticateMemberFn);
        await repo.enforceRateLimit('read', viewer?.uid || `ip:${getIp(req)}`);
        const page = await repo.getProfileContributions(String(req.params.username || ''), {
          limit: req.query.limit,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
          kind: req.query.kind,
          isViewerMember: Boolean(viewer),
          viewerUid: viewer?.uid,
        });
        res.status(200).json({ status: 'ok', ...page });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    accountSummary: async (req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const auth = await requireVerifiedMember(req, res, getIp, authenticateMemberFn);
        if (!auth) return;
        const myProfile = await repo.getOrCreateProfile({ uid: auth.uid, emailVerified: true });
        const [corrPage, queue] = await Promise.all([
          queryCommunityPostsPaginated(repo.getStore(), { recordKind: 'correction', limit: 50, excludeHidden: false }),
          queryModerationQueueFromStore(repo.getStore()),
        ]);
        res.status(200).json({
          status: 'ok',
          myProfile,
          myContributions: corrPage.items.filter((c) => c.ownerUserId === auth.uid),
          myReportsCount: queue.reports.filter((r) => r.reporterUserId === auth.uid).length,
          myAppeals: queue.appeals.filter((a) => a.appellantUserId === auth.uid),
        });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
    adminModerationQueue: async (req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const auth = await requireCommunityAdmin(req, res, getIp);
        if (!auth) return;
        const queue = await queryModerationQueueFromStore(repo.getStore());
        res.status(200).json({ status: 'ok', ...queue });
      } catch (err) { handleCommunityRouteError(res, err); }
    },
  };
}
